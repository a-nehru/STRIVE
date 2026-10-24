"""STRIVE Pong relay: two browsers, one game of Pong, over the network.

    py -3.12 tools\\pong_relay.py            # listens on 0.0.0.0:8327

The game cannot talk browser to browser, so this is the go-between, in the
standard library only, like the other bridges. A room is a four-letter code.
The first to join is the HOST: their browser runs the physics and sends the
whole game state about thirty times a second. The second is the GUEST: their
browser sends where their paddle is (a fraction of the lane) and draws the
host's state. Each side reads the other through a Server-Sent-Events stream.

On one network (a ward, a lab) the relay runs on either machine and both
open the site with that machine's address; across the internet it has to
run somewhere both can reach (a VM, or this machine with its port opened),
and the relay address is entered on the Pong online screen.

  POST /join    {room, role?, name}  -> {ok, role}
  GET  /room?room=CODE               -> {peers, names: {host, guest}}
  POST /send    {room, role, data}   -> {ok}     the newest message wins
  GET  /stream?room=CODE&role=host|guest          SSE of the OTHER side's messages
  POST /leave   {room, role}
  POST /sig     {room, role, msg}    -> {ok}     a signalling message for the OTHER side (queued, none lost)
  GET  /sig?room=CODE&role=host|guest -> {msgs}  and the queue is emptied   (online.html's WebRTC codes)
  GET  /status
Rooms are forgotten after ROOM_IDLE_S without a message.
"""
import argparse
import json
import random
import string
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOM_IDLE_S = 180
ROOMS = {}
LOCK = threading.Lock()


def room(code, make=False):
    code = (code or "").upper()[:8]
    with LOCK:
        r = ROOMS.get(code)
        if r is None and make and code:
            r = ROOMS[code] = {"code": code, "names": {}, "seen": {}, "seq": {"host": 0, "guest": 0},
                               "data": {"host": None, "guest": None}, "sig": {"host": [], "guest": []},
                               "cond": threading.Condition(), "at": time.time()}
        return r


def sweep():
    while True:
        time.sleep(30)
        now = time.time()
        with LOCK:
            for code in [c for c, r in ROOMS.items() if now - r["at"] > ROOM_IDLE_S]:
                del ROOMS[code]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    def do_POST(self):
        u = urlparse(self.path)
        b = self._body()
        if u.path == "/join":
            code = (b.get("room") or "").upper()
            if not code:
                return self._json({"ok": False, "error": "no room code"}, 400)
            r = room(code, make=True)
            with r["cond"]:
                want = b.get("role")
                now = time.time()
                free = [x for x in ("host", "guest") if now - r["seen"].get(x, 0) > 10]
                if want in ("host", "guest"):
                    if want not in free:
                        return self._json({"ok": False, "error": f"{want} is taken in room {code}"}, 409)
                    role = want
                elif free:
                    role = "host" if "host" in free else "guest"
                else:
                    return self._json({"ok": False, "error": f"room {code} is full"}, 409)
                r["names"][role] = (b.get("name") or role)[:24]
                r["seen"][role] = now
                r["at"] = now
            return self._json({"ok": True, "role": role, "room": code})
        if u.path == "/send":
            r = room(b.get("room"))
            role = b.get("role")
            if r is None or role not in ("host", "guest"):
                return self._json({"ok": False, "error": "no such room"}, 404)
            with r["cond"]:
                r["data"][role] = b.get("data")
                r["seq"][role] += 1
                r["seen"][role] = r["at"] = time.time()
                r["cond"].notify_all()
            return self._json({"ok": True})
        if u.path == "/sig":
            r = room(b.get("room"))
            role = b.get("role")
            if r is None or role not in ("host", "guest"):
                return self._json({"ok": False, "error": "no such room"}, 404)
            other = "guest" if role == "host" else "host"
            with r["cond"]:
                r["sig"][other].append(b.get("msg"))
                r["seen"][role] = r["at"] = time.time()
            return self._json({"ok": True})
        if u.path == "/leave":
            r = room(b.get("room"))
            if r is not None:
                with r["cond"]:
                    r["seen"][b.get("role")] = 0
                    r["names"].pop(b.get("role"), None)
                    r["cond"].notify_all()
            return self._json({"ok": True})
        self._json({"error": "not found"}, 404)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/status":
            with LOCK:
                out = {c: {"names": r["names"], "peers": sum(1 for x in ("host", "guest") if time.time() - r["seen"].get(x, 0) < 10)}
                       for c, r in ROOMS.items()}
            return self._json({"ok": True, "rooms": out})
        if u.path == "/room":
            r = room(q.get("room", [""])[0])
            if r is None:
                return self._json({"ok": True, "peers": 0, "names": {}})
            now = time.time()
            present = {x: now - r["seen"].get(x, 0) < 10 for x in ("host", "guest")}
            return self._json({"ok": True, "peers": sum(present.values()), "present": present,
                               "names": {x: r["names"].get(x) for x in ("host", "guest") if present[x]}})
        if u.path == "/sig":
            r = room(q.get("room", [""])[0])
            role = q.get("role", [""])[0]
            if r is None or role not in ("host", "guest"):
                return self._json({"ok": False, "msgs": []})
            with r["cond"]:
                msgs, r["sig"][role] = r["sig"][role], []
                r["seen"][role] = time.time()
            return self._json({"ok": True, "msgs": msgs})
        if u.path == "/stream":
            r = room(q.get("room", [""])[0])
            role = q.get("role", [""])[0]
            other = "guest" if role == "host" else "host"
            if r is None:
                return self._json({"error": "no such room"}, 404)
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            seen = 0
            try:
                while True:
                    with r["cond"]:
                        r["seen"][role] = time.time()
                        r["cond"].wait_for(lambda: r["seq"][other] > seen, timeout=1.0)
                        if r["seq"][other] > seen:
                            seen = r["seq"][other]
                            data = r["data"][other]
                        else:
                            data = None
                    if data is None:
                        self.wfile.write(b": heartbeat\n\n")
                    else:
                        self.wfile.write(b"data: " + json.dumps(data).encode() + b"\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionError, OSError):
                pass
            return
        self._json({"error": "not found"}, 404)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8327)
    ap.add_argument("--bind", default="0.0.0.0")
    args = ap.parse_args()
    threading.Thread(target=sweep, daemon=True).start()
    srv = Server((args.bind, args.port), Handler)
    code = "".join(random.choice(string.ascii_uppercase) for _ in range(4))
    print(f"Pong relay up on {args.bind}:{args.port}  (a room code to try: {code})")
    print("Both players open the site, Pong online, enter this machine's address and the same code.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

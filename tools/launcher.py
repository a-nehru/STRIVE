"""STRIVE launcher: one command starts everything and keeps the data safe.

    py -3.12 tools\\launcher.py            (start_strive.bat does this)

It serves the site on 8321 itself, starts whichever local services this
machine can run (the ZED bridge when a ZED is plugged in and pyzed imports,
the voice bridge when tools/.venv-tts exists, the coach relay when its key
is configured, the mail relay when its config exists), each with its log
under tools/logs/, opens the browser on the login screen, and answers
    GET  /__strive/health         every service's state, for the staff drawer
    POST /__strive/backup         {store: "<the rehabsuite-v1 string>"} -> a dated
                                  file under tools/backups/ (kept: BACKUP_KEEP newest;
                                  an unchanged store is not written twice)
    GET  /__strive/backups        the list, newest first
    GET  /__strive/backup?file=   one backup's content, for a restore
Patient data lives only in the browser's localStorage, so the game posts
its store here at login, after every round and every ten minutes (js/backup.js);
a cleared browser or a dead PC is then a restore away, not a loss.
Ctrl+C stops the services it started.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
LOGS = os.path.join(TOOLS, "logs")
BACKUPS = os.path.join(TOOLS, "backups")
BACKUP_KEEP = 60
SERVICES = {
    "bridge": {"port": 8322, "name": "ZED bridge"},
    "mail": {"port": 8323, "name": "mail relay"},
    "coach": {"port": 8324, "name": "coach relay"},
    "tts": {"port": 8325, "name": "voice bridge"},
}
CHILDREN = {}


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def probe(port, timeout=1.5):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/status", timeout=timeout) as r:
            return json.loads(r.read().decode("utf8", "ignore"))
    except Exception:
        return None


_zed_cache = [None, 0.0]


def zed_present(max_age=30):
    # the device list is slow and the drawer polls health: ask at most every 30 s
    if _zed_cache[0] is not None and time.time() - _zed_cache[1] < max_age:
        return _zed_cache[0]
    _zed_cache[:] = [_zed_present(), time.time()]
    return _zed_cache[0]


def _zed_present():
    try:
        import pyzed.sl as sl
        return len(sl.Camera.get_device_list()) > 0
    except Exception:
        return False


def spawn(key, cmd, cwd=ROOT):
    os.makedirs(LOGS, exist_ok=True)
    out = open(os.path.join(LOGS, f"{key}.log"), "a", encoding="utf8")
    out.write(f"\n=== {datetime.now().isoformat()} {' '.join(cmd)}\n"); out.flush()
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    p = subprocess.Popen(cmd, cwd=cwd, stdout=out, stderr=subprocess.STDOUT, creationflags=flags)
    CHILDREN[key] = p
    log(f"started the {SERVICES[key]['name']} (pid {p.pid}, log tools/logs/{key}.log)")


def start_services(args):
    py = sys.executable
    if not args.no_bridge:
        if probe(8322):
            log("the ZED bridge is already running")
        elif zed_present():
            spawn("bridge", [py, os.path.join(TOOLS, "zed_bridge.py")])
        else:
            log("no ZED plugged in (or no pyzed): the game will use the webcam")
    tts_py = os.path.join(TOOLS, ".venv-tts", "Scripts", "python.exe")
    if not args.no_tts and os.path.exists(tts_py) and not probe(8325):
        spawn("tts", [tts_py, os.path.join(TOOLS, "tts_bridge.py")])
    if not args.no_coach and (os.path.exists(os.path.join(TOOLS, "coach_config.json")) or os.environ.get("ANTHROPIC_API_KEY")) and not probe(8324):
        spawn("coach", [py, os.path.join(TOOLS, "coach_bridge.py")])
    if not args.no_mail and os.path.exists(os.path.join(TOOLS, "mail_config.json")) and not probe(8323):
        spawn("mail", [py, os.path.join(TOOLS, "mail_bridge.py")])


def health():
    out = {"ok": True, "site": True, "zed_present": zed_present(), "services": {}, "at": datetime.now().isoformat(timespec="seconds")}
    with ThreadPoolExecutor(len(SERVICES)) as pool:       # a closed port can take most of the timeout on Windows
        states = dict(zip(SERVICES, pool.map(lambda s: probe(s["port"], 0.8), SERVICES.values())))
    for key, s in SERVICES.items():
        st = states[key]
        child = CHILDREN.get(key)
        out["services"][key] = {"name": s["name"], "port": s["port"], "up": bool(st),
                                "started_here": child is not None and child.poll() is None, "info": st if isinstance(st, dict) else None}
    files = list_backups()
    out["backups"] = {"count": len(files), "last": files[0]["at"] if files else None}
    return out


def list_backups():
    if not os.path.isdir(BACKUPS):
        return []
    out = []
    for f in sorted(os.listdir(BACKUPS), reverse=True):
        if f.startswith("strive-") and f.endswith(".json"):
            p = os.path.join(BACKUPS, f)
            out.append({"file": f, "bytes": os.path.getsize(p), "at": datetime.fromtimestamp(os.path.getmtime(p)).isoformat(timespec="seconds")})
    return out


def write_backup(store, who=None):
    os.makedirs(BACKUPS, exist_ok=True)
    digest = hashlib.sha256(store.encode("utf8")).hexdigest()[:16]
    files = list_backups()
    if files:
        with open(os.path.join(BACKUPS, files[0]["file"]), "rb") as f:
            if hashlib.sha256(f.read()).hexdigest()[:16] == digest:
                return {"ok": True, "file": files[0]["file"], "unchanged": True, "count": len(files)}
    name = f"strive-{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.json"
    with open(os.path.join(BACKUPS, name), "w", encoding="utf8", newline="") as f:   # byte-exact, so the dedupe hash matches
        f.write(store)
    files = list_backups()
    for old in files[BACKUP_KEEP:]:
        try:
            os.remove(os.path.join(BACKUPS, old["file"]))
        except OSError:
            pass
    log(f"backup written: {name} ({len(store)} bytes{', by ' + who if who else ''})")
    return {"ok": True, "file": name, "unchanged": False, "count": min(len(files), BACKUP_KEEP)}


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")      # a ward PC must never show a stale build
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/__strive/health":
            return self._json(health())
        if u.path == "/__strive/backups":
            return self._json({"ok": True, "backups": list_backups()})
        if u.path == "/__strive/backup":
            name = parse_qs(u.query).get("file", [""])[0]
            if not name or "/" in name or "\\" in name or not name.startswith("strive-"):
                return self._json({"ok": False, "error": "bad file"}, 400)
            p = os.path.join(BACKUPS, name)
            if not os.path.exists(p):
                return self._json({"ok": False, "error": "no such backup"}, 404)
            body = open(p, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if u.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        if u.path == "/__strive/backup":
            try:
                b = json.loads(raw or b"{}")
                store = b.get("store")
                if not isinstance(store, str) or len(store) < 2:
                    return self._json({"ok": False, "error": "no store"}, 400)
                json.loads(store)                       # it must at least be JSON
                return self._json(write_backup(store, b.get("who")))
            except ValueError as e:
                return self._json({"ok": False, "error": f"not JSON: {e}"}, 400)
        return self._json({"error": "not found"}, 404)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8321)
    ap.add_argument("--host", default="127.0.0.1", help="the backups are patient data: this machine only unless asked")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--no-bridge", action="store_true")
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--no-coach", action="store_true")
    ap.add_argument("--no-mail", action="store_true")
    ap.add_argument("--path", default="/", help="what to open in the browser (e.g. /?go=select)")
    args = ap.parse_args()
    os.makedirs(BACKUPS, exist_ok=True)
    threading.Thread(target=zed_present, daemon=True).start()   # warm the cache: importing pyzed takes seconds
    srv = Server((args.host, args.port), partial(Handler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    log(f"site up: http://localhost:{args.port}/  (backups in tools/backups, {len(list_backups())} on disk)")
    start_services(args)
    if not args.no_browser:
        webbrowser.open(f"http://localhost:{args.port}{args.path}")
    try:
        while True:
            time.sleep(2)
            for key, p in list(CHILDREN.items()):
                if p.poll() is not None:
                    log(f"the {SERVICES[key]['name']} stopped (exit {p.returncode}); see tools/logs/{key}.log")
                    del CHILDREN[key]
    except KeyboardInterrupt:
        pass
    finally:
        for key, p in CHILDREN.items():
            try:
                p.terminate()
            except Exception:
                pass
        log("stopped")


if __name__ == "__main__":
    main()

"""
STRIVE mail bridge: lets the game send a therapist an email.

The game is a static web page. A browser cannot speak SMTP, and the two
alternatives both fail this project: a third-party email API would need its
key embedded in a public page and would route patient data through somebody
else's server, and a mailto: link only opens a mail client and waits for a
human. So mail goes the same way body tracking does - through a small local
service that the clinic machine runs beside the game:

    GET  /status  -> {"ok": true, "to": "...", "from": "..."}
    POST /send    -> {"subject": "...", "body": "...", "kind": "test|help|progress"}
                     -> {"ok": true}

The credential never reaches the browser. It lives in tools/mail_config.json
(gitignored) or in the environment, and this process is the only thing that
reads it. The game degrades to a mailto: link when the bridge is not running,
so nothing in the UI ever dead-ends.

Setup (Gmail):
  1. Turn on 2-step verification on the sending account.
  2. Create an app password (Google Account -> Security -> App passwords).
  3. Copy tools/mail_config.example.json to tools/mail_config.json and fill in
     user / app password / the therapist's address.
  4. python tools/mail_bridge.py

Nothing here decides WHAT is sent - the game builds the subject and body, and
a progress email only leaves when a human presses the button. Keep it that
way: an automatic mail of patient data on every login is a consent question,
not a feature.

Requires: stdlib only. Keys: Ctrl+C to quit.
"""

import argparse
import json
import os
import smtplib
import ssl
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("mail_config.json")
MAX_BODY = 256 * 1024          # a progress summary is a few KB; this is slack
KINDS = {"test", "help", "progress"}

CONF = {}


def load_config(path):
    """File first, environment second - so a shared machine can use env vars."""
    conf = {}
    if path.exists():
        try:
            conf = json.loads(path.read_text())
        except (OSError, ValueError) as e:
            raise SystemExit(f"could not read {path}: {e}")
    for key, env in (("host", "STRIVE_SMTP_HOST"), ("port", "STRIVE_SMTP_PORT"),
                     ("user", "STRIVE_SMTP_USER"), ("password", "STRIVE_SMTP_PASS"),
                     ("to", "STRIVE_MAIL_TO"), ("from", "STRIVE_MAIL_FROM")):
        if os.environ.get(env):
            conf[key] = os.environ[env]
    conf.setdefault("host", "smtp.gmail.com")
    conf.setdefault("port", 587)
    conf.setdefault("from", conf.get("user", ""))
    missing = [k for k in ("user", "password", "to") if not conf.get(k)]
    if missing:
        raise SystemExit(
            f"missing {', '.join(missing)} - copy tools/mail_config.example.json "
            f"to {path.name} and fill it in (see the header of this file)")
    conf["port"] = int(conf["port"])
    return conf


def send_mail(subject, body, to=None):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = CONF["from"]
    msg["To"] = to or CONF["to"]
    msg.set_content(body)
    with smtplib.SMTP(CONF["host"], CONF["port"], timeout=20) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(CONF["user"], CONF["password"])
        s.send_message(msg)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._reply(200, {"ok": True})

    def do_GET(self):
        if self.path.startswith("/status"):
            # the address is shown in the staff drawer so nobody has to guess
            # where a report went; the credential is never exposed
            self._reply(200, {"ok": True, "to": CONF["to"], "from": CONF["from"]})
        else:
            self._reply(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/send"):
            self._reply(404, {"ok": False, "error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if not 0 < n <= MAX_BODY:
            self._reply(400, {"ok": False, "error": "bad length"})
            return
        try:
            req = json.loads(self.rfile.read(n))
        except ValueError:
            self._reply(400, {"ok": False, "error": "bad json"})
            return

        kind = req.get("kind", "help")
        subject = (req.get("subject") or "").strip()
        body = req.get("body") or ""
        if kind not in KINDS or not subject or not body:
            self._reply(400, {"ok": False, "error": "kind, subject and body are required"})
            return
        # header injection guard: a subject is one line, whatever was typed
        subject = subject.replace("\r", " ").replace("\n", " ")[:200]
        try:
            send_mail(f"[STRIVE] {subject}", body)
        except Exception as e:                      # noqa: BLE001 - report it verbatim
            print(f"  send failed: {e}")
            self._reply(502, {"ok": False, "error": str(e)})
            return
        print(f"  sent: {kind} - {subject}")
        self._reply(200, {"ok": True})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8323)
    ap.add_argument("--config", type=Path, default=CONFIG_PATH)
    ap.add_argument("--test", action="store_true",
                    help="send one test email and exit (checks setup without "
                         "opening the game)")
    args = ap.parse_args()

    global CONF
    CONF = load_config(args.config)

    if args.test:
        send_mail("[STRIVE] Mail bridge test",
                  "The STRIVE mail bridge is configured correctly.\n"
                  "This message was sent by tools/mail_bridge.py --test.\n")
        print(f"test email sent to {CONF['to']}")
        return

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"\nSTRIVE mail bridge up: http://localhost:{args.port}/status")
    print(f"  sending as {CONF['from']} -> {CONF['to']}")
    print("Open the game; Staff -> Therapist contact will use it. Ctrl+C quits.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

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
a progress email only leaves when a human presses the button. Since Sep 2026
(by request) a short login notice also goes out automatically, and the
patient-facing Help button sends a help request.

Requires: stdlib only. Keys: Ctrl+C to quit.
"""

import argparse
import json
import os
import smtplib
import ssl
import email
import email.utils
import imaplib
import re
import threading
import time
from datetime import date, datetime
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("mail_config.json")
MAX_BODY = 4 * 1024 * 1024     # a snapshot carries the JSON export too (a few hundred KB at most)
KINDS = {"test", "help", "progress", "login"}   # login: the notice sent when a participant logs in (Sep 2026)

CONF = {}

# Session REMINDERS (Sep 2026, by request). The game is a page and only runs
# while it is open, so a "time for your therapy" email has to come from this
# process, which runs beside it all day. The game posts each participant's
# email and preferred time here; this thread sends the reminder at that time,
# once a day, and remembers the day it sent so a restart never doubles it.
REMINDERS_PATH = Path(__file__).with_name("reminders.json")   # gitignored: it holds email addresses
REM_LOCK = threading.Lock()

# UPDATE-BY-EMAIL (Sep 2026, by request). A therapist on the allowed list
# (config "askers") emails the STRIVE account with the subject
# "STRIVE update <participant>" (or just "STRIVE update" for a list), and the
# relay replies with that participant's progress report and the JSON export.
# The data comes from SNAPSHOTS the game pushes here (POST /snapshot) at
# login, after every round and after an assessment - the records themselves
# live in the browser, which is not running when the email arrives. Anyone
# not on the list is ignored and logged, never answered.
SNAP_DIR = Path(__file__).with_name("snapshots")               # gitignored: patient data
SNAP_LOCK = threading.Lock()
ASK_RE = re.compile(r"strive\s+update\s*(.*)", re.I)


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", (name or "").strip())[:40] or "_"


def save_snapshot(req):
    name = (req.get("name") or "").strip()[:40]
    if not name:
        return False, "name required"
    rec = {"name": name, "at": datetime.now().isoformat(timespec="seconds"),
           "report": str(req.get("report") or ""), "export": str(req.get("export") or "")}
    with SNAP_LOCK:
        SNAP_DIR.mkdir(exist_ok=True)
        (SNAP_DIR / f"{safe_name(name)}.json").write_text(json.dumps(rec), encoding="utf-8")
    return True, None


def load_snapshots():
    out = {}
    with SNAP_LOCK:
        if SNAP_DIR.exists():
            for f in SNAP_DIR.glob("*.json"):
                try:
                    r = json.loads(f.read_text(encoding="utf-8"))
                    out[r["name"]] = r
                except (OSError, ValueError, KeyError):
                    pass
    return out


def send_update(to, asked):
    snaps = load_snapshots()
    if not asked:
        lines = [f"Participants on file ({len(snaps)}):", ""]
        for n, r in sorted(snaps.items()):
            lines.append(f"  {n:<20} last seen {r['at']}")
        lines += ["", 'Reply with the subject "STRIVE update <name>" for one participant\'s full report.']
        send_mail("[STRIVE] Update: participants on file", "\n".join(lines) + "\n", to=to)
        return "list"
    match = next((r for n, r in snaps.items() if n.lower() == asked.lower()), None)
    if not match:
        names = ", ".join(sorted(snaps)) or "(none yet)"
        send_mail(f"[STRIVE] Update: no participant called {asked}",
                  f"No snapshot on file for \"{asked}\".\nOn file: {names}\n", to=to)
        return "unknown"
    msg = EmailMessage()
    msg["Subject"] = f"[STRIVE] Update for {match['name']}"
    msg["From"] = CONF["from"]
    msg["To"] = to
    msg.set_content(f"Snapshot taken {match['at']} (the last time {match['name']} used STRIVE).\n\n"
                    + match["report"] + "\n")
    if match.get("export"):
        msg.add_attachment(match["export"].encode("utf-8"), maintype="application", subtype="json",
                           filename=f"strive_{safe_name(match['name'])}.json")
    with smtplib.SMTP(CONF["host"], CONF["port"], timeout=20) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(CONF["user"], CONF["password"])
        s.send_message(msg)
    return "sent"


def inbox_loop():
    askers = {a.strip().lower() for a in CONF.get("askers", []) if a.strip()}
    if not askers:
        print("  update-by-email off: no \"askers\" in the config")
        return
    while True:
        try:
            with imaplib.IMAP4_SSL(CONF.get("imap_host", "imap.gmail.com"), 993) as im:
                im.login(CONF["user"], CONF["password"])
                im.select("INBOX")
                ok, data = im.search(None, "UNSEEN", "SUBJECT", "STRIVE")
                ids = data[0].split() if ok == "OK" and data and data[0] else []
                for i in ids:
                    ok, raw = im.fetch(i, "(RFC822)")
                    if ok != "OK":
                        continue
                    m = email.message_from_bytes(raw[0][1])
                    subject = str(email.header.make_header(email.header.decode_header(m.get("Subject") or "")))
                    sender = (email.utils.parseaddr(m.get("From") or "")[1] or "").lower()
                    im.store(i, "+FLAGS", "\\Seen")           # answered or not, never look at it twice
                    ask = ASK_RE.search(subject.replace("Re:", "").replace("RE:", "").strip())
                    if not ask:
                        continue
                    if sender not in askers:
                        print(f"  update request from {sender} ignored (not an allowed asker)")
                        continue
                    what = send_update(sender, ask.group(1).strip())
                    print(f"  update request from {sender}: {subject!r} -> {what}")
        except Exception as e:                          # noqa: BLE001
            print(f"  inbox check: {e}")
        time.sleep(60)


def load_reminders():
    try:
        return json.loads(REMINDERS_PATH.read_text()) if REMINDERS_PATH.exists() else {}
    except (OSError, ValueError):
        return {}


def save_reminders(rem):
    REMINDERS_PATH.write_text(json.dumps(rem, indent=2))


def set_reminder(req):
    name = (req.get("name") or "").strip()[:40]
    email = (req.get("email") or "").strip()[:120]
    when = (req.get("time") or "").strip()[:5]
    days = req.get("days") or "off"
    arm = (req.get("arm") or "").strip()[:8]
    if not name:
        return False, "name required"
    with REM_LOCK:
        rem = load_reminders()
        if days == "off" or not email or "@" not in email or len(when) != 5:
            rem.pop(name, None)
        else:
            old = rem.get(name, {})
            rem[name] = {"email": email, "time": when, "days": days, "arm": arm,
                         "lastSent": old.get("lastSent")}
        save_reminders(rem)
    return True, None


def reminder_body(name, rec):
    return (f"Hello {name},\n\n"
            f"It's time for your STRIVE session. Your training arm is the {rec.get('arm') or 'chosen'} one.\n"
            "Sit facing the camera, open STRIVE on the therapy computer, and press Start when you're settled.\n\n"
            "Every session counts. See you there!\n\n"
            "STRIVE - your therapy, in play\n"
            f"(You get this because a reminder is set for {rec.get('time')} "
            f"{'every day' if rec.get('days') == 'daily' else 'on weekdays'}. "
            "Ask your therapist to change or stop it.)\n")


def reminder_loop():
    while True:
        try:
            now = datetime.now()
            today = date.today().isoformat()
            hhmm = now.strftime("%H:%M")
            with REM_LOCK:
                rem = load_reminders()
                due = [(n, r) for n, r in rem.items()
                       if r.get("time") == hhmm and r.get("lastSent") != today
                       and (r.get("days") == "daily" or now.weekday() < 5)]
            for name, rec in due:
                try:
                    send_mail("[STRIVE] Time for your therapy session", reminder_body(name, rec), to=rec["email"])
                    print(f"  reminder sent: {name} -> {rec['email']} at {hhmm}")
                    with REM_LOCK:
                        rem = load_reminders()
                        if name in rem:
                            rem[name]["lastSent"] = today
                            save_reminders(rem)
                except Exception as e:                  # noqa: BLE001
                    print(f"  reminder to {name} failed: {e}")
        except Exception as e:                          # noqa: BLE001
            print(f"  reminder loop: {e}")
        time.sleep(20)


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
            self._reply(200, {"ok": True, "to": CONF["to"], "from": CONF["from"],
                              "reminders": len(load_reminders())})
        elif self.path.startswith("/snapshots"):
            self._reply(200, {"ok": True, "snapshots": {n: r["at"] for n, r in load_snapshots().items()}})
        elif self.path.startswith("/reminders"):
            with REM_LOCK:
                rem = load_reminders()
            self._reply(200, {"ok": True, "reminders": rem})
        else:
            self._reply(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not (self.path.startswith("/send") or self.path.startswith("/reminder") or self.path.startswith("/snapshot")):
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
        if self.path.startswith("/reminder"):
            ok, err = set_reminder(req)
            self._reply(200 if ok else 400, {"ok": ok, "error": err})
            return
        if self.path.startswith("/snapshot"):
            ok, err = save_snapshot(req)
            self._reply(200 if ok else 400, {"ok": ok, "error": err})
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

    threading.Thread(target=reminder_loop, daemon=True).start()
    threading.Thread(target=inbox_loop, daemon=True).start()
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

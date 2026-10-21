"""
STRIVE coach bridge: Claude writes the coach's between-rep lines.

The game speaks through one of three coaches (Rook, Lumi, Maple). Their
everyday lines come from a phrasebook in the page (js/coachlines.js) and
need nothing but the browser. This relay is the optional step up: when it
is running, the lines between reps and sets are written by Claude from the
measured numbers, in the chosen coach's voice, following the system prompt
in tools/coach_system_prompt.txt (the text of assets/music/
coach-feedback-system-prompt.md between its two --- lines).

    GET  /status -> {"ok": true, "model": "...", "tts": "browser"}
    POST /line   -> one JSON event, exactly the prompt's shape:
                    {"coach": "lumi", "event": "rep_result", "feedback_type": "...",
                     "game": "...", "data": {...numbers...}, "recent_lines": [...],
                     "language_level": "simple"}
                 <- {"ok": true, "say": "...", "mood": "praise"}

It goes the way the mail bridge goes, and for the same reason: the API key
lives in gitignored tools/coach_config.json (copy coach_config.example.json)
or in ANTHROPIC_API_KEY, read by this process and never by the page. What
the page sends is de-identified movement numbers: never a name, a face or a
picture. Confirm the hospital's requirements (a business associate agreement,
for one) before using this with patients.

A line is checked before it goes back (the prompt doc's rules): at most
twenty words and no digits, else the coach's approved fallback line. A call
that takes longer than --timeout (2.5 s) also falls back, so a slow network
never holds a rep. The browser speaks the line for now; Chatterbox Turbo on
the Jetson (one reference clip per coach) is the intended voice later, which
is what `tts` in /status is for.

Requires: the `anthropic` package (pip install anthropic). Ctrl+C quits.
"""

import argparse
import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import anthropic
except ImportError:                                   # a clear message, not a traceback
    anthropic = None

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "coach_config.json"
PROMPT_PATH = HERE / "coach_system_prompt.txt"
MAX_BODY = 64 * 1024
# the model id lives here and nowhere else (the prompt doc: a fast, low-cost
# model is enough for one-line coaching)
DEFAULT_MODEL = "claude-haiku-5-5"
COACHES = ("rook", "lumi", "maple")
EVENTS = {"session_start", "rep_result", "personal_best", "compensation", "miss", "set_summary",
          "fatigue_detected", "rest_over", "progress", "session_end", "pain_reported", "distress"}
MOODS = {"praise", "cue", "encourage", "rest", "neutral"}
# approved lines when Claude is slow, offline or off the rules
FALLBACK = {"rook": "Nice flying, co-pilot.", "lumi": "Well done. Take your time.", "maple": "Good work. Keep going."}

CONF = {}
CLIENT = None
SYSTEM = ""


def load_config(path):
    conf = {}
    if path.exists():
        conf = json.loads(path.read_text(encoding="utf-8"))
    key = os.environ.get("ANTHROPIC_API_KEY") or conf.get("api_key") or ""
    return {
        "api_key": key,
        "model": os.environ.get("STRIVE_COACH_MODEL") or conf.get("model") or DEFAULT_MODEL,
        "timeout": float(conf.get("timeout", 2.5)),
    }


def load_prompt(path):
    if not path.exists():
        sys.exit(f"no system prompt at {path}: extract it from assets/music/coach-feedback-system-prompt.md "
                 "(the text between the two --- lines)")
    return path.read_text(encoding="utf-8").strip()


def checked(line, coach):
    """The prompt doc's checks: short, no digits, plain. Else the fallback."""
    line = (line or "").strip().strip('"').strip()
    if not line or len(line.split()) > 20 or re.search(r"\d", line):
        return FALLBACK.get(coach, FALLBACK["lumi"]), False
    return line, True


def write_line(event):
    """One line from Claude for one event. Returns (say, mood, ok)."""
    coach = event.get("coach") if event.get("coach") in COACHES else "lumi"
    if CLIENT is None:
        return FALLBACK[coach], "neutral", False
    try:
        msg = CLIENT.with_options(timeout=CONF["timeout"], max_retries=0).messages.create(
            model=CONF["model"], max_tokens=120, system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(event)}])
        if msg.stop_reason == "refusal":
            return FALLBACK[coach], "neutral", False
        text = "".join(b.text for b in msg.content if b.type == "text").strip()
        # the reply is one JSON object; tolerate a stray sentence around it
        m = re.search(r"\{.*\}", text, re.S)
        obj = json.loads(m.group(0) if m else text)
        say, ok = checked(obj.get("say"), coach)
        mood = obj.get("mood") if obj.get("mood") in MOODS else "neutral"
        return say, mood, ok
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
        print(f"  claude unavailable ({type(e).__name__}); fallback line")
    except anthropic.APIStatusError as e:
        print(f"  claude error {e.status_code}: {e.message}; fallback line")
    except (ValueError, AttributeError) as e:
        print(f"  bad reply ({e}); fallback line")
    return FALLBACK[coach], "neutral", False


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
            self._reply(200, {"ok": CLIENT is not None, "model": CONF.get("model"), "tts": "browser",
                              "coaches": list(COACHES)})
        else:
            self._reply(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/line"):
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
            event = json.loads(self.rfile.read(n))
        except ValueError:
            self._reply(400, {"ok": False, "error": "bad json"})
            return
        if not isinstance(event, dict) or event.get("event") not in EVENTS:
            self._reply(400, {"ok": False, "error": "unknown event"})
            return
        # the page sends numbers; anything else is dropped here as well
        data = event.get("data") or {}
        event["data"] = {k: v for k, v in data.items()
                         if isinstance(v, (int, float, bool)) or (isinstance(v, str) and len(v) <= 16)}
        event["recent_lines"] = [str(x)[:120] for x in (event.get("recent_lines") or [])][:6]
        event["language_level"] = "simple"
        t0 = time.perf_counter()
        say, mood, ok = write_line(event)
        ms = int((time.perf_counter() - t0) * 1000)
        print(f"  {event.get('coach', 'lumi'):5} {event['event']:16} {ms:5} ms  {'claude' if ok else 'fallback'}: {say}")
        self._reply(200, {"ok": True, "say": say, "mood": mood, "claude": ok, "ms": ms})


def main():
    global CONF, CLIENT, SYSTEM
    ap = argparse.ArgumentParser(description="STRIVE coach bridge: Claude-written coach lines on localhost")
    ap.add_argument("--port", type=int, default=8324)
    ap.add_argument("--config", type=Path, default=CONFIG_PATH)
    ap.add_argument("--prompt", type=Path, default=PROMPT_PATH)
    ap.add_argument("--model", default=None, help=f"model id (default {DEFAULT_MODEL}, or the config's)")
    ap.add_argument("--timeout", type=float, default=None, help="seconds a line may take (default 2.5)")
    ap.add_argument("--test", action="store_true", help="write one sample line and exit")
    args = ap.parse_args()

    CONF = load_config(args.config)
    if args.model:
        CONF["model"] = args.model
    if args.timeout:
        CONF["timeout"] = args.timeout
    SYSTEM = load_prompt(args.prompt)
    if anthropic is None:
        sys.exit("the anthropic package is missing: pip install anthropic")
    if not CONF["api_key"]:
        print("no API key: set ANTHROPIC_API_KEY or copy tools/coach_config.example.json to "
              "tools/coach_config.json; every line will be a fallback line")
        CLIENT = None
    else:
        CLIENT = anthropic.Anthropic(api_key=CONF["api_key"])

    if args.test:
        sample = {"coach": "lumi", "event": "rep_result", "feedback_type": "performance", "game": "lantern_reach",
                  "data": {"rep": 4, "reach_cm": 31, "best_today_cm": 31, "last_week_best_cm": 25, "trunk_lean_deg": 4},
                  "recent_lines": ["Lovely. That light reached further.", "Take your time."], "language_level": "simple"}
        for coach in COACHES:
            sample["coach"] = coach
            t0 = time.perf_counter()
            say, mood, ok = write_line(sample)
            print(f"{coach:5} ({mood}, {'claude' if ok else 'fallback'}, {int((time.perf_counter() - t0) * 1000)} ms): {say}")
        return

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"\nSTRIVE coach bridge up: http://localhost:{args.port}/status")
    print(f"  model {CONF['model']}, {CONF['timeout']} s per line, voice: the browser")
    print("Open the game; the staff drawer says 'Coach lines: Claude via relay'. Ctrl+C quits.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

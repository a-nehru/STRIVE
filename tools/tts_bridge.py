"""
STRIVE voice bridge: the coaches speak with Chatterbox Turbo on localhost.

The page speaks through one path, speakLine in js/a11y.js. Without this
relay that is the browser's own speech engine and every coach has the same
voice. With it running, every line is rendered by Resemble AI's Chatterbox
Turbo (MIT, https://github.com/resemble-ai/chatterbox) in the chosen coach's
own voice, cloned zero-shot from one short reference clip per coach in
tools/voices/ (voices.json says which clip is whose). The paralinguistic
tags the coach prompt allows ([chuckle], [laugh]) are rendered as sounds,
which the browser voice could never do. The page falls back to the browser
voice whenever this is down or slow, so it is a step up and never a
dependency, like the mail and coach bridges.

    GET  /status    -> {"ok": true, "engine": "chatterbox-turbo", "device": "cuda",
                        "voices": {"rook": "sample_ivr_male_01.wav", ...}, "cached": 412,
                        "last_ms": 380, "queue": 0}
    POST /tts       {"coach": "lumi", "text": "Nice and slow. Take your time."}
                 <- audio/wav (24 kHz mono), X-TTS-Cache: hit | miss, X-TTS-Ms: n
    POST /prerender {"coach": "lumi", "lines": ["...", "..."]}
                 <- {"ok": true, "queued": 31, "cached": 12}
                    renders the lines in the background (a live /tts request
                    always goes first), so the phrasebook is on disk before it
                    is needed and a cue never waits on the GPU

Every rendered line is cached as a WAV under tools/tts_cache/<coach>/ keyed
on the text and the reference clip, so a line is synthesised once per voice,
ever; a clinic PC that has heard the phrasebook plays it from disk. Only the
Claude-written lines (tools/coach_bridge.py) are new each time, and those
are between-rep lines with a few seconds to spare.

Setup (its own venv: chatterbox pins torch 2.6.0 and must not touch the
Python that holds pyzed):

    py -3.12 -m venv tools\\.venv-tts
    tools\\.venv-tts\\Scripts\\python -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
    tools\\.venv-tts\\Scripts\\python -m pip install chatterbox-tts
    tools\\.venv-tts\\Scripts\\python tools\\tts_bridge.py --test     # one sample per coach, timed
    tools\\.venv-tts\\Scripts\\python tools\\tts_bridge.py            # serve on 8325

The model weights (about 2 GB) download from Hugging Face on first use. The
GPU is shared with the ZED bridge's hand model; Turbo needs roughly 4-6 GB.
--nano runs the 110M Chatterbox-Nano instead (CPU-capable, 3x realtime on
8 cores) for a machine with no GPU to spare. Every file Chatterbox writes
carries Resemble's imperceptible PerTh watermark.

Reference clips are voices: use recordings of consenting people or
synthetic voices, never a public figure. tools/voices/ is gitignored.
"""

import argparse
import hashlib
import json
import os
import re
import struct
import sys
import threading
import time
import wave
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
VOICES_DIR = HERE / "voices"
VOICES_CONF = VOICES_DIR / "voices.json"
CACHE_DIR = HERE / "tts_cache"
COACHES = ("rook", "lumi", "maple")
# what each coach says when --test runs, and what the chooser's "Hear it" plays
SAMPLES = {"rook": "Smooth flying, co-pilot! Two more! [chuckle]",
           "lumi": "Nice and slow. Take your time.",
           "maple": "Up six from last week. Now beat it."}
# the tags Turbo renders as sounds; any other bracketed tag is stripped
TAGS_OK = {"chuckle", "laugh", "cough"}
MAX_BODY = 64 * 1024
MAX_TEXT = 600                       # a story is the longest thing the game says
PRERENDER_MAX = 400                  # lines one /prerender may queue

MODEL = None
MODEL_LOCK = threading.Lock()        # one generation at a time on the GPU
LIVE_PENDING = 0                     # live /tts requests waiting: the prerender worker yields to them
LIVE_LOCK = threading.Lock()
QUEUE = deque()
QUEUE_SET = set()
QUEUE_EVENT = threading.Event()
STATE = {"engine": "chatterbox-turbo", "device": "cuda", "loading": True, "error": None,
         "last_ms": None, "rendered": 0, "voices": {}}


# ---------------------------------------------------------------- voices
def load_voices():
    """coach -> reference clip path (or None for the model's built-in voice)."""
    conf = {}
    if VOICES_CONF.exists():
        try:
            conf = json.loads(VOICES_CONF.read_text(encoding="utf-8"))
        except ValueError as e:
            print(f"  voices.json unreadable ({e}); using the built-in voice for every coach")
    out = {}
    for c in COACHES:
        name = conf.get(c)
        p = (VOICES_DIR / name) if name else None
        if p and not p.exists():
            print(f"  {c}: reference clip {name} is missing; built-in voice")
            p = None
        out[c] = p
    return out


def voice_key(path):
    """Part of the cache key: which clip, and its contents (a replaced clip is a new voice)."""
    if not path:
        return "builtin"
    st = path.stat()
    return f"{path.name}:{st.st_size}:{int(st.st_mtime)}"


# ---------------------------------------------------------------- text
def clean_text(text):
    text = str(text or "")
    text = re.sub(r"\[(\w+)\]", lambda m: f"[{m.group(1).lower()}]" if m.group(1).lower() in TAGS_OK else " ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text[:MAX_TEXT]


def cache_path(coach, text, vkey):
    h = hashlib.sha1(f"{vkey}\n{text}".encode("utf-8")).hexdigest()[:24]
    return CACHE_DIR / coach / f"{h}.wav"


# ---------------------------------------------------------------- model
def load_model(device, nano):
    global MODEL
    import torch                                   # noqa: F401  (clear error if the venv is wrong)
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    if device == "cuda" and not torch.cuda.is_available():
        print("  CUDA not available; running on the CPU (slow unless --nano)")
        device = "cpu"
    STATE["device"] = device
    STATE["engine"] = "chatterbox-nano" if nano else "chatterbox-turbo"
    t0 = time.perf_counter()
    kw = {"nano": True} if nano else {}
    MODEL = ChatterboxTurboTTS.from_pretrained(device=device, **kw)
    STATE["loading"] = False
    print(f"  {STATE['engine']} loaded on {device} in {time.perf_counter() - t0:.1f} s (sr {MODEL.sr})")


def write_wav(path, wav, sr):
    """Save a (1, n) float tensor as 16-bit PCM without touching torchaudio's backends."""
    import numpy as np
    x = wav.detach().float().cpu().numpy().reshape(-1)
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2").tobytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm)
    os.replace(tmp, path)


def render(coach, text, voices, live=True):
    """Return the cached WAV path for this line, rendering it if needed. (path, ms, hit)"""
    global LIVE_PENDING
    coach = coach if coach in COACHES else "lumi"
    text = clean_text(text)
    if not text:
        return None, 0, False
    ref = voices.get(coach)
    path = cache_path(coach, text, voice_key(ref))
    if path.exists():
        return path, 0, True
    if MODEL is None:
        return None, 0, False
    if live:
        with LIVE_LOCK:
            LIVE_PENDING += 1
    try:
        with MODEL_LOCK:
            if path.exists():                       # rendered by the queue while we waited
                return path, 0, True
            t0 = time.perf_counter()
            kw = {"audio_prompt_path": str(ref)} if ref else {}
            wav = MODEL.generate(text, **kw)
            ms = int((time.perf_counter() - t0) * 1000)
            write_wav(path, wav, MODEL.sr)
            STATE["last_ms"] = ms
            STATE["rendered"] += 1
            return path, ms, False
    finally:
        if live:
            with LIVE_LOCK:
                LIVE_PENDING -= 1


def worker(voices):
    """Background prerender: one line at a time, standing aside whenever a live line is waiting."""
    while True:
        QUEUE_EVENT.wait()
        while QUEUE:
            if LIVE_PENDING > 0 or MODEL is None:
                time.sleep(0.05)
                continue
            coach, text = QUEUE.popleft()
            QUEUE_SET.discard((coach, text))
            try:
                path, ms, hit = render(coach, text, voices, live=False)
                if path and not hit:
                    print(f"  prerender {coach:5} {ms:5} ms  {text[:60]}")
            except Exception as e:                  # one bad line must not stop the queue
                print(f"  prerender {coach:5} failed: {e}")
        QUEUE_EVENT.clear()


def cached_count():
    try:
        return sum(1 for c in COACHES for _ in (CACHE_DIR / c).glob("*.wav"))
    except OSError:
        return 0


# ---------------------------------------------------------------- http
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    voices = {}

    def log_message(self, *a):
        pass

    def _headers(self, code, ctype, length, extra=None):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "X-TTS-Cache, X-TTS-Ms")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        for k, v in (extra or {}).items():
            self.send_header(k, str(v))
        self.end_headers()

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self._headers(code, "application/json", len(body))
        self.wfile.write(body)

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if not 0 < n <= MAX_BODY:
            return None
        try:
            d = json.loads(self.rfile.read(n))
        except ValueError:
            return None
        return d if isinstance(d, dict) else None

    def do_OPTIONS(self):
        self._json(200, {"ok": True})

    def do_GET(self):
        if self.path.startswith("/status"):
            self._json(200, {"ok": MODEL is not None, "engine": STATE["engine"], "device": STATE["device"],
                             "loading": STATE["loading"], "error": STATE["error"],
                             "voices": {c: (p.name if p else "built-in") for c, p in self.voices.items()},
                             "cached": cached_count(), "rendered": STATE["rendered"],
                             "last_ms": STATE["last_ms"], "queue": len(QUEUE), "tags": sorted(TAGS_OK)})
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path.startswith("/tts"):
            return self._tts()
        if self.path.startswith("/prerender"):
            return self._prerender()
        self._json(404, {"ok": False, "error": "not found"})

    def _tts(self):
        d = self._body()
        if d is None:
            return self._json(400, {"ok": False, "error": "bad request"})
        coach = d.get("coach") if d.get("coach") in COACHES else "lumi"
        text = clean_text(d.get("text"))
        if not text:
            return self._json(400, {"ok": False, "error": "no text"})
        if MODEL is None:
            return self._json(503, {"ok": False, "error": "model loading" if STATE["loading"] else STATE["error"] or "no model"})
        try:
            path, ms, hit = render(coach, text, self.voices)
        except Exception as e:
            STATE["error"] = str(e)[:200]
            print(f"  {coach:5} failed: {e}")
            return self._json(500, {"ok": False, "error": str(e)[:200]})
        data = path.read_bytes()
        print(f"  {coach:5} {'cache' if hit else f'{ms:5} ms'}  {text[:70]}")
        self._headers(200, "audio/wav", len(data), {"X-TTS-Cache": "hit" if hit else "miss", "X-TTS-Ms": ms})
        self.wfile.write(data)

    def _prerender(self):
        d = self._body()
        if d is None:
            return self._json(400, {"ok": False, "error": "bad request"})
        coach = d.get("coach") if d.get("coach") in COACHES else "lumi"
        lines = d.get("lines")
        if not isinstance(lines, list):
            return self._json(400, {"ok": False, "error": "lines must be a list"})
        vkey = voice_key(self.voices.get(coach))
        queued = cached = 0
        for raw in lines[:PRERENDER_MAX]:
            text = clean_text(raw)
            if not text:
                continue
            if cache_path(coach, text, vkey).exists():
                cached += 1
                continue
            key = (coach, text)
            if key in QUEUE_SET:
                continue
            QUEUE_SET.add(key)
            QUEUE.append(key)
            queued += 1
        if queued:
            QUEUE_EVENT.set()
        print(f"  prerender {coach:5} queued {queued}, already cached {cached}")
        self._json(200, {"ok": True, "queued": queued, "cached": cached, "queue": len(QUEUE)})


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="STRIVE voice bridge: Chatterbox Turbo coach voices on localhost")
    ap.add_argument("--port", type=int, default=8325)
    ap.add_argument("--device", default="cuda", help="cuda | cpu")
    ap.add_argument("--nano", action="store_true", help="use Chatterbox-Nano (110M, CPU-capable) instead of Turbo")
    ap.add_argument("--voice", action="append", default=[], metavar="COACH=CLIP",
                    help="override voices.json, e.g. --voice lumi=sample_rom_narrator.wav")
    ap.add_argument("--test", action="store_true", help="render one sample line per coach to tools/tts_cache/test_*.wav and exit")
    ap.add_argument("--say", default=None, help="with --test: the line to render instead of the samples")
    args = ap.parse_args()

    voices = load_voices()
    for item in args.voice:
        if "=" not in item:
            sys.exit(f"--voice wants COACH=CLIP, got {item!r}")
        c, name = item.split("=", 1)
        if c not in COACHES:
            sys.exit(f"unknown coach {c!r}")
        p = VOICES_DIR / name
        if not p.exists():
            sys.exit(f"no such clip {p}")
        voices[c] = p
    STATE["voices"] = {c: (p.name if p else "built-in") for c, p in voices.items()}
    print("Voices:", ", ".join(f"{c}={n}" for c, n in STATE["voices"].items()))

    if args.test:
        load_model(args.device, args.nano)
        for c in COACHES:
            text = args.say or SAMPLES[c]
            t0 = time.perf_counter()
            path, ms, hit = render(c, text, voices)
            out = CACHE_DIR / f"test_{c}.wav"
            out.write_bytes(path.read_bytes())
            dur = len(path.read_bytes()) / 2 / MODEL.sr
            print(f"  {c:5} {ms:5} ms for {dur:4.1f} s of speech ({'cached' if hit else 'rendered'}) -> {out}")
            if c == COACHES[0] and not hit:
                # the first call carries warm-up cost; render once more for the steady-state number
                t1 = time.perf_counter()
                p2, ms2, _ = render(c, text + " Again.", voices)
                print(f"        second line {ms2:5} ms")
        return

    threading.Thread(target=worker, args=(voices,), daemon=True).start()

    def loader():
        try:
            load_model(args.device, args.nano)
        except Exception as e:
            STATE["loading"] = False
            STATE["error"] = str(e)[:300]
            print(f"  model failed to load: {e}")

    threading.Thread(target=loader, daemon=True).start()
    Handler.voices = voices
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"STRIVE voice bridge on http://localhost:{args.port}  (GET /status, POST /tts, POST /prerender; Ctrl+C quits)")
    print(f"  cache: {CACHE_DIR} ({cached_count()} lines on disk)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()

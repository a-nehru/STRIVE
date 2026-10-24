"""Talk to worker.py running in tools/.venv-hands. One RemoteModel = one
subprocess with one model loaded; detect() is synchronous and locked, so
callers that want parallelism run one RemoteModel per thread."""
import json
import os
import struct
import subprocess
import sys
import threading
import time

import numpy as np

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV = os.path.join(TOOLS, ".venv-hands")


def venv_python():
    for p in (os.path.join(VENV, "Scripts", "python.exe"), os.path.join(VENV, "bin", "python")):
        if os.path.exists(p):
            return p
    return None


class RemoteModel:
    def __init__(self, model, python=None, timeout=60.0):
        self.model = model
        py = python or venv_python()
        if py is None:
            raise FileNotFoundError(f"no venv at {VENV}; run tools/setup_hands_env.cmd")
        self.proc = subprocess.Popen(
            [py, "-u", os.path.join(TOOLS, "handmodels", "worker.py")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr,
            cwd=TOOLS, env={**os.environ, "PYTHONPATH": TOOLS, "PYTHONUNBUFFERED": "1"})
        self.lock = threading.Lock()
        self.timeout = timeout
        self.ms = 0.0                      # last inference time inside the worker
        self.rtt_ms = 0.0                  # last round trip as seen from here
        self.info = self._call({"op": "load", "model": model})

    def _call(self, header, raw=b""):
        header["bytes"] = len(raw)
        data = json.dumps(header).encode()
        with self.lock:
            t0 = time.perf_counter()
            self.proc.stdin.write(struct.pack(">I", len(data)) + data)
            if raw:
                self.proc.stdin.write(raw)
            self.proc.stdin.flush()
            n = struct.unpack(">I", self._read(4))[0]
            rep = json.loads(self._read(n))
            self.rtt_ms = (time.perf_counter() - t0) * 1000
        if not rep.get("ok"):
            raise RuntimeError(rep.get("error", "worker error"))
        self.ms = rep.get("ms", 0.0)
        return rep.get("result")

    def _read(self, n):
        buf = bytearray()
        while len(buf) < n:
            chunk = self.proc.stdout.read(n - len(buf))
            if not chunk:
                raise EOFError(f"{self.model} worker exited")
            buf.extend(chunk)
        return bytes(buf)

    def detect(self, img, side="right", t_ms=None):
        """Hand model: img is an RGB crop (h, w, 3) uint8."""
        img = np.ascontiguousarray(img)
        h, w = img.shape[:2]
        c = img.shape[2] if img.ndim == 3 else 1
        return self._call({"op": "detect", "model": self.model, "side": side, "t": t_ms,
                           "w": w, "h": h, "c": c}, img.tobytes())

    def detect_body(self, bgr, boxes=None):
        """Body model: bgr is the full frame (h, w, 3) uint8; boxes (x0,y0,x1,y1)
        skip the model's own person detector (top-down models only)."""
        bgr = np.ascontiguousarray(bgr)
        h, w = bgr.shape[:2]
        hdr = {"op": "body", "model": self.model, "w": w, "h": h, "c": bgr.shape[2]}
        if boxes:
            hdr["boxes"] = [[float(v) for v in b] for b in boxes]
        people = self._call(hdr, bgr.tobytes()) or []
        for p in people:                      # JSON made the landmark keys strings
            p["lm"] = {int(k): v for k, v in p["lm"].items()}
        return people

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


def make_hand_model(name):
    """In-process for mediapipe, a venv worker for the rest."""
    if name == "mediapipe":
        from .mp_hands import MediaPipeHands
        return MediaPipeHands()
    return RemoteModel(name)

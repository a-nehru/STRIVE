"""The model worker: runs inside tools/.venv-hands (torch, ultralytics,
wilor-mini) and serves detections to a parent process over its pipes.

Framing, both directions: 4-byte big-endian length, then a JSON header; a
request header with "bytes" > 0 is followed by that many raw image bytes
(uint8, h x w x c). Requests:
  {"op": "ping"}
  {"op": "load", "model": "wilor" | "yolo"}
  {"op": "detect", "model": "wilor", "side": "left", "w":, "h":, "c":, "t": ms, "bytes": n}
  {"op": "body",   "model": "yolo" | "vitpose", "w":, "h":, "c":, "bytes": n, "boxes": [[x0,y0,x1,y1]...] optional}
Replies: {"ok": true, "result": ..., "ms": inference ms} or {"ok": false, "error": "..."}.
Everything a model prints goes to stderr; stdout is the protocol.
"""
import json
import struct
import sys
import time
import traceback

OUT = sys.__stdout__.buffer
IN = sys.__stdin__.buffer
sys.stdout = sys.stderr            # keep library chatter off the protocol stream

MODELS = {}


def load(name):
    if name in MODELS:
        return MODELS[name]
    if name == "wilor":
        from handmodels.wilor_model import WiLoRHands
        MODELS[name] = WiLoRHands()
    elif name == "yolo":
        from handmodels.yolo_pose import YoloPose
        MODELS[name] = YoloPose()
    elif name == "vitpose":
        from handmodels.vitpose import ViTPose
        MODELS[name] = ViTPose()
    elif name == "mediapipe":
        from handmodels.mp_hands import MediaPipeHands
        MODELS[name] = MediaPipeHands()
    else:
        raise ValueError(f"unknown model {name!r}")
    return MODELS[name]


def send(obj):
    data = json.dumps(obj).encode()
    OUT.write(struct.pack(">I", len(data)))
    OUT.write(data)
    OUT.flush()


def read_exact(n):
    buf = bytearray()
    while len(buf) < n:
        chunk = IN.read(n - len(buf))
        if not chunk:
            raise EOFError
        buf.extend(chunk)
    return bytes(buf)


def main():
    import numpy as np
    while True:
        try:
            (n,) = struct.unpack(">I", read_exact(4))
        except EOFError:
            return
        req = json.loads(read_exact(n))
        raw = read_exact(req["bytes"]) if req.get("bytes") else b""
        try:
            op = req["op"]
            if op == "ping":
                send({"ok": True, "result": {k: m.info() for k, m in MODELS.items()}})
                continue
            if op == "load":
                m = load(req["model"])
                send({"ok": True, "result": m.info()})
                continue
            img = np.frombuffer(raw, dtype=np.uint8).reshape(req["h"], req["w"], req["c"])
            m = load(req["model"])
            t0 = time.perf_counter()
            if op == "detect":
                res = m.detect(img, req.get("side", "right"), req.get("t"))
            elif op == "body":
                res = m.detect(img, req["boxes"]) if req.get("boxes") else m.detect(img)
            else:
                raise ValueError(f"unknown op {op!r}")
            send({"ok": True, "result": res, "ms": round((time.perf_counter() - t0) * 1000, 2)})
        except Exception as e:
            traceback.print_exc()
            send({"ok": False, "error": f"{e.__class__.__name__}: {e}"})


if __name__ == "__main__":
    main()

"""
STRIVE ZED bridge: streams ZED SDK body tracking into the browser game.

The game is a static web app and cannot reach the ZED SDK directly, so this
script is the adapter: it opens the ZED 2, runs the SDK's depth-based body
tracking (BODY_38), converts each skeleton to the MediaPipe 33-landmark
layout the game's tracker already consumes, and serves it on localhost:

    GET /status      -> {"ok": true, "w": .., "h": .., "profile": ..}
    GET /stream      -> Server-Sent Events, one JSON skeleton per frame
    GET /video.mjpg  -> MJPEG preview of the left eye (the game's mirror)

Run this first, then open the game. With the staff-drawer camera setting on
"Auto", the game probes /status at boot and uses the ZED when the bridge is
up; otherwise it falls back to the webcam + MediaPipe with no ZED installed.

Grasp note: BODY_38 carries only four fingertip-ish points per hand, so the
game's self-calibrating pose-fingertip grip fallback handles squeeze
detection (the 21-point hand model games, e.g. Firefly Pinch, degrade).

Requires: ZED SDK + pyzed, opencv-python, numpy. Stdlib HTTP only.

Keys: Ctrl+C to quit.
"""

import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
import pyzed.sl as sl

# game LM layout (MediaPipe pose indexes) <- BODY_38 names, with fallbacks.
# HAND_MIDDLE_4 is a fingertip, so it stands in for the "index tip" the
# game's grip heuristic measures; the per-person calibration absorbs the
# difference in scale.
MP_FROM_38 = {
    7:  ["LEFT_EAR"],
    8:  ["RIGHT_EAR"],
    11: ["LEFT_SHOULDER"],
    12: ["RIGHT_SHOULDER"],
    13: ["LEFT_ELBOW"],
    14: ["RIGHT_ELBOW"],
    15: ["LEFT_WRIST"],
    16: ["RIGHT_WRIST"],
    17: ["LEFT_HAND_PINKY_1", "LEFT_WRIST"],
    18: ["RIGHT_HAND_PINKY_1", "RIGHT_WRIST"],
    19: ["LEFT_HAND_MIDDLE_4", "LEFT_HAND_INDEX_1", "LEFT_WRIST"],
    20: ["RIGHT_HAND_MIDDLE_4", "RIGHT_HAND_INDEX_1", "RIGHT_WRIST"],
    21: ["LEFT_HAND_THUMB_4", "LEFT_WRIST"],
    22: ["RIGHT_HAND_THUMB_4", "RIGHT_WRIST"],
    23: ["LEFT_HIP"],
    24: ["RIGHT_HIP"],
}

# game-tuned profiles: latency and sample rate matter more than millimetres
PROFILES = {
    "fast":     dict(res="HD720", fps=60, depth="NEURAL_LIGHT", model="HUMAN_BODY_MEDIUM", fp16=True),
    "balanced": dict(res="HD720", fps=60, depth="NEURAL", model="HUMAN_BODY_ACCURATE", fp16=False),
}


def setattr_if(obj, name, value, warn=True):
    """SDK versions differ; skip missing attributes but say so."""
    if hasattr(obj, name):
        setattr(obj, name, value)
        return True
    if warn:
        print(f"  (not in this SDK build: {name})")
    return False


def resolve_indexes():
    members = sl.BODY_38_PARTS.__members__
    table = {}
    for mp_i, names in MP_FROM_38.items():
        found = [int(members[n].value) for n in names if n in members]
        if not found:
            raise SystemExit(f"BODY_38 is missing all of {names}")
        table[mp_i] = found
    return table


class Latest:
    """Newest skeleton + preview frame, shared between capture and HTTP."""

    def __init__(self):
        self.cond = threading.Condition()
        self.seq = 0
        self.lm_json = None      # SSE payload (bytes)
        self.jpg = None          # MJPEG payload (bytes)

    def publish(self, lm_json=None, jpg=None):
        with self.cond:
            if lm_json is not None:
                self.lm_json = lm_json
            if jpg is not None:
                self.jpg = jpg
            self.seq += 1
            self.cond.notify_all()

    def wait_newer(self, seen, timeout=1.0):
        with self.cond:
            self.cond.wait_for(lambda: self.seq > seen, timeout=timeout)
            return self.seq, self.lm_json, self.jpg


LATEST = Latest()
STATUS = {}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):     # keep the console readable
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def do_GET(self):
        if self.path.startswith("/status"):
            body = json.dumps(STATUS).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/stream"):
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            seen = 0
            try:
                while True:
                    seen, lm_json, _ = LATEST.wait_newer(seen)
                    if lm_json is None:
                        self.wfile.write(b": heartbeat\n\n")
                    else:
                        self.wfile.write(b"data: " + lm_json + b"\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionError, OSError):
                pass
        elif self.path.startswith("/video.mjpg"):
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.end_headers()
            seen = 0
            try:
                while True:
                    seen, _, jpg = LATEST.wait_newer(seen)
                    if jpg is None:
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n"
                                     + f"Content-Length: {len(jpg)}\r\n\r\n".encode())
                    self.wfile.write(jpg)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionError, OSError):
                pass
        else:
            self.send_response(404)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()


def capture(zed, rt, run, table, res_w, res_h, preview_w, jpeg_every):
    bodies = sl.Bodies()
    image = sl.Mat()
    preview_h = int(preview_w * res_h / res_w)
    preview_res = sl.Resolution(preview_w, preview_h)
    n, t0, fps = 0, time.perf_counter(), 0.0
    while True:
        if zed.grab(run) != sl.ERROR_CODE.SUCCESS:
            time.sleep(0.002)
            continue
        n += 1
        zed.retrieve_bodies(bodies, rt)
        lm_json = None
        best = None
        for body in bodies.body_list:   # highest-confidence body only
            if best is None or body.confidence > best.confidence:
                best = body
        if best is not None:
            kp2 = np.asarray(best.keypoint_2d, dtype=float)
            conf = np.asarray(getattr(best, "keypoint_confidence", []), dtype=float)
            lm = [[0.0, 0.0, 0.0]] * 33
            for mp_i, candidates in table.items():
                for zi in candidates:
                    if zi < len(kp2) and np.isfinite(kp2[zi]).all():
                        vis = float(conf[zi]) / 100.0 if zi < len(conf) and np.isfinite(conf[zi]) else 1.0
                        lm[mp_i] = [round(kp2[zi][0] / res_w, 5),
                                    round(kp2[zi][1] / res_h, 5),
                                    round(max(0.0, min(1.0, vis)), 3)]
                        break
            lm_json = json.dumps({"lm": lm}).encode()

        jpg = None
        if n % jpeg_every == 0:
            zed.retrieve_image(image, sl.VIEW.LEFT, sl.MEM.CPU, preview_res)
            frame = cv2.cvtColor(image.get_data(), cv2.COLOR_BGRA2BGR)
            ok, enc = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok:
                jpg = enc.tobytes()

        LATEST.publish(lm_json=lm_json, jpg=jpg)

        if n % 120 == 0:
            t1 = time.perf_counter()
            fps = 120 / (t1 - t0)
            t0 = t1
            STATUS["fps"] = round(fps, 1)
            print(f"  {fps:5.1f} fps   body: {'yes' if best is not None else 'NO'}", end="\r")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", choices=PROFILES, default="fast",
                    help="fast = 60fps game default; balanced = ACCURATE model")
    ap.add_argument("--port", type=int, default=8322)
    ap.add_argument("--max-range", type=float, default=3.5)
    ap.add_argument("--exposure", choices=["fixed", "auto"], default="auto",
                    help="fixed avoids motion blur under good room light")
    ap.add_argument("--exposure-val", type=int, default=45)
    ap.add_argument("--gain", type=int, default=50)
    ap.add_argument("--preview-width", type=int, default=640)
    args = ap.parse_args()

    P = PROFILES[args.profile]
    table = resolve_indexes()

    init = sl.InitParameters()
    init.camera_resolution = getattr(sl.RESOLUTION, P["res"])
    init.camera_fps = P["fps"]
    if hasattr(sl.DEPTH_MODE, P["depth"]):
        init.depth_mode = getattr(sl.DEPTH_MODE, P["depth"])
    else:                                   # older SDKs: NEURAL_LIGHT missing
        init.depth_mode = sl.DEPTH_MODE.PERFORMANCE
        print(f"  (no DEPTH_MODE.{P['depth']}; using PERFORMANCE)")
    init.depth_minimum_distance = 0.8
    init.depth_maximum_distance = args.max_range
    init.coordinate_units = sl.UNIT.METER

    zed = sl.Camera()
    st = zed.open(init)
    if st != sl.ERROR_CODE.SUCCESS:
        raise SystemExit(f"camera open failed: {st}")

    if args.exposure == "fixed":
        zed.set_camera_settings(sl.VIDEO_SETTINGS.EXPOSURE, args.exposure_val)
        zed.set_camera_settings(sl.VIDEO_SETTINGS.GAIN, args.gain)
        print(f"  exposure {args.exposure_val}, gain {args.gain} (fixed)")

    pt = sl.PositionalTrackingParameters()
    pt.set_as_static = True
    zed.enable_positional_tracking(pt)

    bt = sl.BodyTrackingParameters()
    bt.detection_model = getattr(sl.BODY_TRACKING_MODEL, P["model"])
    bt.body_format = sl.BODY_FORMAT.BODY_38
    bt.enable_tracking = True
    bt.enable_body_fitting = True
    setattr_if(bt, "allow_reduced_precision_inference", P["fp16"])
    setattr_if(bt, "max_range", args.max_range)
    # never extrapolate a skeleton: a predicted arm would move game targets
    setattr_if(bt, "prediction_timeout_s", 0.0)
    if zed.enable_body_tracking(bt) != sl.ERROR_CODE.SUCCESS:
        raise SystemExit("body tracking failed to start")

    run = sl.RuntimeParameters()
    setattr_if(run, "enable_fill_mode", False, warn=False)
    rt = sl.BodyTrackingRuntimeParameters()
    rt.detection_confidence_threshold = 40

    cam = zed.get_camera_information().camera_configuration.resolution
    STATUS.update({"ok": True, "source": "zed", "w": cam.width, "h": cam.height,
                   "profile": args.profile, "model": P["model"], "fps": 0})

    threading.Thread(target=capture,
                     args=(zed, rt, run, table, cam.width, cam.height,
                           args.preview_width, 2),
                     daemon=True).start()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"\nZED bridge up: http://localhost:{args.port}/status "
          f"({P['res']}@{P['fps']} {P['model']})")
    print("Open the game; camera source Auto will pick the ZED up. Ctrl+C quits.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        zed.disable_body_tracking()
        zed.close()


if __name__ == "__main__":
    main()

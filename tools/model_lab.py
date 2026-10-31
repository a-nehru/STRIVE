"""STRIVE tracking lab: run several tracking models on the SAME frames, side
by side, and show what each one sees. Not patient-facing.

    py -3.12 tools\\model_lab.py                      # the ZED (stop the bridge first)
    py -3.12 tools\\model_lab.py --source cam:0       # a webcam
    py -3.12 tools\\model_lab.py --source file:x.mp4  # a video file, looped
    py -3.12 tools\\model_lab.py --source rec:tools\\recordings\\2026-10-23_1142   # a recording, replayed

then open http://localhost:8321/tools/tracking-lab.html (the page talks to
this server on localhost:8326). Hand models run on a crop about each wrist
exactly as the bridge does (zed_bridge.hand_crops); body models run on the
whole frame. Each model runs in a thread of its own, latest frame wins, so a
slow model never holds a fast one back and every model's own rate shows.

Endpoints: /status, /set?hands=a,b&body=c,d&every=N&cropk=K&mirror=0|1,
/stream (SSE: metrics every 250 ms), /video.mjpg (the overlay),
/record?start=1 | stop=1 (full-res JPEGs + log.jsonl under tools/recordings,
replayable with --source rec:DIR and scored by tools/compare_models.py),
/snapshot (one PNG of the overlay), /zed?model=HUMAN_BODY_ACCURATE&depth=NEURAL&res=HD2K&fps=15
(switch the ZED live), /use?hand=wilor (save the ZED settings and the hand model
to tools/tracking_config.json, which zed_bridge.py reads at start), /config.
"""
import argparse
import collections
import json
import math
import os
import statistics
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from handmodels import HAND_MODELS, BODY_MODELS              # noqa: E402
from handmodels.base import BONES, curl, aperture           # noqa: E402
from handmodels.client import RemoteModel, venv_python       # noqa: E402

TOOLS = os.path.dirname(os.path.abspath(__file__))
REC_DIR = os.path.join(TOOLS, "recordings")
CONFIG_PATH = os.path.join(TOOLS, "tracking_config.json")   # the lab's choice for the game
WINDOW_S = 3.0                 # the rolling window every metric is read over
REF_WIDTH = 1280               # the crop band (150-460 px) was tuned at this width
# colours (BGR) per model, kept apart on purpose
COLS = {"zed": (138, 192, 159), "yolo": (230, 170, 90), "vitpose": (200, 120, 230),
        "mediapipe": (106, 168, 232), "wilor": (150, 110, 255)}
ARM_BONES = [(11, 13), (13, 15), (12, 14), (14, 16), (11, 12), (23, 24), (11, 23), (12, 24)]


# --- sources --------------------------------------------------------------
class Frame:
    __slots__ = ("n", "t_ms", "bgr", "zed")

    def __init__(self, n, t_ms, bgr, zed=None):
        self.n, self.t_ms, self.bgr, self.zed = n, t_ms, bgr, zed


class CamSource:
    name = "cam"

    def __init__(self, spec):
        if spec.startswith("cam:"):
            idx = int(spec[4:])
            self.cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW if os.name == "nt" else 0)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            self.loop = False
        else:
            self.name = "file"
            self.cap = cv2.VideoCapture(spec[5:])
            self.loop = True
        if not self.cap.isOpened():
            raise SystemExit(f"cannot open {spec}")
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.n = 0

    def read(self):
        ok, bgr = self.cap.read()
        if not ok:
            if self.loop:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, bgr = self.cap.read()
            if not ok:
                return None
        if self.loop:
            time.sleep(1.0 / self.fps)
        if bgr.shape[1] >= 2.6 * bgr.shape[0]:
            # a ZED plugged in as a plain UVC webcam gives one double-wide
            # left|right frame: keep the left eye, as the game's tracker does
            bgr = np.ascontiguousarray(bgr[:, :bgr.shape[1] // 2])
        self.n += 1
        return Frame(self.n, int(time.monotonic() * 1000), bgr)

    def info(self):
        return {"source": self.name, "w": int(self.cap.get(3)), "h": int(self.cap.get(4))}

    def close(self):
        self.cap.release()


class RecSource:
    """Replay a recording: the frames, and the ZED body from the log so the
    crops are the ones the live run used."""
    name = "rec"

    def __init__(self, d, rate=15.0):
        self.dir = d
        self.lines = [json.loads(l) for l in open(os.path.join(d, "log.jsonl")) if l.strip()]
        if not self.lines:
            raise SystemExit(f"{d}: empty log")
        self.i, self.rate = 0, rate
        meta = os.path.join(d, "meta.json")
        self.meta = json.load(open(meta)) if os.path.exists(meta) else {}

    def read(self):
        rec = self.lines[self.i % len(self.lines)]
        self.i += 1
        bgr = cv2.imread(os.path.join(self.dir, "frames", rec["file"]))
        time.sleep(1.0 / self.rate)
        return Frame(rec["n"], rec["t_ms"], bgr, rec.get("zed"))

    def info(self):
        return {"source": "rec", "dir": self.dir, "frames": len(self.lines), **self.meta}

    def close(self):
        pass


class ZedSource:
    """The ZED through the SDK. Its own body model (FAST / MEDIUM / ACCURATE),
    depth mode and picture size are switchable live from the page: a body
    model swap re-enables body tracking on the open camera, a depth or size
    change closes and reopens it. The first use of a model optimises it for
    the GPU, which can take minutes; the status says "switching" meanwhile."""
    name = "zed"

    def __init__(self, profile, res=None, fps=None, max_range=5.0):
        import pyzed.sl as sl
        import zed_bridge as zb
        self.sl, self.zb = sl, zb
        P = dict(zb.PROFILES[profile])
        if res:
            P["res"] = res
        P["fps"] = zb.pick_fps(P["res"], fps or P["fps"])
        # the SDK's body fitting (a skeleton with fixed bone lengths): on by
        # default, switchable to record the raw 3D for tools/armfit.py
        P.setdefault("fitting", True)
        self.table, self.shoulders = zb.resolve_indexes()
        self.max_range = max_range
        self.lock = threading.Lock()
        self.state = "ok"
        self.zed = None
        self.n = 0
        self._open(P)

    def choices(self):
        sl = self.sl
        return {"model": [m for m in sl.BODY_TRACKING_MODEL.__members__ if m.startswith("HUMAN_BODY")],
                "depth": [d for d in ("NEURAL_LIGHT", "NEURAL", "NEURAL_PLUS", "PERFORMANCE", "QUALITY", "ULTRA")
                          if hasattr(sl.DEPTH_MODE, d)],
                "res": list(self.zb.RES_FPS), "fps": self.zb.RES_FPS}

    def _open(self, P):
        sl, zb = self.sl, self.zb
        init = sl.InitParameters()
        init.camera_resolution = getattr(sl.RESOLUTION, P["res"])
        init.camera_fps = P["fps"]
        init.depth_mode = getattr(sl.DEPTH_MODE, P["depth"]) if hasattr(sl.DEPTH_MODE, P["depth"]) else sl.DEPTH_MODE.PERFORMANCE
        init.depth_minimum_distance = 0.8
        init.depth_maximum_distance = self.max_range
        init.coordinate_units = sl.UNIT.METER
        self.zed = sl.Camera()
        st = zb.open_with_retries(self.zed, init)
        if st != sl.ERROR_CODE.SUCCESS:
            raise SystemExit(f"camera open failed: {st} (is the bridge running? one process at a time)")
        zb.apply_picture(self.zed, *(zb.PICTURE_DEFAULTS[k] for k in ("brightness", "contrast", "gamma")))
        pt = sl.PositionalTrackingParameters()
        pt.set_as_static = True
        self.zed.enable_positional_tracking(pt)
        self._enable_body(P["model"], P.get("fp16", True), P.get("fitting", True))
        self.run = sl.RuntimeParameters()
        self.rt = sl.BodyTrackingRuntimeParameters()
        self.rt.detection_confidence_threshold = 40
        cam = self.zed.get_camera_information().camera_configuration.resolution
        self.w, self.h = cam.width, cam.height
        self.P = P
        self.bodies, self.img = sl.Bodies(), sl.Mat()

    def _enable_body(self, model, fp16=True, fitting=True):
        sl, zb = self.sl, self.zb
        bt = sl.BodyTrackingParameters()
        bt.detection_model = getattr(sl.BODY_TRACKING_MODEL, model)
        bt.body_format = sl.BODY_FORMAT.BODY_38
        bt.enable_tracking = True
        bt.enable_body_fitting = bool(fitting)
        zb.setattr_if(bt, "allow_reduced_precision_inference", fp16, warn=False)
        zb.setattr_if(bt, "prediction_timeout_s", 0.0, warn=False)
        st = self.zed.enable_body_tracking(bt)
        if st != sl.ERROR_CODE.SUCCESS:
            raise RuntimeError(f"body tracking {model} failed to start: {st}")

    def reconfigure(self, model=None, depth=None, res=None, fps=None, fitting=None):
        """Called from an HTTP thread; blocks read() while it works."""
        P = dict(self.P)
        if fitting is not None:
            P["fitting"] = fitting in ("on", "1", "true", True)
        if model:
            P["model"] = model
        if depth:
            P["depth"] = depth
        if res:
            P["res"] = res
        if fps or res:
            P["fps"] = self.zb.pick_fps(P["res"], int(fps) if fps else P["fps"])
        reopen = any(P[k] != self.P[k] for k in ("depth", "res", "fps"))
        self.state = (f"switching to {P['model']} / {P['depth']} / {P['res']}@{P['fps']}"
                      f"{'' if P.get('fitting', True) else ' / fitting off'} (a first use optimises the model: minutes)")
        try:
            with self.lock:
                if reopen:
                    try:
                        self.zed.disable_body_tracking()
                        self.zed.close()
                    except Exception:
                        pass
                    time.sleep(1.0)
                    self._open(P)
                elif P["model"] != self.P["model"] or P.get("fitting", True) != self.P.get("fitting", True):
                    self.zed.disable_body_tracking()
                    self._enable_body(P["model"], P.get("fp16", True), P.get("fitting", True))
                    self.P = P
            self.state = "ok"
        except BaseException as e:
            self.state = f"failed: {e}"
            raise

    def read(self):
        sl = self.sl
        with self.lock:
            if self.zed.grab(self.run) != sl.ERROR_CODE.SUCCESS:
                return None
            self.n += 1
            self.zed.retrieve_bodies(self.bodies, self.rt)
            self.zed.retrieve_image(self.img, sl.VIEW.LEFT, sl.MEM.CPU)
            bgr = cv2.cvtColor(self.img.get_data(), cv2.COLOR_BGRA2BGR)
        zed = []
        for b in self.bodies.body_list:
            lm = {}
            kp2 = np.asarray(b.keypoint_2d, dtype=float)
            kp3 = np.asarray(b.keypoint, dtype=float)
            conf = np.asarray(getattr(b, "keypoint_confidence", []), dtype=float)
            lm3 = {}
            for mp_i, cands in self.table.items():
                for zi in cands:
                    if zi < len(kp2) and np.isfinite(kp2[zi]).all():
                        c = float(conf[zi]) / 100.0 if zi < len(conf) and np.isfinite(conf[zi]) else 1.0
                        lm[mp_i] = [float(kp2[zi][0]), float(kp2[zi][1]), round(c, 3)]
                        if zi < len(kp3) and np.isfinite(kp3[zi]).all():
                            lm3[mp_i] = [round(float(v), 4) for v in kp3[zi][:3]]
                        break
            fin = kp2[np.isfinite(kp2).all(axis=1)] if kp2.size else kp2
            box = [float(fin[:, 0].min()), float(fin[:, 1].min()), float(fin[:, 0].max()), float(fin[:, 1].max())] if len(fin) else None
            zed.append({"id": int(b.id), "lm": lm, "lm3": lm3, "box": box,
                        "crops": self.zb.hand_crops(b, self.table, self.shoulders, self.w)})
        # the primary body: the biggest in the picture (the lab has no seats)
        zed.sort(key=lambda z: -((z["box"][2] - z["box"][0]) if z["box"] else 0))
        return Frame(self.n, int(time.monotonic() * 1000), bgr, zed)

    def info(self):
        return {"source": "zed", "w": self.w, "h": self.h, **self.P, "state": self.state, "choices": self.choices()}

    def close(self):
        self.zed.disable_body_tracking()
        self.zed.close()


# --- crops without the ZED: from any body model's wrists -------------------
def crops_from_lm(lm, res_w, k_extra=1.0):
    """The bridge's hand_crops rule on a {mp_index: [x, y, c]} body: a square
    about the wrist nudged past it along the forearm, sized by the shoulder
    width in pixels (150-460 px at 1280 wide, scaled with the width)."""
    k = res_w / REF_WIDTH
    shw = None
    if 11 in lm and 12 in lm:
        shw = math.hypot(lm[11][0] - lm[12][0], lm[11][1] - lm[12][1])
    size = min(max(1.15 * shw if shw else 260 * k, 150 * k), 460 * k) * k_extra
    crops = {}
    for side, wi, ei, ti in (("left", 15, 13, 19), ("right", 16, 14, 20)):
        if wi not in lm:
            continue
        cx, cy = lm[wi][0], lm[wi][1]
        if ti in lm:                                   # index finger known: towards it
            cx, cy = cx + 0.55 * (lm[ti][0] - cx), cy + 0.55 * (lm[ti][1] - cy)
        elif ei in lm:                                 # else along the forearm
            dx, dy = cx - lm[ei][0], cy - lm[ei][1]
            cx, cy = cx + 0.25 * dx, cy + 0.25 * dy
        crops[side] = (cx, cy, size)
    return crops


def cut(bgr, crop):
    H, W = bgr.shape[:2]
    cx, cy, size = crop
    size = int(size)
    x0 = int(min(max(cx - size / 2, 0), max(W - size, 0)))
    y0 = int(min(max(cy - size / 2, 0), max(H - size, 0)))
    return np.ascontiguousarray(bgr[y0:y0 + size, x0:x0 + size]), x0, y0


# --- the runners: one thread per model, latest frame wins ------------------
class Runner(threading.Thread):
    def __init__(self, name, kind, lab):
        super().__init__(daemon=True)
        self.name_, self.kind, self.lab = name, kind, lab
        self.cv = threading.Condition()
        self.job = None
        self.result = None           # {"n", "t_ms", "hands": {...}} or {"n", "people": [...]}
        self.at = 0.0
        self.hist = collections.deque()      # (t, record) for the rolling metrics
        self.error = None
        self.model = None
        self.loading = True
        self.stop = False

    def submit(self, frame, crops, boxes):
        with self.cv:
            self.job = (frame, crops, boxes)
            self.cv.notify()

    def run(self):
        try:
            if self.name_ == "mediapipe":
                from handmodels.mp_hands import MediaPipeHands
                self.model = MediaPipeHands()
            else:
                self.model = RemoteModel(self.name_)
        except Exception as e:
            self.error = f"{e.__class__.__name__}: {e}"
            self.loading = False
            return
        self.loading = False
        while not self.stop:
            with self.cv:
                while self.job is None and not self.stop:
                    self.cv.wait(0.5)
                if self.stop:
                    break
                frame, crops, boxes = self.job
                self.job = None
            t0 = time.perf_counter()
            rec = {"n": frame.n, "t_ms": frame.t_ms}
            try:
                if self.kind == "hand":
                    hands = {}
                    for side, crop in crops.items():
                        sub, x0, y0 = cut(frame.bgr, crop)
                        if sub.size == 0:
                            continue
                        rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
                        r = self.model.detect(rgb, side, frame.t_ms)
                        if r:
                            pts = [[x0 + p[0], y0 + p[1]] for p in r["pts"]]
                            hands[side] = {"pts": pts, "world": r.get("world"), "conf": r.get("conf"),
                                           "curl": curl(r.get("world")), "aperture": aperture(r.get("world"))}
                    rec["hands"] = hands
                    rec["tried"] = list(crops.keys())
                else:
                    if hasattr(self.model, "detect_body"):
                        people = self.model.detect_body(frame.bgr, boxes if self.name_ == "vitpose" else None)
                    else:
                        people = self.model.detect(frame.bgr)
                    rec["people"] = people or []
                rec["ms"] = (time.perf_counter() - t0) * 1000
                rec["model_ms"] = getattr(self.model, "ms", rec["ms"])
                self.error = None
            except Exception as e:
                self.error = f"{e.__class__.__name__}: {e}"
                rec["error"] = self.error
                rec["ms"] = (time.perf_counter() - t0) * 1000
            now = time.monotonic()
            self.result, self.at = rec, now
            self.hist.append((now, rec))
            while self.hist and now - self.hist[0][0] > WINDOW_S:
                self.hist.popleft()
            self.lab.on_result(self.name_, rec)

    # --- rolling metrics over the window ---
    def metrics(self):
        hist = list(self.hist)
        m = {"model": self.name_, "kind": self.kind, "loading": self.loading, "error": self.error,
             "n": len(hist)}
        if not hist:
            return m
        span = max(hist[-1][0] - hist[0][0], 1e-3)
        m["fps"] = round((len(hist) - 1) / span, 1) if len(hist) > 1 else 0.0
        m["ms"] = round(statistics.median(r["ms"] for _, r in hist), 1)
        m["model_ms"] = round(statistics.median(r.get("model_ms", r["ms"]) for _, r in hist), 1)
        if self.kind == "hand":
            for side in ("left", "right"):
                tried = [r for _, r in hist if side in r.get("tried", [])]
                got = [r for r in tried if side in r.get("hands", {})]
                s = {"tried": len(tried), "found": len(got),
                     "detect_pct": round(100.0 * len(got) / len(tried), 1) if tried else None}
                curls = [r["hands"][side]["curl"] for r in got if r["hands"][side]["curl"] is not None]
                aps = [r["hands"][side]["aperture"] for r in got if r["hands"][side]["aperture"] is not None]
                if curls:
                    s["curl"] = round(statistics.mean(curls), 3)
                    s["curl_sd"] = round(statistics.pstdev(curls), 3)
                if aps:
                    s["aperture"] = round(statistics.mean(aps), 3)
                    s["aperture_sd"] = round(statistics.pstdev(aps), 3)
                # jitter: mean frame-to-frame move of the landmark centroid, px
                cents = [np.mean(np.asarray(r["hands"][side]["pts"]), axis=0) for r in got]
                if len(cents) > 2:
                    d = [float(np.linalg.norm(cents[i] - cents[i - 1])) for i in range(1, len(cents))]
                    s["jitter_px"] = round(statistics.mean(d), 2)
                m[side] = s
        else:
            frames = [r for _, r in hist if "people" in r]
            got = [r for r in frames if r["people"]]
            m["detect_pct"] = round(100.0 * len(got) / len(frames), 1) if frames else None
            m["people"] = round(statistics.mean(len(r["people"]) for r in frames), 2) if frames else 0
            # the primary person = the one with the biggest box / most joints
            prim = [max(r["people"], key=lambda p: len(p["lm"])) for r in got]
            joints = [len(p["lm"]) for p in prim]
            m["joints"] = round(statistics.mean(joints), 1) if joints else 0
            for label, (a, b) in (("upper_l", (11, 13)), ("fore_l", (13, 15)), ("upper_r", (12, 14)), ("fore_r", (14, 16))):
                L = [math.hypot(p["lm"][a][0] - p["lm"][b][0], p["lm"][a][1] - p["lm"][b][1])
                     for p in prim if a in p["lm"] and b in p["lm"]]
                if len(L) > 2 and statistics.mean(L) > 1:
                    m[f"bone_{label}_cov"] = round(100 * statistics.pstdev(L) / statistics.mean(L), 1)
                L3 = [math.dist(p["lm3"][a], p["lm3"][b]) for p in prim if "lm3" in p and a in p["lm3"] and b in p["lm3"]]
                if len(L3) > 2 and statistics.mean(L3) > 0.01:
                    m[f"bone3d_{label}_cov"] = round(100 * statistics.pstdev(L3) / statistics.mean(L3), 1)
                    m[f"bone3d_{label}_m"] = round(statistics.mean(L3), 3)
            for label, wi in (("wrist_l", 15), ("wrist_r", 16)):
                pts = [np.asarray(p["lm"][wi][:2]) for p in prim if wi in p["lm"]]
                if len(pts) > 2:
                    d = [float(np.linalg.norm(pts[i] - pts[i - 1])) for i in range(1, len(pts))]
                    m[f"{label}_jitter_px"] = round(statistics.mean(d), 2)
                    m[f"{label}_pct"] = round(100.0 * len(pts) / len(frames), 1)
        return m


class ZedRunner:
    """The ZED's own BODY_38 is not a model we run; it arrives with the frame.
    This keeps its history so it gets the same metrics as the others."""
    def __init__(self):
        self.name_, self.kind = "zed", "body"
        self.hist = collections.deque()
        self.result, self.at = None, 0.0
        self.loading, self.error = False, None

    def push(self, frame):
        now = time.monotonic()
        people = [{"lm": z["lm"], "lm3": z["lm3"], "box": z["box"]} for z in (frame.zed or [])]
        rec = {"n": frame.n, "t_ms": frame.t_ms, "people": people, "ms": 0.0, "model_ms": 0.0}
        self.result, self.at = rec, now
        self.hist.append((now, rec))
        while self.hist and now - self.hist[0][0] > WINDOW_S:
            self.hist.popleft()

    metrics = Runner.metrics


# --- the lab ----------------------------------------------------------------
class Lab:
    def __init__(self, source, preview_w, args):
        self.src = source
        self.preview_w = preview_w
        self.cfg = {"hands": set(args.hands.split(",")) if args.hands else set(),
                    "body": set(args.body.split(",")) if args.body else set(),
                    "every": args.every, "cropk": args.cropk, "mirror": bool(args.mirror)}
        self.runners = {}
        self.zed = ZedRunner() if source.name in ("zed", "rec") else None
        self.lock = threading.Lock()
        self.latest_jpg = None
        self.latest_frame = None
        self.seq = 0
        self.cond = threading.Condition()
        self.fps = 0.0
        self.rec = None                   # {"dir", "n", "log", "t0"}
        self.rec_lock = threading.Lock()
        self.frame_results = {}           # model -> last rec, for the recording log
        self.snapshot_req = None
        self._sync_runners()

    def _sync_runners(self):
        want = {(n, "hand") for n in self.cfg["hands"] if n in HAND_MODELS} | \
               {(n, "body") for n in self.cfg["body"] if n in BODY_MODELS}
        for (n, kind) in want:
            if n not in self.runners:
                r = Runner(n, kind, self)
                self.runners[n] = r
                r.start()
        for n in list(self.runners):
            if (n, self.runners[n].kind) not in want:
                self.runners[n].stop = True
                del self.runners[n]

    def set(self, q):
        if "hands" in q:
            self.cfg["hands"] = {s for s in q["hands"][0].split(",") if s}
        if "body" in q:
            self.cfg["body"] = {s for s in q["body"][0].split(",") if s}
        if "every" in q:
            self.cfg["every"] = max(1, int(q["every"][0]))
        if "cropk" in q:
            self.cfg["cropk"] = min(3.0, max(0.5, float(q["cropk"][0])))
        if "mirror" in q:
            self.cfg["mirror"] = q["mirror"][0] in ("1", "true")
        self._sync_runners()
        return self.status()

    def on_result(self, name, rec):
        self.frame_results[name] = rec

    def status(self):
        st = {"ok": True, "source": self.src.info(), "fps": self.fps,
              "cfg": {**self.cfg, "hands": sorted(self.cfg["hands"]), "body": sorted(self.cfg["body"])},
              "available": {"hands": list(HAND_MODELS), "body": (["zed"] if self.zed else []) + list(BODY_MODELS)},
              "venv": venv_python() is not None,
              "models": {n: {"loading": r.loading, "error": r.error} for n, r in self.runners.items()},
              "recording": {"dir": self.rec["dir"], "frames": self.rec["n"],
                            "seconds": round(time.monotonic() - self.rec["t0"], 1)} if self.rec else None}
        return st

    def metrics(self):
        out = [r.metrics() for r in self.runners.values()]
        if self.zed:
            out.insert(0, self.zed.metrics())
        return {"t": time.time(), "fps": self.fps, "models": out, "status": self.status()}

    # --- recording ---
    def record(self, start):
        with self.rec_lock:
            if start and not self.rec:
                d = os.path.join(REC_DIR, datetime.now().strftime("%Y-%m-%d_%H%M%S"))
                os.makedirs(os.path.join(d, "frames"), exist_ok=True)
                json.dump({"source": self.src.info(), "cfg": {**self.cfg, "hands": sorted(self.cfg["hands"]),
                           "body": sorted(self.cfg["body"])}, "started": datetime.now().isoformat()},
                          open(os.path.join(d, "meta.json"), "w"), indent=1)
                self.rec = {"dir": d, "n": 0, "log": open(os.path.join(d, "log.jsonl"), "w"), "t0": time.monotonic()}
            elif not start and self.rec:
                self.rec["log"].close()
                d = self.rec["dir"]
                self.rec = None
                return d
        return self.rec["dir"] if self.rec else None

    def _log_frame(self, frame, crops, primary):
        with self.rec_lock:
            if not self.rec:
                return
            r = self.rec
            fn = f"{frame.n:07d}.jpg"
            cv2.imwrite(os.path.join(r["dir"], "frames", fn), frame.bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
            line = {"n": frame.n, "t_ms": frame.t_ms, "file": fn, "crops": crops,
                    "zed": frame.zed, "models": {}}
            for name, rec in self.frame_results.items():
                line["models"][name] = {k: v for k, v in rec.items() if k != "world"}
            r["log"].write(json.dumps(line) + "\n")
            r["n"] += 1

    # --- the main loop ---
    def loop(self):
        n, t0 = 0, time.perf_counter()
        while True:
            frame = self.src.read()
            if frame is None:
                time.sleep(0.01)
                continue
            n += 1
            H, W = frame.bgr.shape[:2]
            if self.zed:
                self.zed.push(frame)
            # where the hands are: the ZED's body first, else a body model's wrists,
            # else where a hand model last saw them
            primary = frame.zed[0] if frame.zed else None
            crops, boxes = {}, []
            if primary:
                crops = {s: (c[0], c[1], c[2] * self.cfg["cropk"]) for s, c in primary["crops"].items()} if primary.get("crops") else crops_from_lm(primary["lm"], W, self.cfg["cropk"])
                boxes = [primary["box"]] if primary.get("box") else []
            else:
                for name in ("yolo", "vitpose"):
                    r = self.runners.get(name)
                    if r and r.result and r.result.get("people") and time.monotonic() - r.at < 1.0:
                        p = max(r.result["people"], key=lambda p: len(p["lm"]))
                        crops = crops_from_lm(p["lm"], W, self.cfg["cropk"])
                        boxes = [p["box"]] if p.get("box") else []
                        break
                if not crops:
                    for r in self.runners.values():
                        if r.kind == "hand" and r.result and r.result.get("hands") and time.monotonic() - r.at < 1.0:
                            k = W / REF_WIDTH
                            for side, h in r.result["hands"].items():
                                pts = np.asarray(h["pts"])
                                c = pts.mean(axis=0)
                                span = float(np.ptp(pts, axis=0).max()) * 2.2
                                crops[side] = (float(c[0]), float(c[1]), min(max(span, 150 * k), 460 * k))
                            break
            if n % self.cfg["every"] == 0:
                for r in self.runners.values():
                    if r.kind == "hand" and crops:
                        r.submit(frame, crops, boxes)
                    elif r.kind == "body":
                        r.submit(frame, crops, boxes)
            self._log_frame(frame, crops, primary)
            jpg = self.draw(frame, crops)
            with self.cond:
                self.latest_jpg, self.latest_frame = jpg, frame
                self.seq += 1
                self.cond.notify_all()
            if n % 30 == 0:
                t1 = time.perf_counter()
                self.fps = round(30 / (t1 - t0), 1)
                t0 = t1

    # --- drawing ---
    def draw(self, frame, crops):
        H, W = frame.bgr.shape[:2]
        k = self.preview_w / W
        vis = cv2.resize(frame.bgr, (self.preview_w, int(H * k)))

        def P(x, y):
            return (int(x * k), int(y * k))

        def skel(lm, col, thick=2):
            for a, b in ARM_BONES:
                if a in lm and b in lm:
                    cv2.line(vis, P(*lm[a][:2]), P(*lm[b][:2]), col, thick)
            for i, p in lm.items():
                cv2.circle(vis, P(*p[:2]), 4, col, -1)

        bodies = []
        if self.zed:
            for z in (frame.zed or []):
                skel(z["lm"], COLS["zed"], 3)
            bodies.append("zed")
        for name, r in self.runners.items():
            if r.kind == "body" and r.result and time.monotonic() - r.at < 1.0:
                for p in r.result.get("people", []):
                    skel(p["lm"], COLS[name], 2)
                bodies.append(name)
        for side, (cx, cy, size) in crops.items():
            x0, y0 = P(cx - size / 2, cy - size / 2)
            x1, y1 = P(cx + size / 2, cy + size / 2)
            cv2.rectangle(vis, (x0, y0), (x1, y1), (90, 90, 110), 1)
        strip = []
        for name, r in self.runners.items():
            if r.kind != "hand" or not r.result or time.monotonic() - r.at > 1.0:
                continue
            for side, h in r.result.get("hands", {}).items():
                pts = np.asarray(h["pts"])
                for a, b in BONES:
                    cv2.line(vis, P(*pts[a]), P(*pts[b]), COLS[name], 2)
                for i, p in enumerate(pts):
                    cv2.circle(vis, P(*p), 3, (255, 255, 255) if i in (4, 8) else COLS[name], -1)
            # the crop thumbnails: what each hand model actually saw
            for side, crop in crops.items():
                sub, x0, y0 = cut(frame.bgr, crop)
                if sub.size == 0:
                    continue
                th = cv2.resize(sub, (160, 160))
                s = 160.0 / sub.shape[1]
                h = r.result.get("hands", {}).get(side)
                if h:
                    pts = (np.asarray(h["pts"]) - [x0, y0]) * s
                    for a, b in BONES:
                        cv2.line(th, tuple(pts[a].astype(int)), tuple(pts[b].astype(int)), COLS[name], 1)
                    txt = f"c{h['curl']:.2f}" if h["curl"] is not None else ""
                else:
                    txt = "none"
                cv2.rectangle(th, (0, 0), (159, 159), COLS[name], 2)
                cv2.putText(th, f"{name[:4]} {side[0].upper()} {txt}", (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
                strip.append(th)
        if self.cfg["mirror"]:
            vis = cv2.flip(vis, 1)
        if strip:
            bar = np.hstack(strip)
            if bar.shape[1] < vis.shape[1]:
                bar = np.hstack([bar, np.zeros((160, vis.shape[1] - bar.shape[1], 3), np.uint8)])
            else:
                bar = bar[:, :vis.shape[1]]
            vis = np.vstack([vis, bar])
        y = 22
        cv2.putText(vis, f"{self.src.name} {W}x{H} {self.fps} fps", (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (240, 240, 240), 2)
        for name in bodies + [n for n, r in self.runners.items() if r.kind == "hand"]:
            y += 22
            r = self.runners.get(name)
            st = "loading" if (r and r.loading) else (f"{r.result.get('ms', 0):.0f} ms" if r and r.result else "")
            cv2.putText(vis, f"{name} {st}", (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLS.get(name, (200, 200, 200)), 2)
        if self.rec:
            cv2.circle(vis, (vis.shape[1] - 24, 22), 8, (60, 60, 230), -1)
            cv2.putText(vis, f"REC {self.rec['n']}", (vis.shape[1] - 120, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (60, 60, 230), 2)
        if self.snapshot_req:
            cv2.imwrite(self.snapshot_req, vis)
            self.snapshot_req = None
        ok, enc = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return enc.tobytes() if ok else None


LAB = None


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass          # a browser closing the MJPEG or SSE stream is not an error worth a traceback


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/status":
            self._json(LAB.status())
        elif u.path == "/set":
            self._json(LAB.set(q))
        elif u.path == "/zed":
            if LAB.src.name != "zed":
                self._json({"ok": False, "error": "the source is not the ZED"})
            else:
                args = {k: q[k][0] for k in ("model", "depth", "res", "fps", "fitting") if k in q}
                threading.Thread(target=LAB.src.reconfigure, kwargs=args, daemon=True).start()
                time.sleep(0.2)
                self._json({"ok": True, "state": LAB.src.state})
        elif u.path == "/use":
            # the choice for the game: tools/tracking_config.json, read by zed_bridge.py at start
            cfg = {}
            if os.path.exists(CONFIG_PATH):
                try:
                    cfg = json.load(open(CONFIG_PATH))
                except Exception:
                    cfg = {}
            if LAB.src.name == "zed":
                cfg["zed"] = {k: LAB.src.P[k] for k in ("res", "fps", "depth", "model")}
                cfg["zed"]["fitting"] = bool(LAB.src.P.get("fitting", True))
            if q.get("hand"):
                cfg["hand_model"] = q["hand"][0]
            cfg["saved"] = datetime.now().isoformat(timespec="seconds")
            json.dump(cfg, open(CONFIG_PATH, "w"), indent=1)
            self._json({"ok": True, "config": cfg, "path": CONFIG_PATH})
        elif u.path == "/config":
            cfg = json.load(open(CONFIG_PATH)) if os.path.exists(CONFIG_PATH) else {}
            self._json({"config": cfg, "path": CONFIG_PATH})
        elif u.path == "/record":
            if q.get("start"):
                self._json({"ok": True, "dir": LAB.record(True)})
            else:
                self._json({"ok": True, "dir": LAB.record(False)})
        elif u.path == "/recordings":
            dirs = sorted(os.listdir(REC_DIR)) if os.path.isdir(REC_DIR) else []
            out = []
            for d in dirs:
                p = os.path.join(REC_DIR, d)
                rep = os.path.join(p, "report.md")
                try:
                    nf = sum(1 for _ in open(os.path.join(p, "log.jsonl")))
                except OSError:
                    nf = 0
                out.append({"dir": d, "frames": nf, "report": open(rep).read() if os.path.exists(rep) else None})
            self._json({"recordings": out})
        elif u.path == "/snapshot":
            os.makedirs(REC_DIR, exist_ok=True)
            p = os.path.join(LAB.rec["dir"] if LAB.rec else REC_DIR,
                             datetime.now().strftime("snap_%Y-%m-%d_%H%M%S.png"))
            LAB.snapshot_req = p
            self._json({"ok": True, "file": p})
        elif u.path == "/stream":
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            try:
                while True:
                    self.wfile.write(b"data: " + json.dumps(LAB.metrics()).encode() + b"\n\n")
                    self.wfile.flush()
                    time.sleep(0.25)
            except (BrokenPipeError, ConnectionError, OSError):
                pass
        elif u.path == "/video.mjpg":
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.end_headers()
            seen = 0
            try:
                while True:
                    with LAB.cond:
                        LAB.cond.wait_for(lambda: LAB.seq > seen, timeout=1.0)
                        seen, jpg = LAB.seq, LAB.latest_jpg
                    if jpg is None:
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n" + f"Content-Length: {len(jpg)}\r\n\r\n".encode())
                    self.wfile.write(jpg + b"\r\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionError, OSError):
                pass
        else:
            self._json({"error": "not found"}, 404)


def main():
    global LAB
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="zed", help="zed | cam:N | file:PATH | rec:DIR")
    ap.add_argument("--profile", default="fast", help="ZED profile from zed_bridge.PROFILES")
    ap.add_argument("--res", default=None, help="ZED size override: HD2K|HD1080|HD720|VGA")
    ap.add_argument("--fps", type=int, default=None)
    ap.add_argument("--hands", default="mediapipe,wilor", help="hand models to start with (comma list, or '')")
    ap.add_argument("--body", default="", help="body models to start with: yolo,vitpose")
    ap.add_argument("--every", type=int, default=1, help="run the models every Nth frame")
    ap.add_argument("--cropk", type=float, default=1.0, help="scale the wrist crop")
    ap.add_argument("--mirror", type=int, default=None, help="1 mirror like the game (default for the ZED and a webcam), 0 as recorded (default for a file or a recording)")
    ap.add_argument("--preview-width", type=int, default=960)
    ap.add_argument("--port", type=int, default=8326)
    args = ap.parse_args()

    if args.source == "zed":
        src = ZedSource(args.profile, args.res, args.fps)
    elif args.source.startswith("rec:"):
        src = RecSource(args.source[4:])
    else:
        src = CamSource(args.source)
    if args.mirror is None:
        args.mirror = 1 if src.name in ("zed", "cam") else 0
    print(f"source: {src.info()}")
    if venv_python() is None:
        print("  no tools/.venv-hands: only the MediaPipe hand model can run (tools/setup_hands_env.cmd makes the venv)")
    LAB = Lab(src, args.preview_width, args)
    threading.Thread(target=LAB.loop, daemon=True).start()
    server = Server(("127.0.0.1", args.port), Handler)
    print(f"tracking lab up: http://localhost:{args.port}/status  -> open http://localhost:8321/tools/tracking-lab.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for r in LAB.runners.values():
            r.stop = True
        src.close()


if __name__ == "__main__":
    main()

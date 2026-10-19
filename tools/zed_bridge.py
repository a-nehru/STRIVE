"""
STRIVE ZED bridge: streams ZED SDK body tracking into the browser game.

The game is a static web app and cannot reach the ZED SDK directly, so this
script is the adapter: it opens the ZED 2, runs the SDK's depth-based body
tracking (BODY_38), converts each skeleton to the MediaPipe 33-landmark
layout the game's tracker already consumes, and serves it on localhost:

    GET /status      -> {"ok": true, "w": .., "h": .., "profile": ..}
    GET /stream      -> Server-Sent Events, one JSON skeleton per frame
    GET /video.mjpg  -> MJPEG preview of the left eye (the game's mirror)
    GET /relock      -> forget the seat assignment and re-seat on the next frame
    GET /select?id=N -> pin seat 0 to that tracking id (staff clicked a person);
                        &seat=S for another seat, ?clear=1 to let it float again

Each streamed skeleton carries "lm" (normalized 2D, the layout the game's
tracker consumes) and "lm3" (the same joints in METRES, camera frame: x
right, y down, z forward). The metric channel is what the assessment turns
into a real workspace volume - a webcam cannot produce it, so the game
reports area only when it is absent rather than guessing at depth.

Who is a player at all is decided FIRST by where they are standing in the
room: only bodies inside the play volume (--play-near/--play-far metres of
depth, --play-width metres wide about the camera axis) are candidates, so a
therapist standing behind the patient is never in the running whatever the
detector thinks. Among those, seats are assigned by where people STAND, not
by detection confidence - seat 0 is the left-most person in the image at lock
time, seat 1 the right-most - and then followed by ZED tracking id. Ranking
by confidence would hand the paddle to the other player mid-rally every time
someone turned or was briefly occluded. A seat survives its person vanishing
for --seat-grace seconds (walking behind each other).

Someone who fully leaves and returns is a NEW tracking id, so ids alone can
never give them their seat back. A build signature does: biacromial width,
torso length and height, all in metres from depth, EMA-smoothed per seat and
matched within --sig-tol when a free seat is refilled. That is deliberately
not face recognition - it needs no extra model, stores no biometrics, and
still separates the two or three people who are actually in a therapy room.

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
import math
import os
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

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
# 30 fps, not 60: at 60 the sensor may never expose longer than ~16 ms, so in
# a ward without studio light the picture comes out dark and flat and the auto
# gain adds noise on top. Body tracking does not need 60 samples a second and
# the depth pipeline does not run that fast anyway. --fps overrides.
PROFILES = {
    "fast":     dict(res="HD720", fps=30, depth="NEURAL_LIGHT", model="HUMAN_BODY_MEDIUM", fp16=True),
    "balanced": dict(res="HD720", fps=30, depth="NEURAL", model="HUMAN_BODY_ACCURATE", fp16=False),
}

# The ZED's picture is deliberately flat out of the box: its ISP defaults are
# tuned for matching pixels between the two eyes, not for a mirror a patient
# looks at, and unlike a webcam driver it lifts nothing. These are the SDK's
# post-processing settings (they sit on top of auto exposure), nudged so a
# person under ward lighting looks like a person. Ranges: brightness and
# contrast 0-8 (default 4), gamma 1-9 (default 8).
PICTURE_DEFAULTS = dict(brightness=6, contrast=5, gamma=9)


def apply_picture(zed, brightness, contrast, gamma, exposure=None, gain=None):
    """Push the picture settings and print what the camera reports back, so
    a dull image is a number on the console rather than a guess."""
    wanted = {"BRIGHTNESS": brightness, "CONTRAST": contrast, "GAMMA": gamma}
    if exposure is not None:              # manual exposure turns auto (AEC/AGC) off
        wanted["EXPOSURE"] = exposure
        wanted["GAIN"] = gain
    got = []
    for name, value in wanted.items():
        key = getattr(sl.VIDEO_SETTINGS, name, None)
        if key is None or value is None:
            continue
        zed.set_camera_settings(key, int(value))
        try:
            back = zed.get_camera_settings(key)
            back = back[1] if isinstance(back, tuple) else back
        except Exception:
            back = "?"
        got.append(f"{name.lower()} {back}")
    print("  picture: " + ", ".join(got) + ("" if exposure is not None else "  (auto exposure)"))


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
    shoulders = (int(members["LEFT_SHOULDER"].value),
                 int(members["RIGHT_SHOULDER"].value))
    return table, shoulders


def sig_distance(a, b):
    """Mean relative difference between two build signatures, or None."""
    if not a or not b:
        return None
    diffs = [abs(x - y) / max(x, y) for x, y in zip(a, b)
             if x is not None and y is not None and max(x, y) > 1e-6]
    return sum(diffs) / len(diffs) if diffs else None


class Seats:
    """Stable player slots over unstable detections.

    Holds seat -> ZED tracking id. Ids are followed frame to frame, so a
    player keeps their paddle even when the other person is momentarily the
    better detection. An empty seat waits `grace` seconds before it accepts
    somebody new, which covers occlusion without swapping players.

    Each seat also remembers a build signature (biacromial width, torso
    length, height - metres, EMA-smoothed). Tracking ids do not survive a
    person leaving the room; the signature does, so the patient gets their own
    seat back on the way in instead of whichever seat happened to be free.
    """

    def __init__(self, n, grace=2.5, sig_tol=0.10):
        self.n = n
        self.grace = grace
        self.sig_tol = sig_tol
        self.ids = [None] * n            # seat -> tracking id
        self.lost_at = [0.0] * n         # when the seat's id was last seen
        self.sigs = [None] * n           # seat -> build signature
        # a seat staff picked by hand (GET /select). It follows that person
        # and, once they are gone, refills only by build signature or when
        # they are the only person in view - never by who stands left-most,
        # so a visitor walking into the ward cannot take the patient's seat.
        self.sticky = [False] * n

    def reset(self):
        self.ids = [None] * self.n
        self.lost_at = [0.0] * self.n
        self.sigs = [None] * self.n
        self.sticky = [False] * self.n

    def pin(self, seat, body_id, now):
        """Staff chose this person for this seat (a click in the game)."""
        if not 0 <= seat < self.n:
            return False
        for s in range(self.n):          # nobody holds two seats
            if s != seat and self.ids[s] == body_id:
                self.ids[s] = None
        self.ids[seat] = int(body_id)
        self.lost_at[seat] = now
        self.sigs[seat] = None           # relearn the build from this person
        self.sticky[seat] = True
        return True

    def unpin(self, seat):
        if 0 <= seat < self.n:
            self.sticky[seat] = False

    @property
    def pinned_ids(self):
        return {i for i, st in zip(self.ids, self.sticky) if st and i is not None}

    def _take(self, s, body, now):
        self.ids[s] = int(body.id)
        self.lost_at[s] = now

    def _remember(self, s, sig):
        """Blend this frame's build into the seat's signature (EMA)."""
        if sig is None:
            return
        old = self.sigs[s]
        if old is None:
            self.sigs[s] = sig
            return
        self.sigs[s] = tuple(
            n if o is None else (o if n is None else o + (n - o) * 0.05)
            for o, n in zip(old, sig))

    def assign(self, bodies, x_of, now, sig_of=None):
        """Return a seat-length list of bodies (None where the seat is empty).

        `bodies` has already been filtered to the play volume by the caller,
        so anyone outside it is not a candidate for any seat.
        """
        by_id = {int(b.id): b for b in bodies if getattr(b, "id", -1) is not None}

        seated = [by_id.get(i) if i is not None else None for i in self.ids]
        for s, body in enumerate(seated):
            if body is not None:
                self.lost_at[s] = now
                if sig_of is not None:
                    self._remember(s, sig_of(body))
            elif self.ids[s] is not None and now - self.lost_at[s] > self.grace:
                self.ids[s] = None       # gone long enough: free the seat

        free_bodies = [b for b in by_id.values() if int(b.id) not in self.ids]
        free_seats = [s for s in range(self.n) if self.ids[s] is None]
        if not free_bodies or not free_seats:
            return seated

        # first chance goes to whoever matches the seat's remembered build:
        # the patient walking back in should get their own paddle back, not
        # the seat that happens to be empty
        if sig_of is not None:
            for s in list(free_seats):
                want = self.sigs[s]
                if want is None:
                    continue
                best, best_d = None, self.sig_tol
                for b in free_bodies:
                    d = sig_distance(want, sig_of(b))
                    if d is not None and d < best_d:
                        best, best_d = b, d
                if best is not None:
                    self._take(s, best, now)
                    seated[s] = best
                    free_bodies.remove(best)
                    free_seats.remove(s)

        # anyone left: left-most person takes the left-most free seat, so
        # seating follows where people stand and is predictable to the room.
        # A sticky seat waits instead, unless there is exactly one person
        # in view (the SDK hands a returning person a fresh id, so a lone
        # body is almost certainly them coming back).
        free_bodies.sort(key=x_of)
        lone = len(bodies) == 1
        free_seats = [s for s in free_seats if not self.sticky[s] or lone]
        for s, body in zip(free_seats, free_bodies):
            self._take(s, body, now)
            if sig_of is not None:
                self._remember(s, sig_of(body))
            seated[s] = body
        return seated


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
SEATS = None     # set in main(); the Seats instance the capture thread uses


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
        elif self.path.startswith("/select"):
            # GET /select?id=N[&seat=S] pins a person to a seat (default 0);
            # GET /select?clear=1[&seat=S] lets the seat float again.
            q = parse_qs(urlparse(self.path).query)
            seat = int(q.get("seat", ["0"])[0])
            ok = False
            if SEATS is not None:
                if q.get("clear"):
                    SEATS.unpin(seat)
                    SEATS.ids[seat] = None
                    ok = True
                elif q.get("id"):
                    ok = SEATS.pin(seat, int(q["id"][0]), time.monotonic())
            body = json.dumps({"ok": ok, "seat": seat}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/relock"):
            if SEATS is not None:
                SEATS.reset()
            body = b'{"ok": true}'
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


# CAMERA ROLL (Sep 2026, by request): a ZED clamped a few degrees off level
# tilts the whole picture, and with it the trunk the posture coach watches
# and the y-up frame the assessment measures in. The camera's own IMU says
# which way gravity is, so the 2D skeleton, the people markers and the
# preview are all rotated about the image centre to put gravity straight
# down before they leave the bridge. Only the roll (about the optical axis)
# is corrected: pitch and yaw do not tilt a person in the picture. The 3D
# keypoints are left alone: positional tracking is on with the SDK's default
# gravity-aligned world origin, so they are already expressed upright.
class Tilt:
    """The camera's roll, from the IMU, smoothed; phi > 0 = the camera is
    rolled clockwise as seen from behind it, so the scene must be turned
    clockwise on screen by phi to level it."""
    MAX_DEG = 30.0        # beyond this something else is wrong; do not "correct"
    DEAD_DEG = 0.4        # a level camera stays untouched

    def __init__(self, mode):
        self.mode = mode              # "auto" | "off" | fixed degrees
        self.phi = 0.0                # radians, smoothed
        self.raw = None
        self.sensors = None
        if mode not in ("auto", "off"):
            self.phi = math.radians(float(mode))

    def update(self, zed):
        if self.mode != "auto":
            return
        try:
            if self.sensors is None:
                self.sensors = sl.SensorsData()
            if zed.get_sensors_data(self.sensors, sl.TIME_REFERENCE.CURRENT) != sl.ERROR_CODE.SUCCESS:
                return
            acc = list(self.sensors.get_imu_data().get_linear_acceleration())
        except Exception:
            return
        if len(acc) < 2 or not all(math.isfinite(v) for v in acc[:2]):
            return
        # the accelerometer reports specific force (gravity points the other
        # way); either sign lands on the same roll once y is made positive
        # (image frame: y down)
        gx, gy = (acc[0], acc[1]) if acc[1] >= 0 else (-acc[0], -acc[1])
        if math.hypot(gx, gy) < 2.0:           # camera pointing nearly straight down: roll is meaningless
            return
        raw = math.atan2(gx, gy)
        if abs(raw) > math.radians(self.MAX_DEG):
            return
        self.raw = raw
        # slow: a knock to the tripod settles in a couple of seconds, a
        # frame of vibration moves nothing
        self.phi += (raw - self.phi) * 0.02

    @property
    def active(self):
        return self.mode != "off" and abs(self.phi) > math.radians(self.DEAD_DEG)

    @property
    def deg(self):
        return round(math.degrees(self.phi), 2)

    def rot(self):
        """(cos, sin) for the clockwise-on-screen turn that levels the picture, or None."""
        if not self.active:
            return None
        return math.cos(self.phi), math.sin(self.phi)


TILT = None


# --- GRASP: the MediaPipe hand model on a crop around each ZED wrist ---------
# (Sep 2026, by request: the way tools/zed_track.py does it.) BODY_38's four
# hand points are too coarse to call open/close, so the 21-point hand model
# runs here, one VIDEO-mode landmarker per side on a square crop of the
# full-resolution left image centred just past that side's wrist. The crop
# is what makes it work at ward distances: a hand 4 m away is a few dozen
# pixels in the frame, far too small for the detector on a whole picture,
# but filling a 150-460 px crop it tracks fine. The curl (the game's own
# handCurl: mean fingertip-to-wrist over palm length) is measured on the
# model's WORLD landmarks (metric, hand-centred 3D) so a hand turned edge-on
# does not foreshorten into a fist. It all runs in a thread of its own so
# the grab loop never waits for it; the payload carries the freshest result.
HAND_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
                  "hand_landmarker/float16/1/hand_landmarker.task")
HAND_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models",
                               "hand_landmarker.task")
MP_TIPS = (8, 12, 16, 20)
HAND_FRESH_S = 0.35        # a result older than this is not sent


def mp_curl(world):
    w = world[0]
    palm = math.dist(world[9], w)
    if palm < 0.02:
        return None
    return sum(math.dist(world[i], w) for i in MP_TIPS) / 4 / palm


class HandWorker(threading.Thread):
    def __init__(self, model_path=HAND_MODEL_PATH):
        super().__init__(daemon=True)
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        if not os.path.exists(model_path):
            import requests
            print(f"  downloading the MediaPipe hand model (7.8 MB) to {model_path}")
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            r = requests.get(HAND_MODEL_URL, timeout=120)
            r.raise_for_status()
            open(model_path, "wb").write(r.content)
        self.mp = mp

        def make():
            opts = vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=model_path),
                running_mode=vision.RunningMode.VIDEO, num_hands=1,
                min_hand_detection_confidence=0.5, min_tracking_confidence=0.5)
            return vision.HandLandmarker.create_from_options(opts)
        self.lm = {"left": make(), "right": make()}
        self.t_ms = {"left": 0, "right": 0}
        self.cv = threading.Condition()
        self.job = None
        self.result = {"hands": [], "at": 0.0}
        self.ms = 0.0

    def submit(self, bgra, crops, t_ms):
        """Latest frame wins: a job not yet started is simply replaced."""
        with self.cv:
            self.job = (bgra, crops, t_ms)
            self.cv.notify()

    def latest(self):
        r = self.result
        return r["hands"] if time.monotonic() - r["at"] < HAND_FRESH_S else []

    def run(self):
        while True:
            with self.cv:
                while self.job is None:
                    self.cv.wait()
                bgra, crops, t_ms = self.job
                self.job = None
            t0 = time.perf_counter()
            H, W = bgra.shape[:2]
            hands = []
            for side, (cx, cy, size) in crops.items():
                size = int(size)
                x0 = int(min(max(cx - size / 2, 0), max(W - size, 0)))
                y0 = int(min(max(cy - size / 2, 0), max(H - size, 0)))
                crop = bgra[y0:y0 + size, x0:x0 + size]
                if crop.size == 0:
                    continue
                try:
                    rgb = cv2.cvtColor(np.ascontiguousarray(crop), cv2.COLOR_BGRA2RGB)
                    img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb)
                    ts = max(int(t_ms), self.t_ms[side] + 1)      # must strictly increase
                    self.t_ms[side] = ts
                    res = self.lm[side].detect_for_video(img, ts)
                except Exception:
                    continue
                if not res.hand_landmarks:
                    continue
                h, w = crop.shape[:2]
                pts = [(x0 + p.x * w, y0 + p.y * h) for p in res.hand_landmarks[0]]
                curl = None
                if getattr(res, "hand_world_landmarks", None):
                    curl = mp_curl([(p.x, p.y, p.z) for p in res.hand_world_landmarks[0]])
                hands.append({"side": side, "px": pts, "curl": curl})
            self.ms = (time.perf_counter() - t0) * 1000
            self.result = {"hands": hands, "at": time.monotonic()}


def hand_crops(body, table, shoulders):
    """Where to look for each hand: a square about the wrist, nudged towards
    the fingertips, sized by the shoulder width in pixels."""
    kp2 = np.asarray(body.keypoint_2d, dtype=float)
    a, b = kp2[shoulders[0]], kp2[shoulders[1]]
    shw = math.hypot(a[0] - b[0], a[1] - b[1]) if np.isfinite(a).all() and np.isfinite(b).all() else None
    size = min(max(1.15 * shw if shw else 260, 150), 460)
    crops = {}
    for side, wi, ti in (("left", 15, 19), ("right", 16, 20)):
        w = kp2[table[wi][0]]
        if not np.isfinite(w).all():
            continue
        cx, cy = float(w[0]), float(w[1])
        t = kp2[table[ti][0]]
        if np.isfinite(t).all():
            cx, cy = cx + 0.55 * (float(t[0]) - cx), cy + 0.55 * (float(t[1]) - cy)
        crops[side] = (cx, cy, size)
    return crops


HANDS = None


def level_px(x, y, res_w, res_h, rot):
    """Turn a pixel point about the image centre by the tilt correction."""
    if rot is None:
        return x, y
    c, s_ = rot
    cx, cy = res_w / 2.0, res_h / 2.0
    dx, dy = x - cx, y - cy
    return cx + dx * c - dy * s_, cy + dx * s_ + dy * c


def body_to_lm(body, table, res_w, res_h):
    """One BODY_38 skeleton -> the game's 33-landmark normalized layout,
    levelled for the camera's roll (see Tilt)."""
    kp2 = np.asarray(body.keypoint_2d, dtype=float)
    conf = np.asarray(getattr(body, "keypoint_confidence", []), dtype=float)
    rot = TILT.rot() if TILT is not None else None
    lm = [[0.0, 0.0, 0.0]] * 33
    for mp_i, candidates in table.items():
        for zi in candidates:
            if zi < len(kp2) and np.isfinite(kp2[zi]).all():
                vis = float(conf[zi]) / 100.0 if zi < len(conf) and np.isfinite(conf[zi]) else 1.0
                px, py = level_px(kp2[zi][0], kp2[zi][1], res_w, res_h, rot)
                lm[mp_i] = [round(px / res_w, 5),
                            round(py / res_h, 5),
                            round(max(0.0, min(1.0, vis)), 3)]
                break
    return lm


def body_to_lm3(body, table):
    """The same joints in METRES, camera frame (x right, y down, z forward).

    Zeros mean "not measured" - the game checks for a finite non-zero z before
    it uses a point, so a joint the depth never resolved is skipped rather
    than read as a hand at the camera origin.
    """
    kp3 = np.asarray(body.keypoint, dtype=float)
    lm3 = [[0.0, 0.0, 0.0]] * 33
    for mp_i, candidates in table.items():
        for zi in candidates:
            if zi < len(kp3) and np.isfinite(kp3[zi]).all():
                lm3[mp_i] = [round(float(v), 4) for v in kp3[zi][:3]]
                break
    return lm3


def body_center_3d(body, shoulders):
    """Where this person is standing, in metres, or None."""
    kp3 = np.asarray(body.keypoint, dtype=float)
    li, ri = shoulders
    if kp3.shape[0] > max(li, ri) and np.isfinite(kp3[[li, ri]]).all():
        return (kp3[li] + kp3[ri]) / 2
    pos = np.asarray(getattr(body, "position", []), dtype=float)
    if pos.size == 3 and np.isfinite(pos).all():
        return pos
    return None


def in_play(body, shoulders, near, far, half_w):
    """Is this person inside the play volume (i.e. a candidate at all)?

    Bystanders are excluded by WHERE THEY ARE, before any tracking or
    confidence reasoning gets a chance to prefer them. A body whose 3D
    position cannot be resolved is not excluded - the gate never costs
    somebody their seat because the depth dropped out for a frame.
    """
    c = body_center_3d(body, shoulders)
    if c is None:
        return True
    return near <= float(c[2]) <= far and abs(float(c[0])) <= half_w


def build_signature(body, shoulders, hips):
    """(biacromial, torso, height) in metres - who this is, by build.

    Not a face: no extra model, no biometric stored, and enough to tell the
    two or three people in a therapy room apart when tracking ids reset.
    """
    kp3 = np.asarray(body.keypoint, dtype=float)
    if kp3.size == 0:
        return None
    finite = kp3[np.isfinite(kp3).all(axis=1)]
    height = None
    if len(finite) >= 6:
        height = float(finite[:, 1].max() - finite[:, 1].min())
        if not 0.5 < height < 2.5:
            height = None
    biac = shoulder_width_m(body, shoulders)
    torso = None
    li, ri = shoulders
    hl, hr = hips
    if kp3.shape[0] > max(li, ri, hl, hr) and np.isfinite(kp3[[li, ri, hl, hr]]).all():
        d = float(np.linalg.norm((kp3[li] + kp3[ri]) / 2 - (kp3[hl] + kp3[hr]) / 2))
        torso = d if 0.15 < d < 0.85 else None
    if biac is None and torso is None and height is None:
        return None
    return (biac, torso, height)


def shoulder_width_m(body, shoulders):
    """Biacromial width in meters from the 3D keypoints, or None."""
    kp3 = np.asarray(body.keypoint, dtype=float)
    li, ri = shoulders
    if kp3.shape[0] <= max(li, ri):
        return None
    a, b = kp3[li], kp3[ri]
    if not (np.isfinite(a).all() and np.isfinite(b).all()):
        return None
    d = float(np.linalg.norm(a - b))
    return d if 0.20 < d < 0.75 else None


def image_x(body, shoulders):
    """Where this person stands across the image, for seating."""
    kp2 = np.asarray(body.keypoint_2d, dtype=float)
    li, ri = shoulders
    if kp2.shape[0] > max(li, ri) and np.isfinite(kp2[[li, ri]]).all():
        return float((kp2[li][0] + kp2[ri][0]) / 2)
    finite = kp2[np.isfinite(kp2).all(axis=1)] if kp2.size else kp2
    return float(finite[:, 0].mean()) if len(finite) else 0.0


def capture(zed, rt, run, table, shoulders, res_w, res_h, preview_w, jpeg_every,
            seats, play):
    hips = (table[23][0], table[24][0])
    bodies = sl.Bodies()
    image = sl.Mat()
    image_full = sl.Mat()
    preview_h = int(preview_w * res_h / res_w)
    preview_res = sl.Resolution(preview_w, preview_h)
    n, t0, fps = 0, time.perf_counter(), 0.0
    # real biacromial width per seat (meters, depth), EMA-smoothed: the game
    # uses seat 0's to convert shoulder-width units to real cm with no tape
    shm_ema = [None] * seats.n
    while True:
        if zed.grab(run) != sl.ERROR_CODE.SUCCESS:
            time.sleep(0.002)
            continue
        n += 1
        zed.retrieve_bodies(bodies, rt)
        lm_json = None
        now = time.monotonic()
        if TILT is not None:
            TILT.update(zed)
            if TILT.raw is not None and not getattr(TILT, "announced", False):
                TILT.announced = True
                TILT.phi = TILT.raw            # start on the first reading, not on a fade-in from zero
                print(f"  camera roll from the IMU: {math.degrees(TILT.raw):+.1f} deg"
                      f"{' - levelling the picture and the skeleton' if TILT.active else ' - level enough, no correction'}")
            if n % 30 == 0:
                STATUS["tilt_deg"] = TILT.deg if TILT.active else 0.0
                STATUS["tilt_raw_deg"] = round(math.degrees(TILT.raw), 2) if TILT.raw is not None else None
        # who is even in the running: standing inside the play volume. This
        # runs before seating, so a bystander can never be picked at all.
        # A person staff picked by hand is a candidate wherever they are:
        # the click is the therapist saying "that one", which outranks the
        # volume's guess about who is a bystander.
        pinned = seats.pinned_ids
        candidates = [b for b in bodies.body_list
                      if int(b.id) in pinned
                      or in_play(b, shoulders, play["near"], play["far"], play["half_w"])]
        seated = seats.assign(candidates,
                              lambda b: image_x(b, shoulders), now,
                              lambda b: build_signature(b, shoulders, hips))
        entries = []
        for s, body in enumerate(seated):
            if body is None:
                continue
            entry = {"seat": s, "id": int(body.id),
                     "lm": body_to_lm(body, table, res_w, res_h),
                     "lm3": body_to_lm3(body, table)}
            d = shoulder_width_m(body, shoulders)
            if d is not None:
                shm_ema[s] = d if shm_ema[s] is None else shm_ema[s] + (d - shm_ema[s]) * 0.05
            if shm_ema[s] is not None:
                entry["shm"] = round(shm_ema[s], 4)
            entries.append(entry)

        # everyone in view, seated or not, so the game can draw a marker on
        # each person and let staff click the one to follow. Normalized image
        # coordinates of the shoulder midpoint (unmirrored, like lm) and the
        # shoulder width in the same units for the marker's size.
        seat_of = {e["id"]: e["seat"] for e in entries}
        cand_ids = {int(b.id) for b in candidates}
        people = []
        for b in bodies.body_list:
            lm = body_to_lm(b, table, res_w, res_h)
            L, R = lm[11], lm[12]
            if not (L[2] > 0 and R[2] > 0):
                continue
            c3 = body_center_3d(b, shoulders)
            people.append({"id": int(b.id),
                           "x": round((L[0] + R[0]) / 2, 4), "y": round((L[1] + R[1]) / 2, 4),
                           "sw": round(abs(L[0] - R[0]), 4),
                           "z": round(float(c3[2]), 2) if c3 is not None else None,
                           "seat": seat_of.get(int(b.id)),
                           "play": int(b.id) in cand_ids})
        # the hand model: seat 0's hands, from the full-resolution frame, in
        # the worker thread; its freshest answer rides in the payload with
        # the points levelled and normalised like the skeleton
        hand_payload = None
        if HANDS is not None:
            primary_body = seated[0] if seated and seated[0] is not None else None
            if primary_body is not None and n % 2 == 0:
                crops = hand_crops(primary_body, table, shoulders)
                if crops:
                    zed.retrieve_image(image_full, sl.VIEW.LEFT, sl.MEM.CPU)
                    HANDS.submit(image_full.get_data().copy(), crops, int(now * 1000))
            rot = TILT.rot() if TILT is not None else None
            hand_payload = []
            for h in HANDS.latest():
                pts = []
                for (px, py) in h["px"]:
                    lx, ly = level_px(px, py, res_w, res_h, rot)
                    pts.append([round(lx / res_w, 5), round(ly / res_h, 5)])
                hand_payload.append({"side": h["side"], "pts": pts,
                                     "curl": round(h["curl"], 4) if h["curl"] is not None else None})
            if n % 30 == 0:
                STATUS["hand_ms"] = round(HANDS.ms, 1)
        STATUS["seats"] = [e["id"] for e in entries]
        STATUS["sticky"] = [s for s in range(seats.n) if seats.sticky[s]]
        STATUS["bodies_seen"] = len(bodies.body_list)
        STATUS["bodies_in_play"] = len(candidates)
        STATUS["people"] = people
        if entries or people:
            # seat 0 stays the top-level "lm"/"shm" the single-player game
            # already reads; seat 1+ ride along in "bodies". If seat 0 is
            # empty its paddle waits - player 2 never inherits it.
            payload = {"bodies": entries, "people": people}
            if hand_payload:
                payload["hands"] = hand_payload
            primary = next((e for e in entries if e["seat"] == 0), None)
            if primary is not None:
                payload["lm"] = primary["lm"]
                payload["lm3"] = primary["lm3"]
                if "shm" in primary:
                    payload["shm"] = primary["shm"]
                    STATUS["shoulder_m"] = primary["shm"]
            lm_json = json.dumps(payload).encode()
        best = entries[0] if entries else None

        jpg = None
        if n % jpeg_every == 0:
            zed.retrieve_image(image, sl.VIEW.LEFT, sl.MEM.CPU, preview_res)
            frame = cv2.cvtColor(image.get_data(), cv2.COLOR_BGRA2BGR)
            if TILT is not None and TILT.active:
                # the same clockwise-on-screen turn the landmarks get
                # (OpenCV's angle is counter-clockwise, hence the minus)
                h_, w_ = frame.shape[:2]
                M = cv2.getRotationMatrix2D((w_ / 2.0, h_ / 2.0), -TILT.deg, 1.0)
                frame = cv2.warpAffine(frame, M, (w_, h_), flags=cv2.INTER_LINEAR,
                                       borderMode=cv2.BORDER_CONSTANT, borderValue=(20, 16, 40))
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
                    help="fast = game default (MEDIUM model); balanced = ACCURATE model")
    ap.add_argument("--fps", type=int, choices=[15, 30, 60], default=None,
                    help="camera frame rate (default 30: 60 caps the exposure and "
                         "makes a dim ward look dimmer)")
    ap.add_argument("--port", type=int, default=8322)
    ap.add_argument("--max-range", type=float, default=5.0,
                    help="metres: how far the depth and body tracking look "
                         "(a ward bed can be 4.5 m from the camera)")
    ap.add_argument("--exposure", choices=["fixed", "auto"], default="auto",
                    help="fixed avoids motion blur under good room light")
    ap.add_argument("--exposure-val", type=int, default=45)
    ap.add_argument("--gain", type=int, default=50)
    ap.add_argument("--brightness", type=int, default=PICTURE_DEFAULTS["brightness"],
                    help="0-8, SDK default 4")
    ap.add_argument("--contrast", type=int, default=PICTURE_DEFAULTS["contrast"],
                    help="0-8, SDK default 4")
    ap.add_argument("--gamma", type=int, default=PICTURE_DEFAULTS["gamma"],
                    help="1-9, SDK default 8 (higher lifts the shadows)")
    ap.add_argument("--preview-width", type=int, default=640)
    ap.add_argument("--hands", choices=["auto", "off"], default="auto",
                    help="grasp from the MediaPipe hand model on a crop around each wrist "
                         "(auto: on when the mediapipe package is installed)")
    ap.add_argument("--tilt", default="auto",
                    help="camera roll correction: auto (from the IMU, default), off, "
                         "or a fixed angle in degrees (positive = camera rolled clockwise seen from behind)")
    ap.add_argument("--bodies", type=int, default=1,
                    help="player seats to stream (2 for two-player Pong)")
    ap.add_argument("--seat-grace", type=float, default=2.5,
                    help="seconds a seat is held for a person who vanishes")
    # the play volume: only people standing in here can be players at all.
    # Defaults suit an inpatient ward: the patient may be in a bed or chair
    # anywhere from 1.5 to 4.5 m (5-15 ft) from the camera, so the volume is
    # deep and wide. Seeing them is what matters; a person staff click on in
    # the game is followed wherever they are, volume or not.
    ap.add_argument("--play-near", type=float, default=0.6,
                    help="metres: nearest depth a player may stand")
    ap.add_argument("--play-far", type=float, default=5.0,
                    help="metres: furthest depth a player may stand (anyone "
                         "behind this is a bystander, never a player)")
    ap.add_argument("--play-width", type=float, default=4.0,
                    help="metres: total width of the play volume about the "
                         "camera axis")
    ap.add_argument("--sig-tol", type=float, default=0.10,
                    help="how closely a build must match to reclaim its seat "
                         "(mean relative difference; lower = stricter)")
    args = ap.parse_args()

    P = dict(PROFILES[args.profile])
    if args.fps:
        P["fps"] = args.fps
    table, shoulders = resolve_indexes()

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

    apply_picture(zed, args.brightness, args.contrast, args.gamma,
                  exposure=args.exposure_val if args.exposure == "fixed" else None,
                  gain=args.gain)

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
                   "profile": args.profile, "model": P["model"], "fps": 0,
                   "seats_max": max(1, args.bodies)})

    global SEATS, TILT, HANDS
    SEATS = Seats(max(1, args.bodies), args.seat_grace, args.sig_tol)
    if args.hands == "auto":
        try:
            HANDS = HandWorker()
            HANDS.start()
            print("  grasp: MediaPipe hand model on a crop around each wrist")
        except Exception as e:
            HANDS = None
            print(f"  grasp: hand model unavailable ({e.__class__.__name__}: {e}); "
                  "the game falls back to the ZED fingertips")
    STATUS["hand_model"] = HANDS is not None
    TILT = Tilt(args.tilt)
    # the IMU is read in the capture thread (grabbing here, before it starts,
    # hung the bridge); the first reading is announced from there
    if args.tilt == "off":
        print("  camera roll: correction off")
    elif args.tilt != "auto":
        print(f"  camera roll set by hand: {TILT.deg:+.1f} deg")
    STATUS["tilt_deg"] = TILT.deg if TILT.active else 0.0
    play = {"near": args.play_near, "far": args.play_far,
            "half_w": args.play_width / 2}
    STATUS["play"] = play

    threading.Thread(target=capture,
                     args=(zed, rt, run, table, shoulders, cam.width, cam.height,
                           args.preview_width, 2, SEATS, play),
                     daemon=True).start()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"\nZED bridge up: http://localhost:{args.port}/status "
          f"({P['res']}@{P['fps']} {P['model']}, {SEATS.n} seat"
          f"{'s' if SEATS.n > 1 else ''})")
    print(f"  play volume: {args.play_near:.1f}-{args.play_far:.1f} m deep, "
          f"{args.play_width:.1f} m wide - anyone outside it is a bystander")
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

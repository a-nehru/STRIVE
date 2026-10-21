"""
STRIVE ZED tracker: step one of the rebuild. One window, realtime.

What is on screen is the ZED's LEFT RGB image, mirrored so it behaves like a
mirror. Everything measured comes from the ZED SDK's body tracking, which
fuses both eyes into depth and fits a 3D skeleton (BODY_38): the RGB is for
looking at, the 3D skeleton is for every number.

  * the BODY_38 skeleton drawn over the person
  * per arm: shoulder / elbow / wrist / hand XYZ in metres, camera frame
    (X right, Y down, Z forward from the lens), plus the hand's position
    from the shoulder in the body's own frame (out / up / forward, cm)
  * elbow flexion (0 = straight) and shoulder elevation (0 = arm down,
    180 = overhead) in a plane of elevation (0 = out to the side, 90 =
    straight ahead), named the way a therapist would (abduction, flexion..)
  * grasp OPEN / CLOSED. The ZED's body model carries only four coarse
    fingertip points per hand, so by default the 21-point MediaPipe hand
    model runs on a crop of the RGB image around each ZED wrist and the
    finger curl comes from that; the ZED's own points remain selectable

Two on-screen dropdowns (click them) switch the SDK body model (FAST /
MEDIUM / ACCURATE, live) and the grasp source (MediaPipe hand / ZED
fingertips). The same switches are on keys.

With more than one person in view, everybody gets a thin grey skeleton and a
"click to track" label: click the one you want (or Tab cycles, 0 clears).
The viewer then follows that person by the SDK's tracking id and never hops
to whoever the detector scores higher this frame. If they drop out it waits
rather than swapping, and adopts a lone returning person after a few seconds.

    python tools/zed_track.py                 # live: ZED + SDK required
    python tools/zed_track.py --demo          # synthetic skeleton, no camera
    python tools/zed_track.py --log arm.csv   # plus a CSV of every frame's numbers
    python tools/zed_track.py --model ACCURATE --grasp zed --no-mirror

Keys:  q / Esc quit   m mirror   1 / 2 / 3 left / right / both arms
       Tab next person   0 clear the person   n next body model
       g next grasp source   x xyz labels   c reset grasp   s save a PNG

Only one process can hold the camera: stop zed_bridge.py, zed_view.py and
ZED Explorer first. Run from Windows Python (WSL cannot see the camera).
Requires opencv-python + numpy; pyzed unless --demo; mediapipe for the hand
model (its 7.8 MB file is downloaded into tools/models on first use).
"""

import argparse
import csv
import math
import os
import subprocess
import sys
import time

import cv2
import numpy as np

# --- palette (BGR): the STRIVE night-harbour colours -------------------------
CREAM = (221, 236, 244)
AMBER = (106, 168, 232)
SAGE = (138, 192, 159)
INK = (58, 27, 27)
INK2 = (86, 66, 60)
DIM = (150, 150, 160)
RED = (127, 133, 226)

# --- BODY_38 -----------------------------------------------------------------
# The SDK's joint order (verified against pyzed 5.4). Read back from the enum
# when pyzed is present (ZedSource.names); this list serves --demo.
BODY_38 = [
    "PELVIS", "SPINE_1", "SPINE_2", "SPINE_3", "NECK", "NOSE",
    "LEFT_EYE", "RIGHT_EYE", "LEFT_EAR", "RIGHT_EAR",
    "LEFT_CLAVICLE", "RIGHT_CLAVICLE", "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST",
    "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_BIG_TOE", "RIGHT_BIG_TOE",
    "LEFT_SMALL_TOE", "RIGHT_SMALL_TOE", "LEFT_HEEL", "RIGHT_HEEL",
    "LEFT_HAND_THUMB_4", "RIGHT_HAND_THUMB_4",
    "LEFT_HAND_INDEX_1", "RIGHT_HAND_INDEX_1",
    "LEFT_HAND_MIDDLE_4", "RIGHT_HAND_MIDDLE_4",
    "LEFT_HAND_PINKY_1", "RIGHT_HAND_PINKY_1",
]


def _side_bones(s):
    return [
        (f"{s}_SHOULDER", f"{s}_ELBOW"), (f"{s}_ELBOW", f"{s}_WRIST"),
        (f"{s}_HIP", f"{s}_KNEE"), (f"{s}_KNEE", f"{s}_ANKLE"),
        (f"{s}_ANKLE", f"{s}_HEEL"), (f"{s}_ANKLE", f"{s}_BIG_TOE"),
        (f"{s}_ANKLE", f"{s}_SMALL_TOE"),
        (f"{s}_WRIST", f"{s}_HAND_THUMB_4"), (f"{s}_WRIST", f"{s}_HAND_INDEX_1"),
        (f"{s}_WRIST", f"{s}_HAND_PINKY_1"),
        (f"{s}_HAND_INDEX_1", f"{s}_HAND_MIDDLE_4"),
        (f"{s}_HAND_PINKY_1", f"{s}_HAND_MIDDLE_4"),
        ("NECK", f"{s}_CLAVICLE"), (f"{s}_CLAVICLE", f"{s}_SHOULDER"),
        ("PELVIS", f"{s}_HIP"), ("NOSE", f"{s}_EYE"), (f"{s}_EYE", f"{s}_EAR"),
    ]


BONES = ([("PELVIS", "SPINE_1"), ("SPINE_1", "SPINE_2"), ("SPINE_2", "SPINE_3"),
          ("SPINE_3", "NECK"), ("NECK", "NOSE")]
         + _side_bones("LEFT") + _side_bones("RIGHT"))

# the bones that belong to one arm, drawn heavier when that arm is in focus
ARM_BONES = {s: {b for b in _side_bones(s) if "SHOULDER" in b[0] or "ELBOW" in b[0]
                 or "WRIST" in b[0] or "HAND" in b[0]} for s in ("LEFT", "RIGHT")}
HAND_BONES = {s: {b for b in _side_bones(s) if "HAND" in b[0] or "HAND" in b[1]}
              for s in ("LEFT", "RIGHT")}

# MediaPipe's 21-point hand: 0 wrist, 1-4 thumb, 5-8 index, 9-12 middle,
# 13-16 ring, 17-20 pinky (each finger base -> tip)
MP_HAND_BONES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
                 (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15),
                 (15, 16), (13, 17), (0, 17), (17, 18), (18, 19), (19, 20)]
MP_TIPS = (8, 12, 16, 20)

# --- grasp: the finger curl and its self-calibrating band ---------------------
# curl = mean fingertip-to-wrist distance / palm length (wrist to the middle
# knuckle). About 2.0 for an open hand and about 1.0 for a fist, whatever the
# hand's size or distance, because it is a ratio of two lengths on the same
# hand. The thresholds are the game's own (js/tracker.js, handCurl): closed
# under CURL_CLOSE and open again over CURL_OPEN until enough range has been
# seen, then 35% / 60% into this hand's observed range, so a partial squeeze
# still registers.
CURL_CLOSE, CURL_OPEN = 1.25, 1.55
CURL_CAL_MIN_RANGE = 0.35       # observed hi - lo needed to trust the band
CURL_CAL_DECAY = 0.0004         # envelope forget rate per frame
CLOSE_FRAC, OPEN_FRAC = 0.35, 0.60
# The band must not be poisoned by one wild frame: a single spike to 3.0
# would lift "open" out of reach of a real open hand for minutes and the
# hand would read CLOSED for ever after. So the envelope may only GROW by
# CURL_CAL_GROW per frame (a real new extreme is reached in half a second, a
# one-frame glitch moves it 2%), its span is capped at CURL_CAL_MAX_RANGE
# (real hands span about 1.0), and values outside CURL_PLAUSIBLE are ignored.
CURL_CAL_GROW = 0.02
CURL_CAL_MAX_RANGE = 1.4
CURL_PLAUSIBLE = (0.5, 3.0)

GRASP_SOURCES = ["MediaPipe hand", "ZED fingertips"]
BODY_MODELS = ["HUMAN_BODY_FAST", "HUMAN_BODY_MEDIUM", "HUMAN_BODY_ACCURATE"]
HAND_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
                  "hand_landmarker/float16/1/hand_landmarker.task")
HAND_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models",
                               "hand_landmarker.task")


class Grip:
    """Hysteresis grasp detector with a per-hand self-calibrating band."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.lo = self.hi = None
        self.closed = False
        self.curl = None

    @property
    def trusted(self):
        return self.lo is not None and self.hi - self.lo > CURL_CAL_MIN_RANGE

    def band(self):
        """(close_below, open_above) currently in force."""
        if self.trusted:
            span = self.hi - self.lo
            return self.lo + span * CLOSE_FRAC, self.lo + span * OPEN_FRAC
        return CURL_CLOSE, CURL_OPEN

    def update(self, curl):
        if curl is not None and not (CURL_PLAUSIBLE[0] <= curl <= CURL_PLAUSIBLE[1]):
            curl = None
        self.curl = curl
        if curl is None:
            return self.closed
        if self.lo is None:
            self.lo = self.hi = curl
        # shrink slowly, grow slowly, never wider than a real hand's range
        self.lo = max(min(self.lo + CURL_CAL_DECAY, curl), self.lo - CURL_CAL_GROW)
        self.hi = min(max(self.hi - CURL_CAL_DECAY, curl), self.hi + CURL_CAL_GROW)
        if self.hi - self.lo > CURL_CAL_MAX_RANGE:
            if curl - self.lo < self.hi - curl:
                self.hi = self.lo + CURL_CAL_MAX_RANGE
            else:
                self.lo = self.hi - CURL_CAL_MAX_RANGE
        close, open_ = self.band()
        if self.closed:
            if curl > open_:
                self.closed = False
        elif curl < close:
            self.closed = True
        return self.closed


# --- one person --------------------------------------------------------------
class Skeleton:
    """Joints by name: px (pixels in the camera image), m (metres, camera
    frame) and conf (0..100). A joint the SDK could not resolve is absent
    from px / m rather than present as a zero."""

    def __init__(self, names, kp2, kp3, conf, confidence=0.0, id=-1):
        self.id = int(id)          # the SDK's tracking id: stable while the person stays in view
        self.px, self.m, self.conf = {}, {}, {}
        kp2 = np.asarray(kp2, dtype=float)
        kp3 = np.asarray(kp3, dtype=float)
        conf = np.asarray(conf, dtype=float)
        for i, n in enumerate(names):
            if n is None:
                continue
            if i < len(kp2) and np.isfinite(kp2[i][:2]).all():
                self.px[n] = (float(kp2[i][0]), float(kp2[i][1]))
            if i < len(kp3) and np.isfinite(kp3[i][:3]).all():
                self.m[n] = np.array(kp3[i][:3], dtype=float)
            self.conf[n] = float(conf[i]) if i < len(conf) and np.isfinite(conf[i]) else 0.0
        self.confidence = float(confidence)
        self.hands = {}            # side -> 21 (x, y) image pixels from MediaPipe
        self.hands_world = {}      # side -> 21 (x, y, z) metres, hand-centred

    @classmethod
    def from_sdk(cls, body, names):
        return cls(names, body.keypoint_2d, body.keypoint,
                   getattr(body, "keypoint_confidence", []), body.confidence,
                   getattr(body, "id", -1))


# --- geometry ----------------------------------------------------------------
def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else None


def angle_between(u, v):
    """Degrees between two vectors, or None."""
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6:
        return None
    return math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(u, v)) / (nu * nv)))))


def body_frame(S):
    """The body's own axes in camera coordinates, or None.

    right: shoulder to shoulder, towards the person's right
    up:    hips to shoulders (the SDK's vertical when the hips are missing)
    fwd:   the trunk normal, signed by the nose (it is in front of the
           shoulders on every body) so a person sitting at an angle to the
           camera still reports "in front of me", not "towards the lens"
    """
    shL, shR = S.m.get("LEFT_SHOULDER"), S.m.get("RIGHT_SHOULDER")
    if shL is None or shR is None:
        return None
    right = unit(shR - shL)
    if right is None:
        return None
    mid = (shL + shR) / 2
    hipL, hipR = S.m.get("LEFT_HIP"), S.m.get("RIGHT_HIP")
    up = None
    if hipL is not None and hipR is not None:
        up = mid - (hipL + hipR) / 2
        if np.linalg.norm(up) < 0.05:
            up = None
    if up is None:
        up = np.array([0.0, -1.0, 0.0])           # camera y is DOWN
    up = unit(up - right * float(np.dot(up, right)))
    if up is None:
        return None
    fwd = np.cross(up, right)
    head = S.m.get("NOSE")
    if head is None and "LEFT_EAR" in S.m and "RIGHT_EAR" in S.m:
        head = (S.m["LEFT_EAR"] + S.m["RIGHT_EAR"]) / 2
    ahead = float(np.dot(head - mid, fwd)) if head is not None else 0.0
    if abs(ahead) > 0.02:
        if ahead < 0:
            fwd = -fwd
    elif fwd[2] > 0:                               # no head: assume facing the lens
        fwd = -fwd
    return {"right": right, "up": up, "fwd": fwd, "origin": mid,
            "width": float(np.linalg.norm(shR - shL))}


def zed_curl(S, side):
    """Curl from the ZED's own hand points: |wrist -> middle fingertip| /
    |wrist -> knuckles|, in metres when the depth resolved them (so pointing
    the hand at the camera does not shrink it), else in the image. Coarse -
    BODY_38 fits four points per hand from the body model - but it needs
    nothing else."""
    for P, floor in ((S.m, 0.02), (S.px, 4.0)):
        wr, tip = P.get(f"{side}_WRIST"), P.get(f"{side}_HAND_MIDDLE_4")
        i1, p1 = P.get(f"{side}_HAND_INDEX_1"), P.get(f"{side}_HAND_PINKY_1")
        if wr is None or tip is None or i1 is None or p1 is None:
            continue
        wr, tip, i1, p1 = (np.asarray(v, dtype=float) for v in (wr, tip, i1, p1))
        palm = float(np.linalg.norm((i1 + p1) / 2 - wr))
        if palm < floor:
            continue
        return float(np.linalg.norm(tip - wr)) / palm
    return None


def mp_curl(pts, world=None):
    """Curl from the 21-point hand, as js/tracker.js#handCurl: mean
    fingertip-to-wrist over palm length. Measured on MediaPipe's WORLD
    landmarks (metres, hand-centred, 3D) when they are there, so a hand
    turned edge-on or pointed at the lens does not foreshorten into a
    "fist"; the image points are the fallback."""
    P = world if world else pts
    w = P[0]
    palm = math.dist(P[9], w)
    if palm < (0.02 if world else 4):
        return None
    return sum(math.dist(P[i], w) for i in MP_TIPS) / 4 / palm


def movement_word(plane):
    """The therapist's name for the plane the arm is raised in."""
    if plane is None:
        return "--"
    if plane < -30:
        return "extension"           # behind the trunk
    if plane <= 30:
        return "abduction"           # out to the side
    if plane <= 60:
        return "scaption"            # between side and front
    if plane <= 120:
        return "flexion"             # straight ahead
    return "across"                  # horizontal adduction, across the body


def arm_readout(S, side, F):
    """Everything the panel shows for one arm. Missing values are None.

    The shoulder is described the ISB way: ELEVATION of the upper arm from
    the trunk (0 = hanging, 180 = overhead) in a PLANE of elevation (0 = out
    to the side, 90 = straight ahead, negative = behind). Projected
    "flexion" and "abduction" angles are deliberately not reported: they are
    undefined once the arm is above horizontal in the other plane, where a
    degree of noise flips them between +180 and -180.
    """
    sh, el, wr = S.m.get(f"{side}_SHOULDER"), S.m.get(f"{side}_ELBOW"), S.m.get(f"{side}_WRIST")
    R = {"shoulder": sh, "elbow": el, "wrist": wr,
         "hand": S.m.get(f"{side}_HAND_MIDDLE_4"),
         "elbow_flex": None, "elevation": None, "plane": None, "movement": "--",
         "hand_rel_cm": None}
    if sh is None or el is None or wr is None:
        return R
    interior = angle_between(sh - el, wr - el)
    if interior is not None:
        R["elbow_flex"] = 180.0 - interior
    if F is None:
        return R
    lat_axis = F["right"] if side == "RIGHT" else -F["right"]    # away from the body
    u = el - sh
    n = float(np.linalg.norm(u))
    if n < 1e-4:
        return R
    lat, up, fwd = (float(np.dot(u, lat_axis)), float(np.dot(u, F["up"])),
                    float(np.dot(u, F["fwd"])))
    R["elevation"] = math.degrees(math.acos(max(-1.0, min(1.0, -up / n))))
    if R["elevation"] > 10:                                  # undefined for a hanging arm
        R["plane"] = math.degrees(math.atan2(fwd, lat))      # 0 side, 90 front
    R["movement"] = movement_word(R["plane"])
    w = wr - sh
    R["hand_rel_cm"] = (float(np.dot(w, lat_axis)) * 100, float(np.dot(w, F["up"])) * 100,
                        float(np.dot(w, F["fwd"])) * 100)
    return R


# --- the MediaPipe hand model, run on a crop around each ZED wrist ----------
class MpHands:
    """21-point hands from the RGB image. One landmarker per side in VIDEO
    mode, each fed a square crop centred just past that side's ZED wrist,
    so each tracker sees one steady hand and never has to guess which is
    which. Landmarks come back in full-image pixels."""

    def __init__(self, model_path=HAND_MODEL_PATH):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        if not os.path.exists(model_path):
            self._download(model_path)
        self.mp, self.vision = mp, vision

        def make():
            opts = vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=model_path),
                running_mode=vision.RunningMode.VIDEO, num_hands=1,
                min_hand_detection_confidence=0.5, min_tracking_confidence=0.5)
            return vision.HandLandmarker.create_from_options(opts)
        self.lm = {"LEFT": make(), "RIGHT": make()}
        self.t_ms = {"LEFT": 0, "RIGHT": 0}
        self.ms = 0.0                     # last detection time, for the header

    @staticmethod
    def _download(path):
        import requests
        print(f"  downloading the MediaPipe hand model (7.8 MB) to {path}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        r = requests.get(HAND_MODEL_URL, timeout=120)
        r.raise_for_status()
        open(path, "wb").write(r.content)

    def detect(self, bgr, S, sides, t_ms):
        """Fill S.hands for the requested sides."""
        H, W = bgr.shape[:2]
        t0 = time.perf_counter()
        shw = None
        if "LEFT_SHOULDER" in S.px and "RIGHT_SHOULDER" in S.px:
            a, b = S.px["LEFT_SHOULDER"], S.px["RIGHT_SHOULDER"]
            shw = math.hypot(a[0] - b[0], a[1] - b[1])
        for side in sides:
            wr = S.px.get(f"{side}_WRIST")
            if wr is None:
                continue
            tip = S.px.get(f"{side}_HAND_MIDDLE_4")
            # the hand extends past the wrist: centre the crop a little way
            # towards the fingertips so a fist and an open hand both fit
            cx, cy = wr
            if tip is not None:
                cx, cy = wr[0] + 0.55 * (tip[0] - wr[0]), wr[1] + 0.55 * (tip[1] - wr[1])
            k = W / REF_WIDTH         # keep the crop the same piece of the room at HD2K
            side_px = int(min(max(1.15 * shw if shw else 260 * k, 150 * k), 460 * k))
            x0 = int(min(max(cx - side_px / 2, 0), max(W - side_px, 0)))
            y0 = int(min(max(cy - side_px / 2, 0), max(H - side_px, 0)))
            crop = bgr[y0:y0 + side_px, x0:x0 + side_px]
            if crop.size == 0:
                continue
            rgb = cv2.cvtColor(np.ascontiguousarray(crop), cv2.COLOR_BGR2RGB)
            img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb)
            ts = max(int(t_ms), self.t_ms[side] + 1)      # must strictly increase
            self.t_ms[side] = ts
            res = self.lm[side].detect_for_video(img, ts)
            if res.hand_landmarks:
                h, w = crop.shape[:2]
                S.hands[side] = [(x0 + p.x * w, y0 + p.y * h) for p in res.hand_landmarks[0]]
                if getattr(res, "hand_world_landmarks", None):
                    S.hands_world[side] = [(p.x, p.y, p.z) for p in res.hand_world_landmarks[0]]
        self.ms = (time.perf_counter() - t0) * 1000

    def close(self):
        for lm in self.lm.values():
            lm.close()


# --- drawing -----------------------------------------------------------------
def text(img, s, org, color=CREAM, scale=0.5, weight=1):
    """Readable on any background: dark halo, then the glyphs."""
    org = (int(org[0]), int(org[1]))
    cv2.putText(img, s, org, cv2.FONT_HERSHEY_SIMPLEX, scale, INK, weight + 3, cv2.LINE_AA)
    cv2.putText(img, s, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, weight, cv2.LINE_AA)


def panel(img, x, y, w, h, alpha=0.62, color=INK):
    H, W = img.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    roi = img[y0:y1, x0:x1]
    box = np.empty_like(roi)
    box[:] = color
    cv2.addWeighted(box, alpha, roi, 1 - alpha, 0, roi)


def deg(v):
    return f"{v:4.0f}" if v is not None else "  --"


class Dropdown:
    """A clickable selector drawn on the frame. Click the box to open it,
    click an option to choose; the label shows the current choice."""

    ROW = 26

    def __init__(self, label, options, x, y, w, index=0):
        self.label, self.options, self.x, self.y, self.w = label, options, x, y, w
        self.index = index
        self.open = False
        self.hover = -1

    @property
    def value(self):
        return self.options[self.index]

    def draw(self, img):
        panel(img, self.x, self.y, self.w, self.ROW, 0.8, INK2)
        cv2.rectangle(img, (self.x, self.y), (self.x + self.w, self.y + self.ROW), DIM, 1)
        text(img, f"{self.label}: {self.value}", (self.x + 8, self.y + 18), CREAM, 0.48, 1)
        text(img, "v", (self.x + self.w - 16, self.y + 18), AMBER, 0.48, 1)
        if self.open:
            for i, opt in enumerate(self.options):
                y = self.y + self.ROW * (i + 1)
                panel(img, self.x, y, self.w, self.ROW, 0.92,
                      INK2 if i == self.hover else INK)
                text(img, ("> " if i == self.index else "  ") + opt, (self.x + 8, y + 18),
                     AMBER if i == self.index else CREAM, 0.48, 1)
            cv2.rectangle(img, (self.x, self.y), (self.x + self.w,
                          self.y + self.ROW * (len(self.options) + 1)), DIM, 1)

    def hit(self, x, y):
        """Is this point on the widget (its list included, when open)?"""
        rows = len(self.options) + 1 if self.open else 1
        return self.x <= x <= self.x + self.w and self.y <= y <= self.y + self.ROW * rows

    def _row(self, x, y):
        if not (self.x <= x <= self.x + self.w):
            return None
        r = int((y - self.y) // self.ROW)
        return r if 0 <= r <= (len(self.options) if self.open else 0) else None

    def move(self, x, y):
        r = self._row(x, y)
        self.hover = r - 1 if self.open and r else -1

    def click(self, x, y):
        """Returns the newly chosen index, or None."""
        r = self._row(x, y)
        if r is None:
            self.open = False
            return None
        if r == 0:
            self.open = not self.open
            return None
        self.open = False
        chosen = r - 1
        if chosen != self.index:
            self.index = chosen
            return chosen
        return None


class View:
    """Draws one frame: skeleton, angle arcs, grasp rings and the panels."""

    PANEL_W, LINE_H = 448, 21

    def __init__(self, W, H):
        self.W, self.H = W, H
        self.shm = None            # EMA biacromial width, metres

    def px(self, S, name, mirror):
        p = S.px.get(name)
        if p is None:
            return None
        return (int(self.W - p[0] if mirror else p[0]), int(p[1]))

    def pt(self, p, mirror):
        return (int(self.W - p[0] if mirror else p[0]), int(p[1]))

    def draw_skeleton(self, img, S, mirror, focus, hand_from_mp):
        for a, b in BONES:
            side = ("LEFT" if a.startswith("LEFT") or b.startswith("LEFT") else
                    "RIGHT" if a.startswith("RIGHT") or b.startswith("RIGHT") else None)
            # a MediaPipe hand replaces the ZED's four hand points on that side
            if side and hand_from_mp and side in S.hands and (a, b) in HAND_BONES[side]:
                continue
            pa, pb = self.px(S, a, mirror), self.px(S, b, mirror)
            if pa is None or pb is None:
                continue
            weak = min(S.conf.get(a, 0), S.conf.get(b, 0)) < 30
            heavy = side in focus and (a, b) in ARM_BONES[side]
            cv2.line(img, pa, pb, DIM if weak else SAGE, 4 if heavy else 2, cv2.LINE_AA)
        for n in S.px:
            side = "LEFT" if n.startswith("LEFT") else "RIGHT" if n.startswith("RIGHT") else None
            if "HAND" in n and hand_from_mp and side in S.hands:
                continue
            p = self.px(S, n, mirror)
            weak = S.conf.get(n, 0) < 30
            cv2.circle(img, p, 4, DIM if weak else AMBER, -1, cv2.LINE_AA)

    def draw_person(self, img, S, mirror, selected):
        """A thin grey skeleton for somebody not being tracked, and a label
        for everybody. Returns the clickable box in display pixels."""
        pts = [self.pt(p, mirror) for p in S.px.values()]
        if not pts:
            return None
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        box = (min(xs) - 20, min(ys) - 34, max(xs) + 20, max(ys) + 20)
        if not selected:
            for a, b in BONES:
                pa, pb = self.px(S, a, mirror), self.px(S, b, mirror)
                if pa and pb:
                    cv2.line(img, pa, pb, DIM, 1, cv2.LINE_AA)
        head = self.px(S, "NOSE", mirror) or self.px(S, "NECK", mirror) or (box[0] + 40, box[1])
        text(img, f"person {S.id}" + ("   tracking" if selected else "   click to track"),
             (head[0] - 44, box[1] + 16), AMBER if selected else CREAM, 0.5, 2 if selected else 1)
        return box

    def draw_mp_hand(self, img, pts, mirror, closed):
        col = SAGE if closed else AMBER
        P = [self.pt(p, mirror) for p in pts]
        for a, b in MP_HAND_BONES:
            cv2.line(img, P[a], P[b], col, 2, cv2.LINE_AA)
        for p in P:
            cv2.circle(img, p, 3, CREAM, -1, cv2.LINE_AA)

    @staticmethod
    def arc(img, c, d1, d2, r, color, label):
        """Arc at c from direction d1 to d2 the short way, label at its middle."""
        a1 = math.degrees(math.atan2(d1[1], d1[0]))
        a2 = math.degrees(math.atan2(d2[1], d2[0]))
        sweep = (a2 - a1) % 360
        if sweep > 180:
            a1, sweep = a2, 360 - sweep
        cv2.ellipse(img, (int(c[0]), int(c[1])), (r, r), 0, a1, a1 + sweep, color, 2, cv2.LINE_AA)
        mid = math.radians(a1 + sweep / 2)
        text(img, label, (c[0] + (r + 10) * math.cos(mid) - 12, c[1] + (r + 10) * math.sin(mid) + 6),
             color, 0.5, 1)

    def draw_arm(self, img, S, side, R, grip, mirror, show_xyz, hand_from_mp):
        sh, el, wr = (self.px(S, f"{side}_SHOULDER", mirror), self.px(S, f"{side}_ELBOW", mirror),
                      self.px(S, f"{side}_WRIST", mirror))
        if sh and el and wr and R["elbow_flex"] is not None:
            self.arc(img, el, (sh[0] - el[0], sh[1] - el[1]), (wr[0] - el[0], wr[1] - el[1]),
                     26, CREAM, f"{R['elbow_flex']:.0f}")
        if sh and el and R["elevation"] is not None:
            hipL, hipR = self.px(S, "LEFT_HIP", mirror), self.px(S, "RIGHT_HIP", mirror)
            shL, shR = self.px(S, "LEFT_SHOULDER", mirror), self.px(S, "RIGHT_SHOULDER", mirror)
            down = (0, 1)
            if hipL and hipR and shL and shR:
                down = ((hipL[0] + hipR[0]) / 2 - (shL[0] + shR[0]) / 2,
                        (hipL[1] + hipR[1]) / 2 - (shL[1] + shR[1]) / 2)
            self.arc(img, sh, down, (el[0] - sh[0], el[1] - sh[1]), 30, AMBER,
                     f"{R['elevation']:.0f}")
        # grasp: the hand skeleton (MediaPipe) or a ring on the palm (ZED)
        col = SAGE if grip.closed else AMBER
        mp_pts = S.hands.get(side) if hand_from_mp else None
        if mp_pts:
            self.draw_mp_hand(img, mp_pts, mirror, grip.closed)
            palm = self.pt(mp_pts[9], mirror)
            label_at = (palm[0] - 26, palm[1] + 44)
        else:
            k1 = self.px(S, f"{side}_HAND_INDEX_1", mirror)
            k2 = self.px(S, f"{side}_HAND_PINKY_1", mirror)
            palm = ((wr[0] + k1[0] + k2[0]) // 3, (wr[1] + k1[1] + k2[1]) // 3) if wr and k1 and k2 else wr
            if palm:
                cv2.circle(img, palm, 18, col, 3, cv2.LINE_AA)
            label_at = (palm[0] - 26, palm[1] + 38) if palm else None
        if label_at:
            state = "CLOSED" if grip.closed else "OPEN"
            if grip.curl is None:
                state, col = "no hand", DIM
            text(img, state, label_at, col, 0.55, 2)
        if show_xyz:
            for p, v in ((sh, R["shoulder"]), (el, R["elbow"]), (wr, R["wrist"])):
                if p and v is not None:
                    text(img, f"{v[0]:.2f} {v[1]:.2f} {v[2]:.2f}", (p[0] + 10, p[1] - 10), CREAM, 0.42)

    def arm_panel(self, img, x, y, side, R, grip, source):
        lines = [
            (f"{side} ARM", AMBER),
            ("              x       y       z   (m)", DIM),
        ]
        for name in ("shoulder", "elbow", "wrist", "hand"):
            v = R[name]
            lines.append((f"{name:<9}" + (f"{v[0]:8.2f}{v[1]:8.2f}{v[2]:8.2f}" if v is not None
                                          else "      --      --      --"), CREAM))
        rel = R["hand_rel_cm"]
        lines.append(("hand from shoulder  "
                      + (f"out {rel[0]:4.0f}  up {rel[1]:4.0f}  fwd {rel[2]:4.0f} cm" if rel
                         else "--"), CREAM))
        lines.append((f"elbow flexion   {deg(R['elbow_flex'])} deg   (0 = straight)", CREAM))
        lines.append((f"shoulder elev   {deg(R['elevation'])} deg   plane {deg(R['plane'])}"
                      f"  {R['movement']}", CREAM))
        c = grip.curl
        state = "CLOSED" if grip.closed else "OPEN"
        src = "hand model" if source == "MediaPipe hand" else "ZED points"
        if c is None:
            lines.append((f"grasp   --      no hand seen ({src})", DIM))
        elif grip.trusted:
            lines.append((f"grasp   {state:<7} curl {c:4.2f}   band {grip.lo:.2f}-{grip.hi:.2f}  {src}",
                          SAGE if grip.closed else AMBER))
        else:
            lines.append((f"grasp   {state:<7} curl {c:4.2f}   open + squeeze to calibrate",
                          SAGE if grip.closed else AMBER))
        panel(img, x, y, self.PANEL_W, 12 + self.LINE_H * (len(lines) + 1))
        for i, (s, col) in enumerate(lines):
            text(img, s, (x + 10, y + 22 + self.LINE_H * i), col, 0.5, 2 if i == 0 else 1)
        self.curl_bar(img, x + 10, y + 12 + self.LINE_H * len(lines), self.PANEL_W - 20, grip)

    @staticmethod
    def curl_bar(img, x, y, w, grip):
        """The grasp band, drawn: the observed range, the close / open
        thresholds inside it, and where the hand is right now."""
        lo_axis, hi_axis = 0.8, 2.4                      # curl values shown
        px = lambda v: int(x + (min(max(v, lo_axis), hi_axis) - lo_axis) / (hi_axis - lo_axis) * w)
        cv2.line(img, (x, y + 8), (x + w, y + 8), DIM, 1, cv2.LINE_AA)
        for v in (1.0, 1.5, 2.0):
            cv2.line(img, (px(v), y + 5), (px(v), y + 11), DIM, 1)
        if grip.lo is not None:
            cv2.line(img, (px(grip.lo), y + 8), (px(grip.hi), y + 8), CREAM, 3, cv2.LINE_AA)
        close, open_ = grip.band()
        cv2.line(img, (px(close), y + 1), (px(close), y + 15), SAGE, 2)
        cv2.line(img, (px(open_), y + 1), (px(open_), y + 15), AMBER, 2)
        if grip.curl is not None:
            c = px(grip.curl)
            cv2.circle(img, (c, y + 8), 6, SAGE if grip.closed else AMBER, -1, cv2.LINE_AA)
            cv2.circle(img, (c, y + 8), 6, INK, 1, cv2.LINE_AA)
        text(img, "fist", (x - 2, y + 30), DIM, 0.38)
        text(img, "closes <", (px(close) - 22, y + 30), SAGE, 0.38)
        text(img, "> opens", (px(open_) - 18, y + 30), AMBER, 0.38)
        text(img, "open", (x + w - 26, y + 30), DIM, 0.38)

    def render(self, img, S, others, focus, grips, mirror, show_xyz, header, sub, source, boxes):
        """Draw everything. `others` are the people not being tracked; every
        person's clickable box is appended to `boxes` as (id, box)."""
        panel(img, 0, 0, self.W, 58)
        text(img, header, (12, 24), SAGE, 0.55, 2)
        for o in others:
            box = self.draw_person(img, o, mirror, selected=False)
            if box:
                boxes.append((o.id, box))
        if S is None:
            text(img, sub if others else "no body: sit 1 - 2.5 m back, facing the camera",
                 (12, 48), AMBER, 0.55, 1)
            return None
        box = self.draw_person(img, S, mirror, selected=True)
        if box:
            boxes.append((S.id, box))
        F = body_frame(S)
        if F is not None:
            w = F["width"]
            if 0.20 < w < 0.75:
                self.shm = w if self.shm is None else self.shm + (w - self.shm) * 0.05
        dist = float(np.linalg.norm(F["origin"])) if F is not None else None
        text(img, f"{sub}   body conf {S.confidence:3.0f}   shoulders "
                  + (f"{self.shm * 100:.1f} cm" if self.shm else "--")
                  + (f"   {dist:.2f} m away" if dist else "")
                  + ("" if F is not None else "   (no body frame: shoulders missing)"),
             (12, 48), CREAM, 0.5, 1)
        hand_from_mp = source == "MediaPipe hand"
        self.draw_skeleton(img, S, mirror, focus, hand_from_mp)
        readouts = {}
        for side in ("LEFT", "RIGHT"):
            R = arm_readout(S, side, F)
            if hand_from_mp:
                pts = S.hands.get(side)
                grips[side].update(mp_curl(pts, S.hands_world.get(side)) if pts else None)
            else:
                grips[side].update(zed_curl(S, side))
            readouts[side] = R
            if side in focus:
                self.draw_arm(img, S, side, R, grips[side], mirror, show_xyz, hand_from_mp)
        # each panel sits on the side of the screen its arm appears on
        ph = 12 + self.LINE_H * 11 + 14
        on_left = "LEFT" if mirror else "RIGHT"
        for side in focus:
            x = 8 if side == on_left else self.W - self.PANEL_W - 8
            self.arm_panel(img, x, self.H - ph - 30, side, readouts[side], grips[side], source)
        return readouts


# --- sources -----------------------------------------------------------------
# HD2K at 15 fps (Oct 2026, by request), the same as the bridge: the full
# 2208x1242 sensor, whose only rate is 15 fps. The extra pixels make a hand
# at 4 m big enough for the hand model, and the long exposure suits a ward
# without studio light (at 60 fps the sensor could never expose longer than
# ~16 ms and the picture came out dark, flat and noisy). --res and --fps
# override; the fps is clamped to what the size supports.
PROFILES = {
    "fast":     dict(res="HD2K", fps=15, depth="NEURAL_LIGHT", fp16=True),
    "balanced": dict(res="HD2K", fps=15, depth="NEURAL", fp16=False),
}
RES_FPS = {"HD2K": (15,), "HD1080": (15, 30), "HD720": (15, 30, 60), "VGA": (15, 30, 60, 100)}
REF_WIDTH = 1280          # the hand crop band was tuned on a 1280-wide picture


def pick_fps(res, want):
    """The highest frame rate the size supports that is not above the one
    asked for (HD2K only does 15, so --fps 30 there quietly becomes 15)."""
    ok = RES_FPS.get(res, (15, 30, 60))
    fps = max([f for f in ok if f <= want] or [ok[0]])
    if fps != want:
        print(f"  {res} cannot run at {want} fps; using {fps}")
    return fps

# The ZED's picture is flat out of the box (its ISP is tuned for stereo
# matching, not for a mirror), and unlike a webcam driver it lifts nothing.
# SDK post-processing settings, on top of auto exposure. Ranges: brightness
# and contrast 0-8 (default 4), gamma 1-9 (default 8). Same values as the
# bridge, so the viewer shows what the game will show.
PICTURE_DEFAULTS = dict(brightness=6, contrast=5, gamma=9)


def gpu_info():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                             capture_output=True, text=True, timeout=8)
        line = out.stdout.strip().splitlines()
        return line[0] if out.returncode == 0 and line else None
    except (OSError, subprocess.SubprocessError):
        return None


class ZedSource:
    """The camera, opened the way the game's bridge opens it. The body model
    can be swapped live (set_model): the camera stays open, only the body
    tracking module restarts."""

    def __init__(self, profile, max_range, min_conf, model, fps=None, picture=None, res=None):
        import pyzed.sl as sl
        self.sl = sl
        P = dict(PROFILES[profile])
        if res:
            P["res"] = res
        P["fps"] = pick_fps(P["res"], fps or P["fps"])
        self.P, self.max_range = P, max_range
        init = sl.InitParameters()
        init.camera_resolution = getattr(sl.RESOLUTION, P["res"])
        init.camera_fps = P["fps"]
        init.depth_mode = (getattr(sl.DEPTH_MODE, P["depth"]) if hasattr(sl.DEPTH_MODE, P["depth"])
                           else sl.DEPTH_MODE.PERFORMANCE)
        init.depth_minimum_distance = 0.8
        init.depth_maximum_distance = max_range
        init.coordinate_units = sl.UNIT.METER
        self.zed = sl.Camera()
        st = self.zed.open(init)
        if st != sl.ERROR_CODE.SUCCESS:
            raise SystemExit(f"camera open failed: {st} (is another ZED program running?)")
        self.apply_picture(**(picture or PICTURE_DEFAULTS))
        pt = sl.PositionalTrackingParameters()
        pt.set_as_static = True
        self.zed.enable_positional_tracking(pt)
        self.model = None
        self.set_model(model, first=True)
        self.run = sl.RuntimeParameters()
        if hasattr(self.run, "enable_fill_mode"):
            self.run.enable_fill_mode = False
        self.rt = sl.BodyTrackingRuntimeParameters()
        self.rt.detection_confidence_threshold = min_conf
        cam = self.zed.get_camera_information().camera_configuration.resolution
        self.W, self.H = cam.width, cam.height
        members = sl.BODY_38_PARTS.__members__
        pairs = sorted(((int(v.value), k) for k, v in members.items() if k != "LAST"))
        self.names = [None] * (pairs[-1][0] + 1)
        for i, k in pairs:
            self.names[i] = k
        self.image, self.bodies = sl.Mat(), sl.Bodies()
        self.depth = getattr(init.depth_mode, "name", str(init.depth_mode))

    def apply_picture(self, brightness, contrast, gamma, exposure=None, gain=None):
        """Push the picture settings and print what the camera reports back,
        so a dull image is a number on the console rather than a guess."""
        sl = self.sl
        wanted = {"BRIGHTNESS": brightness, "CONTRAST": contrast, "GAMMA": gamma}
        if exposure is not None:          # manual exposure turns auto (AEC/AGC) off
            wanted["EXPOSURE"] = exposure
            wanted["GAIN"] = gain
        got = []
        for name, value in wanted.items():
            key = getattr(sl.VIDEO_SETTINGS, name, None)
            if key is None or value is None:
                continue
            self.zed.set_camera_settings(key, int(value))
            try:
                back = self.zed.get_camera_settings(key)
                back = back[1] if isinstance(back, tuple) else back
            except Exception:
                back = "?"
            got.append(f"{name.lower()} {back}")
        print("  picture: " + ", ".join(got)
              + ("" if exposure is not None else "  (auto exposure)"))

    @property
    def label(self):
        return (f"ZED body tracking {self.model.replace('HUMAN_BODY_', '')} / BODY_38   {self.depth}"
                f"   {self.P['fps']} fps")

    def set_model(self, model, first=False):
        """Restart body tracking with another SDK model (FAST/MEDIUM/ACCURATE)."""
        sl = self.sl
        if model == self.model:
            return
        if not first:
            self.zed.disable_body_tracking()
        bt = sl.BodyTrackingParameters()
        bt.detection_model = getattr(sl.BODY_TRACKING_MODEL, model)
        bt.body_format = sl.BODY_FORMAT.BODY_38
        bt.enable_tracking = True
        bt.enable_body_fitting = True
        for name, value in (("allow_reduced_precision_inference", self.P["fp16"]),
                            ("max_range", self.max_range), ("prediction_timeout_s", 0.0)):
            if hasattr(bt, name):
                setattr(bt, name, value)
        t0 = time.perf_counter()
        if self.zed.enable_body_tracking(bt) != sl.ERROR_CODE.SUCCESS:
            self.zed.close()
            raise SystemExit(f"body tracking failed to start with {model}")
        self.model = model
        print(f"  body model {model} ready in {time.perf_counter() - t0:.1f} s")

    def read(self):
        sl = self.sl
        if self.zed.grab(self.run) != sl.ERROR_CODE.SUCCESS:
            return None
        self.zed.retrieve_image(self.image, sl.VIEW.LEFT, sl.MEM.CPU)
        img = cv2.cvtColor(self.image.get_data(), cv2.COLOR_BGRA2BGR)
        self.zed.retrieve_bodies(self.bodies, self.rt)
        return img, [Skeleton.from_sdk(b, self.names) for b in self.bodies.body_list]

    def close(self):
        self.zed.disable_body_tracking()
        self.zed.close()


def demo_pose(t):
    """A seated figure, metres in the camera frame, moving so every readout
    changes: the left arm swings out to the side (abduction), the right arm
    swings forward (flexion) while its elbow bends, and both hands open and
    close. Returns joint -> xyz plus the parameters it was built from, so a
    test can check the readout against them."""
    z0 = 1.6
    P = {
        "NECK": (0, -0.30, z0), "NOSE": (0, -0.47, z0 - 0.08),
        "LEFT_EYE": (0.03, -0.50, z0 - 0.07), "RIGHT_EYE": (-0.03, -0.50, z0 - 0.07),
        "LEFT_EAR": (0.08, -0.48, z0), "RIGHT_EAR": (-0.08, -0.48, z0),
        "SPINE_3": (0, -0.20, z0 + 0.01), "SPINE_2": (0, -0.06, z0 + 0.02),
        "SPINE_1": (0, 0.09, z0 + 0.02), "PELVIS": (0, 0.24, z0 + 0.02),
        "LEFT_CLAVICLE": (0.08, -0.28, z0), "RIGHT_CLAVICLE": (-0.08, -0.28, z0),
        "LEFT_SHOULDER": (0.19, -0.26, z0), "RIGHT_SHOULDER": (-0.19, -0.26, z0),
        "LEFT_HIP": (0.14, 0.24, z0), "RIGHT_HIP": (-0.14, 0.24, z0),
        "LEFT_KNEE": (0.16, 0.62, z0 - 0.30), "RIGHT_KNEE": (-0.16, 0.62, z0 - 0.30),
        "LEFT_ANKLE": (0.16, 1.02, z0 - 0.25), "RIGHT_ANKLE": (-0.16, 1.02, z0 - 0.25),
        "LEFT_HEEL": (0.16, 1.06, z0 - 0.20), "RIGHT_HEEL": (-0.16, 1.06, z0 - 0.20),
        "LEFT_BIG_TOE": (0.14, 1.07, z0 - 0.36), "RIGHT_BIG_TOE": (-0.14, 1.07, z0 - 0.36),
        "LEFT_SMALL_TOE": (0.20, 1.07, z0 - 0.34), "RIGHT_SMALL_TOE": (-0.20, 1.07, z0 - 0.34),
    }
    P = {k: np.array(v, dtype=float) for k, v in P.items()}
    params = {
        "LEFT": dict(elev=75 + 75 * math.sin(0.6 * t), plane=0.0,
                     flex=15.0, open=0.5 + 0.5 * math.sin(1.5 * t)),
        "RIGHT": dict(elev=60 + 60 * math.sin(0.45 * t + 1.0), plane=90.0,
                      flex=20 + 60 * (0.5 + 0.5 * math.sin(0.9 * t)),
                      open=0.5 + 0.5 * math.sin(1.5 * t + 2.0)),
    }
    up_axis, fwd_axis = np.array([0.0, -1.0, 0.0]), np.array([0.0, 0.0, -1.0])
    for side, q in params.items():
        lat_axis = np.array([1.0 if side == "LEFT" else -1.0, 0.0, 0.0])
        e, p, f = map(math.radians, (q["elev"], q["plane"], q["flex"]))
        horiz = math.cos(p) * lat_axis + math.sin(p) * fwd_axis
        u = math.sin(e) * horiz - math.cos(e) * up_axis
        sh = P[f"{side}_SHOULDER"]
        el = sh + 0.30 * u
        perp = fwd_axis - u * float(np.dot(fwd_axis, u))
        if np.linalg.norm(perp) < 0.1:
            perp = up_axis - u * float(np.dot(up_axis, u))
        perp = perp / np.linalg.norm(perp)
        d = math.cos(f) * u + math.sin(f) * perp
        wr = el + 0.27 * d
        side_vec = np.cross(d, perp)
        side_vec = side_vec / np.linalg.norm(side_vec) * 0.035
        knuckle = wr + 0.09 * d
        P[f"{side}_ELBOW"], P[f"{side}_WRIST"] = el, wr
        P[f"{side}_HAND_INDEX_1"] = knuckle + side_vec
        P[f"{side}_HAND_PINKY_1"] = knuckle - side_vec
        P[f"{side}_HAND_MIDDLE_4"] = wr + (0.09 + 0.09 * q["open"]) * d
        P[f"{side}_HAND_THUMB_4"] = wr + 0.05 * d + side_vec * (1.2 + 1.2 * q["open"])
    return P, params


class DemoSource:
    """Synthetic frames in the ZED's layout, for checking the display
    without a camera. A pinhole projects the metres to pixels."""

    W, H, FX = 1280, 720, 700.0

    def __init__(self):
        self.t0 = time.perf_counter() - 1.7
        self.model = "DEMO"
        self.label = "DEMO: synthetic skeleton, no camera"
        self.names = BODY_38
        yy = np.linspace(0, 1, self.H)[:, None, None]
        bg = np.array([[[46, 22, 20]]]) * (1 - yy) + np.array([[[70, 40, 32]]]) * yy
        self.bg = np.repeat(bg.astype(np.uint8), self.W, axis=1)

    def set_model(self, model):
        self.model = model

    def skeleton(self, t, dx=0.0, dz=0.0, id=1):
        P, _ = demo_pose(t)
        kp2, kp3, conf = [], [], []
        for n in self.names:
            v = P[n] + np.array([dx, 0.0, dz])
            kp3.append(v)
            kp2.append((self.FX * v[0] / v[2] + self.W / 2, self.FX * v[1] / v[2] + self.H / 2))
            conf.append(60.0 if "HAND" in n else 90.0)
        return Skeleton(self.names, kp2, kp3, conf, 92.0, id)

    def read(self):
        time.sleep(1 / 60)
        t = time.perf_counter() - self.t0
        # two people, so the person picker can be tried without a camera
        return self.bg.copy(), [self.skeleton(t, id=1), self.skeleton(t + 3.0, 0.95, 0.35, id=2)]

    def close(self):
        pass


# --- main --------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--profile", choices=PROFILES, default="fast",
                    help="depth mode: fast = NEURAL_LIGHT, balanced = NEURAL")
    ap.add_argument("--model", choices=["FAST", "MEDIUM", "ACCURATE"], default="MEDIUM",
                    help="SDK body model to start with (switchable on screen)")
    ap.add_argument("--grasp", choices=["mp", "zed"], default="mp",
                    help="grasp source: mp = MediaPipe 21-point hand, zed = BODY_38 points")
    ap.add_argument("--max-range", type=float, default=5.0,
                    help="metres: how far the depth and body tracking look "
                         "(a ward bed can be 4.5 m from the camera)")
    ap.add_argument("--min-conf", type=float, default=40.0)
    ap.add_argument("--res", choices=list(RES_FPS), default=None,
                    help="camera picture size (default HD2K, 2208x1242)")
    ap.add_argument("--fps", type=int, choices=[15, 30, 60, 100], default=None,
                    help="camera frame rate (default 15 at HD2K, the only rate it offers; "
                         "clamped to what --res supports. 60 caps the exposure and "
                         "makes a dim ward look dimmer)")
    ap.add_argument("--brightness", type=int, default=PICTURE_DEFAULTS["brightness"],
                    help="0-8, SDK default 4")
    ap.add_argument("--contrast", type=int, default=PICTURE_DEFAULTS["contrast"],
                    help="0-8, SDK default 4")
    ap.add_argument("--gamma", type=int, default=PICTURE_DEFAULTS["gamma"],
                    help="1-9, SDK default 8 (higher lifts the shadows)")
    ap.add_argument("--exposure", choices=["fixed", "auto"], default="auto",
                    help="fixed avoids motion blur under good room light")
    ap.add_argument("--exposure-val", type=int, default=45, help="0-100, with --exposure fixed")
    ap.add_argument("--gain", type=int, default=50, help="0-100, with --exposure fixed")
    ap.add_argument("--no-mirror", action="store_true", help="raw camera image, not a mirror")
    ap.add_argument("--width", type=int, default=1280, help="window width")
    ap.add_argument("--person", type=int, metavar="ID",
                    help="track this SDK person id from the start (else: the only person, or a click)")
    ap.add_argument("--demo", action="store_true", help="synthetic skeleton, no camera needed")
    ap.add_argument("--snapshot", metavar="PNG", help="render one frame to PNG and exit")
    ap.add_argument("--log", metavar="CSV", help="append every frame's positions, angles and "
                                                 "grasp state to this CSV (one row per arm)")
    args = ap.parse_args()
    try:                                  # so a redirected log shows lines as they happen
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass

    log = None
    if args.log:
        new = not os.path.exists(args.log) or os.path.getsize(args.log) == 0
        log_file = open(args.log, "a", newline="")
        log = csv.writer(log_file)
        if new:
            log.writerow(["t_s", "person", "arm", "shoulder_x", "shoulder_y", "shoulder_z",
                          "elbow_x", "elbow_y", "elbow_z", "wrist_x", "wrist_y", "wrist_z",
                          "hand_x", "hand_y", "hand_z", "hand_out_cm", "hand_up_cm", "hand_fwd_cm",
                          "elbow_flex_deg", "shoulder_elev_deg", "plane_deg", "movement",
                          "curl", "closed", "grasp_source", "body_model", "body_conf"])

    model = f"HUMAN_BODY_{args.model}"
    picture = dict(brightness=args.brightness, contrast=args.contrast, gamma=args.gamma,
                   exposure=args.exposure_val if args.exposure == "fixed" else None,
                   gain=args.gain)
    src = (DemoSource() if args.demo
           else ZedSource(args.profile, args.max_range, args.min_conf, model,
                          fps=args.fps, picture=picture, res=args.res))
    view = View(src.W, src.H)
    grips = {"LEFT": Grip(), "RIGHT": Grip()}
    focus = {"LEFT", "RIGHT"}
    mirror = not args.no_mirror
    show_xyz = True
    gpu = gpu_info()

    hands = None
    try:
        hands = MpHands()
    except Exception as e:                        # no mediapipe / no download: ZED points only
        print(f"  MediaPipe hand model unavailable ({e}); grasp falls back to the ZED's points")
    grasp_options = GRASP_SOURCES if hands else GRASP_SOURCES[1:]
    grasp_dd = Dropdown("grasp", grasp_options, src.W - 232, 66, 224,
                        0 if (args.grasp == "mp" and hands) else len(grasp_options) - 1)
    model_dd = Dropdown("body model", [m.replace("HUMAN_BODY_", "") for m in BODY_MODELS],
                        src.W - 232 - 200 - 8, 66, 200, BODY_MODELS.index(model))
    widgets = [model_dd, grasp_dd]
    clicks = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            clicks.append((x, y))
        elif event == cv2.EVENT_MOUSEMOVE:
            for w in widgets:
                w.move(x, y)

    print(f"\nZED track: {src.label}")
    print(f"  compute  {gpu or 'no NVIDIA GPU reported by nvidia-smi'}")
    print(f"  grasp    {grasp_dd.value}")
    print("  q quits, m mirrors, 1/2/3 pick the arm, click / Tab pick the person, n body model,"
          " g grasp source, x labels, c resets grasp, s saves a PNG\n")

    win = "STRIVE ZED track"
    if not args.snapshot:
        cv2.namedWindow(win, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(win, args.width, int(args.width * src.H / src.W))
        cv2.setMouseCallback(win, on_mouse)
    n, t0, fps, shots = 0, time.perf_counter(), 0.0, 0
    t_start = t0
    last_img = None
    # who is being tracked: the SDK id chosen by click / Tab / --person, or
    # the only person in view. Held while they are missing (never swapped to
    # whoever is left); a lone person who shows up after LOST_GRACE is adopted,
    # since the SDK hands a returning person a fresh id.
    LOST_GRACE = 3.0
    selected_id = args.person
    lost_at = None

    def choose(pid):
        nonlocal selected_id, lost_at
        if pid != selected_id:
            selected_id, lost_at = pid, None
            for g in grips.values():
                g.reset()

    def switch_model(name):
        """Swap the SDK body model, saying so on screen while it loads."""
        full = f"HUMAN_BODY_{name}"
        if last_img is not None and not args.snapshot:
            panel(last_img, 0, src.H // 2 - 40, src.W, 80, 0.8)
            text(last_img, f"loading body model {name} ... first use of a model can take a few minutes",
                 (40, src.H // 2 + 8), AMBER, 0.7, 2)
            cv2.imshow(win, last_img)
            cv2.waitKey(1)
        src.set_model(full)
        model_dd.index = BODY_MODELS.index(full)

    try:
        while True:
            got = src.read()
            if got is None:
                time.sleep(0.002)
                continue
            raw, skeletons = got
            n += 1
            now = time.perf_counter()
            by_id = {s.id: s for s in skeletons}
            if selected_id is None and len(skeletons) == 1:
                choose(skeletons[0].id)
            S = by_id.get(selected_id)
            if S is not None:
                lost_at = None
            elif selected_id is not None:
                lost_at = lost_at or now
                if now - lost_at > LOST_GRACE and len(skeletons) == 1:
                    choose(skeletons[0].id)
                    S = skeletons[0]
            others = [s for s in skeletons if s is not S]
            source = grasp_dd.value
            if S is not None and hands is not None and source == "MediaPipe hand":
                hands.detect(raw, S, focus, (now - t_start) * 1000)
            img = cv2.flip(raw, 1) if mirror else raw
            header = (f"{fps:5.1f} fps   {'mirror' if mirror else 'raw'}   {src.label}"
                      + (f"   hand model {hands.ms:.0f} ms" if hands and source == "MediaPipe hand" else "")
                      + (f"   {len(skeletons)} people" if len(skeletons) > 1 else ""))
            if S is not None:
                sub = (f"tracking person {S.id}   showing the left RGB eye; every number is from"
                       " the 3D skeleton")
            elif selected_id is not None and lost_at is not None:
                sub = (f"person {selected_id} lost {now - lost_at:.0f} s ago: waiting for them"
                       "   (click another person to switch)")
            else:
                sub = f"{len(skeletons)} people in view: click the one to track (or press Tab)"
            boxes = []
            readouts = view.render(img, S, others, focus, grips, mirror, show_xyz, header, sub,
                                   source, boxes)
            for w in widgets:
                w.draw(img)
            text(img, "q quit   m mirror   1/2/3 arm   click/Tab person   n body model   g grasp"
                 "   x labels   c reset grasp   s save"
                 + (f"   logging {os.path.basename(args.log)}" if log else ""),
                 (12, src.H - 10), DIM, 0.45)
            if log and readouts:
                ts = round(time.perf_counter() - t_start, 3)
                for side, R in readouts.items():
                    xyz = [f"{v:.4f}" for k in ("shoulder", "elbow", "wrist", "hand")
                           for v in (R[k] if R[k] is not None else (float("nan"),) * 3)]
                    rel = R["hand_rel_cm"] or (float("nan"),) * 3
                    g = grips[side]
                    log.writerow([ts, S.id, side.lower(), *xyz, *[f"{v:.1f}" for v in rel],
                                  *[f"{v:.1f}" if v is not None else "" for v in
                                    (R["elbow_flex"], R["elevation"], R["plane"])],
                                  R["movement"], f"{g.curl:.3f}" if g.curl is not None else "",
                                  int(g.closed), source, src.model.replace("HUMAN_BODY_", ""),
                                  f"{S.confidence:.0f}"])
            last_img = img
            if args.snapshot:
                cv2.imwrite(args.snapshot, img)
                print(f"  saved {os.path.abspath(args.snapshot)}")
                break
            cv2.imshow(win, img)
            key = cv2.waitKey(1) & 0xFF
            while clicks:
                x, y = clicks.pop(0)
                if any(w.hit(x, y) for w in widgets):
                    for w in widgets:
                        chosen = w.click(x, y)
                        if chosen is not None and w is model_dd:
                            switch_model(w.value)
                        elif chosen is not None and w is grasp_dd:
                            for g in grips.values():
                                g.reset()
                    continue
                for w in widgets:
                    w.open = False
                for pid, (x0, y0, x1, y1) in boxes:
                    if x0 <= x <= x1 and y0 <= y <= y1:
                        choose(pid)
                        break
            if key in (ord("q"), 27):
                break
            elif key == 9:                                    # Tab: next person
                ids = sorted(by_id)
                if ids:
                    choose(ids[(ids.index(selected_id) + 1) % len(ids)] if selected_id in by_id
                           else ids[0])
            elif key == ord("0"):
                choose(None)
            elif key == ord("m"):
                mirror = not mirror
            elif key == ord("1"):
                focus = {"LEFT"}
            elif key == ord("2"):
                focus = {"RIGHT"}
            elif key == ord("3"):
                focus = {"LEFT", "RIGHT"}
            elif key == ord("x"):
                show_xyz = not show_xyz
            elif key == ord("n"):
                switch_model(model_dd.options[(model_dd.index + 1) % len(model_dd.options)])
            elif key == ord("g"):
                grasp_dd.index = (grasp_dd.index + 1) % len(grasp_dd.options)
                for g in grips.values():
                    g.reset()
            elif key == ord("c"):
                for g in grips.values():
                    g.reset()
            elif key == ord("s"):
                shots += 1
                path = os.path.abspath(f"zed_track_{shots:02d}.png")
                cv2.imwrite(path, img)
                print(f"  saved {path}")
            if n % 30 == 0:
                t1 = time.perf_counter()
                fps = 30 / (t1 - t0)
                t0 = t1
    finally:
        cv2.destroyAllWindows()
        if hands:
            hands.close()
        src.close()
        if log:
            log_file.close()
            print(f"  log written to {os.path.abspath(args.log)}")


if __name__ == "__main__":
    main()

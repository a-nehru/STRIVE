"""
Shared pieces for the STRIVE ZED tools (zed_test.py, zed_view.py).

The interesting part is Readout: given one BODY_38 skeleton it produces both
the on-screen overlay and the text lines describing what the game would see -
joint XYZ, the same points in the game's shoulder-width units, elbow flexion,
arm elevation, and grasp. Keeping it here means the diagnostic and the viewer
cannot drift apart and report different numbers for the same pose.

Nothing here opens a camera; the callers do that.
"""

import subprocess

import numpy as np

# opencv is imported inside the drawing functions, not here: zed_test.py must
# stay able to report "opencv is missing" rather than die on its own import.

# STRIVE palette, in BGR for opencv
CREAM = (221, 236, 244)
AMBER = (106, 168, 232)
SAGE = (138, 192, 159)
INK = (58, 27, 27)
DIM = (150, 150, 150)

# grasp thresholds, copied from js/tracker.js so the readout matches the game
GRIP_CLOSE, GRIP_OPEN = 0.28, 0.36
GRIP_CAL_MIN_RANGE, GRIP_CAL_DECAY = 0.10, 0.0004
CLOSE_FRAC, OPEN_FRAC = 0.35, 0.6

# MediaPipe indexes (the keys of the bridge's mapping table) we label
JOINTS = {11: "L shoulder", 12: "R shoulder", 13: "L elbow", 14: "R elbow",
          15: "L wrist", 16: "R wrist"}
BONES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
         (11, 23), (12, 24), (23, 24)]
ARMS = (("L", (11, 13, 15, 19)), ("R", (12, 14, 16, 20)))


def gpu_info():
    """NVIDIA GPU name/VRAM via nvidia-smi, or None.

    The ZED SDK's neural depth and body tracking are CUDA-only: no NVIDIA GPU
    means no skeletons, whatever the camera does.
    """
    try:
        out = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=name,memory.total,memory.used,driver_version",
             "--format=csv,noheader"],
            capture_output=True, text=True, timeout=8)
    except (OSError, subprocess.SubprocessError):
        return None
    line = out.stdout.strip().splitlines()
    if out.returncode != 0 or not line:
        return None
    name, total, used, driver = [p.strip() for p in line[0].split(",")]
    return f"{name}, {used} / {total} used, driver {driver}"


def draw_text(img, text, org, color=CREAM, scale=0.5, weight=1):
    """Readable on any background: dark halo, then the glyph."""
    import cv2
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, INK, weight + 3,
                cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, weight,
                cv2.LINE_AA)


def first_valid(kp, candidates):
    """The bridge's fallback chain: first candidate with finite values."""
    for zi in candidates:
        if zi < len(kp) and np.isfinite(kp[zi]).all():
            return zi
    return None


def angle_3d(a, b, c):
    """Interior angle at b, in degrees (180 = straight). None if unusable."""
    if a is None or b is None or c is None:
        return None
    u, v = a - b, c - b
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6:
        return None
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / (nu * nv), -1, 1))))


class Grip:
    """The game's pose-fingertip grasp, replayed here.

    In ZED mode there is no 21-point hand model, so tracker.js falls back to
    the fingertip-to-wrist distance in shoulder-width units with a
    self-calibrating envelope: once it has seen enough of this person's range,
    "closed" is 35% into their own open-to-shut span. Same numbers here, so
    what these tools say is what the game believes.
    """

    def __init__(self):
        self.cal = None          # [lo, hi] observed envelope
        self.closed = False

    def update(self, g):
        if g is None:
            return
        if self.cal is None:
            self.cal = [g, g]
        self.cal[0] = min(g, self.cal[0] + GRIP_CAL_DECAY)
        self.cal[1] = max(g, self.cal[1] - GRIP_CAL_DECAY)
        span = self.cal[1] - self.cal[0]
        trusted = span > GRIP_CAL_MIN_RANGE
        close = self.cal[0] + span * CLOSE_FRAC if trusted else GRIP_CLOSE
        open_ = self.cal[0] + span * OPEN_FRAC if trusted else GRIP_OPEN
        if self.closed:
            if g > open_:
                self.closed = False
        elif g < close:
            self.closed = True

    def label(self, g):
        if g is None:
            return "grip --"
        state = "CLOSED" if self.closed else "open"
        if self.cal is None or self.cal[1] - self.cal[0] <= GRIP_CAL_MIN_RANGE:
            return f"grip {g:.2f} SW  {state}  (default band; open and squeeze a few times)"
        return f"grip {g:.2f} SW  {state}  (cal {self.cal[0]:.2f}-{self.cal[1]:.2f})"


class Readout:
    """Per-session state for reading one person out of BODY_38.

    Call annotate() with each frame's best body; it draws onto the frame and
    returns the text lines describing the pose.
    """

    def __init__(self, table, shoulders, res_w, res_h):
        self.table = table
        self.shoulders = shoulders
        self.res_w, self.res_h = res_w, res_h
        self.grips = {"L": Grip(), "R": Grip()}
        self.shm = None                  # EMA biacromial width, meters

    # --- geometry helpers ------------------------------------------------
    def _norm(self, kp2, mp_i):
        """Normalized + mirrored, as tracker.js always sees them."""
        zi = first_valid(kp2, self.table.get(mp_i, []))
        if zi is None:
            return None
        x, y = kp2[zi]
        return np.array([1.0 - x / self.res_w, y / self.res_h])

    def _xyz(self, kp3, mp_i):
        zi = first_valid(kp3, self.table.get(mp_i, []))
        return None if zi is None else np.asarray(kp3[zi], dtype=float)

    def _pixels(self, kp2, mirror):
        px = {}
        for mp_i, candidates in self.table.items():
            zi = first_valid(kp2, candidates)
            if zi is None:
                continue
            x, y = kp2[zi]
            px[mp_i] = (int(self.res_w - x if mirror else x), int(y))
        return px

    # --- the one entry point ---------------------------------------------
    def annotate(self, frame, body, mirror=True, show_xyz=True):
        import cv2
        kp2 = np.asarray(body.keypoint_2d, dtype=float)
        kp3 = np.asarray(body.keypoint, dtype=float)
        px = self._pixels(kp2, mirror)

        for a, b in BONES:
            if a in px and b in px:
                cv2.line(frame, px[a], px[b], SAGE, 2, cv2.LINE_AA)
        for x, y in px.values():
            cv2.circle(frame, (x, y), 5, AMBER, -1, cv2.LINE_AA)

        # the game's frame: shoulder midpoint origin, shoulder-width units, y up
        shL, shR = self._norm(kp2, 11), self._norm(kp2, 12)
        sw_units = None
        if shL is not None and shR is not None:
            mid = (shL + shR) / 2.0
            sw = float(np.hypot(*(shL - shR)))
            if sw > 1e-4:
                sw_units = (mid, sw)
                # mid[0] is mirrored already; undo it when drawing raw
                ox = int(mid[0] * self.res_w if mirror
                         else self.res_w - mid[0] * self.res_w)
                oy = int(mid[1] * self.res_h)
                cv2.drawMarker(frame, (ox, oy), CREAM, cv2.MARKER_CROSS, 18, 2)
                cv2.circle(frame, (ox, oy), int(sw * self.res_w), CREAM, 1,
                           cv2.LINE_AA)

        li, ri = self.shoulders
        if kp3.shape[0] > max(li, ri) and np.isfinite(kp3[li]).all() \
                and np.isfinite(kp3[ri]).all():
            d = float(np.linalg.norm(kp3[li] - kp3[ri]))
            if 0.20 < d < 0.75:
                self.shm = d if self.shm is None else self.shm + (d - self.shm) * 0.05

        lines = [f"body conf {body.confidence:.0f}"
                 + (f"   shoulder {self.shm:.3f} m = {self.shm * 100:.1f} cm"
                    if self.shm else "   shoulder --"),
                 "xyz in meters, camera frame: X right, Y down, Z forward"]

        for mp_i, label in JOINTS.items():
            v = self._xyz(kp3, mp_i)
            if v is None:
                lines.append(f"{label:<12} --")
                continue
            line = (f"{label:<12} {v[0]:6.2f} {v[1]:6.2f} {v[2]:6.2f}"
                    f"   dist {np.linalg.norm(v):5.2f}")
            p = self._norm(kp2, mp_i)
            if sw_units is not None and p is not None:
                mid, sw = sw_units
                line += (f"   SW {(p[0] - mid[0]) / sw:6.2f},"
                         f"{-(p[1] - mid[1]) / sw:6.2f}")
            lines.append(line)
            if show_xyz and mp_i in px:
                draw_text(frame, f"{v[0]:.2f} {v[1]:.2f} {v[2]:.2f}",
                          (px[mp_i][0] + 8, px[mp_i][1] - 8), CREAM, 0.42)

        # trunk axis, for arm elevation exactly as tracker.js#armAngle does it
        trunk = None
        if sw_units is not None:
            hipL, hipR = self._norm(kp2, 23), self._norm(kp2, 24)
            if hipL is not None and hipR is not None:
                d = (hipL + hipR) / 2.0 - sw_units[0]
                if np.linalg.norm(d) > 1e-6:
                    trunk = d / np.linalg.norm(d)

        for side, (sh, el, wr, tip) in ARMS:
            elbow = angle_3d(self._xyz(kp3, sh), self._xyz(kp3, el),
                             self._xyz(kp3, wr))
            s2, w2, t2 = self._norm(kp2, sh), self._norm(kp2, wr), self._norm(kp2, tip)

            elevation = None
            if trunk is not None and s2 is not None and w2 is not None:
                arm = w2 - s2
                mag = np.linalg.norm(arm)
                if mag > 1e-6:
                    elevation = float(np.degrees(np.arccos(
                        np.clip(np.dot(arm, trunk) / mag, -1, 1))))

            g = None
            if sw_units is not None and w2 is not None and t2 is not None:
                g = float(np.linalg.norm(t2 - w2) / sw_units[1])
            grip = self.grips[side]
            grip.update(g)

            lines.append(
                f"{side} arm       elbow "
                + (f"{elbow:5.0f}d" if elbow is not None else "   --")
                + "   elevation "
                + (f"{elevation:5.0f}d" if elevation is not None else "   --")
                + "   " + grip.label(g))

            if wr in px:
                draw_text(frame, "CLOSED" if grip.closed else "open",
                          (px[wr][0] - 18, px[wr][1] + 26),
                          SAGE if grip.closed else AMBER, 0.5, 2)
                cv2.circle(frame, px[wr], 12,
                           SAGE if grip.closed else AMBER, 2, cv2.LINE_AA)

        return lines

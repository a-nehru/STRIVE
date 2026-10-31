"""Upper-limb plausibility for the ZED's 3D skeleton (31 Oct 2026, by request).

PhysScore (Hasan et al., "Beyond MPJPE: A Physics-Based Audit of Monocular 3D
Human Pose Estimation", PhysHuman workshop, CVPR 2026) scores a whole-body
motion for how physically possible it is: foot skating, ground penetration,
jerk, joint limits, self-penetration, balance. A seated patient doing arm work
has no feet or balance to judge, so this keeps the arm's share of the idea
(written here from the paper's definitions; the package itself carries no
licence) and adds what PhysScore does not do: a FIT that makes the tracking
better, not only a score that says how bad it is.

THE CHECKS (`plausibility`), per arm, over a recording:
  - bone CoV: how much the upper arm and the forearm change length (a real
    bone does not; the ZED's depth noise does);
  - jerk: the third derivative of the wrist's and the elbow's 3D path, m/s^3
    (median and 95th percentile). A human arm is smooth; a depth spike is not.
    This mixes tracking noise with the patient's own shakiness, so compare
    the same recording raw against fitted, never one patient against another;
  - elbow past its limit: frames with the elbow flexed beyond ELBOW_MAX
    degrees, which no elbow does (flagged, never clamped: a patient's real
    range must not be clipped to a textbook one);
  - depth spikes: frames where a joint jumps more than SPIKE_M in depth.

THE FIT (`ArmFit`): the ZED finds each joint in the image well and its depth
poorly, and depth error is what makes a bone stretch and shrink. So each arm's
upper-arm and forearm lengths are learnt from the frames where the bone lies
across the picture (where depth error barely changes its length), as a
running median, and every frame the elbow is slid along ITS OWN camera ray
(the image position stays exactly what was detected) to the point at the
upper arm's length from the shoulder; the wrist the same from the corrected
elbow, and the hand points move with the wrist. Where the ray misses that
sphere (the picture and the length disagree) the nearest point on the ray is
taken. Of the two points where the ray meets it, the one nearer the measured
depth (blended with the last fit, so it cannot flip between them) is kept.

WHAT THE FIRST TEST FOUND (31 Oct 2026, the 899-frame recording of 23 Oct):
the fit is NOT used live. The bridge runs the SDK's body fitting
(`enable_body_fitting = True`), which already holds every bone at a fixed
length: the raw arms' length spread was 0.7-1.1 %, and upper arm and forearm
both came out at 0.283 m on both sides, the SDK's own skeleton rather than
this patient's arm. With nothing left to correct, the fit only added jitter
(wrist jerk p95 121 -> 177 m/s^3, left). The checks stay as the lab's
measure; the fit is here for 3D that is NOT already fitted (body fitting off,
another 3D source), where the patient's own lengths are what it would learn.
A caution that follows: with body fitting on, the ZED's 3D arm lengths are
the SDK's, so 3D reach (the assessment's volumeM3) carries its proportions.

    py -3.12 tools\\armfit.py tools\\recordings\\2026-10-23_133457

scores a tracking-lab recording raw and fitted and writes armfit.md beside it.
numpy only, so it runs anywhere the bridge does.
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np

SH = {"left": 11, "right": 12}
EL = {"left": 13, "right": 14}
WR = {"left": 15, "right": 16}
HANDPTS = {"left": (17, 19, 21), "right": (18, 20, 22)}
LEN_RANGE = {"upper": (0.18, 0.45), "fore": (0.16, 0.40)}   # metres: adult arms
ACROSS = 0.6          # a bone counts for its length when its depth change is under this share of it
MIN_SAMPLES = 20      # lengths learnt from at least this many frames before the fit starts
WINDOW = 300          # frames the running median looks back over
MAX_SHIFT = 0.35      # metres: a correction bigger than this is not trusted
ELBOW_MAX = 160.0     # degrees of flexion no elbow reaches
SPIKE_M = 0.25        # metres of depth in one frame


def _pt(lm3, i):
    """lm3 as the bridge's 33-long list or the recording's {"13": [x, y, z]} dict."""
    v = lm3.get(str(i), lm3.get(i)) if isinstance(lm3, dict) else (lm3[i] if i < len(lm3) else None)
    if v is None:
        return None
    a = np.asarray(v[:3], dtype=float)
    return a if np.isfinite(a).all() and a[2] > 0.1 else None


def _set(lm3, i, p):
    v = [round(float(x), 4) for x in p]
    if isinstance(lm3, dict):
        lm3[str(i) if any(isinstance(k, str) for k in lm3) else i] = v
    else:
        lm3[i] = v


def onto_sphere(p, c, L, prefer):
    """The point on the camera ray through p at distance L from c, nearest `prefer`."""
    n = np.linalg.norm(p)
    if n < 1e-6:
        return p
    d = p / n
    b = float(d @ c)
    disc = b * b - (float(c @ c) - L * L)
    if disc < 0:
        t = b                           # the ray misses the sphere: its nearest point to it
    else:
        r = math.sqrt(disc)
        t1, t2 = b - r, b + r
        t = t1 if np.linalg.norm(d * t1 - prefer) <= np.linalg.norm(d * t2 - prefer) else t2
    if t <= 0.1:
        return p
    return d * t


class ArmFit:
    """Bone-length fit for one person's arms (one per seat in the bridge)."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.buf = {(s, g): deque(maxlen=WINDOW) for s in SH for g in LEN_RANGE}
        self.prev = {}

    def lengths(self, side):
        u, f = self.buf[(side, "upper")], self.buf[(side, "fore")]
        if len(u) < MIN_SAMPLES or len(f) < MIN_SAMPLES:
            return None
        return float(np.median(u)), float(np.median(f))

    def _observe(self, side, a, b, seg):
        if a is None or b is None:
            return
        v = b - a
        L = float(np.linalg.norm(v))
        lo, hi = LEN_RANGE[seg]
        # only a bone lying across the picture: its depth error barely moves its length
        if lo <= L <= hi and abs(v[2]) < ACROSS * L:
            self.buf[(side, seg)].append(L)

    def fit(self, lm3):
        """A fitted copy of lm3 (same format); the lengths learn from the raw frame first."""
        out = {k: list(v) for k, v in lm3.items()} if isinstance(lm3, dict) else [list(v) for v in lm3]
        for side in SH:
            s, e, w = _pt(lm3, SH[side]), _pt(lm3, EL[side]), _pt(lm3, WR[side])
            self._observe(side, s, e, "upper")
            self._observe(side, e, w, "fore")
            Ls = self.lengths(side)
            if Ls is None or s is None or e is None:
                continue
            pe = self.prev.get((side, "e"))
            e2 = onto_sphere(e, s, Ls[0], e if pe is None else 0.5 * e + 0.5 * pe)
            if np.linalg.norm(e2 - e) > MAX_SHIFT:
                e2 = e
            _set(out, EL[side], e2)
            self.prev[(side, "e")] = e2
            if w is None:
                continue
            pw = self.prev.get((side, "w"))
            w2 = onto_sphere(w, e2, Ls[1], w if pw is None else 0.5 * w + 0.5 * pw)
            if np.linalg.norm(w2 - w) > MAX_SHIFT:
                w2 = w
            _set(out, WR[side], w2)
            self.prev[(side, "w")] = w2
            dw = w2 - w
            for i in HANDPTS[side]:
                h = _pt(lm3, i)
                if h is not None:
                    _set(out, i, h + dw)
        return out


def _flexion(s, e, w):
    a, b = s - e, w - e
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-6 or nb < 1e-6:
        return None
    return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, float(a @ b) / (na * nb)))))


def plausibility(frames):
    """frames: [(t_seconds, lm3)]. Per arm: bone CoV %, wrist and elbow jerk
    (median, p95, m/s^3), share of frames past ELBOW_MAX, depth spikes %, and
    the mean frame-to-frame 3D step of the wrist (mm)."""
    out = {}
    for side in SH:
        up, fo, flex = [], [], []
        track = {"wrist": [], "elbow": []}
        for t, lm3 in frames:
            s, e, w = _pt(lm3, SH[side]), _pt(lm3, EL[side]), _pt(lm3, WR[side])
            if s is not None and e is not None:
                up.append(np.linalg.norm(e - s))
            if e is not None and w is not None:
                fo.append(np.linalg.norm(w - e))
            if s is not None and e is not None and w is not None:
                f = _flexion(s, e, w)
                if f is not None:
                    flex.append(f)
            track["wrist"].append((t, w))
            track["elbow"].append((t, e))
        cov = lambda xs: round(100 * float(np.std(xs)) / float(np.mean(xs)), 1) if len(xs) > 2 and np.mean(xs) > 0 else None
        res = {"upper_cov": cov(up), "fore_cov": cov(fo),
               "upper_m": round(float(np.median(up)), 3) if up else None, "fore_m": round(float(np.median(fo)), 3) if fo else None,
               "elbow_past_limit_pct": round(100 * sum(f > ELBOW_MAX for f in flex) / len(flex), 1) if flex else None}
        for j, tr in track.items():
            jerks, spikes, pairs, steps = [], 0, 0, []
            for k in range(len(tr) - 1):
                (t0, p0), (t1, p1) = tr[k], tr[k + 1]
                if p0 is not None and p1 is not None and 0 < t1 - t0 < 0.25:
                    pairs += 1
                    spikes += abs(p1[2] - p0[2]) > SPIKE_M
                    steps.append(np.linalg.norm(p1 - p0))
            for k in range(len(tr) - 3):
                seg = tr[k:k + 4]
                if any(p is None for _, p in seg):
                    continue
                ts = [t for t, _ in seg]
                dts = np.diff(ts)
                if (dts <= 0).any() or (dts > 0.25).any():
                    continue
                ps = [p for _, p in seg]
                v = [(ps[i + 1] - ps[i]) / dts[i] for i in range(3)]
                a = [(v[i + 1] - v[i]) / ((dts[i] + dts[i + 1]) / 2) for i in range(2)]
                jerks.append(float(np.linalg.norm((a[1] - a[0]) / ((dts[0] + 2 * dts[1] + dts[2]) / 4))))
            res[f"{j}_jerk_med"] = round(float(np.median(jerks))) if jerks else None
            res[f"{j}_jerk_p95"] = round(float(np.percentile(jerks, 95))) if jerks else None
            res[f"{j}_spikes_pct"] = round(100 * spikes / pairs, 1) if pairs else None
            if j == "wrist":
                res["wrist_step_mm"] = round(1000 * float(np.mean(steps)), 1) if steps else None
        out[side] = res
    return out


def score_recording(d):
    """Raw and fitted plausibility of a tracking-lab recording's ZED body."""
    rows = [json.loads(l) for l in open(os.path.join(d, "log.jsonl")) if l.strip()]
    raw, fitted, fit = [], [], ArmFit()
    for r in rows:
        z = (r.get("zed") or [None])[0]
        if not z or not z.get("lm3"):
            continue
        t = r["t_ms"] / 1000.0
        raw.append((t, z["lm3"]))
        fitted.append((t, fit.fit(z["lm3"])))
    return len(raw), plausibility(raw), plausibility(fitted), {s: fit.lengths(s) for s in SH}


COLS = [("upper_cov", "upper arm CoV %"), ("fore_cov", "forearm CoV %"), ("wrist_jerk_med", "wrist jerk med"),
        ("wrist_jerk_p95", "wrist jerk p95"), ("elbow_jerk_med", "elbow jerk med"), ("elbow_jerk_p95", "elbow jerk p95"),
        ("wrist_spikes_pct", "wrist depth spikes %"), ("elbow_spikes_pct", "elbow depth spikes %"),
        ("elbow_past_limit_pct", f"elbow past {ELBOW_MAX:.0f} deg %"), ("wrist_step_mm", "wrist step mm")]


def report_md(name, n, raw, fitted, lengths):
    lines = [f"## Upper-limb plausibility: {name}", "",
             f"{n} frames with a 3D ZED body. Lower is better everywhere; the jerk is m/s^3 and mixes the "
             "tracking's noise with the arm's own movement, so read raw against fitted on the same recording.", "",
             "| arm | measure | raw | fitted |", "|---|---|---|---|"]
    for side in SH:
        for k, label in COLS:
            lines.append(f"| {side} | {label} | {raw[side].get(k)} | {fitted[side].get(k)} |")
        L = lengths.get(side)
        lines.append(f"| {side} | learnt lengths (upper, fore) m | | {f'{L[0]:.3f}, {L[1]:.3f}' if L else 'not enough frames'} |")
    return "\n".join(lines) + "\n"


def main():
    for d in sys.argv[1:] or []:
        n, raw, fitted, lengths = score_recording(d)
        md = report_md(os.path.basename(os.path.abspath(d)), n, raw, fitted, lengths)
        open(os.path.join(d, "armfit.md"), "w").write(md)
        print(md)
    if len(sys.argv) < 2:
        print(__doc__)


if __name__ == "__main__":
    main()

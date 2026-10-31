"""Score a tracking-lab recording offline: run the chosen hand and body
models again on every logged frame (the same wrist crops the live run used)
and write report.md next to it, one row per model, the numbers the lab shows
live but over the whole recording.

    py -3.12 tools\\compare_models.py tools\\recordings\\2026-10-23_1142 --hands mediapipe,wilor --body yolo,vitpose

Ground truth there is none; the report is what each model DID on the same
frames: how often it saw the hand, how steady it was, how long it took.
Record a scripted session (hand still open 10 s, still closed 10 s, five
slow open-close, a reach forward, a reach across) and the steadiness of a
still hand and the separation of open from closed are what to read.
"""
import argparse
import json
import math
import os
import statistics
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from handmodels import HAND_MODELS, BODY_MODELS          # noqa: E402
from handmodels.base import curl, aperture              # noqa: E402
from handmodels.client import RemoteModel               # noqa: E402
from model_lab import cut, crops_from_lm                # noqa: E402
import armfit                                           # noqa: E402


def pct(a, b):
    return round(100.0 * a / b, 1) if b else None


def sd(xs):
    return round(statistics.pstdev(xs), 3) if len(xs) > 1 else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rec")
    ap.add_argument("--hands", default="mediapipe,wilor")
    ap.add_argument("--body", default="")
    ap.add_argument("--every", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0, help="only the first N frames")
    args = ap.parse_args()
    d = args.rec
    lines = [json.loads(l) for l in open(os.path.join(d, "log.jsonl")) if l.strip()]
    if args.limit:
        lines = lines[:args.limit]
    lines = lines[::args.every]
    meta = json.load(open(os.path.join(d, "meta.json"))) if os.path.exists(os.path.join(d, "meta.json")) else {}
    hands = [h for h in args.hands.split(",") if h in HAND_MODELS]
    bodies = [b for b in args.body.split(",") if b in BODY_MODELS]
    models = {}
    for n in hands + bodies:
        t = time.time()
        if n == "mediapipe":
            from handmodels.mp_hands import MediaPipeHands
            models[n] = MediaPipeHands()
        else:
            models[n] = RemoteModel(n)
        print(f"{n}: loaded in {time.time() - t:.1f} s")
    res = {n: [] for n in models}
    W = None
    # a recording without the ZED (webcam, file): the wrist crops come from a
    # body model's wrists, YOLO if it is in the run, else one loaded for the job
    need_crops = hands and not any((r.get("crops") or (r.get("zed") or [None])[0]) for r in lines)
    cropper = models.get("yolo") or models.get("vitpose") or (RemoteModel("yolo") if need_crops else None)
    for i, rec in enumerate(lines):
        bgr = cv2.imread(os.path.join(d, "frames", rec["file"]))
        if bgr is None:
            continue
        W = bgr.shape[1]
        crops = rec.get("crops") or {}
        zed = (rec.get("zed") or [None])[0]
        if not crops and zed:
            crops = crops_from_lm({int(k): v for k, v in zed["lm"].items()}, W)
        boxes = [zed["box"]] if zed and zed.get("box") else None
        if not crops and cropper is not None:
            people = cropper.detect_body(bgr)
            if people:
                p = max(people, key=lambda p: len(p["lm"]))
                crops = crops_from_lm(p["lm"], W)
                boxes = [p["box"]] if p.get("box") else None
        for n, m in models.items():
            t0 = time.perf_counter()
            if n in hands:
                out = {}
                for side, crop in crops.items():
                    sub, x0, y0 = cut(bgr, crop)
                    if sub.size == 0:
                        continue
                    r = m.detect(cv2.cvtColor(sub, cv2.COLOR_BGR2RGB), side, rec["t_ms"])
                    if r:
                        out[side] = {"c": np.mean(np.asarray(r["pts"]), axis=0) + [x0, y0],
                                     "curl": curl(r.get("world")), "ap": aperture(r.get("world"))}
                res[n].append({"tried": list(crops), "hands": out, "ms": (time.perf_counter() - t0) * 1000})
            else:
                people = m.detect_body(bgr, boxes if n == "vitpose" else None)
                res[n].append({"people": people, "ms": (time.perf_counter() - t0) * 1000})
        if i % 50 == 0:
            print(f"  {i}/{len(lines)}", end="\r")
    print()
    # the ZED's own body from the log, scored like the others
    zrows = [(r.get("zed") or [None])[0] for r in lines]
    rows = []
    rows.append("| model | side | frames | seen % | ms (median) | jitter px | curl mean ± sd | aperture mean ± sd |")
    rows.append("|---|---|---|---|---|---|---|---|")
    for n in hands:
        R = res[n]
        for side in ("left", "right"):
            tried = [r for r in R if side in r["tried"]]
            got = [r for r in tried if side in r["hands"]]
            cs = [r["hands"][side]["curl"] for r in got if r["hands"][side]["curl"] is not None]
            aps = [r["hands"][side]["ap"] for r in got if r["hands"][side]["ap"] is not None]
            cents = [r["hands"][side]["c"] for r in got]
            jit = statistics.mean(float(np.linalg.norm(cents[k] - cents[k - 1])) for k in range(1, len(cents))) if len(cents) > 2 else None
            rows.append(f"| {n} | {side} | {len(tried)} | {pct(len(got), len(tried))} | "
                        f"{statistics.median(r['ms'] for r in R):.0f} | {jit:.2f} | " if jit is not None else
                        f"| {n} | {side} | {len(tried)} | {pct(len(got), len(tried))} | {statistics.median(r['ms'] for r in R) if R else 0:.0f} | - | ")
            rows[-1] += (f"{statistics.mean(cs):.2f} ± {sd(cs)} | " if cs else "- | ") + (f"{statistics.mean(aps):.2f} ± {sd(aps)} |" if aps else "- |")
    rows.append("")
    rows.append("| body model | frames | seen % | ms (median) | joints | wrist jitter L / R px | forearm CoV L / R % | upper arm CoV L / R % |")
    rows.append("|---|---|---|---|---|---|---|---|")

    def body_row(name, frames):
        got = [p for p in frames if p]
        joints = statistics.mean(len(p["lm"]) for p in got) if got else 0

        def jit(wi):
            pts = [np.asarray(p["lm"][wi][:2]) for p in got if wi in p["lm"]]
            return f"{statistics.mean(float(np.linalg.norm(pts[k] - pts[k - 1])) for k in range(1, len(pts))):.2f}" if len(pts) > 2 else "-"

        def cov(a, b):
            L3 = [math.dist(p["lm3"][a], p["lm3"][b]) for p in got if p.get("lm3") and a in p["lm3"] and b in p["lm3"]]
            if len(L3) > 2 and statistics.mean(L3) > 0.01:
                return f"{100 * statistics.pstdev(L3) / statistics.mean(L3):.1f} (3D, {statistics.mean(L3):.2f} m)"
            L = [math.hypot(p["lm"][a][0] - p["lm"][b][0], p["lm"][a][1] - p["lm"][b][1]) for p in got if a in p["lm"] and b in p["lm"]]
            return f"{100 * statistics.pstdev(L) / statistics.mean(L):.1f}" if len(L) > 2 and statistics.mean(L) > 1 else "-"
        return (f"| {name} | {len(frames)} | {pct(len(got), len(frames))} | {{ms}} | {joints:.1f} | {jit(15)} / {jit(16)} | "
                f"{cov(13, 15)} / {cov(14, 16)} | {cov(11, 13)} / {cov(12, 14)} |")
    if any(zrows):
        rows.append(body_row("zed", [{"lm": {int(k): v for k, v in z["lm"].items()}, "lm3": {int(k): v for k, v in z.get("lm3", {}).items()}} if z else None for z in zrows]).replace("{ms}", "-"))
    for n in bodies:
        R = res[n]
        prim = [max(r["people"], key=lambda p: len(p["lm"])) if r["people"] else None for r in R]
        prim = [{"lm": {int(k): v for k, v in p["lm"].items()}} if p else None for p in prim]
        rows.append(body_row(n, prim).replace("{ms}", f"{statistics.median(r['ms'] for r in R):.0f}" if R else "-"))
    head = [f"# Tracking lab report: {os.path.basename(os.path.abspath(d))}", "",
            f"{len(lines)} frames scored (every {args.every}), source {meta.get('source', {})}", "",
            "Hand models ran on the recorded wrist crops; body models on the whole frame. "
            "seen = frames with a detection; jitter = mean frame-to-frame move of the landmarks' centroid (a still hand should read near 0); "
            "curl about 2 open / 1 fist; CoV = bone length spread (a constant bone reads 0).", ""]
    report = "\n".join(head + rows) + "\n"
    # the ZED body's upper-limb plausibility (armfit.py, PhysScore's arm checks), raw and bone-fitted
    n3, raw3, fit3, lens = armfit.score_recording(d)
    if n3:
        report += "\n" + armfit.report_md(os.path.basename(os.path.abspath(d)), n3, raw3, fit3, lens)
    open(os.path.join(d, "report.md"), "w").write(report)
    print(report)
    for m in list(models.values()) + ([cropper] if cropper is not None and cropper not in models.values() else []):
        if hasattr(m, "close"):
            m.close()


if __name__ == "__main__":
    main()

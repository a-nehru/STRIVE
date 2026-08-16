"""
STRIVE ZED viewer: live camera, skeleton, and joint positions in one window.

zed_test.py answers "does the ZED work"; this answers "what is it seeing right
now". It opens the camera exactly as zed_bridge.py does and draws:

  * the left-eye RGB image, mirrored so it behaves like a mirror (as the game
    does)
  * the BODY_38 skeleton over the person
  * XYZ in meters for the joints the game cares about, in the SDK's camera
    frame (X right, Y down, Z forward from the lens)
  * the same numbers in the game's own coordinate system: shoulder-width units
    (SW) measured from the shoulder midpoint, y-up, which is what tracker.js
    hands to the games - so you can see the numbers the game actually plays on
  * the measured biacromial width, the value the bridge sends as "shm" and the
    game stores as an automatic shoulderCm
  * per arm: elbow flexion from the 3D joints (180 = straight), arm elevation
    against the trunk axis (tracker.js#armAngle: 0 = down, 180 = overhead),
    and the grasp state from the game's own self-calibrating fingertip grip
  * the body model level, depth mode, and which GPU is doing the work

The white circle is 1 SW from the shoulder midpoint: a hand out at the circle
is one shoulder-width from center, roughly where mid-range game targets sit.

    python tools/zed_view.py
    python tools/zed_view.py --profile balanced --no-mirror

Keys:  q / Esc quit   m mirror   x XYZ labels on joints   s save a PNG

Stop the bridge before running this - two processes cannot hold the ZED.
Requires: ZED SDK + pyzed, opencv-python, numpy.
"""

import argparse
import os
import sys
import time

import cv2
import pyzed.sl as sl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zed_bridge import PROFILES, resolve_indexes           # noqa: E402
from zed_common import AMBER, CREAM, DIM, SAGE, Readout, draw_text, gpu_info  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", choices=PROFILES, default="fast")
    ap.add_argument("--max-range", type=float, default=3.5)
    ap.add_argument("--min-conf", type=float, default=40.0)
    ap.add_argument("--no-mirror", action="store_true",
                    help="show the raw camera image instead of the mirror view")
    ap.add_argument("--width", type=int, default=1100, help="window width")
    args = ap.parse_args()

    P = PROFILES[args.profile]
    table, shoulders = resolve_indexes()

    init = sl.InitParameters()
    init.camera_resolution = getattr(sl.RESOLUTION, P["res"])
    init.camera_fps = P["fps"]
    init.depth_mode = (getattr(sl.DEPTH_MODE, P["depth"])
                       if hasattr(sl.DEPTH_MODE, P["depth"])
                       else sl.DEPTH_MODE.PERFORMANCE)
    init.depth_minimum_distance = 0.8
    init.depth_maximum_distance = args.max_range
    init.coordinate_units = sl.UNIT.METER

    zed = sl.Camera()
    st = zed.open(init)
    if st != sl.ERROR_CODE.SUCCESS:
        raise SystemExit(f"camera open failed: {st} "
                         "(is zed_bridge.py still running?)")

    pt = sl.PositionalTrackingParameters()
    pt.set_as_static = True
    zed.enable_positional_tracking(pt)

    bt = sl.BodyTrackingParameters()
    bt.detection_model = getattr(sl.BODY_TRACKING_MODEL, P["model"])
    bt.body_format = sl.BODY_FORMAT.BODY_38
    bt.enable_tracking = True
    bt.enable_body_fitting = True
    for name, value in (("allow_reduced_precision_inference", P["fp16"]),
                        ("max_range", args.max_range),
                        ("prediction_timeout_s", 0.0)):
        if hasattr(bt, name):
            setattr(bt, name, value)
    if zed.enable_body_tracking(bt) != sl.ERROR_CODE.SUCCESS:
        zed.close()
        raise SystemExit("body tracking failed to start")

    run = sl.RuntimeParameters()
    if hasattr(run, "enable_fill_mode"):
        run.enable_fill_mode = False
    rt = sl.BodyTrackingRuntimeParameters()
    rt.detection_confidence_threshold = args.min_conf

    cam = zed.get_camera_information().camera_configuration.resolution
    res_w, res_h = cam.width, cam.height
    win = "STRIVE ZED view"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, args.width, int(args.width * res_h / res_w))

    image, bodies = sl.Mat(), sl.Bodies()
    readout = Readout(table, shoulders, res_w, res_h)
    mirror = not args.no_mirror
    show_xyz = True
    shots = 0
    n, t0, fps = 0, time.perf_counter(), 0.0

    gpu = gpu_info()
    depth_name = getattr(init.depth_mode, "name", str(init.depth_mode))
    print(f"\nZED view: {res_w}x{res_h} @ {P['fps']} requested")
    print(f"  body model    {P['model']}  (BODY_38, fitting on, "
          f"confidence >= {args.min_conf:.0f})")
    print(f"  depth mode    {depth_name}"
          + (", fp16 inference" if P["fp16"] else "")
          + f", range 0.8-{args.max_range} m")
    print(f"  compute       {gpu or 'no NVIDIA GPU reported by nvidia-smi'}")
    print("  (body tracking and NEURAL depth are CUDA: this is all on the GPU)")
    print("\n  q quits, m mirrors, x toggles XYZ labels, s saves a PNG.\n")

    while True:
        if zed.grab(run) != sl.ERROR_CODE.SUCCESS:
            time.sleep(0.002)
            continue
        n += 1
        zed.retrieve_image(image, sl.VIEW.LEFT, sl.MEM.CPU)
        frame = cv2.cvtColor(image.get_data(), cv2.COLOR_BGRA2BGR)
        if mirror:
            frame = cv2.flip(frame, 1)

        zed.retrieve_bodies(bodies, rt)
        best = None
        for body in bodies.body_list:
            if best is None or body.confidence > best.confidence:
                best = body

        if best is None:
            hud = ["no body - stand 1.0-2.5 m back, facing the camera"]
        else:
            hud = readout.annotate(frame, best, mirror, show_xyz)

        y = 28
        draw_text(frame, f"{fps:5.1f} fps   {'mirror' if mirror else 'raw'}"
                         f"   {P['model']}   {depth_name}"
                         f"   {(gpu or 'no GPU').split(',')[0]}",
                  (16, y), SAGE, 0.6, 2)
        for line in hud:
            y += 24
            draw_text(frame, line, (16, y),
                      AMBER if "no body" in line else CREAM, 0.52)
        draw_text(frame, "q quit   m mirror   x labels   s save",
                  (16, frame.shape[0] - 16), DIM, 0.45)

        cv2.imshow(win, frame)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break
        elif key == ord("m"):
            mirror = not mirror
        elif key == ord("x"):
            show_xyz = not show_xyz
        elif key == ord("s"):
            shots += 1
            path = os.path.abspath(f"zed_view_{shots:02d}.png")
            cv2.imwrite(path, frame)
            print(f"  saved {path}")

        if n % 30 == 0:
            t1 = time.perf_counter()
            fps = 30 / (t1 - t0)
            t0 = t1

    cv2.destroyAllWindows()
    zed.disable_body_tracking()
    zed.close()


if __name__ == "__main__":
    main()

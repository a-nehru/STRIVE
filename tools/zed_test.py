"""
STRIVE ZED camera test: checks the ZED works before you blame the game.

Runs the same path zed_bridge.py does, one stage at a time, and says which
stage fails:

    1  pyzed imports, SDK version
    2  camera is plugged in and enumerated
    3  camera opens at the profile's resolution/fps
    4  frames actually arrive (measured fps, not the requested one)
    5  depth is sane (valid pixels, distance at the image center)
    6  BODY_38 body tracking sees a person
    7  the bridge's BODY_38 -> MediaPipe landmark map resolves on this SDK,
       and the landmarks the game needs (shoulders, wrists, hands) are live

Nothing here touches the game or localStorage; it only reads the camera.

During the body stage it shows the RGB camera feed with the skeleton drawn on
it and the live tracking numbers - joint XYZ, the game's shoulder-width
coordinates, elbow angle, arm elevation, grasp - the same overlay zed_view.py
uses (both call zed_common.Readout, so they cannot disagree). The arm lines
are echoed to the console once a second too, so they end up in the terminal
log; --no-preview drops back to a one-line progress counter.

    python tools/zed_test.py                 # 10 s body-tracking window
    python tools/zed_test.py --seconds 20    # more time to get in frame
    python tools/zed_test.py --no-preview    # no window, console only
    python tools/zed_test.py --profile balanced

Stand 1.0-2.5 m back, facing the camera, with your whole upper body in view.
The body stage needs a person; an empty room is a real FAIL, not a bug.

Requires: ZED SDK + pyzed, numpy (opencv-python only for --preview).
Run it on the machine the ZED is plugged into. Under WSL the camera is not
visible unless USB is forwarded (usbipd), so run it from Windows Python.
"""

import argparse
import os
import platform
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zed_common import gpu_info                            # noqa: E402

RESULTS = []
WIN = "STRIVE ZED test"


def report(stage, ok, detail=""):
    """One checklist line; remembered for the summary."""
    mark = "PASS" if ok else "FAIL"
    dots = "." * max(2, 34 - len(stage))
    print(f"  {stage} {dots} {mark}   {detail}")
    RESULTS.append((stage, ok, detail))
    return ok


def note(text):
    print(f"       {text}")


def is_wsl():
    if platform.system() != "Linux":
        return False
    try:
        with open("/proc/version") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="fast",
                    help="profile from zed_bridge.PROFILES (fast | balanced)")
    ap.add_argument("--seconds", type=float, default=10.0,
                    help="how long to watch for a body (default 10)")
    ap.add_argument("--warmup-seconds", type=float, default=3.0,
                    help="frame/depth timing window before the body stage")
    ap.add_argument("--max-range", type=float, default=3.5)
    ap.add_argument("--min-conf", type=float, default=40.0,
                    help="body detection confidence threshold, as in the bridge")
    ap.add_argument("--no-preview", action="store_true",
                    help="run headless; by default the body stage shows the "
                         "camera with the skeleton and live tracking numbers")
    args = ap.parse_args()

    print("\nSTRIVE ZED test")
    print(f"  python {platform.python_version()} on {platform.system()}"
          f"{' (WSL)' if is_wsl() else ''}\n")

    # 1 - pyzed ---------------------------------------------------------
    try:
        import pyzed.sl as sl
    except Exception as e:                                  # noqa: BLE001
        report("pyzed import", False, repr(e))
        note("Install the ZED SDK and its Python API (get_python_api.py).")
        if is_wsl():
            note("WSL cannot see the camera by default: run this on Windows.")
        return summarize()
    try:
        ver = sl.Camera.get_sdk_version()
    except Exception:                                       # noqa: BLE001
        ver = "version unknown"
    report("pyzed import", True, f"SDK {ver}")

    gpu = gpu_info()
    report("CUDA GPU present", gpu is not None, gpu or "nvidia-smi found no GPU")
    if gpu is None:
        note("Body tracking and NEURAL depth run on CUDA; without an NVIDIA")
        note("GPU the camera still streams video but no skeleton is produced.")

    # the bridge's mapping table is the thing the game depends on; if it
    # cannot even be imported, the bridge cannot run either.
    bridge = None
    try:
        import zed_bridge as bridge
    except Exception as e:                                  # noqa: BLE001
        report("zed_bridge import", False, repr(e))
        note("The bridge needs opencv-python and numpy; the game path is")
        note("broken until that import works, even if the camera is fine.")

    profiles = getattr(bridge, "PROFILES", None) or {
        "fast": dict(res="HD720", fps=60, depth="NEURAL_LIGHT",
                     model="HUMAN_BODY_MEDIUM", fp16=True),
    }
    if args.profile not in profiles:
        print(f"\n  unknown profile {args.profile!r}; have {list(profiles)}")
        return 2
    P = profiles[args.profile]

    # 2 - device present -------------------------------------------------
    devices = []
    if hasattr(sl.Camera, "get_device_list"):
        devices = list(sl.Camera.get_device_list())
        if devices:
            d = devices[0]
            report("camera detected", True,
                   f"{getattr(d, 'camera_model', '?')} sn {getattr(d, 'serial_number', '?')}"
                   + (f" (+{len(devices) - 1} more)" if len(devices) > 1 else ""))
        else:
            report("camera detected", False, "no ZED enumerated")
            note("Check the USB 3 cable and port (blue), and that no other")
            note("process holds the camera (the bridge, ZED Explorer, Depth Viewer).")
            if is_wsl():
                note("Under WSL you must forward the USB device with usbipd,")
                note("or just run this from Windows Python instead.")
            return summarize()
    else:
        report("camera detected", True, "(SDK build has no get_device_list; skipped)")

    # 3 - open -----------------------------------------------------------
    init = sl.InitParameters()
    init.camera_resolution = getattr(sl.RESOLUTION, P["res"])
    init.camera_fps = P["fps"]
    if hasattr(sl.DEPTH_MODE, P["depth"]):
        init.depth_mode = getattr(sl.DEPTH_MODE, P["depth"])
        depth_used = P["depth"]
    else:
        init.depth_mode = sl.DEPTH_MODE.PERFORMANCE
        depth_used = "PERFORMANCE (fallback)"
    init.depth_minimum_distance = 0.8
    init.depth_maximum_distance = args.max_range
    init.coordinate_units = sl.UNIT.METER

    zed = sl.Camera()
    st = zed.open(init)
    if st != sl.ERROR_CODE.SUCCESS:
        report("camera open", False, str(st))
        note("CAMERA_NOT_DETECTED / NO_GPU_COMPATIBLE means the SDK sees no")
        note("device or no usable CUDA GPU. CAMERA_FAILED_TO_SETUP is often")
        note("another process already streaming from the ZED.")
        return summarize()

    info = zed.get_camera_information()
    cam = info.camera_configuration.resolution
    res_w, res_h = cam.width, cam.height
    report("camera open", True,
           f"{res_w}x{res_h} @ {P['fps']} req, depth {depth_used}")
    note(f"model {getattr(info, 'camera_model', '?')}, "
         f"sn {getattr(info, 'serial_number', '?')}, "
         f"fw {getattr(info.camera_configuration, 'firmware_version', '?')}")

    try:
        run_stages(sl, zed, args, P, res_w, res_h, bridge)
    finally:
        zed.close()
    return summarize()


def run_stages(sl, zed, args, P, res_w, res_h, bridge):
    run = sl.RuntimeParameters()
    if hasattr(run, "enable_fill_mode"):
        run.enable_fill_mode = False

    # 4 - frames arrive ---------------------------------------------------
    grabbed, failed, t0 = 0, 0, time.perf_counter()
    while time.perf_counter() - t0 < args.warmup_seconds:
        if zed.grab(run) == sl.ERROR_CODE.SUCCESS:
            grabbed += 1
        else:
            failed += 1
            time.sleep(0.002)
    elapsed = time.perf_counter() - t0
    fps = grabbed / elapsed if elapsed else 0.0
    ok = grabbed > 0 and fps >= P["fps"] * 0.5
    report("frames arriving", ok,
           f"{fps:.1f} fps measured ({grabbed} frames, {failed} grab misses)")
    if grabbed and not ok:
        note(f"Well under the requested {P['fps']} fps. Usually a USB 2 port,")
        note("a busy GPU, or the ACCURATE model on a small GPU.")
    if not grabbed:
        note("No frames at all: the camera opened but never produced an image.")
        return

    # 5 - depth -----------------------------------------------------------
    depth = sl.Mat()
    zed.retrieve_measure(depth, sl.MEASURE.DEPTH)
    dm = np.asarray(depth.get_data(), dtype=float)
    finite = np.isfinite(dm)
    valid_frac = float(finite.mean()) if dm.size else 0.0
    cx, cy = res_w // 2, res_h // 2
    patch = dm[max(0, cy - 20):cy + 20, max(0, cx - 20):cx + 20]
    patch = patch[np.isfinite(patch)]
    center_m = float(np.median(patch)) if patch.size else float("nan")
    ok = valid_frac > 0.15
    report("depth map", ok,
           f"{valid_frac * 100:.0f}% valid, center "
           + (f"{center_m:.2f} m" if np.isfinite(center_m) else "no reading"))
    if not ok:
        note("Very little valid depth. Common causes: lens cap/finger on one")
        note("eye, a blank wall with no texture, or everything closer than")
        note(f"{0.8:.1f} m / beyond {args.max_range:.1f} m.")

    # 6 - body tracking ----------------------------------------------------
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
        report("body tracking starts", False, f"model {P['model']}")
        note("The body module failed to initialise - usually a GPU/VRAM limit.")
        return
    report("body tracking starts", True, f"BODY_38, model {P['model']}")

    # 7 - landmark map ------------------------------------------------------
    table, shoulders = None, None
    if bridge is not None:
        try:
            table, shoulders = bridge.resolve_indexes()
            report("landmark map resolves", True,
                   f"{len(table)} MediaPipe points mapped from BODY_38")
        except SystemExit as e:                             # bridge raises this
            report("landmark map resolves", False, str(e))

    print(f"\n  Watching for a body for {args.seconds:.0f} s - "
          "stand 1.0-2.5 m back, facing the camera.\n")

    bodies = sl.Bodies()
    rt = sl.BodyTrackingRuntimeParameters()
    rt.detection_confidence_threshold = args.min_conf

    # the RGB feed with the skeleton and the live numbers, unless asked not to
    cv2, readout, image = None, None, None
    if not args.no_preview:
        try:
            import cv2 as cv2                               # noqa: PLC0414
            from zed_common import Readout, draw_text, AMBER, CREAM, SAGE
            image = sl.Mat()
            if table:
                readout = Readout(table, shoulders, res_w, res_h)
            cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(WIN, 1100, int(1100 * res_h / res_w))
        except Exception as e:                              # noqa: BLE001
            cv2 = None
            note(f"no preview window ({e!r}); continuing headless.")

    frames = seen = 0
    best_conf = 0.0
    shoulder_m = []
    filled = {}
    t0 = last_echo = time.perf_counter()
    while time.perf_counter() - t0 < args.seconds:
        if zed.grab(run) != sl.ERROR_CODE.SUCCESS:
            time.sleep(0.002)
            continue
        frames += 1
        zed.retrieve_bodies(bodies, rt)
        best = None
        for body in bodies.body_list:
            if best is None or body.confidence > best.confidence:
                best = body
        if best is not None:
            seen += 1
            best_conf = max(best_conf, float(best.confidence))
            kp2 = np.asarray(best.keypoint_2d, dtype=float)
            kp3 = np.asarray(best.keypoint, dtype=float)
            if table:
                for mp_i, candidates in table.items():
                    for zi in candidates:
                        if zi < len(kp2) and np.isfinite(kp2[zi]).all():
                            filled[mp_i] = filled.get(mp_i, 0) + 1
                            break
            if shoulders:
                li, ri = shoulders
                if kp3.shape[0] > max(li, ri):
                    a, b = kp3[li], kp3[ri]
                    if np.isfinite(a).all() and np.isfinite(b).all():
                        d = float(np.linalg.norm(a - b))
                        if 0.20 < d < 0.75:
                            shoulder_m.append(d)

        # the same overlay and numbers the viewer draws, so the two tools
        # cannot disagree about a pose
        lines = []
        if cv2 is not None:
            zed.retrieve_image(image, sl.VIEW.LEFT, sl.MEM.CPU)
            frame = cv2.flip(cv2.cvtColor(image.get_data(), cv2.COLOR_BGRA2BGR), 1)
            if best is not None and readout is not None:
                lines = readout.annotate(frame, best, mirror=True)
            elif best is None:
                lines = ["no body - stand 1.0-2.5 m back, facing the camera"]
            left = args.seconds - (time.perf_counter() - t0)
            draw_text(frame, f"zed_test  {left:4.1f}s left   frames {frames}"
                             f"   seen {seen}", (16, 28), SAGE, 0.6, 2)
            y = 28
            for line in lines:
                y += 24
                draw_text(frame, line, (16, y),
                          AMBER if "no body" in line else CREAM, 0.52)
            draw_text(frame, "q ends this stage early",
                      (16, frame.shape[0] - 16), CREAM, 0.45)
            cv2.imshow(WIN, frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        left = args.seconds - (time.perf_counter() - t0)
        # console echo once a second, so the numbers are visible headless too
        if lines and time.perf_counter() - last_echo > 1.0:
            last_echo = time.perf_counter()
            print(" " * 78, end="\r")
            print(f"    [{left:4.1f}s]  " + "\n              ".join(
                l for l in lines if l.startswith(("L arm", "R arm", "body conf"))))
        else:
            print(f"    {left:4.1f}s left   body: {'yes' if best is not None else 'no '}"
                  f"   frames {frames}", end="\r")

    print(" " * 78, end="\r")
    if cv2 is not None:
        cv2.destroyAllWindows()

    hit = seen / frames if frames else 0.0
    report("body detected", seen > 0,
           f"{hit * 100:.0f}% of {frames} frames, best confidence {best_conf:.0f}")
    if seen == 0:
        note("No skeleton at all. Was someone in frame? Otherwise: too close")
        note(f"(<0.8 m), past --max-range ({args.max_range} m), or too dark.")
    elif hit < 0.5:
        note("Intermittent tracking would make game targets jump. Try more")
        note("even lighting, a plainer background, or --profile balanced.")

    if shoulder_m:
        sm = float(np.median(shoulder_m))
        report("shoulder width (depth)", 0.25 < sm < 0.60,
               f"{sm:.3f} m = {sm * 100:.1f} cm")
        note("The game uses this to convert its shoulder-width units to cm,")
        note("so no tape measure is needed when the bridge is running.")
    elif seen:
        report("shoulder width (depth)", False, "no usable 3D shoulder pair")

    if table and seen:
        needed = {11: "L shoulder", 12: "R shoulder", 15: "L wrist", 16: "R wrist",
                  19: "L index tip", 20: "R index tip", 21: "L thumb tip",
                  22: "R thumb tip", 23: "L hip", 24: "R hip"}
        missing = [n for i, n in needed.items() if filled.get(i, 0) < seen * 0.5]
        report("game landmarks live", not missing,
               "all present" if not missing else "missing " + ", ".join(missing))
        if missing:
            note("Those points drive reach and the grasp fallback; if hands are")
            note("missing, keep them unoccluded and inside the frame.")

    zed.disable_body_tracking()


def summarize():
    print()
    bad = [s for s, ok, _ in RESULTS if not ok]
    if not RESULTS:
        print("  no checks ran")
        return 2
    if bad:
        print(f"  {len(RESULTS) - len(bad)}/{len(RESULTS)} checks passed. "
              f"Failed: {', '.join(bad)}")
        print("  The game falls back to webcam + MediaPipe while this is broken.")
        return 1
    print(f"  All {len(RESULTS)} checks passed - the ZED is good to go.")
    print("  Start the bridge with:  python tools/zed_bridge.py")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)

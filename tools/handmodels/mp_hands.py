"""Google's Hand Landmarker, in-process, one VIDEO-mode landmarker per side
so the two hands are never confused (moved here from zed_bridge.HandWorker)."""
import os
import time

from .base import HandModel

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/1/hand_landmarker.task")
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "models", "hand_landmarker.task")


def ensure_model(path=MODEL_PATH):
    if not os.path.exists(path):
        import requests
        print(f"  downloading the MediaPipe hand model (7.8 MB) to {path}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        r = requests.get(MODEL_URL, timeout=120)
        r.raise_for_status()
        open(path, "wb").write(r.content)
    return path


class MediaPipeHands(HandModel):
    name = "mediapipe"

    def __init__(self, model_path=MODEL_PATH, min_conf=0.5, delegate="CPU"):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        self.mp = mp
        path = ensure_model(model_path)

        def make():
            base = BaseOptions(model_asset_path=path)
            if delegate == "GPU" and hasattr(BaseOptions.Delegate, "GPU"):
                base = BaseOptions(model_asset_path=path, delegate=BaseOptions.Delegate.GPU)
            opts = vision.HandLandmarkerOptions(
                base_options=base, running_mode=vision.RunningMode.VIDEO, num_hands=1,
                min_hand_detection_confidence=min_conf, min_tracking_confidence=min_conf)
            return vision.HandLandmarker.create_from_options(opts)
        self.lm = {"left": make(), "right": make()}
        self.t_ms = {"left": 0, "right": 0}

    def detect(self, rgb, side, t_ms=None):
        h, w = rgb.shape[:2]
        img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb)
        ts = int(t_ms if t_ms is not None else time.monotonic() * 1000)
        ts = max(ts, self.t_ms[side] + 1)          # must strictly increase
        self.t_ms[side] = ts
        res = self.lm[side].detect_for_video(img, ts)
        if not res.hand_landmarks:
            return None
        pts = [[p.x * w, p.y * h] for p in res.hand_landmarks[0]]
        world = None
        if getattr(res, "hand_world_landmarks", None):
            world = [[p.x, p.y, p.z] for p in res.hand_world_landmarks[0]]
        conf = 1.0
        if getattr(res, "handedness", None) and res.handedness[0]:
            conf = float(res.handedness[0][0].score)
        return {"pts": pts, "world": world, "conf": conf}

    def info(self):
        return {"name": self.name, "device": "cpu", "model": os.path.basename(MODEL_PATH)}

"""Ultralytics YOLO11 pose: 17 COCO keypoints per person, CUDA. A monocular
second opinion on the arm next to the ZED's BODY_38 (2D only; depth would
come from sampling the ZED depth map at its wrists). Weights download into
tools/models on first use. Licence note: Ultralytics is AGPL-3.0."""
import os

from .base import BodyModel

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
# COCO-17 index -> the game's MediaPipe-33 index
COCO_TO_MP = {0: 0, 5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 11: 23, 12: 24}


class YoloPose(BodyModel):
    name = "yolo"

    def __init__(self, weights="yolo11n-pose.pt", imgsz=640, conf=0.25, device=None, half=True):
        from ultralytics import YOLO
        import torch
        os.makedirs(MODELS_DIR, exist_ok=True)
        path = weights if os.path.isabs(weights) else os.path.join(MODELS_DIR, weights)
        self.model = YOLO(path)                 # ultralytics downloads to this path if missing
        self.device = device if device is not None else (0 if torch.cuda.is_available() else "cpu")
        self.imgsz, self.conf, self.half = imgsz, conf, half and self.device != "cpu"
        self.weights = os.path.basename(path)

    def detect(self, bgr):
        res = self.model.predict(bgr, imgsz=self.imgsz, conf=self.conf, device=self.device,
                                 half=self.half, verbose=False)
        out = []
        if not res or res[0].keypoints is None:
            return out
        r = res[0]
        xy = r.keypoints.xy.cpu().numpy()
        kc = r.keypoints.conf.cpu().numpy() if r.keypoints.conf is not None else None
        boxes = r.boxes.xyxy.cpu().numpy() if r.boxes is not None else None
        for i in range(xy.shape[0]):
            lm = {}
            for ci, mi in COCO_TO_MP.items():
                c = float(kc[i][ci]) if kc is not None else 1.0
                x, y = float(xy[i][ci][0]), float(xy[i][ci][1])
                if c > 0.05 and (x > 0 or y > 0):
                    lm[mi] = [x, y, c]
            out.append({"lm": lm, "box": boxes[i].tolist() if boxes is not None else None})
        return out

    def info(self):
        return {"name": self.name, "device": str(self.device), "model": self.weights, "imgsz": self.imgsz}

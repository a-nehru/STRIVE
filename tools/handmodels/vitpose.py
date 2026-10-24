"""ViTPose++ (Xu et al. 2023): a plain-ViT top-down pose model with MoE
experts, 17 COCO keypoints, CUDA, through Hugging Face transformers
(usyd-community/vitpose-plus-*). Top-down means it needs a person box first:
the caller can pass the ZED body's box, otherwise a YOLO11n person detector
runs. Weights download from Hugging Face on first use (~350 MB for base)."""
import os

import numpy as np

from .base import BodyModel
from .yolo_pose import COCO_TO_MP, MODELS_DIR

DEFAULT = "usyd-community/vitpose-plus-base"


class ViTPose(BodyModel):
    name = "vitpose"

    def __init__(self, model_id=DEFAULT, device=None, half=True, det_conf=0.3):
        import torch
        from transformers import AutoProcessor, VitPoseForPoseEstimation
        self.torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.dtype = torch.float16 if (half and self.device == "cuda") else torch.float32
        self.proc = AutoProcessor.from_pretrained(model_id)
        self.model = VitPoseForPoseEstimation.from_pretrained(model_id, torch_dtype=self.dtype).to(self.device).eval()
        self.model_id = model_id
        self.det = None
        self.det_conf = det_conf

    def _person_boxes(self, bgr):
        if self.det is None:
            from ultralytics import YOLO
            os.makedirs(MODELS_DIR, exist_ok=True)
            self.det = YOLO(os.path.join(MODELS_DIR, "yolo11n.pt"))   # downloads there if missing
        r = self.det.predict(bgr, classes=[0], conf=self.det_conf, device=0 if self.device == "cuda" else "cpu",
                             verbose=False)[0]
        return r.boxes.xyxy.cpu().numpy().tolist() if r.boxes is not None else []

    def detect(self, bgr, boxes=None):
        boxes = boxes if boxes else self._person_boxes(bgr)
        if not boxes:
            return []
        from PIL import Image
        img = Image.fromarray(bgr[:, :, ::-1])
        # transformers wants COCO-style boxes: [x, y, w, h]
        xywh = [[b[0], b[1], b[2] - b[0], b[3] - b[1]] for b in boxes]
        inputs = self.proc(img, boxes=[xywh], return_tensors="pt").to(self.device)
        inputs["pixel_values"] = inputs["pixel_values"].to(self.dtype)
        kw = {}
        if "plus" in self.model_id:          # MoE experts: 0 = COCO body
            kw["dataset_index"] = self.torch.zeros(len(xywh), dtype=self.torch.int64, device=self.device)
        with self.torch.no_grad():
            out = self.model(**inputs, **kw)
        out.heatmaps = out.heatmaps.float()      # the DARK post-processing is float32-only
        res = self.proc.post_process_pose_estimation(out, boxes=[xywh])[0]
        people = []
        for i, r in enumerate(res):
            kp = r["keypoints"].float().cpu().numpy()
            sc = r["scores"].float().cpu().numpy()
            lm = {}
            for ci, mi in COCO_TO_MP.items():
                if ci < len(kp) and sc[ci] > 0.05:
                    lm[mi] = [float(kp[ci][0]), float(kp[ci][1]), float(sc[ci])]
            people.append({"lm": lm, "box": boxes[i]})
        return people

    def info(self):
        return {"name": self.name, "device": self.device, "model": self.model_id.split("/")[-1]}

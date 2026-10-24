"""WiLoR (Potamias et al. 2024): a YOLO hand detector plus a ViT-based MANO
hand mesh regressor, CUDA. Packaged by warmshao/WiLoR-mini, weights from
Hugging Face on first use (gitignored under the user's HF cache).

Why it is here: on impaired, partly occluded hands MediaPipe returns no
prediction on roughly one frame in five while WiLoR, HaMeR and WildHands
fail on under one in a hundred (arXiv 2606.17427). It runs on a crop about
the ZED wrist exactly like the MediaPipe model does.

Output joints: HaMeR/WiLoR reorder MANO into OpenPose hand order, which is
MediaPipe's order too (wrist, thumb CMC..tip, index MCP..tip, middle, ring,
pinky), so the game's curl and aperture read them unchanged. If a build ever
returns native MANO order, set JOINT_ORDER = MANO_TO_MP.
"""
import numpy as np

from .base import HandModel

MANO_TO_MP = [0, 13, 14, 15, 16, 1, 2, 3, 17, 4, 5, 6, 18, 10, 11, 12, 19, 7, 8, 9, 20]
JOINT_ORDER = None          # None = already MediaPipe/OpenPose order


class WiLoRHands(HandModel):
    name = "wilor"

    def __init__(self, device=None, half=True):
        import torch
        from wilor_mini.pipelines.wilor_hand_pose3d_estimation_pipeline import \
            WiLorHandPose3dEstimationPipeline
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.dtype = torch.float16 if (half and self.device == "cuda") else torch.float32
        self.pipe = WiLorHandPose3dEstimationPipeline(device=self.device, dtype=self.dtype,
                                                      verbose=False)
        self.torch = torch

    @staticmethod
    def _arr(v):
        if hasattr(v, "detach"):
            v = v.detach().float().cpu().numpy()
        return np.asarray(v, dtype=float)

    def detect(self, rgb, side, t_ms=None):
        outs = self.pipe.predict(rgb)
        if not outs:
            return None
        want_right = 1 if side == "right" else 0
        h, w = rgb.shape[:2]
        cx, cy = w / 2, h / 2

        def score(o):
            box = o.get("hand_bbox", [0, 0, w, h])
            bx, by = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            same = int(round(float(o.get("is_right", want_right)))) == want_right
            # the crop is centred on the wanted wrist: prefer the matching hand,
            # then the one nearest the centre
            return (0 if same else 1, (bx - cx) ** 2 + (by - cy) ** 2)
        o = min(outs, key=score)
        p = o["wilor_preds"]
        k2 = self._arr(p["pred_keypoints_2d"])
        k3 = self._arr(p["pred_keypoints_3d"])
        k2 = k2[0] if k2.ndim == 3 else k2
        k3 = k3[0] if k3.ndim == 3 else k3
        if JOINT_ORDER is not None:
            k2, k3 = k2[JOINT_ORDER], k3[JOINT_ORDER]
        k3 = k3 - k3[0]                    # hand-centred on the wrist, metres
        conf = float(p.get("hand_conf", o.get("conf", 1.0))) if isinstance(p, dict) else 1.0
        return {"pts": k2[:, :2].tolist(), "world": k3.tolist(), "conf": conf,
                "is_right": int(round(float(o.get("is_right", want_right))))}

    def info(self):
        return {"name": self.name, "device": self.device, "dtype": str(self.dtype).split(".")[-1]}

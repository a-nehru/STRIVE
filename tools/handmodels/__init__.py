"""Pluggable tracking models for the ZED bridge and the tracking lab.

Hand models (21 points, run on a crop about a wrist):
  mediapipe  - Google's Hand Landmarker (CPU, in-process; what the game shipped with)
  wilor      - WiLoR (ViT hand mesh, CUDA, via tools/.venv-hands)
Body models (a second opinion next to the ZED's BODY_38):
  yolo       - Ultralytics YOLO11 pose (17 COCO keypoints, CUDA, via tools/.venv-hands)
  vitpose    - ViTPose++ (plain ViT, top-down, 17 COCO keypoints, CUDA, transformers)

Everything heavy lives in tools/.venv-hands and is reached through
`client.RemoteModel`, a worker subprocess speaking a tiny length-prefixed
protocol over its pipes (see worker.py), so the Python that holds pyzed is
never asked to carry torch. The MediaPipe hand model stays in-process: it
is small and the bridge already shipped with it.
"""
HAND_MODELS = ("mediapipe", "wilor")
BODY_MODELS = ("yolo", "vitpose")
REMOTE = {"wilor", "yolo", "vitpose"}        # run in the venv worker, not in-process

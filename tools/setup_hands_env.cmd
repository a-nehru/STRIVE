@echo off
rem Creates tools\.venv-hands: the CUDA venv for WiLoR, YOLO pose and MediaPipe
rem (tools\handmodels, used by zed_bridge.py --hand-model wilor and model_lab.py).
rem Its own venv on purpose: torch must never touch the Python that holds pyzed.
cd /d %~dp0..
py -3.12 -m venv tools\.venv-hands
call tools\.venv-hands\Scripts\activate.bat
python -m pip install --upgrade pip
pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
pip install "numpy<2.3" opencv-python mediapipe ultralytics transformers dill
pip install smplx==0.1.28 timm einops huggingface_hub scikit-image roma
pip install --no-deps git+https://github.com/warmshao/WiLoR-mini
pip install --no-build-isolation --no-deps git+https://github.com/mattloper/chumpy
python -c "import torch, ultralytics, mediapipe, wilor_mini; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"

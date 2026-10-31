# Compensation detection on TRSP: rules, RF, LSTM, AcT, spatial-temporal transformer

Frame-level, real-time-compatible detection of post-stroke compensation (shoulder elevation,
trunk rotation, lean forward) on the Toronto Rehab Stroke Posture dataset.

## Setup

```bash
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Unzip the Kaggle archive somewhere, then open `train.py` and set `ROOT` to the folder that
contains `data_new/` (the `robot/` folder in the archive is a duplicate and isn't used).

JAX on an NVIDIA GPU (Linux): `pip install -U "jax[cuda12]"` instead of `jax[cpu]`.
On CPU everything still runs; on a recent laptop expect roughly 10–30 min for the full set.

## Run

```bash
# healthy-only training -> tested on the 9 stroke patients
python train.py --protocol h2p  --models Rules RF LSTM AcT STT
# leave-one-patient-out over the 9 stroke patients (main result)
python train.py --protocol lopo --models Rules RF LSTM AcT STT
# metrics (add --smooth 10 to see the effect of a causal 10-frame moving average)
python metrics.py
python metrics.py --smooth 10
```

Options: `--epochs` (default 10), `--stride` (training-window stride, default 4; use 1–2 on a
fast machine for more training data). Results land in `results/`: one `.npz` of stroke-frame
predictions per protocol × model, `metrics_smooth*.json`, and saved weights (`*_params.pkl`).

## What's inside

| File | Contents |
|---|---|
| `data.py` | Loader. Labels 1=none, 2=shoulder elevation, 3=trunk rotation, 4=lean forward. Right-arm trials mirrored so the moving arm is always the same side. Keeps only MediaPipe-compatible joints (head, shoulders, elbows, wrists, hands, hips + derived mid-shoulder, mid-hip). Features per joint: pose relative to mid-shoulder + displacement from the trial's first 10 frames (calibration). Causal 30-frame windows; label = last frame. |
| `models.py` | JAX/Flax: `LSTMNet`; `AcT` (re-implementation of Mazzia et al. 2022: per-frame token, [CLS], learned positions, Transformer encoder; d=64, 4 heads, 3 layers); `STT` (factorized spatial-temporal transformer: a token per joint per frame, alternating joint-attention and time-attention; uses every 2nd frame). |
| `train.py` | Protocols and training (AdamW, warmup-cosine, class-weighted cross-entropy, jitter augmentation). `Rules` = the same four-measure, threshold-on-calibrated-change logic as `compensation.js`, with thresholds tuned on the training fold. |
| `metrics.py` | Per-class precision/recall/F1 (argmax) and AUC, "any compensation" F1/AUC, false-alarm rate, per-patient breakdown. |

## Results so far (healthy-only → 9 stroke patients, 10 epochs, stride 4)

| Model | Shoulder elev F1 / AUC | Trunk rot F1 / AUC | Lean fwd F1 / AUC | Any comp. F1 / AUC | False alarms |
|---|---|---|---|---|---|
| Rules | 0.09 / 0.70 | 0.23 / 0.71 | 0.00 / 0.91 | 0.21 / 0.65 | 20% |
| RF | 0.01 / 0.79 | 0.34 / 0.83 | 0.02 / 0.79 | 0.31 / 0.73 | 8% |
| LSTM | 0.12 / 0.71 | 0.34 / 0.73 | 0.03 / 0.69 | 0.26 / 0.61 | 15% |
| AcT | 0.10 / 0.86 | 0.24 / 0.73 | 0.09 / 0.90 | 0.20 / 0.67 | 17% |

Reference: Dolatabadi et al. (healthy-simulated → stroke, RNN) reported F1 0.07 (shoulder
elevation), 0.27 (trunk rotation), 0.17 (lean forward).
Leave-one-patient-out and STT results: run the commands above.

## Caveats

* 9 patients and few compensation frames (519 shoulder-elev, 1023 trunk-rot, 290 lean-fwd):
  per-class numbers are noisy; one seed per fold.
* High AUC with low F1 (e.g. lean forward) means the model ranks frames well but the argmax
  operating point is off for patients, whose compensations are smaller than healthy people's
  simulated ones. Per-patient threshold calibration is the obvious next step.
* Kinect 3D ≠ MediaPipe; expect a further drop when feeding webcam landmarks.

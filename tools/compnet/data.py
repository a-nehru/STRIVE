"""TRSP (Toronto Rehab Stroke Posture) loader and preprocessing.

Layout: data_new/<SUBJ>/<TRIAL>/Joint_Positions.csv (25 Kinect v2 joints x xyz per frame, one
joint per row) and Labels.csv (one label per frame).
Labels: 1 = no compensation, 2 = shoulder elevation, 3 = trunk rotation, 4 = lean forward.
Coordinates arrive already scaled so shoulder width = 1.

Preprocessing choices (all real-time compatible):
  * Right-arm trials are mirrored so the moving ("active") arm is always the same side.
  * Only joints MediaPipe Pose can also provide are kept (head, shoulders, elbows, wrists,
    hands, hips) plus derived mid-shoulder and mid-hip, so the model can later be fed MediaPipe.
  * Two channels per joint: pose relative to the current mid-shoulder (shape), and
    displacement from the trial's baseline pose (median of the first BASE_FRAMES frames),
    i.e. the same per-session calibration the game detector uses.
  * Causal windows of T frames ending at each frame; label = label of the last frame.
"""
import glob, os, re
import numpy as np

CLASSES = ["none", "shoulder_elev", "trunk_rot", "lean_fwd"]
LABEL_MAP = {1: 0, 2: 1, 3: 2, 4: 3}
K = dict(SpBase=0, Neck=2, Head=3, ShL=4, ElL=5, WrL=6, HandL=7, ShR=8, ElR=9, WrR=10,
         HandR=11, HipL=12, HipR=16, SpSh=20)
JOINT_NAMES = ["Head", "ShA", "ElA", "WrA", "HandA", "ShO", "ElO", "WrO", "HandO",
               "HipA", "HipO", "MidSh", "MidHip"]
BASE_FRAMES = 10


def _select(J, arm):
    """J: (T,25,3) -> (T,13,3) in active/other order, mirrored so active arm is 'left'."""
    if arm == "L":
        a = [K["ShL"], K["ElL"], K["WrL"], K["HandL"]]; o = [K["ShR"], K["ElR"], K["WrR"], K["HandR"]]
        ha, ho = K["HipL"], K["HipR"]
    else:
        a = [K["ShR"], K["ElR"], K["WrR"], K["HandR"]]; o = [K["ShL"], K["ElL"], K["WrL"], K["HandL"]]
        ha, ho = K["HipR"], K["HipL"]
    S = J[:, [K["Head"]] + a + o + [ha, ho]].copy()
    if arm == "R":
        S[..., 0] *= -1  # mirror lateral axis
    midsh = (S[:, 1] + S[:, 5]) / 2
    midhip = (S[:, 9] + S[:, 10]) / 2
    return np.concatenate([S, midsh[:, None], midhip[:, None]], axis=1)


def features(S):
    """S: (T,13,3) -> (T,13,6): [pose relative to mid-shoulder, displacement from baseline]."""
    rel = S - S[:, 11:12]
    base = np.median(S[:BASE_FRAMES], axis=0, keepdims=True)
    disp = S - base
    return np.concatenate([rel, disp], axis=-1).astype(np.float32)


def load(root):
    trials = []
    for d in sorted(glob.glob(os.path.join(root, "data_new", "*", "*"))):
        subj, name = d.split(os.sep)[-2:]
        arm = re.search(r"_(L|R)(?:_\d)?$", name).group(1)
        J = np.loadtxt(os.path.join(d, "Joint_Positions.csv"), delimiter=",").reshape(-1, 25, 3)
        y = np.array([LABEL_MAP[int(v)] for v in open(os.path.join(d, "Labels.csv")).read().split()])
        S = _select(J, arm)
        trials.append(dict(subj=subj, group=subj[0], name=name, arm=arm, S=S,
                           X=features(S), y=y))
    return trials


class WindowSet:
    """Concatenates trials (front-padded with the first frame) and indexes causal windows."""

    def __init__(self, trials, T=30):
        self.T = T
        Xs, ys, starts, subj, tid = [], [], [], [], []
        off = 0
        for i, tr in enumerate(trials):
            X = np.concatenate([np.repeat(tr["X"][:1], T - 1, axis=0), tr["X"]])
            n = len(tr["y"])
            Xs.append(X); ys.append(tr["y"])
            starts.append(off + np.arange(n)); subj += [tr["subj"]] * n; tid += [i] * n
            off += len(X)
        self.X = np.concatenate(Xs)
        self.y = np.concatenate(ys)
        self.start = np.concatenate(starts)
        self.subj = np.array(subj)
        self.trial = np.array(tid)

    def __len__(self):
        return len(self.y)

    def batch(self, idx):
        w = self.start[idx][:, None] + np.arange(self.T)
        return self.X[w], self.y[idx]  # (B,T,13,6), (B,)

    def last_frame(self, idx):
        return self.X[self.start[idx] + self.T - 1]

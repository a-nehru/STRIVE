"""Compute metrics on stroke-patient frames from saved predictions.

Per compensation class (one-vs-rest on the argmax decision): precision, recall, F1;
plus ROC AUC from the class score. 'Any compensation' collapses the three classes into one
(what a game needs: is the patient compensating right now?). Optional temporal smoothing
(causal moving average of probabilities, as a game would apply) via --smooth N frames.
"""
import argparse, glob, json, os
import numpy as np
from sklearn.metrics import roc_auc_score, precision_recall_fscore_support

CLS = ["shoulder_elev", "trunk_rot", "lean_fwd"]


def causal_smooth(p, trial, n):
    if n <= 1:
        return p
    out = np.empty_like(p)
    for t in np.unique(trial):
        m = np.where(trial == t)[0]
        c = np.cumsum(np.vstack([np.zeros((1, p.shape[1])), p[m]]), axis=0)
        k = np.arange(1, len(m) + 1)
        lo = np.maximum(k - n, 0)
        out[m] = (c[k] - c[lo]) / (k - lo)[:, None]
    return out


def evaluate(path, smooth=1):
    d = np.load(path)
    p, y = d["probs"], d["y"]
    is_rules = "_Rules" in path
    if not is_rules:
        p = causal_smooth(p, d["trial"], smooth)
    pred = p.argmax(1)
    res = {}
    for c, name in enumerate(CLS, start=1):
        yt, yp = y == c, pred == c
        pr, rc, f1, _ = precision_recall_fscore_support(yt, yp, average="binary", zero_division=0)
        auc = roc_auc_score(yt, p[:, c]) if yt.any() and not yt.all() else float("nan")
        res[name] = dict(P=pr, R=rc, F1=f1, AUC=auc, n=int(yt.sum()))
    yt, yp = y > 0, pred > 0
    score_any = p[:, 1:].max(1) if is_rules else 1 - p[:, 0]
    pr, rc, f1, _ = precision_recall_fscore_support(yt, yp, average="binary", zero_division=0)
    res["any"] = dict(P=pr, R=rc, F1=f1, AUC=roc_auc_score(yt, score_any), n=int(yt.sum()))
    res["macroF1_3cls"] = float(np.mean([res[c]["F1"] for c in CLS]))
    res["false_alarm_rate"] = float(np.mean(yp[~yt]))       # flagged frames when patient was fine
    # per-patient any-compensation F1 (patients with positives only)
    per = {}
    for s in np.unique(d["subj"]):
        m = d["subj"] == s
        per[str(s)] = dict(
            F1_any=float(precision_recall_fscore_support(yt[m], yp[m], average="binary", zero_division=0)[2])
            if yt[m].any() else None,
            false_alarm=float(np.mean(yp[m][~yt[m]])))
    res["per_patient"] = per
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--smooth", type=int, default=1)
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    allres = {}
    for f in sorted(glob.glob(os.path.join(here, "results", "*.npz"))):
        key = os.path.basename(f)[:-4]
        allres[key] = r = evaluate(f, a.smooth)
        print(f"{key:12s} " + " ".join(f"{c[:5]} F1 {r[c]['F1']:.2f} AUC {r[c]['AUC']:.2f} |" for c in CLS)
              + f" any F1 {r['any']['F1']:.2f} AUC {r['any']['AUC']:.2f} FA {r['false_alarm_rate']:.2f}")
    with open(os.path.join(here, "results", f"metrics_smooth{a.smooth}.json"), "w") as fh:
        json.dump(allres, fh, indent=1, default=float)

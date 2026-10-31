"""Train/evaluate compensation detectors on TRSP.

Protocols
  lopo : leave-one-patient-out. For each of the 9 stroke patients, train on all healthy
         subjects (real + simulated compensations) + the other 8 patients, test on the held-out one.
  h2p  : train on healthy subjects only (simulated compensations), test on all 9 patients.

Models: Rules (calibrated thresholds, = compensation.js logic), RF, LSTM, AcT, STT.
Predictions on stroke-patient frames are saved to results/<protocol>_<model>.npz.

Usage: python3 train.py --protocol lopo --models Rules RF LSTM AcT STT --epochs 12
"""
import argparse, json, os, time
import numpy as np
import jax, jax.numpy as jnp, optax
from data import load, WindowSet, CLASSES
from models import MODELS

ROOT = "path/to/trsp"   # folder containing data_new/
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")


# ---------------------------------------------------------------- rule-based (compensation.js logic)
def rule_metrics(F):
    """F: (N,13,6) last-frame features -> (N,3) [shoulder_elev, trunk_rot, lean_fwd] magnitudes."""
    rel, disp = F[..., :3], F[..., 3:]
    dM = disp[:, 11]
    base_rel = rel - (disp - dM[:, None])
    yaw = lambda r: np.degrees(np.arctan2(r[:, 1, 2] - r[:, 5, 2], r[:, 1, 0] - r[:, 5, 0]))
    rot = np.abs(((yaw(rel) - yaw(base_rel)) + 180) % 360 - 180)
    fwd = -dM[:, 2]                                   # camera at -z: leaning forward lowers z
    hs = rel[:, 0, 1] - rel[:, 1, 1]                  # head height above active shoulder
    hs0 = base_rel[:, 0, 1] - base_rel[:, 1, 1]
    elev = hs0 - hs                                   # shrinks when shoulder hikes
    return np.stack([elev, rot, fwd], axis=1)


def f1_bin(y, p):
    tp = np.sum(y & p); fp = np.sum(~y & p); fn = np.sum(y & ~p)
    return 2 * tp / max(2 * tp + fp + fn, 1)


class Rules:
    def fit(self, F, y):
        M = rule_metrics(F)
        self.thr = []
        for c in range(3):
            cand = np.quantile(M[:, c], np.linspace(0.5, 0.995, 120))
            f1s = [f1_bin(y == c + 1, M[:, c] > t) for t in cand]
            self.thr.append(cand[int(np.argmax(f1s))])
        self.thr = np.array(self.thr)
        return self

    def predict_proba(self, F):
        M = rule_metrics(F)
        s = M / self.thr                                 # 1.0 = at threshold
        # column 0 = 1 when every score is below threshold, so argmax == rule decision;
        # columns 1..3 keep the raw metric ratios (used as continuous scores for AUC)
        none = (s.max(1, keepdims=True) < 1).astype(np.float32)
        return np.concatenate([none, s], axis=1), M


# ---------------------------------------------------------------- random forest
def rf_features(ws, idx):
    xb, _ = ws.batch(idx)
    last = xb[:, -1].reshape(len(idx), -1)
    mean_disp = xb[..., 3:].mean(1).reshape(len(idx), -1)
    return np.concatenate([last, mean_disp], axis=1)


# ---------------------------------------------------------------- deep models
def train_deep(name, ws, tr_idx, epochs, seed, batch=256, lr=1e-3):
    model = MODELS[name]()
    rng = jax.random.PRNGKey(seed)
    x0, _ = ws.batch(tr_idx[:2])
    params = model.init({"params": rng, "dropout": rng}, jnp.asarray(x0), train=False)["params"]
    steps = epochs * (len(tr_idx) // batch)
    sched = optax.warmup_cosine_decay_schedule(0, lr, max(steps // 20, 1), steps)
    opt = optax.chain(optax.clip_by_global_norm(1.0), optax.adamw(sched, weight_decay=1e-4))
    opt_state = opt.init(params)
    counts = np.bincount(ws.y[tr_idx], minlength=4).astype(np.float32)
    cw = jnp.asarray(np.sqrt(counts.sum() / (4 * np.maximum(counts, 1))))

    @jax.jit
    def step(params, opt_state, x, y, key):
        def loss_fn(p):
            logits = model.apply({"params": p}, x, train=True, rngs={"dropout": key})
            ce = optax.softmax_cross_entropy_with_integer_labels(logits, y)
            return jnp.sum(ce * cw[y]) / jnp.sum(cw[y])
        loss, g = jax.value_and_grad(loss_fn)(params)
        upd, opt_state = opt.update(g, opt_state, params)
        return optax.apply_updates(params, upd), opt_state, loss

    nrng = np.random.default_rng(seed)
    for ep in range(epochs):
        perm = nrng.permutation(tr_idx)
        losses = []
        for i in range(0, len(perm) - batch + 1, batch):
            xb, yb = ws.batch(perm[i:i + batch])
            xb = xb + nrng.normal(0, 0.01, xb.shape).astype(np.float32)   # jitter augmentation
            rng, k = jax.random.split(rng)
            params, opt_state, loss = step(params, opt_state, jnp.asarray(xb), jnp.asarray(yb), k)
            losses.append(float(loss))
        print(f"    {name} ep{ep + 1:02d} loss {np.mean(losses):.4f}", flush=True)

    @jax.jit
    def infer(params, x):
        return jax.nn.softmax(model.apply({"params": params}, x, train=False), -1)

    def predict(idx):
        out = []
        for i in range(0, len(idx), 1024):
            xb, _ = ws.batch(idx[i:i + 1024])
            out.append(np.asarray(infer(params, jnp.asarray(xb))))
        return np.concatenate(out)
    return predict, params


# ---------------------------------------------------------------- driver
def run(protocol, models, epochs, stride):
    os.makedirs(OUT, exist_ok=True)
    trials = load(ROOT)
    ws = WindowSet(trials, T=30)
    is_p = np.char.startswith(ws.subj.astype(str), "P")
    patients = sorted(set(ws.subj[is_p]))
    folds = [(p, np.where(is_p & (ws.subj != p))[0], np.where(ws.subj == p)[0]) for p in patients] \
        if protocol == "lopo" else [("all", np.array([], int), np.where(is_p)[0])]
    h_idx = np.where(~is_p)[0]
    test_all = np.where(is_p)[0]
    timing = {}
    for name in models:
        probs = np.zeros((len(ws), 4), np.float32)
        t0 = time.time()
        for k, (pid, p_tr, te) in enumerate(folds):
            tr = np.concatenate([h_idx, p_tr])
            tr_s = tr[(ws.start[tr] % stride) == 0] if stride > 1 else tr
            print(f"[{protocol}] {name} fold {pid}: train {len(tr_s)} test {len(te)}", flush=True)
            if name == "Rules":
                m = Rules().fit(ws.last_frame(tr), ws.y[tr])
                probs[te] = m.predict_proba(ws.last_frame(te))[0]
                print("    thresholds", np.round(m.thr, 3).tolist())
            elif name == "RF":
                from sklearn.ensemble import RandomForestClassifier
                m = RandomForestClassifier(300, min_samples_leaf=5, class_weight="balanced_subsample",
                                           n_jobs=-1, random_state=k)
                m.fit(rf_features(ws, tr_s), ws.y[tr_s])
                pr = np.zeros((len(te), 4)); pr[:, m.classes_] = m.predict_proba(rf_features(ws, te))
                probs[te] = pr
            else:
                predict, params = train_deep(name, ws, tr_s, epochs, seed=k)
                probs[te] = predict(te)
                if protocol == "h2p" or k == len(folds) - 1:
                    import pickle
                    with open(os.path.join(OUT, f"{protocol}_{name}_params.pkl"), "wb") as f:
                        pickle.dump(jax.device_get(params), f)
        timing[name] = time.time() - t0
        np.savez(os.path.join(OUT, f"{protocol}_{name}.npz"), probs=probs[test_all], y=ws.y[test_all],
                 subj=ws.subj[test_all], trial=ws.trial[test_all])
        print(f"[{protocol}] {name} done in {timing[name]:.0f}s", flush=True)
    with open(os.path.join(OUT, f"{protocol}_timing.json"), "a") as f:
        f.write(json.dumps(timing) + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--protocol", default="lopo", choices=["lopo", "h2p"])
    ap.add_argument("--models", nargs="+", default=["Rules", "RF", "LSTM", "AcT", "STT"])
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--stride", type=int, default=4)
    a = ap.parse_args()
    run(a.protocol, a.models, a.epochs, a.stride)

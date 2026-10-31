/**
 * compensation.js — real-time upper-limb compensation detector for MediaPipe Pose games.
 *
 * Detects the four common post-stroke compensations during reaching:
 *   - trunkForward   : leaning the trunk toward the target
 *   - trunkLateral   : leaning sideways
 *   - trunkRotation  : twisting the shoulders
 *   - shoulderHike   : elevating the shoulder on the affected side
 *
 * Works with @mediapipe/tasks-vision PoseLandmarker results (landmarks + worldLandmarks).
 * Rule-based and per-patient calibrated: the patient sits upright for ~2 s, and every
 * metric is measured as a change from that baseline, normalised by shoulder width.
 *
 * Usage:
 *   import { CompensationDetector } from './compensation.js';
 *   const det = new CompensationDetector({ affectedSide: 'left' });
 *   det.startCalibration();                       // patient sits upright, arms at rest
 *   // in your render loop, after poseLandmarker.detectForVideo(video, now):
 *   const out = det.update(result, now);
 *   if (out.any) showCue(out.message);            // e.g. pause the fruit, dim the lantern
 */

const LM = { NOSE: 0, L_EAR: 7, R_EAR: 8, L_SH: 11, R_SH: 12, L_HIP: 23, R_HIP: 24 };

export const DEFAULT_THRESHOLDS = {
  trunkForward: 0.12,   // fractional change in apparent shoulder width (leaning toward camera)
  trunkForwardCm: 6,    // forward shoulder displacement from world landmarks, cm
  trunkLateral: 0.15,   // shoulder-midpoint sideways shift, in shoulder widths
  trunkRotation: 12,    // degrees of shoulder-line rotation
  shoulderHike: 0.10,   // ear-to-shoulder distance shrink, in shoulder widths
};

const MESSAGES = {
  trunkForward: 'Keep your back against the chair',
  trunkLateral: 'Sit up straight — try not to lean sideways',
  trunkRotation: 'Keep your shoulders facing forward',
  shoulderHike: 'Relax your shoulder down',
};

export class CompensationDetector {
  /**
   * @param {object} opts
   * @param {'left'|'right'} opts.affectedSide  patient's affected arm (anatomical side)
   * @param {object} [opts.thresholds]          overrides for DEFAULT_THRESHOLDS
   * @param {number} [opts.tolerance=1]         therapist multiplier: >1 more lenient, <1 stricter
   * @param {number} [opts.calibrationMs=2000]
   * @param {number} [opts.holdMs=300]          compensation must persist this long before flagging
   * @param {number} [opts.releaseRatio=0.7]    hysteresis: clears when below threshold*ratio
   * @param {number} [opts.smoothing=0.3]       EMA alpha (0–1, higher = less smoothing)
   * @param {number} [opts.minVisibility=0.5]
   * @param {boolean} [opts.mirrored=false]     set true if you flip the video horizontally
   * @param {(e:{type:string,on:boolean,value:number,t:number})=>void} [opts.onEvent]
   */
  constructor(opts = {}) {
    this.affectedSide = opts.affectedSide || 'left';
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
    this.tolerance = opts.tolerance ?? 1;
    this.calibrationMs = opts.calibrationMs ?? 2000;
    this.holdMs = opts.holdMs ?? 300;
    this.releaseRatio = opts.releaseRatio ?? 0.7;
    this.alpha = opts.smoothing ?? 0.3;
    this.minVis = opts.minVisibility ?? 0.5;
    this.mirrored = !!opts.mirrored;
    this.onEvent = opts.onEvent || null;

    this.baseline = null;
    this._calib = null;
    this._ema = {};
    this._state = {};
    for (const k of Object.keys(MESSAGES)) this._state[k] = { on: false, since: null };
    this.log = []; // per-frame metrics, for offline labelling / later model training
    this.logEnabled = opts.log ?? true;
  }

  startCalibration() {
    this.baseline = null;
    this._calib = { start: null, samples: [] };
    this._ema = {};
  }

  get calibrated() { return !!this.baseline; }
  get calibrating() { return !!this._calib; }

  /** Raw (uncalibrated) features from one pose. Returns null if key landmarks not visible. */
  _features(result) {
    const lm = result?.landmarks?.[0];
    if (!lm) return null;
    const wl = result?.worldLandmarks?.[0];

    // MediaPipe "left" = subject's left. If the video is mirrored, image x flips but labels don't.
    const need = [LM.L_SH, LM.R_SH, LM.L_EAR, LM.R_EAR];
    if (need.some(i => (lm[i].visibility ?? 1) < this.minVis)) return null;

    const ls = lm[LM.L_SH], rs = lm[LM.R_SH];
    const shW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    if (shW < 1e-3) return null;
    const mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

    const sh = this.affectedSide === 'left' ? ls : rs;
    const ear = this.affectedSide === 'left' ? lm[LM.L_EAR] : lm[LM.R_EAR];
    const earShoulder = (sh.y - ear.y) / shW; // image y grows downward; shrinks when shoulder hikes

    const f = { shW, midX: mid.x, midY: mid.y, earShoulder, rotDeg: null, fwdM: null };

    if (wl) {
      const wls = wl[LM.L_SH], wrs = wl[LM.R_SH];
      // shoulder line angle in the horizontal (x–z) plane → trunk rotation
      f.rotDeg = Math.atan2(wls.z - wrs.z, wls.x - wrs.x) * 180 / Math.PI;
      // world landmarks are hip-centred, metres; z is negative toward the camera
      f.fwdM = (wls.z + wrs.z) / 2;
    }
    return f;
  }

  _smooth(key, v) {
    if (v == null) return null;
    const prev = this._ema[key];
    const s = prev == null ? v : prev + this.alpha * (v - prev);
    this._ema[key] = s;
    return s;
  }

  /**
   * Call once per video frame.
   * @returns {{status:'no_pose'|'calibrating'|'uncalibrated'|'ok', any:boolean, flags:object,
   *            values:object, message:string|null, progress?:number}}
   */
  update(result, tMs = performance.now()) {
    const f = this._features(result);
    const empty = { any: false, flags: {}, values: {}, message: null };
    if (!f) return { status: 'no_pose', ...empty };

    if (this._calib) {
      if (this._calib.start == null) this._calib.start = tMs;
      this._calib.samples.push(f);
      const progress = Math.min(1, (tMs - this._calib.start) / this.calibrationMs);
      if (progress >= 1 && this._calib.samples.length >= 10) {
        this.baseline = median(this._calib.samples);
        this._calib = null;
      }
      return { status: 'calibrating', progress, ...empty };
    }
    if (!this.baseline) return { status: 'uncalibrated', ...empty };

    const b = this.baseline;
    const sideSign = this.mirrored ? -1 : 1;
    const raw = {
      trunkForward: f.shW / b.shW - 1,
      trunkForwardCm: f.fwdM != null && b.fwdM != null ? (b.fwdM - f.fwdM) * 100 : null,
      trunkLateral: sideSign * (f.midX - b.midX) / b.shW,
      trunkRotation: f.rotDeg != null && b.rotDeg != null ? wrapDeg(f.rotDeg - b.rotDeg) : null,
      shoulderHike: b.earShoulder - f.earShoulder,
    };
    const v = {};
    for (const k of Object.keys(raw)) v[k] = this._smooth(k, raw[k]);

    const T = this.thresholds, tol = this.tolerance;
    // normalised scores: 1.0 = at threshold
    const score = {
      trunkForward: Math.max(v.trunkForward / (T.trunkForward * tol),
                             v.trunkForwardCm != null ? v.trunkForwardCm / (T.trunkForwardCm * tol) : -Infinity),
      trunkLateral: Math.abs(v.trunkLateral) / (T.trunkLateral * tol),
      trunkRotation: v.trunkRotation != null ? Math.abs(v.trunkRotation) / (T.trunkRotation * tol) : 0,
      shoulderHike: v.shoulderHike / (T.shoulderHike * tol),
    };

    const flags = {};
    let worst = null, worstScore = 0;
    for (const k of Object.keys(MESSAGES)) {
      const st = this._state[k], s = score[k];
      if (!st.on) {
        if (s >= 1) {
          st.since ??= tMs;
          if (tMs - st.since >= this.holdMs) { st.on = true; this._emit(k, true, s, tMs); }
        } else st.since = null;
      } else if (s < this.releaseRatio) {
        st.on = false; st.since = null; this._emit(k, false, s, tMs);
      }
      flags[k] = st.on;
      if (st.on && s > worstScore) { worst = k; worstScore = s; }
    }

    if (this.logEnabled) this.log.push({ t: tMs, ...v, ...prefix(flags, 'flag_') });

    return {
      status: 'ok',
      any: worst != null,
      flags,
      values: v,
      scores: score,
      message: worst ? MESSAGES[worst] : null,
    };
  }

  _emit(type, on, value, t) { this.onEvent?.({ type, on, value, t }); }

  /** Export the per-frame log as CSV (for therapist labelling / training a model later). */
  exportCSV() {
    if (!this.log.length) return '';
    const cols = Object.keys(this.log[0]);
    return [cols.join(','), ...this.log.map(r => cols.map(c => r[c] ?? '').join(','))].join('\n');
  }
}

function median(samples) {
  const out = {};
  for (const k of Object.keys(samples[0])) {
    const vals = samples.map(s => s[k]).filter(v => v != null).sort((a, b) => a - b);
    out[k] = vals.length ? vals[Math.floor(vals.length / 2)] : null;
  }
  return out;
}
function wrapDeg(d) { return ((d + 540) % 360) - 180; }
function prefix(o, p) { const r = {}; for (const k in o) r[p + k] = o[k] ? 1 : 0; return r; }

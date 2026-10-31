// COMPENSATION (31 Oct 2026, by request: "add compnet"). The rule detector of
// the CompNet study (assets/compnet_code.zip; its training code is kept in
// tools/compnet/), compensation.js, ported onto STRIVE's tracker. CompNet
// trained a random forest, an LSTM and two transformers on the Toronto Rehab
// Stroke Posture dataset (Kinect, 9 stroke patients); none beat these rules
// by much on the patients (any-compensation F1 0.2-0.3, AUC 0.65-0.9), so the
// rules are what runs live, and the per-round summary the coach keeps
// (coach.js summary(), the round record's compStats) is the data a
// per-patient threshold, the study's own next step, would be tuned on.
//
// Four signs, each measured AGAINST THE PATIENT'S OWN POSTURE AT REST (the
// tracker's baseline, set at the round's start and refreshed while the
// trained arm rests), so a lean that is held stays a lean. The tracker's
// old signal, a fast against a slow moving average of the shoulders, forgot
// a held lean or turn within a second or two.
//   lean      the trunk coming toward the camera: the shoulders look wider,
//             and on the ZED the shoulder midpoint comes forward of the hips
//             in real depth, in cm
//   rotation  the shoulder line turning about the vertical: degrees from the
//             ZED's depth; on a webcam, the shoulders looking narrower (which
//             a forward lean never does, so the two are no longer one signal)
//   tilt      the trunk going sideways: the shoulder midpoint shifting
//             (shoulder widths) or the spine angling (degrees)
//   hike      the trained side's shoulder rising toward its ear: the
//             VERTICAL ear-to-shoulder gap shrinking (shoulder widths). Its
//             allowance widens once the arm is above 90 degrees (double at
//             150): taking an arm overhead normally lifts the shoulder girdle
//             with it (the shoulder blade rotates up), which is not a shrug.
// MediaPipe's own "world landmarks" are NOT used (tested 31 Oct on the fake
// camera's seated person): a webcam has no depth, their z is a guess that
// moved with the arm and between runs, and against the round's baseline it
// read a 12 cm forward lean for most of one run and a 15-degree turn for most
// of another, where the 2D measures stayed well under their lines. CompNet
// validated its rules on Kinect depth and warned MediaPipe would be worse.
// Scores are 1.0 at the threshold. COMP_T is compensation.js's defaults x 1.5
// for STRIVE's gentle coach; the coach's "strict" (x 0.65) is about its own.

export const COMP_T = { fwdRatio: 0.18, fwdCm: 9, rotDeg: 18, narrow: 0.18, lateral: 0.225, tiltDeg: 12, hike: 0.15 };
export const COMP_EMA = 0.3;          // per tracker sample (compensation.js's smoothing)
const EAR_FRESH_MS = 400;             // an ear not seen this recently is not used for the hike

// the raw signs of one frame from the tracker, or null without both shoulders
export function compFeatures(t, now = performance.now()) {
  const p = t.pts;
  if (!p?.shL || !p?.shR) return null;
  const sw = Math.hypot(p.shL.x - p.shR.x, p.shL.y - p.shR.y);
  if (!(sw > 1e-3)) return null;
  const f = { sw, midX: (p.shL.x + p.shR.x) / 2, tilt: t._trunkTilt?.() ?? null, earShL: null, earShR: null, rotDeg: null, fwdM: null, src3: null };
  // image y grows downward: the gap shrinks as the shoulder rises
  if (p.earL && now - (p.earL.at ?? 0) < EAR_FRESH_MS) f.earShL = (p.shL.y - p.earL.y) / sw;
  if (p.earR && now - (p.earR.at ?? 0) < EAR_FRESH_MS) f.earShR = (p.shR.y - p.earR.y) / sw;
  // the arms' elevation (0 down, 180 overhead), for the hike's allowance
  f.armL = t.armAngle?.("left") ?? null; f.armR = t.armAngle?.("right") ?? null;
  // 3D from the ZED only: metric joints, camera frame, z = distance, so
  // leaning toward the camera makes the shoulders' z smaller
  const w = t.has3D ? t.pts3 : null;
  if (w?.shL && w?.shR) {
    let dx = w.shL.x - w.shR.x, dz = w.shL.z - w.shR.z;
    if (dx < 0) { dx = -dx; dz = -dz; }                 // always (-90, 90): no wrap at +-180
    f.rotDeg = Math.atan2(dz, dx) * 180 / Math.PI;
    const sz = (w.shL.z + w.shR.z) / 2;
    f.fwdM = w.hipL && w.hipR ? sz - (w.hipL.z + w.hipR.z) / 2 : sz;
    f.src3 = "zed";
  }
  return f;
}

// the four scores of features f against the baseline b, 1.0 = at the threshold
export function compScores(f, b, side, T = COMP_T) {
  const ratio = f.sw / b.sw - 1;
  const fwdCm = f.fwdM != null && b.fwdM != null ? (b.fwdM - f.fwdM) * 100 : null;
  const lean = Math.max(0, ratio / T.fwdRatio, fwdCm != null ? fwdCm / T.fwdCm : 0);
  const rotation = f.rotDeg != null && b.rotDeg != null ? Math.abs(f.rotDeg - b.rotDeg) / T.rotDeg
    : Math.max(0, -ratio) / T.narrow;
  const tilt = Math.max(Math.abs(f.midX - b.midX) / b.sw / T.lateral,
    f.tilt != null && b.tilt != null ? Math.abs(f.tilt - b.tilt) / T.tiltDeg : 0);
  const k = side === "left" ? "earShL" : "earShR";
  const elev = side === "left" ? f.armL : f.armR;
  const allow = 1 + Math.max(0, ((elev ?? 0) - 90) / 60);
  const hike = f[k] != null && b[k] != null ? Math.max(0, b[k] - f[k]) / (T.hike * allow) : 0;
  return { lean, hike, rotation, tilt };
}

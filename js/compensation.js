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
//             allowance widens once the arm is above 60 degrees (double at
//             120, triple at 180; it began at 90 until 2 Nov 2026): taking
//             an arm up normally lifts the shoulder girdle with it (the
//             shoulder blade rotates up), which is not a shrug.
//   (rotation's allowance widens as the hand reaches across the body)
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
  // lr: which way the patient's own left lies along x (the picture may or
  // may not be mirrored), so a sideways lean can be named left or right
  const f = { sw, midX: (p.shL.x + p.shR.x) / 2, lr: Math.sign(p.shL.x - p.shR.x) || 1, tilt: t._trunkTilt?.() ?? null, earShL: null, earShR: null, rotDeg: null, fwdM: null, src3: null };
  // image y grows downward: the gap shrinks as the shoulder rises
  if (p.earL && now - (p.earL.at ?? 0) < EAR_FRESH_MS) f.earShL = (p.shL.y - p.earL.y) / sw;
  if (p.earR && now - (p.earR.at ?? 0) < EAR_FRESH_MS) f.earShR = (p.shR.y - p.earR.y) / sw;
  // the arms' elevation (0 down, 180 overhead), for the hike's allowance
  f.armL = t.armAngle?.("left") ?? null; f.armR = t.armAngle?.("right") ?? null;
  // where the wrists are across the picture, for the turn's allowance
  f.wrLx = p.wrL?.x ?? null; f.wrRx = p.wrR?.x ?? null;
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

// the four scores of features f against the baseline b, 1.0 = at the threshold,
// plus tiltLR: the tilt score signed by which way the trunk went, + toward
// the patient's own left, - toward their right (2 Nov 2026, by request: the
// cue says which way they are leaning, not only "straighten up")
export function compScores(f, b, side, T = COMP_T) {
  const ratio = f.sw / b.sw - 1;
  const fwdCm = f.fwdM != null && b.fwdM != null ? (b.fwdM - f.fwdM) * 100 : null;
  const lean = Math.max(0, ratio / T.fwdRatio, fwdCm != null ? fwdCm / T.fwdCm : 0);
  // MINDFUL OF THE MOVE (2 Nov 2026, by request: "if I lift my arm my
  // shoulder moves up, and reaching to the other side I turn a bit"): a
  // reach across the body brings some trunk turn with it, so the turn's
  // allowance grows as the hand nears and passes the midline, up to 2.5
  // times at 0.8 shoulder widths across; and the shoulder blade rises with
  // an arm lifted past about 60 degrees (the shoulder's normal rhythm), so
  // the hike's allowance grows from there, 2 times at 120, 3 at 180
  const wx = side === "left" ? f.wrLx : f.wrRx;
  const across = wx == null ? 0 : (wx - f.midX) / f.sw * f.lr * (side === "left" ? -1 : 1);
  const allowTurn = 1 + 1.5 * Math.max(0, Math.min(1, across + 0.2));
  const rotation = (f.rotDeg != null && b.rotDeg != null ? Math.abs(f.rotDeg - b.rotDeg) / T.rotDeg
    : Math.max(0, -ratio) / T.narrow) / allowTurn;
  // the shoulders shifting toward the left shoulder's side, or the spine
  // (shoulders to hips) swinging that way, is a lean to the patient's left
  const lat = (f.midX - b.midX) / b.sw / T.lateral * f.lr;
  const spine = f.tilt != null && b.tilt != null ? -(f.tilt - b.tilt) / T.tiltDeg * f.lr : 0;
  const tilt = Math.max(Math.abs(lat), Math.abs(spine));
  const tiltLR = Math.abs(lat) >= Math.abs(spine) ? lat : spine;
  const k = side === "left" ? "earShL" : "earShR";
  const elev = side === "left" ? f.armL : f.armR;
  const allow = 1 + Math.max(0, ((elev ?? 0) - 60) / 60);
  const hike = f[k] != null && b[k] != null ? Math.max(0, b[k] - f[k]) / (T.hike * allow) : 0;
  return { lean, hike, rotation, tilt, tiltLR };
}

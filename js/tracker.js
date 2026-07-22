// Webcam pose tracking (MediaPipe Pose Landmarker) with a body-relative
// coordinate frame. Units: shoulder-widths (SW) for distance, degrees vs the
// trunk axis for arm elevation. Two time scales on the body anchor:
//   slow filter  -> legitimate repositioning (targets follow the body)
//   fast vs slow -> compensation signal (Posture Coach)
//   large/sustained change -> relocation (graceful pause + re-baseline)

import { FilesetResolver, PoseLandmarker, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const LM = {
  earL: 7, earR: 8,
  shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  piL: 17, piR: 18, ixL: 19, ixR: 20, thL: 21, thR: 22,
  hipL: 23, hipR: 24,
};

const SLOW = 0.04, FAST = 0.35, HAND = 0.5;
// hand open/closed: index-tip distance from the wrist (SW units) shrinks as
// the fist closes. Fixed fallback thresholds (hysteresis) are used until the
// per-person calibration has seen enough range (one open + one close).
const GRIP_CLOSE = 0.28, GRIP_OPEN = 0.36;
const GRIP_CAL_MIN_RANGE = 0.10;   // observed hi−lo needed to trust calibration
const GRIP_CAL_DECAY = 0.0004;     // envelope forget rate per frame
// hand-model curl calibration: fixed thresholds (~1.25 close / 1.55 open on
// a ~1.0 fist … ~2.0 open scale) until the per-person envelope has seen
// enough range — then "closed" means 35% into THEIR OWN range, so a hand
// that can only partially close still registers its squeeze
const CURL_CLOSE = 1.25, CURL_OPEN = 1.55;
const CURL_CAL_MIN_RANGE = 0.35;

export class Tracker {
  constructor() {
    this.video = null;
    this.landmarker = null;
    this.running = false;
    this.listeners = [];
    this.lastSeen = 0;

    this.anchor = null;        // slow shoulder midpoint (video-norm, mirrored)
    this.anchorFast = null;    // fast shoulder midpoint
    this.shoulderW = null;     // slow shoulder width
    this.shoulderWFast = null;
    this.trunk = { x: 0, y: 1 }; // unit vector shoulder-mid -> hip-mid (down)
    this.pts = null;           // latest smoothed key points (mirrored)
    this.baseline = null;      // round-start posture baseline
    this.gripClosed = { left: false, right: false };
    this.gripCal = { left: null, right: null };   // per-hand {lo, hi} envelope (pose fallback)
    this.curlCal = { left: null, right: null };   // per-hand {lo, hi} envelope (hand model)
    // 21-point Hand Landmarker results, matched to pose wrists by proximity.
    // Grasp prefers these (real finger curl); pose fingertips are the fallback.
    this.hands = { left: null, right: null };     // { pts:[21 mirrored], at }
    this.handLandmarker = null;
    this._handFrameToggle = false;
    // Stable render/interaction frame: the world is drawn (and hands measured)
    // against this instead of the live anchor, so sway, reaches, and tracker
    // jitter never move the scene. Locked for the whole round; re-snapped
    // only by setBaseline() (round start / after a relocation pause).
    this.frame = null;         // { x, y, sw }
  }

  async init(videoEl) {
    this.video = videoEl;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    // dedicated hand model for real grasp detection — optional: pose tracking
    // still works if it fails to load
    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
    } catch (e) {
      console.warn("Hand Landmarker unavailable — using pose-fingertip grasp fallback", e);
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" }, audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise(res => { videoEl.onloadedmetadata = res; });
    await videoEl.play();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      if (this.video.readyState >= 2) {
        const r = this.landmarker.detectForVideo(this.video, now);
        if (r.landmarks && r.landmarks.length) this._ingest(r.landmarks[0], now);
        // hands every 2nd frame (grasp doesn't need 60 Hz; halves the cost)
        this._handFrameToggle = !this._handFrameToggle;
        if (this.handLandmarker && this._handFrameToggle) {
          try {
            const h = this.handLandmarker.detectForVideo(this.video, now);
            this._ingestHands(h, now);
          } catch { /* keep pose running */ }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
  onFrame(cb) { this.listeners.push(cb); }
  clearListeners() { this.listeners = []; }
  get trackingOk() { return performance.now() - this.lastSeen < 700; }

  _ingest(lm, now) {
    const vis = i => (lm[i].visibility ?? 1) > 0.5;
    if (!vis(LM.shL) || !vis(LM.shR)) return;
    this.lastSeen = now;
    const p = i => ({ x: 1 - lm[i].x, y: lm[i].y, ok: vis(i) });

    const raw = {};
    for (const [k, i] of Object.entries(LM)) raw[k] = p(i);

    const mid = { x: (raw.shL.x + raw.shR.x) / 2, y: (raw.shL.y + raw.shR.y) / 2 };
    const sw = Math.hypot(raw.shL.x - raw.shR.x, raw.shL.y - raw.shR.y);

    if (!this.anchor) {
      this.anchor = { ...mid }; this.anchorFast = { ...mid };
      this.shoulderW = sw; this.shoulderWFast = sw;
      this.pts = {};
    }
    const mix = (o, n, k) => { o.x += (n.x - o.x) * k; o.y += (n.y - o.y) * k; };
    mix(this.anchor, mid, SLOW); mix(this.anchorFast, mid, FAST);
    this.shoulderW += (sw - this.shoulderW) * SLOW;
    this.shoulderWFast += (sw - this.shoulderWFast) * FAST;

    // stable frame: fully LOCKED during play — big reaches shift the shoulder
    // midpoint, so any mid-round following makes the world chase the patient.
    // It re-snaps only at setBaseline() (round start / after a relocation
    // pause); relocated() catches genuinely moving away.
    if (!this.frame) this.frame = { x: this.anchor.x, y: this.anchor.y, sw: this.shoulderW };

    for (const k of Object.keys(raw)) {
      if (!raw[k].ok) continue;
      if (!this.pts[k]) this.pts[k] = { x: raw[k].x, y: raw[k].y };
      mix(this.pts[k], raw[k], HAND);
      this.pts[k].ok = true;
    }

    // hand open/closed: prefer the 21-point hand model's finger curl (fixed,
    // scale-invariant hysteresis); fall back to the self-calibrating pose-
    // fingertip envelope when the hand model has no fresh detection
    for (const s of ["left", "right"]) {
      const curl = this.handCurl(s);
      if (curl != null) {
        // self-calibrating per-person thresholds (see CURL_* above)
        let ccal = this.curlCal[s];
        if (!ccal) ccal = this.curlCal[s] = { lo: curl, hi: curl };
        ccal.lo = Math.min(curl, ccal.lo + GRIP_CAL_DECAY);
        ccal.hi = Math.max(curl, ccal.hi - GRIP_CAL_DECAY);
        const crange = ccal.hi - ccal.lo;
        const cclose = crange > CURL_CAL_MIN_RANGE ? ccal.lo + crange * 0.35 : CURL_CLOSE;
        const copen = crange > CURL_CAL_MIN_RANGE ? ccal.lo + crange * 0.6 : CURL_OPEN;
        if (this.gripClosed[s]) { if (curl > copen) this.gripClosed[s] = false; }
        else if (curl < cclose) this.gripClosed[s] = true;
        continue;
      }
      const g = this.grip(s);
      if (g == null) continue;
      let cal = this.gripCal[s];
      if (!cal) cal = this.gripCal[s] = { lo: g, hi: g };
      cal.lo = Math.min(g, cal.lo + GRIP_CAL_DECAY);
      cal.hi = Math.max(g, cal.hi - GRIP_CAL_DECAY);
      const range = cal.hi - cal.lo;
      const close = range > GRIP_CAL_MIN_RANGE ? cal.lo + range * 0.35 : GRIP_CLOSE;
      const open = range > GRIP_CAL_MIN_RANGE ? cal.lo + range * 0.6 : GRIP_OPEN;
      if (this.gripClosed[s]) { if (g > open) this.gripClosed[s] = false; }
      else if (g < close) this.gripClosed[s] = true;
    }

    // fresh per-frame visibility (pts.ok is sticky; this is not) for framing checks
    this.rawVis = { hips: raw.hipL.ok && raw.hipR.ok };

    // trunk axis (shoulders -> hips)
    if (raw.hipL.ok && raw.hipR.ok) {
      const hip = { x: (this.pts.hipL.x + this.pts.hipR.x) / 2, y: (this.pts.hipL.y + this.pts.hipR.y) / 2 };
      const dx = hip.x - this.anchorFast.x, dy = hip.y - this.anchorFast.y;
      const n = Math.hypot(dx, dy) || 1;
      this.trunk = { x: dx / n, y: dy / n };
    }

    for (const cb of this.listeners) cb(now);
  }

  // match each detected hand to the nearer pose wrist (handedness labels are
  // unreliable in mirrored video; proximity isn't)
  _ingestHands(res, now) {
    if (!res?.landmarks?.length || !this.pts) return;
    for (const lm of res.landmarks) {
      const pts = lm.map(p => ({ x: 1 - p.x, y: p.y }));
      const w = pts[0];
      let side = null, best = Infinity;
      for (const s of ["left", "right"]) {
        const pw = this.wrist(s);
        if (!pw) continue;
        const d = Math.hypot(w.x - pw.x, w.y - pw.y);
        if (d < best) { best = d; side = s; }
      }
      if (!side || best > this.shoulderW * 0.6) continue;
      this.hands[side] = { pts, at: now };
    }
  }
  _handPts(side) {
    const h = this.hands[side];
    return h && performance.now() - h.at < 600 ? h.pts : null;
  }

  // finger curl from the 21-point hand model: mean fingertip→wrist distance
  // over palm size (wrist→middle MCP). ~2.0 open hand, ~1.0 fist —
  // scale-invariant, so no per-person calibration needed.
  handCurl(side) {
    const p = this._handPts(side);
    if (!p) return null;
    const w = p[0];
    const palm = Math.hypot(p[9].x - w.x, p[9].y - w.y) || 1e-6;
    const mean = [8, 12, 16, 20].reduce((s, i) => s + Math.hypot(p[i].x - w.x, p[i].y - w.y), 0) / 4;
    return mean / palm;
  }

  // ---- body-relative geometry ------------------------------------
  wrist(side) { return side === "left" ? this.pts?.wrL : this.pts?.wrR; }
  shoulder(side) { return side === "left" ? this.pts?.shL : this.pts?.shR; }
  elbow(side) { return side === "left" ? this.pts?.elL : this.pts?.elR; }

  // palm center (video-norm coords): hand model's middle MCP when available,
  // else midpoint of the pose model's index and pinky landmarks
  palm(side) {
    const hp = this._handPts(side);
    if (hp) return { x: hp[9].x, y: hp[9].y };
    const ix = side === "left" ? this.pts?.ixL : this.pts?.ixR;
    const pi = side === "left" ? this.pts?.piL : this.pts?.piR;
    if (ix && pi) return { x: (ix.x + pi.x) / 2, y: (ix.y + pi.y) / 2 };
    return ix || pi || null;
  }

  // index-tip → wrist distance in SW units (null if the hand isn't tracked)
  grip(side) {
    const w = this.wrist(side);
    const ix = side === "left" ? this.pts?.ixL : this.pts?.ixR;
    if (!w || !ix) return null;
    return Math.hypot(ix.x - w.x, ix.y - w.y) / this.shoulderW;
  }
  handClosed(side) { return this.gripClosed[side]; }

  // coarse forearm pronation/supination (frontal view): the thumb's signed
  // offset from the wrist→index line, normalized by hand length. Positive ≈
  // supinated (palm rolled up), negative ≈ pronated. Rough — game use only.
  // Prefers the hand model's wrist/index-MCP/thumb-tip; pose is the fallback.
  forearmRoll(side) {
    let w, ix, th;
    const hp = this._handPts(side);
    if (hp) { w = hp[0]; ix = hp[5]; th = hp[4]; }
    else {
      w = this.wrist(side);
      ix = side === "left" ? this.pts?.ixL : this.pts?.ixR;
      th = side === "left" ? this.pts?.thL : this.pts?.thR;
    }
    if (!w || !ix || !th) return null;
    const ax = ix.x - w.x, ay = ix.y - w.y;
    const bx = th.x - w.x, by = th.y - w.y;
    const cross = ax * by - ay * bx;
    const n = ax * ax + ay * ay || 1e-6;
    return (side === "left" ? -1 : 1) * cross / n;
  }

  // hand position relative to the stable frame, SW units, y up
  handRel(side) {
    const w = this.wrist(side);
    if (!w || !this.frame) return null;
    return { x: (w.x - this.frame.x) / this.frame.sw, y: -(w.y - this.frame.y) / this.frame.sw };
  }

  // palm center in the same frame — where the FINGERS are, for pick-up
  // interactions (the wrist sits noticeably behind a grasping hand)
  palmRel(side) {
    const p = this.palm(side);
    if (!p || !this.frame) return null;
    return { x: (p.x - this.frame.x) / this.frame.sw, y: -(p.y - this.frame.y) / this.frame.sw };
  }

  // arm elevation angle in degrees vs trunk axis: 0 = arm along trunk (down),
  // 180 = straight overhead. Uses shoulder->wrist (whole-arm reach direction).
  armAngle(side) {
    const s = this.shoulder(side), w = this.wrist(side);
    if (!s || !w) return null;
    const ax = w.x - s.x, ay = w.y - s.y;
    const dot = ax * this.trunk.x + ay * this.trunk.y;
    const mag = Math.hypot(ax, ay) || 1;
    return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
  }

  // ---- compensation & relocation signals --------------------------
  setBaseline() {
    if (!this.anchor) return;
    // snap the stable frame to the current body (round start / after a pause)
    this.frame = { x: this.anchor.x, y: this.anchor.y, sw: this.shoulderW };
    this.baseline = {
      anchor: { ...this.anchor },
      sw: this.shoulderW,
      earShL: this._earShoulder("left"),
      earShR: this._earShoulder("right"),
      tilt: this._trunkTilt(),
      at: performance.now(),
    };
  }
  // trunk axis angle vs vertical, degrees (0 = upright, + = tilted)
  _trunkTilt() {
    return Math.atan2(this.trunk.x, this.trunk.y) * 180 / Math.PI;
  }
  _earShoulder(side) {
    const e = side === "left" ? this.pts?.earL : this.pts?.earR;
    const s = this.shoulder(side);
    if (!e || !s || !e.ok) return null;
    return Math.hypot(e.x - s.x, e.y - s.y) / this.shoulderW;
  }

  // returns { lean, hike, rotation, tilt } as 0..1-ish severities (0 = clean)
  compensation(side) {
    if (!this.baseline || !this.anchorFast) return { lean: 0, hike: 0, rotation: 0, tilt: 0 };
    const lean = Math.hypot(this.anchorFast.x - this.anchor.x, this.anchorFast.y - this.anchor.y) / this.shoulderW / 0.30;
    const es = this._earShoulder(side);
    const bes = side === "left" ? this.baseline.earShL : this.baseline.earShR;
    const hike = (es != null && bes != null) ? Math.max(0, (bes - es) / 0.22) : 0;
    const rotation = Math.abs(this.shoulderWFast - this.shoulderW) / this.shoulderW / 0.18;
    // trunk tilt: the spine angling sideways from its baseline (~12° = 1.0)
    const tilt = this.baseline.tilt != null ? Math.abs(this._trunkTilt() - this.baseline.tilt) / 12 : 0;
    return { lean, hike, rotation, tilt };
  }

  // large sustained move / scale change -> pause & re-baseline.
  // Deliberately hard to trigger: grace period after baselining, generous
  // thresholds — normal play and small shifts must never pause the game.
  relocated() {
    if (!this.baseline) return false;
    if (performance.now() - this.baseline.at < 4000) return false;
    const d = Math.hypot(this.anchor.x - this.baseline.anchor.x, this.anchor.y - this.baseline.anchor.y) / this.baseline.sw;
    const scale = Math.abs(this.shoulderW - this.baseline.sw) / this.baseline.sw;
    return d > 1.6 || scale > 0.35;
  }

  // ---- rendering conversions --------------------------------------
  relToPx(rel, canvas) {
    const vx = this.frame.x + rel.x * this.frame.sw;
    const vy = this.frame.y - rel.y * this.frame.sw;
    return this._videoToPx(vx, vy, canvas);
  }
  handPx(side, canvas) {
    const w = this.wrist(side);
    return w ? this._videoToPx(w.x, w.y, canvas) : null;
  }
  _videoToPx(nx, ny, canvas) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    return { x: (canvas.width - dw) / 2 + nx * dw, y: (canvas.height - dh) / 2 + ny * dh };
  }
  // inverse: canvas pixels -> body-relative (SW units, y up)
  pxToRel(px, canvas) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    const nx = (px.x - (canvas.width - dw) / 2) / dw;
    const ny = (px.y - (canvas.height - dh) / 2) / dh;
    return { x: (nx - this.frame.x) / this.frame.sw, y: -(ny - this.frame.y) / this.frame.sw };
  }
  pxPerSW(canvas) {
    const scale = Math.max(canvas.width / this.video.videoWidth, canvas.height / this.video.videoHeight);
    return this.frame.sw * this.video.videoWidth * scale;
  }
}

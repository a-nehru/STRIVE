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

// local ZED bridge (tools/zed_bridge.py): probed at init when camera source
// is "auto"; the game never requires it
const ZED_BRIDGE = "http://localhost:8322";

const SLOW = 0.04, FAST = 0.35, HAND = 0.5;
// Body lock (webcam path). MediaPipe returns up to numPoses bodies in
// confidence order and re-orders them freely, so a therapist or a second
// patient in frame can become "the" body mid-round. We keep our own lock and
// follow it by build + position instead. The gate is per-frame displacement
// from the last matched frame, so a scoot or a big reach passes easily while
// a different person standing somewhere else never does.
const NUM_POSES = 3;
const LOCK_GATE = 1.2;      // combined cost ceiling for "still the same person"
const LOCK_GRACE = 3000;    // ms with no acceptable match before a new person is accepted
// Distance changes must move the frame's SCALE (or every target silently
// becomes a different fraction of the patient's reach), but a lean or a turn
// must not. Both are only acted on when sustained.
const SCALE_DRIFT = 0.10, SCALE_HOLD = 1500;
// arm length (SW) is held as a decaying session max: a bent or foreshortened
// arm reads short, so the longest recent measurement is the honest one
const ARM_DECAY = 0.0002;
// a frame at least this wide-to-tall is a side-by-side stereo pair, not a
// very wide camera: HD720 stereo is 2560x720 (3.56), any normal webcam is
// 1.33-1.78, and an ultrawide 21:9 is 2.33 — so the line sits above that
const STEREO_RATIO = 2.6;
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
    // squeeze-ease accessibility bias: where "closed" sits inside the
    // patient's own curl range (setSqueezeEase adjusts both thresholds)
    this.closeFrac = 0.35; this.openFrac = 0.6;
    // pronation/supination state (palmFacing): per-side auto-cal + hysteresis
    this.rollCal = { left: null, right: null };
    this.rollState = { left: "flat", right: "flat" };
    // pincer state (thumb-index pinch, distinct from whole-hand grasp)
    this.pinchState = { left: false, right: false };
    // smoothed hand velocity (SW/s) for ballistic-swipe games
    this._vel = { left: null, right: null };
    this._velPrev = { left: null, right: null };
    // Stable render/interaction frame: the world is drawn (and hands measured)
    // against this instead of the live anchor, so sway, reaches, and tracker
    // jitter never move the scene. Locked for the whole round; re-snapped
    // only by setBaseline() (round start / after a relocation pause) — except
    // its SCALE, which follows a sustained distance change (see _ingest).
    this.frame = null;         // { x, y, sw, torso }
    // Which detected person is the patient (webcam path; the ZED bridge does
    // its own seating). Followed by build + position, never by confidence.
    this.lock = null;          // { mid, sw, torso, at }
    this.peopleSeen = 0;       // bodies in frame this detection (for staff UI)
    this._armLen = { left: null, right: null };   // decaying session max, SW
    this.pts3 = null;          // metric XYZ per landmark (ZED only), meters
    this.at3 = 0;
  }

  // source: "auto" probes the local ZED bridge (tools/zed_bridge.py) and uses
  // the ZED SDK skeleton when it's running; "webcam" forces MediaPipe. The
  // bridge speaks the MediaPipe 33-landmark layout, so everything downstream
  // of _ingest (smoothing, stable frame, coach, grip fallback) is identical.
  async init(videoEl, source = "auto") {
    this.video = videoEl;
    this.source = "webcam";
    if (source !== "webcam") {
      const zed = await this._probeZed();
      if (zed) {
        this.source = "zed";
        this.zedInfo = zed;
        // the bridge's MJPEG preview stands in for the webcam <video>: expando
        // props make it quack like one for drawVideoMirror and _videoToPx
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = `${ZED_BRIDGE}/video.mjpg`;
        img.videoWidth = zed.w; img.videoHeight = zed.h; img.readyState = 2;
        this.video = img;
        return;
      }
    }
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      // more than one body on purpose: with a therapist or a second patient in
      // the room, asking for a single pose means the model silently hands us
      // whoever it scored highest THIS frame. We take all of them and pick the
      // patient ourselves (_pickBody).
      numPoses: NUM_POSES,
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

  async _probeZed() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 900);
      const r = await fetch(`${ZED_BRIDGE}/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) return null;
      const s = await r.json();
      return s.ok && s.w && s.h ? s : null;
    } catch { return null; }
  }

  _startZed() {
    this.es = new EventSource(`${ZED_BRIDGE}/stream`);
    this.es.onmessage = ev => {
      if (!this.running) return;
      try {
        const msg = JSON.parse(ev.data);
        const now = performance.now();
        // seat 1, when the bridge runs --bodies 2: the second player's
        // paddle. Seats are locked to a person by the bridge, so this never
        // becomes player 1 mid-round.
        this.peopleSeen = msg.bodies?.length ?? 0;
        const second = msg.bodies?.find(b => b.seat === 1);
        if (second) {
          this._ingestSecond(second.lm.map(p => ({ x: p[0], y: p[1], visibility: p[2] })), now);
        }
        if (!msg.lm) return;
        // real biacromial width in meters from the ZED's depth — the
        // tape-measure-free SW→cm conversion (see main.js syncZedShoulder)
        if (msg.shm) this.shoulderM = msg.shm;
        // metric keypoints ride alongside the normalized ones: the depth
        // channel the assessment turns into a real workspace volume
        if (msg.lm3) this._ingest3(msg.lm3);
        const lm = msg.lm.map(p => ({ x: p[0], y: p[1], visibility: p[2] }));
        this._ingest(lm, now);
      } catch { /* skip malformed frame */ }
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.source === "zed") { this._startZed(); return; }
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      if (this.video.readyState >= 2) {
        // stereo webcams (a ZED on plain UVC) are cropped to the left eye
        // first — both models must see the same frame the patient does
        const src = this._detectSource();
        const r = this.landmarker.detectForVideo(src, now);
        const mine = r.landmarks?.length ? this._pickBody(r.landmarks, now) : null;
        if (mine) this._ingest(mine, now);
        // hands every 2nd frame (grasp doesn't need 60 Hz; halves the cost)
        this._handFrameToggle = !this._handFrameToggle;
        if (this.handLandmarker && this._handFrameToggle) {
          try {
            const h = this.handLandmarker.detectForVideo(src, now);
            this._ingestHands(h, now);
          } catch { /* keep pose running */ }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; this.es?.close(); this.es = null; }
  onFrame(cb) { this.listeners.push(cb); }
  clearListeners() { this.listeners = []; }
  get trackingOk() { return performance.now() - this.lastSeen < 700; }

  // ---- who is the patient (webcam path) ---------------------------
  // A build signature, not a face: shoulder midpoint, shoulder width, and the
  // shoulder→hip length as a fraction of shoulder width (a scale-free build
  // ratio, so it does not change when the patient sits closer). Face
  // recognition would mean shipping an embedding model and storing patient
  // biometrics; position + build separates the people who are actually in a
  // therapy room, and costs nothing.
  _feature(lm) {
    if ((lm[LM.shL].visibility ?? 1) < 0.5 || (lm[LM.shR].visibility ?? 1) < 0.5) return null;
    const a = { x: 1 - lm[LM.shL].x, y: lm[LM.shL].y };
    const b = { x: 1 - lm[LM.shR].x, y: lm[LM.shR].y };
    const sw = Math.hypot(a.x - b.x, a.y - b.y);
    if (!(sw > 1e-3)) return null;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let torso = null;
    if ((lm[LM.hipL].visibility ?? 1) > 0.5 && (lm[LM.hipR].visibility ?? 1) > 0.5) {
      const hx = ((1 - lm[LM.hipL].x) + (1 - lm[LM.hipR].x)) / 2;
      const hy = (lm[LM.hipL].y + lm[LM.hipR].y) / 2;
      torso = Math.hypot(hx - mid.x, hy - mid.y) / sw;
    }
    return { mid, sw, torso, lm };
  }

  _pickBody(list, now) {
    const cands = list.map(l => this._feature(l)).filter(Boolean);
    this.peopleSeen = cands.length;
    if (!cands.length) return null;

    const lock = this.lock;
    if (lock && now - lock.at < LOCK_GRACE) {
      let best = null, bestCost = Infinity;
      for (const c of cands) {
        // displacement is measured from the LAST MATCHED FRAME, so even a
        // fast reach or a scoot is a small number; a different person
        // standing elsewhere is not
        const move = Math.hypot(c.mid.x - lock.mid.x, c.mid.y - lock.mid.y) / lock.sw;
        const scale = Math.abs(c.sw - lock.sw) / lock.sw;
        const build = (c.torso != null && lock.torso != null)
          ? Math.abs(c.torso - lock.torso) / lock.torso : 0;
        const cost = move + scale * 2 + build * 1.5;
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      if (best && bestCost < LOCK_GATE) { this._setLock(best, now); return best.lm; }
      return null;   // the person we follow is not in this frame: pause, don't swap
    }
    // no lock, or it expired: the patient is the person in front of the
    // camera, so take the most central body — not the largest, not the one
    // the model happens to be most confident about
    cands.sort((a, b) => Math.abs(a.mid.x - 0.5) - Math.abs(b.mid.x - 0.5));
    this._setLock(cands[0], now);
    return cands[0].lm;
  }

  _setLock(c, now) {
    const prev = this.lock;
    // the build ratio is slow-filtered: it is an identity, not a measurement
    const torso = c.torso != null
      ? (prev?.torso != null ? prev.torso + (c.torso - prev.torso) * 0.05 : c.torso)
      : prev?.torso ?? null;
    this.lock = { mid: c.mid, sw: c.sw, torso, at: now };
  }

  // forget who we were following (staff drawer / new patient): the next frame
  // re-acquires the most central body
  relock() { this.lock = null; }

  // ---- metric 3D (ZED only) ---------------------------------------
  // The SDK's keypoints in meters, camera frame (x right, y down, z forward).
  // The game's geometry stays in shoulder-width units — this is the extra
  // channel the assessment needs for a real workspace volume. A webcam has no
  // depth, so it stays null and the assessment reports area only.
  _ingest3(lm3) {
    if (!Array.isArray(lm3)) return;
    const p3 = {};
    for (const [k, i] of Object.entries(LM)) {
      const p = lm3[i];
      if (p && Number.isFinite(p[2]) && p[2] !== 0) p3[k] = { x: p[0], y: p[1], z: p[2] };
    }
    this.pts3 = p3;
    this.at3 = performance.now();
  }
  get has3D() { return !!this.pts3 && performance.now() - this.at3 < 700; }
  // metric wrist position (meters) or null — the assessment's depth channel
  hand3(side) {
    if (!this.has3D) return null;
    return (side === "left" ? this.pts3.wrL : this.pts3.wrR) || null;
  }

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
    if (!this.frame) this.frame = { x: this.anchor.x, y: this.anchor.y, sw: this.shoulderW, torso: null };

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
        // per-person thresholds: an explicit calibration (assessment's
        // "open… squeeze" step, `set: true`) is trusted whatever its size —
        // partial closers included; otherwise the passive envelope must see
        // enough range before replacing the fixed defaults
        let ccal = this.curlCal[s];
        if (!ccal) ccal = this.curlCal[s] = { lo: curl, hi: curl };
        if (ccal.set) {
          ccal.lo = Math.min(ccal.lo, curl);
          ccal.hi = Math.max(ccal.hi, curl);
        } else {
          ccal.lo = Math.min(curl, ccal.lo + GRIP_CAL_DECAY);
          ccal.hi = Math.max(curl, ccal.hi - GRIP_CAL_DECAY);
        }
        const crange = ccal.hi - ccal.lo;
        const trusted = ccal.set || crange > CURL_CAL_MIN_RANGE;
        const cclose = trusted ? ccal.lo + crange * this.closeFrac : CURL_CLOSE;
        const copen = trusted ? ccal.lo + crange * this.openFrac : CURL_OPEN;
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
      const close = range > GRIP_CAL_MIN_RANGE ? cal.lo + range * this.closeFrac : GRIP_CLOSE;
      const open = range > GRIP_CAL_MIN_RANGE ? cal.lo + range * this.openFrac : GRIP_OPEN;
      if (this.gripClosed[s]) { if (g > open) this.gripClosed[s] = false; }
      else if (g < close) this.gripClosed[s] = true;
    }

    // smoothed hand velocity (SW/s, y up) for swipe/ballistic mechanics
    for (const s of ["left", "right"]) {
      const w = this.wrist(s);
      if (!w || !this.shoulderW) { this._vel[s] = null; this._velPrev[s] = null; continue; }
      const prev = this._velPrev[s];
      if (prev) {
        const dt = (now - prev.at) / 1000;
        if (dt > 0.001) {
          const vx = (w.x - prev.x) / this.shoulderW / dt;
          const vy = -(w.y - prev.y) / this.shoulderW / dt;
          const sm = this._vel[s] || { x: vx, y: vy };
          this._vel[s] = { x: sm.x + (vx - sm.x) * 0.5, y: sm.y + (vy - sm.y) * 0.5 };
        }
      }
      this._velPrev[s] = { x: w.x, y: w.y, at: now };
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

    // arm length in SW, bend-invariant (the two segments summed) and held as
    // a decaying session max — a resting bent arm or one pointed at the
    // camera measures short, and the longest recent reading is the honest one
    for (const s of ["left", "right"]) {
      const sh = this.shoulder(s), el = this.elbow(s), wr = this.wrist(s);
      if (!sh || !el?.ok || !wr?.ok) continue;
      const len = (Math.hypot(el.x - sh.x, el.y - sh.y) + Math.hypot(wr.x - el.x, wr.y - el.y)) / this.shoulderW;
      if (!(len > 0.6 && len < 2.1)) continue;      // tracking-glitch guard
      const prev = this._armLen[s];
      this._armLen[s] = prev == null ? len : Math.max(len, prev - ARM_DECAY);
    }

    // Sitting closer or further has to move the frame's SCALE: the origin
    // stays locked (a reach must never drag the world with it), but if the
    // chair rolls back and sw is left frozen, every target quietly becomes a
    // larger fraction of the patient's reach. A turn of the trunk shortens
    // the projected shoulder width WITHOUT the patient moving, so a re-snap
    // needs the torso length — nearly yaw-invariant — to have changed the
    // same way. Sustained only: a lean recovers long before SCALE_HOLD.
    const torso = this._torsoLen();
    if (this.frame.torso == null) this.frame.torso = torso;
    const swOff = (this.shoulderW - this.frame.sw) / this.frame.sw;
    const trOff = (torso != null && this.frame.torso) ? (torso - this.frame.torso) / this.frame.torso : null;
    const agrees = trOff == null
      ? Math.abs(swOff) > SCALE_DRIFT                       // no hips in view: shoulders alone
      : Math.abs(swOff) > SCALE_DRIFT && Math.abs(trOff) > SCALE_DRIFT * 0.7 && swOff * trOff > 0;
    if (agrees) this._scaleSince ??= now;
    else this._scaleSince = null;
    if (this._scaleSince && now - this._scaleSince > SCALE_HOLD) {
      this.frame.sw = this.shoulderW;
      this.frame.torso = torso ?? this.frame.torso;
      this._scaleSince = null;
    }

    for (const cb of this.listeners) cb(now);
  }

  // shoulder-mid → hip-mid distance (video-norm units, not SW): the size
  // reference that a turn of the trunk barely changes
  _torsoLen() {
    // rawVis, not pts.ok: pts.ok is sticky, and a frozen hip would keep
    // vouching for a distance change long after the hips left the frame
    if (!this.rawVis?.hips) return null;
    const hL = this.pts?.hipL, hR = this.pts?.hipR;
    if (!hL || !hR || !this.anchor) return null;
    const hx = (hL.x + hR.x) / 2, hy = (hL.y + hR.y) / 2;
    const d = Math.hypot(hx - this.anchor.x, hy - this.anchor.y);
    return d > 1e-3 ? d : null;
  }

  // arm length in shoulder-width units — what a reach is actually made of.
  // The assessment stores it in the profile and GameBase compares it with the
  // live value, so "70% of range" means 70% of THIS arm in THIS session.
  armLenSW(side) { return this._armLen[side]; }

  // ---- second player (ZED seat 1) ---------------------------------
  // A deliberately thin second body: only what a paddle needs (shoulders,
  // wrists, trunk axis). It never touches this.pts/anchor/frame, so nothing
  // in the single-player path — compensation, grasp, relocation, the DDA —
  // can be moved by whoever else walks into the room.
  _ingestSecond(lm, now) {
    const vis = i => (lm[i].visibility ?? 1) > 0.5;
    if (!vis(LM.shL) || !vis(LM.shR)) return;
    const p = i => ({ x: 1 - lm[i].x, y: lm[i].y });
    const shL = p(LM.shL), shR = p(LM.shR);
    const mid = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
    const sw = Math.hypot(shL.x - shR.x, shL.y - shR.y);
    if (!(sw > 1e-4)) return;

    let trunk = { x: 0, y: 1 };
    if (vis(LM.hipL) && vis(LM.hipR)) {
      const hipL = p(LM.hipL), hipR = p(LM.hipR);
      const dx = (hipL.x + hipR.x) / 2 - mid.x, dy = (hipL.y + hipR.y) / 2 - mid.y;
      const n = Math.hypot(dx, dy) || 1;
      trunk = { x: dx / n, y: dy / n };
    }
    const prev = this.p2;
    const s = { shL, shR, mid, sw, trunk, lastSeen: now, wrist: {} };
    for (const side of ["left", "right"]) {
      const i = side === "left" ? LM.wrL : LM.wrR;
      if (!vis(i)) { s.wrist[side] = prev?.wrist?.[side] ?? null; continue; }
      const w = p(i);
      const o = prev?.wrist?.[side];
      s.wrist[side] = o ? { x: o.x + (w.x - o.x) * HAND, y: o.y + (w.y - o.y) * HAND } : w;
    }
    this.p2 = s;
  }

  get p2TrackingOk() { return !!this.p2 && performance.now() - this.p2.lastSeen < 700; }

  // second player's arm elevation, same convention as armAngle()
  armAngle2(side) {
    const s = this.p2;
    if (!this.p2TrackingOk) return null;
    const sh = side === "left" ? s.shL : s.shR, w = s.wrist[side];
    if (!sh || !w) return null;
    const ax = w.x - sh.x, ay = w.y - sh.y;
    const mag = Math.hypot(ax, ay) || 1;
    const dot = ax * s.trunk.x + ay * s.trunk.y;
    return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
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

  // palm center in canvas pixels (wrist fallback) — the cursor sits here
  palmPx(side, canvas) {
    const p = this.palm(side) || this.wrist(side);
    return p ? this._videoToPx(p.x, p.y, canvas) : null;
  }

  // explicit per-person squeeze calibration from the assessment's
  // "open wide… now squeeze" step — trusted whatever the range, so a hand
  // that can never fully close still gets working squeeze detection
  setCurlCal(side, lo, hi) {
    if (lo == null || hi == null || hi - lo < 0.08) return;
    this.curlCal[side] = { lo, hi, set: true };
  }

  // accessibility: how far into the patient's curl range "closed" sits.
  // easy = a light partial squeeze registers; firm = a deliberate full close.
  setSqueezeEase(mode) {
    if (mode === "easy") { this.closeFrac = 0.45; this.openFrac = 0.68; }
    else if (mode === "firm") { this.closeFrac = 0.25; this.openFrac = 0.5; }
    else { this.closeFrac = 0.35; this.openFrac = 0.6; }
  }

  // smoothed hand velocity in SW/s (y up) — null until two frames seen
  handVel(side) {
    const v = this._vel[side];
    return v ? { x: v.x, y: v.y, mag: Math.hypot(v.x, v.y) } : null;
  }

  // 3-state pronation/supination from forearmRoll, self-calibrating like the
  // grasp envelopes: "up" (supinated) / "flat" / "down" (pronated), with
  // hysteresis so tremor can't flicker the state. Returns null when the hand
  // isn't tracked, "flat" until enough rotation range has been seen.
  palmFacing(side) {
    const roll = this.forearmRoll(side);
    if (roll == null) return null;
    let cal = this.rollCal[side];
    if (!cal) cal = this.rollCal[side] = { lo: roll, hi: roll };
    cal.lo = Math.min(roll, cal.lo + GRIP_CAL_DECAY);
    cal.hi = Math.max(roll, cal.hi - GRIP_CAL_DECAY);
    const range = cal.hi - cal.lo;
    if (range < 0.22) return "flat";
    const f = (roll - cal.lo) / range;   // 0 = most pronated seen, 1 = most supinated
    const st = this.rollState[side];
    if (st === "up") { if (f < 0.62) this.rollState[side] = f < 0.25 ? "down" : "flat"; }
    else if (st === "down") { if (f > 0.38) this.rollState[side] = f > 0.75 ? "up" : "flat"; }
    else { if (f > 0.75) this.rollState[side] = "up"; else if (f < 0.25) this.rollState[side] = "down"; }
    return this.rollState[side];
  }
  // continuous rotation fraction 0..1 within the patient's own seen range
  rollFrac(side) {
    const roll = this.forearmRoll(side);
    const cal = this.rollCal[side];
    if (roll == null || !cal || cal.hi - cal.lo < 0.22) return null;
    return Math.max(0, Math.min(1, (roll - cal.lo) / (cal.hi - cal.lo)));
  }

  // pincer grip: thumb-tip ↔ index-tip gap over palm size (hand model only)
  pinch(side) {
    const p = this._handPts(side);
    if (!p) return null;
    const palm = Math.hypot(p[9].x - p[0].x, p[9].y - p[0].y) || 1e-6;
    return Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y) / palm;
  }
  pinchClosed(side) {
    const v = this.pinch(side);
    if (v == null) return false;
    if (this.pinchState[side]) { if (v > 0.52) this.pinchState[side] = false; }
    else if (v < 0.32) this.pinchState[side] = true;
    return this.pinchState[side];
  }
  // true pincer (not a fist): pinch closed while ring+pinky stay long
  pinchOnly(side) {
    if (!this.pinchClosed(side)) return false;
    const p = this._handPts(side);
    if (!p) return false;
    const w = p[0];
    const palm = Math.hypot(p[9].x - w.x, p[9].y - w.y) || 1e-6;
    const rest = (Math.hypot(p[16].x - w.x, p[16].y - w.y) + Math.hypot(p[20].x - w.x, p[20].y - w.y)) / 2 / palm;
    return rest > 1.35;
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
    this.frame = { x: this.anchor.x, y: this.anchor.y, sw: this.shoulderW, torso: this._torsoLen() };
    this._scaleSince = null;
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
  // ---- stereo (side-by-side) sources -------------------------------
  // A ZED plugged in as a plain UVC webcam hands the browser ONE double-wide
  // frame: left eye | right eye. Undetected, the patient sees the room twice
  // and MediaPipe searches a squashed 2:1 image. Everything downstream works
  // in normalized coordinates, so cropping to the left eye at the source is
  // enough — srcW/srcH below are the only sizes the rest of the class uses.
  // the TRUE pixel size of the frame. The ZED-bridge path is an <img> whose
  // videoWidth/Height are expandos describing the camera, not the MJPEG it
  // actually decodes (640x360), so a source rect built from the expandos
  // would read past the image and draw only part of the destination.
  _natural() {
    const v = this.video;
    return { w: v.naturalWidth || v.videoWidth || 0,
             h: v.naturalHeight || v.videoHeight || 0 };
  }
  get isStereo() {
    // the bridge always sends a single (left) eye, whatever its preview
    // aspect happens to be — only a raw UVC camera can hand us a stereo pair
    if (this.source === "zed") return false;
    const n = this._natural();
    return n.w > 0 && n.h > 0 && n.w / n.h >= STEREO_RATIO;
  }
  get srcW() { const n = this._natural(); return this.isStereo ? n.w / 2 : n.w; }
  get srcH() { return this._natural().h; }

  // what the pose/hand models should look at: the raw element when the feed
  // is ordinary, a left-eye crop when it is stereo
  _detectSource() {
    if (!this.isStereo) return this.video;
    const w = this.srcW, h = this.srcH;
    if (!this._stereoLogged) {
      this._stereoLogged = true;
      console.info(`Stereo camera detected (${this.video.videoWidth}x${h}); ` +
                   `using the left eye (${w}x${h}). For depth tracking run tools/zed_bridge.py.`);
    }
    if (!this._crop) this._crop = document.createElement("canvas");
    if (this._crop.width !== w || this._crop.height !== h) {
      this._crop.width = w; this._crop.height = h;
    }
    this._crop.getContext("2d").drawImage(this.video, 0, 0, w, h, 0, 0, w, h);
    return this._crop;
  }

  _videoToPx(nx, ny, canvas) {
    const vw = this.srcW, vh = this.srcH;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    return { x: (canvas.width - dw) / 2 + nx * dw, y: (canvas.height - dh) / 2 + ny * dh };
  }
  // inverse: canvas pixels -> body-relative (SW units, y up)
  pxToRel(px, canvas) {
    const vw = this.srcW, vh = this.srcH;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    const nx = (px.x - (canvas.width - dw) / 2) / dw;
    const ny = (px.y - (canvas.height - dh) / 2) / dh;
    return { x: (nx - this.frame.x) / this.frame.sw, y: -(ny - this.frame.y) / this.frame.sw };
  }
  pxPerSW(canvas) {
    const scale = Math.max(canvas.width / this.srcW, canvas.height / this.srcH);
    return this.frame.sw * this.srcW * scale;
  }
}

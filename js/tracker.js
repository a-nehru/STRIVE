// Webcam pose tracking (MediaPipe Pose Landmarker) with a body-relative
// coordinate frame. Units: shoulder-widths (SW) for distance, degrees vs the
// trunk axis for arm elevation. Two time scales on the body anchor:
//   slow filter  -> legitimate repositioning (targets follow the body)
//   fast vs slow -> compensation signal (Posture Coach)
//   large/sustained change -> relocation (graceful pause + re-baseline)

// MediaPipe is loaded at init, not as a static import: a static import that
// fails (CDN blocked, no internet) takes the whole app down with it, and the
// camera never even gets asked for. The runtime, its wasm and the two models
// are looked for in assets/mediapipe first (vendored copies, so the site
// works with no outside network at all), then on the CDN (Oct 2026).
const MP_VER = "0.10.14";
const MP_LOCAL = new URL("../assets/mediapipe/", import.meta.url).href;
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/`;
const MP_MODELS = {
  pose: {
    file: "pose_landmarker_full.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  },
  hand: {
    file: "hand_landmarker.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
};
// how long a model download may take before the boot gives up with a clear
// message instead of a spinner for ever (the full pose model is 9 MB)
const MP_LOAD_MS = 90000;

async function _exists(url) {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "force-cache" });
    return r.ok;
  } catch { return false; }
}
function _withTimeout(p, ms, what, full) {   // `full`: the whole message, when the hint about downloads does not fit
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(full || `${what} took too long. Is the network blocking the download?`)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}
// the tasks-vision runtime: {FilesetResolver, PoseLandmarker, HandLandmarker}
// plus the wasm root it should be told about, local first, CDN second
let _mp = null;
async function loadMediaPipe(status) {
  if (_mp) return _mp;
  const local = await _exists(MP_LOCAL + "vision_bundle.mjs");
  const base = local ? MP_LOCAL : MP_CDN;
  status?.(local ? "Loading the tracking model…" : "Downloading the tracking model…");
  let mod;
  try {
    mod = await _withTimeout(import(base + "vision_bundle.mjs"), MP_LOAD_MS, "Loading MediaPipe");
  } catch (e) {
    if (!local) throw e;
    console.warn("Local MediaPipe bundle failed, trying the CDN", e);
    mod = await _withTimeout(import(MP_CDN + "vision_bundle.mjs"), MP_LOAD_MS, "Loading MediaPipe");
  }
  const wasmLocal = local && await _exists(MP_LOCAL + "wasm/vision_wasm_internal.js");
  const vision = await mod.FilesetResolver.forVisionTasks((wasmLocal ? MP_LOCAL : MP_CDN) + "wasm");
  _mp = { ...mod, vision, local };
  return _mp;
}
async function modelPath(key) {
  const m = MP_MODELS[key];
  return (await _exists(MP_LOCAL + m.file)) ? MP_LOCAL + m.file : m.cdn;
}

// framing: the hips must sit above this (normalised y) for the waist to count
// as in the picture (Oct 2026, by request: the login asks people back until
// they are seen down to the waist)
const WAIST_MAX_Y = 0.92;
const LM = {
  nose: 0,
  earL: 7, earR: 8,
  shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  piL: 17, piR: 18, ixL: 19, ixR: 20, thL: 21, thR: 22,
  hipL: 23, hipR: 24,
};

// local ZED bridge (tools/zed_bridge.py): probed at init when camera source
// is "auto"; the game never requires it
const ZED_BRIDGE = "http://localhost:8322";

const SLOW = 0.04, FAST = 0.35, HAND = 0.5;
// the ZED's own body fitting already steadies the joints, so its points are
// smoothed less here (27 Oct 2026, by request: the skeleton trailed the picture)
const HAND_ZED = 0.8;
// Body lock (webcam path). MediaPipe returns up to numPoses bodies in
// confidence order and re-orders them freely, so a therapist or a second
// patient in frame can become "the" body mid-round. We keep our own lock and
// follow it by build + position instead. The gate is per-frame displacement
// from the last matched frame, so a scoot or a big reach passes easily while
// a different person standing somewhere else never does.
const NUM_POSES = 3;
// One complete part of a multipart/x-mixed-replace stream, or null when the
// buffer does not hold a whole frame yet: {frame: Uint8Array, rest: Uint8Array}.
// Reads the part header's Content-Length (the bridge always sends one); a
// header without it falls back to scanning for the JPEG end marker.
export function splitMjpeg(buf) {
  const CRLF2 = [13, 10, 13, 10];
  let hEnd = -1;
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) { hEnd = i; break; }
  }
  if (hEnd < 0) return null;
  const header = String.fromCharCode(...buf.subarray(Math.max(0, hEnd - 200), hEnd));
  const m = /content-length:\s*(\d+)/i.exec(header);
  const start = hEnd + CRLF2.length;
  if (m) {
    const n = +m[1];
    if (buf.length < start + n) return null;
    return { frame: buf.slice(start, start + n), rest: buf.subarray(start + n) };
  }
  // no length: find FFD9 after an FFD8
  let s0 = -1;
  for (let i = start; i + 1 < buf.length; i++) if (buf[i] === 0xFF && buf[i + 1] === 0xD8) { s0 = i; break; }
  if (s0 < 0) return null;
  for (let i = s0 + 2; i + 1 < buf.length; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD9) return { frame: buf.slice(s0, i + 2), rest: buf.subarray(i + 2) };
  }
  return null;
}

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
// the curl band must not be poisoned by one wild frame (tools/zed_track.py's
// hardening, Sep 2026): the envelope may only GROW by CURL_CAL_GROW a frame,
// its span is capped at CURL_CAL_MAX_RANGE (a real hand spans about 1.0),
// and values outside CURL_PLAUSIBLE are ignored. One spike to 3.0 used to
// lift "open" out of a real hand's reach for minutes.
const CURL_CAL_GROW = 0.02, CURL_CAL_MAX_RANGE = 1.4, CURL_PLAUSIBLE = [0.5, 3.0];
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
    this.frames = 0;          // pose samples ingested, for the FPS readout

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
    this.pinned = null;        // build of a person staff clicked (webcam): followed through a login and an absence
    this.pick = null;          // a pending click, in mirrored normalised coordinates
    this.peopleSeen = 0;       // bodies in frame this detection (for staff UI)
    // the SECOND PLAYER on the webcam path (Oct 2026, by request: two-player
    // Pong without the ZED). Asked for by setSecond(true); followed with its
    // own lock, the same build-and-position signature as the patient's, so
    // the two never trade paddles, and never the body the patient's lock
    // took. The ZED path keeps seating people in the bridge.
    this.wantSecond = false;
    this.lock2 = null;
    // ZED path: everyone the bridge sees this frame, seated or not, as
    // {id, x, y, sw, z, seat, play} in normalized (unmirrored) image coords,
    // so the welcome screen can put a marker on each person and staff can
    // click the one to follow.
    this.people = [];
    this._armLen = { left: null, right: null };   // decaying session max, SW
    // the same maxima kept per SEGMENT. armLenSW is bend-invariant because it
    // sums the two; the spherical workspace needs them apart, to solve each
    // segment's depth from its foreshortening (see armVec3).
    this._segLen = { left: { upper: null, fore: null }, right: { upper: null, fore: null } };
    this.pts3 = null;          // metric XYZ per landmark (ZED only), meters
    this.at3 = 0;
  }

  // source: "auto" probes the local ZED bridge (tools/zed_bridge.py) and uses
  // the ZED SDK skeleton when it's running; "webcam" forces MediaPipe. The
  // bridge speaks the MediaPipe 33-landmark layout, so everything downstream
  // of _ingest (smoothing, stable frame, coach, grip fallback) is identical.
  async init(videoEl, source = "auto", status = null, onPicture = null) {
    this.video = videoEl;
    this.source = "webcam";
    this.onStatus = status;
    if (source !== "webcam") {
      status?.("Looking for the ZED bridge…");
      const zed = await this._probeZed();
      if (zed) {
        this.source = "zed";
        this.zedInfo = zed;
        // the bridge's MJPEG preview stands in for the webcam <video>: a
        // canvas that always holds one WHOLE frame, with expando props so it
        // quacks like a <video> for drawVideoMirror and _videoToPx. It used
        // to be an <img src="/video.mjpg">: the browser paints a multipart
        // JPEG progressively, so a frame copied mid-arrival showed its top
        // half new and the rest old or grey (Oct 2026, "the picture loads
        // half way"). _openPreview reads the stream itself and decodes each
        // complete JPEG before it is shown.
        const cv = document.createElement("canvas");
        cv.width = zed.w; cv.height = zed.h;
        cv.videoWidth = zed.w; cv.videoHeight = zed.h;
        cv.naturalWidth = zed.w; cv.naturalHeight = zed.h;
        cv.readyState = 0;
        this.video = cv;
        // hold the "waking up the camera" screen until the stream's first
        // frame has actually arrived, so the welcome mirror does not open on
        // a blank panel and fill in a second or two later
        const shown = this._openPreview(cv);
        shown.then(() => onPicture?.());
        await Promise.race([shown, new Promise(res => setTimeout(res, 4000))]);
        // GRASP ON THE ZED (Sep 2026): the bridge's BODY_38 fingertips are too
        // coarse to call open/close reliably, so the 21-point hand model runs
        // in the BRIDGE on a crop around each wrist (status.hand_model) and
        // its hands arrive on the stream. Only when the bridge has no hand
        // model does the browser run the same model itself, on the preview
        // frames (_startZed) — a fallback, and a weak one at ward distances,
        // where a hand is a few dozen pixels of the whole picture.
        if (!zed.hand_model) {
          const mp = await loadMediaPipe(status);
          await this._loadHands(mp);
        }
        return;
      }
    }
    // THE CAMERA FIRST (Oct 2026): the permission prompt and the live picture
    // come up at once, before the 9 MB pose model is fetched. Before this the
    // models were loaded first, so a slow or filtered network (a hospital
    // proxy blocking Google storage) left "Waking up the camera" on screen
    // for ever and the browser never even asked for the camera.
    status?.("Starting the camera…");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(location.protocol === "http:" && location.hostname !== "localhost"
        ? "the browser blocks the camera on a plain http:// address. Open the page on localhost or over https."
        : "this browser cannot open a camera.");
    }
    const open = async video => {
      try {
        return await navigator.mediaDevices.getUserMedia({ video, audio: false });
      } catch (e) {
        const why = e.name === "NotAllowedError" ? "camera permission was refused. Allow the camera for this site and reload."
          : e.name === "NotFoundError" ? "no camera was found."
          : e.name === "NotReadableError" ? "the camera is in use by another program."
          : e.name === "OverconstrainedError" ? "no camera matched the request."
          : e.message;
        throw new Error(why);
      }
    };
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    let stream = await open({ ...size, facingMode: "user" });
    // a laptop with a Windows Hello camera lists an infrared camera beside
    // the colour one and the browser may hand over the IR one by default:
    // it gives a black or empty picture and the pose model sees nobody.
    // Once permission is granted the labels are readable, so swap to a
    // colour camera when the one we were given looks like IR or depth.
    try {
      const isIR = d => /\bIR\b|infrared|depth/i.test(d.label);
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      const track = stream.getVideoTracks()[0];
      const cur = cams.find(d => d.deviceId === track.getSettings().deviceId);
      const colour = cams.find(d => !isIR(d));
      if (cur && isIR(cur) && colour) {
        console.warn("Default camera looks infrared, switching", cur.label, "->", colour.label);
        track.stop();
        stream = await open({ ...size, deviceId: { exact: colour.deviceId } });
      }
      this.cameraLabel = (cams.find(d => d.deviceId === stream.getVideoTracks()[0].getSettings().deviceId) || cur || {}).label || "";
    } catch (e) { console.warn("Camera enumeration failed", e); }
    videoEl.srcObject = stream;
    await _withTimeout(new Promise(res => { videoEl.onloadedmetadata = res; }), 15000,
      "", "The camera opened but gave no picture. Is another program using it?");
    await videoEl.play();
    onPicture?.();                // the picture is up: the models load behind it

    const mp = await loadMediaPipe(status);
    this.mpLocal = mp.local;
    this.landmarker = await _withTimeout(mp.PoseLandmarker.createFromOptions(mp.vision, {
      baseOptions: {
        modelAssetPath: await modelPath("pose"),
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      // more than one body on purpose: with a therapist or a second patient in
      // the room, asking for a single pose means the model silently hands us
      // whoever it scored highest THIS frame. We take all of them and pick the
      // patient ourselves (_pickBody).
      numPoses: NUM_POSES,
    }), MP_LOAD_MS, "Loading the pose model");
    status?.("Loading the hand model…");
    await this._loadHands(mp);
  }

  // dedicated hand model for real grasp detection — optional: pose tracking
  // still works if it fails to load
  async _loadHands(mp) {
    try {
      this.handLandmarker = await _withTimeout(mp.HandLandmarker.createFromOptions(mp.vision, {
        baseOptions: {
          modelAssetPath: await modelPath("hand"),
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      }), MP_LOAD_MS, "Loading the hand model");
    } catch (e) {
      console.warn("Hand Landmarker unavailable — using pose-fingertip grasp fallback", e);
    }
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

  // Read the bridge's multipart MJPEG stream and draw every COMPLETE frame
  // onto `cv` (the stand-in <video>). Frames that arrive while one is still
  // decoding are dropped, so the picture never falls behind. Resolves when
  // the first frame is showing; reconnects after a second if the stream ends
  // while the tracker is meant to be running.
  async _openPreview(cv) {
    const ctx = cv.getContext("2d");
    let first = null;
    const firstShown = new Promise(res => { first = res; });
    const run = async () => {
      let res;
      try { res = await fetch(`${ZED_BRIDGE}/video.mjpg`, { cache: "no-store" }); } catch { return false; }
      if (!res.ok || !res.body) return false;
      const reader = res.body.getReader();
      let buf = new Uint8Array(0);
      let decoding = false, pending = null;
      const show = async bytes => {
        if (decoding) { pending = bytes; return; }      // keep only the newest frame
        decoding = true;
        try {
          const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
          if (cv.width !== bmp.width || cv.height !== bmp.height) {
            cv.width = bmp.width; cv.height = bmp.height;
            cv.videoWidth = cv.naturalWidth = bmp.width; cv.videoHeight = cv.naturalHeight = bmp.height;
          }
          ctx.drawImage(bmp, 0, 0);
          bmp.close?.();
          cv.readyState = 2;
          cv.frameAt = performance.now();
          first?.(); first = null;
        } catch { /* a truncated JPEG: skip it */ }
        decoding = false;
        if (pending) { const nx = pending; pending = null; show(nx); }
      };
      while (true) {
        let chunk;
        try { chunk = await reader.read(); } catch { break; }
        if (chunk.done) break;
        if (!this.running && this.frames > 0) { try { reader.cancel(); } catch {} return true; }
        const merged = new Uint8Array(buf.length + chunk.value.length);
        merged.set(buf); merged.set(chunk.value, buf.length);
        buf = merged;
        // frames: a part header ending in a blank line, then Content-Length
        // bytes of JPEG. Anything before the header (the boundary, a stray
        // CRLF) is skipped by searching for the header's end.
        for (;;) {
          const parts = splitMjpeg(buf);
          if (!parts) break;
          buf = parts.rest;
          show(parts.frame);
        }
        if (buf.length > 16 * 1024 * 1024) buf = new Uint8Array(0);   // a stream we cannot parse: start over
      }
      return true;
    };
    (async () => {
      for (;;) {
        const ok = await run();
        if (this.running === false && this.frames > 0) return;
        if (!this.running && !ok && first === null) return;
        await new Promise(r => setTimeout(r, ok ? 300 : 1000));
      }
    })();
    return firstShown;
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
        if (msg.people) this.people = msg.people;
        this.peopleSeen = msg.people?.length ?? msg.bodies?.length ?? 0;
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
        // the bridge's own hand model (a crop around each wrist, see
        // tools/zed_bridge.py HandWorker): 21 points in the same unmirrored
        // image coordinates as the skeleton, plus the world-landmark curl
        if (msg.hands?.length) {
          this._ingestHands({ landmarks: msg.hands.map(h => h.pts.map(q => ({ x: q[0], y: q[1] }))) },
                            now, msg.hands.map(h => h.curl));
          for (const h of msg.hands) if (h.bend != null) this._ingestBend(h.side, h.bend, now);
        }
      } catch { /* skip malformed frame */ }
    };
    // the hand model on the preview frames, every 2nd frame like the webcam
    // path: the MJPEG <img> is copied to a canvas so the detector sees the
    // frame that is showing right now
    if (!this.handLandmarker) return;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this._handFrameToggle = !this._handFrameToggle;
      if (!this._handFrameToggle || !this.pts) return;
      const img = this.video, w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return;
      if (!this._zedFrame) this._zedFrame = document.createElement("canvas");
      if (this._zedFrame.width !== w || this._zedFrame.height !== h) { this._zedFrame.width = w; this._zedFrame.height = h; }
      try {
        this._zedFrame.getContext("2d").drawImage(img, 0, 0, w, h);
        const now = performance.now();
        if (now <= (this._lastHandTs || 0)) return;   // timestamps must climb
        this._lastHandTs = now;
        this._ingestHands(this.handLandmarker.detectForVideo(this._zedFrame, now), now);
      } catch { /* a frame the detector could not take; the skeleton keeps running */ }
    };
    requestAnimationFrame(loop);
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
        if (!r.landmarks?.length) { this.people = []; this.peopleSeen = 0; }
        if (mine) this._ingest(mine, now);
        if (this.wantSecond && r.landmarks?.length > 1) {
          const second = this._pickSecond(r.landmarks, mine, now);
          if (second) this._ingestSecond(second, now);
        }
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
    const chosen = this._pickFrom(cands, now);
    // everyone in view for the welcome and login screens' markers, in the
    // same shape the ZED bridge sends (x unmirrored), so staff can click the
    // patient on a webcam too (Oct 2026, by request)
    this.people = cands.map((c, i) => ({ id: i, x: 1 - c.mid.x, y: c.mid.y, sw: c.sw,
                                         seat: c === chosen ? 0 : null }));
    return chosen ? chosen.lm : null;
  }

  _pickFrom(cands, now) {
    if (!cands.length) return null;
    // a click on a person (selectPerson): take the body nearest the click,
    // whatever we were following, and remember their build
    if (this.pick) {
      const at = this.pick; this.pick = null;
      let best = null, bestD = Infinity;
      for (const c of cands) {
        const d = Math.hypot(c.mid.x - at.x, c.mid.y - at.y);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best && bestD < Math.max(0.12, best.sw * 1.5)) {
        this.lock = null;
        this._setLock(best, now);
        this.pinned = { sw: best.sw, torso: best.torso };
        return best;
      }
    }

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
      if (best && bestCost < LOCK_GATE) { this._setLock(best, now); return best; }
      return null;   // the person we follow is not in this frame: pause, don't swap
    }
    // a person staff clicked is followed by BUILD once they have been out of
    // view: the body whose shoulder width and torso ratio match, or the only
    // body there is; with several strangers and no match, wait rather than
    // hand the session to whoever stands in the middle
    if (this.pinned) {
      if (cands.length === 1) { this._setLock(cands[0], now); return cands[0]; }
      let best = null, bestCost = Infinity;
      for (const c of cands) {
        const scale = Math.abs(c.sw - this.pinned.sw) / this.pinned.sw;
        const build = (c.torso != null && this.pinned.torso != null)
          ? Math.abs(c.torso - this.pinned.torso) / this.pinned.torso : 0.2;
        const cost = scale * 2 + build * 1.5;
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      if (best && bestCost < LOCK_GATE * 0.6) { this._setLock(best, now); return best; }
      return null;
    }
    // no lock, or it expired: the patient is the person in front of the
    // camera, so take the most central body — not the largest, not the one
    // the model happens to be most confident about
    cands.sort((a, b) => Math.abs(a.mid.x - 0.5) - Math.abs(b.mid.x - 0.5));
    this._setLock(cands[0], now);
    return cands[0];
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
  // re-acquires the most central body. A person staff CLICKED stays followed
  // through a login (the pick is made on the first screen, before the name);
  // relock(true) lets go of them too.
  relock(force = false) {
    if (this.pinned && !force) return;
    this.lock = null;
    this.pinned = null;
  }

  // two-player: start (or stop) following a second body. Off, the second
  // player is forgotten at once so a stale paddle never lingers.
  setSecond(on) {
    this.wantSecond = !!on;
    if (!on) { this.lock2 = null; this.p2 = null; }
  }
  relockSecond() { this.lock2 = null; }
  // the second person: never the patient's body; followed by their own lock
  // through LOCK_GRACE of absence; first acquired as the body furthest from
  // the patient (two people side by side: the other one)
  _pickSecond(list, mineLm, now) {
    const cands = list.filter(l => l !== mineLm).map(l => this._feature(l)).filter(Boolean);
    if (!cands.length) return null;
    const lock = this.lock2;
    if (lock && now - lock.at < LOCK_GRACE) {
      let best = null, bestCost = Infinity;
      for (const c of cands) {
        const move = Math.hypot(c.mid.x - lock.mid.x, c.mid.y - lock.mid.y) / lock.sw;
        const scale = Math.abs(c.sw - lock.sw) / lock.sw;
        const build = (c.torso != null && lock.torso != null) ? Math.abs(c.torso - lock.torso) / lock.torso : 0;
        const cost = move + scale * 2 + build * 1.5;
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      if (best && bestCost < LOCK_GATE) { this._setLock2(best, now); return best.lm; }
      return null;
    }
    const ref = this.lock?.mid;
    if (ref) cands.sort((a, b) => Math.hypot(b.mid.x - ref.x, b.mid.y - ref.y) - Math.hypot(a.mid.x - ref.x, a.mid.y - ref.y));
    this._setLock2(cands[0], now);
    return cands[0].lm;
  }
  _setLock2(c, now) {
    const prev = this.lock2;
    const torso = c.torso != null
      ? (prev?.torso != null ? prev.torso + (c.torso - prev.torso) * 0.05 : c.torso)
      : prev?.torso ?? null;
    this.lock2 = { mid: c.mid, sw: c.sw, torso, at: now };
  }

  // ZED path: staff clicked a person. The bridge pins seat 0 to that
  // tracking id and follows them from then on (build signature when the id
  // resets), wherever in the room they are. Resolves to true if the bridge
  // took it. No-op on the webcam path.
  // Follow the person staff clicked. On the ZED the bridge pins the seat to
  // that tracking id; on a webcam `at` (the marker's unmirrored normalised
  // position, from this.people) picks the body nearest it on the next frame
  // and its build is remembered (see _pickFrom).
  async selectPerson(id, seat = 0, at = null) {
    if (this.source !== "zed") {
      const p = at || this.people?.find(q => q.id === id);
      if (!p) return false;
      this.pick = { x: 1 - p.x, y: p.y };
      return true;
    }
    try {
      const r = await fetch(`${ZED_BRIDGE}/select?id=${encodeURIComponent(id)}&seat=${seat}`);
      const j = await r.json();
      return !!j.ok;
    } catch { return false; }
  }

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
    this.frames++;
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
      mix(this.pts[k], raw[k], this.source === "zed" ? HAND_ZED : HAND);
      this.pts[k].ok = true;
    }

    // hand open/closed: prefer the 21-point hand model's finger curl (fixed,
    // scale-invariant hysteresis); fall back to the self-calibrating pose-
    // fingertip envelope when the hand model has no fresh detection
    for (const s of ["left", "right"]) {
      let curl = this.handCurl(s);
      if (curl != null && (curl < CURL_PLAUSIBLE[0] || curl > CURL_PLAUSIBLE[1])) curl = null;
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
          // shrink slowly, grow slowly, never wider than a real hand's range
          ccal.lo = Math.max(Math.min(curl, ccal.lo + GRIP_CAL_DECAY), ccal.lo - CURL_CAL_GROW);
          ccal.hi = Math.min(Math.max(curl, ccal.hi - GRIP_CAL_DECAY), ccal.hi + CURL_CAL_GROW);
          if (ccal.hi - ccal.lo > CURL_CAL_MAX_RANGE) {
            if (curl - ccal.lo < ccal.hi - curl) ccal.hi = ccal.lo + CURL_CAL_MAX_RANGE;
            else ccal.lo = ccal.hi - CURL_CAL_MAX_RANGE;
          }
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
    // waist: both hips seen AND inside the picture with a little room under
    // them (a detector can report a hip it inferred below the frame edge)
    this.rawVis = { hips: raw.hipL.ok && raw.hipR.ok,
      waist: raw.hipL.ok && raw.hipR.ok && Math.max(raw.hipL.y, raw.hipR.y) < WAIST_MAX_Y };

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
      const up = Math.hypot(el.x - sh.x, el.y - sh.y) / this.shoulderW;
      const fo = Math.hypot(wr.x - el.x, wr.y - el.y) / this.shoulderW;
      const len = up + fo;
      if (!(len > 0.6 && len < 2.1)) continue;      // tracking-glitch guard
      const prev = this._armLen[s];
      this._armLen[s] = prev == null ? len : Math.max(len, prev - ARM_DECAY);
      // per-segment maxima, same decaying-max rule and the same reason: a
      // segment angled towards the camera measures short, never long
      const sg = this._segLen[s];
      sg.upper = sg.upper == null ? up : Math.max(up, sg.upper - ARM_DECAY);
      sg.fore  = sg.fore  == null ? fo : Math.max(fo, sg.fore  - ARM_DECAY);
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
  segLenSW(side) { return this._segLen[side]; }

  // ---- the arm in three dimensions --------------------------------
  //
  // The reachable-workspace protocol sweeps the arm through planes that a
  // frontal camera sees edge-on: arm straight in front, arm forward and
  // across. Projected onto the image those movements almost vanish, so a
  // 2D-only measure would score a patient who completed them at nearly zero.
  // The third coordinate is therefore recovered rather than skipped.
  //
  // With the ZED it is measured: lm3 is metric, and the body's own axes are
  // rebuilt from the shoulders/hips so a patient sitting at an angle to the
  // camera still reports "in front of me", not "in front of the camera".
  //
  // With a webcam it is SOLVED, from foreshortening. Each segment's true
  // length is known in SW (the decaying session maxima above); its projected
  // length is measured this frame; the missing depth is what is left:
  //     dz = sqrt(max(0, L² − |projected|²))
  // taken segment by segment so a bent elbow is not mistaken for a forward
  // reach — the failure a whole-arm version of this has. Both segments are
  // taken as reaching FORWARD, which is the ambiguity a single camera cannot
  // resolve and the reason posterior targets are never asked for on a webcam.
  //
  // Returns SW units in the body frame — x to the patient's right, y up,
  // z forward — plus which of the two it was, so nothing downstream can
  // report a solved depth as a measured one.
  armVec3(side) {
    const m = this._armVec3Depth(side);
    if (m) return m;
    return this._armVec3Mono(side);
  }

  _armVec3Depth(side) {
    if (!this.has3D) return null;
    const P = this.pts3;
    const g = k => { const p = P[k]; return p ? [p.x, p.y, p.z] : null; };
    const shL = g("shL"), shR = g("shR"), hipL = g("hipL"), hipR = g("hipR");
    const sh = g(side === "left" ? "shL" : "shR");
    const el = g(side === "left" ? "elL" : "elR");
    const wr = g(side === "left" ? "wrL" : "wrR");
    if (!shL || !shR || !sh || !el || !wr) return null;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const norm = v => { const n = Math.hypot(...v) || 1e-6; return [v[0] / n, v[1] / n, v[2] / n]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    // right axis: shoulder-to-shoulder, pointing to the patient's right
    const right = norm(sub(shR, shL));
    // up axis: hips to shoulders when the hips are visible, else the SDK's
    // own vertical (y is DOWN in the camera frame)
    let up;
    if (hipL && hipR) {
      const hip = [(hipL[0] + hipR[0]) / 2, (hipL[1] + hipR[1]) / 2, (hipL[2] + hipR[2]) / 2];
      const shm = [(shL[0] + shR[0]) / 2, (shL[1] + shR[1]) / 2, (shL[2] + shR[2]) / 2];
      up = norm(sub(shm, hip));
    } else up = [0, -1, 0];
    // orthogonalize, then take forward as the trunk normal. Its SIGN is fixed
    // by the head rather than assumed from the camera's handedness: the nose
    // is in front of the shoulders on every body.
    up = norm(sub(up, right.map(v => v * dot(up, right))));
    let fwd = norm(cross(right, up));
    const nose = P.nose ? [P.nose.x, P.nose.y, P.nose.z] : null;
    const ear = P.earL && P.earR
      ? [(P.earL.x + P.earR.x) / 2, (P.earL.y + P.earR.y) / 2, (P.earL.z + P.earR.z) / 2] : null;
    const head = nose || ear;
    if (head) {
      const shm = [(shL[0] + shR[0]) / 2, (shL[1] + shR[1]) / 2, (shL[2] + shR[2]) / 2];
      if (dot(sub(head, shm), fwd) < 0) fwd = fwd.map(v => -v);
    } else if (dot(fwd, [0, 0, 1]) > 0) fwd = fwd.map(v => -v);   // z grows away from the camera

    const scale = Math.hypot(...sub(shR, shL)) || 1e-6;           // metres per SW
    const to = p => {
      const v = sub(p, sh);
      return { x: dot(v, right) / scale, y: dot(v, up) / scale, z: dot(v, fwd) / scale };
    };
    return { elbow: to(el), wrist: to(wr), method: "depth", shoulderM: scale };
  }

  _armVec3Mono(side) {
    const f = this.frame;
    const sh = this.shoulder(side), el = this.elbow(side), wr = this.wrist(side);
    const seg = this._segLen[side];
    if (!f || !sh || !el?.ok || !wr?.ok || !seg.upper || !seg.fore) return null;
    // in-plane, SW, y up, origin at the shoulder of the assessed arm
    const e = { x: (el.x - sh.x) / f.sw, y: -(el.y - sh.y) / f.sw };
    const w = { x: (wr.x - sh.x) / f.sw, y: -(wr.y - sh.y) / f.sw };
    const eLen = Math.hypot(e.x, e.y);
    const fx = w.x - e.x, fy = w.y - e.y;
    const fLen = Math.hypot(fx, fy);
    const dzU = Math.sqrt(Math.max(0, seg.upper * seg.upper - eLen * eLen));
    const dzF = Math.sqrt(Math.max(0, seg.fore * seg.fore - fLen * fLen));
    return {
      elbow: { x: e.x, y: e.y, z: dzU },
      wrist: { x: w.x, y: w.y, z: dzU + dzF },
      method: "monocular",
    };
  }

  // Elbow flexion in degrees from the reconstructed arm: 180 = straight.
  // Computed in 3D on purpose — the 2D angle reads a straight arm pointing at
  // the camera as fully bent, which is exactly the posture the straight-arm
  // circle is asking the patient to hold.
  elbowAngle(side) {
    const a = this.armVec3(side);
    if (!a) return null;
    const u = a.elbow;
    const v = { x: a.wrist.x - u.x, y: a.wrist.y - u.y, z: a.wrist.z - u.z };
    const nu = Math.hypot(u.x, u.y, u.z), nv = Math.hypot(v.x, v.y, v.z);
    if (!(nu > 1e-4 && nv > 1e-4)) return null;
    const c = (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv);
    return 180 - Math.acos(Math.max(-1, Math.min(1, c))) / Math.PI * 180;
  }

  // Hand length in shoulder-width units: wrist to middle fingertip, from the
  // 21-point hand model. The assessment's functional reaches are scored in
  // this unit because "close enough to count as touching" is a hand's length,
  // not a fixed distance — the same reason the Kinetigram device normalizes
  // its body-landmark distances by hand length. Null without a fresh hand
  // detection, so the caller falls back to a typical ratio knowingly rather
  // than being handed a guess dressed as a measurement.
  handLenSW(side) {
    const p = this._handPts(side);
    if (!p || !this.shoulderW) return null;
    const d = Math.hypot(p[12].x - p[0].x, p[12].y - p[0].y) / this.shoulderW;
    return d > 0.2 && d < 0.9 ? d : null;
  }

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
  _ingestHands(res, now, curls = null) {
    if (!res?.landmarks?.length || !this.pts) return;
    for (const [k, lm] of res.landmarks.entries()) {
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
      // curl: the bridge measures it on the hand model's metric world
      // landmarks (no foreshortening); the browser path computes it from
      // the image points in handCurl
      this.hands[side] = { pts, at: now, curl: curls?.[k] ?? null };
    }
  }
  // WRIST BEND (28 Oct 2026, by request: measure it before a wrist shot is
  // built): flexion + / extension - in degrees from the bridge (ZED forearm
  // against the hand model's 3D hand), with the range seen this session and
  // how often a new value arrives. ZED only; null on a webcam.
  _ingestBend(side, deg, now) {
    const b = (this.bends ??= {})[side] ??= { deg, lo: deg, hi: deg, at: now, n: 0, t0: now };
    if (b.n > 0 && deg === b.deg) return;            // the same answer resent with a newer body frame
    b.deg = deg; b.at = now; b.n++;
    b.lo = Math.min(b.lo, deg); b.hi = Math.max(b.hi, deg);
  }
  wristBend(side) {
    const b = this.bends?.[side];
    if (!b || performance.now() - b.at > 600) return null;
    const secs = (b.at - b.t0) / 1000;
    return { deg: b.deg, lo: b.lo, hi: b.hi, rate: secs > 1 ? b.n / secs : null };
  }
  resetWristBend() { this.bends = {}; }
  _handPts(side) {
    const h = this.hands[side];
    return h && performance.now() - h.at < 600 ? h.pts : null;
  }

  // finger curl from the 21-point hand model: mean fingertip→wrist distance
  // over palm size (wrist→middle MCP). ~2.0 open hand, ~1.0 fist —
  // scale-invariant, so no per-person calibration needed.
  handCurl(side) {
    const h = this.hands[side];
    if (h && performance.now() - h.at < 600 && h.curl != null) return h.curl;
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

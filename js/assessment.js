// Assessment — ONE arm (the arm chosen at setup), two steps:
//
//   CIRCLES   two big circles, one each way round, with the chosen arm. The
//             painted shape IS the workspace: its AREA (and, with the ZED's
//             depth, its VOLUME) is the headline number, plus which quadrant
//             is lost, the reading that matters in hemiparesis. Then one
//             LIFT — arm straight up as high as it goes and back down — which
//             is shoulder flexion and extension asked for directly.
//   TARGETS   five targets on the edge of that shape, always inside it. One
//             at a time: up to 10 s to get there, then up to 5 s to squeeze
//             and open the hand while there. Reaching is the pass/fail and
//             grasping never is, so a patient with no hand function still
//             completes every target; the grasp is recorded beside it, per
//             target, because "can they grasp" is a different question at
//             the top of the range than at the bottom.
//
// There is no squeeze-calibration step: the patient holds still, watches the
// seated demonstrator do the movement (mirrored to their arm, going the way
// they will be asked to go), and then does it. Every movement is shown
// before it is asked for, including the second circle the other way round
// and the lift.
//
// Everything is measured RELATIVE TO THE BODY CENTRE — the shoulder midpoint,
// which is the origin of the tracker's shoulder-width frame — not to wherever
// the hand happened to rest. That is what makes two sessions comparable: a
// patient who rested the hand a little higher last time has not grown a
// different workspace. The games place their targets from the same envelope
// about the same point, so "inside the workspace" means the same thing on the
// profile screen and in play.
//
// The backdrop is the real world: the mirrored camera feed with the tracked
// skeleton drawn over the patient's own body, so the assessment reads as a
// mirror, not an abstract game.
//
// Measured: envelope[32] (max radial reach per direction from the body centre,
// SW units; bins the patient never reached stay at a conservative floor and
// `covered` records the measured fraction), armLenSW (the reach the workspace
// is a fraction OF — games rescale by it so "70% of range" means the same
// thing every session), areaSW2 / coverage / quadrants, volumeM3 + depthRangeM
// when depth exists, laps[2], lift {startDeg, peakDeg}, arcMinDeg/arcMaxDeg
// (arm elevation vs trunk), path jitter (target-size input), loop time (speed
// input), and per target {reached, frac, squeeze, release, graspOk}.
// Graceful-pause rule: tracking loss freezes every timer so a blip never
// costs the patient anything; a relocation (scooting/settling) re-baselines
// the frame instead of distorting geometry.

import { Coach } from "./coach.js";
import { audio } from "./audio.js";
import { CENTER, drawBody, drawHand, drawVideoMirror } from "./engine.js";
import { A11Y, hushVoice } from "./a11y.js";

const BINS = 32;                         // 11.25° wedges (was 16): a finer outline, chord error under 1%
const PAINT_SPREAD = 2;                  // neighbours each side credited with a reach's projection (±33.75°)
const TAU = Math.PI * 2;
const binOf = th => Math.floor((((th % TAU) + TAU) % TAU) / TAU * BINS);

const STILL_R = 0.15;                    // the hand may wander this far (SW, about 6 cm) and still count as resting
const REC_R = 0.3;                       // min radius (SW) for a reach to count — near the centre the angle is meaningless
const ENV_FLOOR = 0.45;                  // conservative floor for unmeasured/tiny bins (games need some space)
const ENV_CAP = 2.6;

// DEMO — the movement is shown before it is asked for. An older patient
// hearing "draw the biggest circle you can" has to translate words into a
// movement; watching a figure do it removes that step entirely. Nothing is
// measured here and the patient is told to just watch.
const DEMO_MS = 9000;                    // first demo: two unhurried circles, then the countdown
const DEMO_SHORT_MS = 6000;              // later demos (the other way round, the lift): one pass is enough
const DEMO_LOOP = 4200;                  // ms per demo circle — the pace to copy

// CIRCLES — one lap each way. A lap is a full turn of NET angle about the
// body centre, so wobbling back and forth on the way round cannot finish it
// early and cannot stop it finishing either. Nobody is timed out mid-lap
// unless a lap has gone on far longer than any lap takes.
const LAP_MAX_MS = 40000;                // per lap, the last word
const LAP_NUDGE_ANGLE = Math.PI;         // half a lap the wrong way round = one gentle reminder
const PACER_UNTIL = 0.45;                // the pacer firefly fades out by this fraction of a lap

// LIFT — arm straight up and back down: shoulder flexion, then extension.
const LIFT_MAX_MS = 20000;
const LIFT_BASE_MS = 700;                // the first moments give the starting angle
const LIFT_MIN_DEG = 15;                 // less than this is not a lift, keep waiting
const LIFT_RETURN = 0.35;                // back within this fraction of the rise = came back down

// TARGETS — five directions on the edge of the traced shape, asked for one
// at a time. Angles are y-up degrees for the assessed arm with 0° = straight
// OUT to that side; _extTheta mirrors them for a left arm, so both arms are
// asked for the same movements rather than the same screen spots. Spread
// evenly from down-and-out round to across the body: the lower workspace is
// the part most patients lose, so it is not left out.
// The patient is never told WHERE the target is ("down and out" is a
// direction to decode); a filled blue light appears and they reach for it.
// The keys are for the therapist's map and the log only.
const TARGETS = [
  { key: "down-out",  deg: -45, confirm: "Lovely." },
  { key: "out",       deg: 10,  confirm: "Beautiful." },
  { key: "up-out",    deg: 65,  confirm: "That's it." },
  { key: "up-across", deg: 125, confirm: "Wonderful." },
  { key: "across",    deg: 180, confirm: "Lovely. Well done." },
];
const TARGET_FRAC = 0.85;                // of the reach the circles measured in that direction: inside the shape
const TARGET_MIN_SW = 0.5;               // never so close that resting there passes
const TARGET_REACH_MS = 10000;           // to get there
const GRASP_MS = 7000;                   // then, to open, squeeze and open (Oct 2026: a step more when the hand arrives closed)
const GRASP_HOLD_MS = 300;               // a hand state counts once it has held this long (no flicker)
const TARGET_SETTLE = 1400;              // pause between targets
const TARGET_CAP = 0.34;                 // capture radius at the target (SW) — generous
const TARGET_CAP_FRAC = 0.42;            // ...as a fraction of the ask, TARGET_CAP the cap
const STAGE_MARGIN = 0.07;               // fraction of the short screen edge kept clear
const EXT_REACH = 0.95;                  // anatomy ceiling: 95% of the arm-length boundary

// A step that follows a spoken line waits for the line to finish (every
// _speak cancels the one before it, so a cue that lands early is a cue the
// patient never hears) — but never longer than this past its own settle time,
// in case the browser's speech engine wedges.
const SPEECH_WAIT_MAX = 8000;

// VIDEO-LED variant (opts.style === "video"): instead of the drawn figure and
// the two circles, the ROM assessment demonstration recording leads, PLAYED
// STRAIGHT THROUGH ONCE (Oct 2026, by request: no cuts, no watch-then-your-
// turn): the patient follows along with the demonstrator as it plays, the
// wrist is tracked the whole way, the workspace is painted from everything
// they do, and the five targets follow as usual. Offered beside the
// figure-led flow so the two can be compared.
// The recording (Oct 2026, by request: "Shoulder Moves", 62 s, 1920×1080,
// a produced piece with its own titles, move counter, countdown, captions,
// voice and a "Great job" ending; the demonstrator in a box with the
// instructions on the LEFT of the frame and the right side empty). It shows
// the LEFT arm and its text is burnt in, so it is never mirrored: a
// one recording per arm (Oct 2026): the same piece, same layout and the
// same move times, demonstrated with the left or the right arm, so the
// assessed arm always watches its own. A missing side falls back to the
// other one's recording (VIDEO_ARM says which), never mirrored.
const VIDEO_SRCS = {
  left: "assets/music/ROM_Shoulder_Moves_LEFT_arm.mp4",
  right: "assets/music/ROM_Shoulder_Moves_RIGHT_arm.mp4",
};
const VIDEO_ARM = "left";                // the fallback recording's arm
const VIDEO_MIRROR = false;              // burnt-in titles and captions: never mirrored
// The posture coach speaks its cues (let your shoulder relax, sit tall)
// during the measurement too (Oct 2026, by request); false keeps it quiet
// here while it still records the compensation events the profile stores.
const ASSESS_COACH_CUES = true;
const VIDEO_CAPTIONED = true;            // it carries its own captions, so the app draws none
// THE ZOOM (Oct 2026, by request): with the camera a few metres back the
// person is a small figure in a big picture and the targets are tiny. Every
// figure-flow phase (settle, countdown, circles, lift, targets) is drawn
// through one zoom about the body centre, sized to the arm's length plus a
// margin, so the person, their shape, the targets and the cursor fill the
// stage whatever the distance. Only in, never out (k >= 1), capped at
// ZOOM_MAX, smoothed so a re-snap of the frame is a glide, not a jump.
const ZOOM_PAD_SW = 0.5, ZOOM_MAX = 2.5, ZOOM_EASE = 0.08;
const VIDEO_CROP_HALF_W = 2.3;           // patient panel: half-width about the body centre, SW
const VIDEO_CROP_UP = 2.0, VIDEO_CROP_DOWN = 2.2;   // ...and above / below the shoulder line, SW
// The picture is drawn in this window (fractions of the frame width, full
// height): the left part, where the title, the demonstrator, the captions
// and the move dots are; the empty right part is left out. VIDEO_END is
// where it is over (after its own "Great job").
const VIDEO_CROP = { x0: 0, x1: 0.6 };
const VIDEO_END = 62.3;
// The recording carries her own voice, so it plays with sound and the app
// keeps quiet. Set false for a silent recording: the app then speaks each
// move's line as it begins.
const VIDEO_HAS_VOICE = true;
// The moves in the recording, for the per-move measurements and the
// instruction box: t0 / t1 are seconds into it (its own title changes).
// Each move is MEASURED from its t0 until the next move begins (the patient
// follows a beat behind her), so `startDeg` / `peakDeg` / `peakSW` /
// `returned` come out per move; `lift: true` marks the ones the stored
// lift may come from.
const VIDEO_PARTS = [
  { key: "circle", t0: 3.5, t1: 11.5, name: "Big arm circles", say: "Make a full circle with your arm, the biggest circle you can." },
  { key: "circleBack", t0: 11.5, t1: 20.6, name: "Circle back", say: "Now the other way round. Another full circle, as far as you can go." },
  { key: "sky", t0: 20.6, t1: 29.3, name: "Reach for the sky", say: "Bring your arm as high up above you as you can.", lift: true },
  { key: "cross", t0: 29.3, t1: 41.3, name: "Cross and open", say: "Bring your arm across to your shoulder, then out as far as it can go, and back to your shoulder." },
  { key: "sweep", t0: 41.3, t1: 49.8, name: "Sweep across", say: "Raise your arm across your face, like so." },
  { key: "rocket", t0: 49.8, t1: 58.4, name: "Diagonal rocket", say: "Bring your arm from the opposite leg as far up diagonally as you can go.", lift: true },
];
const VIDEO_DONE_AT = 58.4;             // its "Great job" screen: the last move is over
const VIDEO_LEAD = "Follow along with your arm as she goes.";   // before the first move
const VIDEO_DONE = "Well done. All six moves done. Five targets next.";
const VIDEO_BACK = 0.18;                // a move "returned" if the wrist ends within this of where it started (SW)
const VIDEO_BASE_MS = 500;              // the first half second of a move gives the starting elevation
const VIDEO_SLACK = 4000;               // a stalled recording still ends after its length + this
// WAIT FOR THE MOVE TO FINISH (Oct 2026, by request: the recording ran on
// while the patient was still mid-move). At each move boundary the recording
// pauses until the wrist is back within VIDEO_WAIT_BACK of where the move
// started and has stayed there VIDEO_WAIT_SETTLE_MS, or VIDEO_WAIT_MAX_MS
// has passed; the wall-clock budget slides by the wait.
const VIDEO_WAIT_BACK = 0.3, VIDEO_WAIT_SETTLE_MS = 500, VIDEO_WAIT_MAX_MS = 8000;

// greedy word wrap for canvas text, in the font set on ctx
function wrapLines(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = []; let line = "";
  for (const w of words) {
    const tryLine = line ? line + " " + w : w;
    if (ctx.measureText(tryLine).width <= maxW || !line) line = tryLine;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

export class Assessment {
  constructor(tracker, canvas, side, coachSens, opts = {}) {
    this.t = tracker;
    this.canvas = canvas;
    this.side = side;                  // the arm chosen at setup — never asked here
    this.opts = opts;
    this.style = opts.style === "video" ? "video" : "figure";
    this.coachSens = coachSens;
    this.coach = new Coach(tracker, side, coachSens, { quiet: !ASSESS_COACH_CUES });
    this.active = false;
  }

  start(onDone) {
    this.onDone = onDone;
    this.active = true;
    this.state = "settle";
    this.stateT = performance.now();
    // the recording is fetched NOW, while the patient settles, not when its
    // phase begins (Oct 2026: a 10 MB file opened at that moment left the
    // demonstrator box on "Loading" for seconds)
    if (this.style === "video") this._makeVideo();
    this.still = null; this.stillAt = null;
    this.prev = null;
    this.badSince = null;
    this.noHandSince = null;
    this.noHandWarned = false;

    this.envelope = new Array(BINS).fill(0);   // 0 = not yet measured
    // the same reaches with NO floor applied. envelope gets floored at
    // ENV_FLOOR so games always have somewhere to put a target; area and
    // volume must not inherit that — a direction the patient never reached
    // has to count as zero workspace, or every limited patient would be
    // credited with the floor.
    this.envRaw = new Array(BINS).fill(0);
    // the ACTUAL farthest wrist position per wedge (SW from the body centre),
    // which is what the shape is drawn through — so the hand at its extreme
    // is a corner of the polygon, not an approximation of one
    this.envPts = new Array(BINS).fill(null);
    this.visited = new Array(BINS).fill(0);
    // forward-reach extent per bin, metres (ZED depth only): the third
    // dimension of the workspace, kept per sector because reaching across the
    // body and reaching overhead do not travel the same distance forward
    this.zLo = new Array(BINS).fill(null);
    this.zHi = new Array(BINS).fill(null);
    this.covered = 0;
    this.swept = 0;                            // total angle traced (wrap-safe)
    this.lapAngle = 0;                         // NET angle this lap (signed)
    this.prevTh = null;
    this.lastBin = null;
    this.angMin = 180; this.angMax = 0;
    this.jitterSum = 0; this.jitterN = 0;
    this.smoothR = null;

    // Elbow reachable workspace: the same shape, traced by the ELBOW about the
    // shoulder. Reported beside the wrist workspace because a patient can
    // paint a wide envelope with elbow extension alone, and the elbow's own
    // trajectory is the part of it the shoulder actually produced.
    this.envElbow = new Array(BINS).fill(0);
    this.upperArm = null;

    this.laps = [];                            // {n, dir, angleDeg, seconds, complete}
    this.lap = null;                           // the lap running now
    this.lift = null;
    this.liftResult = null;

    this.targets = [];                         // frozen asks, built after the circles
    this.tIdx = 0;
    this.extremes = [];                        // one answer per target (kept under the old name: the profile map reads it)
    this.ext = null;                           // the target being reached for right now

    this.armLen = null;                        // measured arm length (SW): the REAL reach radius
    this.shoulderRel = null;

    this._promptSettle();
    this._speak(`${this.side === "left" ? "Left" : "Right"} hand. Hold it still, comfortably in front of you.`);
    this._loop();
  }

  stop() {
    this.active = false;
    this._prompt("");
    if (this.vid) { try { this.vid.pause(); this.vid.remove(); } catch {} this.vid = null; }
    hushVoice();
  }

  _promptSettle() {
    this._prompt(`Hold your ${this.side} hand still`, "Rest it comfortably in front of you");
  }

  _prompt(main, sub = "") {
    const el = document.getElementById("prompt");
    const tag = this.opts.label ? `<small>${this.opts.label}</small>` : "";
    el.innerHTML = main ? main + (sub ? `<small>${sub}</small>` : "") + tag : "";
  }

  _speak(text) {
    try {
      hushVoice();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;   // unhurried, for an older audience
      speechSynthesis.speak(u);
    } catch { /* optional */ }
  }

  _speaking() { try { return !!speechSynthesis.speaking; } catch { return false; } }

  // settle time is up AND the current spoken line has finished (capped)
  _settled(ms, now) {
    const t = now - this.stateT;
    return t >= ms && (!this._speaking() || t > ms + SPEECH_WAIT_MAX);
  }

  // a pause must cost the patient nothing: slide every active clock forward
  _shiftTimers(gap) {
    this.stateT += gap;
    if (this.still != null) this.still += gap;
    if (this.lap) this.lap.start += gap;
    if (this.lift) {
      this.lift.start += gap;
      if (this.lift.peakAt != null) this.lift.peakAt += gap;
    }
    if (this.ext) {
      this.ext.start += gap;
      if (this.ext.since != null) this.ext.since += gap;
      if (this.ext.graspAt != null) this.ext.graspAt += gap;
    }
    if (this.videoStart != null && this.state === "video") this.videoStart += gap;
    if (this.vm) this.vm.start += gap;
    if (this.vWait) { this.vWait.since += gap; if (this.vWait.settled != null) this.vWait.settled += gap; }
    this.prev = null;   // don't let the gap read as a huge hand speed
  }

  _loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const ctx = this.canvas.getContext("2d");
    const c = this.canvas;

    if (this.state === "video") {
      this._drawVideoStage(ctx, c, now);
    } else {
      // everything on the stage goes through the zoom about the body centre
      // (ZOOM_*): the picture and the skeleton here, the shape, targets and
      // cursor in _draw, which applies the same transform
      ctx.fillStyle = "#161636"; ctx.fillRect(0, 0, c.width, c.height);
      const Z = this.state === "demo" ? { k: 1, tx: 0, ty: 0 } : this._zoomOf(c);
      ctx.save(); ctx.translate(Z.tx, Z.ty); ctx.scale(Z.k, Z.k);
      if (!drawVideoMirror(ctx, c, this.t)) {
        const g = ctx.createRadialGradient(c.width / 2, c.height * 0.42, 60, c.width / 2, c.height * 0.42, c.height);
        g.addColorStop(0, "#3a3168"); g.addColorStop(0.55, "#20204a"); g.addColorStop(1, "#161636");
        ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      }
      // hands: false — the skeleton's own glowing palm discs would put a
      // second circle on the hand; the one cursor here is the WRIST (Sep 2026)
      drawBody(ctx, c, this.t, { framed: !this.coach.dimming, hands: false });
      ctx.restore();
    }

    // sustained-loss pause only — brief blips never interrupt, and every
    // pause freezes the clocks (graceful-pause rule)
    if (!this.t.trackingOk) this.badSince ??= now;
    else if (this.badSince) { this._shiftTimers(now - this.badSince); this.badSince = null; }
    const paused = this.badSince && now - this.badSince > 1200;
    document.getElementById("paused").classList.toggle("hidden", !paused);
    if (this.vid && this.state === "video") this._videoTick(now, !!paused);   // preloaded earlier: never run before its phase
    if (!this.t.trackingOk) return;

    // scooting/settling in the chair: re-baseline instead of letting geometry drift
    if (this.t.relocated()) this.t.setBaseline();

    // The WRIST is the measured point, on every camera path. The palm centre
    // is for pick-up interactions in the games; on the ZED path it is built
    // from BODY_38's stand-in hand points (a fingertip and a pinky base, each
    // falling back to the wrist when the SDK is unsure), which lag and jump,
    // so a palm-scored circle came out short and the cursor sat off the hand.
    const hand = this.t.handRel(this.side);
    if (!hand) {
      if (this.state === "settle") {
        this.noHandSince ??= now;
        if (now - this.noHandSince > 2500 && !this.noHandWarned) {
          this.noHandWarned = true;
          this._prompt(`Rest your ${this.side} hand in front of you`, `We can't see your ${this.side} hand yet`);
          this._speak(`We can't see your ${this.side} hand yet. Bring it up in front of you.`);
        }
      }
      return;
    }
    this.noHandSince = null;
    if (this.noHandWarned) { this.noHandWarned = false; if (this.state === "settle") this._promptSettle(); }

    let speed = 0;
    if (this.prev) {
      const dt = (now - this.prev.t) / 1000;
      if (dt > 0) speed = Math.hypot(hand.x - this.prev.x, hand.y - this.prev.y) / dt;
    }
    this.prev = { x: hand.x, y: hand.y, t: now };

    this.coach.update(now);
    this._measureArm();
    this._update(now, hand, speed);
    this._draw(ctx, c, hand, now);
  }

  _update(now, hand, speed) {
    // reach counts whenever it happens: the demos, countdowns and the pauses
    // between targets paint the shape too, so it never lags behind the hand
    if (this.state !== "settle" && !["circle", "lift", "target", "video"].includes(this.state)) {
      this._recordSample(now, hand, false);
    }
    switch (this.state) {
      case "settle": {
        // "Still" is the hand staying inside a small circle for 1.5 s, not a
        // low instantaneous speed: per-frame speed rides on landmark noise
        // and on the camera's frame cadence (the ZED bridge delivers at its
        // own rate, so a jump arrives on one 16 ms frame and reads as fast),
        // and it kept resetting the clock for a hand that was plainly resting.
        if (!this.stillAt || Math.hypot(hand.x - this.stillAt.x, hand.y - this.stillAt.y) > STILL_R) {
          this.stillAt = { x: hand.x, y: hand.y };
          this.still = now;
        }
        if (now - this.still > 1500) {
          {
            this.t.setBaseline();
            // the BODY CENTRE is zero: the shoulder midpoint, which is the
            // origin of the shoulder-width frame. Not the resting hand — a
            // hand that rested somewhere else last time must not read as a
            // different workspace this time.
            CENTER.x = 0; CENTER.y = 0;
            // straight to the first demonstration: no squeeze calibration
            // step (removed by request) — the tracker's own self-calibrating
            // grasp thresholds serve the targets
            if (this.style === "video") { this._startVideo(now); break; }
            this._startDemo(now, { kind: "circle", dir: 1, ms: DEMO_MS, then: "countdown", lap: 1 },
              "Watch first", "One big circle, as big as you can",
              "Lovely. Now watch first. One big circle, as big as you can, all the way round.");
          }
        }
        break;
      }
      // DEMO: show the movement, then ask for it. Nothing is recorded here.
      case "demo": {
        const d = this.demo;
        if (now - this.stateT > d.ms) {
          if (d.then === "lift") { this._startLift(now); break; }
          this.nextLap = d.lap;
          this.state = "countdown"; this.stateT = now;
          this.count = null;
          this._prompt("Your turn", "Starting in 3… 2… 1…");
          this._speak("Your turn now.");
        }
        break;
      }
      case "countdown": {
        const left = 3 - Math.floor((now - this.stateT) / 1000);
        if (left !== this.count && left > 0) {
          this.count = left;
          audio.serveTick(false);
        }
        if (now - this.stateT >= 3000) {
          audio.serveTick(true);
          this._startLap(now, this.nextLap || 1);
        }
        break;
      }
      // VIDEO: the recording plays straight through and the patient follows
      // along; every sample paints the workspace. Ends when it does.
      case "video": {
        this._recordSample(now, hand, true);
        this._videoStep(now, hand);
        break;
      }
      // CIRCLES: one lap each way, painting the workspace. No targets on the
      // way round on purpose — chasing one mid-circle distorts the shape.
      case "circle": {
        this._recordSample(now, hand, true);
        const L = this.lap;
        // one gentle reminder if the second lap sets off the same way as the
        // first, never a running correction
        if (L.n === 2 && !L.nudged && L.want && Math.sign(this.lapAngle) === -L.want
            && Math.abs(this.lapAngle) > LAP_NUDGE_ANGLE) {
          L.nudged = true;
          this._prompt("The other way round", "Back the way you came, all the way round");
          this._speak("The other way round this time.");
        }
        const full = Math.abs(this.lapAngle) >= TAU;
        const late = now - L.start > LAP_MAX_MS;
        if (full || late) {
          this.laps.push({
            n: L.n,
            dir: this.lapAngle >= 0 ? "anticlockwise" : "clockwise",
            angleDeg: Math.round(Math.abs(this.lapAngle) / Math.PI * 180),
            seconds: Math.round((now - L.start) / 100) / 10,
            complete: full,
          });
          if (L.n === 1) {
            // shown before it is asked for, the other way round
            const dir1 = Math.sign(this.lapAngle || 1);
            this.lap1Dir = dir1;
            audio.note(5);
            this._startDemo(now, { kind: "circle", dir: -dir1, ms: DEMO_SHORT_MS, then: "countdown", lap: 2 },
              "Watch: the other way round", "The same big circle, back the way you came",
              "Lovely. Now watch. The same big circle, the other way round.");
          } else {
            audio.note(5);
            this._startDemo(now, { kind: "lift", dir: 1, ms: DEMO_SHORT_MS, then: "lift" },
              "Watch: lift your arm straight up", "As high as you can, then bring it back down",
              "Beautiful. Now watch. Lift your arm straight up, as high as you can, then bring it back down.");
          }
        }
        break;
      }
      // LIFT: straight up as high as it goes, then back down.
      case "lift": {
        this._recordSample(now, hand, false);
        const F = this.lift;
        const ang = this.t.armAngle(this.side);
        if (ang != null) {
          if (now - F.start < LIFT_BASE_MS) { F.baseSum += ang; F.baseN++; }
          else {
            F.base ??= F.baseN ? F.baseSum / F.baseN : ang;
            if (ang > F.peak) { F.peak = ang; F.peakAt = now; }
            const rise = F.peak - F.base;
            const back = ang <= F.base + rise * LIFT_RETURN;
            if (rise >= LIFT_MIN_DEG && F.peakAt != null && now - F.peakAt > 800 && back) {
              this._finishLift(now, true);
              break;
            }
            if (rise >= LIFT_MIN_DEG && !F.upSaid && now - F.peakAt > 1500) {
              // they have stopped rising: ask for the way down, once
              F.upSaid = true;
              this._prompt("And back down", "Slowly, all the way");
              this._speak("And now bring it back down.");
            }
          }
        }
        if (now - F.start > LIFT_MAX_MS) this._finishLift(now, false);
        break;
      }
      case "target-move": {   // brief settle, then present the next target
        if (this._settled(TARGET_SETTLE, now)) {
          if (this.tIdx >= this.targets.length) { audio.fanfare(); this._finish(); break; }
          const tg = this.targets[this.tIdx];
          this.ext = { ...tg, best: 0, bestProj: 0, start: now, since: null, graspAt: null,
                       samples: [], squeeze: false, release: false, done: false };
          this.state = "target"; this.stateT = now;
          this._prompt("Reach the blue target", "Get there, then squeeze and open your hand");
          this._speak("Reach the blue target.");
        }
        break;
      }
      // TARGET: get there within TARGET_REACH_MS, then squeeze and open within
      // GRASP_MS. Progress is scored on the PROJECTION onto the direction, so
      // drifting off-axis can never look like a longer reach.
      case "target": {
        this._recordSample(now, hand, false);
        const e = this.ext;
        const proj = (hand.x - CENTER.x) * Math.cos(e.th) + (hand.y - CENTER.y) * Math.sin(e.th);
        if (proj > e.bestProj) e.bestProj = proj;
        e.best = e.r > 0 ? e.bestProj / e.r : 0;

        const tx = CENTER.x + Math.cos(e.th) * e.r, ty = CENTER.y + Math.sin(e.th) * e.r;
        const d = Math.hypot(hand.x - tx, hand.y - ty);

        if (e.since == null) {
          if (d < e.cap) {
            // arrived: the reach is banked, the grasp window opens. A hand
            // that arrives already closed — resting flexion is the normal
            // case here — is noted, and has to open before a close counts.
            e.since = now; e.graspAt = now;
            e.preClosed = e.preClosedAtArrival = this.t.handClosed(this.side);
            audio.note(5);
            // THE GRASP CHECK (Oct 2026, by request): one short ask at a
            // time, each spoken once, each counted only when the hand has
            // held the state for GRASP_HOLD_MS. A hand that arrives open is
            // asked to squeeze, then open. A hand that arrives closed is
            // asked to open first, then squeeze, then open, so the check
            // always sees both states change.
            e.gstep = e.preClosed ? "open-first" : "close";
            e.gState = null; e.gAt = now;
            this._prompt("Hold it there", e.preClosed ? "Open your hand" : "Squeeze your hand");
            this._speak(e.preClosed ? "Good. Now open your hand." : "Good. Now squeeze your hand.");
          } else if (now - e.start > TARGET_REACH_MS) {
            audio.note(2);
            this._speak(e.best > 0.6 ? "Close! That's a good stretch." : "That's fine. Let's try the next one.");
            this._recordTarget(now, false);
          }
          break;
        }

        // the grasp window: open (if it arrived closed), squeeze, open; one
        // ask at a time, a state counted once it has held GRASP_HOLD_MS
        e.samples.push(d);
        const closedNow = this.t.handClosed(this.side);
        if (closedNow !== e.gState) { e.gState = closedNow; e.gAt = now; }
        const held = now - e.gAt >= GRASP_HOLD_MS;
        if (held && e.gstep === "open-first" && !closedNow) {
          e.preClosed = false; e.gstep = "close"; audio.note(3);
          this._prompt("Hold it there", "Now squeeze your hand");
          this._speak("Now squeeze.");
        } else if (held && e.gstep === "close" && closedNow) {
          e.squeeze = true; e.gstep = "open"; audio.note(4);
          this._prompt("Hold it there", "Now open your hand");
          this._speak("And open.");
        } else if (held && e.gstep === "open" && !closedNow) {
          e.release = true; e.gstep = "done"; audio.note(6);
        }
        const cycled = e.squeeze && e.release;
        if (cycled || now - e.graspAt > GRASP_MS) {
          e.done = true;
          audio.note(5);
          this._speak(e.confirm);
          this._recordTarget(now, true);
        }
        break;
      }
    }
  }

  _startVideo(now) {
    this.state = "video"; this.stateT = now;
    this.videoStart = now;
    this.videoParts = [];                 // one record per move
    this.vIdx = -1; this.vm = null;       // the move being measured (none before the first)
    this.caption = VIDEO_LEAD;
    this._prompt("");                     // the instruction box on the stage carries the words
    hushVoice();
    const v = this.vid || this._makeVideo();   // preloaded at start(), normally
    v.muted = !VIDEO_HAS_VOICE;           // a silent track stays muted, so autoplay is never refused for it
    this.vidSound = VIDEO_HAS_VOICE;      // false once the browser refuses sound (then the app speaks instead)
    this._seekPlay(0);
    if (!this.vidSound) this._speak(VIDEO_LEAD);
  }

  // the hidden <video> for this arm's recording, created once and kept in
  // the document, off screen, rather than detached: a detached element's
  // decoding can be throttled, and a stalled frame reads as a stalled
  // demonstrator. preload=auto so it is buffered before it is needed.
  _makeVideo() {
    this.vidSrc = VIDEO_SRCS[this.side] || VIDEO_SRCS[VIDEO_ARM];
    const v = document.createElement("video");
    v.src = this.vidSrc; v.playsInline = true; v.preload = "auto";
    v.muted = !VIDEO_HAS_VOICE;
    v.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    v.setAttribute("aria-hidden", "true");
    document.body.appendChild(v);
    v.addEventListener("error", () => { this.vidFailedAt ??= performance.now(); });
    try { v.load(); } catch {}
    this.vid = v;
    return v;
  }

  _seekPlay(t) {
    const v = this.vid;
    if (!v) return;
    try { v.currentTime = t; } catch {}
    v.muted = !this.vidSound;             // her voice is the instruction
    v.play().catch(() => {
      // autoplay with sound refused: muted is better than nothing at all,
      // and the app speaks each move's line instead
      v.muted = true; this.vidSound = false;
      v.play().catch(() => { this.vidFailedAt ??= performance.now(); });
    });
  }

  // the recording follows the tracking: paused while it is lost, running
  // otherwise, and never past VIDEO_END
  _videoTick(now, paused) {
    const v = this.vid;
    if (!v) return;
    if (paused) { if (!v.paused) v.pause(); return; }
    if (v.currentTime >= VIDEO_END) { if (!v.paused) v.pause(); return; }
    if (v.paused && !v.ended && !v.error && this.t.trackingOk && !this.vWait) v.play().catch(() => {});
  }

  // which move the recording is on at t seconds into it (-1 before the first)
  _videoMoveAt(t) {
    if (t >= VIDEO_DONE_AT) return VIDEO_PARTS.length;   // its ending: no move
    let i = -1;
    for (let k = 0; k < VIDEO_PARTS.length; k++) if (t >= VIDEO_PARTS[k].t0) i = k;
    return i;
  }

  _videoStep(now, hand) {
    const v = this.vid;
    const failed = !v || !!v.error || (this.vidFailedAt && now - this.vidFailedAt > 4000);
    const t = v && v.duration > 0 ? v.currentTime : 0;
    // a new move begins: first wait for the one before to be finished (the
    // wrist back near its start), the recording held meanwhile; then close
    // it and open this one
    const idx = this._videoMoveAt(t);
    if (idx !== this.vIdx && this.vm && !failed) {
      const M = this.vm;
      const d = Math.hypot(hand.x - M.startPos.x, hand.y - M.startPos.y);
      const W = this.vWait ??= { since: now, settled: null };
      if (!v.paused) v.pause();
      if (d <= VIDEO_WAIT_BACK) W.settled ??= now; else W.settled = null;
      const done = (W.settled != null && now - W.settled >= VIDEO_WAIT_SETTLE_MS) || now - W.since >= VIDEO_WAIT_MAX_MS;
      if (!done) {
        M.peakSW = Math.max(M.peakSW, d);
        return;
      }
      this.videoStart += now - W.since;        // the wait costs the recording's budget nothing
      this.vWait = null;
      if (this.t.trackingOk) v.play().catch(() => {});
    }
    if (idx !== this.vIdx) {
      if (this.vm) this._finishMove(now, hand);
      this.vIdx = idx;
      const p = VIDEO_PARTS[idx];
      if (p) {
        this.vm = { start: now, part: p, startPos: { x: hand.x, y: hand.y }, baseSum: 0, baseN: 0,
                    startDeg: null, peakSW: 0, peakDeg: -1 };
        this.caption = p.say;
        if (!this.vidSound) this._speak(p.say);
      } else if (idx >= VIDEO_PARTS.length) {
        this.caption = VIDEO_DONE;
        if (!this.vidSound) this._speak(VIDEO_DONE);
      }
    }
    const M = this.vm;
    if (M) {
      const ang = this.t.armAngle(this.side);
      const el = now - M.start;
      if (el < VIDEO_BASE_MS) {
        // the start is where the hand is as the move begins: settled over the first half second
        M.startPos.x += (hand.x - M.startPos.x) * 0.3;
        M.startPos.y += (hand.y - M.startPos.y) * 0.3;
        if (ang != null) { M.baseSum += ang; M.baseN++; }
      } else if (M.startDeg == null) {
        M.startDeg = M.baseN ? M.baseSum / M.baseN : ang;
      }
      const d = Math.hypot(hand.x - M.startPos.x, hand.y - M.startPos.y);
      M.peakSW = Math.max(M.peakSW, d);
      if (ang != null && ang > M.peakDeg) M.peakDeg = ang;
      M.last = d;
    }
    // over: the recording has reached its end (or stalled well past it, or failed)
    const over = (v && v.duration > 0 && (v.ended || t >= VIDEO_END - 0.05))
      || now - this.videoStart > VIDEO_END * 1000 + VIDEO_SLACK;
    if (over || failed) {
      if (this.vm) this._finishMove(now, hand);
      this._finishVideo(now);
    }
  }

  _finishMove(now, hand) {
    const M = this.vm;
    if (!M) return;
    const d = Math.hypot(hand.x - M.startPos.x, hand.y - M.startPos.y);
    this.videoParts.push({
      key: M.part.key, name: M.part.name,
      startDeg: M.startDeg == null ? null : Math.round(M.startDeg),
      peakDeg: M.peakDeg >= 0 ? Math.round(M.peakDeg) : null,
      rangeDeg: M.startDeg != null && M.peakDeg >= 0 ? Math.round(Math.max(0, M.peakDeg - M.startDeg)) : null,
      peakSW: Math.round(M.peakSW * 100) / 100,     // farthest the wrist went from where it started
      seconds: Math.round((now - M.start) / 100) / 10,
      returned: d <= VIDEO_BACK,                    // back where it started as the next move begins
    });
    this.vm = null;
  }

  _finishVideo(now) {
    const v = this.vid;
    const parts = this.videoParts || [];
    this.videoResult = {
      src: this.vidSrc,
      seconds: Math.round((now - this.videoStart) / 1000),
      completed: parts.length === VIDEO_PARTS.length,
      mirrored: VIDEO_MIRROR && !VIDEO_SRCS[this.side],
      arm: VIDEO_SRCS[this.side] ? this.side : VIDEO_ARM,
      parts,
    };
    if (v) { try { v.pause(); } catch {} v.removeAttribute("src"); v.load?.(); v.remove(); }
    this.vid = null; this.vm = null; this.caption = null;
    audio.note(5);
    // the lift, as the games read it (Pong's lane, the compare screen): the
    // best of the moves marked `lift` (reach for the sky, the diagonal rocket)
    const lifts = parts.filter(p => VIDEO_PARTS.find(q => q.key === p.key)?.lift && p.peakDeg != null);
    if (lifts.length) {
      const best = lifts.reduce((a, b) => (b.peakDeg > a.peakDeg ? b : a));
      this.liftResult = { startDeg: best.startDeg, peakDeg: best.peakDeg, rangeDeg: best.rangeDeg,
                          returned: best.returned, seconds: best.seconds, from: best.key };
    }
    // loop time from the angle actually swept while the recording ran
    const loops = this.swept / TAU;
    this.videoLoopSeconds = loops > 0.25 ? Math.min(20, ((now - this.videoStart) / 1000) / loops) : null;
    this._finishCircles(now);
  }

  _startDemo(now, demo, title, sub, say) {
    this.lap = null;
    this.demo = demo;
    this.state = "demo"; this.stateT = now;
    this._prompt(title, sub);
    this._speak(say);
  }

  _startLap(now, n) {
    const prevDir = n === 2 ? (this.lap1Dir || 1) : 0;
    this.lapAngle = 0; this.prevTh = null;
    this.visited.fill(0); this.lastBin = null;
    // lap 2 wants the opposite sense to lap 1; lap 1 accepts either
    this.lap = { n, start: now, want: n === 2 ? -prevDir : 0, nudged: false };
    this.state = "circle"; this.stateT = now;
    if (n === 1) {
      this._prompt("Make a big circle", "As big as you can, all the way round");
      this._speak("Now make a big circle, as big as you can, all the way round. "
                // said once, plainly, because it is what makes the shape a
                // measurement of the ARM: leaning and twisting reach further
                // and score better while training the compensation we are
                // here to reduce. The coach watches for it; this asks first.
                + "Keep your back against the chair, and try not to lean or twist.");
    } else {
      this._prompt("Your turn: the other way round", "Another big circle, back the way you came");
      this._speak("Your turn. The other way round.");
    }
  }

  _startLift(now) {
    this.lap = null;
    this.lift = { start: now, baseSum: 0, baseN: 0, base: null, peak: -1, peakAt: null, upSaid: false };
    this.state = "lift"; this.stateT = now;
    this._prompt("Your turn: lift your arm straight up", "As high as you can, then bring it back down");
    this._speak("Your turn. Lift your arm straight up, as high as you can. Then bring it back down.");
  }

  _finishLift(now, returned) {
    const F = this.lift;
    const base = F.base ?? (F.baseN ? F.baseSum / F.baseN : null);
    this.liftResult = {
      startDeg: base == null ? null : Math.round(base),
      peakDeg: F.peak >= 0 ? Math.round(F.peak) : null,
      rangeDeg: base != null && F.peak >= 0 ? Math.round(Math.max(0, F.peak - base)) : null,
      returned,
      seconds: Math.round((now - F.start) / 100) / 10,
    };
    this.lift = null;
    this._finishCircles(now);
  }

  // Real arm space: the tracker keeps arm length (SW) as a bend-invariant
  // decaying session max, so a resting bent arm or one pointed at the camera
  // never shrinks it. Here we only hold the largest value the whole
  // assessment saw — that is the radius the workspace is a fraction of.
  _measureArm() {
    const len = this.t.armLenSW(this.side);
    if (len != null) this.armLen = Math.max(this.armLen ?? 0, len);
    const sh = this.t.shoulder(this.side);
    const f = this.t.frame;
    if (sh && f) this.shoulderRel = { x: (sh.x - f.x) / f.sw, y: -(sh.y - f.y) / f.sw };
  }

  // 0° = straight OUT to the assessed side; mirrored for a left arm so both
  // arms are asked for the same five movements, not the same five screen spots
  _extTheta(deg) {
    const d = this.side === "right" ? deg : 180 - deg;
    return d * Math.PI / 180;
  }

  // One target's answer. `reached` means the hand got there in time; `frac`
  // is how far along the direction they got either way, so a target that
  // was not reached is still a number and not just a blank.
  _recordTarget(now, reached) {
    const e = this.ext;
    const reach = Math.max(0, e.bestProj || 0);
    const frac = Math.max(0, Math.min(1.2, e.r > 0 ? reach / e.r : 0));
    const r2 = v => Math.round(v * 100) / 100;
    const mean = e.samples.length ? e.samples.reduce((a, b) => a + b, 0) / e.samples.length : null;
    this.extremes.push({
      key: e.key, deg: e.deg,
      reached,
      frac: r2(frac),                                    // of the target as asked
      reachSW: Math.round(reach * 1000) / 1000,
      // the ask, and the reach as a fraction of the ARM rather than of the
      // ask: a target set inside the shape must never be readable as the
      // arm's full reach, here or on the therapist's map
      askSW: Math.round(e.r * 1000) / 1000,
      anatSW: Math.round(e.anat * 1000) / 1000,
      askFrac: e.anat > 0 ? r2(e.r / e.anat) : null,
      fracAnat: e.anat > 0 ? r2(Math.min(1.2, reach / e.anat)) : null,
      timeMs: e.since != null ? Math.round(e.since - e.start) : null,   // how long getting there took
      holdMs: e.since != null ? Math.round(now - e.since) : 0,
      stability: mean == null ? 0 : r2(Math.max(0, Math.min(1, 1 - mean / e.cap))),
      squeeze: !!e.squeeze,       // a hand-close was seen at this target
      release: !!e.release,       // and they opened again
      preClosed: !!e.preClosedAtArrival,
      graspOk: !!(e.squeeze && e.release),
    });
    this.ext = null;
    this.tIdx++;
    this.state = "target-move"; this.stateT = now;
  }

  // Every measured sample paints the envelope — circles, lift and targets.
  // Jitter (a target-size input) is only scored while circling: a directed
  // stretch changes radius fast on purpose, and that must not read as tremor.
  _recordSample(now, hand, tracing) {
    const ang = this.t.armAngle(this.side);
    if (ang != null) { this.angMin = Math.min(this.angMin, ang); this.angMax = Math.max(this.angMax, ang); }

    const dxc = hand.x - CENTER.x, dyc = hand.y - CENTER.y;
    const r = Math.hypot(dxc, dyc);
    if (r <= REC_R) { this.prevTh = null; return; }   // near the centre the angle is meaningless
    const th = Math.atan2(dyc, dxc);
    const bin = binOf(th);
    const rr = Math.min(r, ENV_CAP);
    // The shape is a polygon through the 16 wedge CENTRES, so a reach that
    // lands near a wedge edge (straight up is exactly one) used to lift only
    // its own corner while the neighbour kept its old value, and the edge
    // between them cut across well inside the hand. Each sample therefore
    // also credits its neighbours with its projection onto their direction
    // (r·cos of the angle between), which is exactly how far along that
    // direction the hand demonstrably got. The polygon then passes through
    // every extreme the wrist reached instead of chording inside them.
    const k = rr / r;                                     // 1 unless capped
    this._paint(this.envelope, th, rr, this.envPts, dxc * k, dyc * k);
    this._paint(this.envRaw, th, rr);
    // the third dimension, when the camera has one: how far forward and back
    // the hand travelled in THIS sector. A webcam has no depth, so these stay
    // null and the profile reports area without volume rather than guessing.
    const h3 = this.t.hand3(this.side);
    if (h3 && Number.isFinite(h3.z)) {
      this.zLo[bin] = this.zLo[bin] == null ? h3.z : Math.min(this.zLo[bin], h3.z);
      this.zHi[bin] = this.zHi[bin] == null ? h3.z : Math.max(this.zHi[bin], h3.z);
    }
    if (bin !== this.lastBin) {
      if (this.lastBin !== null) this.visited[bin]++;
      this.lastBin = bin;
    }
    // swept angle (wrap-safe): total for loop counting, NET for lap counting
    if (this.prevTh != null) {
      let d = th - this.prevTh;
      if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
      this.swept += Math.abs(d);
      if (tracing) this.lapAngle += d;
    }
    this.prevTh = th;
    if (tracing) this._recordElbow();
    if (tracing) {
      // jitter: radial noise vs a short smoothed radius
      if (this.smoothR == null) this.smoothR = r;
      this.smoothR += (r - this.smoothR) * 0.15;
      this.jitterSum += Math.abs(r - this.smoothR); this.jitterN++;
    }
  }

  // credit bin(th) with r, and each neighbouring bin with r projected onto
  // that bin's centre direction
  // `pts`, when given, keeps the real point behind each wedge's value: the
  // sample itself for its own wedge, the projected point for a neighbour
  _paint(env, th, r, pts = null, dx = 0, dy = 0) {
    const i = binOf(th);
    if (r > env[i]) { env[i] = r; if (pts) pts[i] = { x: dx, y: dy }; }
    for (let k = -PAINT_SPREAD; k <= PAINT_SPREAD; k++) {
      if (!k) continue;
      const j = (i + k + BINS) % BINS;
      const phi = (j + 0.5) / BINS * TAU;
      let d = phi - th;
      d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;   // wrap to -π..π
      const proj = r * Math.cos(d);
      if (proj > env[j]) {
        env[j] = proj;
        if (pts) pts[j] = { x: Math.cos(phi) * proj, y: Math.sin(phi) * proj };
      }
    }
  }

  // the polygon's corner for wedge i: the real point where there is one,
  // else the wedge's (floored) radius at its centre
  _shapePoint(i) {
    const p = this.envPts[i];
    if (p) return { x: CENTER.x + p.x, y: CENTER.y + p.y };
    const th = (i + 0.5) / BINS * TAU, r = this.envelope[i];
    return { x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r };
  }

  // Where the true reach boundary lies in direction th, seen from CENTER:
  // the demo firefly rides this, so the clue is the patient's OWN arm length,
  // not an arbitrary radius. (Circle centered on the shoulder, radius armLen,
  // intersected with a ray from CENTER.)
  _demoR(th) {
    if (this.armLen == null || !this.shoulderRel) return 1.15;   // fallback until the arm is seen
    const dx = CENTER.x - this.shoulderRel.x, dy = CENTER.y - this.shoulderRel.y;
    const du = dx * Math.cos(th) + dy * Math.sin(th);
    const disc = du * du + this.armLen * this.armLen - (dx * dx + dy * dy);
    if (disc <= 0) return 1.15;
    return Math.max(0.5, Math.min(ENV_CAP, (-du + Math.sqrt(disc)) * 0.92));
  }

  // The largest radius (SW) along direction th from CENTER that still lands on
  // the stage. relToPx is affine, so the ray is a straight line in pixels and
  // this is just the nearest edge crossing.
  _zoomOf(c) {
    const one = { k: 1, tx: 0, ty: 0 };
    if (!this.t.frame) return this._zoom || one;
    const o = this.t.relToPx(CENTER, c);
    const ux = this.t.relToPx({ x: CENTER.x + 1, y: CENTER.y }, c);
    const uy = this.t.relToPx({ x: CENTER.x, y: CENTER.y + 1 }, c);
    const R = (this.armLen || 1.3) + ZOOM_PAD_SW;
    const hx = R * Math.abs(ux.x - o.x), hy = R * Math.abs(uy.y - o.y);
    if (!(hx > 1) || !(hy > 1) || !isFinite(o.x) || !isFinite(o.y)) return this._zoom || one;
    const k = Math.max(1, Math.min(ZOOM_MAX, c.width / (2 * hx), c.height / (2 * hy)));
    const want = { k, tx: c.width / 2 - k * o.x, ty: c.height / 2 - k * o.y };
    // never past the picture's edge: the zoomed camera picture must still
    // cover the whole stage (a body centre low in the picture used to leave
    // a dark band along the bottom), so the window slides instead
    const sw = this.t.srcW, sh = this.t.srcH;
    if (sw > 0 && sh > 0) {
      const sc = Math.max(c.width / sw, c.height / sh);
      const dw = sw * sc, dh = sh * sc, dx = (c.width - dw) / 2, dy = (c.height - dh) / 2;
      want.tx = Math.min(-k * dx, Math.max(c.width - k * (dx + dw), want.tx));
      want.ty = Math.min(-k * dy, Math.max(c.height - k * (dy + dh), want.ty));
    }
    const z = this._zoom || want;
    this._zoom = { k: z.k + (want.k - z.k) * ZOOM_EASE, tx: z.tx + (want.tx - z.tx) * ZOOM_EASE, ty: z.ty + (want.ty - z.ty) * ZOOM_EASE };
    return this._zoom;
  }
  // the part of the (unzoomed) stage that is on screen under the zoom
  _viewRect(c) {
    const Z = this._zoom || { k: 1, tx: 0, ty: 0 };
    return { x0: -Z.tx / Z.k, y0: -Z.ty / Z.k, x1: (c.width - Z.tx) / Z.k, y1: (c.height - Z.ty) / Z.k, k: Z.k };
  }

  _screenR(th, c) {
    const o = this.t.relToPx(CENTER, c);
    // The basis is taken from relToPx itself rather than from pxPerSW: a
    // normalized y is over the source HEIGHT and a normalized x over its
    // WIDTH, so one SW is a different number of pixels on each axis and a
    // square assumption would cut short (or overrun) every diagonal.
    const ux = this.t.relToPx({ x: CENTER.x + 1, y: CENTER.y }, c);
    const uy = this.t.relToPx({ x: CENTER.x, y: CENTER.y + 1 }, c);
    const co = Math.cos(th), si = Math.sin(th);
    const dx = (ux.x - o.x) * co + (uy.x - o.x) * si;
    const dy = (ux.y - o.y) * co + (uy.y - o.y) * si;
    if (!isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0)) return Infinity;
    const V = this._viewRect(c);
    const m = Math.min(c.width, c.height) * STAGE_MARGIN / V.k;
    const edge = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-6) return (p >= lo && p <= hi) ? Infinity : 0;
      return (d > 0 ? hi - p : lo - p) / d;
    };
    return Math.max(0, Math.min(edge(o.x, dx, V.x0 + m, V.x1 - m),
                                edge(o.y, dy, V.y0 + m, V.y1 - m)));
  }

  // What this arm has actually shown in direction th: the best of the bin and
  // its neighbours (unfloored), so one unvisited sliver cannot shrink the ask.
  _measuredR(th) {
    const i = binOf(th);
    let m = 0;
    for (let k = -PAINT_SPREAD; k <= PAINT_SPREAD; k++) m = Math.max(m, this.envRaw[(i + k + BINS) % BINS] || 0);
    return m;
  }
  _bestSeen() { return this.envRaw.reduce((m, v) => Math.max(m, v || 0), 0); }

  // The five asks, frozen once the circles are done — a target that moved
  // while the patient reached for it would be a treadmill, not a measurement.
  // Each sits INSIDE the traced shape in its direction. A direction the
  // wrist never visited used to borrow 0.6 of the best reach seen, which put
  // that target OUTSIDE the painted shape (Sep 2026, reported); now the ask
  // turns to the nearest direction the wrist did visit, and takes
  // TARGET_FRAC of that wedge's own value, so every target is inside the
  // workspace by construction.
  _buildTargets(c) {
    this.targets = TARGETS.map(t => {
      let th = this._extTheta(t.deg);
      let seen = this.envRaw[binOf(th)] || 0;
      if (!(seen > 0)) {
        const i0 = binOf(th);
        for (let k = 1; k <= BINS / 2 && !(seen > 0); k++) {
          for (const j of [i0 + k, i0 - k]) {
            const jj = (j + BINS) % BINS;
            if (this.envRaw[jj] > 0) { seen = this.envRaw[jj]; th = (jj + 0.5) / BINS * TAU; break; }
          }
        }
      }
      const anat = this._demoR(th) * EXT_REACH;
      const want = seen > 0 ? seen * TARGET_FRAC : Math.min(this._bestSeen() * 0.6, ENV_FLOOR);
      const r = Math.max(Math.min(TARGET_MIN_SW, anat),
                         Math.min(want, anat, this._screenR(th, c)));
      return { ...t, th, anat, r, cap: Math.max(0.18, Math.min(TARGET_CAP, r * TARGET_CAP_FRAC)) };
    });
  }

  _finishCircles(now) {
    // honest coverage: record how much of the circle was actually measured;
    // unreached directions get the conservative floor, never a fabricated reach
    this.covered = this.envelope.filter(v => v > 0).length / BINS;
    for (let i = 0; i < BINS; i++) this.envelope[i] = Math.max(this.envelope[i], ENV_FLOOR);
    // loop time is a speed input: the mean of the completed laps, else the
    // circling time over the angle actually swept
    const done = this.laps.filter(l => l.complete);
    const totalS = this.laps.reduce((a, l) => a + l.seconds, 0);
    this.loopSeconds = this.videoLoopSeconds ?? Math.min(20, done.length
      ? done.reduce((a, l) => a + l.seconds, 0) / done.length
      : this.laps.length ? totalS / Math.max(0.25, this.swept / TAU) : 12);
    this._buildTargets(this.canvas);
    this.tIdx = 0;
    this.state = "target-move"; this.stateT = now;
    audio.fanfare();
    this._prompt("Beautiful!", "Now five targets to reach for, one at a time");
    this._speak("Beautiful. Now five targets to reach for, one at a time. "
              + "Reach each one, then squeeze and open your hand.");
  }

  // ---------- workspace geometry ----------
  // Area of the painted shape: the envelope is a star-shaped polygon around
  // the body centre, so it is the sum of its 16 triangles. SW² — a real cm²
  // needs the patient's shoulder width, which the profile screen applies.
  _areaSW2() {
    // shoelace over the real corner points (a wedge nobody reached counts as
    // the centre, i.e. nothing)
    let a = 0;
    for (let i = 0; i < BINS; i++) {
      const p = this.envPts[i] || { x: 0, y: 0 }, q = this.envPts[(i + 1) % BINS] || { x: 0, y: 0 };
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  // What fraction of the arm's full reachable disc that area covers. The disc
  // is centred on the shoulder and the envelope on the body centre, but the
  // area of the reachable region is π·armLen² wherever it is measured from.
  _coverage(area) {
    if (!this.armLen) return null;
    return Math.max(0, Math.min(1, area / (Math.PI * this.armLen * this.armLen)));
  }

  // The elbow's own orbit around the shoulder, sampled through the circles.
  // Bins are centred on the SHOULDER here, not on the body centre, because
  // that is the joint the elbow actually turns about.
  _recordElbow() {
    const el = this.t.elbow(this.side), f = this.t.frame;
    if (!el || !f || !this.shoulderRel) return;
    const x = (el.x - f.x) / f.sw, y = -(el.y - f.y) / f.sw;
    const dx = x - this.shoulderRel.x, dy = y - this.shoulderRel.y;
    const r = Math.hypot(dx, dy);
    if (r < 0.15 || r > 1.6) return;                 // nonsense or the joint sitting on the shoulder
    this.upperArm = Math.max(this.upperArm ?? 0, r);
    this._paint(this.envElbow, Math.atan2(dy, dx), r);
  }

  // Each quadrant's share of its quarter of the disc the joint could reach,
  // unrounded, in SCREEN order (0 = up-right, 1 = up-left, 2 = down-left,
  // 3 = down-right). One source of truth for the therapist's quadrant map and
  // for the RSA scores below, so the two can never disagree.
  _quadFracs(env, radius) {
    if (!radius) return null;
    const step = TAU / BINS, per = BINS / 4;
    const quarter = Math.PI * radius * radius / 4;
    const q = [];
    for (let k = 0; k < 4; k++) {
      let a = 0;
      for (let j = 0; j < per; j++) {
        const i = k * per + j;
        a += 0.5 * env[i] * env[(i + 1) % BINS] * Math.sin(step);
      }
      q.push(a / quarter);
    }
    return q;
  }

  // Named for the assessed arm (a right arm's "up-out" quadrant is a left
  // arm's mirror image, so raw screen quadrants would compare the two arms
  // wrongly). About the body centre, "across" is genuinely across the midline.
  _quadsNamed(env, radius) {
    const q = this._quadFracs(env, radius);
    if (!q) return null;
    return this.side === "right"
      ? { upOut: q[0], upAcross: q[1], downAcross: q[2], downOut: q[3] }
      : { upOut: q[1], upAcross: q[0], downAcross: q[3], downOut: q[2] };
  }

  // Where the workspace is lost.
  _quadrants() {
    const q = this._quadsNamed(this.envRaw, this.armLen);
    if (!q) return null;
    const r = v => Math.round(Math.min(1, v) * 100) / 100;
    return { upOut: r(q.upOut), upAcross: r(q.upAcross), downAcross: r(q.downAcross), downOut: r(q.downOut) };
  }

  // RSA — the same measurement on the Kinetigram device's scale, so a STRIVE
  // workspace can be read next to one from a device a clinician already
  // trusts: each quadrant a fraction of its quarter of the reachable region
  // (max 0.25), the four summing to at most 1.0. Q1/Q2 are the upper/lower
  // CONTRALATERAL quadrants (across the body), Q3/Q4 the upper/lower
  // IPSILATERAL ones, exactly as that device numbers them.
  //   method "planar" — the area of the shape the hand painted on the frontal
  //     plane, not the surface of a sphere fitted to a 3D trajectory.
  //   q5 null — reach BEHIND the trunk, which one camera in front of the
  //     patient cannot see. Absent, never zero.
  _rsaFrom(env, radius) {
    const q = this._quadsNamed(env, radius);
    if (!q) return null;
    const s = v => Math.round(Math.min(0.25, Math.max(0, v * 0.25)) * 1000) / 1000;
    const out = { q1: s(q.upAcross), q2: s(q.downAcross), q3: s(q.upOut), q4: s(q.downOut),
                  q5: null, method: "planar", radiusSW: Math.round(radius * 1000) / 1000 };
    out.total14 = Math.round((out.q1 + out.q2 + out.q3 + out.q4) * 1000) / 1000;
    return out;
  }

  _rsa() { return this._rsaFrom(this.envRaw, this.armLen); }

  // Elbow RSA: the same score from the elbow's orbit. Lower than the wrist
  // score by construction, and the gap between them is the part of the
  // workspace that came from straightening the elbow rather than from moving
  // the shoulder — which is the distinction a shoulder rehab target needs.
  _rsaElbow() { return this._rsaFrom(this.envElbow, this.upperArm); }

  // Workspace volume, ZED only. Each of the 16 sectors is a wedge of the
  // painted area extruded by how far the hand actually travelled forward and
  // back IN THAT SECTOR — an honest sector-prism sum rather than one global
  // depth stretched over the whole shape. Returns null without depth.
  _volume() {
    const shM = this.t.shoulderM;
    if (!shM || !this.zHi.some(v => v != null)) return { volumeM3: null, depthRangeM: null };
    const step = TAU / BINS;
    let vol = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < BINS; i++) {
      if (this.zLo[i] == null || this.zHi[i] == null) continue;
      lo = Math.min(lo, this.zLo[i]); hi = Math.max(hi, this.zHi[i]);
      const rM = this.envRaw[i] * shM;
      vol += 0.5 * rM * rM * step * (this.zHi[i] - this.zLo[i]);
    }
    return {
      volumeM3: vol > 0 ? Math.round(vol * 10000) / 10000 : null,
      depthRangeM: hi > lo ? Math.round((hi - lo) * 1000) / 1000 : null,
    };
  }

  _finish() {
    this.active = false;
    this._prompt("");
    this._speak("All done. Wonderful work.");
    // arc guard: if the arm angle was never sampled the min/max are still at
    // their sentinels — export a safe default arc instead of nonsense
    let arcMin = Math.round(this.angMin), arcMax = Math.round(this.angMax);
    const arcMeasured = this.angMax > this.angMin;
    if (!arcMeasured) { arcMin = 20; arcMax = 100; }
    const area = this._areaSW2();
    const cov = this._coverage(area);
    const vol = this._volume();
    const profile = {
      arm: this.side,
      date: new Date().toISOString(),
      // the work centre IS the body centre — games load this so targets appear
      // around the same point the envelope was measured from
      center: { x: 0, y: 0 },
      reference: "body-centre",
      curlCal: null,                         // no squeeze-calibration step; the tracker self-calibrates grasp
      envelope: this.envelope.map(v => Math.round(v * 1000) / 1000),
      // the real corner points the shape is drawn through (SW from the body
      // centre); null where a wedge was never reached
      envPts: this.envPts.map(p => p ? { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 } : null),
      covered: Math.round(this.covered * 100) / 100,
      // the reach the workspace is a fraction OF: GameBase compares it with
      // the arm measured live so range demand means the same thing every
      // session, whatever the chair distance or how the patient is turned
      armLenSW: this.armLen ? Math.round(this.armLen * 1000) / 1000 : null,
      // workspace: area always, volume when the camera has depth
      areaSW2: Math.round(area * 1000) / 1000,
      coverage: cov == null ? null : Math.round(cov * 100) / 100,
      quadrants: this._quadrants(),
      ...vol,
      shoulderM: this.t.shoulderM ?? null,   // makes the cm/cm² conversion self-contained
      rsa: this._rsa(),
      rsaElbow: this._rsaElbow(),
      upperArmSW: this.upperArm ? Math.round(this.upperArm * 1000) / 1000 : null,
      // which flow produced this: the drawn figure with two circles and a
      // lift, or the instruction video. The two are compared, not mixed.
      style: this.style,
      video: this.videoResult ?? null,
      // the two circles and the lift, as they happened
      laps: this.laps,
      lift: this.liftResult,
      // the five targets: could they get there, how far did they get when
      // they could not, and did the hand work once there
      extremes: this.extremes,
      arcMinDeg: arcMin,
      arcMaxDeg: arcMax,
      arcMeasured,
      jitter: this.jitterN ? this.jitterSum / this.jitterN : 0.1,
      loopSeconds: this.loopSeconds ?? 12,
      // grasp is a VIEW of the targets, not a separate measurement:
      // one source of truth, and the therapist's grasp map keeps working
      grasp: this.extremes.map(e => ({
        deg: e.deg, key: e.key, ok: e.reached, stability: e.stability, squeeze: e.graspOk,
      })),
      // what game allocation actually needs: where this patient can work, and
      // where they can work WITH their hand
      reachablePositions: this.extremes.filter(e => e.reached).map(e => e.key),
      graspPositions: this.extremes.filter(e => e.graspOk).map(e => e.key),
      compEvents: this.coach.events,
    };
    this.onDone(profile);
  }

  // ---------- the demo figure ----------
  // A person doing the movement, drawn plainly and SEATED, as the patient is:
  // head, trunk, a chair, one still arm, and the assessed arm doing the
  // movement with a trail behind the hand. It is a DEMONSTRATION, not a
  // target — it sits in the middle of the screen over a dimmed backdrop,
  // mirrored to the assessed side so the patient sees the arm they are about
  // to use on the side they see it in their own mirror, going the way they
  // are about to be asked to go.
  _drawDemo(ctx, c, now) {
    const H = c.height;
    // bigger since Sep 2026 (by request: it was too small to follow): the
    // seated figure fills about 55% of the screen's height, the overhead
    // hand clears the prompt at the top and the shins stay above the bottom
    const cx = c.width / 2, cy = H * 0.53;
    const u = H * 0.072;                       // one figure unit
    const mirror = this.side === "right" ? 1 : -1;
    const d = this.demo || { kind: "circle", dir: 1 };
    const t = (now - this.stateT) / DEMO_LOOP;
    const R = u * 3.1;                                 // the demo arm's reach

    ctx.save();
    ctx.fillStyle = "rgba(18,14,34,0.62)";
    ctx.fillRect(0, 0, c.width, c.height);

    const shY = cy - u * 1.5;
    const shX = cx + mirror * u * 0.9;
    const hipY = cy + u * 1.1;

    // the chair, behind the figure: seat and back
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(244,236,221,0.28)";
    ctx.lineWidth = Math.max(4, u * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx - u * 1.5, hipY + u * 0.15); ctx.lineTo(cx + u * 1.5, hipY + u * 0.15);   // seat
    ctx.moveTo(cx - u * 1.5, hipY + u * 0.15); ctx.lineTo(cx - u * 1.5, cy - u * 2.6);      // back
    ctx.moveTo(cx - u * 1.3, hipY + u * 0.15); ctx.lineTo(cx - u * 1.3, hipY + u * 2.2);    // legs
    ctx.moveTo(cx + u * 1.3, hipY + u * 0.15); ctx.lineTo(cx + u * 1.3, hipY + u * 2.2);
    ctx.stroke();

    // the traced path, drawn faintly all the way round so the SHAPE reads
    if (d.kind === "circle") {
      ctx.strokeStyle = "rgba(232,168,106,0.28)";
      ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
      ctx.beginPath(); ctx.arc(shX, shY, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // body: head, trunk, shoulders, and seated legs (thighs forward, shins down)
    ctx.strokeStyle = "rgba(244,236,221,0.9)";
    ctx.lineWidth = Math.max(4, u * 0.34);
    ctx.beginPath(); ctx.arc(cx, cy - u * 3.1, u * 0.72, 0, TAU); ctx.stroke();   // head
    ctx.beginPath();
    ctx.moveTo(cx, cy - u * 2.3); ctx.lineTo(cx, hipY);                             // trunk
    ctx.moveTo(cx - u * 0.9, shY); ctx.lineTo(cx + u * 0.9, shY);                  // shoulders
    for (const sgn of [-1, 1]) {                                                    // thighs out, shins down
      ctx.moveTo(cx, hipY); ctx.lineTo(cx + sgn * u * 1.0, hipY + u * 0.35);
      ctx.lineTo(cx + sgn * u * 1.0, hipY + u * 2.3);
    }
    ctx.stroke();
    ctx.beginPath();                                                                // the resting arm, in the lap
    ctx.moveTo(cx - mirror * u * 0.9, shY);
    ctx.lineTo(cx - mirror * u * 1.2, cy + u * 0.5);
    ctx.lineTo(cx - mirror * u * 0.6, hipY + u * 0.2);
    ctx.stroke();

    // the working arm. Circle: round and round, the wanted way (dir > 0 is
    // anticlockwise in y-up terms, which is how the pacer runs too). Lift:
    // straight up from the side to overhead and back down, once per loop.
    let a;
    if (d.kind === "circle") a = d.dir * t * TAU;
    else {
      const ph = (1 - Math.cos(Math.min(1, (t % 1.6) / 1.6) * TAU)) / 2;   // 0 → 1 → 0, eased
      // hangs at the side (-90°) and rises through "out" to overhead (+90°),
      // on the arm's own side
      a = mirror > 0 ? -Math.PI / 2 + Math.PI * ph : -Math.PI / 2 - Math.PI * ph;
    }
    const hx = shX + Math.cos(a) * R, hy = shY - Math.sin(a) * R;
    const mx = (shX + hx) / 2, my = (shY + hy) / 2;
    const ex = mx + Math.cos(a) * u * 0.45, ey = my - Math.sin(a) * u * 0.45;
    ctx.strokeStyle = "#e8a86a";
    ctx.lineWidth = Math.max(5, u * 0.4);
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();

    // the hand, with a trail so the direction of travel is unmistakable
    if (d.kind === "circle") {
      for (let k = 8; k >= 0; k--) {
        const ta = a - d.dir * k * 0.13;
        const px = shX + Math.cos(ta) * R, py = shY - Math.sin(ta) * R;
        ctx.globalAlpha = 0.14 + (1 - k / 9) * 0.8;
        ctx.fillStyle = k ? "rgba(232,168,106,0.85)" : "#fff6d8";
        ctx.beginPath(); ctx.arc(px, py, k ? u * 0.16 : u * 0.34, 0, TAU); ctx.fill();
      }
    } else {
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath(); ctx.arc(hx, hy, u * 0.34, 0, TAU); ctx.fill();
      // a faint up-and-down arrow beside the path
      ctx.strokeStyle = "rgba(244,236,221,0.45)"; ctx.lineWidth = 4;
      const ax = shX + mirror * (R + u * 0.9);
      ctx.beginPath(); ctx.moveTo(ax, shY + R * 0.9); ctx.lineTo(ax, shY - R * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - 10, shY - R * 0.9 + 14); ctx.lineTo(ax, shY - R * 0.9); ctx.lineTo(ax + 10, shY - R * 0.9 + 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - 10, shY + R * 0.9 - 14); ctx.lineTo(ax, shY + R * 0.9); ctx.lineTo(ax + 10, shY + R * 0.9 - 14); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- the video stage ----------
  // The layout from the clinical lead's sketch: an instruction box top-left,
  // the recording large beneath it, and on the right the patient's own
  // mirror CROPPED to the person, with the skeleton, the painted workspace
  // and the wrist cursor exactly as the full-screen stage draws them.
  _drawVideoStage(ctx, c, now) {
    const W = c.width, H = c.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#20204a"); g.addColorStop(1, "#161636");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const pad = Math.round(W * 0.022);
    const boxH = Math.round(H * 0.13);
    const top = pad, left = pad;
    const bodyTop = top + boxH + pad, bodyH = H - bodyTop - pad;
    // the recording's box takes the crop's own shape (no wider than 60% of
    // the stage), and the patient gets the rest
    const v = this.vid;
    const srcW = v?.videoWidth || 1920, srcH = v?.videoHeight || 1080;
    const cropAspect = (srcW * (VIDEO_CROP.x1 - VIDEO_CROP.x0)) / srcH;
    const vidW = Math.min(Math.round((W - pad * 3) * 0.6), Math.round(bodyH * cropAspect));
    const panelX = left + vidW + pad, panelW = W - panelX - pad;
    const part = VIDEO_PARTS[this.vIdx] || null;

    // instruction box, across the top: the move she is on, in the words of
    // its caption, and which arm
    ctx.save();
    ctx.fillStyle = "rgba(244,236,221,0.08)";
    ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(left, top, W - pad * 2, boxH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e8a86a"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const titleF = Math.round(H * 0.034);
    ctx.font = `800 ${titleF}px Nunito, sans-serif`;
    const done = this.vIdx >= VIDEO_PARTS.length;
    ctx.fillText(done ? "Well done!" : this.vWait ? "Finish the move, then we carry on" : part ? `Follow along: ${part.name.toLowerCase()}` : "Follow along", left + 18, top + boxH * 0.3);
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(244,236,221,0.6)";
    ctx.font = `700 ${Math.round(H * 0.022)}px Nunito, sans-serif`;
    ctx.fillText(`${this.side} arm`, W - pad - 18, top + boxH * 0.3);
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(244,236,221,0.85)";
    const lineF = Math.round(H * 0.024);
    ctx.font = `600 ${lineF}px Nunito, sans-serif`;
    const lines = wrapLines(ctx, done ? VIDEO_DONE : part ? part.say : VIDEO_LEAD, W - pad * 2 - 36);
    lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, left + 18, top + boxH * 0.62 + i * lineF * 1.15));
    ctx.restore();

    // the recording, cropped to its left part (mirrored for the other arm
    // only when the recording has no burnt-in text, VIDEO_MIRROR)
    ctx.save();
    ctx.fillStyle = "rgba(10,10,30,0.6)";
    ctx.beginPath(); ctx.roundRect(left, bodyTop, vidW, bodyH, 14); ctx.fill();
    ctx.clip();
    if (v && v.readyState >= 2 && v.videoWidth) {
      const sx = v.videoWidth * VIDEO_CROP.x0, sw = v.videoWidth * (VIDEO_CROP.x1 - VIDEO_CROP.x0), sh = v.videoHeight;
      const sc = Math.min(vidW / sw, bodyH / sh);
      const dw = sw * sc, dh = sh * sc;
      const dx = left + (vidW - dw) / 2, dy = bodyTop + (bodyH - dh) / 2;
      if (VIDEO_MIRROR && !VIDEO_SRCS[this.side]) {
        ctx.translate(dx + dw, dy); ctx.scale(-1, 1);
        ctx.drawImage(v, sx, 0, sw, sh, 0, 0, dw, dh);
      } else {
        ctx.drawImage(v, sx, 0, sw, sh, dx, dy, dw, dh);
      }
    } else {
      ctx.fillStyle = "rgba(244,236,221,0.6)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(H * 0.03)}px Nunito, sans-serif`;
      ctx.fillText(this.vidFailedAt ? "The video could not be played" : "Loading the video…", left + vidW / 2, bodyTop + bodyH / 2);
    }
    ctx.restore();
    // the caption: the spoken line, under the picture, for anyone who
    // cannot hear it (the patient's own captions setting), unless the
    // recording carries its own
    if (A11Y.captions && this.caption && !VIDEO_CAPTIONED) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(left, bodyTop, vidW, bodyH, 14); ctx.clip();
      const capF = Math.round(H * 0.026);
      ctx.font = `700 ${capF}px Nunito, sans-serif`;
      const cl = wrapLines(ctx, this.caption, vidW - 40).slice(0, 3);
      const bandH = cl.length * capF * 1.3 + 22;
      ctx.fillStyle = "rgba(8,6,18,0.78)";
      ctx.fillRect(left, bodyTop + bodyH - 10 - bandH, vidW, bandH);
      ctx.fillStyle = "#f4ecdd"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      cl.forEach((ln, i) => ctx.fillText(ln, left + vidW / 2, bodyTop + bodyH - 10 - bandH + 11 + i * capF * 1.3));
      ctx.restore();
    }
    // progress under the recording: how far through it is, with a tick
    // where each move begins
    {
      const y = bodyTop + bodyH - 6;
      ctx.fillStyle = "rgba(244,236,221,0.16)";
      ctx.fillRect(left, y, vidW, 6);
      const f = v && v.duration > 0 ? Math.max(0, Math.min(1, v.currentTime / VIDEO_END)) : 0;
      if (f > 0) { ctx.fillStyle = "rgba(232,168,106,0.9)"; ctx.fillRect(left, y, vidW * f, 6); }
      ctx.fillStyle = "rgba(20,16,40,0.8)";
      for (const p of VIDEO_PARTS) ctx.fillRect(left + vidW * (p.t0 / VIDEO_END) - 1, y, 2, 6);
    }

    // the patient, cropped to the person
    const panel = { x: panelX, y: bodyTop, w: panelW, h: bodyH };
    ctx.save();
    ctx.fillStyle = "rgba(10,10,30,0.55)";
    ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 14); ctx.fill();
    ctx.clip();
    this._drawPersonPanel(ctx, c, panel, now);
    ctx.restore();
    ctx.fillStyle = "rgba(244,236,221,0.75)";
    ctx.font = `600 ${Math.round(H * 0.024)}px Nunito, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("You", panel.x + 12, panel.y - 8);
    ctx.beginPath(); ctx.arc(panel.x + panel.w - 18, panel.y - 15, 6, 0, TAU);
    ctx.fillStyle = this.t.trackingOk ? "#9fc08a" : "#e8a86a"; ctx.fill();
  }

  // The crop is a window in the tracker's (mirrored, normalised) video
  // coordinates about the body centre, sized in shoulder widths so the whole
  // reach fits, then widened or heightened to the panel's aspect. Everything
  // drawn in it goes through one mapping, so the skeleton, the shape and the
  // cursor land on the person exactly as they do full screen.
  _drawPersonPanel(ctx, c, panel, now) {
    const t = this.t, f = t.frame, cam = t.video;
    if (!f || !cam || !(cam.readyState >= 2)) return;
    const sw = t.srcW, sh = t.srcH;
    const ax = sw / sh;                                   // norm-y unit is taller than norm-x by this
    let halfW = VIDEO_CROP_HALF_W * f.sw;                 // norm-x
    let up = VIDEO_CROP_UP * f.sw * ax, down = VIDEO_CROP_DOWN * f.sw * ax;   // norm-y
    // fit the panel's aspect: pixel aspect of the crop = (2·halfW·sw) / ((up+down)·sh)
    const want = panel.w / panel.h;
    const have = (2 * halfW * sw) / ((up + down) * sh);
    if (have < want) halfW *= want / have; else { const k = have / want; up *= k; down *= k; }
    let x0 = f.x - halfW, x1 = f.x + halfW, y0 = f.y - up, y1 = f.y + down;
    // keep the window inside the picture, sliding rather than squashing
    if (x0 < 0) { x1 -= x0; x0 = 0; } if (x1 > 1) { x0 -= x1 - 1; x1 = 1; }
    if (y0 < 0) { y1 -= y0; y0 = 0; } if (y1 > 1) { y0 -= y1 - 1; y1 = 1; }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
    const cw = x1 - x0, ch = y1 - y0;

    // the picture, mirrored: the crop in UNMIRRORED source pixels is
    // [1 - x1, 1 - x0]
    ctx.save();
    ctx.translate(panel.x + panel.w, panel.y); ctx.scale(-1, 1);
    ctx.drawImage(cam, (1 - x1) * sw, y0 * sh, cw * sw, ch * sh, 0, 0, panel.w, panel.h);
    ctx.restore();
    ctx.fillStyle = "rgba(22,22,54,0.22)"; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);

    // one mapping for everything drawn on the person
    const norm = n => ({ x: panel.x + (n.x - x0) / cw * panel.w, y: panel.y + (n.y - y0) / ch * panel.h });
    const scale = Math.max(c.width / sw, c.height / sh);
    const dw = sw * scale, dh = sh * scale;
    const pxToNorm = px => ({ x: (px.x - (c.width - dw) / 2) / dw, y: (px.y - (c.height - dh) / 2) / dh });
    const map = px => norm(pxToNorm(px));
    const k = panel.w / (cw * dw);
    // hands: true here (the sweep screen says false): the hand model's 21
    // points over the patient's real hand, so the palm and fingers are seen
    // to be tracked while the wrist, the red mark, stays the measured point
    drawBody(ctx, c, t, { framed: !this.coach.dimming, map, scale: k, hands: true });

    // the painted workspace, the body centre, and the wrist cursor
    ctx.save();
    ctx.strokeStyle = "rgba(232,168,106,0.7)"; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= BINS; i++) {
      const q = map(t.relToPx(this._shapePoint(i % BINS), c));
      i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(232,168,106,0.14)"; ctx.fill(); ctx.stroke();
    const o = map(t.relToPx(CENTER, c));
    ctx.fillStyle = "rgba(244,236,221,0.6)";
    ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, TAU); ctx.fill();
    const hp = t.handPx(this.side, c);
    if (hp) {
      const q = map(hp);
      ctx.fillStyle = "#e8635a"; ctx.shadowColor = "rgba(232,99,90,0.9)"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // a curved arrow about the centre showing which way round: drawn only for
  // the second lap, when the direction is the instruction
  _drawTurnArrow(ctx, c, dir) {
    const sw = this.t.pxPerSW(c);
    const o = this.t.relToPx(CENTER, c);
    const R = sw * 0.5;
    // an arc over the top of the centre; dir > 0 is anticlockwise in y-up
    // terms, which on the canvas (y down) runs from right to left
    const a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.15;
    ctx.save();
    ctx.strokeStyle = "rgba(244,236,221,0.7)"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(o.x, o.y, R, a0, a1); ctx.stroke();
    const tipA = dir > 0 ? a0 : a1;
    const tx = o.x + Math.cos(tipA) * R, ty = o.y + Math.sin(tipA) * R;
    const tang = dir > 0 ? tipA - Math.PI / 2 : tipA + Math.PI / 2;   // tangent, the way of travel
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(tang) * 16, ty + Math.sin(tang) * 16);
    ctx.lineTo(tx + Math.cos(tang + 2.4) * 12, ty + Math.sin(tang + 2.4) * 12);
    ctx.lineTo(tx + Math.cos(tang - 2.4) * 12, ty + Math.sin(tang - 2.4) * 12);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- drawing ----------
  _draw(ctx, c, hand, now) {
    const sw = this.t.pxPerSW(c);

    // the demo owns the screen: the patient is told to watch, so there is
    // nothing else on it to react to
    if (this.state === "demo") { this._drawDemo(ctx, c, now); this._drawCoach(ctx, c, now); return; }
    // the video stage draws its own panels (recording left, patient right);
    // the coach's dock and dim still go over it, so a cue is seen there too
    if (this.state === "video") { this._drawCoach(ctx, c, now); return; }

    const Z = this._zoom || { k: 1, tx: 0, ty: 0 };
    const fs = n => n / Z.k;                       // text keeps its size on screen under the zoom
    ctx.save(); ctx.translate(Z.tx, Z.ty); ctx.scale(Z.k, Z.k);
    if (this.state !== "settle") {
      // the body centre, marked with a soft dot — everything else is drawn by
      // the patient
      ctx.save();
      const gp = this.t.relToPx(CENTER, c);
      ctx.fillStyle = "rgba(244,236,221,0.55)";
      ctx.shadowColor = "rgba(244,236,221,0.5)"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, 7, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;

      if (this.state === "countdown") {
        const left = Math.max(1, 3 - Math.floor((now - this.stateT) / 1000));
        ctx.save();
        ctx.fillStyle = "rgba(244,236,221,0.95)";
        ctx.shadowColor = "rgba(232,168,106,0.8)"; ctx.shadowBlur = 30;
        ctx.font = `800 ${Math.round(fs(c.height * 0.16))}px Nunito, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(left, gp.x, gp.y);
        ctx.restore();
      }

      if (this.state === "circle" && this.lap) {
        // direction dots hug the patient's OWN traced shape (just outside
        // each bin's measured reach — never a preset ring), lit once drawn
        for (let i = 0; i < BINS; i++) {
          const th = (i + 0.5) / BINS * TAU;
          const want = Math.max(0.6, this.envelope[i] + 0.3);
          const r = Math.max(0.35, Math.min(want, this._demoR(th), this._screenR(th, c)));
          const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
          const done = this.visited[i] >= 1;
          ctx.fillStyle = done ? "rgba(232,168,106,0.9)" : "rgba(244,236,221,0.16)";
          ctx.beginPath(); ctx.arc(p.x, p.y, done ? 4 : 2.5, 0, TAU); ctx.fill();
        }
        // A pacer firefly on the boundary — only until the patient is clearly
        // going round on their own. It rides the arm-length boundary, capped
        // at a stretch past the widest reach seen so far, and runs the way
        // this lap is meant to go.
        const frac = Math.min(1, Math.abs(this.lapAngle) / TAU);
        const dir = this.lap.want || 1;
        if (frac < PACER_UNTIL) {
          const a = dir * now / 3400;
          const alpha = 0.8 * (1 - frac / PACER_UNTIL);
          const seen = this._bestSeen();
          const cap = seen > 0 ? Math.max(seen * 1.25, 0.7) : Infinity;
          for (let k = 0; k < 4; k++) {
            const ta = a - dir * k * 0.1;
            const rr = Math.max(0.35, Math.min(this._demoR(ta), cap, this._screenR(ta, c)));
            const p = this.t.relToPx({ x: CENTER.x + Math.cos(ta) * rr, y: CENTER.y + Math.sin(ta) * rr }, c);
            ctx.globalAlpha = alpha * (1 - k / 4);
            const dg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 12 - k * 1.8);
            dg.addColorStop(0, "#fff6d8"); dg.addColorStop(1, "rgba(159,192,138,0.9)");
            ctx.fillStyle = dg;
            ctx.beginPath(); ctx.arc(p.x, p.y, 10 - k * 1.6, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (this.lap.n === 2) this._drawTurnArrow(ctx, c, this.lap.want || 1);
      }

      if (this.state === "lift" && this.lift) {
        // an arrow beside the hand: up until the peak, down after it
        const hp = this.t.handPx(this.side, c);
        const goingUp = !this.lift.upSaid;
        if (hp) {
          const dx = this.side === "right" ? 46 : -46;
          const bob = Math.sin(now / 300) * 6;
          const x = hp.x + dx, y0 = hp.y + (goingUp ? 34 : -34) + bob, y1 = hp.y + (goingUp ? -34 : 34) + bob;
          ctx.strokeStyle = "rgba(244,236,221,0.8)"; ctx.lineWidth = 5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
          const s = goingUp ? 1 : -1;
          ctx.beginPath(); ctx.moveTo(x - 12, y1 + 14 * s); ctx.lineTo(x, y1); ctx.lineTo(x + 12, y1 + 14 * s); ctx.stroke();
        }
      }

      // TARGET: one direction at a time, so there is never a choice to make.
      // A guide line runs from the body centre to the target, and the ring
      // fills with how far along it the hand has actually got.
      if (this.state === "target" && this.ext) {
        const e = this.ext;
        const tp = this.t.relToPx({ x: CENTER.x + Math.cos(e.th) * e.r, y: CENTER.y + Math.sin(e.th) * e.r }, c);
        const pulse = Math.sin(now / 420) * 0.5 + 0.5;
        const rad = e.cap * sw;   // the disc IS the capture radius
        // one solid, unmistakable disc: blue until the hand is on it, green
        // from then on. No guide lines — the target is the whole instruction.
        const there = e.since != null;
        const g = ctx.createRadialGradient(tp.x, tp.y, 2, tp.x, tp.y, rad);
        if (there) { g.addColorStop(0, "#e9f7dc"); g.addColorStop(1, "#7fb86a"); }
        else { g.addColorStop(0, "#dff1ff"); g.addColorStop(1, "#3f8fd6"); }
        ctx.fillStyle = g;
        ctx.shadowColor = there ? "rgba(127,184,106,0.9)" : `rgba(63,143,214,${0.5 + pulse * 0.4})`;
        ctx.shadowBlur = 28 + pulse * 10;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, rad * (there ? 1 : 0.92 + pulse * 0.08), 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, rad, 0, TAU); ctx.stroke();
        if (!e.done) {
          if (e.since == null) {
            // time left to get there, as a thin ring draining clockwise
            const f = Math.max(0, 1 - (now - e.start) / TARGET_REACH_MS);
            ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(tp.x, tp.y, rad + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
          } else {
            // there: the grasp window fills, and the ask is shown one step at a time
            const f = Math.min(1, (now - e.graspAt) / GRASP_MS);
            ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.arc(tp.x, tp.y, rad + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
            // the ask, as one big hand above the target (Oct 2026, by request:
            // bigger), and under it what the camera sees right now, so a
            // squeeze that is not being detected is visible rather than guessed
            const want = e.gstep === "close" ? "✊" : e.gstep === "done" ? "✓" : "✋";
            const seen = this.t.handClosed(this.side);
            const matches = e.gstep === "done" || (e.gstep === "close") === !!seen;
            const big = Math.round(fs(c.height * 0.085));
            ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            ctx.font = `${big}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.fillStyle = e.gstep === "done" ? "#9fc08a" : "#f4ecdd";
            ctx.fillText(want, tp.x, tp.y - rad - 30);
            ctx.font = `800 ${Math.round(fs(c.height * 0.026))}px Nunito, sans-serif`;
            ctx.fillStyle = matches ? "#9fc08a" : "rgba(244,236,221,0.8)";
            ctx.fillText(e.gstep === "done" ? "that's it" : e.gstep === "close" ? "squeeze" : "open", tp.x, tp.y - rad - big - 38);
            ctx.font = `700 ${Math.round(fs(c.height * 0.02))}px Nunito, sans-serif`;
            ctx.fillStyle = seen ? "rgba(232,168,106,0.9)" : "rgba(159,192,138,0.9)";
            ctx.fillText(seen ? "we see: closed" : "we see: open", tp.x, tp.y + rad + 34);
          }
        }
      }
      // targets already answered, kept on screen as a quiet tally: green
      // where they got there, grey where they did not, a ring where the hand
      // worked there too
      if ((this.state === "target" || this.state === "target-move") && this.extremes.length) {
        for (const done of this.extremes) {
          const th = this._extTheta(done.deg);
          const r = Math.min(done.askSW, this._screenR(th, c));
          const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
          ctx.fillStyle = done.reached ? "rgba(127,184,106,0.9)" : "rgba(244,236,221,0.3)";
          ctx.beginPath(); ctx.arc(p.x, p.y, done.reached ? 10 : 7, 0, TAU); ctx.fill();
          if (done.graspOk) {
            ctx.strokeStyle = "rgba(127,184,106,0.9)"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, TAU); ctx.stroke();
          }
        }
      }
      ctx.restore();

      // painted ROM shape (amber, glowing) through envelope points — grows
      // outward from the centre as the patient traces each direction; the
      // soft fill is the "area you have painted so far"
      ctx.save();
      ctx.strokeStyle = "rgba(232,168,106,0.7)"; ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(232,168,106,0.35)"; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i <= BINS; i++) {
        const p = this.t.relToPx(this._shapePoint(i % BINS), c);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(232,168,106,0.14)";
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.state === "settle") {
      const hp = this.t.handPx(this.side, c);
      if (hp) {
        ctx.save();
        ctx.strokeStyle = "rgba(244,236,221,0.7)"; ctx.lineWidth = 4; ctx.setLineDash([8, 9]);
        const fill = this.still ? Math.min(1, (now - this.still) / 1500) : 0;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 64, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,242,194,0.8)";
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 8 + fill * 52, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // the assessed hand, drawn as a real hand: the 21-point skeleton curls
    // and turns sage as it closes — intuitive grasp feedback. Fallback when
    // the hand model has no detection: the classic firefly dot + ring
    const handDrawn = drawHand(ctx, c, this.t, this.side, { fallback: false });
    const hp = this.t.handPx(this.side, c);   // the cursor sits on the wrist: the point that is scored
    const measuring = this.state === "circle" || this.state === "lift" || this.state === "target";
    // ONE circle on the wrist (Sep 2026, by request): while measuring the
    // red cursor below is the only mark, so the amber fallback disc is for
    // the settle and demo screens only
    if (hp && !handDrawn && !measuring) {
      const closed = this.t.handClosed(this.side);
      const fg = ctx.createRadialGradient(hp.x, hp.y, 2, hp.x, hp.y, 16);
      fg.addColorStop(0, "#fff2c2"); fg.addColorStop(1, closed ? "#9fc08a" : "#e8a86a");
      ctx.fillStyle = fg;
      ctx.shadowColor = closed ? "rgba(159,192,138,0.85)" : "rgba(232,168,106,0.7)";
      ctx.shadowBlur = closed ? 30 : 22;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 13, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = closed ? "#9fc08a" : "rgba(244,236,221,0.55)";
      ctx.lineWidth = closed ? 4 : 2.5;
      if (!closed) ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(hp.x, hp.y, closed ? 18 : 26, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // while circling, lifting or reaching, the hand reads as a bright red
    // cursor dot on top of everything — unmistakable over the video mirror
    if (measuring && hp) {
      ctx.save();
      ctx.fillStyle = "#e8635a";
      ctx.shadowColor = "rgba(232,99,90,0.9)"; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    this._drawCoach(ctx, c, now);
  }

  // the posture coach's dock (bottom-left) and the world dim while it cues
  _drawCoach(ctx, c, now) {
    if (this.coach.dimming) {
      ctx.fillStyle = `rgba(18,12,28,${this.coach.dimming})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this.coach.draw(ctx, c.width * 0.06, c.height * 0.96, c.height * 0.18, now);
  }
}

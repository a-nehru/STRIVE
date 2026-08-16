// Assessment — ONE screen, three measurements in one flow:
//
//   DEMO      a figure on screen does the movement first. Words alone ask an
//             older patient to translate "the biggest circle you can" into a
//             motion; showing it removes that step. Nothing is measured.
//   SWEEP     90 seconds of free reach, everywhere they can get to, and the
//             patient is told plainly WHY: wherever they reach is where their
//             targets will appear. The painted shape IS the workspace — its
//             AREA (and, with the ZED's depth, its VOLUME) is the headline
//             number, plus which quadrant is lost, the reading that matters
//             in hemiparesis.
//   HOLDS     six directed reaches to the true arm-length boundary, each held
//             5 s with an open-and-close of the hand. Two questions the sweep
//             cannot answer: can they GET to the edge (a direction passed
//             through in a fast circle is not one a game can put a target in),
//             and can they GRASP once they are there. Both are stored per
//             position, so game allocation can be driven by where this patient
//             can actually work rather than by an overall score.
//
// The backdrop is the real world: the mirrored camera feed with the tracked
// skeleton drawn over the patient's own body, so the assessment reads as a
// mirror, not an abstract game. It opens with a HAND CHOICE: two plain
// Left/Right buttons (#assess-hand-btns) — one press picks the arm, nothing
// to learn. The chosen arm is reported as profile.arm; main.js adopts it as
// the session side.
//
// Measured: envelope[16] (max radial reach per direction, SW units; bins the
// patient never reached stay at a conservative floor and `covered` records the
// measured fraction), armLenSW (the reach the workspace is a fraction OF —
// games rescale by it so "70% of range" means the same thing every session),
// areaSW2 / coverage / quadrants, volumeM3 + depthRangeM when depth exists,
// extremes[6], arcMinDeg/arcMaxDeg (arm elevation vs trunk), path
// jitter (target-size input), loop time (speed input, from total swept angle
// so boundary wobble can't inflate it), and per position {reached, held,
// stability, squeeze, release, graspOk}.
// Reaching is the pass/fail, never grasping: the hold completes on position
// alone so a patient with no hand function still finishes the assessment, and
// the open-and-close is recorded alongside it (`squeeze` = a close was seen,
// `release` = they opened again, `graspOk` = the full cycle). Knowing WHERE a
// patient can grasp, not just whether, is what game allocation needs.
// Graceful-pause rule: tracking loss freezes every timer (trace window, grasp
// timeout, dwell) so a blip never costs the patient anything; a relocation
// (scooting/settling) re-baselines the frame instead of distorting geometry.

import { Coach } from "./coach.js";
import { audio } from "./audio.js";
import { CENTER, drawBody, drawHand, drawVideoMirror } from "./engine.js";

const BINS = 16;
const TAU = Math.PI * 2;
const binOf = th => Math.floor((((th % TAU) + TAU) % TAU) / TAU * BINS);

const REC_R = 0.3;                       // min radius (SW) for a reach to count — low, so small envelopes still record
const ENV_FLOOR = 0.45;                  // conservative floor for unmeasured/tiny bins (games need some space)
const ENV_CAP = 2.6;

// DEMO — every instruction is shown before it is asked for. An older patient
// hearing "draw the biggest circle you can" has to translate words into a
// movement; watching a figure do it removes that step entirely. Nothing is
// measured here and the patient is told to just watch, so a hand that moves
// along with the demo costs nothing.
const DEMO_MS = 9000;                    // two unhurried circles, then the countdown
const DEMO_LOOP = 4200;                  // ms per demo circle — the pace to copy

// SWEEP — free reach, unhurried. Long on purpose: this is the measurement the
// whole session is scaled from, and the patient is told plainly that wherever
// they reach is where their targets will appear.
const SWEEP_MS = 90000;
const SWEEP_STALL_MS = 20000;            // fully covered AND nothing new for this long = done early
const SWEEP_DONE_BINS = BINS - 2;        // "all the way round": 14 of 16 bins.
// Not 16: the bins straight below CENTER sit within REC_R of the resting hand
// and can never register, so demanding them would strand everyone at the cap.

// HOLD POSITIONS — the directed test, run as its own step after the sweep.
// Each one answers two questions the sweep cannot: can the patient GET to the
// edge in this direction, and can they GRASP once they are there. A reach they
// can only pass through is not a reach a game can put a target in, and a
// position they cannot grasp in rules out the grab-and-carry games there.
// Angles are y-up degrees for the assessed arm with 0° = straight OUT to that
// side; _extTheta mirrors them for a left arm, so both arms are asked for the
// same movements rather than the same screen spots.
const EXTREMES = [
  { key: "out",       deg: 0,    cue: "straight out to the side",     confirm: "That's your side edge!" },
  { key: "up-out",    deg: 45,   cue: "up and out, on a diagonal",    confirm: "Lovely, right to the corner." },
  { key: "overhead",  deg: 90,   cue: "as high as you can",           confirm: "The very top!" },
  { key: "up-across", deg: 135,  cue: "up and across your body",      confirm: "Nice, all the way across." },
  { key: "across",    deg: 180,  cue: "across to your other side",    confirm: "Right across. Wonderful." },
  { key: "down-out",  deg: -45,  cue: "down and out, towards the floor", confirm: "And the bottom corner. Beautiful." },
];
const EXT_R = 0.34;                      // capture radius at the edge (SW) — generous
const HOLD_MS = 5000;                    // hold at the position: steady reach, not a touch
const HOLD_GRASP_CUE = 1500;             // into the hold, ask for the open-and-close
const EXT_TIMEOUT = 9000;                // to GET there, counted only once the reach stops growing
const EXT_GIVEUP = 3500;                 // no further progress for this long = move on
const EXT_HARD_STOP = 20000;             // nobody is held on one direction longer than this
const EXT_REACH = 0.95;                  // target sits at 95% of the arm-length boundary
const EXT_SETTLE = 1400;                 // pause between directions

export class Assessment {
  constructor(tracker, canvas, side, coachSens, opts = {}) {
    this.t = tracker;
    this.canvas = canvas;
    this.side = side;                  // provisional until the chooser picks
    this.opts = opts;
    this.coachSens = coachSens;
    this.coach = new Coach(tracker, side, coachSens);
    this.active = false;
  }

  start(onDone) {
    this.onDone = onDone;
    this.active = true;
    // one decision, once: skip the chooser when the hand was already picked
    // (welcome lift or staff drawer) — main.js passes chooseHand: false
    this.state = this.opts.chooseHand === false ? "settle" : "choose";
    this.stateT = performance.now();
    this.still = null;
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
    this.visited = new Array(BINS).fill(0);
    // forward-reach extent per bin, metres (ZED depth only): the third
    // dimension of the workspace, kept per sector because reaching across the
    // body and reaching overhead do not travel the same distance forward
    this.zLo = new Array(BINS).fill(null);
    this.zHi = new Array(BINS).fill(null);
    this.covered = 0;
    this.swept = 0;                            // total angle traced (wrap-safe)
    this.prevTh = null;
    this.lastBin = null;
    this.lastProgress = null;
    this.angMin = 180; this.angMax = 0;
    this.jitterSum = 0; this.jitterN = 0;
    this.smoothR = null;

    this.extIdx = 0;
    this.extremes = [];         // {key, deg, reached, frac, reachSW}
    this.ext = null;            // the direction being reached for right now

    this.armLen = null;         // measured arm length (SW): the REAL reach radius
    this.shoulderRel = null;

    if (this.state === "settle") {
      this._promptSettle();
      this._speak(`${this.side === "left" ? "Left" : "Right"} hand now. Hold it still, comfortably in front of you.`);
    } else {
      this._prompt("Which arm shall we assess?", "Press a button below");
      this._speak("Which arm shall we assess? Press left or right.");
      // buttons only — one decision, one press, nothing to learn
      const wrap = document.getElementById("assess-hand-btns");
      wrap.classList.remove("hidden");
      document.getElementById("btn-hand-left").onclick = () => this._chooseSide("left", performance.now());
      document.getElementById("btn-hand-right").onclick = () => this._chooseSide("right", performance.now());
    }
    this._loop();
  }

  stop() {
    this.active = false;
    this._prompt("");
    document.getElementById("assess-hand-btns").classList.add("hidden");
    try { speechSynthesis.cancel(); } catch {}
  }

  _promptSettle() {
    this._prompt(`Hold your ${this.side} hand still`, "Rest it comfortably in front of you");
  }

  _prompt(main, sub = "") {
    const el = document.getElementById("prompt");
    // the arm being measured is on screen at every step: both arms are done
    // back to back, and "which one am I using?" must never be a guess
    const tag = this.opts.label ? `<small>${this.opts.label}</small>` : "";
    el.innerHTML = main ? main + (sub ? `<small>${sub}</small>` : "") + tag : "";
  }

  _speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;                      // unhurried, for an older audience
      speechSynthesis.speak(u);
    } catch { /* optional */ }
  }

  // a pause must cost the patient nothing: slide every active clock forward
  _shiftTimers(gap) {
    this.stateT += gap;
    if (this.still != null) this.still += gap;
    if (this.lastProgress != null) this.lastProgress += gap;
    if (this.ext) {
      this.ext.start += gap; this.ext.lastGain += gap;
      if (this.ext.since != null) this.ext.since += gap;
      if (this.ext.leftAt != null) this.ext.leftAt += gap;
    }
    this.prev = null;   // don't let the gap read as a huge hand speed
  }

  // ---------- hand choice (first step): Left/Right buttons only ----------
  _chooseSide(side, now) {
    document.getElementById("assess-hand-btns").classList.add("hidden");
    this.side = side;
    this.coach = new Coach(this.t, side, this.coachSens);   // coach watches the chosen arm
    audio.hit();
    this.state = "settle"; this.stateT = now;
    this.still = null; this.prev = null;
    this._promptSettle();
    this._speak(`${side === "left" ? "Left" : "Right"} hand. Hold it still, comfortably in front of you.`);
  }

  _loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const ctx = this.canvas.getContext("2d");
    const c = this.canvas;

    // the real world behind the assessment: mirrored camera feed (soft ink
    // veil) + the tracked skeleton, so the patient sees themselves moving
    if (!drawVideoMirror(ctx, c, this.t)) {
      const g = ctx.createRadialGradient(c.width / 2, c.height * 0.42, 60, c.width / 2, c.height * 0.42, c.height);
      g.addColorStop(0, "#3a3168"); g.addColorStop(0.55, "#20204a"); g.addColorStop(1, "#161636");
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    }
    drawBody(ctx, c, this.t, { framed: !this.coach.dimming, hands: this.state === "choose" });

    // sustained-loss pause only — brief blips never interrupt, and every
    // pause freezes the clocks (graceful-pause rule)
    if (!this.t.trackingOk) this.badSince ??= now;
    else if (this.badSince) { this._shiftTimers(now - this.badSince); this.badSince = null; }
    const paused = this.badSince && now - this.badSince > 1200;
    document.getElementById("paused").classList.toggle("hidden", !paused);
    if (!this.t.trackingOk) return;

    // scooting/settling in the chair: re-baseline instead of letting geometry drift
    if (this.t.relocated()) this.t.setBaseline();

    if (this.state === "choose") return;   // waiting on the Left/Right buttons

    const hand = this.t.palmRel(this.side) || this.t.handRel(this.side);
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
    switch (this.state) {
      case "settle": {
        if (speed < 0.8) {   // tolerant of tremor: "still enough" is still
          if (!this.still) this.still = now;
          if (now - this.still > 1500) {
            this.t.setBaseline();
            // the resting hand IS zero: the circle is measured relative to
            // exactly where the hand rested — no preset center, no travel
            // to a start spot (only a wild-tracking sanity clamp)
            CENTER.x = Math.max(-1.4, Math.min(1.4, hand.x));
            CENTER.y = Math.max(-1.4, Math.min(1.4, hand.y));
            this.state = "grip-open"; this.stateT = now;
            this.calHi = null; this.calLo = null;
            this._prompt("Open your hand wide", "As wide as feels comfortable");
            this._speak("First, open your hand wide. As wide as feels comfortable.");
          }
        } else this.still = null;
        break;
      }
      // squeeze calibration: capture THIS hand's own open and closed curl,
      // so squeeze detection works even for a hand that can't fully close.
      // No hand-model detection? It simply passes through — the pose
      // fallback self-calibrates on its own.
      case "grip-open": {
        const curl = this.t.handCurl(this.side);
        if (curl != null) this.calHi = Math.max(this.calHi ?? curl, curl);
        if (now - this.stateT > 2600) {
          this.state = "grip-close"; this.stateT = now;
          this._prompt("Now squeeze", "Close your hand as much as you can");
          this._speak("Now squeeze. Close your hand as much as you can.");
        }
        break;
      }
      case "grip-close": {
        const curl = this.t.handCurl(this.side);
        if (curl != null) this.calLo = Math.min(this.calLo ?? curl, curl);
        if (now - this.stateT > 2800) {
          if (this.calLo != null && this.calHi != null && this.calHi - this.calLo > 0.08) {
            this.t.setCurlCal(this.side, this.calLo, this.calHi);
            this.curlCalResult = { lo: Math.round(this.calLo * 100) / 100, hi: Math.round(this.calHi * 100) / 100 };
            audio.note(3);
          }
          this.state = "demo"; this.stateT = now;
          this._prompt("Watch how it goes", "You'll do this next — just watch for now");
          this._speak("Lovely. Now watch how this goes. Round and round, as big as you can. Just watch for now.");
        }
        break;
      }
      // DEMO: show the movement, then ask for it. Nothing is recorded here.
      case "demo": {
        if (now - this.stateT > DEMO_MS) {
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
          this.state = "sweep"; this.stateT = now;
          this.lastProgress = now;
          this.halfSaid = false;
          this._prompt("Reach everywhere you can", "Wherever you reach is where your targets will appear");
          this._speak("Now reach everywhere you can, all the way round. Take your time. "
                    + "Wherever you reach is where your targets will appear, so show me all of it.");
        }
        break;
      }
      // SWEEP: the whole circle, painting the workspace. No edge targets here
      // on purpose — chasing a checkpoint mid-circle distorts the shape, and
      // the extremes step measures the edges properly straight afterwards.
      case "sweep": {
        this._recordSample(now, hand, true);
        const covered = this.visited.filter(v => v >= 2).length;
        if (!this.halfSaid && covered >= BINS / 2) {
          this.halfSaid = true;
          this._prompt("Halfway round!", "Keep going — try further out, and higher");
          this._speak("Halfway round. Keep going. Try a little further out, and a little higher.");
        }
        // a long phase needs more than one nudge: reaching further is what
        // this measures, and silence for 90 seconds reads as "that will do"
        if (!this.pushSaid && now - this.stateT > 45000) {
          this.pushSaid = true;
          this._prompt("Lovely", "Now see if you can stretch a little further");
          this._speak("Lovely. Now see if you can stretch a little further than before.");
        }
        // The full 90 s is the default: this is the measurement everything
        // else is scaled from, and rushing it costs the patient range they
        // will then never be given in a game. It ends early only when there
        // is genuinely nothing left to find — the whole circle covered AND no
        // new ground for SWEEP_STALL_MS — so nobody is made to flail at a
        // finished measurement either.
        const t = now - this.stateT;
        const done = covered >= SWEEP_DONE_BINS && now - this.lastProgress > SWEEP_STALL_MS;
        if (done || t > SWEEP_MS) this._finishSweep(now);
        break;
      }
      case "hold-move": {   // brief settle, then present the next position
        if (now - this.stateT > EXT_SETTLE) {
          if (this.extIdx >= EXTREMES.length) { this._finishHolds(now); break; }
          const e = EXTREMES[this.extIdx];
          const th = this._extTheta(e.deg);
          this.ext = { ...e, th, r: this._demoR(th) * EXT_REACH, best: 0,
                       start: now, lastGain: now, since: null, leftAt: null,
                       samples: [], cued: false, squeeze: false, release: false, done: false };
          this.state = "hold"; this.stateT = now;
          this._prompt(`Reach ${this.ext.cue}`, "Get there, then hold it steady");
          this._speak(`Now reach ${this.ext.cue}, and hold it there.`);
        }
        break;
      }
      // HOLD: reach the position, hold it 5 s, and open and close the hand
      // while you are there. Reaching is the pass/fail — a patient with no
      // hand function still completes every position — and the grasp is
      // recorded alongside it, per position, because "can they grasp" is a
      // different question at the top of the range than at the bottom.
      // Progress is scored on the PROJECTION onto the direction, so drifting
      // off-axis can never look like a longer reach.
      case "hold": {
        this._recordSample(now, hand, false);
        const e = this.ext;
        const proj = (hand.x - CENTER.x) * Math.cos(e.th) + (hand.y - CENTER.y) * Math.sin(e.th);
        const frac = e.r > 0 ? proj / e.r : 0;
        if (frac > e.best + 0.02) { e.best = frac; e.lastGain = now; }

        const tx = CENTER.x + Math.cos(e.th) * e.r, ty = CENTER.y + Math.sin(e.th) * e.r;
        const d = Math.hypot(hand.x - tx, hand.y - ty);
        if (d < EXT_R) {
          // sticky hold: a tremor that flicks the hand out for an instant must
          // not restart a 5-second clock the patient is most of the way through
          if (e.since == null) { e.since = now; e.samples = []; }
          e.leftAt = null;
          e.samples.push(d);
          if (!e.cued && now - e.since > HOLD_GRASP_CUE) {
            e.cued = true;
            this._prompt("Hold it there", "Now open and close your hand");
            this._speak("Good. Now open and close your hand.");
          }
          // the open-and-close, watched as a cycle: a close alone could be a
          // resting flexed hand, so the release is what makes it a grasp
          const closed = this.t.handClosed(this.side);
          if (closed && !e.squeeze) { e.squeeze = true; audio.note(4); }
          if (!closed && e.squeeze && !e.release) { e.release = true; audio.note(6); }
          if (now - e.since > HOLD_MS) {
            e.done = true;
            audio.note(5);
            this._speak(e.confirm);
            this._recordHold(now, true);
          }
        } else if (e.since != null) {
          e.leftAt ??= now;
          if (now - e.leftAt > 400) { e.since = null; e.leftAt = null; e.samples = []; }
        }
        if (e.done) break;

        // Moved on kindly: clearly finished trying, or out of time — but a
        // patient still gaining ground is never cut off mid-reach, so the
        // clock only bites once the reach has stopped growing. Never reads as
        // a failure: a short reach is a measurement, not a mistake.
        const t = now - e.start, still = now - e.lastGain;
        if (e.since == null &&
            ((e.best > 0 && still > EXT_GIVEUP) || (t > EXT_TIMEOUT && still > 1200) || t > EXT_HARD_STOP)) {
          audio.note(2);
          this._speak(e.best > 0.6 ? "Close! That's a good stretch." : "That's fine. Let's try the next one.");
          this._recordHold(now, false);
        }
        break;
      }
    }
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
  // arms are asked for the same six movements, not the same six screen spots
  _extTheta(deg) {
    const d = this.side === "right" ? deg : 180 - deg;
    return d * Math.PI / 180;
  }

  // One position's answer. `reached` means the 5 s hold completed; `frac` is
  // how far along the direction they got either way, so a position that was
  // not held is still a number and not just a blank.
  _recordHold(now, reached) {
    const e = this.ext;
    const frac = Math.max(0, Math.min(1.2, e.best));
    const mean = e.samples.length ? e.samples.reduce((a, b) => a + b, 0) / e.samples.length : null;
    this.extremes.push({
      key: e.key, deg: e.deg,
      reached,
      frac: Math.round(frac * 100) / 100,
      reachSW: Math.round(frac * e.r * 1000) / 1000,
      holdMs: e.since != null ? Math.round(now - e.since) : 0,
      stability: mean == null ? 0 : Math.round(Math.max(0, Math.min(1, 1 - mean / EXT_R)) * 100) / 100,
      squeeze: !!e.squeeze,       // a hand-close was seen at this position
      release: !!e.release,       // and they opened again
      graspOk: !!(e.squeeze && e.release),
    });
    this.ext = null;
    this.extIdx++;
    this.state = "hold-move"; this.stateT = now;
  }

  // Every measured sample paints the envelope — reaches and circling both.
  // Jitter (a target-size input) is only scored while circling: a directed
  // stretch changes radius fast on purpose, and that must not read as tremor.
  _recordSample(now, hand, tracing) {
    const dxc = hand.x - CENTER.x, dyc = hand.y - CENTER.y;
    const r = Math.hypot(dxc, dyc);
    if (r <= REC_R) { this.prevTh = null; return; }   // near center the angle is meaningless
    const th = Math.atan2(dyc, dxc);
    const bin = binOf(th);
    const rr = Math.min(r, ENV_CAP);
    if (rr > this.envelope[bin] + 0.02) this.lastProgress = now;   // reach still growing
    this.envelope[bin] = Math.max(this.envelope[bin], rr);
    this.envRaw[bin] = Math.max(this.envRaw[bin], rr);
    // the third dimension, when the camera has one: how far forward and back
    // the hand travelled in THIS sector. A webcam has no depth, so these stay
    // null and the profile reports area without volume rather than guessing.
    const h3 = this.t.hand3(this.side);
    if (h3 && Number.isFinite(h3.z)) {
      this.zLo[bin] = this.zLo[bin] == null ? h3.z : Math.min(this.zLo[bin], h3.z);
      this.zHi[bin] = this.zHi[bin] == null ? h3.z : Math.max(this.zHi[bin], h3.z);
    }
    if (bin !== this.lastBin) {
      if (this.lastBin !== null) {
        if (this.visited[bin] < 2) this.lastProgress = now;        // new ground covered
        this.visited[bin]++;
      }
      this.lastBin = bin;
    }
    // total swept angle (wrap-safe): honest loop counting — wobbling on
    // a bin boundary can't inflate it the way crossing-counts could
    if (this.prevTh != null) {
      let d = th - this.prevTh;
      if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
      this.swept += Math.abs(d);
    }
    this.prevTh = th;
    const a = this.t.armAngle(this.side);
    if (a != null) { this.angMin = Math.min(this.angMin, a); this.angMax = Math.max(this.angMax, a); }
    if (tracing) {
      // jitter: radial noise vs a short smoothed radius
      if (this.smoothR == null) this.smoothR = r;
      this.smoothR += (r - this.smoothR) * 0.15;
      this.jitterSum += Math.abs(r - this.smoothR); this.jitterN++;
    }
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

  _finishSweep(now) {
    // honest coverage: record how much of the circle was actually measured;
    // unreached directions get the conservative floor, never a fabricated reach
    this.covered = this.envelope.filter(v => v > 0).length / BINS;
    for (let i = 0; i < BINS; i++) this.envelope[i] = Math.max(this.envelope[i], ENV_FLOOR);
    const loops = this.swept / TAU;
    this.loopSeconds = Math.min(20, (now - this.stateT) / 1000 / Math.max(1, loops));
    this.state = "hold-move"; this.stateT = now;
    audio.fanfare();
    this._prompt("Beautiful!", "Now a few reaches, holding each one");
    this._speak("Beautiful. Now let's find your edges. A few reaches, one at a time, "
              + "holding each one and opening and closing your hand.");
  }

  _finishHolds(now) {
    this.ext = null;
    audio.fanfare();
    this._finish();
  }

  // ---------- workspace geometry ----------
  // Area of the painted shape: the envelope is a star-shaped polygon around
  // CENTER, so it is the sum of its 16 triangles. SW² — a real cm² needs the
  // patient's shoulder width, which the profile screen applies.
  _areaSW2() {
    const step = TAU / BINS;
    let a = 0;
    for (let i = 0; i < BINS; i++) a += 0.5 * this.envRaw[i] * this.envRaw[(i + 1) % BINS] * Math.sin(step);
    return a;
  }

  // What fraction of the arm's full reachable disc that area covers. The disc
  // is centred on the shoulder and the envelope on CENTER, but the area of
  // the reachable region is π·armLen² wherever it is measured from.
  _coverage(area) {
    if (!this.armLen) return null;
    return Math.max(0, Math.min(1, area / (Math.PI * this.armLen * this.armLen)));
  }

  // Where the workspace is lost, named for the assessed arm (a right arm's
  // "up-out" quadrant is a left arm's mirror image, so raw screen quadrants
  // would compare the two arms wrongly).
  _quadrants(area) {
    if (!this.armLen) return null;
    const step = TAU / BINS, per = BINS / 4;
    const quarter = Math.PI * this.armLen * this.armLen / 4;
    const q = [];
    for (let k = 0; k < 4; k++) {
      let a = 0;
      for (let j = 0; j < per; j++) {
        const i = k * per + j;
        a += 0.5 * this.envRaw[i] * this.envRaw[(i + 1) % BINS] * Math.sin(step);
      }
      q.push(Math.round(Math.min(1, a / quarter) * 100) / 100);
    }
    // screen quadrants 0..3 = up-right, up-left, down-left, down-right
    return this.side === "right"
      ? { upOut: q[0], upAcross: q[1], downAcross: q[2], downOut: q[3] }
      : { upOut: q[1], upAcross: q[0], downAcross: q[3], downOut: q[2] };
  }

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
      // rest-anchored work center (captured at settle) — games load this so
      // targets appear around the same point the envelope was measured from
      center: { x: Math.round(CENTER.x * 1000) / 1000, y: Math.round(CENTER.y * 1000) / 1000 },
      curlCal: this.curlCalResult ?? null,   // this hand's measured open/close curl range
      envelope: this.envelope.map(v => Math.round(v * 1000) / 1000),
      covered: Math.round(this.covered * 100) / 100,
      // the reach the workspace is a fraction OF: GameBase compares it with
      // the arm measured live so range demand means the same thing every
      // session, whatever the chair distance or how the patient is turned
      armLenSW: this.armLen ? Math.round(this.armLen * 1000) / 1000 : null,
      // workspace: area always, volume when the camera has depth
      areaSW2: Math.round(area * 1000) / 1000,
      coverage: cov == null ? null : Math.round(cov * 100) / 100,
      quadrants: this._quadrants(area),
      ...vol,
      shoulderM: this.t.shoulderM ?? null,   // makes the cm/cm² conversion self-contained
      // the directed reach test: could they get to the edge, and how far did
      // they get when they could not
      extremes: this.extremes,
      arcMinDeg: arcMin,
      arcMaxDeg: arcMax,
      arcMeasured,
      jitter: this.jitterN ? this.jitterSum / this.jitterN : 0.1,
      loopSeconds: this.loopSeconds ?? 12,
      // grasp is a VIEW of the held positions, not a separate measurement:
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
  // A person doing the movement, drawn plainly: head, trunk, one still arm,
  // and the assessed arm sweeping a full circle with a trail behind the hand.
  // It is a DEMONSTRATION, not a target — it sits in the middle of the screen
  // over a dimmed backdrop, mirrored to the assessed side so the patient sees
  // the arm they are about to use, on the side they will use it.
  _drawDemo(ctx, c, now) {
    const H = c.height;
    const cx = c.width / 2, cy = H * 0.52;
    const u = H * 0.055;                       // one figure unit
    const mirror = this.side === "right" ? 1 : -1;
    const a = (now - this.stateT) / DEMO_LOOP * TAU;   // the pace to copy
    const R = u * 3.1;                                 // the demo arm's reach

    // dim the world so nothing competes with the demonstration
    ctx.save();
    ctx.fillStyle = "rgba(18,14,34,0.62)";
    ctx.fillRect(0, 0, c.width, c.height);

    const shX = cx + mirror * u * 0.9, shY = cy - u * 1.5;
    const hx = shX + Math.cos(a) * R, hy = shY - Math.sin(a) * R;

    // the traced circle, drawn faintly all the way round so the SHAPE reads
    // even at the instant the hand is only part of the way along it
    ctx.strokeStyle = "rgba(232,168,106,0.28)";
    ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
    ctx.beginPath(); ctx.arc(shX, shY, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    // body
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(244,236,221,0.9)";
    ctx.lineWidth = Math.max(4, u * 0.34);
    ctx.beginPath(); ctx.arc(cx, cy - u * 3.1, u * 0.72, 0, TAU); ctx.stroke();   // head
    ctx.beginPath();
    ctx.moveTo(cx, cy - u * 2.3); ctx.lineTo(cx, cy + u * 1.1);                   // trunk
    ctx.moveTo(cx - u * 0.9, shY); ctx.lineTo(cx + u * 0.9, shY);                 // shoulders
    ctx.moveTo(cx, cy + u * 1.1); ctx.lineTo(cx - u * 0.8, cy + u * 3.2);         // legs
    ctx.moveTo(cx, cy + u * 1.1); ctx.lineTo(cx + u * 0.8, cy + u * 3.2);
    ctx.stroke();
    // the resting arm
    ctx.beginPath();
    ctx.moveTo(cx - mirror * u * 0.9, shY);
    ctx.lineTo(cx - mirror * u * 1.2, cy + u * 0.8);
    ctx.stroke();

    // the working arm: elbow bowed outwards off the shoulder-to-hand line, so
    // it reads as an arm rather than a stick pointing at the hand
    const mx = (shX + hx) / 2, my = (shY + hy) / 2;
    const ex = mx + Math.cos(a) * u * 0.45, ey = my - Math.sin(a) * u * 0.45;
    ctx.strokeStyle = "#e8a86a";
    ctx.lineWidth = Math.max(5, u * 0.4);
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();

    // the hand, with a trail so the direction of travel is unmistakable
    for (let k = 8; k >= 0; k--) {
      const ta = a - k * 0.13;
      const px = shX + Math.cos(ta) * R, py = shY - Math.sin(ta) * R;
      ctx.globalAlpha = 0.14 + (1 - k / 9) * 0.8;
      ctx.fillStyle = k ? "rgba(232,168,106,0.85)" : "#fff6d8";
      ctx.beginPath(); ctx.arc(px, py, k ? u * 0.16 : u * 0.34, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- drawing ----------
  _draw(ctx, c, hand, now) {
    const sw = this.t.pxPerSW(c);

    // the demo owns the screen: the patient is told to watch, so there is
    // nothing else on it to react to
    if (this.state === "demo") { this._drawDemo(ctx, c, now); return; }

    if (this.state !== "settle") {
      // NO preset circle: the start point (where the hand rested) is zero,
      // marked with a soft dot — everything else is drawn by the patient
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
        ctx.font = `800 ${Math.round(c.height * 0.16)}px Nunito, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(left, gp.x, gp.y);
        ctx.restore();
      }

      if (this.state === "sweep") {
        // direction dots hug the patient's OWN traced shape (just outside
        // each bin's measured reach — never a preset ring), lit once drawn
        for (let i = 0; i < BINS; i++) {
          const th = (i + 0.5) / BINS * TAU;
          const r = Math.max(0.6, this.envelope[i] + 0.3);   // sit a touch beyond the reach so far — an invitation outward
          const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
          const done = this.visited[i] >= 2;
          // small on purpose: this is a checklist, not scenery
          ctx.fillStyle = done ? "rgba(232,168,106,0.9)" : "rgba(244,236,221,0.16)";
          ctx.beginPath(); ctx.arc(p.x, p.y, done ? 4 : 2.5, 0, TAU); ctx.fill();
        }
        // A pacer firefly on the boundary — only until the patient is clearly
        // going round on their own. The demo step now teaches the motion, so
        // this is a short reminder rather than the lesson: it used to run to
        // 12 of 16 bins with a seven-blob tail, which is a large moving
        // object on screen for most of the sweep.
        const covered = this.visited.filter(v => v >= 2).length;
        if (covered < 6) {
          const a = now / 3400;                        // a calm, mimicable pace
          const alpha = 0.8 * (1 - covered / 6);
          for (let k = 0; k < 4; k++) {
            const ta = a - k * 0.1;
            const rr = this._demoR(ta);                // ride the REAL arm-length boundary
            const p = this.t.relToPx({ x: CENTER.x + Math.cos(ta) * rr, y: CENTER.y + Math.sin(ta) * rr }, c);
            ctx.globalAlpha = alpha * (1 - k / 4);
            const dg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 12 - k * 1.8);
            dg.addColorStop(0, "#fff6d8"); dg.addColorStop(1, "rgba(159,192,138,0.9)");
            ctx.fillStyle = dg;
            ctx.beginPath(); ctx.arc(p.x, p.y, 10 - k * 1.6, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      // EXTREMES: one direction at a time, so there is never a choice to make.
      // A guide line runs from the work centre to the edge target, and the
      // ring fills with how far along it the hand has actually got — the
      // patient can see their own progress towards the edge.
      if (this.state === "hold" && this.ext) {
        const e = this.ext;
        const tp = this.t.relToPx({ x: CENTER.x + Math.cos(e.th) * e.r, y: CENTER.y + Math.sin(e.th) * e.r }, c);
        const cp = this.t.relToPx(CENTER, c);
        ctx.strokeStyle = "rgba(244,236,221,0.22)"; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
        ctx.setLineDash([]);
        // how far along the line the best reach so far reached
        const bp = this.t.relToPx({
          x: CENTER.x + Math.cos(e.th) * e.r * Math.min(1, Math.max(0, e.best)),
          y: CENTER.y + Math.sin(e.th) * e.r * Math.min(1, Math.max(0, e.best)),
        }, c);
        ctx.strokeStyle = "rgba(232,168,106,0.6)"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(bp.x, bp.y); ctx.stroke();

        const pulse = Math.sin(now / 420) * 0.5 + 0.5;
        const rad = EXT_R * sw;
        if (e.done) {
          const g = ctx.createRadialGradient(tp.x, tp.y, 2, tp.x, tp.y, rad);
          g.addColorStop(0, "#fff6d8"); g.addColorStop(1, "#9fc08a");
          ctx.fillStyle = g;
          ctx.shadowColor = "rgba(159,192,138,0.9)"; ctx.shadowBlur = 30;
          ctx.beginPath(); ctx.arc(tp.x, tp.y, rad * 0.55, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = `rgba(232,168,106,${0.5 + pulse * 0.4})`;
          ctx.lineWidth = 5; ctx.setLineDash([9, 10]);
          ctx.beginPath(); ctx.arc(tp.x, tp.y, rad, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          if (e.since != null) {   // holding: the ring fills over the 5 seconds
            const f = Math.min(1, (now - e.since) / HOLD_MS);
            ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.arc(tp.x, tp.y, rad + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
            // the open-and-close, shown as it happens: an open hand outline
            // that fills solid on the squeeze and gets a tick on the release
            if (e.cued) {
              const gy = tp.y - rad - 26;
              ctx.fillStyle = e.release ? "#9fc08a" : e.squeeze ? "#e8a86a" : "rgba(244,236,221,0.75)";
              ctx.font = `800 ${Math.round(c.height * 0.028)}px Nunito, sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText(e.release ? "✓ open and close" : e.squeeze ? "now open again ✋" : "open and close ✊",
                           tp.x, gy);
            }
          }
        }
      }
      // edges already answered, kept on screen as a quiet tally
      if ((this.state === "hold" || this.state === "hold-move") && this.extremes.length) {
        for (const done of this.extremes) {
          const th = this._extTheta(done.deg);
          const r = this._demoR(th) * EXT_REACH;
          const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
          ctx.fillStyle = done.reached ? "rgba(159,192,138,0.85)" : "rgba(244,236,221,0.28)";
          ctx.beginPath(); ctx.arc(p.x, p.y, done.reached ? 9 : 6, 0, TAU); ctx.fill();
          if (done.graspOk) {   // a ring means the hand worked there too
            ctx.strokeStyle = "rgba(159,192,138,0.8)"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, TAU); ctx.stroke();
          }
        }
      }
      ctx.restore();

      // painted ROM shape (amber, glowing) through envelope points — grows
      // outward from the center as the patient traces each direction; the
      // soft fill is the "area you have painted so far"
      ctx.save();
      ctx.strokeStyle = "rgba(232,168,106,0.7)"; ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(232,168,106,0.35)"; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i <= BINS; i++) {
        const th = (i % BINS) / BINS * TAU + TAU / BINS / 2;
        const r = this.envelope[i % BINS];
        const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(232,168,106,0.14)";
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.state === "settle") {
      const hp = this.t.palmPx(this.side, c);
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
    // (dashed & wide = open, snug sage & solid = squeezing)
    const handDrawn = drawHand(ctx, c, this.t, this.side, { fallback: false });
    const hp = this.t.palmPx(this.side, c);
    if (hp && !handDrawn) {
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

    // while circling or reaching, the hand reads as a bright red cursor dot on
    // top of everything — unmistakable over the video mirror
    if ((this.state === "sweep" || this.state === "hold") && hp) {
      ctx.save();
      ctx.fillStyle = "#e8635a";
      ctx.shadowColor = "rgba(232,99,90,0.9)"; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // coach + world dim
    if (this.coach.dimming) {
      ctx.fillStyle = `rgba(18,12,28,${this.coach.dimming})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this.coach.draw(ctx, c.width * 0.06, c.height * 0.96, c.height * 0.18, now);
  }
}

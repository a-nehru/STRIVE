// Assessment — design option 2a: ONE screen. The patient traces the biggest
// circle they can reach; the painted circle IS the range-of-motion readout
// (horizontal + vertical in one motion). Then 3 "squeeze to grab the light"
// points on the traced circle record grasp + hold-stability.
//
// The backdrop is the real world: the mirrored camera feed with the tracked
// skeleton drawn over the patient's own body, so the assessment reads as a
// mirror, not an abstract game. It opens with a HAND CHOICE: two lights, one
// per side — the patient holds the hand they want to assess on its light
// (squeeze = instant, hold = fallback) and the whole assessment then runs for
// that hand. The chosen arm is reported as profile.arm; main.js adopts it as
// the session side.
//
// Measured: envelope[16] (max radial reach per direction, SW units; bins the
// patient never reached stay at a conservative floor and `covered` records the
// measured fraction), arcMinDeg/arcMaxDeg (arm elevation vs trunk), path
// jitter (target-size input), loop time (speed input, from total swept angle
// so boundary wobble can't inflate it), grasp/stability at 3 positions.
// The grab is dwell-based (hold = ok) so everyone can complete it, but a real
// hand-close (tracker.handClosed) during the hold is recorded as `squeeze` —
// knowing whether the patient CAN grasp feeds game/goal selection.
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
const GRASP_ANGLES = [150, 90, 30];      // degrees, y-up: upper-left, top, upper-right
const GRASP_R = 0.32;                    // capture radius (SW)
const GRASP_HOLD = 1600;                 // ms dwell = "grab" (v1 proxy for hand-close)
const GRASP_TIMEOUT = 12000;             // generous: no one should feel rushed

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
    this.chooseDwell = null;           // { side, since }
    this.choosePrevClosed = { left: false, right: false };

    this.envelope = new Array(BINS).fill(0);   // 0 = not yet measured
    this.visited = new Array(BINS).fill(0);
    this.covered = 0;
    this.swept = 0;                            // total angle traced (wrap-safe)
    this.prevTh = null;
    this.lastBin = null;
    this.lastProgress = null;
    this.angMin = 180; this.angMax = 0;
    this.jitterSum = 0; this.jitterN = 0;
    this.smoothR = null;

    this.graspIdx = 0;
    this.grasp = [];            // {ok, stability, squeeze}
    this.dwell = null;

    if (this.state === "settle") {
      this._promptSettle();
      this._speak(`${this.side === "left" ? "Left" : "Right"} hand today. Hold it still, comfortably in front of you.`);
    } else {
      this._prompt("Which hand shall we assess?", "Hold that hand on its light, and squeeze");
      this._speak("Which hand shall we assess? Hold that hand on its light, and squeeze it.");
    }
    this._loop();
  }

  stop() { this.active = false; this._prompt(""); try { speechSynthesis.cancel(); } catch {} }

  _promptSettle() {
    this._prompt(`Hold your ${this.side} hand still`, "Rest it comfortably in front of you");
  }

  _prompt(main, sub = "") {
    const el = document.getElementById("prompt");
    el.innerHTML = main ? main + (sub ? `<small>${sub}</small>` : "") : "";
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
    if (this.dwell) { this.dwell.start += gap; if (this.dwell.since != null) this.dwell.since += gap; }
    if (this.chooseDwell) this.chooseDwell.since += gap;
    this.prev = null;   // don't let the gap read as a huge hand speed
  }

  // ---------- hand choice (first step) ----------
  // Two lights, one per side of the mirror. The hand that rests on its own
  // light is the hand that gets assessed: a squeeze picks instantly, holding
  // for 1.2 s is the fallback for patients who can't close that hand.
  _chooseTick(ctx, c, now) {
    const CHOOSE_HOLD = 1200;
    const R = Math.max(64, c.height * 0.095);
    const tiles = {   // a little below center: reachable with a small, low lift
      left: { x: c.width * 0.3, y: c.height * 0.52 },
      right: { x: c.width * 0.7, y: c.height * 0.52 },
    };
    let hoverSide = null;
    for (const s of ["left", "right"]) {
      const hp = this.t.handPx(s, c);
      const closed = this.t.handClosed(s);
      const inside = hp && Math.hypot(hp.x - tiles[s].x, hp.y - tiles[s].y) < R * 1.4;   // forgiving capture
      // squeeze edge while on the light = instant choice
      if (inside && closed && !this.choosePrevClosed[s]) { this._chooseSide(s, now); return; }
      this.choosePrevClosed[s] = closed;
      if (inside) hoverSide = s;
    }
    if (hoverSide !== this.chooseDwell?.side) this.chooseDwell = hoverSide ? { side: hoverSide, since: now } : null;
    if (this.chooseDwell && now - this.chooseDwell.since > CHOOSE_HOLD) { this._chooseSide(this.chooseDwell.side, now); return; }

    // draw the two lights + labels + dwell progress
    for (const s of ["left", "right"]) {
      const t = tiles[s];
      const hover = this.chooseDwell?.side === s;
      const pulse = Math.sin(now / 500 + (s === "left" ? 0 : 1.5)) * 0.5 + 0.5;
      const og = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, R);
      og.addColorStop(0, "#fff6d8"); og.addColorStop(1, hover ? "#9fc08a" : "#e8a86a");
      ctx.fillStyle = og;
      ctx.globalAlpha = hover ? 0.95 : 0.7 + pulse * 0.15;
      ctx.shadowColor = hover ? "rgba(159,192,138,0.9)" : "rgba(232,168,106,0.7)";
      ctx.shadowBlur = 26 + pulse * 10;
      ctx.beginPath(); ctx.arc(t.x, t.y, R * 0.55, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(244,236,221,0.6)"; ctx.lineWidth = 3; ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (hover) {
        const f = Math.min(1, (now - this.chooseDwell.since) / CHOOSE_HOLD);
        ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(t.x, t.y, R + 10, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
      ctx.fillStyle = "rgba(244,236,221,0.9)";
      ctx.font = `800 ${Math.round(c.height * 0.034)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(s === "left" ? "Left hand" : "Right hand", t.x, t.y + R + 46);
    }
  }

  _chooseSide(side, now) {
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

    if (this.state === "choose") { this._chooseTick(ctx, c, now); return; }

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
            this.state = "countdown"; this.stateT = now;
            this.count = null;
            this._prompt("Get ready…", "The circle starts in 3… 2… 1…");
            this._speak("Get ready.");
          }
        } else this.still = null;
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
          this.state = "trace"; this.stateT = now;
          this.lastProgress = now;
          this.halfSaid = false;
          this._prompt("Draw the biggest circle you can", "Follow the glowing firefly, big and slow");
          this._speak("Now draw the biggest circle you can. Follow the glowing firefly. Big and slow.");
        }
        break;
      }
      case "trace": {
        const dxc = hand.x - CENTER.x, dyc = hand.y - CENTER.y;
        const r = Math.hypot(dxc, dyc);
        const th = Math.atan2(dyc, dxc);
        if (r > REC_R) {
          const bin = binOf(th);
          const rr = Math.min(r, ENV_CAP);
          if (rr > this.envelope[bin] + 0.02) this.lastProgress = now;   // reach still growing
          this.envelope[bin] = Math.max(this.envelope[bin], rr);
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
          // jitter: radial noise vs a short smoothed radius
          if (this.smoothR == null) this.smoothR = r;
          this.smoothR += (r - this.smoothR) * 0.15;
          this.jitterSum += Math.abs(r - this.smoothR); this.jitterN++;
        } else {
          this.prevTh = null;   // near center the angle is meaningless — don't sweep across it
        }
        const covered = this.visited.filter(v => v >= 2).length;
        if (!this.halfSaid && covered >= BINS / 2) {
          this.halfSaid = true;
          this._prompt("Halfway there!", "Keep circling, nice and big");
          this._speak("Halfway there. Keep circling.");
        }
        // done when the circle is covered — or when reach stops growing for a
        // while (a partial circle IS a complete measurement of a limited
        // range; nobody should circle against a wall for the full 40 s)
        const t = now - this.stateT;
        const full = covered >= BINS - 2 && t > 10000;
        const stalled = t > 12000 && now - this.lastProgress > 6000;
        if (full || stalled || t > 40000) this._finishTrace(now);
        break;
      }
      case "grasp-move": {   // brief pause, then present the next grasp orb
        if (now - this.stateT > 1600) {
          if (this.graspIdx >= GRASP_ANGLES.length) { this._finish(); break; }
          this.orb = this._orbPos(this.graspIdx);
          this.dwell = { since: null, samples: [], start: now };
          this.state = "grasp"; this.stateT = now;
          this._prompt(this.graspIdx ? "Reach to the next light and hold" : "Reach to the light and hold",
            "Squeeze gently if you can, like catching a firefly");
        }
        break;
      }
      case "grasp": {
        const d = Math.hypot(hand.x - this.orb.x, hand.y - this.orb.y);
        if (d < GRASP_R) {
          if (!this.dwell.since) this.dwell.since = now;
          this.dwell.samples.push(d);
          // a real squeeze on the light: acknowledged once, recorded in the profile
          if (this.t.handClosed(this.side) && !this.dwell.squeezed) {
            this.dwell.squeezed = true;
            audio.note(4);
          }
          if (now - this.dwell.since > GRASP_HOLD) {
            const mean = this.dwell.samples.reduce((s, v) => s + v, 0) / this.dwell.samples.length;
            this.grasp.push({ ok: true, stability: Math.max(0, Math.min(1, 1 - mean / GRASP_R)), squeeze: !!this.dwell.squeezed });
            this.graspIdx++;
            audio.hit();
            this.state = "grasp-move"; this.stateT = now;
          }
        } else {
          this.dwell.since = null;
          this.dwell.samples = [];   // stability scores the successful hold only, not earlier approaches
        }
        if (now - this.dwell.start > GRASP_TIMEOUT) {
          this.grasp.push({ ok: false, stability: 0, squeeze: !!this.dwell.squeezed });
          this.graspIdx++;
          audio.miss();
          if (this.graspIdx < GRASP_ANGLES.length) this._speak("That's okay. On to the next light.");
          this.state = "grasp-move"; this.stateT = now;
        }
        break;
      }
    }
  }

  _finishTrace(now) {
    // honest coverage: record how much of the circle was actually measured;
    // unreached directions get the conservative floor, never a fabricated reach
    this.covered = this.envelope.filter(v => v > 0).length / BINS;
    for (let i = 0; i < BINS; i++) this.envelope[i] = Math.max(this.envelope[i], ENV_FLOOR);
    const loops = this.swept / TAU;
    this.loopSeconds = Math.min(20, (now - this.stateT) / 1000 / Math.max(1, loops));
    this.state = "grasp-move"; this.stateT = now;
    audio.fanfare();
    this._prompt("Beautiful!", "Now squeeze to grab the light");
    this._speak("Beautiful! Now hold your hand on each light, and squeeze it if you can.");
  }

  _orbPos(i) {
    const deg = GRASP_ANGLES[i];
    const th = deg * Math.PI / 180;
    const r = this.envelope[binOf(th)] * 0.85;
    return { x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r, deg };
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
    const profile = {
      arm: this.side,
      date: new Date().toISOString(),
      // rest-anchored work center (captured at settle) — games load this so
      // targets appear around the same point the envelope was measured from
      center: { x: Math.round(CENTER.x * 1000) / 1000, y: Math.round(CENTER.y * 1000) / 1000 },
      envelope: this.envelope.map(v => Math.round(v * 1000) / 1000),
      covered: Math.round(this.covered * 100) / 100,
      arcMinDeg: arcMin,
      arcMaxDeg: arcMax,
      arcMeasured,
      jitter: this.jitterN ? this.jitterSum / this.jitterN : 0.1,
      loopSeconds: this.loopSeconds ?? 12,
      grasp: this.grasp.map((g, i) => ({ deg: GRASP_ANGLES[i], ok: g.ok, stability: Math.round(g.stability * 100) / 100, squeeze: !!g.squeeze })),
      compEvents: this.coach.events,
    };
    this.onDone(profile);
  }

  // ---------- drawing ----------
  _draw(ctx, c, hand, now) {
    const sw = this.t.pxPerSW(c);

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

      if (this.state === "trace") {
        // direction dots hug the patient's OWN traced shape (just outside
        // each bin's measured reach — never a preset ring), lit once drawn
        for (let i = 0; i < BINS; i++) {
          const th = (i + 0.5) / BINS * TAU;
          const r = Math.max(0.5, this.envelope[i] + 0.22);
          const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
          const done = this.visited[i] >= 2;
          ctx.fillStyle = done ? "#e8a86a" : "rgba(244,236,221,0.25)";
          if (done) { ctx.shadowColor = "rgba(232,168,106,.8)"; ctx.shadowBlur = 10; }
          ctx.beginPath(); ctx.arc(p.x, p.y, done ? 6 : 4, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
        }
        // demo firefly circling the start point — "go around, like me" —
        // fades once they're going (shows the motion, not a required size)
        const covered = this.visited.filter(v => v >= 2).length;
        if (covered < 6) {
          const a = now / 1400;                        // slow orbit
          const alpha = covered < 3 ? 0.9 : 0.9 * (1 - (covered - 3) / 3);
          for (let k = 0; k < 5; k++) {                // trail
            const ta = a - k * 0.09;
            const p = this.t.relToPx({ x: CENTER.x + Math.cos(ta) * 0.8, y: CENTER.y + Math.sin(ta) * 0.8 }, c);
            ctx.globalAlpha = alpha * (1 - k / 5);
            const dg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 14 - k * 2);
            dg.addColorStop(0, "#fff6d8"); dg.addColorStop(1, "rgba(159,192,138,0.9)");
            ctx.fillStyle = dg;
            ctx.beginPath(); ctx.arc(p.x, p.y, 12 - k * 2, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();

      // painted ROM shape (amber, glowing) through envelope points — grows
      // outward from the center as the patient traces each direction
      ctx.save();
      ctx.strokeStyle = "rgba(232,168,106,0.75)"; ctx.lineWidth = 7;
      ctx.shadowColor = "rgba(232,168,106,0.6)"; ctx.shadowBlur = 26;
      ctx.beginPath();
      for (let i = 0; i <= BINS; i++) {
        const th = (i % BINS) / BINS * TAU + TAU / BINS / 2;
        const r = this.envelope[i % BINS];
        const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r }, c);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.stroke();
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

    if (this.state === "grasp" && this.orb) {
      const p = this.t.relToPx(this.orb, c);
      const pulse = Math.sin(now / 300) * 0.5 + 0.5;
      const squeezed = this.dwell?.squeezed;
      // orb — caught (squeezed) orbs glow sage and stronger
      const og = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 26);
      og.addColorStop(0, "#fff6d8"); og.addColorStop(1, squeezed ? "#9fc08a" : "#e8a86a");
      ctx.fillStyle = og;
      ctx.shadowColor = squeezed ? "rgba(159,192,138,0.9)" : "rgba(232,168,106,0.8)";
      ctx.shadowBlur = (squeezed ? 34 : 24) + pulse * 14;
      ctx.beginPath(); ctx.arc(p.x, p.y, squeezed ? 14 : 17, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      // gentle squeeze hint while the hand is on the light but still open
      if (this.dwell?.since && !squeezed) {
        ctx.fillStyle = `rgba(244,236,221,${0.5 + pulse * 0.4})`;
        ctx.font = `800 ${Math.round(c.height * 0.026)}px Nunito, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("squeeze if you can ✊", p.x, p.y - GRASP_R * sw - 18);
      }
      // squeeze ring + dwell progress
      ctx.strokeStyle = "rgba(244,236,221,0.75)"; ctx.lineWidth = 4; ctx.setLineDash([7, 8]);
      ctx.beginPath(); ctx.arc(p.x, p.y, GRASP_R * sw, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (this.dwell?.since) {
        const f = Math.min(1, (now - this.dwell.since) / GRASP_HOLD);
        ctx.strokeStyle = "#e8a86a"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, GRASP_R * sw + 10, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }

    // the assessed hand, drawn as a real hand: the 21-point skeleton curls
    // and turns sage as it closes — intuitive grasp feedback. Fallback when
    // the hand model has no detection: the classic firefly dot + ring
    // (dashed & wide = open, snug sage & solid = squeezing)
    const handDrawn = drawHand(ctx, c, this.t, this.side, { fallback: false });
    const hp = this.t.handPx(this.side, c);
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
    } else if (hp && handDrawn) {
      // small cream point marking the exact interaction spot
      ctx.fillStyle = "rgba(255,242,194,0.85)";
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 5, 0, TAU); ctx.fill();
    }

    // coach + world dim
    if (this.coach.dimming) {
      ctx.fillStyle = `rgba(18,12,28,${this.coach.dimming})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this.coach.draw(ctx, c.width * 0.06, c.height * 0.96, c.height * 0.18, now);
  }
}

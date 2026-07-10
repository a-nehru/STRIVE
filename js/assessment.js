// Assessment — design option 2a: ONE screen. The patient traces the biggest
// circle they can reach; the painted circle IS the range-of-motion readout
// (horizontal + vertical in one motion). Then 3 "squeeze to grab the light"
// points on the traced circle record grasp + hold-stability.
//
// Measured: envelope[16] (max radial reach per direction, SW units),
// arcMinDeg/arcMaxDeg (arm elevation vs trunk), path jitter (target-size
// input), loop time (speed input), grasp/stability at 3 positions.
// The grab is dwell-based (hold = ok) so everyone can complete it, but a real
// hand-close (tracker.handClosed) during the hold is recorded as `squeeze` —
// knowing whether the patient CAN grasp feeds game/goal selection.

import { Coach } from "./coach.js";
import { audio } from "./audio.js";
import { CENTER } from "./engine.js";

const BINS = 16;
const TAU = Math.PI * 2;
const binOf = th => Math.floor((((th % TAU) + TAU) % TAU) / TAU * BINS);

const GRASP_ANGLES = [150, 90, 30];      // degrees, y-up: upper-left, top, upper-right
const GRASP_R = 0.32;                    // capture radius (SW)
const GRASP_HOLD = 1600;                 // ms dwell = "grab" (v1 proxy for hand-close)
const GRASP_TIMEOUT = 9000;

export class Assessment {
  constructor(tracker, canvas, side, coachSens) {
    this.t = tracker;
    this.canvas = canvas;
    this.side = side;
    this.coach = new Coach(tracker, side, coachSens);
    this.active = false;
  }

  start(onDone) {
    this.onDone = onDone;
    this.active = true;
    this.state = "settle";
    this.stateT = performance.now();
    this.still = null;
    this.prev = null;

    this.envelope = new Array(BINS).fill(0.45);
    this.visited = new Array(BINS).fill(0);
    this.loops = 0;
    this.lastBin = null;
    this.angMin = 180, this.angMax = 0;
    this.jitterSum = 0; this.jitterN = 0;
    this.traceStart = null;

    this.graspIdx = 0;
    this.grasp = [];            // {ok, stability}
    this.dwell = null;

    this._prompt("Hold your hand still", "Rest it comfortably in front of you");
    this._speak("Hold your hand still, comfortably in front of you.");
    this._loop();
  }

  stop() { this.active = false; this._prompt(""); try { speechSynthesis.cancel(); } catch {} }

  _prompt(main, sub = "") {
    const el = document.getElementById("prompt");
    el.innerHTML = main ? main + (sub ? `<small>${sub}</small>` : "") : "";
  }

  _speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch { /* optional */ }
  }

  _loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const ctx = this.canvas.getContext("2d");
    const c = this.canvas;

    // dusk assessment backdrop (2a)
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.42, 60, c.width / 2, c.height * 0.42, c.height);
    g.addColorStop(0, "#3a3168"); g.addColorStop(0.55, "#20204a"); g.addColorStop(1, "#161636");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);

    // sustained-loss pause only — brief blips never interrupt
    if (!this.t.trackingOk) this.badSince ??= now; else this.badSince = null;
    const paused = this.badSince && now - this.badSince > 1200;
    document.getElementById("paused").classList.toggle("hidden", !paused);
    if (!this.t.trackingOk) return;

    const hand = this.t.handRel(this.side);
    if (!hand) return;

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
        if (speed < 0.6) {
          if (!this.still) this.still = now;
          if (now - this.still > 1500) {
            this.t.setBaseline();
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
          this.traceStart = now;
          this.state = "trace"; this.stateT = now;
          this.halfSaid = false;
          this._prompt("Draw the biggest circle you can", "Follow the glowing firefly, big and slow");
          this._speak("Now draw the biggest circle you can. Follow the glowing firefly. Big and slow.");
        }
        break;
      }
      case "trace": {
        const r = Math.hypot(hand.x - CENTER.x, hand.y - CENTER.y);
        const th = Math.atan2(hand.y - CENTER.y, hand.x - CENTER.x);
        const bin = binOf(th);
        if (r > 0.5) {
          this.envelope[bin] = Math.max(this.envelope[bin], Math.min(r, 2.6));
          if (this.lastBin !== null && bin !== this.lastBin) {
            this.visited[bin]++;
            if (bin === 0 && this.lastBin === BINS - 1) this.loops++;
            if (bin === BINS - 1 && this.lastBin === 0) this.loops++;
          }
          this.lastBin = bin;
          const a = this.t.armAngle(this.side);
          if (a != null) { this.angMin = Math.min(this.angMin, a); this.angMax = Math.max(this.angMax, a); }
          // jitter: radial noise vs a short smoothed radius
          if (this.smoothR == null) this.smoothR = r;
          this.smoothR += (r - this.smoothR) * 0.15;
          this.jitterSum += Math.abs(r - this.smoothR); this.jitterN++;
        }
        const covered = this.visited.filter(v => v >= 2).length;
        if (!this.halfSaid && covered >= BINS / 2) {
          this.halfSaid = true;
          this._prompt("Halfway there!", "Keep circling, nice and big");
          this._speak("Halfway there. Keep circling.");
        }
        const done = (covered >= BINS - 2 && now - this.stateT > 10000) || now - this.stateT > 40000;
        if (done) {
          this.loopSeconds = Math.min(20, (now - this.stateT) / 1000 / Math.max(1, this.loops));
          this.state = "grasp-move"; this.stateT = now;
          audio.fanfare();
          this._prompt("Beautiful!", "Now squeeze to grab the light");
          this._speak("Beautiful! Now hold your hand on each light, and squeeze it if you can.");
        }
        break;
      }
      case "grasp-move": {   // brief pause, then present the next grasp orb
        if (now - this.stateT > 1600) {
          if (this.graspIdx >= GRASP_ANGLES.length) { this._finish(); break; }
          this.orb = this._orbPos(this.graspIdx);
          this.dwell = { since: null, samples: [], start: now };
          this.state = "grasp"; this.stateT = now;
          this._prompt("Reach to the light and hold", "Squeeze gently if you can, like catching a firefly");
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
        }
        if (now - this.dwell.start > GRASP_TIMEOUT) {
          this.grasp.push({ ok: false, stability: 0, squeeze: !!this.dwell.squeezed });
          this.graspIdx++;
          audio.miss();
          this.state = "grasp-move"; this.stateT = now;
        }
        break;
      }
    }
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
    const profile = {
      arm: this.side,
      date: new Date().toISOString(),
      envelope: this.envelope.map(v => Math.round(v * 1000) / 1000),
      arcMinDeg: Math.round(this.angMin),
      arcMaxDeg: Math.round(this.angMax),
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

    // ambient stars
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const [fx, fy, ph] of [[0.1, 0.12, 0], [0.86, 0.16, 1.3], [0.5, 0.07, 2.1], [0.7, 0.2, 3]]) {
      ctx.globalAlpha = 0.25 + 0.5 * (Math.sin(now / 900 + ph) * 0.5 + 0.5);
      ctx.beginPath(); ctx.arc(c.width * fx, c.height * fy, 2.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.state !== "settle") {
      // guide circle (dashed)
      const guide = 1.1;
      ctx.save();
      ctx.strokeStyle = "rgba(244,236,221,0.28)"; ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
      const gp = this.t.relToPx(CENTER, c);
      ctx.beginPath(); ctx.arc(gp.x, gp.y, guide * sw, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);

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
        // progress dots: one per direction, lit once that direction is drawn
        for (let i = 0; i < BINS; i++) {
          const th = (i + 0.5) / BINS * TAU;
          const p = this.t.relToPx({ x: CENTER.x + Math.cos(th) * guide * 1.16, y: CENTER.y + Math.sin(th) * guide * 1.16 }, c);
          const done = this.visited[i] >= 2;
          ctx.fillStyle = done ? "#e8a86a" : "rgba(244,236,221,0.25)";
          if (done) { ctx.shadowColor = "rgba(232,168,106,.8)"; ctx.shadowBlur = 10; }
          ctx.beginPath(); ctx.arc(p.x, p.y, done ? 6 : 4, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
        }
        // demo firefly orbiting the guide — "follow me" — fades once they're going
        const covered = this.visited.filter(v => v >= 2).length;
        if (covered < 6) {
          const a = now / 1400;                        // slow orbit
          const alpha = covered < 3 ? 0.9 : 0.9 * (1 - (covered - 3) / 3);
          for (let k = 0; k < 5; k++) {                // trail
            const ta = a - k * 0.09;
            const p = this.t.relToPx({ x: CENTER.x + Math.cos(ta) * guide, y: CENTER.y + Math.sin(ta) * guide }, c);
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

      // painted ROM shape (amber, glowing) through envelope points
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

    // firefly hand cursor + always-on grasp feedback: the ring closes with
    // the hand (dashed & wide = open, snug sage & solid = squeezing)
    const hp = this.t.handPx(this.side, c);
    if (hp) {
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

    // coach + world dim
    if (this.coach.dimming) {
      ctx.fillStyle = `rgba(18,12,28,${this.coach.dimming})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this.coach.draw(ctx, c.width * 0.06, c.height * 0.96, c.height * 0.18, now);
  }
}

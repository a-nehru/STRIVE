// Shared game engine: round loop, envelope-bounded ON-SCREEN target
// sampling, hit registration, arm + hand rendering (KP feedback), Posture
// Coach overlay, graceful pause, story intros, diegetic no-HUD rendering.

import { Coach } from "./coach.js";
import { audio } from "./audio.js";

export const TAU = Math.PI * 2;
// Reach center: all envelope-based targets (and the assessment circle) are
// centered here — a little above the shoulder midpoint so the play space
// sits higher on screen. SW units, y up.
export const CENTER = { x: 0, y: 0.25 };
const BINS = 16;
const MARGIN = 80;                 // px: no target may spawn closer to an edge
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

// Live mirror body: the tracked upper body + both hands drawn so the patient
// SEES what the camera sees. Shared by the welcome screen and the assessment.
// opts.framed  — sage skeleton (settled) vs amber (still adjusting)
// opts.hands   — pass false to skip the glowing hand dots (for screens that
//                draw their own hand cursor)
export function drawBody(ctx, c, t, opts = {}) {
  const p = t.pts;
  if (!p?.shL || !p?.shR) return;
  const framed = opts.framed !== false;
  const P = pt => t._videoToPx(pt.x, pt.y, c);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = framed ? "rgba(159,192,138,0.55)" : "rgba(232,168,106,0.5)";
  ctx.lineWidth = 6;
  const seg = (a, b) => { const A = P(a), B = P(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); };
  seg(p.shL, p.shR);
  const shMid = { x: (p.shL.x + p.shR.x) / 2, y: (p.shL.y + p.shR.y) / 2 };
  if (p.hipL && p.hipR) {
    seg(p.hipL, p.hipR);
    seg(shMid, { x: (p.hipL.x + p.hipR.x) / 2, y: (p.hipL.y + p.hipR.y) / 2 });
  }
  for (const s of ["left", "right"]) {
    const sh = t.shoulder(s), el = t.elbow(s), wr = t.wrist(s);
    if (sh && el?.ok) {
      seg(sh, el);
      if (wr?.ok) {
        seg(el, wr);
        const pm = t.palm(s);
        if (pm) seg(wr, pm);
      }
    }
  }
  const ear = p.earL && p.earR ? { x: (p.earL.x + p.earR.x) / 2, y: (p.earL.y + p.earR.y) / 2 } : (p.earL || p.earR);
  if (ear) {
    const E = P(ear);
    ctx.beginPath(); ctx.arc(E.x, E.y, 0.34 * t.pxPerSW(c), 0, TAU); ctx.stroke();
  }
  // hands: real hand skeletons (glow-dot fallback inside drawHand)
  if (opts.hands !== false) {
    for (const s of ["left", "right"]) drawHand(ctx, c, t, s);
  }
  ctx.restore();
}

// Real hand rendering: the 21-point hand skeleton drawn over the patient's
// actual hand — translucent palm web + five finger chains that visibly curl
// and close as the hand does (amber open, sage closed). When the hand model
// has no fresh detection, falls back to the classic glow dot + open/closed
// ring (or nothing, with opts.fallback === false, for callers that draw
// their own cursor). Returns true if a hand skeleton was drawn.
const FINGER_CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
export function drawHand(ctx, c, t, side, opts = {}) {
  const pts = t._handPts(side);
  const closed = t.handClosed(side);
  if (pts) {
    const P = pts.map(p => t._videoToPx(p.x, p.y, c));
    const palmW = Math.hypot(P[5].x - P[17].x, P[5].y - P[17].y);
    const lw = Math.max(3, palmW * 0.16);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.shadowColor = closed ? "rgba(159,192,138,0.8)" : "rgba(232,168,106,0.7)";
    ctx.shadowBlur = 14;
    // palm web
    ctx.fillStyle = closed ? "rgba(159,192,138,0.3)" : "rgba(232,168,106,0.26)";
    ctx.beginPath();
    [0, 1, 5, 9, 13, 17].forEach((idx, i) => { const p = P[idx]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fill();
    // fingers
    ctx.strokeStyle = closed ? "#9fc08a" : "#e8a86a";
    ctx.lineWidth = lw;
    for (const chain of FINGER_CHAINS) {
      ctx.beginPath();
      chain.forEach((idx, i) => { const p = P[idx]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.stroke();
    }
    // fingertips
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff6d8";
    for (const idx of [4, 8, 12, 16, 20]) {
      ctx.beginPath(); ctx.arc(P[idx].x, P[idx].y, lw * 0.55, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return true;
  }
  if (opts.fallback === false) return false;
  const hp = t.handPx(side, c);
  if (!hp) return false;
  ctx.save();
  ctx.shadowColor = closed ? "rgba(159,192,138,0.9)" : "rgba(232,168,106,0.8)";
  ctx.shadowBlur = closed ? 26 : 18;
  ctx.fillStyle = closed ? "#9fc08a" : "#e8a86a";
  ctx.beginPath(); ctx.arc(hp.x, hp.y, 11, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = closed ? "#9fc08a" : "rgba(244,236,221,0.55)";
  ctx.lineWidth = closed ? 4 : 2.5;
  if (!closed) ctx.setLineDash([6, 7]);
  ctx.beginPath(); ctx.arc(hp.x, hp.y, closed ? 16 : 24, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  return false;
}

// Mirrored camera feed, cover-fit to the canvas exactly like _videoToPx maps
// coordinates, so overlays land on the real body. Returns false if the video
// has no frame yet (caller keeps its painted backdrop as the fallback).
export function drawVideoMirror(ctx, c, t, tint = 0.38) {
  const v = t.video;
  if (!v || v.readyState < 2) return false;
  const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
  const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
  const dx = (c.width - dw) / 2, dy = (c.height - dh) / 2;
  ctx.save();
  ctx.translate(c.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(v, dx, dy, dw, dh);   // centered, so the mirrored x equals dx
  ctx.restore();
  // soft ink veil so the glowing overlays stay readable on the video
  if (tint > 0) { ctx.fillStyle = `rgba(22,22,54,${tint})`; ctx.fillRect(0, 0, c.width, c.height); }
  return true;
}

export class GameBase {
  constructor(tracker, canvas, side, profile, params, opts = {}) {
    this.t = tracker;
    this.canvas = canvas;
    this.side = side;
    this.profile = profile;
    this.params = params;
    this.opts = opts;
    this.cursorSkin = opts.cursor || "firefly";
    this.coach = new Coach(tracker, side, opts.coachSens || "gentle");
    this.roundSeconds = 40;
    this.active = false;
  }

  start(onEnd) {
    this.onEnd = onEnd;
    this.active = true;
    this.t.setBaseline();
    this.startT = performance.now();
    this.pausedMs = 0;
    this.pauseSince = null;
    this.badSince = null;
    this.stats = { hits: 0, misses: 0, missFar: 0, stars: 0, reachFracs: [], lanterns: 0, creatures: [] };
    this.particles = [];
    // therapist-voice feedback state
    this.fb = { missStreak: 0, hitStreak: 0, lastSpeak: 0, saidReach: false };
    this.setup?.();
    this._loop();
  }

  stop() { this.active = false; this._prompt(""); try { speechSynthesis.cancel(); } catch {} }

  elapsed(now) { return (now - this.startT - this.pausedMs) / 1000; }

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

  // story intro (round 1): shows + speaks, and delays play by its length
  tellStory(story) {
    if (!this.opts.tellStory || !story) return 0;
    this._prompt(story.title, story.text);
    this._speak(story.title + ". " + story.text);
    setTimeout(() => { if (this.active) this._prompt(""); }, 5200);
    return 5200;
  }

  _loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const ctx = this.canvas.getContext("2d");
    const c = this.canvas;

    this.drawBg(ctx, c, now);

    // graceful pause — only after the problem persists >1.2 s
    const bad = !this.t.trackingOk || this.t.relocated();
    if (bad) this.badSince ??= now; else this.badSince = null;
    const shouldPause = this.badSince && now - this.badSince > 1200;
    document.getElementById("paused").classList.toggle("hidden", !shouldPause);
    if (shouldPause) {
      if (!this.pauseSince) this.pauseSince = now;
      if (this.t.trackingOk && now - this.pauseSince > 2000) {
        this.t.setBaseline();
        this.pausedMs += now - this.pauseSince;
        this.pauseSince = null;
        this.badSince = null;
      }
      return;
    }
    if (this.pauseSince) { this.pausedMs += now - this.pauseSince; this.pauseSince = null; }

    if (this.elapsed(now) >= this.roundSeconds) { this._end(); return; }

    this.coach.update(now);
    this._feedbackTick(now);
    const dt = Math.min(50, now - (this._lastT || now));
    this._lastT = now;

    this.update?.(now, dt);
    this.draw?.(ctx, c, now);
    this._drawParticles(ctx);
    this._drawArmAndCursor(ctx, c, now);

    if (this.coach.dimming) {
      ctx.fillStyle = `rgba(18,12,28,${this.coach.dimming})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this.coach.draw(ctx, c.width * 0.06, c.height * 0.96, c.height * 0.18, now);
  }

  _end() {
    this.active = false;
    this._prompt("");
    document.getElementById("cue").classList.add("hidden");
    audio.fanfare();
    const total = this.stats.hits + this.stats.misses;
    const fr = this.stats.reachFracs;
    this.onEnd({
      date: new Date().toISOString(),
      game: this.id,
      arm: this.side,
      params: { ...this.params },
      hits: this.stats.hits, misses: this.stats.misses, missFar: this.stats.missFar,
      hitRate: total ? this.stats.hits / total : 0,
      stars: this.stats.stars,
      meanReachFrac: fr.length ? fr.reduce((s, v) => s + v, 0) / fr.length : 0,
      lanterns: this.stats.lanterns,
      creatures: this.stats.creatures,
      compEvents: this.coach.events,
      ...(this.extra?.() || {}),          // per-game metrics (e.g. path efficiency)
    });
  }

  // ---- envelope + ON-SCREEN sampling --------------------------------
  envAt(theta) {
    const e = this.profile.envelope;
    const f = (((theta % TAU) + TAU) % TAU) / TAU * BINS;
    const i = Math.floor(f) % BINS, j = (i + 1) % BINS;
    const w = f - Math.floor(f);
    return e[i] * (1 - w) + e[j] * w;
  }

  // Sample a target inside rangeScale × envelope AND inside the visible
  // canvas (screen calibration: a reachable point that would land off-screen
  // is pulled back inside the margins, then converted back to body coords so
  // it stays body-anchored).
  samplePos(opts = {}) {
    let best = null;
    for (let tries = 0; tries < 10; tries++) {
      const th = opts.theta ?? (opts.upperHalf ? Math.random() * Math.PI : Math.random() * TAU);
      const env = this.envAt(th);
      const frac = 0.45 + Math.random() * 0.55;
      const r = frac * this.params.rangeScale * env;
      const pos = { x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r, isFar: r > 0.7 * this.params.rangeScale * env, reachFrac: r / env };
      const px = this.toPx(pos);
      const c = this.canvas;
      const inside = px.x > MARGIN && px.x < c.width - MARGIN && px.y > MARGIN && px.y < c.height - MARGIN;
      best = pos;
      if (inside || opts.theta != null) { if (inside) return pos; break; }
    }
    // clamp into view, keep it body-anchored
    const c = this.canvas;
    const px = this.toPx(best);
    px.x = Math.min(Math.max(px.x, MARGIN), c.width - MARGIN);
    px.y = Math.min(Math.max(px.y, MARGIN), c.height - MARGIN);
    const rel = this.t.pxToRel(px, c);
    return { ...rel, isFar: best.isFar, reachFrac: best.reachFrac };
  }

  hit(target, noteStep = null) {
    this.stats.hits++;
    this.stats.stars += 10;
    if (target?.reachFrac) this.stats.reachFracs.push(target.reachFrac);
    noteStep != null ? audio.note(noteStep) : audio.hit();
    // therapist voice: streak praise at milestones
    this.fb.hitStreak++; this.fb.missStreak = 0;
    if ([5, 10, 15].includes(this.fb.hitStreak)) {
      this.say(pickOne([
        `${this.fb.hitStreak} in a row, wonderful!`,
        `${this.fb.hitStreak} straight! Beautiful control.`,
        "You're on a roll, keep that rhythm.",
      ]));
    }
  }
  miss(target, silent = false) {
    this.stats.misses++;
    if (target?.isFar) this.stats.missFar++;
    if (!silent) audio.miss();     // silent: in Melody Tiles the missing note IS the feedback
    this.fb.missStreak++; this.fb.hitStreak = 0;
  }

  // ---- therapist voice: short spoken guidance driven by performance ----
  say(text) {
    const now = performance.now();
    if (now - this.fb.lastSpeak < 4500) return;
    this.fb.lastSpeak = now;
    this._speak(text);
    const el = document.getElementById("cue");
    if (el && this.coach.state !== "alert") {
      el.textContent = text;
      el.classList.remove("hidden");
      clearTimeout(this._cueTimer);
      this._cueTimer = setTimeout(() => { if (this.coach.state !== "alert") el.classList.add("hidden"); }, 3200);
    }
  }
  _feedbackTick(now) {
    if (this.coach.state !== "idle") return;
    if (now - this.fb.lastSpeak < 10000) return;
    if (this.fb.missStreak >= 3) {
      this.fb.missStreak = 0;
      this.say(this.tips?.miss || "No rush. Watch it come, and start your reach early.");
      return;
    }
    // arc encouragement once per round when playing safe & shallow
    if (!this.fb.saidReach && this.stats.hits >= 5 && this.stats.reachFracs.length >= 5) {
      const mean = this.stats.reachFracs.reduce((s, v) => s + v, 0) / this.stats.reachFracs.length;
      if (mean < 0.58) {
        this.fb.saidReach = true;
        this.say("Lovely! Now try stretching a little farther out.");
      }
    }
  }

  handNear(pos, radius) {
    const h = this.t.handRel(this.side);
    if (!h) return false;
    return Math.hypot(h.x - pos.x, h.y - pos.y) < radius;
  }
  // per-side variant for bimanual games
  handNearFor(side, pos, radius) {
    const h = this.t.handRel(side);
    if (!h) return false;
    return Math.hypot(h.x - pos.x, h.y - pos.y) < radius;
  }
  handDist(pos) {
    const h = this.t.handRel(this.side);
    return h ? Math.hypot(h.x - pos.x, h.y - pos.y) : Infinity;
  }

  // ---- drawing helpers ----------------------------------------------
  toPx(rel) { return this.t.relToPx(rel, this.canvas); }
  sw() { return this.t.pxPerSW(this.canvas); }

  glow(ctx, x, y, r, inner, outer, blur = 20) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.shadowColor = outer; ctx.shadowBlur = blur;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }

  burst(pos, color = "#ffd98a") {
    const p = this.toPx(pos);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, s = 2 + Math.random() * 4;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
    }
  }
  _drawParticles(ctx) {
    this.particles = this.particles.filter(pt => pt.life > 0);
    for (const pt of this.particles) {
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.06; pt.life -= 0.028;
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // KP feedback: the patient's own arm, always visible — a soft luminous
  // line shoulder → elbow → wrist, ending in the cursor with its capture
  // radius shown as a faint ring (so they always see what "touching" means).
  _drawArmAndCursor(ctx, c, now) {
    const sides = this.opts.bothArms ? ["left", "right"] : [this.side];
    for (const side of sides) {
      const primary = side === this.side;
      const sh = this.t.shoulder(side), el = this.t.elbow(side), wr = this.t.wrist(side);
      const P = pt => this.t._videoToPx(pt.x, pt.y, c);
      if (sh && el?.ok && wr?.ok) {
        const ps = P(sh), pe = P(el), pw = P(wr);
        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = primary ? "rgba(244,236,221,0.28)" : "rgba(200,230,235,0.22)";
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
        ctx.strokeStyle = primary ? "rgba(255,246,216,0.5)" : "rgba(200,230,235,0.4)";
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
        ctx.restore();
      }
      // the real hand: 21-point skeleton that curls and closes live (KP
      // feedback made literal); when unavailable, a wrist→palm line + disc
      const handDrawn = drawHand(ctx, c, this.t, side, { fallback: false });
      if (!handDrawn) {
        const pm = this.t.palm(side);
        if (wr?.ok && pm) {
          const pw = P(wr), pp = P(pm);
          ctx.save();
          ctx.lineCap = "round";
          ctx.strokeStyle = primary ? "rgba(255,246,216,0.5)" : "rgba(200,230,235,0.4)";
          ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.moveTo(pw.x, pw.y); ctx.lineTo(pp.x, pp.y); ctx.stroke();
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(pp.x, pp.y, 7, 0, TAU);
          if (this.t.handClosed(side)) { ctx.fillStyle = primary ? "#e8a86a" : "#9fc0c8"; ctx.fill(); }
          else ctx.stroke();
          ctx.restore();
        }
      }
      const hp = this.t.handPx(side, c);
      if (!hp) continue;
      ctx.strokeStyle = primary ? "rgba(244,236,221,0.22)" : "rgba(200,230,235,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, this.params.radius * this.sw(), 0, TAU); ctx.stroke();
      if (this.cursorSkin === "comet" && primary) {
        ctx.save();
        const grad = ctx.createLinearGradient(hp.x - 70, hp.y + 24, hp.x, hp.y);
        grad.addColorStop(0, "rgba(200,230,235,0)"); grad.addColorStop(1, "rgba(200,230,235,0.7)");
        ctx.strokeStyle = grad; ctx.lineWidth = 8; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(hp.x - 70, hp.y + 24); ctx.lineTo(hp.x, hp.y); ctx.stroke();
        ctx.restore();
        this.glow(ctx, hp.x, hp.y, 12, "#ffffff", "#9fc0c8", 20);
      } else {
        this.glow(ctx, hp.x, hp.y, primary ? 13 : 11, "#fff2c2", primary ? "#e8a86a" : "#9fc0c8", 22);
      }
    }
  }

  drawTimerWhisper(ctx, c, now) {
    const f = 1 - this.elapsed(now) / this.roundSeconds;
    ctx.strokeStyle = "rgba(244,236,221,0.22)";
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c.width * (0.5 - 0.4 * f), 10);
    ctx.lineTo(c.width * (0.5 + 0.4 * f), 10);
    ctx.stroke();
  }
}

// Shared game engine: round loop, envelope-bounded ON-SCREEN target
// sampling, hit registration, arm + hand rendering (KP feedback), Posture
// Coach overlay, graceful pause, story intros, diegetic no-HUD rendering.

import { Coach } from "./coach.js";
import { audio } from "./audio.js";
import { A11Y, speakQueued, voiceBusy, hushVoice } from "./a11y.js";
import { coachLine, coachSpeak } from "./coachlines.js";
import { C, accentOf, alpha } from "./theme.js";
import { Sparks, dockRect, drawVeil, drawClock } from "./ui.js";

export const TAU = Math.PI * 2;
// Reach center: all envelope-based targets (and the assessment circle) are
// centered here. SW units, y up. ADAPTIVE per patient: the assessment
// captures the resting hand position at settle (limited-motion friendly —
// nobody has to reach a preset spot) and stores it as profile.center;
// GameBase.start() loads it so games and assessment always agree. The
// values below are only the default for profiles that predate this.
export const CENTER = { x: 0, y: 0.25 };
const CENTER_DEFAULT = { x: 0, y: 0.25 };
const BINS = 16;
const MARGIN = 80;                 // px: no target may spawn closer to an edge

// Live mirror body: the tracked upper body + both hands drawn so the patient
// SEES what the camera sees. Shared by the welcome screen and the assessment.
// opts.framed  — sage skeleton (settled) vs amber (still adjusting)
// opts.hands   — pass false to skip the glowing hand dots (for screens that
//                draw their own hand cursor)
// opts.map     — optional px→px affine remap (mini-mirror: body drawn at a
//                fixed size in a fixed frame, regardless of camera distance);
//                opts.scale is the same remap's scale factor, for radii
export function drawBody(ctx, c, t, opts = {}) {
  const p = t.pts;
  if (!p?.shL || !p?.shR) return;
  const framed = opts.framed !== false;
  const k = opts.scale ?? 1;
  const P = opts.map
    ? pt => opts.map(t._videoToPx(pt.x, pt.y, c))
    : pt => t._videoToPx(pt.x, pt.y, c);
  ctx.save();
  ctx.lineCap = "round";
  // light lines on the camera picture: cream when framed, the coach yellow
  // and DASHED while still adjusting (the pattern, not the hue, says which)
  ctx.strokeStyle = framed ? "rgba(246,242,234,0.7)" : "rgba(242,179,61,0.8)";
  // amber and sage are a red-green confusion pair (near-identical luminance),
  // so the framing state also changes line pattern: dashed = still adjusting
  if (!framed) ctx.setLineDash([12, 9]);
  ctx.lineWidth = Math.max(3, 6 * k);
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
  // no circle over the face (30 Oct 2026, by request): it covered the
  // patient's own face on every camera view and said nothing
  // hands: real hand skeletons (glow-dot fallback inside drawHand)
  if (opts.hands !== false) {
    for (const s of ["left", "right"]) drawHand(ctx, c, t, s, { map: opts.map, scale: k, surface: opts.surface || "night" });
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
// opts.tint (optional): one colour for this hand whatever its state, for a
// game that tells its hands apart by colour (the Lantern, Oct 2026); closed
// is then shown by a fuller web and a thicker stroke instead of the sage
const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
// The patient's own picture in the empty slot a recording leaves for them
// (the warm-up and the assessment, Oct 2026): a white-edged box like the
// demonstrator's, `inside` drawing the cropped camera and skeleton clipped
// to it, and a small "You" tag with the tracking light (sage tracked, amber
// not) in its top corner.
export function drawPersonSlot(ctx, panel, trackingOk, fontPx, inside) {
  const r = Math.round(Math.min(panel.w, panel.h) * 0.06);
  ctx.save();
  ctx.fillStyle = "#1A1E33";
  ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, r); ctx.fill();
  ctx.clip();
  inside();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = Math.max(3, Math.round(panel.w * 0.012));
  ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, r); ctx.stroke();
  ctx.font = `800 ${fontPx}px Nunito, sans-serif`;
  const tw = ctx.measureText("You").width, ph = Math.round(fontPx * 1.5);
  const px = panel.x + r * 0.6, py = panel.y + r * 0.6, pw = tw + ph * 1.3;
  // the tag is a white pill like the rest of the chrome; the light is the
  // success green when tracked and a hollow attention ring when not, so the
  // two states differ in shape as well as hue
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, ph / 2); ctx.fill();
  if (trackingOk) { ctx.fillStyle = "#2E7D4F"; ctx.beginPath(); ctx.arc(px + ph * 0.5, py + ph / 2, ph * 0.2, 0, TAU); ctx.fill(); }
  else { ctx.strokeStyle = "#A65600"; ctx.lineWidth = Math.max(2, ph * 0.08); ctx.beginPath(); ctx.arc(px + ph * 0.5, py + ph / 2, ph * 0.17, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = "#1E2235"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("You", px + ph * 0.85, py + ph / 2 + 1);
  ctx.restore();
}

export function drawHand(ctx, c, t, side, opts = {}) {
  const pts = t._handPts(side);
  const closed = t.handClosed(side);
  const k = opts.scale ?? 1;
  // ONE HAND SCHEME (30 Oct 2026, by request: the hand looked different on
  // every screen): the thin skeleton everywhere, light when open and green
  // when closed; on a light (Day) surface the same in ink and a deeper green.
  // opts.surface "day" | "night" (default "night": the camera picture).
  // opts.tint is only for the old bold style still used by disabled games.
  const day = opts.surface === "day";
  const tint = opts.thin === false ? (opts.tint || null) : null;
  const stroke = tint || (closed ? (day ? "#2E7D4F" : "#7FD49A") : (day ? "#1E2235" : "#F6F2EA"));
  const web = tint ? hexA(tint, closed ? 0.42 : 0.24) : (closed ? "rgba(127,212,154,0.3)" : "rgba(246,242,234,0.22)");
  if (pts) {
    const P = pts.map(p => {
      const px = t._videoToPx(p.x, p.y, c);
      return opts.map ? opts.map(px) : px;
    });
    const palmW = Math.hypot(P[5].x - P[17].x, P[5].y - P[17].y);
    // THIN (30 Oct 2026, by request: in the assessment the hand read as a
    // glowing square, a filled palm and fingers 16% of the palm wide, made
    // bigger again by the zoom): fine finger lines, a dot at every joint,
    // the palm only outlined, a faint edge. The default since the same day
    // (one scheme everywhere); thin: false keeps the old bold hand.
    if (opts.thin !== false) {
      const tl = Math.max(1.5, palmW * 0.05);
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = day ? "rgba(255,255,255,0.7)" : "rgba(20,23,42,0.55)"; ctx.shadowBlur = 3;
      ctx.strokeStyle = stroke; ctx.lineWidth = tl;
      ctx.beginPath();
      [0, 1, 5, 9, 13, 17].forEach((idx, i) => { const p = P[idx]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
      for (const chain of FINGER_CHAINS) {
        ctx.beginPath();
        chain.forEach((idx, i) => { const p = P[idx]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = stroke;
      for (let i = 0; i < 21; i++) { ctx.beginPath(); ctx.arc(P[i].x, P[i].y, tl * 0.95, 0, TAU); ctx.fill(); }
      // fingertips: white on the camera picture, the line colour on paper
      ctx.fillStyle = day ? stroke : "#fff";
      for (const idx of [4, 8, 12, 16, 20]) { ctx.beginPath(); ctx.arc(P[idx].x, P[idx].y, tl * 1.25, 0, TAU); ctx.fill(); }
      ctx.restore();
      return true;
    }
    const lw = Math.max(3, palmW * (tint && closed ? 0.2 : 0.16));
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.shadowColor = tint ? hexA(tint, 0.6) : closed ? "rgba(127,212,154,0.7)" : "rgba(246,242,234,0.5)";
    ctx.shadowBlur = 10;
    // palm web
    ctx.fillStyle = web;
    ctx.beginPath();
    [0, 1, 5, 9, 13, 17].forEach((idx, i) => { const p = P[idx]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fill();
    // fingers
    ctx.strokeStyle = stroke;
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
  let hp = t.palmPx(side, c);
  if (!hp) return false;
  if (opts.map) hp = opts.map(hp);
  ctx.save();
  ctx.shadowColor = tint ? hexA(tint, 0.85) : closed ? "rgba(159,192,138,0.9)" : "rgba(232,168,106,0.8)";
  ctx.shadowBlur = closed ? 26 : 18;
  ctx.fillStyle = stroke;
  ctx.beginPath(); ctx.arc(hp.x, hp.y, 11 * k, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = closed ? "#9fc08a" : "rgba(244,236,221,0.55)";
  ctx.lineWidth = closed ? 4 : 2.5;
  if (!closed) ctx.setLineDash([6, 7]);
  ctx.beginPath(); ctx.arc(hp.x, hp.y, (closed ? 16 : 24) * k, 0, TAU); ctx.stroke();
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
  // a stereo webcam (ZED on plain UVC) sends left eye | right eye in one
  // frame; show only the left eye, or the patient sees the room twice
  const sw = t.srcW ?? v.videoWidth, sh = t.srcH ?? v.videoHeight;
  const scale = Math.max(c.width / sw, c.height / sh);
  const dw = sw * scale, dh = sh * scale;
  const dx = (c.width - dw) / 2, dy = (c.height - dh) / 2;
  ctx.save();
  ctx.translate(c.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(v, 0, 0, sw, sh, dx, dy, dw, dh);   // centered: mirrored x equals dx
  ctx.restore();
  // soft ink veil so the glowing overlays stay readable on the video
  if (tint > 0) { ctx.fillStyle = `rgba(20,23,42,${tint})`; ctx.fillRect(0, 0, c.width, c.height); }
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

  // THE LOOK (30 Oct 2026): every game has one accent colour (theme.js) and
  // draws on the Day surface (warm white) unless it sets `surface = "night"`
  // (the Lantern: lights only read in the dark)
  get accent() { return accentOf(this.id); }
  get surface() { return "day"; }
  get night() { return this.surface === "night"; }

  start(onEnd) {
    this.onEnd = onEnd;
    this.active = true;
    // adopt this patient's rest-anchored work center (see CENTER above)
    CENTER.x = this.profile.center?.x ?? CENTER_DEFAULT.x;
    CENTER.y = this.profile.center?.y ?? CENTER_DEFAULT.y;
    // and their measured squeeze range from the assessment's calibration step
    if (this.profile.curlCal) this.t.setCurlCal(this.side, this.profile.curlCal.lo, this.profile.curlCal.hi);
    // Range demand in the patient's own arm lengths. The envelope is stored in
    // shoulder-width units, but SW is a PROJECTED width: turning the trunk or
    // sitting at a different distance shifts it by a few percent, and an arm
    // is not made of shoulder widths anyway. armLenSW records how long this
    // arm measured at assessment time; against the arm measured right now it
    // gives the factor that keeps "70% of range" meaning 70% of THIS reach,
    // this session. Clamped hard: this corrects drift, it never rescales the
    // clinical envelope out from under the therapist.
    this.armScale = 1;
    const refArm = this.profile.armLenSW, liveArm = this.t.armLenSW(this.side);
    if (refArm > 0.4 && liveArm > 0.4) {
      this.armScale = Math.max(0.8, Math.min(1.25, liveArm / refArm));
    }
    this.t.setBaseline();
    this.startT = performance.now();
    this.pausedMs = 0;
    this.pauseSince = null;
    this.badSince = null;
    this.stats = { hits: 0, misses: 0, missFar: 0, stars: 0, reachFracs: [], lanterns: 0, creatures: [] };
    this.particles = [];
    // therapist-voice feedback state
    this.fb = { missStreak: 0, hitStreak: 0, lastSpeak: 0, saidReach: false };
    // pause on Space or P (Oct 2026, by request): the clock stops with the
    // game, and the same key resumes it
    this.userPaused = false;
    this._pauseKey = e => {
      if (!this.active || e.repeat) return;
      if (e.code === "Space" || e.key === "p" || e.key === "P") { e.preventDefault(); this.togglePause(); }
    };
    addEventListener("keydown", this._pauseKey);
    this.setup?.();
    this._loop();
  }
  togglePause() {
    const now = performance.now();
    if (!this.userPaused) { this.userPaused = true; this._userPauseAt = now; }
    else { this.userPaused = false; this.pausedMs += now - this._userPauseAt; this._lastT = null; }
  }

  stop() {
    this.active = false; this._prompt("");
    if (this._pauseKey) { removeEventListener("keydown", this._pauseKey); this._pauseKey = null; }
    hushVoice();
  }

  elapsed(now) { return (now - this.startT - this.pausedMs) / 1000; }

  _prompt(main, sub = "") {
    const el = document.getElementById("prompt");
    el.innerHTML = main ? main + (sub ? `<small>${sub}</small>` : "") : "";
  }

  // caption defaults to false in-game: say() shows #cue and tellStory shows
  // #prompt, so the text is already on screen — no double display.
  // A game's line waits for the one being said rather than cutting it off.
  _speak(text, caption = false) { speakQueued(text, 0.9, caption); }

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

    if (this.userPaused) {
      drawVeil(ctx, c, "Paused", "Press Space or P to carry on");
      return;
    }

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
    // `armBehind` puts the arm and cursor UNDER the game layer: in a busy
    // scene the skeleton crossing the play area adds lines that compete with
    // the thing the patient is meant to watch
    if (this.armBehind) this._drawArmAndCursor(ctx, c, now);
    this.draw?.(ctx, c, now);
    this._drawParticles(ctx);
    if (!this.armBehind) this._drawArmAndCursor(ctx, c, now);

    if (this.coach.dimming) {
      ctx.fillStyle = `rgba(20,23,42,${this.coach.dimming})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    // the coach's dock: a card in the bottom corner away from the trained arm
    // (ui.dockRect), unless the game puts it elsewhere
    const dock = this.coachDock?.(c) || dockRect(c, this.side);
    this.coach.draw(ctx, dock.x, dock.y, dock.h, now, { surface: this.surface });
  }

  _end() {
    this.active = false;
    this._prompt("");
    document.getElementById("cue").classList.add("hidden");
    // per-game metrics, read once (extra() may close an open trial)
    const ex = this.extra?.() || {};
    // the fanfare only when it went well: a match won, a flight finished, a
    // level up, the flag reached, a best; otherwise a calm close
    audio.roundEnd(ex.matchWon === true || ex.completed === true || ex.verdict === "up" || ex.targetHit === true || ex.recordBeat === true);
    const total = this.stats.hits + this.stats.misses;
    const fr = this.stats.reachFracs;
    this.onEnd({
      date: new Date().toISOString(),
      game: this.id,
      arm: this.side,
      seconds: Math.round(this.elapsed(performance.now()) * 10) / 10,   // play time, pauses excluded
      params: { ...this.params },
      hits: this.stats.hits, misses: this.stats.misses, missFar: this.stats.missFar,
      hitRate: total ? this.stats.hits / total : 0,
      stars: this.stats.stars,
      meanReachFrac: fr.length ? fr.reduce((s, v) => s + v, 0) / fr.length : 0,
      lanterns: this.stats.lanterns,
      creatures: this.stats.creatures,
      compEvents: this.coach.events,
      compStats: this.coach.summary?.(),  // per slip: largest score, seconds over the threshold
      ...ex,                              // per-game metrics (e.g. path efficiency)
    });
  }

  // ---- envelope + ON-SCREEN sampling --------------------------------
  envAt(theta) {
    const e = this.profile.envelope;
    const n = e.length;   // 16 in older profiles, 32 from Sep 2026 — never assume
    const f = (((theta % TAU) + TAU) % TAU) / TAU * n;
    const i = Math.floor(f) % n, j = (i + 1) % n;
    const w = f - Math.floor(f);
    // armScale keeps the envelope tied to the arm rather than to the
    // projected shoulder width it was recorded against (see start())
    return (e[i] * (1 - w) + e[j] * w) * (this.armScale ?? 1);
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
      // visual-field policy (hemianopia ≠ hemiparesis: the reach envelope
      // covers the arm; this covers sight). comfort = keep targets where the
      // patient can see them; scan = deliberately train the cut side.
      if (A11Y.field !== "none" && opts.theta == null && tries < 8) {
        const onCutSide = A11Y.field === "left" ? pos.x < -0.05 : pos.x > 0.05;
        if (A11Y.fieldMode === "comfort" ? onCutSide : (!onCutSide && Math.random() < 0.6)) continue;
      }
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
    this.fb.lastEvent = performance.now();
    this.fb.hitStreak++; this.fb.missStreak = 0;
    // (a game that sets quietPraise says its own few lines and skips these)
    if (!this.quietPraise && [5, 10, 15].includes(this.fb.hitStreak)) {
      // the chosen coach's words (coachlines.js): a between-rep line, so the
      // relay may write it when it is up; say() keeps its own throttle
      coachSpeak("rep_result", { streak: this.fb.hitStreak, hits: this.stats.hits },
        { game: this.id, say: t => this.say(t) });
    }
  }
  miss(target, silent = false) {
    this.fb.lastEvent = performance.now();
    if (A11Y.practice) return;     // practice mode: nothing counts against you
    this.stats.misses++;
    if (target?.isFar) this.stats.missFar++;
    if (!silent) audio.miss();     // silent: in Melody Tiles the missing note IS the feedback
    this.fb.missStreak++; this.fb.hitStreak = 0;
  }

  // Sticky dwell (tremor accommodation): progress accumulates while the hand
  // is on the target and survives brief exits (≤450 ms) instead of resetting
  // — the literature-endorsed alternative to simply lengthening dwell time.
  // Returns 0..1; caller acts at 1 and then clearDwell(key).
  dwellProgress(key, inside, now, needMs = A11Y.dwellMs) {
    this._dwells ??= {};
    let d = this._dwells[key];
    if (inside) {
      if (!d) d = this._dwells[key] = { acc: 0, last: now, out: null };
      if (d.out == null) d.acc += now - d.last;
      d.out = null; d.last = now;
    } else if (d) {
      d.out ??= now; d.last = now;
      if (now - d.out > 450) { delete this._dwells[key]; return 0; }
    } else return 0;
    return Math.min(1, d.acc / needMs);
  }
  clearDwell(key) { if (this._dwells) delete this._dwells[key]; }

  // ---- therapist voice: short spoken guidance driven by performance ----
  // Optional feedback is dropped while another line is being said;
  // `important` (a point announced, the end of a game) waits its turn instead.
  say(text, important = false) {
    const now = performance.now();
    if (!important && (now - this.fb.lastSpeak < 4500 || voiceBusy())) return;
    this.fb.lastSpeak = now;
    this._speak(text);
    const el = document.getElementById("cue");
    if (el && this.coach.state !== "alert") {
      el.textContent = text;
      el.classList.remove("hidden", "posture");
      clearTimeout(this._cueTimer);
      this._cueTimer = setTimeout(() => { if (this.coach.state !== "alert") el.classList.add("hidden"); }, 3200);
    }
  }
  _feedbackTick(now) {
    if (this.coach.state !== "idle") return;
    if (now - this.fb.lastSpeak < 10000) return;
    // objective reminder (cognitive accessibility): with no HUD, restate the
    // goal after ~12 s of no interaction so the patient is never lost
    if (this.tips?.objective && now - (this.fb.lastEvent ?? this.startT) > 12000) {
      this.fb.lastEvent = now;
      this.say(this.tips.objective);
      return;
    }
    if (this.fb.missStreak >= 3) {
      this.fb.missStreak = 0;
      // a game's own miss tip is kept (it names the game's goal); the generic
      // one is the coach's
      this.say(this.tips?.miss || coachLine("miss"));
      return;
    }
    // arc encouragement once per round when playing safe & shallow
    if (!this.fb.saidReach && this.stats.hits >= 5 && this.stats.reachFracs.length >= 5) {
      const mean = this.stats.reachFracs.reduce((s, v) => s + v, 0) / this.stats.reachFracs.length;
      if (mean < 0.58) {
        this.fb.saidReach = true;
        this.say(coachLine("reach_more"));
      }
    }
  }

  // all interaction happens at the PALM CENTER (wrist fallback) — you touch
  // things with your hand, not your wrist
  handNear(pos, radius) {
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    if (!h) return false;
    return Math.hypot(h.x - pos.x, h.y - pos.y) < radius;
  }
  // per-side variant for bimanual games
  handNearFor(side, pos, radius) {
    const h = this.t.palmRel(side) || this.t.handRel(side);
    if (!h) return false;
    return Math.hypot(h.x - pos.x, h.y - pos.y) < radius;
  }
  handDist(pos) {
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
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
    if (A11Y.contrast) {           // high-contrast mode: dark rim on every glow
      ctx.strokeStyle = "rgba(12,12,32,0.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, TAU); ctx.stroke();
    }
  }

  // the hit pop's sparks (ui.Sparks: Kenney star particles tinted, time-
  // based, a plain ring under calm motion); the game's accent unless a
  // colour is given
  burst(pos, color = null) { const p = this.toPx(pos); this.burstPx(p.x, p.y, color); }
  burstPx(x, y, color = null, n = 8) {
    this.sparks ??= new Sparks();
    this.sparks.burst(x, y, color || this.accent.solid, n, 90 * this.canvas.height / 1080);
  }
  _drawParticles(ctx) {
    this.sparks?.draw(ctx);
    // the old per-frame particles, still pushed by games not yet moved to
    // burstPx (the disabled ones)
    if (!this.particles?.length) return;
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
        const armCol = this.night ? "rgba(246,242,234," : "rgba(30,34,53,";
        ctx.strokeStyle = armCol + (primary ? "0.16)" : "0.1)");
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
        ctx.strokeStyle = armCol + (primary ? "0.5)" : "0.3)");
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
        ctx.restore();
      }
      // the real hand: 21-point skeleton that curls and closes live (KP
      // feedback made literal); when unavailable, a wrist→palm line + disc
      const handDrawn = drawHand(ctx, c, this.t, side, { fallback: false, surface: this.surface });
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
      const hp = this.t.palmPx(side, c);   // cursor rides the palm center
      if (!hp) continue;
      ctx.strokeStyle = alpha(this.night ? C.onNight : this.accent.solid, primary ? 0.35 : 0.22);
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
        this.glow(ctx, hp.x, hp.y, primary ? 13 : 11, "#ffffff", primary ? this.accent.solid : "#9fc0c8", 16);
      }
    }
  }

  // the round's clock, the shared one (ui.drawClock), in the top-centre band
  drawTimerWhisper(ctx, c, now) {
    const used = this.elapsed(now) / this.roundSeconds;
    drawClock(ctx, c, used, { accent: this.accent, surface: this.surface, secondsLeft: this.roundSeconds - this.elapsed(now) });
  }
}

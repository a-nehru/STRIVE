// THE CAST (30 Oct 2026, by request): shape characters drawn in code, a
// simple body with a face. Bringing one to life is a hop that squashes when it
// lands, a slow breath, a blink every few seconds and pupils that look at the
// ball, the hand or the next target; a mood changes only the eyes, brows and
// mouth. No image files, so any colour and any size, and all of it ours to
// publish. Style after Kenney's Shape Characters (CC0); the mood board's
// #cast section is the same code in SVG.
import { C, calm } from "./theme.js";

function superellipse(a, b, n) {
  let d = "";
  for (let i = 0; i <= 120; i++) {
    const t = i / 120 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
}
// body paths in a 200-unit box about (0, 0); the body's foot is at y = 84,
// its shadow at y = 104
const SHAPES = {
  squircle: { d: superellipse(84, 84, 4.2), eyeY: -10, eyeX: 30 },
  circle:   { d: "M-82 0a82 82 0 1 0 164 0a82 82 0 1 0 -164 0Z", eyeY: -10, eyeX: 28 },
  pill:     { d: "M-62 -30 A62 62 0 0 1 62 -30 L62 30 A62 62 0 0 1 -62 30 Z", eyeY: -18, eyeX: 24 },
  rhombus:  { d: "M-14 -80 Q0 -94 14 -80 L80 -14 Q94 0 80 14 L14 80 Q0 94 -14 80 L-80 14 Q-94 0 -80 -14 Z", eyeY: -6, eyeX: 24 },
  blob:     { d: superellipse(86, 78, 2.7), eyeY: -8, eyeX: 30 },
};
const PATHS = {};
function pathOf(shape) { return PATHS[shape] ??= new Path2D((SHAPES[shape] || SHAPES.squircle).d); }

export const MOODS = {
  neutral:   { eyes: "open", mouth: "M-14 26 Q0 36 14 26", fill: false, brows: null, hop: 0 },
  happy:     { eyes: "up",   mouth: "M-20 20 Q0 40 20 20", fill: false, brows: null, hop: 16, period: 900 },
  celebrate: { eyes: "up",   mouth: "M-22 16 Q0 52 22 16 Z", fill: true, brows: "raised", hop: 44, period: 620 },
  focused:   { eyes: "open", mouth: "M-11 28 L11 28", fill: false, brows: "focus", hop: 0 },
  surprised: { eyes: "wide", mouth: "M0 20 a9 11 0 1 0 0.1 0Z", fill: true, brows: "raised", hop: 6, period: 500 },
  sleepy:    { eyes: "down", mouth: "M-9 28 Q0 33 9 28", fill: false, brows: null, hop: 0, breathe: 4600 },
  // anxious (30 Oct 2026, by request: Rook sliding along the tilted jet):
  // wide eyes, brows raised in the middle, a wobbly mouth and a tremble
  worried:   { eyes: "wide", mouth: "M-15 28 Q-7.5 21 0 28 Q7.5 35 15 28", fill: false, brows: "worried", hop: 0, tremble: true },
};
const MOUTHS = {};
function mouthOf(m) { return MOUTHS[m] ??= new Path2D(MOODS[m].mouth); }

// game -> its character: the coach is a yellow rounded square on every
// screen; each game has one in its own accent
export const CAST = {
  coach:   { shape: "squircle", color: C.coach },
  pong:    { shape: "circle", color: "#2F6BD8" },
  candles: { shape: "pill", color: "#E0952A" },
  windy:   { shape: "rhombus", color: "#0E7F7F" },
  assess:  { shape: "blob", color: "#6B4FC8" },
};

export class Character {
  constructor(opts = {}) {
    const def = CAST[opts.who] || {};
    this.shape = opts.shape || def.shape || "squircle";
    this.color = opts.color || def.color || C.coach;
    this.mood = opts.mood || "neutral";
    this.t0 = performance.now() - Math.random() * 2000;
    this.blinkAt = performance.now() + 800 + Math.random() * 3000;
    this.jumpAt = -1e9;
    this.flash = null; this.flashUntil = 0;
    this.target = null;            // canvas px to look at, or null to look around
    this.gaze = { x: 0, y: 0 }; this.nextGaze = 0;
    this.pupil = { x: 0, y: 0 };
  }
  setMood(m) { if (MOODS[m] && m !== this.mood) { this.mood = m; this.t0 = performance.now(); } }
  // a mood for a moment, then back (a happy face after a hit)
  flashMood(m, ms = 1300) { if (MOODS[m]) { this.flash = m; this.flashUntil = performance.now() + ms; } }
  jump() { this.jumpAt = performance.now(); }
  lookAt(p) { this.target = p; }

  // (x, y) is where the character stands (the middle of its shadow) and
  // size the body's width in px
  draw(ctx, x, y, size, now = performance.now()) {
    const sh = SHAPES[this.shape] || SHAPES.squircle;
    const moodName = this.flashUntil > now ? this.flash : this.mood;
    const md = MOODS[moodName];
    const k = size / 170;
    const still = calm();
    // hop and squash, else a slow breath
    let hy = 0, sx = 1, sy = 1;
    const H = still ? 0 : md.hop;
    if (H > 0) {
      const ph = ((now - this.t0) / md.period) % 1;
      hy = -H * Math.sin(Math.PI * ph);
      const q = Math.max(0, 1 - Math.min(ph, 1 - ph) / 0.12);
      sy = 1 - 0.14 * q; sx = 1 + 0.10 * q;
    } else if (!still) {
      const br = Math.sin((now - this.t0) / (md.breathe || 3200) * Math.PI * 2);
      sy = 1 + 0.018 * br; sx = 1 - 0.012 * br;
    }
    const j = (now - this.jumpAt) / 520;
    if (j >= 0 && j < 1 && !still) {
      hy += -46 * Math.sin(Math.PI * j);
      const q = Math.max(0, 1 - Math.min(j, 1 - j) / 0.14);
      sy *= 1 - 0.18 * q; sx *= 1 + 0.13 * q;
    }
    // blink
    let bs = 1;
    if (now > this.blinkAt) {
      const b = (now - this.blinkAt) / 150;
      if (b < 1) bs = 1 - 0.92 * Math.sin(Math.PI * b);
      else this.blinkAt = now + 2200 + Math.random() * 3200;
    }
    // pupils: at the target, else a slow look around
    let tx, ty;
    if (this.target) {
      const cx = x, cy = y + (sh.eyeY - 104) * k;
      const dx = this.target.x - cx, dy = this.target.y - cy, dl = Math.hypot(dx, dy) || 1;
      const amt = Math.min(7, dl / (40 * k));
      tx = dx / dl * amt; ty = dy / dl * amt;
    } else {
      if (now > this.nextGaze) { this.gaze = { x: (Math.random() * 2 - 1) * 6, y: (Math.random() * 2 - 1) * 4 }; this.nextGaze = now + 1500 + Math.random() * 2000; }
      tx = this.gaze.x; ty = this.gaze.y;
    }
    this.pupil.x += (tx - this.pupil.x) * 0.18; this.pupil.y += (ty - this.pupil.y) * 0.18;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.translate(0, -104);
    const lift = Math.min(1, -hy / 60);
    ctx.fillStyle = `rgba(30,34,53,${(0.13 * (1 - 0.5 * lift)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(0, 104, 70 * (1 - 0.35 * lift), 10, 0, 0, Math.PI * 2); ctx.fill();
    const shake = md.tremble && !still ? Math.sin(now / 38) * 2.2 : 0;
    ctx.translate(shake, hy + 84); ctx.scale(sx, sy); ctx.translate(0, -84);
    const body = pathOf(this.shape);
    ctx.fillStyle = this.color; ctx.fill(body);
    const g = ctx.createLinearGradient(0, -92, 0, 40);
    g.addColorStop(0, "rgba(255,255,255,0.32)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fill(body);
    // face
    ctx.translate(0, sh.eyeY);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = 7;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * sh.eyeX, 0);
      if (md.eyes === "open" || md.eyes === "wide") {
        ctx.save(); ctx.scale(1, bs);
        const R = md.eyes === "wide" ? 20 : 17, r = md.eyes === "wide" ? 7.5 : 10;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(this.pupil.x, this.pupil.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.pupil.x - 3.5, this.pupil.y - 3.5, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        if (md.eyes === "up") { ctx.moveTo(-15, 4); ctx.quadraticCurveTo(0, -12, 15, 4); }
        else { ctx.moveTo(-15, -2); ctx.quadraticCurveTo(0, 10, 15, -2); }
        ctx.stroke();
      }
      if (md.brows) {
        ctx.beginPath();
        if (md.brows === "focus") { if (side < 0) { ctx.moveTo(-16, -30); ctx.lineTo(12, -24); } else { ctx.moveTo(-12, -24); ctx.lineTo(16, -30); } }
        else if (md.brows === "worried") { if (side < 0) { ctx.moveTo(-14, -29); ctx.lineTo(12, -38); } else { ctx.moveTo(-12, -38); ctx.lineTo(14, -29); } }
        else { ctx.moveTo(-13, -32); ctx.quadraticCurveTo(0, -40, 13, -32); }
        ctx.stroke();
      }
      ctx.restore();
    }
    const mp = mouthOf(moodName);
    if (md.fill) ctx.fill(mp); else ctx.stroke(mp);
    ctx.restore();
  }
}

// A character living in its own small <canvas> (the hub, the round card, the
// welcome screen): it animates while the canvas is in the page and visible,
// and stops by itself when the canvas is removed or hidden.
export function mountCharacter(canvas, opts = {}) {
  const ch = new Character(opts);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const loop = now => {
    if (!canvas.isConnected) return;
    requestAnimationFrame(loop);
    if (!canvas.offsetParent) return;           // hidden: skip the work
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const size = Math.min(w * 0.82, h * 0.55);
    ch.draw(ctx, w / 2, h - Math.max(6, h * 0.06), size, now);
  };
  requestAnimationFrame(loop);
  return ch;
}

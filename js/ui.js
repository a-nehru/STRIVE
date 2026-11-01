// SHARED CANVAS CHROME (30 Oct 2026, by request: one look for every game).
// Every game draws its clock, its one number, the countdown, the end word,
// the pause veil and its sparks through these, so they look and sit the same
// everywhere: the clock in the top-centre band, the game's one number beside
// it, the coach dock in a bottom corner. Sizes are in "u", one pixel of a
// 1080-pixel-tall screen; colours come from theme.js. The DOM chrome (Help,
// Today, the close button) owns the screen's corners, so nothing here goes
// there.
import { C, ACCENTS, alpha, font, tsize, calm, ease } from "./theme.js";

// Fitting any screen (31 Oct 2026, by request: a phone held upright showed the
// landscape layout running off both sides): the unit follows the height on any
// landscape screen (unchanged down to about 0.93:1), and the width on a
// portrait one (a phone, a tablet held upright), so nothing sized in u can be
// wider than the screen allows. uH is the height the type scale is read at.
export const u = c => Math.min(c.height / 1080, c.width / 1000);
export const uH = c => u(c) * 1080;
const clamp01 = v => Math.max(0, Math.min(1, v));

// The DOM chrome (the gear, Help, the Today pill, the close cross) is a row
// along the top. On a wide screen its middle is free and the canvas's top band
// (the clock, the game's number on either side, a tutorial's Skip) sits
// between its ends; on a narrow one the row runs across that middle, so the
// band starts under it. topInset(c) is how far down, in canvas pixels (the
// canvas is 1:1 with CSS pixels), 0 when the middle is free. It is measured
// from the chrome itself, once a second, since the Today pill's width follows
// its words and the patient's text size.
const CHROME_IDS = ["btn-staff", "btn-help", "today-pill", "btn-quit"];
let insetAt = -1e9, insetVal = 0, insetW = 0, chromeBot = 72;
export function topInset(c) {
  const now = performance.now();
  if (now - insetAt < 1000 && insetW === c.width) return insetVal;
  insetAt = now; insetW = c.width;
  const k = u(c), mid = c.width / 2, half = Math.min(400 * k, c.width * 0.24) / 2 + 150 * k;
  let lo = 0, hi = c.width, bottom = 0;
  // in the canvas's own pixels (the TV edges setting draws the page scaled)
  const cr = c.getBoundingClientRect?.() ?? { left: 0, top: 0, width: c.width }, sx = c.width / (cr.width || c.width);
  for (const id of CHROME_IDS) {
    const el = document.getElementById(id);
    if (!el || !el.getClientRects().length) continue;
    const q = el.getBoundingClientRect();
    const r = { left: (q.left - cr.left) * sx, right: (q.right - cr.left) * sx, top: (q.top - cr.top) * sx, bottom: (q.bottom - cr.top) * sx, width: q.width };
    if (!r.width || r.top > 120) continue;
    bottom = Math.max(bottom, r.bottom);
    if (r.right <= mid) lo = Math.max(lo, r.right);
    else if (r.left >= mid) hi = Math.min(hi, r.left);
    else { lo = mid; hi = mid; }
  }
  chromeBot = bottom || 72;
  insetVal = lo > mid - half || hi < mid + half ? bottom + 10 : 0;
  return insetVal;
}
// the chrome row's bottom edge, for a layout whose sides reach up into its corners
export function chromeBottom(c) { topInset(c); return chromeBot; }

// ---- images (Kenney, CC0, assets/kenney/) --------------------------------
const IMG = new Map();
export function img(path) {
  let im = IMG.get(path);
  if (!im) { im = new Image(); im.src = path; IMG.set(path, im); }
  return im.complete && im.naturalWidth ? im : null;
}
export function preload(paths) { for (const p of paths) img(p); }
// a white texture recoloured (particles), cached per colour
const TINT = new Map();
export function tinted(path, color) {
  const key = path + "|" + color;
  if (TINT.has(key)) return TINT.get(key);
  const im = img(path);
  if (!im) return null;
  const cv = document.createElement("canvas");
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const x = cv.getContext("2d");
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color; x.fillRect(0, 0, cv.width, cv.height);
  TINT.set(key, cv);
  return cv;
}
export const HAND = {
  open: side => `assets/kenney/hands/${side}_hand_open.png`,
  closed: side => `assets/kenney/hands/${side}_hand_closed.png`,
};
preload(["assets/kenney/particles/star_04.png", "assets/kenney/particles/circle_05.png",
  HAND.open("purple"), HAND.closed("purple")]);

export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
// a card: white with the soft shadow on Day, the night card on Night
export function card(ctx, x, y, w, h, r, night) {
  ctx.save();
  if (!night) { ctx.shadowColor = "rgba(30,34,53,0.14)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; }
  ctx.fillStyle = night ? C.nightCard : C.card;
  rrect(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
}

// ---- layout ---------------------------------------------------------------
export function layout(c) {
  const k = u(c), W = c.width, inset = topInset(c);
  const barW = Math.min(400 * k, W * 0.24), y = inset ? inset + 4 * k : 60 * k;
  return {
    k, inset,
    clock: { x: W / 2 - barW / 2, y, w: barW, h: 22 * k },
    counterRight: { x: W / 2 + barW / 2 + 34 * k, y: y + 44 * k },
    counterLeft: { x: W / 2 - barW / 2 - 34 * k, y: y + 44 * k },
    top: y + 120 * k,                     // play area starts under the band
  };
}
// the coach dock: a card in the bottom corner AWAY from the trained arm (the
// mirror puts the right arm on the right of the screen), so it never sits in
// the reaching arm's space (framework P5)
export function dockRect(c, side, opts = {}) {
  const k = u(c), h = (opts.h ?? 185) * k;          // 150 until 31 Oct 2026: bigger for a TV across the room
  const w = opts.compact ? h * 0.95 : h * 2.25;
  const left = opts.corner ? opts.corner === "left" : side !== "left";
  return { x: left ? 34 * k : c.width - 34 * k - w, y: c.height - 34 * k, h, w };
}

// ---- the clock: a bar that fills with the time used ------------------------
export function drawClock(ctx, c, frac, opts = {}) {
  const L = layout(c), a = opts.accent || ACCENTS.pong, night = opts.surface === "night";
  const { x, y, w, h } = L.clock;
  ctx.save();
  ctx.fillStyle = night ? C.nightLine : alpha(a.solid, 0.18);
  rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  const f = clamp01(frac);
  if (f > 0) { ctx.fillStyle = a.solid; rrect(ctx, x, y, Math.max(h, w * f), h, h / 2); ctx.fill(); }
  // the seconds as a word only near the end, when they matter
  if (opts.secondsLeft != null && opts.secondsLeft <= 10 && opts.secondsLeft >= 0) {
    ctx.font = font("small", uH(c), { weight: 800 });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = night ? C.onNight : C.ink2;
    ctx.fillText(opts.word || `${Math.ceil(opts.secondsLeft)} s`, c.width / 2, y + h + 12 * L.k);
  }
  ctx.restore();
}
// the game's one number, beside the clock (Pong puts a second one on the left
// for the opponent's score)
export function drawCounter(ctx, c, value, label, opts = {}) {
  const L = layout(c), a = opts.accent || ACCENTS.pong, night = opts.surface === "night";
  const left = opts.side === "left";
  const p = left ? L.counterLeft : L.counterRight;
  const col = opts.color || (night ? a.light : a.deep);
  ctx.save();
  ctx.textAlign = left ? "right" : "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = col;
  ctx.font = font("title", uH(c));
  ctx.fillText(String(value), p.x, p.y);
  if (label) {
    ctx.font = font("small", uH(c), { weight: 800 });
    ctx.fillStyle = opts.labelColor || (night ? C.onNight2 : col);
    ctx.fillText(label, p.x, p.y + 40 * L.k);
  }
  ctx.restore();
}

// ---- countdown: 3, 2, 1 in the hero size, a ring draining -----------------
export function drawCountdown(ctx, c, label, frac, opts = {}) {
  const a = opts.accent || ACCENTS.pong, night = opts.surface === "night", k = u(c);
  const cx = c.width / 2, cy = opts.y ?? c.height / 2, R = 150 * k;
  const pop = calm() ? 1 : 1 + 0.2 * (1 - ease.out((opts.since ?? 1000) / 600));
  ctx.save();
  ctx.lineCap = "round"; ctx.lineWidth = 22 * k;
  ctx.strokeStyle = night ? C.nightLine : a.tint;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = a.solid;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(frac)); ctx.stroke();
  ctx.translate(cx, cy); ctx.scale(pop, pop);
  ctx.fillStyle = night ? a.light : a.deep;
  ctx.font = font("hero", uH(c), { size: Math.round(170 * k) });
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(label), 0, 8 * k);
  ctx.restore();
}

// ---- the end word ("Time!", "Finish!", "Level 4!"), popping in ------------
export function drawEndWord(ctx, c, word, sinceMs, opts = {}) {
  const k = u(c), night = opts.surface === "night";
  const t = clamp01(sinceMs / 500);
  const s = calm() ? 1 : 0.4 + 0.6 * ease.pop(t);
  ctx.save();
  ctx.globalAlpha = calm() ? clamp01(sinceMs / 280) : clamp01(t * 3);
  ctx.translate(c.width / 2, opts.y ?? c.height * 0.46); ctx.scale(s, s);
  ctx.font = font("display", uH(c), { size: Math.round((opts.size ?? 150) * k) });
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = opts.color || (night ? C.onNight : C.ink);
  ctx.fillText(word, 0, 0);
  ctx.restore();
}

// ---- pause: one look for every cause --------------------------------------
export function drawVeil(ctx, c, title, sub) {
  const k = u(c);
  ctx.save();
  ctx.fillStyle = "rgba(20,23,42,0.55)"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = font("title", uH(c));
  const tw = ctx.measureText(title).width;
  ctx.font = font("body", uH(c));
  const sw = sub ? ctx.measureText(sub).width : 0;
  const w = Math.max(tw, sw) + 120 * k, h = (sub ? 220 : 150) * k;
  card(ctx, c.width / 2 - w / 2, c.height / 2 - h / 2, w, h, 32 * k, false);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = C.ink; ctx.font = font("title", uH(c));
  ctx.fillText(title, c.width / 2, c.height / 2 - (sub ? 34 * k : 0));
  if (sub) { ctx.fillStyle = C.ink2; ctx.font = font("body", uH(c)); ctx.fillText(sub, c.width / 2, c.height / 2 + 44 * k); }
  ctx.restore();
}

// ---- sparks: the hit pop's particles, time-based, calm-aware --------------
export class Sparks {
  constructor() { this.list = []; }
  // n stars from (x, y) in the colour, travelling `dist` px over `ms`
  burst(x, y, color, n = 8, dist = 90, ms = 480) {
    if (calm()) { this.list.push({ ring: true, x, y, color, t0: performance.now(), ms: 220, r: dist * 0.4 }); return; }
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * 0.4;
      const d = dist * (0.75 + Math.random() * 0.5);
      this.list.push({ x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d, color, t0, ms, size: dist * 0.34 * (0.8 + Math.random() * 0.4) });
    }
  }
  draw(ctx, now = performance.now()) {
    this.list = this.list.filter(p => now - p.t0 < p.ms);
    for (const p of this.list) {
      const t = (now - p.t0) / p.ms;
      ctx.save();
      if (p.ring) {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = p.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * t), 0, Math.PI * 2); ctx.stroke();
      } else {
        const e = ease.out(t), x = p.x + p.dx * e, y = p.y + p.dy * e, s = p.size * (0.6 + 0.4 * e);
        ctx.globalAlpha = 1 - t;
        const tex = tinted("assets/kenney/particles/star_04.png", p.color);
        if (tex) ctx.drawImage(tex, x - s / 2, y - s / 2, s, s);
        else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, s / 4, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
  }
}

// confetti for a milestone (end of level, best): flat pieces in the accent
// and the success colour, once, 1.2 s; nothing under calm motion
export class Confetti {
  constructor() { this.list = []; }
  fire(c, colors, n = 36) {
    if (calm()) return;
    const t0 = performance.now(), k = u(c);
    for (let i = 0; i < n; i++) {
      this.list.push({ x: c.width * (0.2 + Math.random() * 0.6), y: c.height * (0.15 + Math.random() * 0.15),
        vx: (Math.random() * 2 - 1) * 160 * k, vy: (-120 - Math.random() * 220) * k, rot: Math.random() * 6, vr: (Math.random() * 2 - 1) * 8,
        w: (10 + Math.random() * 8) * k, h: (16 + Math.random() * 10) * k, color: colors[i % colors.length], t0, ms: 1200 + Math.random() * 500 });
    }
  }
  draw(ctx, now = performance.now()) {
    this.list = this.list.filter(p => now - p.t0 < p.ms);
    for (const p of this.list) {
      const t = (now - p.t0) / 1000;
      const x = p.x + p.vx * t, y = p.y + p.vy * t + 900 * t * t * (ctx.canvas.height / 1080);
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, (now - p.t0) / p.ms - 0.6) / 0.4;
      ctx.translate(x, y); ctx.rotate(p.rot + p.vr * t);
      ctx.fillStyle = p.color; rrect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 3); ctx.fill();
      ctx.restore();
    }
  }
}

// text with wrapping into a width, returns the height used
export function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(/\s+/);
  let line = "", yy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lineH; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy - y + lineH;
}
export { tsize };

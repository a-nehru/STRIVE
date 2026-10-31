// COZY FRUIT MERGE (31 Oct 2026, by request), ported from the user's own
// mockup (assets/cozy-fruit-merge.zip, its HANDOFF.md): a drop-and-merge
// physics puzzle. Fruit falls into a box; two of the same fruit that touch
// merge into the next one up; each level asks for a goal fruit. Kept from
// the mockup: the board and its Matter.js physics (restitution .18, friction
// .12, density .0012, gravity 1.15), the fruit drawn in code with faces, the
// levels (goal fruit growing every two levels, fruit waiting in the box from
// level 5, bumpers from 7, a narrower box from 10, the top line lower from
// 13), combos, the shake meter and the shake, the next-fruit bubble, the
// evolution ring, the Fredoka font and the peach and cocoa palette, and
// its sounds. THE PICTURES: on the public site, realistic 3D fruit from
// Microsoft's Fluent Emoji (MIT, assets/fruit/fluent/, by request 31 Oct:
// "make it as good as realistic"); the mockup's "glossy" pictures where the
// local, gitignored assets/fruit/glossy.json is there (they have no licence);
// the mockup's drawn fruit with faces as the last fallback. T cycles them.
//
// What is STRIVE's:
//  - THE LADDER: eight fruit, strawberry to the pumpkin (the mockup's eleven
//    ran Suika's own sequence to the watermelon); the pumpkin is drawn in the
//    mockup's style.
//  - THE ARM drives it. The hand's SIDEWAYS position carries the fruit along
//    the top of the box over the assessment's own x range about the body
//    centre (Pong Abd-Add's lane) times rangeScale, so the box walls sit at
//    that share of this arm's measured reach out to the side and across the
//    body. Height is free: the arm may rest on a table and slide.
//  - DROPPING (the handoff's modes, staff drawer `in-fruit-drop`): "hold",
//    hold the hand still for the patient's dwell time (a ring fills round the
//    fruit); "grasp", squeeze then open the hand; "both". A hold only counts
//    after the hand has travelled FRUIT_REARM of the lane since the last drop,
//    so a resting arm never drops fruit after fruit in one place, while the
//    same spot is still a small wiggle away.
//  - THE SHAKE is earned by combos as in the mockup, and called up by
//    RAISING the hand (FRUIT_RAISE of the reach straight up) and holding it
//    there; then a side-to-side wave shakes the box.
//  - NO GAME OVER: a box full past its line for FRUIT_OVER_MS lets the fruit
//    near the top roll away (`overflows`, a silent miss) and play goes on.
//  - Stars reward range and steadiness, not fewer drops (the handoff's ask):
//    one for the goal, one for dropping at both sides of the box, one for
//    never filling it over the line.
//  - One level is one round of up to FRUIT_ROUND_S; a box not finished in
//    time is kept for the next round of the same level (main.js state.fruitBoard).
import { GameBase, TAU, CENTER, drawHand } from "./engine.js";
import { audio } from "./audio.js";
import { A11Y } from "./a11y.js";
import { ACCENTS, alpha } from "./theme.js";
import { drawClock, rrect, u as uu, Confetti } from "./ui.js";

// ---- the physics engine: Matter.js 0.19.0 (MIT), js/vendor/matter.min.js,
// a classic script (it is UMD), loaded once when this module is first used
let MATTER = null;
let matterLoading = null;
function loadMatter() {
  if (MATTER || window.Matter) { MATTER ??= window.Matter; return Promise.resolve(MATTER); }
  matterLoading ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "js/vendor/matter.min.js"; s.async = true;
    s.onload = () => { MATTER = window.Matter; res(MATTER); };
    s.onerror = () => { matterLoading = null; rej(new Error("matter.js did not load")); };
    document.head.appendChild(s);
  });
  return matterLoading;
}
// the glossy pictures, by fruit name, when the local file is there
let GLOSSY = null, glossyLoading = null;
function loadGlossy() {
  glossyLoading ??= fetch("assets/fruit/glossy.json").then(r => r.ok ? r.json() : [])
    .then(list => Promise.all((Array.isArray(list) ? list : []).map(g => new Promise(res => {
      const im = new Image();
      im.onload = () => res([g.n, im]); im.onerror = () => res(null);
      im.src = g.src;
    }))))
    .then(pairs => { GLOSSY = new Map(pairs.filter(Boolean)); return GLOSSY; })
    .catch(() => { GLOSSY = new Map(); return GLOSSY; });
  return glossyLoading;
}

// the Fluent Emoji 3D fruit (MIT): [body diameter, body centre x, centre y]
// in the 256-px picture, measured from its alpha with stems and leaf tips
// left out, so each fruit's body fills its physics circle
const FLUENT_FIT = {
  strawberry: [157.5, 127.5, 128], grape: [166.5, 117, 138.5], orange: [171.5, 127.5, 147], apple: [200, 128, 146],
  peach: [209, 127.5, 116.5], pineapple: [175, 120.5, 140.5], melon: [175.5, 127.5, 145], pumpkin: [199.5, 127.5, 148],
};
const FLUENT_FILL = 1.06;        // a touch over the circle, so touching fruit look touching
let FLUENT = null;
function loadFluent(onEach) {
  if (FLUENT) return FLUENT;
  FLUENT = {};
  for (const k of Object.keys(FLUENT_FIT)) {
    const im = new Image();
    im.onload = () => onEach?.();
    im.src = `assets/fruit/fluent/${k}.png`;
    FLUENT[k] = im;
  }
  return FLUENT;
}

// ---- the board, in the mockup's logical units (400 x 640) ----
const W = 400, H = 640;
const BASE_L = 16, BASE_R = 384, BASE_TOP = 120, FLOOR = 624, HOLD_Y = 64;
const STEP = 1000 / 60;
const EXT = 1.9;                  // sprite half-size in radii (room for stems and leaves)

// THE LADDER: r in logical units, pts for making it, col for its sparks,
// art = which drawn fruit (drawFruit), glossy = the picture's name
export const FRUITS = [
  { n: "Strawberry", r: 15, pts: 1, col: "#f2545b", art: "strawberry" },
  { n: "Grape", r: 20, pts: 3, col: "#8a5cf0", art: "grape" },
  { n: "Orange", r: 27, pts: 6, col: "#ff8a1f", art: "orange" },
  { n: "Apple", r: 35, pts: 10, col: "#e8323c", art: "apple" },
  { n: "Peach", r: 46, pts: 15, col: "#ff9ea0", art: "peach" },
  { n: "Pineapple", r: 59, pts: 21, col: "#ffc933", art: "pineapple" },
  { n: "Melon", r: 76, pts: 28, col: "#9fd462", art: "melon" },
  { n: "Pumpkin", r: 96, pts: 36, col: "#ff8c2a", art: "pumpkin" },
];
const TOP = FRUITS.length - 1;
export const FRUIT_MAX = 20;      // levels on the map (fruitLevelDef works for any level)

const FRUIT_ROUND_S = 180;        // a round: one level, up to three minutes of play
const FRUIT_REARM = 0.15;         // of the lane: the hand travels this far between held drops
const FRUIT_STILL_SW = 0.07;      // a hold: the hand stays within this, SW (tremor-tolerant)
const FRUIT_STILL_GRACE = 350;    // ms a hold survives a wobble outside it
const FRUIT_GRASP_MS = 300;       // a squeeze counts once the hand has been closed this long
const FRUIT_NEXT_MS = 480;        // the next fruit arrives after a drop (the mockup's)
const FRUIT_OVER_MS = 2200;       // a box full past its line this long lets the top fruit go
const FRUIT_RAISE = 0.8;          // of rangeScale x the reach straight up: a raised hand
const FRUIT_RAISE_MS = 700;       // held raised this long calls up the shake
const FRUIT_X_PAD = 0.05;         // SW shaved off each end of the sideways range
const FRUIT_MIN_SPAN = 0.5;       // SW: the lane never narrower than this
const SHAKE_MS = 4500;
const PALETTE = { bg: "#fde8dc", dot: "#fff4ee", mintDot: "rgba(191,230,200,.55)", card: "#fffaf5", edge: "#efcfb8",
  ink: "#6a4636", accent: "#ff8f70", accentDeep: ACCENTS.fruit.deep, mint: "#bfe6c8", star: "#ffb938", starOff: "#e8d6c6" };
const FONT = "Fredoka, Nunito, system-ui, sans-serif";

export const STORY = { title: "Cozy Fruit Merge", text: "Move your hand from side to side to carry the fruit. Hold still to drop it. Two of the same fruit join into a bigger one." };

/* ---------- the drawn fruit (the mockup's drawFruit, the same pictures) ---------- */
function bodyFill(ctx, r, light, base) {
  const g = ctx.createRadialGradient(-r * .38, -r * .42, r * .08, 0, 0, r * 1.02);
  g.addColorStop(0, light); g.addColorStop(1, base);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
}
function rim(ctx, r, line) {
  const lw = Math.max(1.2, r * .07);
  ctx.beginPath(); ctx.arc(0, 0, r - lw / 2, 0, TAU);
  ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke();
}
function clipBody(ctx, r) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip(); }
function gloss(ctx, r) {
  ctx.save(); ctx.translate(-r * .42, -r * .44); ctx.rotate(-.75);
  ctx.beginPath(); ctx.ellipse(0, 0, r * .22, r * .11, 0, 0, TAU);
  ctx.fillStyle = "rgba(255,255,255,.62)"; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(-r * .15, -r * .66, r * .05, 0, TAU);
  ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fill();
}
function leaf(ctx, x, y, len, w, rot, fill = "#7cc65a", line = "#4b8a33") {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * .5, -w, len, 0); ctx.quadraticCurveTo(len * .5, w, 0, 0);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(.8, w * .22); ctx.strokeStyle = line; ctx.lineJoin = "round"; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(len * .12, 0); ctx.lineTo(len * .78, 0);
  ctx.strokeStyle = "rgba(60,110,40,.45)"; ctx.lineWidth = Math.max(.5, w * .12); ctx.stroke();
  ctx.restore();
}
function stem(ctx, pts, w, col = "#8a5a3c") {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
  ctx.lineWidth = w; ctx.lineCap = "round"; ctx.strokeStyle = col; ctx.stroke();
}
function face(ctx, r, eyes = "open", mouth = "w", oy = .08) {
  const ink = "#3d2a24", ex = r * .31, ey = r * oy, es = r * .13;
  ctx.save();
  ctx.fillStyle = "rgba(255,110,135,.42)";
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * .52, ey + r * .2, r * .14, r * .085, 0, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = ink; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(.9, r * .058);
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (eyes === "happy" || (eyes === "wink" && s === 1)) {
      ctx.beginPath(); ctx.arc(x, ey + es * .45, es * .8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (eyes === "sleepy") {
      ctx.beginPath(); ctx.arc(x, ey - es * .25, es * .75, Math.PI * .15, Math.PI * .85); ctx.stroke();
    } else {
      ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(x, ey, es * .84, es, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(x - es * .28, ey - es * .4, es * .38, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + es * .3, ey + es * .38, es * .16, 0, TAU); ctx.fill();
    }
  }
  const my = ey + r * .2, m = r * .055;
  ctx.beginPath();
  if (mouth === "w") {
    ctx.moveTo(-2 * m, my); ctx.arc(-m, my, m, Math.PI, 0, true); ctx.arc(m, my, m, Math.PI, 0, true); ctx.stroke();
  } else if (mouth === "u") {
    ctx.arc(0, my - m * .4, m * 1.4, Math.PI * .15, Math.PI * .85); ctx.stroke();
  } else {   // big open smile
    ctx.moveTo(-r * .14, my - r * .02);
    ctx.quadraticCurveTo(0, my + r * .26, r * .14, my - r * .02); ctx.closePath();
    ctx.fillStyle = "#7a2b2b"; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.ellipse(0, my + r * .13, r * .08, r * .05, 0, 0, TAU); ctx.fillStyle = "#ff8a95"; ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(.9, r * .04); ctx.stroke();
  }
  ctx.restore();
}
function drawFruit(ctx, art, r) {
  switch (art) {
    case "strawberry": {
      bodyFill(ctx, r, "#ff9d92", "#ef3c55");
      ctx.save(); clipBody(ctx, r);
      ctx.fillStyle = "#ffe7a0";
      for (const [x, y] of [[-.62, -.28], [.62, -.28], [-.8, .18], [.8, .18], [-.52, .64], [.52, .64], [0, .84], [-.24, .86], [.24, .86], [-.32, -.62], [.32, -.62]]) {
        ctx.beginPath(); ctx.ellipse(x * r, y * r, r * .05, r * .075, x * .6, 0, TAU); ctx.fill();
      }
      ctx.restore();
      rim(ctx, r, "#a3273a"); gloss(ctx, r); face(ctx, r, "open", "w", .12);
      for (const a of [-155, -120, -90, -60, -25]) leaf(ctx, 0, -r * .84, r * .5, r * .17, a * Math.PI / 180, "#68c45c", "#3f8a3a");
      stem(ctx, [0, -r * .88, 0, -r * 1.05, r * .06, -r * 1.2], r * .1, "#4f8a33");
      break;
    }
    case "grape": {
      bodyFill(ctx, r, "#c9a8ff", "#7f4ddc");
      ctx.save(); clipBody(ctx, r);
      ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = r * .05;
      for (const [x, y, s] of [[-.5, .5, .32], [.5, .52, .32], [0, .78, .3], [-.72, -.05, .3], [.72, -.05, .3], [0, -.68, .3]]) {
        ctx.beginPath(); ctx.arc(x * r, y * r, s * r, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      rim(ctx, r, "#4c2a92"); gloss(ctx, r); face(ctx, r, "open", "w");
      stem(ctx, [0, -r * .85, -r * .05, -r * 1.1, r * .05, -r * 1.25], r * .12);
      leaf(ctx, r * .02, -r * 1.0, r * .7, r * .24, -.45);
      break;
    }
    case "orange": {
      bodyFill(ctx, r, "#ffc68e", "#ff8316");
      ctx.save(); clipBody(ctx, r); ctx.fillStyle = "rgba(190,80,10,.18)";
      for (let k = 0; k < 22; k++) { const a = k * 2.4, d = r * (.62 + .28 * ((k * 37) % 10) / 10); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * .025, 0, TAU); ctx.fill(); }
      ctx.restore();
      rim(ctx, r, "#b5520e"); gloss(ctx, r); face(ctx, r, "open", "u");
      ctx.beginPath(); ctx.arc(0, -r * .86, r * .06, 0, TAU); ctx.fillStyle = "#6b8e23"; ctx.fill();
      leaf(ctx, r * .04, -r * .9, r * .55, r * .18, -.5);
      break;
    }
    case "apple": {
      bodyFill(ctx, r, "#ff918b", "#e02f3a"); rim(ctx, r, "#8c1b25"); gloss(ctx, r);
      face(ctx, r, "happy", "w");
      stem(ctx, [0, -r * .82, r * .02, -r * 1.05, r * .12, -r * 1.22], r * .1);
      leaf(ctx, r * .07, -r * 1.04, r * .55, r * .18, -.55);
      break;
    }
    case "peach": {
      bodyFill(ctx, r, "#ffe3d6", "#ff9a9c");
      ctx.save(); clipBody(ctx, r);
      const g = ctx.createRadialGradient(r * .3, r * .5, 0, r * .3, r * .5, r * .8);
      g.addColorStop(0, "rgba(255,220,150,.45)"); g.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(r * .04, -r * .96); ctx.quadraticCurveTo(-r * .22, -r * .62, r * .04, -r * .34);
      ctx.strokeStyle = "rgba(200,90,100,.45)"; ctx.lineWidth = r * .05; ctx.lineCap = "round"; ctx.stroke();
      rim(ctx, r, "#c96a72"); gloss(ctx, r); face(ctx, r, "sleepy", "u", .14);
      leaf(ctx, r * .04, -r * .92, r * .5, r * .17, -.4);
      leaf(ctx, r * .02, -r * .92, r * .42, r * .15, -2.6);
      break;
    }
    case "pineapple": {
      for (const [a, l] of [[-90, .72], [-62, .6], [-118, .6], [-38, .45], [-142, .45]]) leaf(ctx, 0, -r * .78, r * l, r * .14, a * Math.PI / 180, "#5fbf5a", "#3a7d36");
      bodyFill(ctx, r, "#fff39e", "#ffc22a");
      ctx.save(); clipBody(ctx, r);
      ctx.strokeStyle = "rgba(196,128,20,.42)"; ctx.lineWidth = r * .045;
      for (let k = -6; k <= 6; k++) {
        const o = k * r * .36;
        ctx.beginPath(); ctx.moveTo(o - r, -r); ctx.lineTo(o + r, r); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o + r, -r); ctx.lineTo(o - r, r); ctx.stroke();
      }
      ctx.restore();
      rim(ctx, r, "#b5841a"); gloss(ctx, r); face(ctx, r, "open", "w", .1);
      break;
    }
    case "melon": {
      bodyFill(ctx, r, "#ecffd2", "#a2d562");
      ctx.save(); clipBody(ctx, r);
      ctx.strokeStyle = "rgba(255,255,236,.7)"; ctx.lineWidth = r * .035; ctx.lineCap = "round";
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        for (let t = -1.1; t <= 1.1; t += .1) { const x = t * r, y = k * r * .3 + Math.sin(t * 5 + k) * r * .07; t === -1.1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.beginPath();
        for (let t = -1.1; t <= 1.1; t += .1) { const y = t * r, x = k * r * .32 + Math.sin(t * 4.4 + k * 2) * r * .08; t === -1.1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
      rim(ctx, r, "#5d8f2e"); gloss(ctx, r); face(ctx, r, "happy", "w");
      stem(ctx, [0, -r * .86, 0, -r * 1.0, 0, -r * 1.08], r * .08, "#6b8a3a");
      stem(ctx, [-r * .14, -r * 1.08, 0, -r * 1.12, r * .14, -r * 1.08], r * .07, "#6b8a3a");
      break;
    }
    case "pumpkin": {
      // new for STRIVE, in the mockup's style: ribbed, a thick stem, a curl of vine
      bodyFill(ctx, r, "#ffc27a", "#f07a12");
      ctx.save(); clipBody(ctx, r);
      ctx.strokeStyle = "rgba(168,70,8,.34)"; ctx.lineWidth = r * .055; ctx.lineCap = "round";
      for (const k of [-.66, -.33, 0, .33, .66]) {
        ctx.beginPath(); ctx.moveTo(k * r * .3, -r * .98);
        ctx.quadraticCurveTo(k * r * 1.45, 0, k * r * .3, r * .98); ctx.stroke();
      }
      ctx.restore();
      rim(ctx, r, "#a94e0c"); gloss(ctx, r); face(ctx, r, "happy", "big", .1);
      ctx.fillStyle = "#7a8a3a"; ctx.strokeStyle = "#4f5f22"; ctx.lineWidth = Math.max(1, r * .03);
      rrect(ctx, -r * .09, -r * 1.14, r * .18, r * .32, r * .06); ctx.fill(); ctx.stroke();
      stem(ctx, [r * .06, -r * 1.02, r * .42, -r * 1.24, r * .52, -r * .98], r * .045, "#5f8a2e");
      leaf(ctx, -r * .06, -r * .98, r * .5, r * .18, -2.7);
      break;
    }
  }
}

/* ---------- levels: gentle start, one new idea every few levels (the mockup's) ---------- */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function fruitLevelDef(n) {
  const goal = Math.min(TOP, 1 + Math.floor(n / 2));              // L1 grape, L2-3 orange, L4-5 apple ... L12 on the pumpkin
  const count = (n % 2 === 1 && n > 1 && goal < TOP - 1) ? 2 : 1;  // the second visit to a fruit asks for two
  const maxDrop = Math.max(0, Math.min(3, 1 + Math.floor(n / 3), goal - 1));   // early levels drop only small fruit
  const rnd = mulberry32(n * 7919 + 13);
  const narrow = n >= 10 ? Math.min(30, (n - 9) * 5) : 0;          // the box narrows from level 10
  const top = BASE_TOP + (n >= 13 ? Math.min(48, (n - 12) * 6) : 0);   // the top line drops from level 13
  const l = BASE_L + narrow, r = BASE_R - narrow;
  const pegList = [];
  const pegN = n >= 7 ? Math.min(4, 1 + Math.floor((n - 7) / 3)) : 0;   // bumpers from level 7
  for (let k = 0, tries = 0; k < pegN && tries < 200; tries++) {
    const p = { x: l + 50 + rnd() * (r - l - 100), y: top + 170 + rnd() * (FLOOR - top - 300), r: 12 };
    if (pegList.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 90)) { pegList.push(p); k++; }
  }
  const prefill = n >= 5 ? Math.min(10, Math.floor((n - 3) / 2) * 2) : 0;   // fruit waiting in the box from level 5
  const pre = [];
  for (let k = 0; k < prefill; k++) pre.push({ i: Math.floor(rnd() * Math.max(1, Math.min(3, goal - 1))), x: l + 30 + rnd() * (r - l - 60), y: FLOOR - 40 - (k % 4) * 55 });
  const news = [];
  if (n === 5) news.push("New: some fruit start in the box");
  if (n === 7) news.push("New: bumpers!");
  if (n === 10) news.push("New: a narrower box");
  if (n === 13) news.push("New: the top line moves down");
  return { n, goal, count, maxDrop, l, r, top, pegList, pre, news };
}
export const fruitName = i => FRUITS[i]?.n || "";
const plural = nm => /(ch|sh|s|x)$/.test(nm) ? nm + "es" : nm + "s";     // Peach -> Peaches
function goalPhrase(LV) {
  const nm = fruitName(LV.goal);
  if (LV.count > 1) return `Make ${LV.count} ${plural(nm)}`;
  return `Make ${/^[AEIOU]/.test(nm) ? "an" : "a"} ${nm}`;
}
// the level's chapters for the map: grouped by goal fruit
export function fruitChapters() {
  const out = [];
  for (let n = 1; n <= FRUIT_MAX; n++) {
    const g = fruitLevelDef(n).goal, last = out[out.length - 1];
    if (last && last.goal === g) last.to = n;
    else out.push({ from: n, to: n, goal: g, name: plural(fruitName(g)), note: "" });
  }
  for (const ch of out) {
    const lv = fruitLevelDef(ch.from);
    ch.note = [5, 7, 10, 13].filter(k => k >= ch.from && k <= ch.to).map(k => fruitLevelDef(k).news[0]?.replace("New: ", "")).join(", ");
    void lv;
  }
  return out;
}

// one smoothed channel: a running median over the last 5 distinct tracker
// samples, then an adaptive One-Euro filter (Pong's paddle constants)
class Channel {
  constructor() { this.v = null; this.dv = 0; this.buf = []; this.seen = null; }
  push(raw, seen, dt) {
    if (raw == null) return this.v;
    if (seen !== this.seen) { this.seen = seen; this.buf.push(raw); if (this.buf.length > 5) this.buf.shift(); }
    const s = [...this.buf].sort((a, b) => a - b), target = s[s.length >> 1];
    if (this.v == null) { this.v = target; return target; }
    const dts = Math.max(1, dt) / 1000;
    const lp = cut => { const r = TAU * cut * dts; return r / (r + 1); };
    this.dv += lp(0.25) * ((target - this.v) / dts - this.dv);
    this.v += lp(0.6 + 5.0 * Math.abs(this.dv)) * (target - this.v);
    return this.v;
  }
}
// the sideways lane: the assessment's own x limits about the body centre
// (the same as Pong Abd-Add's, games.js pongXLimits)
function xLimits(prof, arm) {
  const xs = [], cen = prof?.center?.x || 0;
  if (prof?.envPts?.length) for (const q of prof.envPts) if (q) xs.push(cen + q.x);
  if (xs.length < 2 && prof?.envelope?.length) prof.envelope.forEach((r, i) => { if (r > 0) xs.push(cen + Math.cos((i + 0.5) / prof.envelope.length * TAU) * r); });
  if (xs.length >= 2) return [Math.min(...xs), Math.max(...xs)];
  return arm === "left" ? [-0.9, 0.6] : [-0.6, 0.9];
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOutBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class CozyFruit extends GameBase {
  id = "fruit";
  quietPraise = true;              // the game says its own few lines
  get surface() { return "day"; }

  setup() {
    this.tips = { objective: "Move your hand to carry the fruit, then hold still to drop it." };
    this.level = Math.max(1, Math.round(this.opts.level || 1));
    this.LV = fruitLevelDef(this.level);
    this.dropMode = ["hold", "grasp", "both"].includes(this.opts.drop) ? this.opts.drop : "hold";
    const wait = this.tellStory(STORY);
    this.storyS = wait / 1000;
    this.roundSeconds = FRUIT_ROUND_S + this.storyS + 8;     // a backstop: the level ends itself
    this.state = "load";            // load | play | won | time
    this.fruits = []; this.mergeQ = []; this.particles2 = []; this.rings = []; this.popups = []; this.floaters = [];
    this.score = 0; this.drops = 0; this.made = 0; this.merges = 0; this.harvests = 0;
    this.combo = 0; this.bestCombo = 0; this.lastMergeT = 0; this.comboShow = null;
    this.meter = 0; this.shakes = 0; this.shakesUsed = 0; this.wiggles = 0; this.shakeMode = null; this.shakeUntil = 0; this.boxOff = 0;
    this.overT = 0; this.overflows = 0; this.reliefUntil = 0;
    this.canDrop = true; this.nextAt = 0;
    this.aimX = W / 2; this.aimF = 0.5; this.handX = null; this.lastHandX = null; this.travel = 1e9;
    this.hold = null; this.grip = { closedAt: null };
    this.raiseAcc = 0;
    this.keyDir = 0; this.mouseUntil = 0;
    this.dropLog = []; this.edgeL = 0; this.edgeR = 0; this.byHow = { hold: 0, grasp: 0, key: 0 };
    this.biggest = 0; this.bestEver = Math.max(0, this.opts.bestFruit || 0); this.newBest = false;
    this.confetti = new Confetti();
    this.xCh = new Channel();
    [this.xLo, this.xHi] = xLimits(this.profile, this.side);
    this.sprites = []; this.spriteS = 0;
    this.carried = this.opts.board?.level === this.level ? this.opts.board : null;
    this.saidLevel = false;
    this.wonAt = 0; this.timeAt = 0;
    document.fonts?.load?.(`700 24px Fredoka`).catch(() => {});
    loadGlossy().then(() => { this.spriteS = 0; });       // rebuild the sprites with the pictures
    loadFluent(() => { this.spriteS = 0; });
    this.artIdx = 0;
    loadMatter().then(() => { if (this.active) this._initPhysics(); })
      .catch(() => { this.loadFailed = true; });
    this._bindInput();
  }

  stop() {
    super.stop();
    this._unbindInput();
  }

  // ---- physics (Matter.js), the mockup's world ----
  _initPhysics() {
    const { Engine, Bodies, Composite, Events } = MATTER;
    this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = 1.15;
    this.world = this.engine.world;
    Composite.add(this.world, Bodies.rectangle(W / 2, FLOOR + 60, 1200, 120, { isStatic: true, friction: .4 }));
    this.walls = []; this.pegs = [];
    this._setBox(this.LV.l, this.LV.r, this.LV.top, this.LV.pegList);
    const onCollide = ev => {
      for (const p of ev.pairs) {
        const a = p.bodyA, b = p.bodyB;
        if (a.fi === undefined || b.fi === undefined || a.fi !== b.fi || a.gone || b.gone) continue;
        a.gone = b.gone = true; this.mergeQ.push([a, b]);
      }
    };
    Events.on(this.engine, "collisionStart", onCollide);
    Events.on(this.engine, "collisionActive", onCollide);
    const now = performance.now();
    const c = this.carried;
    if (c) {
      // the box as the last round of this level left it
      for (const f of c.fruits || []) { const b = this._makeFruit(f.i, f.x, f.y); b.born = now - 3000; }
      this.score = c.score || 0; this.made = c.made || 0; this.drops = c.drops || 0;
      this.meter = c.meter || 0; this.shakes = c.shakes || 0;
      this.current = c.current ?? this._rand(); this.queue = c.queue?.length === 3 ? [...c.queue] : [this._rand(), this._rand(), this._rand()];
    } else {
      for (const p of this.LV.pre) { const b = this._makeFruit(p.i, p.x, p.y); b.born = now - 3000; b.prefill = true; }
      this.current = this._rand(); this.queue = [this._rand(), this._rand(), this._rand()];
    }
    this.acc = 0;
    this.state = "play";
    this._clampAim();
  }
  _setBox(l, r, top, pegList) {
    const { Bodies, Composite } = MATTER;
    Composite.remove(this.world, this.walls.concat(this.pegs.map(p => p.body)));
    this.BOX_L = l; this.BOX_R = r; this.BOX_TOP = top;
    this.walls = [
      Bodies.rectangle(l - 60, 0, 120, 3000, { isStatic: true, friction: .1 }),
      Bodies.rectangle(r + 60, 0, 120, 3000, { isStatic: true, friction: .1 }),
    ];
    this.pegs = (pegList || []).map(p => ({ ...p, body: Bodies.circle(p.x, p.y, p.r, { isStatic: true, restitution: .3, friction: .05 }) }));
    Composite.add(this.world, this.walls.concat(this.pegs.map(p => p.body)));
  }
  _rand() { return Math.floor(Math.random() * (this.LV.maxDrop + 1)); }
  _makeFruit(i, x, y) {
    const { Bodies, Composite } = MATTER;
    const b = Bodies.circle(x, y, FRUITS[i].r, { restitution: .18, friction: .12, frictionStatic: .5, frictionAir: .004, density: .0012, slop: .03 });
    b.fi = i; b.born = performance.now(); b.gone = false;
    this.fruits.push(b); Composite.add(this.world, b);
    return b;
  }
  _clampAim() {
    const r = FRUITS[this.current ?? 0].r;
    this.aimX = Math.max(this.BOX_L + r + 1, Math.min(this.BOX_R - r - 1, this.aimX));
  }

  // ---- merges, combos, the shake meter ----
  _processMerges(now) {
    const { Body, Composite } = MATTER;
    for (const [a, b] of this.mergeQ) {
      Composite.remove(this.world, [a, b]);
      this.fruits = this.fruits.filter(f => f !== a && f !== b);
      const i = a.fi, x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
      if (i < TOP) {
        const nb = this._makeFruit(i + 1, x, y);
        nb.popped = true;
        Body.setVelocity(nb, { x: (a.velocity.x + b.velocity.x) / 2, y: Math.min(0, (a.velocity.y + b.velocity.y) / 2) });
        if (this.drops === 0 && !this.carried) continue;      // starting fruit settling: no free points or goals
        this.merges++;
        const mult = this._chainCombo(now);
        const pts = Math.round(FRUITS[i + 1].pts * mult);
        this.score += pts;
        this.stats.stars += pts;
        this._burst(x, y, i + 1);
        this.popups.push({ x, y, t: 0, text: "+" + pts + (mult > 1 ? " ×" + mult : "") });
        audio.fruit("pop", i + 1);
        if (i + 1 > this.biggest) this.biggest = i + 1;
        if (i + 1 > this.bestEver) {
          this.bestEver = i + 1;
          if (i + 1 >= 4) { this.newBest = true; this.say(`Your first ${fruitName(i + 1).toLowerCase()}!`, true); }
        }
        if (this.state === "play" && i + 1 === this.LV.goal) {
          this.made++;
          if (this.made >= this.LV.count) this._won(now, i + 1);
          else this.say(`One ${fruitName(i + 1).toLowerCase()}. One more to go.`, true);
        }
      } else {
        // two pumpkins: a harvest! both go, and a shake is earned
        this.harvests++; this.merges++;
        this.score += 100; this.stats.stars += 100;
        this._burst(x, y, i, 40);
        this.popups.push({ x, y, t: 0, text: "+100 Harvest!" });
        audio.fruit("harvest");
        this.confetti.fire(this.canvas, [PALETTE.accent, "#ffc933", "#7cc65a", "#ffffff"], 30);
        if (this.shakes < 3) { this.shakes++; this.popups.push({ x, y: y + 30, t: 0, text: "+1 Shake" }); }
      }
    }
    this.mergeQ.length = 0;
  }
  _chainCombo(now) {
    this.combo = now - this.lastMergeT < 1200 ? this.combo + 1 : 1; this.lastMergeT = now;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = Math.min(4, 1 + (this.combo - 1) * .5);
    if (this.combo >= 2) { this.comboShow = { n: this.combo, t: 0 }; audio.fruit("combo", this.combo); }
    this.meter += 7 + 5 * (this.combo - 1);
    while (this.meter >= 100 && this.shakes < 3) { this.meter -= 100; this.shakes++; audio.fruit("charge"); if (this.shakes === 1) this.say("You earned a shake. Raise your hand to use it.", true); }
    if (this.shakes >= 3) this.meter = Math.min(this.meter, 100);
    return mult;
  }
  _burst(x, y, i, n) {
    const f = FRUITS[i]; n = n || 10 + i;
    if (A11Y.calm) n = Math.ceil(n / 3);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, sp = 1.2 + Math.random() * 2.6 + i * .12;
      this.particles2.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, col: k % 3 ? f.col : "#ffffff", s: 2 + Math.random() * 3 + i * .25 });
    }
    this.rings.push({ x, y, r: f.r * .6, R: f.r * 1.5, t: 0, col: f.col });
  }

  // ---- the shake: raise the hand to call it, wave side to side ----
  _useShake(now) {
    if (this.state !== "play" || this.shakes < 1 || this.shakeMode) return;
    this.shakes--; this.shakesUsed++;
    this.shakeMode = { start: now, end: now + SHAKE_MS, lastX: null, lastDir: 0, wiggles: 0 };
    this.shakeUntil = now + SHAKE_MS + 1800;
    this.hold = null;
    audio.fruit("shake");
    this.say("Wave your hand side to side!", true);
  }
  _shakeInput(x) {
    const sm = this.shakeMode;
    if (!sm) return;
    const { Body } = MATTER;
    if (sm.lastX === null) { sm.lastX = x; return; }
    let dx = x - sm.lastX; sm.lastX = x;
    dx = Math.max(-40, Math.min(40, dx));
    if (Math.abs(dx) < .5) return;
    const dir = Math.sign(dx);
    if (dir !== sm.lastDir && Math.abs(dx) > 2) {
      if (sm.lastDir !== 0) { sm.wiggles++; audio.fruit("wiggle", sm.wiggles); }
      sm.lastDir = dir;
    }
    if (!A11Y.calm) this.boxOff = Math.max(-16, Math.min(16, this.boxOff + dx * .45));
    for (const b of this.fruits) {
      const k = 1 / Math.sqrt(FRUITS[b.fi].r / 20);
      Body.setVelocity(b, { x: Math.max(-12, Math.min(12, b.velocity.x - dx * .3 * k)), y: Math.max(-10, b.velocity.y - Math.abs(dx) * .1 * k) });
      Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - .5) * .02 * Math.abs(dx));
    }
  }
  _endShake() {
    const w = this.shakeMode.wiggles; this.shakeMode = null;
    this.wiggles += w;
    this.popups.push({ x: W / 2, y: this.BOX_TOP + 60, t: 0, text: w + " wiggle" + (w === 1 ? "" : "s") + "!" });
  }

  // ---- input: the arm, plus mouse and keys for staff and testing ----
  _bindInput() {
    this._onKey = e => {
      if (!this.active || this.userPaused) return;
      if (e.type === "keyup") {
        if ((e.code === "ArrowLeft" && this.keyDir < 0) || (e.code === "ArrowRight" && this.keyDir > 0)) this.keyDir = 0;
        return;
      }
      if (this.state !== "play") return;
      const now = performance.now();
      if (this.shakeMode && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
        if (!e.repeat) { const x = this.shakeMode.lastX ?? W / 2; this._shakeInput(x); this._shakeInput(x + (e.code === "ArrowLeft" ? -30 : 30)); }
        e.preventDefault(); return;
      }
      if (e.code === "ArrowLeft") { this.keyDir = -1; this.mouseUntil = now + 2500; e.preventDefault(); }
      else if (e.code === "ArrowRight") { this.keyDir = 1; this.mouseUntil = now + 2500; e.preventDefault(); }
      else if (e.code === "ArrowDown" || e.code === "Enter") { e.preventDefault(); if (!this.shakeMode) this._drop(now, "key"); }
      else if (e.code === "KeyS") this._useShake(now);
      else if (e.code === "KeyN" || e.code === "KeyQ") this._swapNext();
      else if (e.code === "KeyT") { this.artIdx++; this.spriteS = 0; }
    };
    this._onMouse = e => {
      if (!this.active || this.state !== "play") return;
      const L = this._lay(this.canvas);
      const rect = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) * (this.canvas.width / rect.width) - L.ox) / L.S;
      if (x < -40 || x > W + 40) return;               // over the side panels: not the box
      if (this.shakeMode) { this._shakeInput(x); return; }
      this.aimX = x; this._clampAim(); this.mouseUntil = performance.now() + 2500;
      if (e.type === "click") this._drop(performance.now(), "key");
    };
    addEventListener("keydown", this._onKey);
    addEventListener("keyup", this._onKey);
    this.canvas.addEventListener("mousemove", this._onMouse);
    this.canvas.addEventListener("click", this._onMouse);
  }
  _unbindInput() {
    removeEventListener("keydown", this._onKey);
    removeEventListener("keyup", this._onKey);
    this.canvas.removeEventListener("mousemove", this._onMouse);
    this.canvas.removeEventListener("click", this._onMouse);
  }
  _swapNext() {
    if (this.state !== "play" || !this.canDrop || this.shakeMode) return;
    [this.current, this.queue[0]] = [this.queue[0], this.current];
    this._clampAim(); audio.fruit("swap");
  }
  // the lane: the sideways range in SW, grown live past what was measured,
  // times rangeScale about its own middle, never narrower than FRUIT_MIN_SPAN
  _lane() {
    const mid = (this.xLo + this.xHi) / 2;
    const half = Math.max(FRUIT_MIN_SPAN / 2, ((this.xHi - this.xLo) / 2 - FRUIT_X_PAD) * this.params.rangeScale);
    return { lo: mid - half, hi: mid + half, span: 2 * half };
  }
  _aimFromHand(now, dt) {
    const h = this.t.handRel(this.side);
    const x = this.xCh.push(h ? h.x : null, this.t.lastSeen, dt);
    if (x == null || !h) return;
    if (x < this.xLo) this.xLo = x;
    if (x > this.xHi) this.xHi = x;
    if (this.lastHandX != null) this.travel += Math.abs(x - this.lastHandX);
    this.lastHandX = x; this.handX = x;
    const ln = this._lane();
    this.aimF = clamp01((x - ln.lo) / ln.span);
    const r = FRUITS[this.current].r;
    const lx = this.BOX_L + r + 1, rx = this.BOX_R - r - 1;
    if (this.shakeMode) { this._shakeInput(this.BOX_L + this.aimF * (this.BOX_R - this.BOX_L)); return; }
    if (now < this.mouseUntil) return;                 // the mouse or the keys have it for a moment
    this.aimX = lx + this.aimF * (rx - lx);
  }
  // hold still to drop, or squeeze and open (the drawer's mode)
  _dropTick(now, dt) {
    if (!this.canDrop || this.shakeMode || this.state !== "play") { this.hold = null; return; }
    if (this.dropMode !== "grasp" && this.handX != null) {
      const ln = this._lane();
      this.armed = this.drops === 0 || this.travel >= FRUIT_REARM * ln.span;
      if (!this.armed) { this.hold = null; this.unarmedFor = (this.unarmedFor || 0) + dt; }
      else {
        this.unarmedFor = 0;
        const hd = this.hold;
        if (!hd) this.hold = { x0: this.handX, acc: 0, out: null };
        else if (Math.abs(this.handX - hd.x0) <= FRUIT_STILL_SW) { hd.acc += dt; hd.out = null; }
        else { hd.out ??= now; if (now - hd.out > FRUIT_STILL_GRACE) this.hold = { x0: this.handX, acc: 0, out: null }; }
        if (this.hold && this.hold.acc >= A11Y.dwellMs) { this._drop(now, "hold", this.hold.acc); return; }
      }
    }
    if (this.dropMode !== "hold" && this.t.handCurl(this.side) != null) {
      const closed = this.t.handClosed(this.side);
      if (closed) this.grip.closedAt ??= now;
      else {
        const held = this.grip.closedAt ? now - this.grip.closedAt : 0;
        this.grip.closedAt = null;
        if (held >= FRUIT_GRASP_MS) this._drop(now, "grasp", held);
      }
    }
  }
  _drop(now, how, holdMs = 0) {
    if (!this.canDrop || this.state !== "play" || !this.engine) return;
    const { Body } = MATTER;
    this._clampAim();
    const b = this._makeFruit(this.current, this.aimX, HOLD_Y);
    Body.setVelocity(b, { x: 0, y: 2 });
    this.canDrop = false; this.nextAt = now + FRUIT_NEXT_MS;
    this.drops++; this.byHow[how] = (this.byHow[how] || 0) + 1;
    audio.fruit("drop");
    // the round's bookkeeping, as GameBase.hit does it (without its chime:
    // the drop's own soft sound is the feedback)
    const f = (this.aimX - this.BOX_L) / Math.max(1, this.BOX_R - this.BOX_L);
    if (f <= 0.2) this.edgeL++;
    if (f >= 0.8) this.edgeR++;
    const hx = this.handX;
    let reachFrac = null;
    if (hx != null) { const env = this.envAt(hx >= CENTER.x ? 0 : Math.PI); reachFrac = env > 0 ? Math.abs(hx - CENTER.x) / env : null; }
    this.stats.hits++;
    if (reachFrac != null) this.stats.reachFracs.push(reachFrac);
    this.fb.lastEvent = now; this.fb.hitStreak++; this.fb.missStreak = 0;
    if (this.dropLog.length < 200) this.dropLog.push({
      t: Math.round((this.elapsed(now) - this.storyS) * 10) / 10, aim: Math.round(f * 100) / 100,
      x: hx != null ? Math.round(hx * 100) / 100 : null, travel: Math.round(Math.min(this.travel, 99) * 100) / 100,
      how, holdMs: Math.round(holdMs), fruit: this.current,
    });
    this.travel = 0; this.hold = null; this.grip.closedAt = null;
    if (this.drops === 1 && this.opts.tellStory) this.say("Lovely. Two of the same fruit join together.", true);
  }
  // the top fruit roll away instead of a game over
  _relief(now) {
    const { Composite } = MATTER;
    const going = this.fruits.filter(b => now - b.born > 1500 && b.position.y - FRUITS[b.fi].r < this.BOX_TOP + 60);
    for (const b of going) {
      Composite.remove(this.world, b); b.gone = true;
      this._burst(b.position.x, b.position.y, b.fi, 8);
      this.floaters.push({ i: b.fi, x: b.position.x, y: b.position.y, a: b.angle, t: 0 });
    }
    this.fruits = this.fruits.filter(b => !b.gone);
    this.overflows++;
    this.miss(null, true);
    this.reliefUntil = now + 2500;
    audio.fruit("relief");
    this.say("The box was full, so the top fruit rolled away. Keep going!", true);
  }
  _won(now, gi) {
    this.state = "won"; this.wonAt = now; this.wonFruit = gi;
    audio.fruit("win");
    this.confetti.fire(this.canvas, [PALETTE.accent, "#ffc933", "#7cc65a", "#ffffff"], 40);
    this.say(`Level ${this.level} complete!`, true);
  }
  _liveStars() {
    const done = this.made >= this.LV.count;
    return (this.edgeL > 0 && this.edgeR > 0 ? 1 : 0) + (done ? 1 : 0) + (done && this.overflows === 0 ? 1 : 0);
  }
  _stars() {
    // one for the goal, one for both sides of the box, one for never too full
    return 1 + (this.edgeL > 0 && this.edgeR > 0 ? 1 : 0) + (this.overflows === 0 ? 1 : 0);
  }

  update(now, dt) {
    if (this.loadFailed) return;
    if (!this.engine) return;
    const playT = this.elapsed(now) - this.storyS;
    if (this.state === "play" && !this.saidLevel && playT >= 0) {
      this.saidLevel = true;
      const lv = this.LV;
      this.say(`Level ${lv.n}. ${goalPhrase(lv)}.${lv.news.length ? " " + lv.news[0].replace("New:", "And new,") + "." : ""}`, true);
    }
    if (this.state === "play" && playT >= FRUIT_ROUND_S) {
      this.state = "time"; this.timeAt = now;
      this.say("Time for a rest. Your box will be here next time.", true);
    }
    if ((this.state === "won" && now - this.wonAt > 3200) || (this.state === "time" && now - this.timeAt > 2600)) { this._end(); return; }
    // aim and drop
    this._aimFromHand(now, dt);
    if (this.keyDir) { this.aimX += this.keyDir * dt * .35; this._clampAim(); }
    if (!this.canDrop && now >= this.nextAt && this.state === "play") {
      this.current = this.queue.shift(); this.queue.push(this._rand());
      this.canDrop = true; this._clampAim();
    }
    if (playT >= 0) this._dropTick(now, dt);
    // a raised hand calls up the shake
    const h = this.t.handRel(this.side);
    if (this.state === "play" && this.shakes > 0 && !this.shakeMode && h && h.y - CENTER.y >= FRUIT_RAISE * this.params.rangeScale * this.envAt(Math.PI / 2)) {
      this.raiseAcc += dt;
      if (this.raiseAcc >= FRUIT_RAISE_MS) { this.raiseAcc = 0; this._useShake(now); }
    } else this.raiseAcc = Math.max(0, this.raiseAcc - dt * 2);
    if (this.shakeMode && now > this.shakeMode.end) this._endShake();
    // the physics, at the mockup's fixed 60 Hz
    if (this.state !== "time") {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 6) { MATTER.Engine.update(this.engine, STEP); this._processMerges(now); this.acc -= STEP; n++; }
      if (n === 6) this.acc = 0;
    }
    // too full: a fruit settled above the top line for a while
    if (this.state === "play") {
      let over = false;
      for (const b of this.fruits) if (now - b.born > 1500 && b.position.y - FRUITS[b.fi].r < this.BOX_TOP) { over = true; break; }
      if (now < this.shakeUntil || now < this.reliefUntil) over = false;
      if (over) { this.overT += dt; if (this.overT > FRUIT_OVER_MS) { this.overT = 0; this._relief(now); } }
      else this.overT = Math.max(0, this.overT - dt * 2);
    }
  }

  // ---- layout: the board in the middle, the mockup's side panels ----
  _lay(c) {
    const k = uu(c), Wc = c.width, Hc = c.height;
    // the floor stays above the spoken-line bar (#cue, bottom centre on every screen)
    const top = 116 * k, bottom = Hc - 112 * k;
    const S = Math.min((bottom - top) / H, (Wc * 0.42) / W);
    const bw = W * S, bh = H * S;
    const ox = (Wc - bw) / 2, oy = bottom - bh;
    const colW = Math.max(160 * k, Math.min(300 * k, ox - 70 * k));
    return { k, S, ox, oy, bw, bh, colW, leftX: ox - 40 * k - colW, rightX: ox + bw + 40 * k };
  }
  // the picture set in use: glossy (local file) > Fluent (the repo's) > drawn; T cycles
  _artStyle() {
    const styles = [GLOSSY?.size ? "glossy" : null, "fluent", "drawn"].filter(Boolean);
    return styles[(this.artIdx || 0) % styles.length];
  }
  _sprite(i) {
    const s = this.sprites[i];
    if (s) return s;
    const f = FRUITS[i], ppu = Math.min(4, this.spriteS);
    const half = f.r * EXT, px = Math.max(8, Math.ceil(half * 2 * ppu));
    const cv = document.createElement("canvas"); cv.width = cv.height = px;
    const x = cv.getContext("2d");
    x.scale(px / (half * 2), px / (half * 2)); x.translate(half, half);
    const style = this._artStyle();
    const gl = style === "glossy" && GLOSSY?.get(f.n);
    const fl = style !== "drawn" && FLUENT?.[f.art];
    x.imageSmoothingQuality = "high";
    if (gl && gl.naturalWidth) {
      const fit = f.r * 2.18 / Math.max(gl.naturalWidth, gl.naturalHeight);
      x.drawImage(gl, -gl.naturalWidth * fit / 2, -gl.naturalHeight * fit / 2, gl.naturalWidth * fit, gl.naturalHeight * fit);
    } else if (fl && fl.complete && fl.naturalWidth) {
      // the glossy set has no pumpkin: it, and every fruit on the public site, is Fluent's
      const [d, cx, cy] = FLUENT_FIT[f.art], u = fl.naturalWidth / 256, sc = f.r * 2 * FLUENT_FILL / (d * u);
      x.drawImage(fl, -cx * u * sc, -cy * u * sc, fl.naturalWidth * sc, fl.naturalHeight * sc);
    } else drawFruit(x, f.art, f.r);
    return (this.sprites[i] = { c: cv, half });
  }
  // a fruit drawn at a logical radius in the current (board) transform
  _drawFruitAt(ctx, i, x, y, ang = 0, sc = 1) {
    const s = this._sprite(i);
    ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(ang); if (sc !== 1) ctx.scale(sc, sc);
    ctx.drawImage(s.c, -s.half, -s.half, s.half * 2, s.half * 2); ctx.restore();
  }
  // a fruit icon at a screen point, `size` px across its body
  _icon(ctx, i, x, y, size, dim = false) {
    const s = this._sprite(i), sc = size / (FRUITS[i].r * 2);
    ctx.save();
    if (dim) { ctx.globalAlpha = 0.45; ctx.filter = "saturate(0.6)"; }
    ctx.drawImage(s.c, x - s.half * sc, y - s.half * sc, s.half * 2 * sc, s.half * 2 * sc);
    ctx.restore();
  }

  drawBg(ctx, c, now) {
    // the mockup's peach sky with its two dot patterns
    ctx.fillStyle = PALETTE.bg; ctx.fillRect(0, 0, c.width, c.height);
    const k = uu(c);
    ctx.fillStyle = PALETTE.dot;
    for (let y = 12 * k; y < c.height; y += 48 * k) for (let x = 12 * k; x < c.width; x += 48 * k) { ctx.beginPath(); ctx.arc(x, y, 5 * k, 0, TAU); ctx.fill(); }
    ctx.fillStyle = PALETTE.mintDot;
    for (let y = 45 * k; y < c.height; y += 64 * k) for (let x = 48 * k; x < c.width; x += 64 * k) { ctx.beginPath(); ctx.arc(x, y, 4 * k, 0, TAU); ctx.fill(); }
    // faint fruit drifting in the margins (the mockup's floaters)
    if (this.spriteS) {
      const spots = [[.04, .12, 6, 120], [.1, .66, 2, 90], [.02, .4, 5, 70], [.14, .88, 3, 110], [.86, .1, 7, 100], [.93, .45, 1, 130], [.82, .76, 4, 80], [.9, .92, 6, 60]];
      ctx.save(); ctx.globalAlpha = 0.16;
      for (const [fx, fy, i, s] of spots) {
        const bob = A11Y.calm ? 0 : Math.sin(now / 2200 + fx * 9) * 14 * k;
        this._icon(ctx, i, fx * c.width, fy * c.height + bob, s * k);
      }
      ctx.restore();
    }
  }

  draw(ctx, c, now) {
    const L = this._lay(c);
    if (Math.abs(this.spriteS - L.S) > 0.01) { this.spriteS = L.S; this.sprites = []; }
    if (!this.engine) {
      ctx.save(); ctx.fillStyle = PALETTE.ink; ctx.font = `600 ${Math.round(34 * L.k)}px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText(this.loadFailed ? "The game could not load. Please check the connection." : "One moment…", c.width / 2, c.height / 2);
      ctx.restore();
      return;
    }
    const dtv = Math.min(50, now - (this._lastDraw || now)); this._lastDraw = now;
    // the board, in logical units
    ctx.save();
    ctx.setTransform(L.S, 0, 0, L.S, L.ox, L.oy);
    this.boxOff *= Math.pow(.86, dtv / 16.67);
    if (Math.abs(this.boxOff) > .2) ctx.translate(this.boxOff, 0);
    this._drawBox(ctx, now);
    // the aim guide, under the fruit
    const holding = this.state === "play" && this.canDrop && !this.shakeMode;
    if (holding) {
      const r = FRUITS[this.current].r;
      ctx.save(); ctx.setLineDash([2, 10]); ctx.lineCap = "round"; ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(214,150,120,.45)";
      ctx.beginPath(); ctx.moveTo(this.aimX, HOLD_Y + r + 6); ctx.lineTo(this.aimX, FLOOR - 4); ctx.stroke(); ctx.restore();
    }
    if (this.drops === 0 && this.state === "play" && !this.carried) this._drawLevelIntro(ctx);
    for (const p of this.pegs) {
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, p.r, 0, TAU); ctx.fillStyle = "#d9a477"; ctx.fill();
      const g = ctx.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, p.r);
      g.addColorStop(0, "#fbe3c6"); g.addColorStop(1, "#e8b88a");
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "#c98d5e";
      for (const [dx, dy] of [[-4, -2], [3, 3], [4, -4]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, 1.6, 0, TAU); ctx.fill(); }
    }
    for (const b of this.fruits) {
      let sc = 1;
      if (b.popped && !A11Y.calm) { const t = (now - b.born) / 240; if (t < 1) sc = .55 + .45 * easeOutBack(Math.max(0, t)); }
      this._drawFruitAt(ctx, b.fi, b.position.x, b.position.y, b.angle, sc);
    }
    // fruit rolling away from a full box: up, turning, fading
    for (const f of this.floaters) {
      f.t += dtv / 900;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - f.t);
      this._drawFruitAt(ctx, f.i, f.x + Math.sin(f.t * 5) * 8, f.y - f.t * 120, f.a + f.t * 2, 1 - f.t * .3);
      ctx.restore();
    }
    this.floaters = this.floaters.filter(f => f.t < 1);
    this._drawEffects(ctx, dtv);
    ctx.restore();

    // the patient's own hand behind the fruit it carries (Pong's hand on its
    // paddle): translucent, fitted by the palm, screen space
    if (holding) this._drawHeldHand(ctx, c, L);
    ctx.save();
    ctx.setTransform(L.S, 0, 0, L.S, L.ox + (Math.abs(this.boxOff) > .2 ? this.boxOff * L.S : 0), L.oy);
    if (holding) {
      const r = FRUITS[this.current].r;
      const bob = A11Y.calm ? 0 : Math.sin(now / 260) * 2;
      this._drawFruitAt(ctx, this.current, this.aimX, HOLD_Y + bob, A11Y.calm ? 0 : Math.sin(now / 500) * .08, 1);
      // the hold's progress, a ring round the fruit
      const f = this.hold ? Math.min(1, this.hold.acc / A11Y.dwellMs) : 0;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,143,112,.25)"; ctx.lineWidth = 5;
      if (this.dropMode !== "grasp" && this.armed) { ctx.beginPath(); ctx.arc(this.aimX, HOLD_Y + bob, r + 9, 0, TAU); ctx.stroke(); }
      if (f > 0) {
        ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(this.aimX, HOLD_Y + bob, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
      // a resting hand: say what to do, gently, after a while
      if (this.dropMode !== "grasp" && !this.armed && (this.unarmedFor || 0) > 2500) {
        ctx.font = `600 18px ${FONT}`; ctx.textAlign = "center"; ctx.lineJoin = "round";
        ctx.lineWidth = 6; ctx.strokeStyle = PALETTE.card; ctx.strokeText("Move your hand to aim", W / 2, this.BOX_TOP + 40);
        ctx.fillStyle = PALETTE.ink; ctx.fillText("Move your hand to aim", W / 2, this.BOX_TOP + 40);
      }
    }
    this._drawBanners(ctx, now, dtv);
    ctx.restore();

    this._drawPanels(ctx, c, L, now);
    this.confetti.draw(ctx, now);
    const used = Math.max(0, this.elapsed(now) - this.storyS) / FRUIT_ROUND_S;
    drawClock(ctx, c, used, { accent: ACCENTS.fruit, surface: "day", secondsLeft: FRUIT_ROUND_S - Math.max(0, this.elapsed(now) - this.storyS) });
    if (this.state === "won" || this.state === "time") this._drawEndCard(ctx, c, L, now);
  }

  _roundedU(ctx, x0, x1, top, bottom, rad) {
    ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0, bottom - rad);
    ctx.quadraticCurveTo(x0, bottom, x0 + rad, bottom); ctx.lineTo(x1 - rad, bottom);
    ctx.quadraticCurveTo(x1, bottom, x1, bottom - rad); ctx.lineTo(x1, top);
  }
  _drawBox(ctx, now) {
    const L = this.BOX_L, R = this.BOX_R, T = this.BOX_TOP;
    const g = ctx.createLinearGradient(0, T, 0, FLOOR);
    g.addColorStop(0, "#fffaf4"); g.addColorStop(1, "#fff0e3");
    this._roundedU(ctx, L, R, T - 10, FLOOR, 22); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    // soft gingham
    ctx.save(); this._roundedU(ctx, L, R, T - 10, FLOOR, 22); ctx.closePath(); ctx.clip();
    ctx.fillStyle = "rgba(255,190,160,.07)";
    for (let x = L; x < R; x += 36) ctx.fillRect(x, T - 10, 18, FLOOR - T + 10);
    for (let y = T; y < FLOOR; y += 36) ctx.fillRect(L, y, R - L, 18);
    ctx.restore();
    // walls
    this._roundedU(ctx, L - 5, R + 5, T - 12, FLOOR + 5, 26);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = 12; ctx.strokeStyle = "#e9b994"; ctx.stroke();
    this._roundedU(ctx, L - 5, R + 5, T - 12, FLOOR + 5, 26);
    ctx.lineWidth = 5; ctx.strokeStyle = "#f6d3b5"; ctx.stroke();
    // the top line: it pulses (amber, dashed, never a red alarm) while the box is too full
    const warn = this.overT > 0 && this.state === "play";
    ctx.save(); ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.strokeStyle = warn ? `rgba(224,120,40,${.55 + .45 * Math.sin(now / 140)})` : "rgba(240,160,140,.45)";
    ctx.beginPath(); ctx.moveTo(L + 8, T); ctx.lineTo(R - 8, T); ctx.stroke(); ctx.restore();
  }
  _drawLevelIntro(ctx) {
    const lv = this.LV, cy = this.BOX_TOP + 110;
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(106,70,54,.62)";
    ctx.font = `700 28px ${FONT}`; ctx.fillText("Level " + lv.n, W / 2, cy);
    ctx.font = `600 21px ${FONT}`; ctx.fillText(goalPhrase(lv), W / 2, cy + 30);
    let y = cy + 60;
    if (lv.news.length) { ctx.fillStyle = ACCENTS.fruit.deep; ctx.fillText(lv.news[0], W / 2, y); y += 28; ctx.fillStyle = "rgba(106,70,54,.62)"; }
    ctx.font = `500 17px ${FONT}`;
    if (lv.n <= 2) {
      ctx.fillText(this.dropMode === "grasp" ? "Move your hand to aim, squeeze and open to drop" : "Move your hand to aim, hold still to drop", W / 2, y);
      ctx.fillText("Match two of a kind!", W / 2, y + 22);
    }
  }
  _drawEffects(ctx, dtv) {
    const k = dtv / 16.67;
    for (const r of this.rings) {
      r.t += dtv / 380; const t = Math.min(1, r.t);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.R - r.r) * t, 0, TAU);
      ctx.strokeStyle = r.col; ctx.globalAlpha = (1 - t) * .5; ctx.lineWidth = 6 * (1 - t) + 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    this.rings = this.rings.filter(r => r.t < 1);
    for (const p of this.particles2) {
      p.x += p.vx * k; p.y += p.vy * k; p.vy += .12 * k; p.vx *= .97; p.life -= .028 * k;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * Math.max(.2, p.life), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; this.particles2 = this.particles2.filter(p => p.life > 0);
    ctx.textAlign = "center"; ctx.font = `700 22px ${FONT}`;
    for (const p of this.popups) {
      p.t += dtv / 900; const a = 1 - p.t;
      ctx.globalAlpha = Math.max(0, a); ctx.lineWidth = 5; ctx.strokeStyle = PALETTE.card; ctx.lineJoin = "round";
      ctx.strokeText(p.text, p.x, p.y - 30 * p.t); ctx.fillStyle = ACCENTS.fruit.deep; ctx.fillText(p.text, p.x, p.y - 30 * p.t);
    }
    ctx.globalAlpha = 1; this.popups = this.popups.filter(p => p.t < 1);
  }
  _drawBanners(ctx, now, dtv) {
    if (this.comboShow) {
      this.comboShow.t += dtv / 1000; const t = this.comboShow.t;
      const sc = A11Y.calm ? 1 : t < .15 ? .6 + t / .15 * .5 : 1.1 - Math.min(.1, (t - .15));
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - .6) / .4); ctx.translate(W / 2, this.BOX_TOP + 46); ctx.scale(sc, sc);
      ctx.font = `700 32px ${FONT}`; ctx.textAlign = "center"; ctx.lineJoin = "round";
      ctx.lineWidth = 7; ctx.strokeStyle = PALETTE.card; ctx.strokeText("Combo ×" + this.comboShow.n, 0, 0);
      ctx.fillStyle = this.comboShow.n >= 4 ? "#c8302f" : ACCENTS.fruit.deep; ctx.fillText("Combo ×" + this.comboShow.n, 0, 0);
      ctx.restore(); if (t > 1) this.comboShow = null;
    }
    if (this.shakeMode && this.state === "play") {
      const left = Math.max(0, (this.shakeMode.end - now) / SHAKE_MS);
      ctx.save(); ctx.translate(-this.boxOff, 0);
      ctx.textAlign = "center"; ctx.lineJoin = "round"; ctx.font = `700 24px ${FONT}`;
      const msg = "Wave side to side to shake!";
      ctx.lineWidth = 7; ctx.strokeStyle = PALETTE.card; ctx.strokeText(msg, W / 2, 36); ctx.fillStyle = "#3f7d2e"; ctx.fillText(msg, W / 2, 36);
      ctx.fillStyle = "#f3e1d2"; rrect(ctx, W / 2 - 110, 52, 220, 12, 6); ctx.fill();
      ctx.fillStyle = "#7cc65a"; rrect(ctx, W / 2 - 110, 52, Math.max(12, 220 * left), 12, 6); ctx.fill();
      ctx.font = `600 17px ${FONT}`; ctx.fillStyle = PALETTE.ink;
      ctx.fillText("Wiggles: " + this.shakeMode.wiggles, W / 2, 88);
      ctx.restore();
    }
  }
  _drawHeldHand(ctx, c, L) {
    const pts = this.t._handPts?.(this.side), pm = this.t.palmPx(this.side, c);
    if (!pts || !pm) return;
    const w = this.t._videoToPx(pts[0].x, pts[0].y, c), m = this.t._videoToPx(pts[9].x, pts[9].y, c);
    const ext = Math.hypot(m.x - w.x, m.y - w.y) * 2;      // an open hand's length from its palm
    if (!(ext > 2)) return;
    const r = FRUITS[this.current].r;
    const want = Math.max(70, r * 2.4) * L.S;
    const k = Math.max(0.12, Math.min(3, want / ext));
    const cx = L.ox + this.aimX * L.S, cy = L.oy + HOLD_Y * L.S;
    ctx.save(); ctx.globalAlpha = 0.5;
    drawHand(ctx, c, this.t, this.side, { map: q => ({ x: (q.x - pm.x) * k + cx, y: (q.y - pm.y) * k + cy }), scale: k, fallback: false, surface: "day" });
    ctx.restore();
  }

  // ---- the mockup's side panels, as canvas cards ----
  _card(ctx, x, y, w, h, r, k) {
    ctx.save();
    ctx.fillStyle = PALETTE.edge; rrect(ctx, x, y + 5 * k, w, h, r); ctx.fill();
    ctx.shadowColor = "rgba(170,110,80,.14)"; ctx.shadowBlur = 30 * k; ctx.shadowOffsetY = 14 * k;
    ctx.fillStyle = PALETTE.card; rrect(ctx, x, y, w, h, r); ctx.fill();
    ctx.restore();
  }
  _label(ctx, text, x, y, k, align = "center") {
    ctx.save(); ctx.font = `600 ${Math.round(17 * k)}px ${FONT}`; ctx.fillStyle = alpha(PALETTE.ink, 0.75);
    ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${(1.4 * k).toFixed(1)}px`;
    ctx.fillText(text.toUpperCase(), x, y); ctx.restore();
  }
  _drawPanels(ctx, c, L, now) {
    const k = L.k, lx = L.leftX, rx = L.rightX, cw = L.colW, s = cw / 300;
    const lv = this.LV;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    // LEFT: the goal card, the score, the shake
    let y = 150 * k;
    const gh = 290 * s;
    this._card(ctx, lx, y, cw, gh, 26 * k, k);
    // the level chip: ink on the coral (white on it fails contrast)
    ctx.font = `700 ${Math.round(22 * s)}px ${FONT}`;
    const chip = `Level ${lv.n}`, chw = ctx.measureText(chip).width + 30 * s;
    ctx.fillStyle = PALETTE.accent; rrect(ctx, lx + cw / 2 - chw / 2, y + 18 * s, chw, 36 * s, 18 * s); ctx.fill();
    ctx.fillStyle = ACCENTS.fruit.on; ctx.textAlign = "center"; ctx.fillText(chip, lx + cw / 2, y + 44 * s);
    this._icon(ctx, lv.goal, lx + cw / 2, y + 120 * s, 92 * s);
    ctx.fillStyle = PALETTE.ink; ctx.font = `700 ${Math.round(28 * s)}px ${FONT}`;
    ctx.fillText(goalPhrase(lv), lx + cw / 2, y + 205 * s);
    ctx.font = `600 ${Math.round(22 * s)}px ${FONT}`; ctx.fillStyle = alpha(PALETTE.ink, 0.8);
    ctx.fillText(`${Math.min(this.made, lv.count)} of ${lv.count}`, lx + cw / 2, y + 238 * s);
    // the stars earned so far: both sides of the box lights one at any time;
    // the goal and the steady box light theirs when the level is done
    const st = this._liveStars();
    ctx.font = `700 ${Math.round(34 * s)}px ${FONT}`;
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < st ? PALETTE.star : PALETTE.starOff; ctx.fillText("★", lx + cw / 2 + (i - 1) * 38 * s, y + 276 * s); }
    y += gh + 26 * k;
    // score
    const sh = 104 * s;
    this._card(ctx, lx, y, cw, sh, 22 * k, k);
    this._label(ctx, "Score", lx + cw / 2, y + 32 * s, s);
    ctx.fillStyle = PALETTE.ink; ctx.font = `700 ${Math.round(46 * s)}px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText(String(this.score), lx + cw / 2, y + 84 * s);
    y += sh + 34 * k;
    // the shake tool: a round button with its meter, the charges and how to call it
    const tr = 52 * s, tx = lx + cw / 2, ty = y + tr;
    ctx.save();
    ctx.fillStyle = PALETTE.edge; ctx.beginPath(); ctx.arc(tx, ty + 4 * k, tr, 0, TAU); ctx.fill();
    ctx.fillStyle = this.shakeMode ? PALETTE.accent : PALETTE.card; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.fill();
    ctx.lineCap = "round"; ctx.lineWidth = 7 * s;
    ctx.strokeStyle = "#f3e1d2"; ctx.beginPath(); ctx.arc(tx, ty, tr + 9 * s, 0, TAU); ctx.stroke();
    const mf = this.shakes >= 3 ? 1 : Math.min(1, this.meter / 100);
    if (mf > 0) { ctx.strokeStyle = "#7cc65a"; ctx.beginPath(); ctx.arc(tx, ty, tr + 9 * s, -Math.PI / 2, -Math.PI / 2 + TAU * mf); ctx.stroke(); }
    // ready: a soft glow, and the raise's progress as a second ring
    if (this.shakes > 0 && !this.shakeMode && !A11Y.calm) { ctx.strokeStyle = `rgba(124,198,90,${.25 + .2 * Math.sin(now / 300)})`; ctx.lineWidth = 9 * s; ctx.beginPath(); ctx.arc(tx, ty, tr + 20 * s, 0, TAU); ctx.stroke(); }
    if (this.raiseAcc > 0) { ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 7 * s; ctx.beginPath(); ctx.arc(tx, ty, tr + 20 * s, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.raiseAcc / FRUIT_RAISE_MS)); ctx.stroke(); }
    ctx.strokeStyle = this.shakeMode ? "#3d2a24" : (this.shakes ? PALETTE.ink : alpha(PALETTE.ink, 0.3)); ctx.lineWidth = 5 * s;
    for (const dy of [-12, 12]) {
      ctx.beginPath();
      for (let q = 0; q <= 24; q++) { const xx = tx - 28 * s + q * 56 * s / 24, yy = ty + dy * s + Math.sin(q / 24 * TAU * 1.5) * 6 * s; q ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.fillStyle = this.shakes ? PALETTE.accent : "#d9c3b0";
    ctx.beginPath(); ctx.arc(tx + tr * .78, ty - tr * .78, 17 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = ACCENTS.fruit.on; ctx.font = `700 ${Math.round(20 * s)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(this.shakes), tx + tr * .78, ty - tr * .78 + 1);
    ctx.textBaseline = "alphabetic"; ctx.fillStyle = PALETTE.ink; ctx.font = `600 ${Math.round(20 * s)}px ${FONT}`;
    ctx.fillText(this.shakeMode ? "Shaking!" : this.shakes ? "Raise your hand to shake" : "Shake", tx, ty + tr + 44 * s);
    ctx.restore();

    // RIGHT: next, then the evolution ring
    y = 150 * k;
    const nh = 230 * s;
    this._card(ctx, rx, y, cw, nh, 26 * k, k);
    this._label(ctx, "Next", rx + cw / 2, y + 34 * s, s);
    const bx = rx + cw * .4, by = y + 130 * s, br = 62 * s;
    ctx.fillStyle = PALETTE.card; ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#f6d9c4"; ctx.lineWidth = 4 * s; ctx.stroke();
    if (this.queue) {
      this._icon(ctx, this.queue[0], bx, by, 84 * s);
      this._icon(ctx, this.queue[1], rx + cw * .8, y + 104 * s, 52 * s);
      this._icon(ctx, this.queue[2], rx + cw * .8, y + 166 * s, 40 * s);
    }
    y += nh + 26 * k;
    const rh = cw;
    this._card(ctx, rx, y, cw, rh, 26 * k, k);
    const ccx = rx + cw / 2, ccy = y + rh / 2, R = 104 * s;
    ctx.save(); ctx.setLineDash([2 * s, 11 * s]); ctx.lineCap = "round"; ctx.lineWidth = 5 * s; ctx.strokeStyle = "#f1d6c0";
    ctx.beginPath(); ctx.arc(ccx, ccy, R, 0, TAU); ctx.stroke(); ctx.restore();
    const seenTo = Math.max(this.bestEver, this.biggest, lv.maxDrop, ...this.fruits.map(b => b.fi));
    FRUITS.forEach((f, i) => {
      const a = (i * 360 / FRUITS.length - 90) * Math.PI / 180;
      const px = ccx + Math.cos(a) * R, py = ccy + Math.sin(a) * R, sz = (34 + i * 4) * s;
      if (i === lv.goal) { ctx.save(); ctx.setLineDash([6 * s, 5 * s]); ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(px, py, sz * .66, 0, TAU); ctx.stroke(); ctx.restore(); }
      this._icon(ctx, i, px, py, sz, i > seenTo);
    });
    this._label(ctx, "Evolution", ccx, ccy + 6 * s, s);
    ctx.restore();
  }

  _drawEndCard(ctx, c, L, now) {
    const won = this.state === "won", since = now - (won ? this.wonAt : this.timeAt);
    const k = L.k, t = Math.min(1, since / 400), sc = A11Y.calm ? 1 : .85 + .15 * easeOutBack(t);
    const w = 520 * k, h = (won ? 400 : 300) * k, x = c.width / 2 - w / 2, y = c.height / 2 - h / 2;
    ctx.save();
    ctx.fillStyle = `rgba(106,70,54,${.25 * t})`; ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = t; ctx.translate(c.width / 2, c.height / 2); ctx.scale(sc, sc); ctx.translate(-c.width / 2, -c.height / 2);
    ctx.fillStyle = PALETTE.edge; rrect(ctx, x, y + 8 * k, w, h, 32 * k); ctx.fill();
    ctx.fillStyle = PALETTE.card; rrect(ctx, x, y, w, h, 32 * k); ctx.fill();
    ctx.textAlign = "center"; ctx.fillStyle = PALETTE.ink;
    if (won) {
      this._icon(ctx, this.wonFruit ?? this.LV.goal, c.width / 2, y + 90 * k, 110 * k);
      ctx.font = `700 ${Math.round(40 * k)}px ${FONT}`; ctx.fillText(`Level ${this.level} complete!`, c.width / 2, y + 205 * k);
      const st = this._stars();
      ctx.font = `700 ${Math.round(56 * k)}px ${FONT}`;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < st ? PALETTE.star : PALETTE.starOff; ctx.fillText("★", c.width / 2 + (i - 1) * 64 * k, y + 280 * k); }
      ctx.fillStyle = alpha(PALETTE.ink, 0.85); ctx.font = `600 ${Math.round(24 * k)}px ${FONT}`;
      const line = this.edgeL && this.edgeR ? (this.overflows ? "You reached both sides of the box." : "Both sides of the box, and never too full!")
        : "Next time, try dropping at both sides.";
      ctx.fillText(line, c.width / 2, y + 340 * k);
    } else {
      ctx.font = `700 ${Math.round(44 * k)}px ${FONT}`; ctx.fillText("Time for a rest", c.width / 2, y + 110 * k);
      ctx.fillStyle = alpha(PALETTE.ink, 0.85); ctx.font = `600 ${Math.round(26 * k)}px ${FONT}`;
      ctx.fillText(`You made ${Math.min(this.made, this.LV.count)} of ${this.LV.count}.`, c.width / 2, y + 170 * k);
      ctx.fillText("Your box is kept for next time.", c.width / 2, y + 214 * k);
    }
    ctx.restore();
  }

  // Pong's pattern: no arm skeleton over the board, only the hand on the fruit
  _drawArmAndCursor() {}

  extra() {
    const won = this.state === "won";
    const xs = this.dropLog.map(d => d.x).filter(v => v != null);
    const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
    const across = xs.filter(x => this.side === "right" ? x < CENTER.x : x > CENTER.x).length;
    const ln = this._lane();
    return {
      level: this.level,
      fruitLevel: won ? Math.min(FRUIT_MAX, this.level + 1) : this.level,   // banked by main.js
      completed: won, won,
      goal: this.LV.goal, goalFruit: fruitName(this.LV.goal), goalCount: this.LV.count, made: this.made,
      levelStars: won ? this._stars() : 0,
      drops: this.drops, merges: this.merges, harvests: this.harvests, score: this.score,
      biggest: this.biggest, biggestFruit: fruitName(this.biggest), bestFruit: this.bestEver, newBest: this.newBest, recordBeat: this.newBest,
      bestCombo: this.bestCombo, shakesUsed: this.shakesUsed, wiggles: this.wiggles, overflows: this.overflows,
      edgeLeft: this.edgeL, edgeRight: this.edgeR, acrossPct: xs.length ? Math.round(across / xs.length * 100) : 0,
      aimSpreadSW: Math.round(sd * 100) / 100,
      holdDrops: this.byHow.hold || 0, graspDrops: this.byHow.grasp || 0, keyDrops: this.byHow.key || 0,
      dropMode: this.dropMode, art: this._artStyle(),
      laneSW: { lo: Math.round(ln.lo * 100) / 100, hi: Math.round(ln.hi * 100) / 100 },
      dropLog: this.dropLog,
      // the box, for the next round of the same level (main.js keeps it for
      // the session and takes it off the record before it is stored)
      board: won || !this.engine ? null : {
        level: this.level, made: this.made, score: this.score, drops: this.drops, meter: this.meter, shakes: this.shakes,
        current: this.current, queue: this.queue,
        fruits: this.fruits.filter(b => !b.gone).map(b => ({ i: b.fi, x: Math.round(b.position.x * 10) / 10, y: Math.round(b.position.y * 10) / 10 })),
      },
    };
  }
}

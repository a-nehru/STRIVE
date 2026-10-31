// STRIVE THEME (30 Oct 2026, by request: one look for every screen; the
// direction is docs/design-system-proposal.md and docs/moodboard/). Every
// colour, type size, radius and duration the app draws with lives here, and
// applyThemeCSS() writes the same values to :root custom properties at boot,
// so the stylesheet and the canvas games read ONE source. A game declares its
// accent (accentOf) and draws its chrome through js/ui.js.
import { A11Y } from "./a11y.js";

// warm white base, ink text, and four system colours. Every text pair used
// here passes WCAG AA (ratios in the proposal, section 2).
export const C = {
  paper: "#F6F2EA",      // the Day surface
  card: "#FFFFFF",
  line: "#D8D2C4",       // decorative dividers only
  ink: "#1E2235",        // text, outlines, character faces
  ink2: "#4B5068",       // secondary text (7.1:1 on paper)
  ink3: "#5F6378",       // hints (5.3:1 on paper)
  night: "#14172A",      // the Night surface, camera and video stages
  nightCard: "#22263D",
  nightLine: "#2B3050",
  onNight: "#F6F2EA",
  onNight2: "#C9CCDA",
  ok: "#2E7D4F",         // done, reached, a best: always with a check or star
  attention: "#A65600",  // posture cue: dashed, with the cue word, never red
  alert: "#B3261E",      // safety only (pain stop, camera lost), never a game miss
  soft: "#666B82",       // a miss or a lost point: it fades, never shakes
  coach: "#F2B33D",      // the coach character, on every screen
  star: "#F2B33D",
};

// one accent per game: solid for fills, deep for accent text on paper, tint
// for backgrounds, `on` for text set on the solid, `light` for accent text on
// the Night surface
export const ACCENTS = {
  pong:    { solid: "#2F6BD8", deep: "#1D4C9E", tint: "#E6EEFB", on: "#FFFFFF", light: "#8FB2F0" },
  candles: { solid: "#E0952A", deep: "#8A5300", tint: "#FBF0DD", on: "#1E2235", light: "#F5C578" },
  windy:   { solid: "#0E7F7F", deep: "#0A5E5E", tint: "#DFF2F1", on: "#FFFFFF", light: "#7CC4C1" },
  assess:  { solid: "#6B4FC8", deep: "#4A3593", tint: "#ECE7F8", on: "#FFFFFF", light: "#B6A6F0" },
  warmup:  { solid: "#B0418A", deep: "#7E2B62", tint: "#F6E3EF", on: "#FFFFFF", light: "#E39BC8" },
  coral:   { solid: "#D9573F", deep: "#9C3523", tint: "#FBE6E1", on: "#1E2235", light: "#F09A87" },
  // Cozy Fruit Merge (31 Oct 2026): the mockup's warm coral; its text on the
  // coral is ink (white on it is 2.2:1), its accent text the deep (5.1:1 on peach)
  fruit:   { solid: "#FF8F70", deep: "#A8432A", tint: "#FFE9E1", on: "#3D2A24", light: "#FFB49F" },
};
const GAME_ACCENT = { pong: "pong", candles: "candles", lantern: "candles", windy: "windy", fruit: "fruit",
  assessment: "assess", assess: "assess", warmup: "warmup" };
export function accentOf(id) { return ACCENTS[GAME_ACCENT[id] || id] || ACCENTS.pong; }

// type: patient sizes at a 1080-pixel-tall screen, scaled with the screen and
// the patient's text setting, so the setting reaches canvas text too
export const TYPE = {
  display: [96, 900], hero: [140, 800], title: [64, 800], body: [40, 700], label: [32, 700], small: [26, 700], staff: [16, 600],
};
export function textScale() { return Math.max(1, A11Y.textScale || 1); }
export function tsize(role, H, scale = textScale()) {
  const t = TYPE[role] || TYPE.body;
  return Math.round(t[0] * H / 1080 * scale);
}
export function font(role, H, opts = {}) {
  const t = TYPE[role] || TYPE.body;
  const size = opts.size ?? tsize(role, H, opts.scale);
  return `${opts.weight ?? t[1]} ${size}px Nunito, system-ui, sans-serif`;
}

export const RADIUS = { sm: 12, md: 20, lg: 32, pill: 999 };
export const MOTION = { quick: 160, base: 280, slow: 480, pop: 320, celebrate: 1200 };
export const ease = {
  out: t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3),
  in: t => Math.pow(Math.min(1, Math.max(0, t)), 3),
  pop: t => { const x = Math.min(1, Math.max(0, t)), s = 1.4; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
};
export function calm() { return !!A11Y.calm; }

// "#rrggbb" (or "#rgb") at an alpha, the one colour helper for canvas code
export function alpha(hex, a) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// mix two hex colours, t = 0 is a, 1 is b
export function mix(a, b, t) {
  const pa = parseInt(a.replace("#", ""), 16), pb = parseInt(b.replace("#", ""), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, "0")).join("");
}

export function applyThemeCSS(root = document.documentElement) {
  const set = (k, v) => root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(C)) set(`--${k}`, v);
  for (const [g, a] of Object.entries(ACCENTS)) for (const [k, v] of Object.entries(a)) set(`--${g}-${k}`, v);
  for (const [k, v] of Object.entries(RADIUS)) set(`--r-${k}`, v + "px");
  for (const [k, v] of Object.entries(MOTION)) set(`--t-${k}`, v + "ms");
}

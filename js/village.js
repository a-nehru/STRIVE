// The lantern street: the hub's persistent, strictly additive record of
// every lantern the patient has ever lit in the Lantern game (Oct 2026).
// Framework P8: world progress only accumulates, nothing earned is ever
// lost, cumulative progress lives in the hub and never in a trial. The
// street is drawn from counts, never stored as a picture: a seeded layout
// means the same counts always give the same street, so it is stable from
// one visit to the next and only ever gains.
//
// What the counts become (the "idle" layer: something has happened while
// they were away, and one small new thing a day):
//   - every lantern lit is a star in the sky, for ever
//   - every night they played is a house on the street; its windows light
//     with how many lanterns that night brought
//   - every LAMP_PER lanterns is a lamp post along the road
//   - every VILLAGER_PER lanterns a villager comes out to stand under the
//     lamps (capped; the ones who came since the last visit are named)
//   - the dark clouds over the hills thin out as the lanterns add up
//     (Starlonia: light-bringers push the clouds back)

const LAMP_PER = 10;
const VILLAGER_PER = 20;
const VILLAGER_MAX = 12;
const CLOUD_START = 5;
const CLOUD_PER = 40;        // one cloud leaves for every this many lanterns
const STAR_MAX = 800;

// small seeded PRNG so a given count always lays the same street
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function villageCounts(v) {
  const lanterns = v?.lanterns || 0;
  const days = Object.entries(v?.days || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    lanterns,
    nights: days.length,
    days,
    lamps: lanterns ? Math.max(1, Math.floor(lanterns / LAMP_PER)) : 0,
    villagers: Math.min(VILLAGER_MAX, Math.floor(lanterns / VILLAGER_PER)),
    clouds: Math.max(0, CLOUD_START - Math.floor(lanterns / CLOUD_PER)),
  };
}

// One plain sentence or two for under the picture: what is there, and what
// has happened since the last visit. `seen` is the counts at the last visit.
export function villageLine(v, seen, today) {
  const c = villageCounts(v);
  if (!c.lanterns) return "Your street is dark tonight. Light your first lantern in Lantern, and it stays lit.";
  const parts = [`Your street has ${c.lanterns} lantern${c.lanterns === 1 ? "" : "s"} from ${c.nights} night${c.nights === 1 ? "" : "s"}.`];
  const newV = c.villagers - Math.min(c.villagers, seen?.villagers || 0);
  if (newV > 0) parts.push(newV === 1 ? "A villager has come out under the lamps." : `${newV} more villagers have come out under the lamps.`);
  else if (c.villagers) parts.push(c.villagers === 1 ? "One villager is out under the lamps." : `${c.villagers} villagers are out under the lamps.`);
  if (today && v.days?.[today] && !(seen?.days || []).includes(today)) parts.push("A new house lit up tonight.");
  if (c.clouds === 0 && (seen?.clouds ?? 1) > 0) parts.push("The sky over the street is clear.");
  return parts.join(" ");
}

export function drawVillage(canvas, v, opts = {}) {
  const c = villageCounts(v);
  const dpr = opts.dpr || (typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  const W = opts.width || canvas.clientWidth || 900, H = opts.height || canvas.clientHeight || 170;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const now = opts.now ?? (typeof performance !== "undefined" ? performance.now() : 0);
  const R = rng(1234567);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0f1030"); sky.addColorStop(0.75, "#1e1c42"); sky.addColorStop(1, "#2a2448");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // stars: one per lantern, for ever
  const nStars = Math.min(STAR_MAX, c.lanterns);
  for (let i = 0; i < nStars; i++) {
    const x = R() * W, y = R() * H * 0.62, big = i % 10 === 9;
    const tw = 0.55 + 0.45 * Math.sin(now / 900 + i);
    ctx.globalAlpha = (big ? 0.95 : 0.7) * tw;
    ctx.fillStyle = big ? "#fff6d8" : "#f4ecdd";
    ctx.beginPath(); ctx.arc(x, y, big ? 1.9 : 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // hills
  const horizon = H * 0.66;
  for (const [amp, col, ph] of [[14, "#17173a", 0.4], [9, "#121233", 2.1]]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, horizon - amp * Math.sin(x / 140 + ph) - amp * 0.5 * Math.sin(x / 57 + ph * 2));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  // clouds that have not left yet, sitting on the hills at the edges first
  const cloudR = rng(99);
  for (let i = 0; i < c.clouds; i++) {
    const fx = [0.08, 0.9, 0.3, 0.68, 0.5][i] ?? cloudR();
    const x = fx * W, y = horizon - 30 - cloudR() * 20, r = 16 + cloudR() * 8;
    ctx.fillStyle = "rgba(40,38,74,0.96)";
    for (const [dx, dy, k] of [[-0.9, 0.2, 0.7], [0, -0.3, 1], [0.9, 0.25, 0.65], [0, 0.45, 0.8]]) {
      ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, k * r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(200,200,232,0.45)"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y); ctx.quadraticCurveTo(x - r * 0.2, y + r * 0.12, x - r * 0.05, y);
    ctx.moveTo(x + r * 0.05, y); ctx.quadraticCurveTo(x + r * 0.2, y + r * 0.12, x + r * 0.35, y);
    ctx.stroke();
  }

  // the road
  const roadY = H * 0.86;
  ctx.fillStyle = "#1c1a3e";
  ctx.fillRect(0, roadY - 10, W, H - roadY + 10);
  ctx.strokeStyle = "rgba(244,236,221,0.12)"; ctx.lineWidth = 2; ctx.setLineDash([10, 14]);
  ctx.beginPath(); ctx.moveTo(0, roadY + 8); ctx.lineTo(W, roadY + 8); ctx.stroke(); ctx.setLineDash([]);

  // houses: one per night played, oldest on the left; windows by that night's lanterns
  const n = c.nights;
  const hR = rng(777);
  if (n) {
    const slot = Math.min(84, Math.max(34, (W - 60) / n));
    const x0 = (W - slot * n) / 2 + slot / 2;
    c.days.forEach(([, lit], i) => {
      const x = x0 + i * slot, w = Math.min(slot * 0.78, 56), h = 30 + hR() * 16;
      const y = roadY - 12;
      ctx.fillStyle = "#2b2550";
      ctx.fillRect(x - w / 2, y - h, w, h);
      ctx.fillStyle = "#3d3466";
      ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y - h); ctx.lineTo(x, y - h - w * 0.45); ctx.lineTo(x + w / 2 + 4, y - h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(244,236,221,0.25)"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - w / 2, y - h, w, h);
      // windows: 1 lit at any lanterns, 2 at 8, 3 at 16
      const litN = lit >= 16 ? 3 : lit >= 8 ? 2 : lit >= 1 ? 1 : 0;
      const wins = w >= 40 ? [[-0.28, 0.35], [0.28, 0.35], [0, 0.7]] : [[-0.25, 0.4], [0.25, 0.4], [0, 0.72]];
      wins.forEach(([fx, fy], k) => {
        const on = k < litN;
        ctx.fillStyle = on ? "#ffd98a" : "#1b1b3a";
        if (on) { ctx.shadowColor = "rgba(255,217,138,0.8)"; ctx.shadowBlur = 10; }
        const ww = Math.max(5, w * 0.16);
        ctx.fillRect(x + fx * w - ww / 2, y - h + fy * h - ww / 2, ww, ww);
        ctx.shadowBlur = 0;
      });
      ctx.fillStyle = "#17162f";
      ctx.fillRect(x - 4, y - 11, 8, 11);
    });
  } else {
    // a dark street with one unlit house, waiting
    const x = W / 2, w = 52, h = 38, y = roadY - 12;
    ctx.fillStyle = "#221e44"; ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = "#2c2650";
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y - h); ctx.lineTo(x, y - h - 24); ctx.lineTo(x + w / 2 + 4, y - h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(244,236,221,0.18)"; ctx.lineWidth = 1.5; ctx.strokeRect(x - w / 2, y - h, w, h);
  }

  // lamp posts along the road, spread across the width
  const lamps = Math.min(c.lamps, Math.floor(W / 36));
  const lampXs = [];
  for (let i = 0; i < lamps; i++) {
    const x = lamps === 1 ? W / 2 : 24 + (W - 48) * i / (lamps - 1);
    lampXs.push(x);
    const top = roadY - 46;
    ctx.strokeStyle = "#3a3560"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, roadY); ctx.lineTo(x, top); ctx.stroke();
    const g = ctx.createRadialGradient(x, top - 4, 1, x, top - 4, 22);
    g.addColorStop(0, "rgba(255,246,216,0.95)"); g.addColorStop(0.3, "rgba(255,217,138,0.5)"); g.addColorStop(1, "rgba(232,168,106,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, top - 4, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd98a";
    ctx.beginPath(); ctx.ellipse(x, top - 4, 4, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  // villagers under the lamps: simple silhouettes, closed-eye smiles
  const vR = rng(4242);
  for (let i = 0; i < c.villagers; i++) {
    const near = lampXs.length ? lampXs[Math.floor(vR() * lampXs.length)] : W / 2;
    const x = near + (vR() - 0.5) * 44, h = 16 + vR() * 6, y = roadY + 4;
    const bob = Math.sin(now / 1400 + i * 1.7) * 0.8;
    ctx.fillStyle = ["#9fc08a", "#dba0b0", "#8fd0c8", "#e8a86a"][i % 4];
    ctx.beginPath(); ctx.roundRect(x - 5, y - h + 6 + bob, 10, h - 6, 4); ctx.fill();
    ctx.fillStyle = "#f4ecdd";
    ctx.beginPath(); ctx.arc(x, y - h + 2 + bob, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1b1b3a"; ctx.lineWidth = 1; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y - h + 1.5 + bob); ctx.lineTo(x - 1, y - h + 1.5 + bob);
    ctx.moveTo(x + 1, y - h + 1.5 + bob); ctx.lineTo(x + 2.5, y - h + 1.5 + bob);
    ctx.moveTo(x - 1.5, y - h + 4 + bob); ctx.quadraticCurveTo(x, y - h + 5.5 + bob, x + 1.5, y - h + 4 + bob);
    ctx.stroke();
    if (i % 3 === 0) {   // a wave
      ctx.strokeStyle = "#f4ecdd"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 5, y - h + 9 + bob); ctx.lineTo(x + 10, y - h + 2 + bob); ctx.stroke();
    }
  }
}

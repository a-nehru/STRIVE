// The game suite. Shared ideas:
//  - combo melody: consecutive catches climb the pentatonic scale
//  - the world responds to play (windows light, sea sparkles, sky fills)
//  - misses are soft; stories open round 1; layouts mirror for left/right arm
//  - targets only inside the assessed envelope × rangeScale, clamped on-screen
// "Grab" is dwell-based in v1 (hand-close detection is the M3 upgrade).

import { GameBase, TAU, CENTER, drawBody, drawVideoMirror } from "./engine.js";
import { audio } from "./audio.js";
import { songById } from "./songs.js";

const CREATURES = ["The Crane", "The Fox", "The Hare", "The Whale", "The Owl", "The Deer"];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const polar = (th, r) => ({ x: Math.cos(th) * r, y: Math.sin(th) * r });
// envelope-based placement around the shared reach center
const fromCenter = (th, r) => ({ x: CENTER.x + Math.cos(th) * r, y: CENTER.y + Math.sin(th) * r });
const deg = d => d * Math.PI / 180;

// story intros (spoken + shown on round 1 — CFI "Interesting": rules wrapped in narrative)
const STORIES = {
  constellations: { title: "The sky lost its shapes", text: "Draw threads between the stars to bring the sky-animals home." },
  drift: { title: "Starlight on the tide", text: "The sea is pulling the light away. Catch each orb before it sinks." },
  ember: { title: "The sleeping village", text: "Embers are falling on the rooftops. Catch them. Each becomes a firefly and lights a window." },
  lantern: { title: "The lantern festival", text: "Tonight, every lantern you set free joins the sky forever." },
  pong: { title: "A star wants to play", text: "Keep the little star dancing between the paddles." },
  rhythm: { title: "The star cascade", text: "Falling stars keep a beat. Meet each one in its ring, right on time." },
  boxes: { title: "The last ferry", text: "The harbor crates must cross before the ferry leaves. Carry them over, one by one." },
  compass: { title: "The compass rose", text: "From the heart of the compass, light every point, and always return home." },
  echo: { title: "The star's echo", text: "A star leaves an invisible echo where it shone. Remember the spot, and find it again." },
};

/* ==================== G1 Constellations ==================== */
export class Constellations extends GameBase {
  id = "constellations";
  setup() {
    this.roundSeconds = 45;
    this.pathLen = 0; this.idealLen = 0; this.segLen = 0; this.prevHand = null;
    this._newFigure();
    const wait = this.tellStory(STORIES.constellations);
    if (!wait) {
      this._prompt("Follow the stars", "Touch each one to draw the thread");
      setTimeout(() => this._prompt(""), 3000);
    }
    this.starBorn = performance.now() + wait;
  }
  extra() {
    return { pathEfficiency: this.pathLen > 0 ? Math.round(Math.min(1, this.idealLen / this.pathLen) * 100) / 100 : null };
  }
  _newFigure() {
    const n = 5 + Math.floor(Math.random() * 2);
    this.figure = [];
    let th = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      th += 0.6 + Math.random() * 0.8;
      this.figure.push(this.samplePos({ theta: th }));
    }
    this.idx = 0;
    this.starBorn = performance.now();
    this.figName = pick(CREATURES);
  }
  update(now) {
    if (this.idx >= this.figure.length) return;
    const h = this.t.handRel(this.side);
    if (h) {
      if (this.prevHand) this.segLen += Math.hypot(h.x - this.prevHand.x, h.y - this.prevHand.y);
      this.prevHand = { x: h.x, y: h.y };
    }
    const star = this.figure[this.idx];
    if (this.handNear(star, this.params.radius)) {
      if (this.idx > 0) {
        const prev = this.figure[this.idx - 1];
        this.idealLen += Math.hypot(star.x - prev.x, star.y - prev.y);
        this.pathLen += this.segLen;
      }
      this.segLen = 0;
      this.hit(star, this.idx);
      this.burst(star, "#fff6d8");
      this.idx++;
      this.starBorn = now;
      if (this.idx >= this.figure.length) {
        this.stats.stars += 20;
        if (!this.stats.creatures.includes(this.figName)) this.stats.creatures.push(this.figName);
        this.revealUntil = now + 2600;
        audio.fanfare();
        setTimeout(() => this._newFigure(), 2600);
      }
    } else if (now - this.starBorn > this.params.lifetime * 1100) {
      this.miss(star);
      star.x *= 0.82; star.y *= 0.82; star.reachFrac *= 0.82; star.isFar = false;
      this.starBorn = now;
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.4, 60, c.width / 2, c.height * 0.4, c.height);
    g.addColorStop(0, "#2b2b52"); g.addColorStop(1, "#141433");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    ctx.save();
    ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(232,168,106,0.8)"; ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < Math.min(this.idx, this.figure.length); i++) {
      const p = this.toPx(this.figure[i]);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    if (this.idx > 0 && this.idx < this.figure.length) {
      const hp = this.t.handPx(this.side, c);
      if (hp) ctx.lineTo(hp.x, hp.y);
    }
    ctx.stroke(); ctx.restore();

    this.figure.forEach((s, i) => {
      const p = this.toPx(s);
      if (i < this.idx) this.glow(ctx, p.x, p.y, 7, "#fff6d8", "#fff6d8", 6);
      else if (i === this.idx) {
        const pulse = Math.sin(now / 280) * 0.5 + 0.5;
        const d = this.handDist(s);
        const near = Math.max(0, Math.min(1, 1 - (d - this.params.radius) / (this.params.radius * 2.5)));
        const bg = ctx.createLinearGradient(p.x, p.y - 130, p.x, p.y);
        bg.addColorStop(0, "rgba(232,168,106,0)"); bg.addColorStop(1, `rgba(232,168,106,${0.16 + pulse * 0.1})`);
        ctx.fillStyle = bg;
        ctx.fillRect(p.x - 22, p.y - 130, 44, 130);
        this.glow(ctx, p.x, p.y, (10 + pulse * 6) * (1 + near * 0.5), "#fff6d8", "#e8a86a", 22 + near * 20);
        const rr = this.params.radius * this.sw();
        ctx.strokeStyle = "rgba(244,236,221,0.22)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
        if (near > 0) {
          ctx.strokeStyle = `rgba(232,168,106,${0.4 + near * 0.5})`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * near); ctx.stroke();
        }
        if (now - this.starBorn > 2200) {
          const hp = this.t.handPx(this.side, c);
          if (hp) {
            ctx.strokeStyle = "rgba(232,168,106,0.28)"; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
            ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      } else {
        ctx.fillStyle = "rgba(244,236,221,0.35)";
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
      }
    });

    if (this.revealUntil && now < this.revealUntil) {
      const f = 1 - (this.revealUntil - now) / 2600;
      ctx.save();
      ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 4;
      ctx.shadowColor = "#e8a86a"; ctx.shadowBlur = 26 * (0.5 + Math.sin(now / 180) * 0.5);
      ctx.beginPath();
      this.figure.forEach((s, i) => {
        const p = this.toPx(s);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });
      ctx.stroke(); ctx.restore();
      ctx.fillStyle = `rgba(244,236,221,${0.4 + f * 0.6})`;
      ctx.font = `800 ${Math.round(c.height * 0.07)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(this.figName, c.width / 2, c.height * 0.16);
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G2 Drift (stages: touch → hold → carry) ==================== */
const ORB_HUES = ["#dba0b0", "#a8c8d0", "#e8b98a"];
export class Drift extends GameBase {
  id = "drift";
  setup() {
    this.roundSeconds = 40;
    this.stage = this.opts.stage || 1;
    this.orbs = [];
    this.ripples = [];
    this.carried = null;
    this.combo = 0;
    const wait = this.tellStory(STORIES.drift);
    const SUB = {
      1: "Touch each orb before it reaches the water",
      2: "Hold your hand on each orb until it blooms",
      3: "Catch an orb, carry it to the pool of the same color",
    };
    if (!wait) { this._prompt("Catch the drifting orbs", SUB[this.stage]); setTimeout(() => this._prompt(""), 3400); }
    this.nextSpawn = performance.now() + wait + 600;
    this.pools = ORB_HUES.map((hue, i) => ({ hue, fx: 0.3 + i * 0.2 }));
  }
  extra() { return { driftStage: this.stage }; }
  _catch(o) {
    this.combo++;
    if (this.stage === 3) {
      this.carried = o;
      o.carried = true;
      audio.note(this.combo);
    } else {
      this.hit(o, this.combo);
      this.burst(o, "#fff6e6");
      this.orbs.splice(this.orbs.indexOf(o), 1);
    }
  }
  update(now, dt) {
    if (now > this.nextSpawn && this.orbs.length < (this.stage === 3 ? 2 : 3)) {
      const pos = this.samplePos({ upperHalf: true });
      const fall = (pos.y + 1.3) / (this.params.lifetime * 0.85);
      this.orbs.push({
        ...pos, y: pos.y + 0.5, vy: -Math.max(0.22, fall),
        hue: pick(ORB_HUES), ph: Math.random() * TAU, dwell: null,
      });
      this.nextSpawn = now + (this.stage === 3 ? 1400 : 550) + Math.random() * 650;
    }
    for (const o of [...this.orbs]) {
      if (o.carried) continue;
      o.y += o.vy * dt / 1000;
      o.x += Math.sin(now / 700 + o.ph) * 0.0006 * dt;
      const near = this.handNear(o, this.params.radius);
      if (near && this.stage === 1) this._catch(o);
      else if (near && this.stage >= 2 && !this.carried) {
        if (!o.dwell) o.dwell = now;
        if (now - o.dwell > 450) this._catch(o);
      } else o.dwell = null;
      if (!o.carried && o.y < -1.25) {
        this.combo = 0;
        this.miss(o);
        this.ripples.push({ x: o.x, born: now });
        this.orbs.splice(this.orbs.indexOf(o), 1);
      }
    }
    if (this.carried) {
      const h = this.t.handRel(this.side);
      if (h) { this.carried.x = h.x; this.carried.y = h.y; }
      const hp = this.t.handPx(this.side, this.canvas);
      if (hp) {
        for (const pool of this.pools) {
          const px = pool.fx * this.canvas.width, py = this.canvas.height * 0.9;
          if (Math.hypot(hp.x - px, hp.y - py) < this.canvas.height * 0.07) {
            if (pool.hue === this.carried.hue) {
              this.hit(this.carried, this.combo);
              this.stats.stars += 20;
              this.burst(this.carried, pool.hue);
              audio.fanfare();
            } else {
              this.miss(this.carried);
              this.combo = 0;
            }
            this.orbs.splice(this.orbs.indexOf(this.carried), 1);
            this.carried = null;
            break;
          }
        }
      }
    }
    this.ripples = this.ripples.filter(r => now - r.born < 1400);
  }
  drawBg(ctx, c, now) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#e6c9a0"); g.addColorStop(0.34, "#c99e8c"); g.addColorStop(0.74, "#5a7f88"); g.addColorStop(1, "#2f5560");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    const shoreY = c.height * 0.84;
    ctx.fillStyle = "rgba(20,45,52,0.35)";
    ctx.fillRect(0, shoreY, c.width, c.height - shoreY);
    ctx.strokeStyle = "rgba(244,236,221,0.4)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, shoreY); ctx.lineTo(c.width, shoreY); ctx.stroke();
    const nSpark = 4 + Math.min(10, this.combo * 2);
    for (let i = 0; i < nSpark; i++) {
      const x = (i * 137 + now * 0.02) % c.width;
      const y = shoreY + 14 + (i * 53) % (c.height - shoreY - 24);
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(now / 800 + i));
      ctx.fillStyle = "#fff6e6";
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of this.ripples) {
      const f = (now - r.born) / 1400;
      const p = this.toPx({ x: r.x, y: -1.25 });
      ctx.strokeStyle = `rgba(244,236,221,${0.5 * (1 - f)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, Math.max(p.y, shoreY + 8), 12 + f * 70, 4 + f * 18, 0, 0, TAU); ctx.stroke();
    }
  }
  draw(ctx, c, now) {
    if (this.stage === 3) {
      for (const pool of this.pools) {
        const px = pool.fx * c.width, py = c.height * 0.9, pr = c.height * 0.055;
        const target = this.carried && this.carried.hue === pool.hue;
        ctx.globalAlpha = target ? 0.85 + Math.sin(now / 250) * 0.15 : 0.55;
        const g = ctx.createRadialGradient(px, py, 2, px, py, pr);
        g.addColorStop(0, pool.hue); g.addColorStop(1, "rgba(20,45,52,0.2)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(px, py, pr * 1.3, pr * 0.6, 0, 0, TAU); ctx.fill();
        if (target) {
          ctx.strokeStyle = pool.hue; ctx.lineWidth = 3; ctx.setLineDash([6, 7]);
          ctx.beginPath(); ctx.ellipse(px, py, pr * 1.6, pr * 0.8, 0, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const o of this.orbs) {
      const p = this.toPx(o);
      const r = this.params.radius * this.sw() * 0.55;
      const g = ctx.createRadialGradient(p.x - r * 0.2, p.y - r * 0.25, 2, p.x, p.y, r);
      g.addColorStop(0, "#fff6e6"); g.addColorStop(1, o.hue);
      ctx.fillStyle = g;
      ctx.shadowColor = o.carried ? o.hue : "rgba(255,246,230,0.5)";
      ctx.shadowBlur = o.carried ? 28 : 16;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(p.x - r * 0.25, p.y - r * 0.3, r * 0.12, 0, TAU); ctx.fill();
      if (o.dwell) {
        const f = Math.min(1, (now - o.dwell) / 450);
        ctx.strokeStyle = "#e8a86a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G3 Ember Watch ==================== */
const WINDOWS = [
  [0.06, 60], [0.10, 60], [0.19, 86], [0.30, 54], [0.35, 54],
  [0.47, 70], [0.52, 70], [0.62, 48], [0.72, 62], [0.80, 46], [0.88, 58], [0.93, 58],
];
export class EmberWatch extends GameBase {
  id = "ember";
  setup() {
    this.roundSeconds = 30;
    this.embers = [];
    this.fireflies = [];
    this.combo = 0;
    this.windowsLit = 2;
    const wait = this.tellStory(STORIES.ember);
    if (!wait) {
      this._prompt("Catch the embers", "Hold your hand on each one. It lights a window");
      setTimeout(() => this._prompt(""), 3200);
    }
    this.nextSpawn = performance.now() + wait + 600;
  }
  update(now, dt) {
    if (now > this.nextSpawn && this.embers.length < 3) {
      const pos = this.samplePos({ upperHalf: true });
      this.embers.push({
        ...pos, y: pos.y + 0.6,
        vy: -Math.max(0.22, (pos.y + 1.35) / (this.params.lifetime * 0.85)),
        trail: [], dwell: null,
      });
      this.nextSpawn = now + 500 + Math.random() * 650;
    }
    for (const e of [...this.embers]) {
      e.y += e.vy * dt / 1000;
      e.trail.push({ x: e.x, y: e.y, t: now });
      e.trail = e.trail.filter(p => now - p.t < 400);
      if (this.handNear(e, this.params.radius)) {
        e.dwell ??= now;
        if (now - e.dwell > 300) {
          this.combo++;
          this.hit(e, this.combo);
          this.windowsLit = Math.min(WINDOWS.length, this.windowsLit + 1);
          this.fireflies.push({ x: e.x, y: e.y, born: now });
          this.embers.splice(this.embers.indexOf(e), 1);
        }
      } else {
        e.dwell = null;
        if (e.y < -1.3) {
          this.combo = 0;
          this.miss(e);
          this.embers.splice(this.embers.indexOf(e), 1);
        }
      }
    }
    this.fireflies = this.fireflies.filter(f => now - f.born < 4200);
  }
  drawBg(ctx, c, now) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#3a2c4a"); g.addColorStop(0.4, "#4a3550"); g.addColorStop(1, "#2a2038");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    const base = c.height, u = c.height / 428;
    ctx.fillStyle = "#16121f";
    const houses = [[0, 0.16, 80], [0.16, 0.10, 110], [0.26, 0.15, 70], [0.41, 0.12, 95], [0.53, 0.14, 60], [0.67, 0.12, 84], [0.79, 0.21, 66]];
    for (const [fx, fw, h] of houses) ctx.fillRect(fx * c.width, base - h * u, fw * c.width + 2, h * u);
    WINDOWS.forEach(([fx, hy], i) => {
      const lit = i < this.windowsLit;
      ctx.fillStyle = lit ? "#e8a86a" : "rgba(232,168,106,0.16)";
      if (lit) { ctx.shadowColor = "rgba(232,168,106,0.75)"; ctx.shadowBlur = 10 + Math.sin(now / 500 + i) * 3; }
      ctx.fillRect(fx * c.width, base - hy * u, 13 * u, 15 * u);
      ctx.shadowBlur = 0;
    });
  }
  draw(ctx, c, now) {
    for (const e of this.embers) {
      for (const p of e.trail) {
        const age = (now - p.t) / 400;
        const tp = this.toPx(p);
        ctx.globalAlpha = 0.4 * (1 - age);
        ctx.fillStyle = "#e8703a";
        ctx.beginPath(); ctx.arc(tp.x, tp.y, 5 * (1 - age), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const p = this.toPx(e);
      this.glow(ctx, p.x, p.y, this.params.radius * this.sw() * 0.4, "#fff2c2", "#e8703a", 18);
      if (e.dwell) {
        const f = Math.min(1, (now - e.dwell) / 300);
        ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.params.radius * this.sw() * 0.4 + 10, -Math.PI / 2, -Math.PI / 2 + TAU * f);
        ctx.stroke();
      }
    }
    for (const f of this.fireflies) {
      const age = (now - f.born) / 4200;
      const p = this.toPx({ x: f.x + Math.sin(now / 400 + f.born) * 0.07, y: f.y + age * 1.15 });
      ctx.globalAlpha = 1 - age;
      this.glow(ctx, p.x, p.y, 8, "#ffffff", "#9fc08a", 16);
      ctx.globalAlpha = 1;
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G4 Lantern Release — a story that evolves ==================== */
// Acts (by lanterns released this round): 1 amber & still → 2 colors join →
// 3 the ring starts drifting (moving target). Milestone lines are spoken.
const LANTERN_HUES = ["#e8a86a", "#dba0b0", "#8fd0c8", "#ffd98a"];
export class LanternRelease extends GameBase {
  id = "lantern";
  setup() {
    this.roundSeconds = 50;
    this.sky = [];
    this.celebrate = 0;
    this.act = 1;
    this._newLantern();
    const wait = this.tellStory(STORIES.lantern);
    if (!wait) {
      this._prompt("Carry the lantern to the ring", "Hold your hand on it to pick it up");
      setTimeout(() => this._prompt(""), 3200);
    }
    this.lantern.born = performance.now() + wait;
  }
  _newLantern() {
    // start on the trained-arm side, release ring high on the OTHER side —
    // every carry crosses the midline
    const sign = this.side === "right" ? 1 : -1;
    const thA = sign > 0 ? Math.PI * 1.85 : Math.PI * 1.15;   // low, arm side
    const thB = sign > 0 ? Math.PI * 0.75 : Math.PI * 0.25;   // high, opposite
    const rs = this.params.rangeScale;
    this.lantern = {
      ...fromCenter(thA, 0.75 * rs * this.envAt(thA)), state: "waiting",
      hue: this.act >= 2 ? pick(LANTERN_HUES) : LANTERN_HUES[0],
      reachFrac: 0.75, isFar: false, born: performance.now(), dwell: null,
    };
    this.ringBase = fromCenter(thB, 0.8 * rs * this.envAt(thB));
    this.ring = { ...this.ringBase, r: Math.max(this.params.radius * 1.15, 0.28) };
  }
  update(now) {
    // act 3: the ring drifts gently — a moving target
    if (this.act >= 3) {
      this.ring.x = this.ringBase.x + Math.sin(now / 1600) * 0.25;
      this.ring.y = this.ringBase.y + Math.cos(now / 2100) * 0.12;
    }
    const L = this.lantern;
    if (now - L.born > 22000) { this.miss(L); this._newLantern(); return; }
    if (L.state === "waiting") {
      if (this.handNear(L, this.params.radius)) {
        if (!L.dwell) { L.dwell = now; audio.note(0); }
        if (now - L.dwell > 650) { L.state = "carried"; L.dwell = null; audio.note(2); }
      } else L.dwell = null;
    } else if (L.state === "carried") {
      const h = this.t.handRel(this.side);
      if (h) { L.x = h.x; L.y = h.y; }
      if (h && Math.hypot(h.x - this.ring.x, h.y - this.ring.y) < this.ring.r) {
        if (!L.dwell) { L.dwell = now; audio.note(4); }
        if (now - L.dwell > 650) {
          this.hit({ reachFrac: 0.85, isFar: false }, 5);
          this.stats.stars += 20;
          this.stats.lanterns++;
          this.sky.push({ x: this.ring.x, y: this.ring.y, hue: L.hue, born: now });
          this.celebrate = now + 1200;
          this.burst(this.ring, L.hue);
          audio.fanfare();
          // story beats
          if (this.stats.lanterns === 2) { this.act = 2; this._speak("Look! The colored lanterns are joining in!"); }
          if (this.stats.lanterns === 4) { this.act = 3; this._speak("The wind is up! Follow the drifting ring."); }
          this._newLantern();
        }
      } else L.dwell = null;
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#1b1b3a"); g.addColorStop(0.6, "#2f2a5a"); g.addColorStop(1, "#4a3f78");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    for (const s of this.sky) {
      const age = (now - s.born) / 12000;
      if (age > 1) continue;
      const p = this.toPx({ x: s.x + Math.sin(now / 900 + s.born) * 0.05, y: s.y + age * 1.8 });
      ctx.globalAlpha = 0.75 * (1 - age * 0.55);
      lanternShape(ctx, p.x, p.y, 15, false, s.hue);
      ctx.globalAlpha = 1;
    }
    const L = this.lantern;
    const rp = this.toPx(this.ring);
    const pulse = Math.sin(now / 400) * 0.5 + 0.5;

    const ringA = L.state === "carried" ? 0.55 + pulse * 0.35 : 0.3 + pulse * 0.15;
    ctx.strokeStyle = `rgba(244,236,221,${ringA})`;
    ctx.lineWidth = L.state === "carried" ? 5 : 4;
    ctx.setLineDash([9, 10]);
    ctx.beginPath(); ctx.arc(rp.x, rp.y, this.ring.r * this.sw(), 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    if (L.dwell) {
      const f = Math.min(1, (now - L.dwell) / 650);
      const at = L.state === "waiting" ? this.toPx(L) : rp;
      const rr = (L.state === "waiting" ? this.params.radius : this.ring.r) * this.sw() + 10;
      ctx.strokeStyle = "#e8a86a"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(at.x, at.y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    }

    const sway = L.state === "carried" ? Math.sin(now / 300) * 6 : 0;
    const lp = this.toPx(L);
    if (L.state === "waiting") {
      ctx.strokeStyle = `rgba(232,168,106,${0.3 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(lp.x, lp.y, this.params.radius * this.sw(), 0, TAU); ctx.stroke();
    }
    lanternShape(ctx, lp.x + sway, lp.y, 22, L.state === "carried", L.hue);

    if (L.state === "carried") {
      ctx.strokeStyle = "rgba(244,236,221,0.18)"; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(lp.x, lp.y); ctx.lineTo(rp.x, rp.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (now < this.celebrate) {
      ctx.fillStyle = `rgba(244,236,221,${(this.celebrate - now) / 1200 * 0.8})`;
      ctx.font = `800 ${Math.round(c.height * 0.05)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Set free ✦", c.width / 2, c.height * 0.14);
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G5 Arc Pong — solo / bimanual / coupled / companion / team ==================== */
// Modes:
//   solo       patient arm vs gentle (beatable!) AI — points scored both ways
//   bimanual   left arm vs right arm (self-rally)
//   coupled    both arms average into one paddle vs AI
//   companion  friend on arrow keys vs patient (opposite sides)
//   team-arms  BOTH the patient's arms defend one side together vs AI (co-active)
//   team-keys  patient arm + companion on keys defend together vs AI (collaborative)
export class ArcPong extends GameBase {
  id = "pong";
  setup() {
    this.roundSeconds = 60;
    this.mode = this.opts.mode || "solo";
    this.profiles = this.opts.profiles || {};
    this.patientRight = this.side === "right";
    this.isTeam = this.mode.startsWith("team");
    this.hasAI = this.mode === "solo" || this.mode === "coupled" || this.isTeam;
    this.rally = 0; this.bestRally = 0;
    this.score = { us: 0, ai: 0 };
    // skill shots (Zhang's choice element): grip = catch & fire, spin = palm turn
    this.skills = this.opts.skills || { grip: false, spin: false };
    this.gripShots = 0; this.spinShots = 0;
    this.caught = null;
    this.skillFlash = null;
    this.court = { top: 0.16, bottom: 0.9, left: 0.1, right: 0.9 };
    this.paddleH = 0.17;
    this.aiY = 0.5; this.keysY = 0.5; this.keys = { up: false, down: false };
    this.aiLagY = 0.5;                       // AI reacts with a lag — it CAN miss
    this.trail = [];
    this.flashUntil = 0;
    this.pointFlash = 0;
    if (this.mode === "companion" || this.mode === "team-keys") {
      this._keyDown = e => { if (e.key === "ArrowUp") this.keys.up = true; if (e.key === "ArrowDown") this.keys.down = true; };
      this._keyUp = e => { if (e.key === "ArrowUp") this.keys.up = false; if (e.key === "ArrowDown") this.keys.down = false; };
      addEventListener("keydown", this._keyDown);
      addEventListener("keyup", this._keyUp);
    }
    const wait = this.tellStory(STORIES.pong);
    if (!wait) {
      const SUB = {
        solo: "Raise and lower your arm to score points past the other paddle!",
        bimanual: "Each arm has its own paddle. Rally with yourself!",
        coupled: "Both arms together steer one paddle",
        companion: "A friend plays the other paddle with the arrow keys",
        "team-arms": "Both your arms defend together. Beat the AI!",
        "team-keys": "You and your teammate defend together. Beat the AI!",
      };
      const skillHint = [this.skills.grip && "squeeze to catch & fire", this.skills.spin && "turn your palm for spin"]
        .filter(Boolean).join(" · ");
      this._prompt("Rally with the light", SUB[this.mode] + (skillHint ? ` (${skillHint})` : ""));
      setTimeout(() => this._prompt(""), 3200);
    }
    this._startServe(performance.now() + wait);
  }
  stop() {
    if (this._keyDown) { removeEventListener("keydown", this._keyDown); removeEventListener("keyup", this._keyUp); }
    super.stop();
  }
  extra() {
    return {
      pongMode: this.mode, bestRally: this.bestRally, points: this.score.us, aiPoints: this.score.ai,
      gripShots: this.gripShots, spinShots: this.spinShots,
      skills: { ...this.skills },
    };
  }
  // grip shot step 1: hand closed at contact catches the ball on the paddle
  _tryCatch(now, edge, py) {
    if (!this.skills.grip || this.caught) return false;
    if ((edge === "right") !== this.patientRight) return false;   // primary paddle only
    if (!this.t.handClosed(this.side)) return false;
    const b = this.ball;
    this.caught = { since: now, edge, vx0: Math.abs(b.vx) };
    b.vx = 0; b.vy = 0; b.spin = 0;
    this.rally++; this.bestRally = Math.max(this.bestRally, this.rally);
    this.hit({ reachFrac: 0.7, isFar: false }, this.rally);
    this.skillFlash = { text: "Caught! Open to fire ✋", until: now + 1600 };
    return true;
  }
  _startServe(now) {
    this.serving = { start: now, beats: -1 };
    this.ball = null;
  }
  _launch(now) {
    const span = this.params.rangeScale;
    const ty = 0.5 + (Math.random() - 0.5) * span * (this.court.bottom - this.court.top);
    const speedup = 1 + Math.min(0.5, this.rally * 0.05);
    const vx0 = (this.court.right - this.court.left) / this.params.lifetime * speedup;
    const fromLeft = this.patientRight;
    this.ball = {
      x: fromLeft ? this.court.left + 0.06 : this.court.right - 0.06,
      y: 0.5, tx: ty, vx: fromLeft ? vx0 : -vx0, born: now,
    };
    this.ball.vy = (ty - 0.5) / ((this.court.right - this.court.left - 0.12) / vx0);
  }
  _angleToY(arm, prof) {
    const a = this.t.armAngle(arm);
    if (a == null) return 0.5;
    const lo = prof?.arcMinDeg ?? this.profile.arcMinDeg;
    const hi = prof?.arcMaxDeg ?? this.profile.arcMaxDeg;
    const f = Math.max(0, Math.min(1, (a - lo) / Math.max(10, hi - lo)));
    return this.court.bottom - f * (this.court.bottom - this.court.top) - this.paddleH / 2;
  }
  _keysPaddle(dt) {
    const v = 0.5 * dt / 1000;
    if (this.keys.up) this.keysY -= v;
    if (this.keys.down) this.keysY += v;
    this.keysY = Math.max(this.court.top, Math.min(this.court.bottom - this.paddleH, this.keysY));
    return this.keysY;
  }
  // paddles: {leftY, rightY, leftY2?, rightY2?} — the 2s are teammate paddles
  _paddles(now, dt) {
    const other = this.side === "right" ? "left" : "right";
    const p = {};
    let patientY;
    if (this.mode === "coupled") {
      patientY = (this._angleToY(this.side, this.profiles[this.side]) + this._angleToY(other, this.profiles[other])) / 2;
    } else {
      patientY = this._angleToY(this.side, this.profiles[this.side]);
    }
    // AI with reaction lag (so it genuinely misses sharp shots)
    if (this.hasAI && this.ball) {
      const s = dt / 1000;
      this.aiLagY += (this.ball.y - this.aiLagY) * Math.min(1, 3 * s);
      this.aiY += Math.max(-0.24 * s, Math.min(0.24 * s, this.aiLagY - this.aiY));
    }
    const aiPad = this.aiY - this.paddleH / 2;
    if (this.patientRight) {
      p.rightY = patientY;
      p.leftY = this.mode === "bimanual" ? this._angleToY(other, this.profiles[other])
        : this.mode === "companion" ? this._keysPaddle(dt) : aiPad;
      if (this.mode === "team-arms") p.rightY2 = this._angleToY(other, this.profiles[other]);
      if (this.mode === "team-keys") p.rightY2 = this._keysPaddle(dt);
    } else {
      p.leftY = patientY;
      p.rightY = this.mode === "bimanual" ? this._angleToY(other, this.profiles[other])
        : this.mode === "companion" ? this._keysPaddle(dt) : aiPad;
      if (this.mode === "team-arms") p.leftY2 = this._angleToY(other, this.profiles[other]);
      if (this.mode === "team-keys") p.leftY2 = this._keysPaddle(dt);
    }
    return p;
  }
  _edgeHit(b, ys) {
    for (const y of ys) {
      if (y != null && b.y > y - 0.025 && b.y < y + this.paddleH + 0.025) return y;
    }
    return null;
  }
  update(now, dt) {
    this.pads = this._paddles(now, dt);

    if (this.serving) {
      const beat = Math.floor((now - this.serving.start) / 550);
      if (beat > this.serving.beats) {
        this.serving.beats = beat;
        audio.serveTick(beat >= 3);
      }
      if (beat >= 3) { this._launch(now); this.serving = null; }
      return;
    }

    // grip shot step 2: ball rides the paddle until the hand opens (or 1.2 s)
    if (this.caught) {
      const b = this.ball;
      const padY = this.patientRight ? this.pads.rightY : this.pads.leftY;
      b.x = this.caught.edge === "right" ? this.court.right - 0.05 : this.court.left + 0.05;
      if (padY != null) b.y = padY + this.paddleH / 2;
      if (!this.t.handClosed(this.side) || now - this.caught.since > 1200) {
        const dir = this.caught.edge === "right" ? -1 : 1;
        b.vx = dir * (this.caught.vx0 || 0.25) * 1.35;      // fired back faster
        b.vy = (Math.random() - 0.5) * 0.22;
        this.gripShots++;
        this.stats.stars += 5;
        this.burstAtPx(b.x * this.canvas.width, b.y * this.canvas.height, "#9fc08a");
        this.skillFlash = { text: "Grip shot! ✦", until: now + 1200 };
        audio.note(6);
        this.caught = null;
      }
      return;
    }

    const b = this.ball, s = dt / 1000;
    b.x += b.vx * s; b.y += b.vy * s;
    if (b.spin) b.vy += b.spin * s;                          // spin curves the flight
    this.trail.push({ x: b.x, y: b.y, t: now });
    this.trail = this.trail.filter(p => now - p.t < 260);
    if (b.y < this.court.top || b.y > this.court.bottom) { b.vy *= -1; audio.bounce(); }

    const patRight = this.patientRight;
    const returnBall = (dir, py, isPlayerSide) => {
      b.vx = dir * Math.abs(b.vx) * 1.05;
      b.vy += ((b.y - (py + this.paddleH / 2)) / this.paddleH) * 0.28;
      b.spin = 0;
      if (isPlayerSide) {
        this.rally++; this.bestRally = Math.max(this.bestRally, this.rally);
        this.hit({ reachFrac: 0.7, isFar: false }, this.rally);
        this.burstAtPx(b.x * this.canvas.width, b.y * this.canvas.height, "#e8b98a");
        this.flashUntil = now + 160;
        // spin shot: a rolled palm at contact bends the return
        if (this.skills.spin && (dir === -1) === this.patientRight) {
          const roll = this.t.forearmRoll(this.side);
          if (roll != null && Math.abs(roll) > 0.15) {
            b.spin = roll > 0 ? 0.4 : -0.4;                  // supinated = topspin (dips)
            b.vx *= 1.12;
            this.spinShots++;
            this.stats.stars += 5;
            this.skillFlash = { text: roll > 0 ? "Topspin! ↓✦" : "Backspin! ↑✦", until: now + 1200 };
            audio.note(6);
          }
        }
      } else {
        audio.note(0);
        if (this.hasAI) {   // AI aims within the patient's arc demand
          const span = this.params.rangeScale;
          b.tx = 0.5 + (Math.random() - 0.5) * span * (this.court.bottom - this.court.top);
          b.vy = (b.tx - b.y) / ((this.court.right - this.court.left) / Math.abs(b.vx)) + (Math.random() - 0.5) * 0.05;
        }
      }
    };

    // right edge
    if (b.vx > 0 && b.x >= this.court.right - 0.02) {
      const py = this._edgeHit(b, [this.pads.rightY, this.pads.rightY2]);
      const playerSide = patRight || this.mode === "bimanual";
      if (py != null) { if (!this._tryCatch(now, "right", py)) returnBall(-1, py, patRight || this.mode === "bimanual"); }
      else if (b.x > this.court.right + 0.04) {
        if (playerSide) { this.miss({ isFar: false }); this.rally = 0; if (this.hasAI) { this.score.ai++; } }
        else { this.score.us++; this.pointFlash = now + 1300; audio.point(); this.say("Point to you!"); }
        this._startServe(now);
        return;
      }
    }
    // left edge
    if (b.vx < 0 && b.x <= this.court.left + 0.02) {
      const py = this._edgeHit(b, [this.pads.leftY, this.pads.leftY2]);
      const playerSide = !patRight || this.mode === "bimanual";
      if (py != null) { if (!this._tryCatch(now, "left", py)) returnBall(1, py, !patRight || this.mode === "bimanual"); }
      else if (b.x < this.court.left - 0.04) {
        if (playerSide) { this.miss({ isFar: false }); this.rally = 0; if (this.hasAI) { this.score.ai++; } }
        else { this.score.us++; this.pointFlash = now + 1300; audio.point(); this.say("Point to you!"); }
        this._startServe(now);
        return;
      }
    }
  }
  burstAtPx(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height / 2, 60, c.width / 2, c.height / 2, c.height * 0.8);
    g.addColorStop(0, "#3a4f6a"); g.addColorStop(1, "#1c2740");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    const bloom = Math.min(1, this.rally / 10);
    if (bloom > 0) {
      const bg = ctx.createRadialGradient(c.width / 2, c.height / 2, 10, c.width / 2, c.height / 2, c.height * 0.45);
      bg.addColorStop(0, `rgba(159,192,138,${0.3 * bloom})`); bg.addColorStop(1, "rgba(159,192,138,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    }
    if (performance.now() < this.flashUntil) {
      ctx.fillStyle = "rgba(244,236,221,0.08)";
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }
  draw(ctx, c, now) {
    const X = f => f * c.width, Y = f => f * c.height;
    ctx.strokeStyle = "rgba(244,236,221,0.16)"; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
    for (const side of [this.court.left - 0.015, this.court.right + 0.015]) {
      ctx.beginPath(); ctx.moveTo(X(side), Y(this.court.top));
      ctx.quadraticCurveTo(X(side + (side < 0.5 ? -0.04 : 0.04)), Y(0.53), X(side), Y(this.court.bottom));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // scoreboard: suns (you) vs moons (AI) — only in vs-AI modes
    if (this.hasAI) {
      const usX = this.patientRight ? 0.62 : 0.24, aiX = this.patientRight ? 0.24 : 0.62;
      for (let i = 0; i < Math.min(this.score.us, 9); i++)
        starShape(ctx, X(usX + i * 0.028), Y(0.06), 9, "#ffd98a");
      for (let i = 0; i < Math.min(this.score.ai, 9); i++) {
        ctx.fillStyle = "rgba(200,179,217,0.8)";
        ctx.beginPath(); ctx.arc(X(aiX + i * 0.028), Y(0.06), 7, 0, TAU); ctx.fill();
      }
    }
    // rally streak stars
    const n = Math.min(this.rally, 14);
    for (let i = 0; i < n; i++) {
      const fx = 0.5 + (i - (n - 1) / 2) * 0.035;
      ctx.globalAlpha = 0.6 + Math.sin(now / 300 + i) * 0.4;
      starShape(ctx, X(fx), Y(0.12), i === n - 1 ? 11 : 8, "#fff2c2");
      ctx.globalAlpha = 1;
    }

    // paddles: patient amber, teammate teal, opponent lavender
    const pads = this.pads || {};
    const drawPad = (x, y, kind) => {
      if (y == null) return;
      const cols = kind === "patient" ? ["#e8b98a", "#c77f4a"] : kind === "mate" ? ["#a8d8d0", "#5f9b93"] : ["#c8b3d9", "#8f76b0"];
      roundedRect(ctx, x - 8, Y(y), 16, Y(this.paddleH), 10, cols[0], cols[1]);
    };
    const rKind = this.patientRight ? "patient" : (this.mode === "bimanual" ? "patient" : "opp");
    const lKind = !this.patientRight ? "patient" : (this.mode === "bimanual" ? "patient" : "opp");
    drawPad(X(this.court.left), pads.leftY, lKind);
    drawPad(X(this.court.right), pads.rightY, rKind);
    drawPad(X(this.court.left) - 26, pads.leftY2, "mate");
    drawPad(X(this.court.right) + 26, pads.rightY2, "mate");

    if (this.serving) {
      const t = (now - this.serving.start) / 550;
      const beat = Math.floor(t), f = t - beat;
      if (beat >= 0 && beat < 3) {
        const p = { x: X(this.patientRight ? this.court.left + 0.06 : this.court.right - 0.06), y: Y(0.5) };
        ctx.strokeStyle = `rgba(244,236,221,${0.7 * (1 - f)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16 + f * 44, 0, TAU); ctx.stroke();
        this.glow(ctx, p.x, p.y, 10, "#ffffff", "#fff6d8", 14);
      }
    } else if (this.ball) {
      for (const p of this.trail) {
        const age = (now - p.t) / 260;
        ctx.globalAlpha = 0.35 * (1 - age);
        ctx.fillStyle = "#fff6d8";
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 9 * (1 - age), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      this.glow(ctx, X(this.ball.x), Y(this.ball.y), 14, "#ffffff", "#fff6d8", 24);
      if (this.caught) {   // held on the paddle — pulsing "charged" ring
        const f = Math.min(1, (now - this.caught.since) / 1200);
        ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(X(this.ball.x), Y(this.ball.y), 22 + Math.sin(now / 150) * 4, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
      if (this.ball.spin) {   // spinning ball leaves a curl mark
        ctx.strokeStyle = "rgba(159,192,138,0.7)"; ctx.lineWidth = 2.5;
        const a = now / 90;
        ctx.beginPath(); ctx.arc(X(this.ball.x), Y(this.ball.y), 19, a, a + Math.PI * 1.2); ctx.stroke();
      }
    }
    if (this.skillFlash && now < this.skillFlash.until) {
      ctx.fillStyle = `rgba(159,192,138,${(this.skillFlash.until - now) / 1200 * 0.95})`;
      ctx.font = `800 ${Math.round(c.height * 0.05)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(this.skillFlash.text, c.width / 2, c.height * 0.22);
    }
    if (now < this.pointFlash) {
      ctx.fillStyle = `rgba(255,217,138,${(this.pointFlash - now) / 1300 * 0.9})`;
      ctx.font = `800 ${Math.round(c.height * 0.07)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Point! ✦", c.width / 2, c.height * 0.3);
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G6 Melody Tiles — play real songs by reaching ==================== */
// Piano-Tiles for the arm: tiles fall down lanes in time with a real song's
// melody. HITTING a tile is what PLAYS that note — the patient performs the
// song by reaching; a miss leaves an audible gap in the tune. Accompaniment
// (lo-fi drums/bass/chords) runs on a shared beat clock in audio.startSong.
const LANE_HUES = ["#dba0b0", "#e8b98a", "#9fc08a", "#a8c8d0"];
export class MelodyTiles extends GameBase {
  id = "rhythm";
  setup() {
    this.roundSeconds = 60;
    this.song = songById(this.opts.song);
    this.combo = 0; this.bestCombo = 0; this.notesHit = 0; this.notesTotal = 0;
    // 4 lane rings across the upper arc, lane order mirrored to the trained arm
    const angles = this.side === "right" ? [35, 70, 105, 140] : [145, 110, 75, 40];
    this.lanes = angles.map(a => {
      const th = deg(a);
      const r = 0.72 * this.params.rangeScale * this.envAt(th);
      return { ...fromCenter(th, r), th };
    });
    // pitch -> lane: low notes on the low/outer lane, high notes on the high one
    const pitches = [...new Set(this.song.melody.map(n => n[1]))].sort((a, b) => a - b);
    this.laneOf = {};
    pitches.forEach((p, i) => { this.laneOf[p] = Math.min(3, Math.floor(i / pitches.length * 4)); });
    // bimanual: each lane belongs to the hand on its side of the body (piano-style)
    this.bimanual = this.opts.tilesMode === "bimanual";
    this.lanes.forEach(l => { l.hand = Math.cos(l.th) >= 0 ? "right" : "left"; });

    this.tiles = [];
    this.spawnedUpTo = 0;
    this.travelBeats = 4;

    const wait = this.tellStory({
      title: this.song.name,
      text: "The tiles are the song. Be in the ring when each one lands, and you'll play the tune.",
    });
    if (!wait) {
      this._prompt(this.song.name, "Catch each tile in its ring. You are playing the melody");
      setTimeout(() => this._prompt(""), 3400);
    }
    // the game owns the song clock so tiles and music always agree
    setTimeout(() => { if (this.active) audio.startSong(this.song); }, wait + 400);
  }
  extra() {
    return {
      song: this.song.name,
      bestCombo: this.bestCombo,
      notesHitPct: this.notesTotal ? Math.round(this.notesHit / this.notesTotal * 100) : 0,
    };
  }
  update(now) {
    if (!audio.song) return;
    const beat = audio.songBeat();
    if (beat < -0.5) return;

    // spawn tiles for melody notes entering the lookahead window (loop-aware)
    const horizon = beat + this.travelBeats + 0.5;
    const L = this.song.length;
    const loop0 = Math.max(0, Math.floor(this.spawnedUpTo / L));
    const loop1 = Math.floor(horizon / L);
    for (let lp = loop0; lp <= loop1; lp++) {
      for (const [b, m, dur] of this.song.melody) {
        const abs = b + lp * L;
        if (abs >= this.spawnedUpTo && abs < horizon) {
          this.tiles.push({ abs, midi: m, dur: dur || 1, lane: this.laneOf[m], hit: false });
          this.notesTotal++;
        }
      }
    }
    this.spawnedUpTo = horizon;

    for (const tile of [...this.tiles]) {
      const dtb = tile.abs - beat;                 // beats until the tile lands
      if (!tile.hit && Math.abs(dtb) < 0.5) {
        const lane = this.lanes[tile.lane];
        const inRing = this.bimanual
          ? this.handNearFor(lane.hand, lane, this.params.radius * 1.15)
          : this.handNear(lane, this.params.radius * 1.15);
        if (inRing) {
          tile.hit = true;
          this.notesHit++;
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          audio.playMelodyNote(tile.midi, tile.dur * 60 / this.song.bpm);   // ← the patient plays the note
          this.stats.hits++;
          this.stats.stars += 10;
          this.stats.reachFracs.push(0.72);
          this.burst(lane, LANE_HUES[tile.lane]);
          this.tiles.splice(this.tiles.indexOf(tile), 1);
        }
      } else if (dtb < -0.55) {
        this.combo = 0;
        this.miss({ isFar: false }, true);         // silent — the missing note is the feedback
        this.tiles.splice(this.tiles.indexOf(tile), 1);
      }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#241b3f"); g.addColorStop(0.6, "#33255c"); g.addColorStop(1, "#1b1433");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const beat = audio.song ? audio.songBeat() : 0;
    // lanes
    this.lanes.forEach((lane, i) => {
      const p = this.toPx(lane);
      const grad = ctx.createLinearGradient(p.x, 0, p.x, p.y);
      grad.addColorStop(0, "rgba(232,168,106,0.02)");
      grad.addColorStop(1, hexA(LANE_HUES[i], 0.14));
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - 30, 0, 60, p.y);
      const inside = this.bimanual
        ? this.handNearFor(lane.hand, lane, this.params.radius * 1.15)
        : this.handNear(lane, this.params.radius * 1.15);
      ctx.strokeStyle = inside ? LANE_HUES[i] : "rgba(244,236,221,0.4)";
      ctx.lineWidth = inside ? 5 : 3;
      if (inside) { ctx.shadowColor = LANE_HUES[i]; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.arc(p.x, p.y, this.params.radius * this.sw() * 0.9, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
    });
    // tiles: piano-tile bars falling down the lanes; height = note length
    for (const tile of this.tiles) {
      const lane = this.lanes[tile.lane];
      const p = this.toPx(lane);
      const pxPerBeat = p.y / this.travelBeats;
      const dtb = tile.abs - beat;
      const yBottom = p.y - dtb * pxPerBeat;
      const h = Math.max(26, tile.dur * pxPerBeat * 0.7);
      const yTop = yBottom - h;
      if (yBottom < -10 || yTop > c.height) continue;
      const near = dtb < 0.6;
      ctx.save();
      const g2 = ctx.createLinearGradient(p.x, yTop, p.x, yBottom);
      g2.addColorStop(0, hexA(LANE_HUES[tile.lane], 0.55));
      g2.addColorStop(1, hexA(LANE_HUES[tile.lane], near ? 1 : 0.85));
      ctx.fillStyle = g2;
      if (near) { ctx.shadowColor = LANE_HUES[tile.lane]; ctx.shadowBlur = 18; }
      ctx.beginPath(); ctx.roundRect(p.x - 24, yTop, 48, h, 10); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(p.x, yBottom - 10, 4, 0, TAU); ctx.fill();
    }
    // beat pulse on the horizon line + combo stars
    const beatF = beat - Math.floor(beat);
    ctx.globalAlpha = 0.12 * (1 - beatF);
    ctx.fillStyle = "#fff6d8";
    ctx.fillRect(0, 0, c.width, 4);
    ctx.globalAlpha = 1;
    const n = Math.min(this.combo, 14);
    for (let i = 0; i < n; i++) {
      const fx = 0.5 + (i - (n - 1) / 2) * 0.035;
      ctx.globalAlpha = 0.6 + Math.sin(now / 300 + i) * 0.4;
      starShape(ctx, fx * c.width, c.height * 0.075, i === n - 1 ? 11 : 8, "#fff2c2");
      ctx.globalAlpha = 1;
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ==================== G7 Harbor Crates — AR Box & Block Test ==================== */
// Played over the live mirrored camera feed (AR): the patient sees their own
// body carrying virtual blocks, like the real bench test. One crate at a time
// starts low on the trained-arm side; SQUEEZE (close the hand) on the crate to
// grab, lift it OVER the barrier partition in the middle (crossing below the
// barrier top bumps the crate against the wall, exactly like the physical
// test), OPEN the hand on the far side to release. Opening early drops the
// crate where it is — pick it up again. 60 s; the stack on the far side IS
// the score — classic BBT count.
export class HarborCrates extends GameBase {
  id = "boxes";
  setup() {
    this.roundSeconds = 60;
    this.boxes = 0;
    this.sign = this.side === "right" ? 1 : -1;   // source on trained-arm side
    // barrier top (rel y, SW above CENTER): the lift the carry must clear —
    // range demand scales with the DDA like everything else
    this.barrierY = 0.05 + 0.3 * this.params.rangeScale;
    this._newCrate();
    const wait = this.tellStory(STORIES.boxes);
    if (!wait) {
      this._prompt("Carry the crates across", "Squeeze to grab, lift it over the wall, open your hand to drop");
      setTimeout(() => this._prompt(""), 3200);
    }
    this.crate.born = performance.now() + wait;
  }
  extra() { return { boxes: this.boxes }; }
  _newCrate() {
    // like the real test, blocks start LOW on the source side (on the bench):
    // sample the lower quadrant of the trained-arm half, inside the envelope
    for (let i = 0; i < 12; i++) {
      const d = -75 + Math.random() * 90;                       // degrees below/near horizontal
      const th = this.sign === 1 ? deg(d) : deg(180 - d);
      const pos = this.samplePos({ theta: th });
      if (Math.sign(pos.x || this.sign) === this.sign && Math.abs(pos.x) > 0.25) {
        this.crate = { ...pos, state: "waiting", born: performance.now() };
        return;
      }
    }
    this.crate = { x: this.sign * 0.8, y: -0.2, state: "waiting", born: performance.now(), reachFrac: 0.6, isFar: false };
  }
  update(now) {
    const cr = this.crate;
    if (now - cr.born > 20000) { this.miss(cr); this._newCrate(); return; }
    const closed = this.t.handClosed(this.side);
    if (cr.state === "waiting") {
      // a real grasp EVENT: arrive with an open hand, then close it on the
      // crate — a hand that was already closed on approach doesn't pick up
      const near = this.handNear(cr, this.params.radius);
      if (near && !closed) cr.armed = true;
      if (near && closed && cr.armed) {
        cr.state = "carried"; cr.armed = false;
        audio.note(1);
      }
      if (!near) cr.armed = false;
    } else {
      const h = this.t.handRel(this.side);
      if (h) {
        // the partition is solid: crossing its plane below the barrier top is
        // blocked — the crate bumps and presses against the wall until the
        // patient lifts it over (both directions, like the physical wall)
        const overTop = h.y > this.barrierY;
        const crossingPlane = Math.sign(h.x || 1) !== Math.sign(cr.x || this.sign);
        if (!overTop && crossingPlane) {
          cr.x = Math.sign(cr.x || this.sign) * 0.05;
          cr.y = Math.min(h.y, this.barrierY - 0.08);
          if (!cr.bumped) { cr.bumped = true; audio.serveTick(false); }
        } else {
          cr.x = h.x; cr.y = h.y;
          cr.bumped = false;
        }
      }
      if (!closed) {                     // open hand = release
        const crossed = Math.sign(cr.x) === -this.sign && Math.abs(cr.x) > 0.2;
        if (crossed) {
          this.boxes++;
          this.hit(cr, this.boxes);
          this.burst(cr, "#e8b98a");
          this._newCrate();
        } else {
          // dropped early — the crate stays put; pick it up again (no penalty)
          cr.state = "waiting";
          cr.born = now;
          cr.bumped = false;
          audio.miss();
        }
      }
    }
  }
  drawBg(ctx, c, now) {
    // AR: the real world behind the test — mirrored camera feed + skeleton
    if (!drawVideoMirror(ctx, c, this.t, 0.3)) {
      const g = ctx.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, "#26324e"); g.addColorStop(0.65, "#1d2740"); g.addColorStop(1, "#141b30");
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    }
    drawBody(ctx, c, this.t, { framed: !this.coach.dimming, hands: false });
    // the barrier partition of the BBT: a solid wall rising from the bottom
    // to the barrier top — carries must clear it
    const wt = this.toPx({ x: 0, y: this.barrierY });
    const w = 18;
    const wg = ctx.createLinearGradient(wt.x - w, 0, wt.x + w, 0);
    wg.addColorStop(0, "rgba(27,27,58,0.35)"); wg.addColorStop(0.5, "rgba(27,27,58,0.7)"); wg.addColorStop(1, "rgba(27,27,58,0.35)");
    ctx.fillStyle = wg;
    ctx.fillRect(wt.x - w / 2, wt.y, w, c.height - wt.y);
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.beginPath(); ctx.roundRect(wt.x - w / 2 - 3, wt.y - 6, w + 6, 8, 4); ctx.fill();
    // delivered stack on the far deck (the diegetic count)
    const deckX = wt.x - this.sign * c.width * 0.18;
    for (let i = 0; i < this.boxes; i++) {
      const col = Math.floor(i / 5), row = i % 5;
      crateShape(ctx, deckX - this.sign * col * 44, c.height * 0.88 - row * 34, 36, false);
    }
    // big friendly count on the far side (numbers allowed: it IS the test)
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.font = `800 ${Math.round(c.height * 0.09)}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(this.boxes, deckX, c.height * 0.2);
  }
  draw(ctx, c, now) {
    const cr = this.crate;
    const p = this.toPx(cr);
    crateShape(ctx, p.x, p.y, 44, cr.state === "carried");
    const hint = (text, y) => {
      ctx.fillStyle = "rgba(244,236,221,0.85)";
      ctx.font = `800 ${Math.round(c.height * 0.028)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(text, p.x, y);
    };
    if (cr.state === "waiting") {
      const pulse = Math.sin(now / 400) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(232,168,106,${0.3 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, this.params.radius * this.sw(), 0, TAU); ctx.stroke();
      if (this.handNear(cr, this.params.radius)) {
        if (!this.t.handClosed(this.side)) hint("Squeeze to grab ✊", p.y - this.params.radius * this.sw() - 16);
        else if (!cr.armed) hint("Open your hand first ✋", p.y - this.params.radius * this.sw() - 16);
      }
    }
    if (cr.state === "carried") {
      const crossed = Math.sign(cr.x) === -this.sign && Math.abs(cr.x) > 0.2;
      if (cr.bumped) hint("Lift it over the wall", p.y - this.params.radius * this.sw() - 16);
      else if (crossed) hint("Open your hand ✋", p.y - this.params.radius * this.sw() - 16);
      // guide arc up and over the wall toward the delivery side
      const wt = this.toPx({ x: 0, y: this.barrierY });
      const dir = -this.sign;
      ctx.strokeStyle = "rgba(159,192,138,0.6)"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(wt.x - dir * 70, wt.y - 20);
      ctx.quadraticCurveTo(wt.x, wt.y - 90, wt.x + dir * 70, wt.y - 20);
      ctx.stroke();
      const ax = wt.x + dir * 70, ay = wt.y - 20;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - dir * 6, ay - 15); ctx.moveTo(ax, ay); ctx.lineTo(ax - dir * 16, ay - 4); ctx.stroke();
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G8 Compass Rose — center-out reaches ==================== */
export class CompassRose extends GameBase {
  id = "compass";
  setup() {
    this.roundSeconds = 50;
    this.center = { x: this.side === "right" ? 0.35 : -0.35, y: -0.15 };
    this.dirs = [...Array(8).keys()].map(i => deg(i * 45 + 22.5));
    this.lit = new Set();
    this.state = "center";       // center → out → hold → back
    this.stateT = performance.now() + this.tellStory(STORIES.compass);
    this.combo = 0;
    if (!this.opts.tellStory) {
      this._prompt("Light the compass", "Reach out to each point, then come home");
      setTimeout(() => this._prompt(""), 3200);
    }
  }
  extra() { return { pointsLit: this.lit.size }; }
  _newTarget() {
    const remaining = this.dirs.filter((_, i) => !this.lit.has(i));
    const pool = remaining.length ? remaining : this.dirs;
    const th = pick(pool);
    this.targetIdx = this.dirs.indexOf(th);
    const r = 0.75 * this.params.rangeScale * this.envAt(th);
    this.target = { ...fromCenter(th, r), reachFrac: 0.75, isFar: r > 0.7 * this.params.rangeScale * this.envAt(th) };
    this.targetBorn = performance.now();
  }
  update(now) {
    switch (this.state) {
      case "center":
        if (this.handNear(this.center, 0.3)) {
          this.centerDwell ??= now;
          if (now - this.centerDwell > 400) {
            this.centerDwell = null;
            this._newTarget();
            this.state = "out";
            audio.note(0);
          }
        } else this.centerDwell = null;
        break;
      case "out":
        if (this.handNear(this.target, this.params.radius)) {
          this.holdSince = now;
          this.state = "hold";
        } else if (now - this.targetBorn > this.params.lifetime * 1800) {
          this.miss(this.target);
          this.combo = 0;
          this.state = "center";
        }
        break;
      case "hold":
        if (this.handNear(this.target, this.params.radius * 1.3)) {
          if (now - this.holdSince > 600) {
            this.combo++;
            this.hit(this.target, this.combo);
            this.lit.add(this.targetIdx);
            this.burst(this.target, "#ffd98a");
            if (this.lit.size === 8) {
              this.stats.stars += 40;
              audio.fanfare();
              this._speak("The compass is complete!");
              this.lit.clear();
            }
            this.state = "center";
          }
        } else this.state = "out";
        break;
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height / 2, 40, c.width / 2, c.height / 2, c.height * 0.85);
    g.addColorStop(0, "#2c3a54"); g.addColorStop(1, "#141d30");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const cp = this.toPx(this.center);
    // compass points (spokes) — lit ones glow
    this.dirs.forEach((th, i) => {
      const r = 0.75 * this.params.rangeScale * this.envAt(th);
      const p = this.toPx(fromCenter(th, r));
      ctx.strokeStyle = this.lit.has(i) ? "rgba(232,168,106,0.4)" : "rgba(244,236,221,0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      if (this.lit.has(i)) this.glow(ctx, p.x, p.y, 7, "#fff6d8", "#e8a86a", 10);
      else { ctx.fillStyle = "rgba(244,236,221,0.3)"; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill(); }
    });
    // home circle
    const homeActive = this.state === "center";
    const pulse = Math.sin(now / 400) * 0.5 + 0.5;
    ctx.strokeStyle = homeActive ? `rgba(159,192,138,${0.5 + pulse * 0.4})` : "rgba(244,236,221,0.3)";
    ctx.lineWidth = homeActive ? 5 : 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 0.3 * this.sw(), 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (this.centerDwell) {
      const f = Math.min(1, (now - this.centerDwell) / 400);
      ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 0.3 * this.sw() + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    }
    // active target
    if (this.state === "out" || this.state === "hold") {
      const p = this.toPx(this.target);
      this.glow(ctx, p.x, p.y, 12 + pulse * 5, "#fff6d8", "#e8a86a", 22);
      ctx.strokeStyle = "rgba(244,236,221,0.3)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, this.params.radius * this.sw(), 0, TAU); ctx.stroke();
      if (this.state === "hold") {
        const f = Math.min(1, (now - this.holdSince) / 600);
        ctx.strokeStyle = "#e8a86a"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.params.radius * this.sw() + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== G9 Echo Reach — proprioception ==================== */
// Show a star → reach & hold → it vanishes → return home → now reach back to
// where it WAS (no target visible) → hold → the truth is revealed and the
// error is shown. Training position sense with visible, kind feedback.
export class EchoReach extends GameBase {
  id = "echo";
  setup() {
    this.roundSeconds = 60;
    this.center = { x: this.side === "right" ? 0.35 : -0.35, y: -0.15 };
    this.state = "center";
    this.errors = [];
    this.trial = null;
    const wait = this.tellStory(STORIES.echo);
    if (!wait) {
      this._prompt("Remember where the star shines", "Then find its echo with your eyes on the sky");
      setTimeout(() => this._prompt(""), 3400);
    }
  }
  extra() {
    const m = this.errors.length ? this.errors.reduce((s, v) => s + v, 0) / this.errors.length : null;
    return { meanEchoErrSW: m != null ? Math.round(m * 100) / 100 : null, echoTrials: this.errors.length };
  }
  _newTrial() {
    const th = Math.random() * Math.PI;                     // upper half
    const r = (0.55 + Math.random() * 0.3) * this.params.rangeScale * this.envAt(th);
    this.trial = { show: fromCenter(th, r), phase: 1 };
  }
  _startEcho(now) {
    this.state = "echo";
    this.echoStart = now;
    this.nudged = false;
    this._prompt("Now find its echo", "Reach to where it was and hold. Take your time");
    if (this.errors.length < 2) this._speak("Now reach to where the star was, and hold still there. There is no rush.");
  }
  update(now) {
    switch (this.state) {
      case "center":
        if (this.handNear(this.center, 0.3)) {
          this.dwell ??= now;
          if (now - this.dwell > 400) {
            this.dwell = null;
            if (!this.trial) {
              this._newTrial(); this.state = "show";
              this._prompt("Watch the star", "Reach to it, in your own time");
              if (this.errors.length < 2) this._speak("Watch where the star shines, and reach to it. Take your time.");
            }
            else this._startEcho(now);
          }
        } else this.dwell = null;
        break;
      case "show":
        if (this.handNear(this.trial.show, this.params.radius)) {
          this.dwell ??= now;
          if (now - this.dwell > 600) {
            this.dwell = null;
            audio.note(2);
            this.state = "return";
            this._prompt("Come back home", "Gently, no hurry");
          }
        } else this.dwell = null;
        break;
      case "return":
        if (this.handNear(this.center, 0.3)) {
          this.dwell ??= now;
          if (now - this.dwell > 400) { this.dwell = null; this._startEcho(now); }
        } else this.dwell = null;
        break;
      case "echo": {
        const h = this.t.handRel(this.side);
        if (h && Math.hypot(h.x - this.center.x, h.y - this.center.y) > 0.35) {
          // holding still out in space = their answer (tremor-tolerant)
          if (this.prevEcho && Math.hypot(h.x - this.prevEcho.x, h.y - this.prevEcho.y) < 0.06) {
            this.echoDwell ??= now;
            if (now - this.echoDwell > 700) {
              const err = Math.hypot(h.x - this.trial.show.x, h.y - this.trial.show.y);
              this.errors.push(err);
              this.reveal = { guess: { x: h.x, y: h.y }, truth: { ...this.trial.show }, err, until: now + 3600 };
              const pts = err < 0.25 ? 20 : err < 0.5 ? 10 : 5;
              this.stats.stars += pts;
              this.stats.hits++;
              audio.note(err < 0.25 ? 6 : err < 0.5 ? 3 : 1);
              this._prompt(err < 0.25 ? "Perfect echo! ✦" : err < 0.5 ? "So close!" : "The star reveals itself", "");
              setTimeout(() => { if (this.active) this._prompt(""); }, 3200);
              this.trial = null;
              this.echoDwell = null;
              this.state = "center";
            }
          } else this.echoDwell = null;
          this.prevEcho = { x: h.x, y: h.y };
        }
        // gentle mid-way nudge, generous deadline, and a kind reveal on timeout
        if (!this.nudged && now - this.echoStart > 10000) {
          this.nudged = true;
          this.say("Take your time. Feel where the star was, and hold still there.");
        }
        if (now - this.echoStart > 25000) {
          this.stats.misses++;
          this.reveal = { guess: null, truth: { ...this.trial.show }, err: null, until: now + 3000 };
          this._prompt("Here it was ✦", "Let's try another");
          setTimeout(() => { if (this.active) this._prompt(""); }, 2800);
          this.trial = null;
          this.state = "center";
        }
        break;
      }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.35, 40, c.width / 2, c.height * 0.35, c.height);
    g.addColorStop(0, "#1f2547"); g.addColorStop(1, "#0f1229");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const cp = this.toPx(this.center);
    const pulse = Math.sin(now / 400) * 0.5 + 0.5;
    // home
    const homeActive = this.state === "center" || this.state === "return";
    ctx.strokeStyle = homeActive ? `rgba(159,192,138,${0.5 + pulse * 0.4})` : "rgba(244,236,221,0.25)";
    ctx.lineWidth = homeActive ? 5 : 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 0.3 * this.sw(), 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (this.dwell && homeActive) {
      const f = Math.min(1, (now - this.dwell) / 400);
      ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 0.3 * this.sw() + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    }
    // the star (only in show phase)
    if (this.state === "show" && this.trial) {
      const p = this.toPx(this.trial.show);
      this.glow(ctx, p.x, p.y, 14 + pulse * 6, "#fff6d8", "#e8a86a", 26);
      starShape(ctx, p.x, p.y, 13, "#fff2c2");
      if (this.dwell) {
        const f = Math.min(1, (now - this.dwell) / 600);
        ctx.strokeStyle = "#e8a86a"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.params.radius * this.sw() + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }
    // echo phase: hand-steadiness ring
    if (this.state === "echo" && this.echoDwell) {
      const hp = this.t.handPx(this.side, c);
      if (hp) {
        const f = Math.min(1, (now - this.echoDwell) / 700);
        ctx.strokeStyle = "#8fd0c8"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }
    // reveal: truth vs guess with the error made visible (the learning moment)
    if (this.reveal && now < this.reveal.until) {
      const tp = this.toPx(this.reveal.truth);
      if (this.reveal.guess) {
        const gp = this.toPx(this.reveal.guess);
        ctx.strokeStyle = "rgba(244,236,221,0.5)"; ctx.lineWidth = 3; ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#8fd0c8"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(gp.x, gp.y, 16, 0, TAU); ctx.stroke();
      }
      this.glow(ctx, tp.x, tp.y, 14, "#fff6d8", "#e8a86a", 24);
      starShape(ctx, tp.x, tp.y, 13, "#fff2c2");
    }
    this.drawTimerWhisper(ctx, c, now);
  }
}

/* ==================== shared little painters ==================== */
function twinkles(ctx, c) {
  const now = performance.now();
  ctx.fillStyle = "#fff";
  for (const [fx, fy, ph] of [[0.12, 0.16, 0], [0.74, 0.26, 1.2], [0.4, 0.12, 2.2], [0.88, 0.1, 0.6], [0.28, 0.3, 3.1]]) {
    ctx.globalAlpha = 0.2 + 0.5 * (Math.sin(now / 1000 + ph) * 0.5 + 0.5);
    ctx.beginPath(); ctx.arc(c.width * fx, c.height * fy, 2.4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function lanternShape(ctx, x, y, r, bright = false, hue = "#e8a86a") {
  const g = ctx.createRadialGradient(x, y - r * 0.2, 2, x, y, r * 1.4);
  g.addColorStop(0, "#fff6d8"); g.addColorStop(1, hue);
  ctx.fillStyle = g;
  ctx.shadowColor = hue; ctx.shadowBlur = bright ? 30 : 16;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.78, r, 0, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
}
function roundedRect(ctx, x, y, w, h, r, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.shadowColor = c2; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.shadowBlur = 0;
}
function starShape(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = i * Math.PI / 5 - Math.PI / 2;
    i === 0 ? ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) : ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath(); ctx.fill();
}
function crateShape(ctx, x, y, s, bright) {
  ctx.save();
  const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
  g.addColorStop(0, bright ? "#e8b98a" : "#a8825c"); g.addColorStop(1, bright ? "#c77f4a" : "#7a5c3e");
  ctx.fillStyle = g;
  if (bright) { ctx.shadowColor = "#e8a86a"; ctx.shadowBlur = 22; }
  ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, 6); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(27,27,58,0.4)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - s / 2 + 4, y); ctx.lineTo(x + s / 2 - 4, y); ctx.stroke();
  ctx.restore();
}

export const GAMES = [
  { id: "constellations", name: "Constellations", cls: Constellations },
  { id: "drift", name: "Drift", cls: Drift },
  { id: "ember", name: "Ember Watch", cls: EmberWatch },
  { id: "lantern", name: "Lantern Release", cls: LanternRelease },
  { id: "pong", name: "Arc Pong", cls: ArcPong },
  { id: "rhythm", name: "Melody Tiles", cls: MelodyTiles, disabled: true },   // disabled for now
  { id: "boxes", name: "Harbor Crates", cls: HarborCrates },
  { id: "compass", name: "Compass Rose", cls: CompassRose },
  { id: "echo", name: "Echo Reach", cls: EchoReach },
];

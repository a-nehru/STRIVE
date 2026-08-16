// The game suite. Shared ideas:
//  - combo melody: consecutive catches climb the pentatonic scale
//  - the world responds to play (windows light, sea sparkles, sky fills)
//  - misses are soft; stories open round 1; layouts mirror for left/right arm
//  - targets only inside the assessed envelope × rangeScale, clamped on-screen
// "Grab" is dwell-based in v1 (hand-close detection is the M3 upgrade).

import { GameBase, TAU, CENTER, drawBody, drawVideoMirror, drawHand } from "./engine.js";
import { audio } from "./audio.js";
import { songById } from "./songs.js";
import { A11Y } from "./a11y.js";

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
  sling: { title: "Cloud slingshot", text: "The dark clouds have built towers over the village. Pull the sling right back, hold it, and let go." },
  rgs: { title: "Catch together", text: "Lights are drifting in from the harbour. Cup both hands to catch one, then set it in a basket." },
  dots: { title: "Connect the dots", text: "There is a picture hiding in these dots. Go from one to the next and it will draw itself." },
  lens: { title: "Scratch cards", text: "Under the silver there is a picture. Scrape it away with your hand and see what it is." },
  crane: { title: "The night crane", text: "Hold the crane high and steady. Squeeze to catch each crate as it passes." },
  feather: { title: "The feather lantern", text: "Lift the lantern to its hook. Then lower it, slow as a feather." },
  buoys: { title: "The two lights", text: "Two buoys blink in the dark. Touch one, then the other. Find your rhythm." },
  oars: { title: "The ferry oars", text: "Both hands row together tonight. The boat loves an even stroke." },
  ferry: { title: "The night ferry", text: "Steer between the buoys and bring her gently into the berth." },
  stars: { title: "Falling stars", text: "Stars are streaking down the sky. Sweep your hand through them and they bloom." },
  flare: { title: "The signal flare", text: "Pull the flare line back, hold it steady, and open your hand to light the sky." },
  shelf: { title: "The pantry shelves", text: "The jars go up tonight. Each shelf a little higher than the last." },
  windows: { title: "Light every window", text: "The town sleeps dark. Light every window before the dawn." },
  sorting: { title: "The harbor lights", text: "Catch only tonight's lanterns. Listen for the chime, the rule may change." },
  teapot: { title: "The teapot turn", text: "Palm up catches the honey. Palm down pours the tea." },
  glide: { title: "The firefly glide", text: "Squeeze gently and the firefly rises. Relax, and she drifts down." },
  bloom: { title: "The night blooms", text: "Open your hand wide for the big flowers, halfway for the small. Arrive ready." },
  pinch: { title: "The firefly pinch", text: "Catch fireflies with just two fingertips. A whole fist frightens them." },
  rainbow: { title: "The rainbow to Strivealon", text: "Dark clouds sit on the rainbow road. Walk across, sweep them off, and the treasure is yours." },
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
// How a long rally ends. The star used to simply go to sleep — drift to the
// middle and stop keeping up — which reads as being handed the point rather
// than winning it. Instead it loses the way a person does: it MISREADS one
// shot. From AI_SLIP_FROM seconds into the round the next ball the patient
// sends back is steered to the far corner, the star commits to the wrong side
// (anticipating a return to where the ball just was — the error people
// actually make), then lunges back at full speed and arrives a fraction
// short. The patient's shot wins the point, and it looks like it.
// A game is to PONG_WIN points. The round still has a time limit, but
// reaching five ends it — a match that finishes on a scoreline finishes,
// where one that finishes on a clock just stops.
const PONG_WIN = 5;
// the hand drawn on the paddle: small and faint on purpose — it is a
// reminder of what drives the paddle, not a thing to watch
// Paddle smoothing (One-Euro): cutoff in Hz when the arm is still, how fast
// that cutoff opens with arm speed, and the cutoff of the SPEED estimate.
// That last one matters more than it looks: with a fast speed estimate the
// landmark noise itself reads as movement and opens the filter back up, so
// lowering it is what actually buys quiet at rest. Measured at 60 fps against
// 3%-of-lane input noise: 3.5x quieter held still, 2.9% lag at a realistic
// rehab pace, 7% on a half-second sweep. A fixed 90 ms filter needed 16% lag
// for the same quieting.
const PADDLE_MIN_CUT = 0.6, PADDLE_BETA = 8.0, PADDLE_D_CUT = 0.25;
const PONG_HAND_SCALE = 0.42, PONG_HAND_ALPHA = 0.38;
// nudged OUTWARD from the court so the hand hugs the back of its paddle
// rather than spilling into the play area (the paddle itself is only 16px)
const PONG_HAND_OUT = 16;
const AI_SLIP_FROM = 80, AI_SLIP_BY = 85;
// The lunge is released on TIME, not on a fixed fraction of the flight: it
// breaks the wrong way only when there is just barely enough left to get
// back. A fixed fraction leaves the paddle still travelling when the ball
// arrives, which stops it a paddle and a half away and reads as "wasn't
// close" rather than "so nearly got it".
const AI_SLIP_LATE = 1.15;     // release with this much of the needed time in hand
const AI_SLIP_GAP = 0.3;       // how far past the paddle edge the ball slips, in paddle heights
// The star still tires first, so the slip is not the only thing that changes
// — but the fade is now gentle and capped: a sluggish opponent is not the
// mechanism, the misread is.
const AI_FADE_FROM = 55, AI_FADE_TO = 95, AI_FADE_MAX = 0.4;
// Modes:
//   solo       patient arm vs gentle (beatable!) AI — points scored both ways
//   bimanual   left arm vs right arm (self-rally)
//   coupled    both arms average into one paddle vs AI
//   companion  friend on arrow keys vs patient (opposite sides)
//   team-arms  BOTH the patient's arms defend one side together vs AI (co-active)
//   team-keys  patient arm + companion on keys defend together vs AI (collaborative)
export class ArcPong extends GameBase {
  id = "pong";
  armBehind = false;       // a hand ON the paddle has to be on top of it
  // Pong draws NO arm. The full skeleton translated across the court was a
  // second moving shape competing with the ball, and the capture ring means
  // nothing in a game driven by a paddle. What is left is the one useful
  // part: a small, translucent hand sitting ON the paddle it drives, still
  // curling and closing live, so the arm→paddle mapping stays visible
  // without anything crossing the play area. Each paddle gets the hand that
  // actually drives it — left paddle, left hand.
  _handPads() {
    const other = this.side === "right" ? "left" : "right";
    const c = this.canvas;
    const lx = this.court.left * c.width, rx = this.court.right * c.width;
    const O = PONG_HAND_OUT;
    const out = [{ x: this.patientRight ? rx + O : lx - O,
                   y: this.patientRight ? this.pads?.rightY : this.pads?.leftY,
                   side: this.side }];
    if (this.mode === "bimanual") {
      out.push({ x: this.patientRight ? lx - O : rx + O,
                 y: this.patientRight ? this.pads?.leftY : this.pads?.rightY,
                 side: other });
    } else if (this.mode === "team-arms") {
      out.push({ x: this.patientRight ? rx + 26 + O : lx - 26 - O,
                 y: this.patientRight ? this.pads?.rightY2 : this.pads?.leftY2,
                 side: other });
    }
    return out.filter(h => h.y != null);
  }

  _drawArmAndCursor(ctx, c, now) {
    if (!this.pads) return;
    for (const h of this._handPads()) {
      const cy = (h.y + this.paddleH / 2) * c.height;
      const pm = this.t.palmPx(h.side, c);
      ctx.save();
      ctx.globalAlpha = PONG_HAND_ALPHA;
      // the hand's own landmarks, shrunk and re-centred onto the paddle: the
      // shape is still the patient's real hand, it has just been moved to
      // where the thing it controls is
      const map = pm ? (q => ({ x: (q.x - pm.x) * PONG_HAND_SCALE + h.x,
                                y: (q.y - pm.y) * PONG_HAND_SCALE + cy })) : null;
      const drawn = map && drawHand(ctx, c, this.t, h.side, { map, scale: PONG_HAND_SCALE, fallback: false });
      if (!drawn) {
        // no hand model: a small open/closed disc says the same thing
        const closed = this.t.handClosed(h.side);
        ctx.fillStyle = closed ? "#9fc08a" : "rgba(244,236,221,0.65)";
        ctx.strokeStyle = "rgba(244,236,221,0.65)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(h.x, cy, closed ? 9 : 11, 0, TAU);
        closed ? ctx.fill() : ctx.stroke();
      }
      ctx.restore();
    }
  }
  setup() {
    // vs the AI the round has to outlast the star's fade, or the round ends
    // before the patient ever gets to beat it (see AI_FADE_TO)
    // vs the AI the round has to outlast the slip, or it would end before the
    // patient ever got to take the point they earned
    this.roundSeconds = this.opts.tellStory ? 80
      : (this.opts.mode || "solo") === "duo" ? 60
      : AI_SLIP_BY + 20;
    this.mode = this.opts.mode || "solo";
    this.profiles = this.opts.profiles || {};
    this.patientRight = this.side === "right";
    this.isTeam = this.mode.startsWith("team");
    this.hasAI = this.mode === "solo" || this.mode === "coupled" || this.isTeam;
    // two people, one camera: each player's arm side is fixed for the round
    // (chosen in the flow) and the bridge locks each to a seat, so nobody
    // inherits the other's paddle mid-rally
    this.isDuo = this.mode === "duo";
    this.p2Side = this.opts.p2Side || "right";
    this.p2Profile = this.opts.p2Profile || null;
    this.p2Waiting = 0;
    this.rally = 0; this.bestRally = 0;
    this.score = { us: 0, ai: 0 };
    // skill shots (Zhang's choice element): grip = catch & fire, spin = palm turn
    this.skills = this.opts.skills || { grip: false, spin: false };
    this.gripShots = 0; this.spinShots = 0;
    this.gripEnergy = 0;     // charges with returns; a full bar buys one catch
    this.caught = null;
    this.skillFlash = null;
    this.court = { top: 0.16, bottom: 0.9, left: 0.1, right: 0.9 };
    this.paddleH = 0.17;
    // contained lane: hard walls pulled INSIDE the court to match the arc
    // span the DDA currently demands (rangeScale) — the ball can never go
    // where the paddle can't, so a small arc still gets a fully playable,
    // rebounding lane; walls widen as rangeScale grows between rounds
    const half = Math.min(1, this.params.rangeScale) * (this.court.bottom - this.court.top) / 2 + this.paddleH / 2;
    this.wallTop = Math.max(this.court.top, 0.5 - half);
    this.wallBottom = Math.min(this.court.bottom, 0.5 + half);
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
    // round 1: skippable learn-by-doing tutorial instead of the story. Its
    // paddle sweeps double as a speed assessment: the median top<->bottom
    // traversal time sets the ball's crossing time (pongCrossTime), which
    // main.js persists into params.lifetime for the DDA to adjust from.
    // the tutorial is a solo speed measurement (five star touches by ONE
    // paddle); with two people waiting it just strands player 2, so duo
    // rounds go straight to the rally
    this.tut = this.opts.tellStory && !this.isDuo
      ? { step: 0, said: -1, skipDwell: null, touches: [], lastTouch: null, target: "top" }
      : null;
    if (!this.tut) {
      const SUB = {
        solo: "Raise and lower your arm to score points past the other paddle!",
        bimanual: "Each arm has its own paddle. Rally with yourself!",
        coupled: "Both arms together steer one paddle",
        companion: "A friend plays the other paddle with the arrow keys",
        "team-arms": "Both your arms defend together. Beat the AI!",
        "team-keys": "You and your teammate defend together. Beat the AI!",
        duo: "Two players, one camera. Stand side by side and rally together!",
      };
      const skillHint = [this.skills.grip && "fill the glow bar, then squeeze to catch & fire", this.skills.spin && "turn your palm for spin"]
        .filter(Boolean).join(" · ");
      this._prompt("Rally with the light", SUB[this.mode] + (skillHint ? ` (${skillHint})` : ""));
      setTimeout(() => this._prompt(""), 3200);
      this._startServe(performance.now());
    }
  }
  stop() {
    if (this._keyDown) { removeEventListener("keydown", this._keyDown); removeEventListener("keyup", this._keyUp); }
    super.stop();
  }
  extra() {
    return {
      pongMode: this.mode, bestRally: this.bestRally, points: this.score.us, aiPoints: this.score.ai,
      // two-player rounds: whose arm, and whether the camera held them
      ...(this.isDuo ? { p2Side: this.p2Side, p2Name: this.opts.p2Name ?? null,
                         p2LostFrames: this._p2LostTotal | 0 } : {}),
      gripShots: this.gripShots, spinShots: this.spinShots,
      skills: { ...this.skills },
      // tutorial warm-up measurement: median lane traversal time and the ball
      // crossing time derived from it (absent when the tutorial was skipped)
      paddleTraversalS: this.paddleTraversalS ?? null,
      pongCrossTime: this.pongCrossTime ? Math.round(this.pongCrossTime * 100) / 100 : null,
      // did the patient outlast the star far enough to take the misread point
      slipPoint: !!this._slipUsed,
      // a match is to PONG_WIN; null when the round ran out of time first
      matchWon: this.matchOver ? this.score.us >= PONG_WIN : null,
      target: PONG_WIN,
    };
  }
  // grip shot step 1: a DELIBERATE squeeze at contact catches the ball — the
  // hand must have closed within the last moment, so a hand that simply rests
  // closed never catches by accident
  _tryCatch(now, edge, py) {
    if (!this.skills.grip || this.caught) return false;
    if ((edge === "right") !== this.patientRight) return false;   // primary paddle only
    if (!this.t.handClosed(this.side)) return false;
    if (this._closedAt == null || now - this._closedAt > 900) return false;   // stale grip, not a catch
    if (this.gripEnergy < 1) return false;    // the catch is earned: full bar only
    const b = this.ball;
    this.gripEnergy = 0;
    this.caught = { since: now, edge, vx0: Math.abs(b.vx) };
    b.vx = 0; b.vy = 0; b.spin = 0;
    this.rally++; this.bestRally = Math.max(this.bestRally, this.rally);
    this.hit({ reachFrac: 0.7, isFar: false }, this.rally);
    audio.note(4);
    this.skillFlash = { text: "Caught! Open to fire ✋", until: now + 1600 };
    return true;
  }
  _startServe(now) {
    this.serving = { start: now, beats: -1 };
    this.ball = null;
    this._tired = 0;
    this.matchOver = 0;       // when someone reached PONG_WIN
    this._slip = null;        // the misread in progress (see AI_SLIP_FROM)
    this._slipUsed = false;   // one earned point per round, not a repeating gift
  }

  // round-1 tutorial: (0) touch the star at the lane top, then bottom, five
  // times — the sweeps teach the control AND measure real paddle speed —
  // then (1) meet one easy serve, then play. Hover the skip pill to jump in.
  _tutTargetY() {
    return this.tut.target === "top"
      ? this.wallTop + this.paddleH / 2 + 0.02
      : this.wallBottom - this.paddleH / 2 - 0.02;
  }
  _pongTut(now) {
    const c = this.canvas;
    const hp = this.t.palmPx(this.side, c);
    const sx = c.width - 115, sy = 62;
    if (hp && Math.hypot(hp.x - sx, hp.y - sy) < 62) {
      this.tut.skipDwell ??= now;
      if (now - this.tut.skipDwell > 1200) {
        this.tut = null;
        this._prompt("");
        if (!this.ball && !this.serving) this._startServe(now);
        this.say("Alright, rally time!");
        return;
      }
    } else this.tut.skipDwell = null;

    const LINES = {
      0: ["Your helper pulls the paddle", "Raise and lower your arm. Touch each star with your paddle"],
      1: ["Here comes the star, nice and easy", "Watch it come, and meet it with your paddle"],
      2: ["You have it!", "Rally with the star. Outlast it, and the point is yours"],
    };
    if (this.tut.said !== this.tut.step) {
      this.tut.said = this.tut.step;
      const [a, b] = LINES[this.tut.step];
      this._prompt(a, b);
      this._speak(a + ". " + b + ".");
    }

    if (this.tut.step === 0) {
      const padY = this.patientRight ? this.pads.rightY : this.pads.leftY;
      if (padY == null) return;
      const targetY = this._tutTargetY();
      if (Math.abs(padY + this.paddleH / 2 - targetY) < this.paddleH * 0.6) {
        if (this.tut.lastTouch != null) this.tut.touches.push((now - this.tut.lastTouch) / 1000);
        this.tut.lastTouch = now;
        this.tut.target = this.tut.target === "top" ? "bottom" : "top";
        audio.note(this.tut.touches.length);
        this.burstAtPx((this.patientRight ? this.court.right : this.court.left) * c.width,
                       targetY * c.height, "#ffd98a");
        if (this.tut.touches.length >= 4) {
          // drop the first transition (reaction, not speed), take the median
          const tr = this.tut.touches.slice(1).sort((a, b) => a - b);
          const median = tr[Math.floor(tr.length / 2)];
          this.paddleTraversalS = Math.round(median * 100) / 100;
          this.pongCrossTime = Math.min(5.5, Math.max(1.6, 1.4 * median + 0.45));
          this.tut.step = 1;
          this._startServe(now);
        }
      }
    } else if (this.tut.step === 1 && this.rally >= 1) {
      this.tut.step = 2;
      setTimeout(() => { if (this.active && this.tut) { this.tut = null; this._prompt(""); } }, 3800);
    }
  }
  _launch(now) {
    // Served from the MIDDLE of the court, travelling towards the opponent:
    // the point opens with the patient's shot on its way out, so the first
    // thing they do in a rally is watch their own ball go rather than react
    // to one arriving.
    const laneMid = (this.wallTop + this.wallBottom) / 2;
    const ty = laneMid + (Math.random() - 0.5) * 0.5 * (this.wallBottom - this.wallTop - this.paddleH);
    // constant rally speed: the ball always crosses in a fixed number of
    // seconds (difficulty moves between rounds via the DDA, never mid-rally).
    // The tutorial's measured paddle speed overrides the assessment seed.
    const vx0 = (this.court.right - this.court.left) / (this.pongCrossTime || this.params.lifetime);
    this.baseVx = vx0;
    const x0 = (this.court.left + this.court.right) / 2;
    const toAI = this.patientRight ? -1 : 1;          // away from the patient
    this.ball = { x: x0, y: laneMid, tx: ty, vx: toAI * vx0, born: now };
    // aimed to arrive near ty at the opponent's edge — half a court away, so
    // the flight time is half a crossing
    const tFlight = Math.abs(this._aiEdgeX() - x0) / vx0;
    this.ball.vy = tFlight > 0 ? (ty - laneMid) / tFlight : 0;
    this._capVy(this.ball);
  }

  // second player's paddle (ZED seat 1). Their own assessed arc drives it, so
  // a limited range still reaches the whole lane. While they are not tracked
  // the paddle HOLDS its last position instead of snapping to the middle —
  // a snap would silently gift a point.
  _angleToY2() {
    const a = this.t.armAngle2?.(this.p2Side);
    if (a == null) {
      this.p2Waiting++;
      return this._lastP2Y ?? 0.5 - this.paddleH / 2;
    }
    this.p2Waiting = 0;
    const prof = this.p2Profile;
    const lo = prof?.arcMinDeg ?? this.profile.arcMinDeg;
    const hi = prof?.arcMaxDeg ?? this.profile.arcMaxDeg;
    const f = Math.max(0, Math.min(1, (a - lo) / Math.max(10, hi - lo)));
    const cLo = this.wallTop + this.paddleH / 2, cHi = this.wallBottom - this.paddleH / 2;
    this._lastP2Y = cHi - f * (cHi - cLo) - this.paddleH / 2;
    return this._lastP2Y;
  }
  // The paddle is SMOOTHED, not raw. Landmark noise of a degree or two becomes
  // visible chatter once the whole assessed arc is stretched across the lane,
  // and the narrower the patient's arc the worse it gets: a 30° arc makes 1°
  // of noise 3% of the lane, and the 10° floor makes it 10%. The same filter
  // absorbs the trunk-axis jitter that armAngle inherits from the fast anchor.
  //
  // The filter is ADAPTIVE (a One-Euro), because a fixed one has to choose:
  // smooth enough to hold still is too laggy to rally, and quick enough to
  // rally still chatters when the arm is held. This one widens its cutoff
  // with the arm's own speed — heavy when they are holding a position, light
  // when they are actually moving.
  _lpAlpha(cutHz, dts) { const r = 2 * Math.PI * cutHz * dts; return r / (r + 1); }

  _angleToY(arm, prof, dt = 16) {
    this._padY ??= {};
    const a = this.t.armAngle(arm);
    const mid = (this.wallTop + this.wallBottom) / 2 - this.paddleH / 2;
    let target = null;
    if (a != null) {
      const lo = prof?.arcMinDeg ?? this.profile.arcMinDeg;
      const hi = prof?.arcMaxDeg ?? this.profile.arcMaxDeg;
      const f = Math.max(0, Math.min(1, (a - lo) / Math.max(10, hi - lo)));
      // whole assessed arc maps onto the walled lane: paddle stays flush inside
      const cLo = this.wallTop + this.paddleH / 2, cHi = this.wallBottom - this.paddleH / 2;
      target = cHi - f * (cHi - cLo) - this.paddleH / 2;
    }
    const st = this._padY[arm] ??= { y: null, dy: 0 };
    // no angle this frame: HOLD position. Snapping to the middle on a dropped
    // frame is the biggest jump of all, and mid-rally it gifts a point.
    if (target == null) return st.y ??= mid;
    if (st.y == null) { st.y = target; return target; }
    const dts = Math.max(1, dt) / 1000;
    const rawD = (target - st.y) / dts;
    st.dy += this._lpAlpha(PADDLE_D_CUT, dts) * (rawD - st.dy);
    const cut = PADDLE_MIN_CUT + PADDLE_BETA * Math.abs(st.dy);
    st.y += this._lpAlpha(cut, dts) * (target - st.y);
    return st.y;
  }

  _keysPaddle(dt) {
    const v = 0.5 * dt / 1000;
    if (this.keys.up) this.keysY -= v;
    if (this.keys.down) this.keysY += v;
    this.keysY = Math.max(this.wallTop, Math.min(this.wallBottom - this.paddleH, this.keysY));
    return this.keysY;
  }
  // flat-flight rule: vertical speed never exceeds 38% of horizontal, so
  // rallies cross the field instead of ricocheting between the walls
  _capVy(b) {
    const m = 0.38 * Math.abs(b.vx);
    if (Math.abs(b.vy) > m) b.vy = Math.sign(b.vy) * m;
  }
  // paddles: {leftY, rightY, leftY2?, rightY2?} — the 2s are teammate paddles
  // Has anyone reached PONG_WIN? Returns true when the match is over, so the
  // caller stops instead of serving again. The tutorial never counts — it is
  // a speed measurement, not a game.
  _checkMatch(now) {
    if (this.tut) return false;
    const us = this.score.us, them = this.score.ai;
    if (us < PONG_WIN && them < PONG_WIN) return false;
    this.matchOver = now;
    this.ball = null;
    this.serving = null;
    this._slip = null;
    if (us >= PONG_WIN) {
      audio.fanfare();
      this.say(`Game! ${us} to ${them}. You won it.`);
    } else {
      // losing is allowed to happen — an opponent that cannot win is not an
      // opponent — but it is never framed as the patient's failure
      audio.point();
      this.say(this.isDuo
        ? `Game to ${this.opts.p2Name || "player two"}, ${them} to ${us}. Good rallies.`
        : `The star got there first, ${them} to ${us}. Good rallies — go again?`);
    }
    return true;
  }

  // which edge the AI defends
  _aiEdgeX() { return this.patientRight ? this.court.left : this.court.right; }

  // Where a ball at (y, vy) ends up t seconds later, bouncing off the rails:
  // a triangle wave folded into the lane, so the prediction is right even
  // when the shot to the corner rebounds on the way.
  _predictY(y, vy, t) {
    const H = this.wallBottom - this.wallTop;
    if (!(H > 0)) return y;
    const period = 2 * H;
    let d = (y - this.wallTop) + vy * t;
    d = ((d % period) + period) % period;
    return this.wallTop + (d <= H ? d : period - d);
  }

  // Engage the misread, once, on a ball already heading for the AI. Called
  // early in the flight so the steer still reads as the patient's shot: the
  // ball is sent to the corner AWAY from the star, and the star reads it as
  // coming back to the side it is already on.
  _engageSlip(now) {
    const b = this.ball;
    if (!b) return;
    const laneMid = (this.wallTop + this.wallBottom) / 2;
    const toTop = this.aiY > laneMid;          // place it away from where it stands
    const targetY = toTop ? this.wallTop + this.paddleH * 0.35
                          : this.wallBottom - this.paddleH * 0.35;
    const tFlight = Math.abs(b.x - this._aiEdgeX()) / Math.abs(b.vx || 0.25);
    if (tFlight > 0) b.vy = (targetY - b.y) / tFlight;
    this._capVy(b);                            // the flat-flight rule still holds
    this._slip = {
      fromX: b.x,
      // it holds the side it is already on — anticipating a return to where
      // the ball just was, which is the error people actually make
      wrongY: toTop ? this.wallBottom - this.paddleH / 2 : this.wallTop + this.paddleH / 2,
      missSign: toTop ? 1 : -1,                // ends up just below a high ball, just above a low one
      at: now,
    };
  }

  _paddles(now, dt) {
    const other = this.side === "right" ? "left" : "right";
    const p = {};
    let patientY;
    if (this.mode === "coupled") {
      patientY = (this._angleToY(this.side, this.profiles[this.side], dt) + this._angleToY(other, this.profiles[other], dt)) / 2;
    } else {
      patientY = this._angleToY(this.side, this.profiles[this.side], dt);
    }
    // AI with reaction lag (so it genuinely misses sharp shots). On a very
    // long rally the star gets sleepy: from 75 s its reactions fade, and past
    // 90 s it drifts to the middle and can no longer keep up — the patient
    // wins the point through ordinary play, never by a timer cutting in.
    if (this.hasAI && this.ball && !this.caught) {   // a caught ball freezes the AI — the catch buys aiming time
      const s = dt / 1000;
      // the star tires over the ROUND, not the current rally: tied to rally
      // age it almost never fired, because a single rally rarely lasts 75 s.
      // It fades from AI_FADE_FROM and is fully passed by AI_FADE_TO, so the
      // patient wins the point through ordinary play at about that mark.
      const age = this.elapsed(now) / 1000;
      const tired = Math.max(0, Math.min(1, (age - AI_FADE_FROM) / (AI_FADE_TO - AI_FADE_FROM))) * AI_FADE_MAX;
      this._tired = tired;
      const lo = this.wallTop + this.paddleH / 2, hi = this.wallBottom - this.paddleH / 2;
      if (this._slip) {
        // The misread. Full speed throughout — a natural miss is a fast,
        // confident, WRONG commitment, not a slow one. First it holds the
        // side the ball came from; then it reads the corner, lunges, and
        // stops at a target that sits AI_SLIP_GAP of a paddle past the ball,
        // so it arrives a sliver short instead of leaving it to chance.
        const sl = this._slip;
        const vmaxS = 0.26;
        // where the ball will actually arrive, rails included, and the spot
        // that leaves it a sliver clear of the paddle edge
        const tRemain = Math.abs(this.ball.x - this._aiEdgeX()) / Math.abs(this.ball.vx || 1e-6);
        const arrive = this._predictY(this.ball.y, this.ball.vy, tRemain);
        const missY = Math.max(lo, Math.min(hi,
          arrive + sl.missSign * (this.paddleH / 2 + this.paddleH * AI_SLIP_GAP)));
        if (!sl.recover && tRemain <= (Math.abs(missY - this.aiY) / vmaxS) * AI_SLIP_LATE) {
          sl.recover = true;                       // it has seen it — too late
        }
        const want = sl.recover ? missY : sl.wrongY;
        this.aiY += Math.max(-vmaxS * s, Math.min(vmaxS * s, want - this.aiY));
        this.aiLagY = this.aiY;                    // no stale lag when it recovers
        this.aiY = Math.max(lo, Math.min(hi, this.aiY));
      } else {
        const gain = 3 * (1 - tired);
        const vmax = 0.24 * (1 - tired);
        this.aiLagY += (this.ball.y - this.aiLagY) * Math.min(1, gain * s);
        this.aiY += Math.max(-vmax * s, Math.min(vmax * s, this.aiLagY - this.aiY));
        this.aiY = Math.max(lo, Math.min(hi, this.aiY));
      }
    }
    const aiPad = this.aiY - this.paddleH / 2;
    if (this.patientRight) {
      p.rightY = patientY;
      p.leftY = this.mode === "bimanual" ? this._angleToY(other, this.profiles[other], dt)
        : this.isDuo ? this._angleToY2()
        : this.mode === "companion" ? this._keysPaddle(dt) : aiPad;
      if (this.mode === "team-arms") p.rightY2 = this._angleToY(other, this.profiles[other], dt);
      if (this.mode === "team-keys") p.rightY2 = this._keysPaddle(dt);
    } else {
      p.leftY = patientY;
      p.rightY = this.mode === "bimanual" ? this._angleToY(other, this.profiles[other], dt)
        : this.isDuo ? this._angleToY2()
        : this.mode === "companion" ? this._keysPaddle(dt) : aiPad;
      if (this.mode === "team-arms") p.leftY2 = this._angleToY(other, this.profiles[other], dt);
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
    // the match is decided: hold the final board for a beat so the scoreline
    // is read, then finish the round on it rather than on the clock
    if (this.matchOver) {
      if (now - this.matchOver > 3000) this._end();
      this.pads = this._paddles(now, dt);
      return;
    }
    this.pads = this._paddles(now, dt);

    // second player out of frame: say so once, gently, and again only after
    // they have been back. Their paddle is holding still, which otherwise
    // looks like the game froze.
    if (this.isDuo) {
      if (this.p2Waiting) this._p2LostTotal = (this._p2LostTotal | 0) + 1;
      if (this.p2Waiting === 90 && !this._p2Cued) {
        this._p2Cued = true;
        this.say("Second player, step back into the picture when you are ready");
      } else if (!this.p2Waiting) this._p2Cued = false;
    }

    // squeeze edge for the grip shot: remember WHEN the hand closed, so a
    // catch needs a fresh, intentional squeeze at contact
    const closedNow = this.t.handClosed(this.side);
    if (closedNow && !this._wasClosed) this._closedAt = now;
    this._wasClosed = closedNow;

    if (this.tut) {
      this._pongTut(now);
      if (!this.ball && !this.serving) return;   // tutorial step 0: no ball yet
    }

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
        // aimed, not random: fire toward the lane half AWAY from the AI paddle
        const laneMid = (this.wallTop + this.wallBottom) / 2;
        const ty = this.hasAI
          ? (this.aiY < laneMid ? this.wallBottom - this.paddleH / 2 : this.wallTop + this.paddleH / 2)
          : laneMid;
        b.vy = (ty - b.y) / ((this.court.right - this.court.left) / Math.abs(b.vx));
        this._capVy(b);
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
    // The star's one misread of the round. Taken on the first ball heading
    // its way after AI_SLIP_FROM, and caught early in the flight so the steer
    // to the corner still reads as the patient's shot rather than the ball
    // bending on its own. AI_SLIP_BY is the backstop: past it, any flight
    // will do, however far along it already is.
    if (this.hasAI && !this.isDuo && !this._slip && !this._slipUsed && !this.tut) {
      const age = this.elapsed(now);
      const toAI = this.patientRight ? b.vx < 0 : b.vx > 0;
      if (toAI && (age >= AI_SLIP_BY || (age >= AI_SLIP_FROM &&
          Math.abs(b.x - (this.patientRight ? this.court.right : this.court.left)) < 0.3))) {
        this._slip = { fromX: b.x };            // provisional, replaced below
        this._engageSlip(now);
      }
    }
    b.x += b.vx * s; b.y += b.vy * s;
    if (b.spin) b.vy += b.spin * s;                          // spin curves the flight
    this.trail.push({ x: b.x, y: b.y, t: now });
    this.trail = this.trail.filter(p => now - p.t < 260);
    // rebound off the lane walls (position clamped so it can't tunnel out)
    if (b.y < this.wallTop) { b.y = this.wallTop; b.vy = Math.abs(b.vy); audio.bounce(); }
    else if (b.y > this.wallBottom) { b.y = this.wallBottom; b.vy = -Math.abs(b.vy); audio.bounce(); }

    const patRight = this.patientRight;
    const returnBall = (dir, py, isPlayerSide) => {
      // every return resets to the base speed — skill shots punch briefly,
      // but the rally itself never accelerates
      b.vx = dir * (this.baseVx || Math.abs(b.vx));
      b.vy += ((b.y - (py + this.paddleH / 2)) / this.paddleH) * 0.12;   // gentle deflection: flat rallies
      b.spin = 0;
      audio.paddle();   // the physical "pock" of the return, both sides
      if (isPlayerSide) {
        this.rally++; this.bestRally = Math.max(this.bestRally, this.rally);
        this.hit({ reachFrac: 0.7, isFar: false }, this.rally);
        // every return charges the grip gauge; a full bar announces itself
        const wasFull = this.gripEnergy >= 1;
        this.gripEnergy = Math.min(1, this.gripEnergy + 0.2);
        if (this.skills.grip && !wasFull && this.gripEnergy >= 1) {
          this.skillFlash = { text: "Grip shot charged ✊", until: now + 1600 };
          audio.note(5);
        }
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
        if (this.hasAI) {   // AI aims inside the walled lane, near the middle
          const laneMid = (this.wallTop + this.wallBottom) / 2;
          b.tx = laneMid + (Math.random() - 0.5) * 0.5 * (this.wallBottom - this.wallTop - this.paddleH);
          b.vy = (b.tx - b.y) / ((this.court.right - this.court.left) / Math.abs(b.vx)) + (Math.random() - 0.5) * 0.03;
        }
      }
      this._capVy(b);
    };

    // right edge
    if (b.vx > 0 && b.x >= this.court.right - 0.02) {
      const py = this._edgeHit(b, [this.pads.rightY, this.pads.rightY2]);
      const playerSide = patRight || this.mode === "bimanual";
      if (py != null) { if (!this._tryCatch(now, "right", py)) returnBall(-1, py, patRight || this.mode === "bimanual"); }
      else if (b.x > this.court.right + 0.04) {
        const slipped = !!this._slip;
        if (playerSide) {
          this.miss({ isFar: false }); this.rally = 0;
          // in duo the far paddle is a person, not the AI: the same tally
          // counts their points, and they get named rather than "the star"
          if ((this.hasAI || this.isDuo) && !this.tut) this.score.ai++;
          if (this._checkMatch(now)) return;
          if (this.isDuo) this.say(`Point to ${this.opts.p2Name || "player two"}!`);
        }
        else {
          this.score.us++; this.pointFlash = now + 1300; audio.point();
          if (this._slip) { this._slipUsed = true; this._slip = null; }
          if (this._checkMatch(now)) return;
          this.say(slipped ? "Right into the corner! Point to you!" : "Point to you!");
        }
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
        const slipped = !!this._slip;
        if (playerSide) {
          this.miss({ isFar: false }); this.rally = 0;
          // in duo the far paddle is a person, not the AI: the same tally
          // counts their points, and they get named rather than "the star"
          if ((this.hasAI || this.isDuo) && !this.tut) this.score.ai++;
          if (this._checkMatch(now)) return;
          if (this.isDuo) this.say(`Point to ${this.opts.p2Name || "player two"}!`);
        }
        else {
          this.score.us++; this.pointFlash = now + 1300; audio.point();
          if (this._slip) { this._slipUsed = true; this._slip = null; }
          if (this._checkMatch(now)) return;
          this.say(slipped ? "Right into the corner! Point to you!" : "Point to you!");
        }
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
      ctx.beginPath(); ctx.moveTo(X(side), Y(this.wallTop));
      ctx.quadraticCurveTo(X(side + (side < 0.5 ? -0.04 : 0.04)), Y((this.wallTop + this.wallBottom) / 2), X(side), Y(this.wallBottom));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // the lane walls: solid glowing rails the ball rebounds off — the whole
    // game visibly lives where the paddle can reach
    ctx.save();
    ctx.strokeStyle = "rgba(244,236,221,0.4)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(232,168,106,0.5)"; ctx.shadowBlur = 10;
    for (const wy of [this.wallTop, this.wallBottom]) {
      ctx.beginPath(); ctx.moveTo(X(this.court.left - 0.015), Y(wy)); ctx.lineTo(X(this.court.right + 0.015), Y(wy)); ctx.stroke();
    }
    ctx.restore();

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

    // paddles: patient amber, teammate teal, opponent lavender — and the
    // app-wide open/closed language: a squeezing hand turns its paddle sage
    // (glowing while the ball is held)
    const pads = this.pads || {};
    const drawPad = (x, y, kind, gripping) => {
      if (y == null) return;
      const cols = gripping ? ["#a8cf92", "#6f9b58"]
        : kind === "patient" ? ["#e8b98a", "#c77f4a"] : kind === "mate" ? ["#a8d8d0", "#5f9b93"] : ["#c8b3d9", "#8f76b0"];
      const held = gripping && this.caught;
      if (held) { ctx.save(); ctx.shadowColor = "rgba(159,192,138,0.9)"; ctx.shadowBlur = 18; }
      roundedRect(ctx, x - 8, Y(y), 16, Y(this.paddleH), 10, cols[0], cols[1]);
      if (held) ctx.restore();
    };
    const rKind = this.patientRight ? "patient" : (this.mode === "bimanual" ? "patient" : "opp");
    const lKind = !this.patientRight ? "patient" : (this.mode === "bimanual" ? "patient" : "opp");
    const otherArm = this.side === "right" ? "left" : "right";
    const gripMain = this.t.handClosed(this.side);
    const gripOther = this.mode === "bimanual" && this.t.handClosed(otherArm);
    drawPad(X(this.court.left), pads.leftY, lKind, this.patientRight ? gripOther : gripMain);
    drawPad(X(this.court.right), pads.rightY, rKind, this.patientRight ? gripMain : gripOther);
    drawPad(X(this.court.left) - 26, pads.leftY2, "mate");
    drawPad(X(this.court.right) + 26, pads.rightY2, "mate");

    // No rope rig, pulley or helper characters: they added a dozen moving
    // lines beside the two the patient must actually watch (their paddle and
    // the ball). The paddle IS the arm; nothing else needs drawing to say so.
    const myPadX = X(this.patientRight ? this.court.right : this.court.left);

    // grip-shot charge gauge under the patient's own paddle: fills with
    // returns, glows sage when a catch is ready, spends on the catch
    if (this.skills.grip) {
      const bw = 56, bh = 8, bx = myPadX - bw / 2, by = Y(this.wallBottom) + 22;
      const full = this.gripEnergy >= 1;
      const pulse = Math.sin(now / 260) * 0.5 + 0.5;
      ctx.save();
      ctx.fillStyle = "rgba(244,236,221,0.15)";
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
      if (this.gripEnergy > 0) {
        ctx.fillStyle = full ? "#9fc08a" : "#e8b98a";
        if (full) { ctx.shadowColor = "rgba(159,192,138,0.9)"; ctx.shadowBlur = 10 + pulse * 8; }
        ctx.beginPath(); ctx.roundRect(bx, by, bw * Math.min(1, this.gripEnergy), bh, 4); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = "rgba(244,236,221,0.4)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.stroke();
      if (full) {
        ctx.fillStyle = `rgba(255,242,194,${0.6 + pulse * 0.4})`;
        ctx.font = `800 ${Math.round(c.height * 0.02)}px Nunito, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("squeeze to catch ✊", myRig.cx, by + 28);
      }
      ctx.restore();
    }

    // sleepy z's over the AI paddle as a long rally wears the star down —
    // the coming miss reads as earned, not random
    // the star tiring is flavour, and it must never be showing while it
    // misreads a shot — a sleepy cue over a lunge tells the patient the point
    // was given rather than won
    const yawn = (this._tired || 0) / AI_FADE_MAX;
    if (this.hasAI && this.ball && !this._slip && yawn > 0.55) {
      const aiEdge = this.patientRight ? this.court.left : this.court.right;
      const ax = X(aiEdge) + (this.patientRight ? -34 : 34);
      const ay = Y(this.aiY) - 30;
      ctx.save();
      ctx.fillStyle = `rgba(200,179,217,${0.35 + 0.45 * yawn})`;
      ctx.font = `800 ${Math.round(c.height * 0.032)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      for (let i = 0; i < (yawn > 0.85 ? 3 : 2); i++) {
        const ph = (now / 900 + i * 0.33) % 1;
        ctx.globalAlpha = (1 - ph) * (0.35 + 0.55 * yawn);
        ctx.fillText("z", ax + Math.sin(ph * 6 + i) * 8, ay - ph * 46 - i * 6);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // round-1 tutorial overlays: pulsing target star for the paddle sweeps,
    // a guide line from the paddle, and the hover-to-skip pill
    if (this.tut) {
      if (this.tut.step === 0) {
        const fx = this.patientRight ? this.court.right : this.court.left;
        const ty = this._tutTargetY();
        const pulse = Math.sin(now / 300) * 0.5 + 0.5;
        const padY = this.patientRight ? this.pads?.rightY : this.pads?.leftY;
        if (padY != null) {
          ctx.setLineDash([5, 8]);
          ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(X(fx), Y(padY + this.paddleH / 2)); ctx.lineTo(X(fx), Y(ty)); ctx.stroke();
          ctx.setLineDash([]);
        }
        this.glow(ctx, X(fx), Y(ty), 14 + pulse * 6, "#fff6d8", "#e8a86a", 24);
        starShape(ctx, X(fx), Y(ty), 12 + pulse * 3, "#ffd98a");
        ctx.strokeStyle = `rgba(255,217,138,${0.4 + pulse * 0.4})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(X(fx), Y(ty), 26 + pulse * 6, 0, TAU); ctx.stroke();
      }
      const sx = c.width - 115, sy = 62;
      ctx.fillStyle = "rgba(20,16,40,0.85)";
      ctx.strokeStyle = "rgba(244,236,221,0.6)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(sx - 75, sy - 26, 150, 52, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f4ecdd";
      ctx.font = `800 ${Math.round(c.height * 0.03)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Skip ✋", sx, sy + 9);
      if (this.tut.skipDwell) {
        const f = Math.min(1, (now - this.tut.skipDwell) / 1200);
        ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy, 36, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }

    if (this.serving) {
      const t = (now - this.serving.start) / 550;
      const beat = Math.floor(t), f = t - beat;
      if (beat >= 0 && beat < 3) {
        const p = { x: X((this.court.left + this.court.right) / 2), y: Y((this.wallTop + this.wallBottom) / 2) };
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
    // guided flow: practice (untimed, step-by-step voice) → 3-2-1 → test.
    // The patient DOES one full transfer before the clock ever starts.
    // Practice runs on round 1 only; later rounds go straight to the 3-2-1.
    this.phase = this.opts.tellStory ? "practice" : "countdown";
    this.sign = this.side === "right" ? 1 : -1;   // source on trained-arm side
    // barrier top (rel y, SW above CENTER): the lift the carry must clear —
    // range demand scales with the DDA like everything else
    this.barrierY = 0.05 + 0.3 * this.params.rangeScale;
    // the bench the blocks, wall, and delivered stack all sit on (rel y)
    this.benchY = -0.5;
    this._newCrate();
    const wait = this.tellStory(STORIES.boxes);
    if (this.phase === "practice") {
      setTimeout(() => {
        if (!this.active || this.phase !== "practice") return;
        this._prompt("Let's practice one first", `Move your ${this.side} hand to the block and squeeze to pick it up`);
        this._speak(`Let's practice one first. Move your ${this.side} hand to the bright block, and squeeze to pick it up.`);
      }, wait ? 5400 : 400);
    } else {
      this.countStart = performance.now(); this._cd = null;
    }
    this.crate.born = performance.now() + wait;
  }
  extra() { return { boxes: this.boxes }; }
  // interactions happen at the FINGERS (palm center), not the wrist — you
  // pick a block up with your hand, so the hand must be at the block
  _grabPoint() { return this.t.palmRel(this.side) || this.t.handRel(this.side); }
  _newCrate() {
    // like the real test, blocks sit ON the bench on the trained-arm side:
    // vary how far along the bench (reach demand), always inside the envelope
    const y = this.benchY + 0.1;                                // block center resting on the bench
    for (let i = 0; i < 12; i++) {
      const x = this.sign * (0.3 + Math.random() * 1.1);
      const th = Math.atan2(y - CENTER.y, x - CENTER.x);
      const env = this.envAt(th);
      const r = Math.hypot(x - CENTER.x, y - CENTER.y);
      const px = this.toPx({ x, y });
      const onScreen = px.x > 80 && px.x < this.canvas.width - 80 && px.y > 80 && px.y < this.canvas.height - 60;
      if (onScreen && r < 0.95 * this.params.rangeScale * env) {
        this.crate = { x, y, state: "waiting", born: performance.now(), reachFrac: r / env, isFar: r > 0.7 * this.params.rangeScale * env };
        return;
      }
    }
    this.crate = { x: this.sign * 0.35, y, state: "waiting", born: performance.now(), reachFrac: 0.5, isFar: false };
  }
  update(now) {
    const cr = this.crate;
    if (this.phase !== "test") this.startT = now;   // the clock waits for the real test

    if (this.phase === "countdown") {
      const left = 3 - Math.floor((now - this.countStart) / 1000);
      if (left !== this._cd && left > 0) { this._cd = left; audio.serveTick(false); }
      if (left <= 0) {
        this.phase = "test";
        this.startT = now;
        this.boxes = 0;
        this._newCrate();
        this._prompt("Go!", "As many blocks as you can");
        this._speak("Go!");
        setTimeout(() => { if (this.active) this._prompt(""); }, 1800);
      }
      return;
    }

    // clock tick: soft every second, brighter for the last five
    if (this.phase === "test") {
      const sec = Math.max(0, Math.ceil(this.roundSeconds - this.elapsed(now)));
      if (sec !== this._lastSec) { this._lastSec = sec; if (sec > 0) (sec <= 5 ? audio.serveTick(false) : audio.bounce()); }
      if (now - cr.born > 20000) { this.miss(cr); this._newCrate(); return; }
    }

    const closed = this.t.handClosed(this.side);
    const pm = this._grabPoint();
    if (cr.state === "waiting") {
      // a real grasp EVENT: arrive with an open hand, then close it on the
      // crate — a hand that was already closed on approach doesn't pick up
      const near = pm && Math.hypot(pm.x - cr.x, pm.y - cr.y) < this.params.radius;
      if (near && !closed) cr.armed = true;
      if (near && closed && cr.armed) {
        cr.state = "carried"; cr.armed = false;
        audio.note(1);
        if (this.phase === "practice" && !this._saidLift) {
          this._saidLift = true;
          this._prompt("Lovely!", "Now lift it up and over the wall");
          this._speak("Lovely. Now lift it up, and carry it over the wall.");
        }
      }
      if (!near) cr.armed = false;
    } else {
      if (pm) {
        // the partition is solid: crossing its plane below the barrier top is
        // blocked — the crate bumps and presses against the wall until the
        // patient lifts it over (both directions, like the physical wall)
        const overTop = pm.y > this.barrierY;
        const crossingPlane = Math.sign(pm.x || 1) !== Math.sign(cr.x || this.sign);
        if (!overTop && crossingPlane) {
          cr.x = Math.sign(cr.x || this.sign) * 0.05;
          cr.y = Math.min(pm.y, this.barrierY - 0.08);
          if (!cr.bumped) { cr.bumped = true; audio.serveTick(false); }
        } else {
          cr.x = pm.x; cr.y = pm.y;
          cr.bumped = false;
        }
      }
      const crossed = Math.sign(cr.x) === -this.sign && Math.abs(cr.x) > 0.2;
      if (this.phase === "practice" && crossed && !this._saidOpen) {
        this._saidOpen = true;
        this._prompt("Almost there", "Open your hand to set it down");
        this._speak("Now open your hand to set it down.");
      }
      if (!closed) {                     // open hand = release
        if (crossed) {
          if (this.phase === "practice") {
            // practice transfer complete → count down into the real test
            this.phase = "countdown"; this.countStart = now; this._cd = null;
            audio.fanfare();
            this.burst(cr, "#ffd98a");
            this._prompt("Perfect, that's the idea!", "The real one starts in 3… 2… 1…");
            this._speak("Perfect, you have the idea. Here we go.");
          } else {
            this.boxes++;
            this.hit(cr, this.boxes);
            this.burst(cr, "#ffd98a");
            this._newCrate();
          }
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
    // the bench: the platform blocks, wall, and stack all rest on (like the
    // physical test's table) — translucent so the real world shows through
    const bp = this.toPx({ x: 0, y: this.benchY });
    const bh = Math.max(20, c.height * 0.03);
    ctx.fillStyle = "rgba(122,92,62,0.5)";
    ctx.beginPath(); ctx.roundRect(c.width * 0.05, bp.y, c.width * 0.9, bh, 10); ctx.fill();
    ctx.fillStyle = "rgba(244,236,221,0.3)";
    ctx.beginPath(); ctx.roundRect(c.width * 0.05, bp.y, c.width * 0.9, 5, 3); ctx.fill();
    // the barrier partition of the BBT: a solid wall standing on the bench,
    // up to the barrier top — carries must clear it
    const wt = this.toPx({ x: 0, y: this.barrierY });
    const w = 18;
    const wg = ctx.createLinearGradient(wt.x - w, 0, wt.x + w, 0);
    wg.addColorStop(0, "rgba(27,27,58,0.35)"); wg.addColorStop(0.5, "rgba(27,27,58,0.7)"); wg.addColorStop(1, "rgba(27,27,58,0.35)");
    ctx.fillStyle = wg;
    ctx.fillRect(wt.x - w / 2, wt.y, w, bp.y - wt.y);
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.beginPath(); ctx.roundRect(wt.x - w / 2 - 3, wt.y - 6, w + 6, 8, 4); ctx.fill();
    // one ACTIVE box at a time, but delivered blocks stay visible on the far
    // bench — the growing pile shows exactly how many made it across
    const deckX = wt.x - this.sign * c.width * 0.18;
    for (let i = 0; i < this.boxes; i++) {
      const col = Math.floor(i / 5), row = i % 5;
      crateShape(ctx, deckX - this.sign * col * 44, bp.y - 20 - row * 34, 36, false);
    }
    // count beside the pile (numbers allowed: the count IS the test)
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.font = `800 ${Math.round(c.height * 0.09)}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(this.boxes, deckX, c.height * 0.24);
    // BIG timer, top middle — the minute is part of the test, keep it in view
    if (this.phase === "test") {
      const left = Math.max(0, Math.ceil(this.roundSeconds - this.elapsed(performance.now())));
      const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");
      ctx.fillStyle = left <= 5 ? "#e8a86a" : "rgba(244,236,221,0.92)";
      ctx.font = `800 ${Math.round(c.height * 0.12)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${mm}:${ss}`, c.width / 2, c.height * 0.14);
    }
  }
  draw(ctx, c, now) {
    if (this.phase === "countdown") {
      const left = Math.max(1, 3 - Math.floor((now - this.countStart) / 1000));
      ctx.save();
      ctx.fillStyle = "rgba(244,236,221,0.95)";
      ctx.shadowColor = "rgba(232,168,106,0.8)"; ctx.shadowBlur = 30;
      ctx.font = `800 ${Math.round(c.height * 0.18)}px Nunito, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(left, c.width / 2, c.height * 0.42);
      ctx.restore();
      return;
    }
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

/* ==================== G10 Scratch Cards (levelled reveal) ==================== */
// Area-coverage training as a scratch card: the open hand scrapes foil off a
// hidden picture. Sweeping beats point-visiting for coverage work (the wiping
// exercise recurs in Jintronix / Armeo / VirtualRehab catalogs), and a card
// that has to be cleared makes the sweep self-directing — the patient can see
// exactly what they have missed.
//
// The LEVEL is the difficulty ladder here, not the DDA: each level widens the
// card across more of the patient's own measured envelope AND shrinks the
// scratcher, so the demand moves from "big sweeps close in" to "accurate
// sweeps at full stretch". It is stored per patient and resumes.
//
// What a scratch card is genuinely good at is anticipation and reveal, and
// that is all this borrows. The rest of the commercial scratch-card playbook
// - variable-ratio rewards, near-miss teasing, prize framing - is designed to
// keep somebody playing past the point they meant to stop. In a clinical tool
// for older stroke patients that is not a mechanic, it is a harm; the reward
// here is the picture, it is certain, and it arrives when the work is done.
const SCRATCH_LEVELS = [
  // reach  = fraction of the assessed envelope the card spans
  // eraser = scratch radius, SW (the "eraser gets smaller with levels")
  // need   = fraction of the card that must be cleared to finish it
  // cell   = foil flake size, SW (finer foil for a finer scratcher)
  { reach: 0.55, eraser: 0.30, need: 0.80, cell: 0.150 },
  { reach: 0.70, eraser: 0.25, need: 0.82, cell: 0.130 },
  { reach: 0.85, eraser: 0.21, need: 0.85, cell: 0.115 },
  { reach: 1.00, eraser: 0.17, need: 0.87, cell: 0.100 },
  { reach: 1.00, eraser: 0.14, need: 0.90, cell: 0.090 },
  { reach: 1.00, eraser: 0.11, need: 0.92, cell: 0.080 },
];
const SCRATCH_MAX = SCRATCH_LEVELS.length;

// One picture per level, so levelling up is also "a new card". Each is drawn
// in canvas units 0..1 across the card's own box, then scaled - so the
// picture fits whatever shape that patient's reach turns out to be.
const SCRATCH_CARDS = [
  { name: "the lighthouse", draw: scratchLighthouse },
  { name: "a little boat",  draw: scratchBoat },
  { name: "the night sky",  draw: scratchStars },
  { name: "a fish",         draw: scratchFish },
  { name: "the sunrise",    draw: scratchSunrise },
  { name: "the harbour",    draw: scratchHarbour },
];

export class LighthouseLens extends GameBase {
  id = "lens";
  setup() {
    this.tips = {
      objective: "Scrape the silver away and see what is underneath.",
      miss: "Long slow sweeps, like polishing a window.",
    };
    this.level = Math.max(1, Math.min(SCRATCH_MAX, this.opts.level || 1));
    this.cardsDone = 0;
    this.clearedTotal = 0;
    this.revealAt = 0;              // set when a card completes: the reveal beat
    this.halfSaid = false;
    this._chunk = 0;
    this._newCard();
    this.tellStory(STORIES.lens);
  }

  _lv() { return SCRATCH_LEVELS[this.level - 1]; }

  // The card is the patient's OWN workspace: every flake sits inside the
  // measured envelope (scaled by the level) and on screen, so there is never
  // foil in a place they cannot get to - which is what would otherwise make a
  // "clear the card" goal quietly impossible.
  _newCard() {
    const lv = this._lv();
    this.card = SCRATCH_CARDS[(this.level - 1 + this.cardsDone) % SCRATCH_CARDS.length];
    this.flakes = [];
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const span = Math.ceil(1.2 / lv.cell);
    for (let gx = -span; gx <= span; gx++) for (let gy = -span; gy <= span; gy++) {
      const x = gx * lv.cell, y = gy * lv.cell;
      const th = Math.atan2(y, x), r = Math.hypot(x, y);
      if (r > lv.reach * this.envAt(th)) continue;
      const pos = { x: CENTER.x + x, y: CENTER.y + y };
      const px = this.toPx(pos);
      if (px.x < 40 || px.x > this.canvas.width - 40 || px.y < 40 || px.y > this.canvas.height - 40) continue;
      this.flakes.push({ ...pos, a: 1, jit: Math.random() });
      box.x0 = Math.min(box.x0, pos.x); box.x1 = Math.max(box.x1, pos.x);
      box.y0 = Math.min(box.y0, pos.y); box.y1 = Math.max(box.y1, pos.y);
    }
    this.box = this.flakes.length ? box : null;
    this.cardCells = this.flakes.length || 1;
    this.cleared = 0;
    this.halfSaid = false;
  }

  get clearFrac() { return this.cleared / this.cardCells; }

  update(now, dt) {
    // the reveal beat: the card is finished and the picture is on show. No
    // scratching during it - the point is to look at what they uncovered.
    if (this.revealAt) {
      if (now - this.revealAt > 3400) {
        this.revealAt = 0;
        this.cardsDone++;
        if (this.level < SCRATCH_MAX) {
          this.level++;
          this.say(`Level ${this.level}. A new card, and a finer scratcher.`);
        } else {
          this.say("A new card.");
        }
        this._newCard();
      }
      return;
    }
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    if (!h) return;
    const lv = this._lv();
    for (const f of this.flakes) {
      if (f.a <= 0) continue;
      if (Math.hypot(h.x - f.x, h.y - f.y) > lv.eraser) continue;
      f.a -= dt / 380;                    // a moment of contact takes a flake off
      if (f.a > 0) continue;
      f.a = 0;
      this.cleared++;
      this.clearedTotal++;
      // one chime, star and spark per handful of flakes — a burst per flake
      // would be hundreds of particles a second and a chime nobody can hear
      if (++this._chunk >= 6) {
        this._chunk = 0;
        const th = Math.atan2(f.y - CENTER.y, f.x - CENTER.x);
        this.hit({ reachFrac: Math.hypot(f.x - CENTER.x, f.y - CENTER.y) / (this.envAt(th) || 1) });
        this.burst({ x: f.x, y: f.y }, "#e8dcc0");
      }
    }
    // anticipation, honestly earned: they are told something is appearing
    // only once enough of it actually is
    if (!this.halfSaid && this.clearFrac > 0.45) {
      this.halfSaid = true;
      this.say("Something is coming through. Keep going.");
    }
    if (this.clearFrac >= lv.need) {
      this.revealAt = now;
      audio.fanfare();
      this.say(`It's ${this.card.name}!`);
    }
  }

  drawBg(ctx, c, now) {
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.45, 60, c.width / 2, c.height * 0.45, c.height * 0.9);
    g.addColorStop(0, "#332f5c"); g.addColorStop(1, "#15152f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    if (!this.box) return;
    // the picture, drawn into the card's own box so it fits this patient's
    // reach rather than a fixed rectangle
    const a = this.toPx({ x: this.box.x0, y: this.box.y1 });
    const b = this.toPx({ x: this.box.x1, y: this.box.y0 });
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale((b.x - a.x) || 1, (b.y - a.y) || 1);
    this.card.draw(ctx, now, this.revealAt ? 1 : 0);
    ctx.restore();
  }

  draw(ctx, c, now) {
    const lv = this._lv();
    const s = lv.cell * this.sw();
    // the foil: brushed silver with a slow sheen, so a scratched patch reads
    // as removed material rather than as a hole in a flat colour
    for (const f of this.flakes) {
      if (f.a <= 0) continue;
      const p = this.toPx(f);
      const sheen = 0.5 + 0.5 * Math.sin(now / 1400 + (p.x + p.y) / 220);
      ctx.globalAlpha = f.a;
      ctx.fillStyle = `rgb(${(150 + sheen * 46) | 0},${(155 + sheen * 46) | 0},${(168 + sheen * 42) | 0})`;
      ctx.beginPath();
      ctx.roundRect(p.x - s * 0.62, p.y - s * 0.62, s * 1.24, s * 1.24, s * 0.34);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // progress, diegetic: the card's own edge fills in as it clears. No
    // numbers - the amount of silver left IS the score.
    if (this.box && !this.revealAt) {
      const a = this.toPx({ x: this.box.x0, y: this.box.y1 });
      const b = this.toPx({ x: this.box.x1, y: this.box.y0 });
      const f = Math.min(1, this.clearFrac / lv.need);
      ctx.save();
      ctx.strokeStyle = `rgba(232,168,106,${0.25 + f * 0.6})`;
      ctx.lineWidth = 4 + f * 4;
      ctx.setLineDash([(b.x - a.x + b.y - a.y) * f, 99999]);
      ctx.beginPath();
      ctx.roundRect(a.x - 10, a.y - 10, b.x - a.x + 20, b.y - a.y + 20, 22);
      ctx.stroke();
      ctx.restore();
    }
    this.drawTimerWhisper(ctx, c, now);
  }

  extra() {
    return {
      coverage: Math.min(1, this.clearFrac),
      scratchLevel: this.level,
      cardsFinished: this.cardsDone,
      eraserSW: this._lv().eraser,
    };
  }
}

/* --- the hidden pictures. Drawn in a 0..1 box; `lit` rises on the reveal --- */
function scratchLighthouse(ctx, now, lit) {
  ctx.fillStyle = "#1d2a44"; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#243a5c"; ctx.fillRect(0, 0.72, 1, 0.28);            // sea
  ctx.fillStyle = "#f4ecdd";
  ctx.beginPath(); ctx.moveTo(0.44, 0.72); ctx.lineTo(0.47, 0.26);
  ctx.lineTo(0.57, 0.26); ctx.lineTo(0.60, 0.72); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#b5503a";
  ctx.fillRect(0.455, 0.44, 0.095, 0.07);
  ctx.fillStyle = "#e8a86a";
  ctx.beginPath(); ctx.arc(0.52, 0.22, 0.055, 0, TAU); ctx.fill();
  const beam = ctx.createRadialGradient(0.52, 0.22, 0.01, 0.52, 0.22, 0.5);
  beam.addColorStop(0, `rgba(255,246,216,${0.5 + lit * 0.45})`);
  beam.addColorStop(1, "rgba(255,246,216,0)");
  ctx.fillStyle = beam; ctx.fillRect(0, 0, 1, 1);
}
function scratchBoat(ctx, now, lit) {
  ctx.fillStyle = "#1b2340"; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#f4ecdd";
  ctx.beginPath(); ctx.arc(0.76, 0.2, 0.075, 0, TAU); ctx.fill();       // moon
  ctx.fillStyle = "#2c4468"; ctx.fillRect(0, 0.66, 1, 0.34);            // sea
  ctx.fillStyle = "#e8a86a";
  ctx.beginPath(); ctx.moveTo(0.3, 0.66); ctx.lineTo(0.7, 0.66);
  ctx.lineTo(0.62, 0.78); ctx.lineTo(0.38, 0.78); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f4ecdd";
  ctx.beginPath(); ctx.moveTo(0.5, 0.62); ctx.lineTo(0.5, 0.28);
  ctx.lineTo(0.68, 0.62); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(159,192,138,${0.4 + lit * 0.5})`; ctx.lineWidth = 0.012;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(0.12, 0.84 + i * 0.045);
    ctx.quadraticCurveTo(0.5, 0.8 + i * 0.045, 0.88, 0.84 + i * 0.045); ctx.stroke();
  }
}
function scratchStars(ctx, now, lit) {
  ctx.fillStyle = "#141a34"; ctx.fillRect(0, 0, 1, 1);
  const pts = [[0.2, 0.3], [0.34, 0.18], [0.5, 0.32], [0.63, 0.2], [0.78, 0.36], [0.66, 0.55], [0.44, 0.6], [0.26, 0.5]];
  ctx.strokeStyle = `rgba(159,192,138,${0.35 + lit * 0.5})`; ctx.lineWidth = 0.008;
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.stroke();
  for (const [x, y] of pts) {
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath(); ctx.arc(x, y, 0.022, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = "rgba(244,236,221,0.5)";
  for (let i = 0; i < 26; i++) {
    const x = ((i * 97) % 100) / 100, y = ((i * 61) % 100) / 100;
    ctx.beginPath(); ctx.arc(x, y * 0.95, 0.005, 0, TAU); ctx.fill();
  }
}
function scratchFish(ctx, now, lit) {
  ctx.fillStyle = "#123044"; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#e8a86a";
  ctx.beginPath(); ctx.ellipse(0.48, 0.5, 0.2, 0.115, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.68, 0.5); ctx.lineTo(0.84, 0.38);
  ctx.lineTo(0.84, 0.62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#9fc08a";
  ctx.beginPath(); ctx.moveTo(0.44, 0.39); ctx.lineTo(0.56, 0.26); ctx.lineTo(0.58, 0.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#1b1b3a";
  ctx.beginPath(); ctx.arc(0.35, 0.47, 0.022, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(207,230,240,${0.4 + lit * 0.4})`;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(0.24 - i * 0.035, 0.36 - i * 0.05, 0.016 + i * 0.004, 0, TAU); ctx.fill();
  }
}
function scratchSunrise(ctx, now, lit) {
  const sky = ctx.createLinearGradient(0, 0, 0, 1);
  sky.addColorStop(0, "#2b2c56"); sky.addColorStop(0.55, "#8a5b6a"); sky.addColorStop(1, "#e8a86a");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = `rgba(255,246,216,${0.75 + lit * 0.25})`;
  ctx.beginPath(); ctx.arc(0.5, 0.62, 0.14, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2b3a52";
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 0.78);
  ctx.lineTo(0.22, 0.62); ctx.lineTo(0.44, 0.8); ctx.lineTo(0.66, 0.58);
  ctx.lineTo(0.86, 0.76); ctx.lineTo(1, 0.68); ctx.lineTo(1, 1); ctx.closePath(); ctx.fill();
}
function scratchHarbour(ctx, now, lit) {
  ctx.fillStyle = "#181f3c"; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#222c50";
  const hs = [0.34, 0.5, 0.28, 0.46, 0.38, 0.56, 0.3];
  hs.forEach((h, i) => ctx.fillRect(0.06 + i * 0.13, 0.74 - h, 0.1, h));
  ctx.fillStyle = `rgba(232,168,106,${0.6 + lit * 0.4})`;
  hs.forEach((h, i) => {
    for (let r = 0; r < 3; r++) {
      if ((i + r) % 2) continue;
      ctx.fillRect(0.085 + i * 0.13, 0.74 - h + 0.05 + r * 0.09, 0.022, 0.032);
    }
  });
  ctx.fillStyle = "#2c4468"; ctx.fillRect(0, 0.74, 1, 0.26);
  ctx.fillStyle = `rgba(232,168,106,${0.25 + lit * 0.3})`;
  hs.forEach((h, i) => ctx.fillRect(0.085 + i * 0.13, 0.74, 0.022, 0.2));
}

/* ==================== G28 Cloud Slingshot (Angry Birds) ==================== */
// The Angry Birds mechanic, rebuilt for the arm. Reach to the pouch, close
// the hand, PULL BACK against the sling, hold the stretch, then open to fire.
//
// It earns its place clinically because the pull is the exercise: a graded,
// held, eccentric reach with a release at the end of it - which is exactly
// the grasp event Harbor Crates trains, but with a reason to hold at full
// stretch rather than snatch. The aim trains directional control, and the
// arc gives a reason to look up.
//
// The one change that matters: POWER IS NORMALISED TO THE PATIENT'S OWN
// REACH. Full power is a full pull to the edge of their measured envelope in
// the pull direction, not a fixed pixel distance - so a patient with a small
// envelope can still hit the far stack at full stretch, and a patient with a
// large one is not rewarded for a lazy tug. The original scales power by a
// fixed SHOOT_FACTOR against screen pixels, which would make this game
// literally unwinnable for the people it is meant for.
//
// The physics is written here rather than imported: the reference carries
// Phaser and p2 (about 3 MB) to do this, and a projectile plus toppling boxes
// is a couple of hundred lines. Nothing in this game needs a solver.
const SL_GROUND = 0.84;          // canvas-normalised y of the ground line
const SL_G = 1.15;               // gravity, canvas units per second squared
// Tuned by simulation, not by feel: at 1.8 the tower becomes reachable from a
// pull of about 40% of the patient's own reach, so there is a wide band of
// success above that. A shot below 40% still FLIES and visibly lands short,
// which is feedback; only below SL_MIN_PULL does nothing leave the sling.
const SL_POWER = 1.8;            // launch speed per unit of normalised pull
const SL_MIN_PULL = 0.22;        // below this fraction of full stretch, nothing fires
const SL_HOLD_MS = 800;          // held still at stretch = release (the no-grasp path)
const SL_SHOT_MAX = 6000;        // ms before a lost shot is given up on

export class CloudSlingshot extends GameBase {
  id = "sling";
  setup() {
    this.tips = {
      objective: "Reach the pouch, pull back, then open your hand to fire.",
      miss: "Pull further back for more power, and aim a little higher.",
    };
    this.shots = 0; this.popped = 0; this.emptyShots = 0; this.rounds = 0;
    this.pulls = [];                 // normalised pull strength per shot, for the log
    this.held = false; this.holdSince = null; this.stillSince = null;
    this.shot = null;
    this._layout();
    this.tellStory(STORIES.sling);
  }

  // The sling sits on the patient's own side and the stack on the far side,
  // so every shot is a reach out and across - the direction that matters.
  _layout() {
    this.facing = this.side === "right" ? -1 : 1;      // fire towards midline & beyond
    this.slingPx = { x: this.side === "right" ? 0.82 : 0.18, y: SL_GROUND - 0.13 };
    this.blocks = []; this.clouds = [];
    const bx = this.side === "right" ? 0.22 : 0.78;
    const w = 0.05, h = 0.075;
    // a small tower: two uprights, a lintel, and a cloud perched on top. Kept
    // deliberately simple - the target is a reason to reach, not a puzzle.
    const cols = 2 + Math.min(2, this.rounds);
    for (let c = 0; c < cols; c++) {
      const x = bx + (c - (cols - 1) / 2) * (w * 2.4) * this.facing * -1;
      const levels = 2 + (c % 2);
      for (let l = 0; l < levels; l++) {
        this.blocks.push({ x, y: SL_GROUND - h * (l + 1), w, h, vx: 0, vy: 0, rest: true });
      }
      this.clouds.push({ x: x + w / 2, y: SL_GROUND - h * levels - 0.035, r: 0.032, alive: true });
    }
    this.maxPullSW = null;
  }

  // Full stretch = the edge of the measured envelope in the pull direction.
  _maxPull() {
    const th = this.facing > 0 ? Math.PI : 0;          // pull is away from the target
    return Math.max(0.35, this.envAt(th) * this.params.rangeScale);
  }

  update(now, dt) {
    const s = Math.min(0.05, dt / 1000);
    if (this.shot) { this._flyShot(now, s); return; }

    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    if (!h) return;
    const anchor = { x: CENTER.x, y: CENTER.y };
    const grabR = (this.params.radius + 0.12) * A11Y.radiusScale;

    if (!this.held) {
      // pick the pouch up: a squeeze takes it at once, a steady hold also
      // does, so nobody is gated on grasp detection
      const near = Math.hypot(h.x - anchor.x, h.y - anchor.y) < grabR;
      const f = this.dwellProgress("pouch", near, now);
      if (near && (this.t.handClosed(this.side) || f >= 1)) {
        this.held = true; this.holdSince = now; this.stillSince = null;
        this._dwells = {};
        audio.note(3);
        this.say("Now pull back, and hold it.");
      }
      this.pull = null;
      return;
    }

    // held: the pouch follows the hand, clamped to full stretch
    const maxP = this._maxPull();
    let dx = h.x - anchor.x, dy = h.y - anchor.y;
    const d = Math.hypot(dx, dy);
    if (d > maxP && d > 0) { dx = dx / d * maxP; dy = dy / d * maxP; }
    this.pull = { x: dx, y: dy, f: Math.min(1, d / maxP) };

    // release: opening the hand fires it. For a patient with no grasp,
    // holding the stretch still for SL_HOLD_MS fires it instead - and that
    // hold is a useful thing to ask for in its own right.
    const opened = !this.t.handClosed(this.side) && now - this.holdSince > 350;
    const moving = this._lastPull != null && Math.abs(this.pull.f - this._lastPull) > 0.03;
    if (moving || this.pull.f < SL_MIN_PULL) this.stillSince = null;
    else this.stillSince ??= now;
    this._lastPull = this.pull.f;
    const heldStill = this.stillSince && now - this.stillSince > SL_HOLD_MS;

    if ((opened || heldStill) && this.pull.f >= SL_MIN_PULL) this._fire(now);
    else if (opened && this.pull.f < SL_MIN_PULL) {
      this.held = false; this.pull = null;
      this.say("Pull back a little further before you let go.");
    }
  }

  _fire(now) {
    const p = this.pull;
    this.held = false; this.stillSince = null; this._lastPull = null;
    this.pulls.push(Math.round(p.f * 100) / 100);
    this.shots++;
    // the launch is the OPPOSITE of the pull, at a speed set by how far they
    // stretched as a fraction of their own reach
    const mag = Math.hypot(p.x, p.y) || 1e-6;
    const sp = SL_POWER * p.f;
    this.shot = {
      x: this.slingPx.x, y: this.slingPx.y,
      vx: -p.x / mag * sp, vy: p.y / mag * sp,   // SW y is up, canvas y is down
      born: now, hits: 0, trail: [],
    };
    this.pull = null;
    audio.note(6);
  }

  _flyShot(now, s) {
    const b = this.shot;
    b.vy += SL_G * s;
    b.x += b.vx * s; b.y += b.vy * s;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 40) b.trail.shift();

    for (const bl of this.blocks) {
      if (b.x > bl.x && b.x < bl.x + bl.w && b.y > bl.y && b.y < bl.y + bl.h) {
        bl.vx += b.vx * 0.55; bl.vy += b.vy * 0.35 - 0.25; bl.rest = false;
        b.vx *= 0.35; b.vy *= 0.35; b.hits++;
        audio.bounce();
      }
    }
    for (const c of this.clouds) {
      if (c.alive && Math.hypot(b.x - c.x, b.y - c.y) < c.r + 0.012) this._pop(c);
    }
    this._settle(s);

    const gone = b.y > SL_GROUND + 0.05 || b.x < -0.1 || b.x > 1.1 || now - b.born > SL_SHOT_MAX;
    if (!gone) return;
    // the shot is over: a shot that popped nothing is the miss, not the round
    if (this._shotPopped) { this._shotPopped = 0; }
    else { this.emptyShots++; this.miss({ isFar: false }); }
    this.shot = null;
    if (this.clouds.every(c => !c.alive)) {
      this.rounds++;
      audio.fanfare();
      this.say("The sky is clear! Here comes another.");
      this._layout();
    }
  }

  _pop(c) {
    c.alive = false;
    this.popped++;
    this._shotPopped = (this._shotPopped || 0) + 1;
    this.stats.stars += 3;
    this.burstAtPx(c.x * this.canvas.width, c.y * this.canvas.height, "#c8b3d9");
    audio.hit();
    // scored against the pull that earned it, so a full-stretch shot that
    // lands reads as a bigger reach in the round record
    this.hit({ reachFrac: this.pulls.length ? this.pulls[this.pulls.length - 1] : 0.7, isFar: false });
  }

  // Toppling, not a solver: blocks fall, rest on the ground or on whatever is
  // under them, and pass a share of their motion to what they land on.
  _settle(s) {
    for (const bl of this.blocks) {
      if (bl.rest) continue;
      bl.vy += SL_G * s;
      bl.x += bl.vx * s; bl.y += bl.vy * s;
      bl.vx *= 0.99;
      if (bl.y + bl.h >= SL_GROUND) {
        bl.y = SL_GROUND - bl.h;
        if (Math.abs(bl.vy) < 0.08) { bl.vy = 0; bl.vx *= 0.6; if (Math.abs(bl.vx) < 0.02) { bl.vx = 0; bl.rest = true; } }
        else bl.vy *= -0.25;
      }
      for (const o of this.blocks) {
        if (o === bl) continue;
        if (bl.x < o.x + o.w && bl.x + bl.w > o.x && bl.y < o.y + o.h && bl.y + bl.h > o.y) {
          o.vx += bl.vx * 0.4; o.vy += bl.vy * 0.25; o.rest = false;
          bl.vx *= 0.6; bl.vy *= 0.4;
          bl.y = o.y - bl.h;
        }
      }
      for (const c of this.clouds) {
        if (c.alive && Math.abs(bl.vx) + Math.abs(bl.vy) > 0.25 &&
            Math.hypot(bl.x + bl.w / 2 - c.x, bl.y + bl.h / 2 - c.y) < c.r + bl.w) this._pop(c);
      }
    }
  }

  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#2a2b55"); g.addColorStop(0.7, "#1e1c42"); g.addColorStop(1, "#161636");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    ctx.fillStyle = "rgba(90,110,90,0.35)";
    ctx.fillRect(0, SL_GROUND * c.height, c.width, c.height);
    ctx.strokeStyle = "rgba(159,192,138,0.5)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, SL_GROUND * c.height); ctx.lineTo(c.width, SL_GROUND * c.height); ctx.stroke();
  }

  draw(ctx, c, now) {
    const X = f => f * c.width, Y = f => f * c.height;
    // blocks
    for (const bl of this.blocks) {
      roundedRect(ctx, X(bl.x), Y(bl.y), X(bl.w), Y(bl.h), 6, "#c9a06a", "#8a6a44");
    }
    // clouds
    for (const cl of this.clouds) {
      if (!cl.alive) continue;
      const p = { x: X(cl.x), y: Y(cl.y) }, r = cl.r * c.height;
      ctx.save();
      ctx.fillStyle = "#6a5f86"; ctx.shadowColor = "rgba(120,100,160,.7)"; ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x - r * 0.5, p.y, r * 0.7, 0, TAU);
      ctx.arc(p.x + r * 0.5, p.y, r * 0.6, 0, TAU);
      ctx.arc(p.x, p.y - r * 0.4, r * 0.8, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#1b1b3a";
      ctx.beginPath(); ctx.arc(p.x - r * 0.25, p.y - r * 0.15, r * 0.13, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + r * 0.3, p.y - r * 0.15, r * 0.13, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the sling, and the band stretched to wherever the hand has pulled it
    const sp = { x: X(this.slingPx.x), y: Y(this.slingPx.y) };
    ctx.save();
    ctx.strokeStyle = "#8a6a44"; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(sp.x, Y(SL_GROUND)); ctx.lineTo(sp.x, sp.y); ctx.stroke();
    if (this.held && this.pull) {
      // the pouch is drawn where the HAND is, in body coords, so the stretch
      // the patient feels and the stretch they see are the same thing
      const pouch = this.toPx({ x: CENTER.x + this.pull.x, y: CENTER.y + this.pull.y });
      ctx.strokeStyle = `rgba(232,168,106,${0.5 + this.pull.f * 0.5})`;
      ctx.lineWidth = 5 + this.pull.f * 4;
      ctx.beginPath(); ctx.moveTo(sp.x - 14, sp.y); ctx.lineTo(pouch.x, pouch.y);
      ctx.lineTo(sp.x + 14, sp.y); ctx.stroke();
      this.glow(ctx, pouch.x, pouch.y, 14, "#fff6d8", "#e8a86a", 26);
      // a power bar that is a fraction of THEIR reach, not of the screen
      const bw = 120, bx = pouch.x - bw / 2, by = pouch.y - 46;
      ctx.fillStyle = "rgba(27,27,58,.55)"; ctx.beginPath(); ctx.roundRect(bx, by, bw, 10, 5); ctx.fill();
      ctx.fillStyle = this.pull.f >= SL_MIN_PULL ? "#9fc08a" : "#b5503a";
      ctx.beginPath(); ctx.roundRect(bx, by, bw * this.pull.f, 10, 5); ctx.fill();
      if (this.stillSince) {
        const f = Math.min(1, (now - this.stillSince) / SL_HOLD_MS);
        ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pouch.x, pouch.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    } else if (!this.shot) {
      // the pouch waiting to be picked up, at the work centre
      const a = this.toPx(CENTER);
      const pulse = Math.sin(now / 420) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(232,168,106,${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 4; ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.arc(a.x, a.y, (this.params.radius + 0.12) * this.sw(), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      this.glow(ctx, a.x, a.y, 12, "#fff6d8", "#e8a86a", 22);
    }
    ctx.restore();
    // the shot and its arc
    if (this.shot) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,246,216,0.35)"; ctx.lineWidth = 3; ctx.setLineDash([4, 8]);
      ctx.beginPath();
      this.shot.trail.forEach((t, i) => i ? ctx.lineTo(X(t.x), Y(t.y)) : ctx.moveTo(X(t.x), Y(t.y)));
      ctx.stroke(); ctx.setLineDash([]);
      this.glow(ctx, X(this.shot.x), Y(this.shot.y), 13, "#fff6d8", "#e8a86a", 28);
      ctx.restore();
    }
    this.drawTimerWhisper(ctx, c, now);
  }

  extra() {
    const mean = this.pulls.length ? this.pulls.reduce((a, b) => a + b, 0) / this.pulls.length : 0;
    return {
      shots: this.shots, cloudsPopped: this.popped, emptyShots: this.emptyShots,
      towersCleared: this.rounds,
      // how far into their OWN reach each pull went: the number this game
      // exists to move
      meanPullFrac: Math.round(mean * 100) / 100,
      bestPullFrac: this.pulls.length ? Math.max(...this.pulls) : 0,
    };
  }
}

/* ==================== G27 Catch Together (RGS) ==================== */
// A rebuild of the Rehabilitation Gaming System's core task - the one the
// RGS papers this suite is grounded in actually describe - as a STRIVE game.
// Balls travel towards the patient and are caught with BOTH hands cupped
// together, then carried to a basket.
//
// What is kept from RGS: the approach in depth (so the reach is timed, not
// just placed), the bilateral catch where the two hands must be adjacent (a
// single hand cannot catch - that coupling IS the therapy), the carry-and-
// place, and the colour-matched sorting that adds a cognitive load on top of
// the motor one. Its four-condition cycle becomes three graded stages, which
// is how the rest of this suite already grades (see Drift).
//
// What is deliberately dropped: RGS's observation condition, where the game
// plays itself and the patient watches. It is well-founded (action
// observation drives mirror activity) but it is a different intervention with
// a different consent conversation, not a difficulty stage - and a rehab game
// that takes the controls away mid-session reads as a freeze.
//
// What is added: every lane and basket sits inside this patient's measured
// envelope, so a bimanual catch is never asked for somewhere they cannot put
// both hands. The original spawned at six fixed world positions.
const RGS_LANES = 5;
const RGS_TRAVEL = 1.7;          // × params.lifetime = seconds from horizon to hands
const RGS_CATCH_Z = 0.2;         // how near the ball must be before it can be caught
const RGS_PASS_Z = -0.14;        // past this it has gone by
const RGS_HANDS_MAX = 0.62;      // SW: how close the two hands must be to cup a ball
// The original fans SEVEN colour-matched troughs across the bottom of the
// screen and lets the therapist dial the colour count down with a slider.
// Here the count is tied to the stage instead: seven small targets is a
// cognitive and a precision demand at once, and this population should meet
// them one at a time.
const RGS_HUES = ["#e8a86a", "#9fc08a", "#c8b3d9", "#8fb8d0", "#e0908a", "#d6c37a", "#8fc7b8"];
const RGS_STAGES = [
  // `wait` is the original's wait-vs-continuous mode: one ball at a time,
  // which is the difference between a task and a queue for a slow reacher
  { catchOnly: true,  match: false, baskets: 0, wait: true,  note: "catch it together" },
  { catchOnly: false, match: false, baskets: 3, wait: true,  note: "carry it to a trough" },
  { catchOnly: false, match: true,  baskets: 5, wait: false, note: "carry it to its own colour" },
];

export class CatchTogether extends GameBase {
  id = "rgs";
  setup() {
    this.tips = {
      objective: "Cup both hands around the ball to catch it.",
      miss: "Bring both hands together, then meet the ball.",
    };
    this.stage = Math.max(1, Math.min(RGS_STAGES.length, this.opts.stage || 1));
    this.balls = [];
    this.held = null;
    this.caught = 0; this.placed = 0; this.wrongBasket = 0; this.passed = 0;
    this.nextAt = 0;
    this._layout();
    this.tellStory(STORIES.rgs);
  }

  get _st() { return RGS_STAGES[this.stage - 1]; }

  // Lanes and baskets live inside the measured envelope, so both hands can
  // always be brought to every one of them.
  _layout() {
    const rs = this.params.rangeScale;
    const halfW = Math.min(this.envAt(0), this.envAt(Math.PI)) * rs * 0.8;
    this.catchY = CENTER.y - Math.min(this.envAt(-Math.PI / 2) * rs * 0.35, 0.35);
    this.lanes = [];
    for (let i = 0; i < RGS_LANES; i++) {
      const f = RGS_LANES === 1 ? 0.5 : i / (RGS_LANES - 1);
      this.lanes.push(CENTER.x + (f - 0.5) * 2 * halfW);
    }
    // the horizon the balls come from: up and away, on the body's midline
    this.vanish = { x: CENTER.x, y: CENTER.y + Math.min(this.envAt(Math.PI / 2) * rs, 1.0) };
    const nb = this._st.baskets;
    this.baskets = [];
    for (let i = 0; i < nb; i++) {
      const f = nb === 1 ? 0.5 : i / (nb - 1);
      this.baskets.push({
        x: CENTER.x + (f - 0.5) * 2 * halfW * 0.92,
        y: this.catchY - 0.34,
        col: RGS_HUES[i],
        // the troughs fan outwards from the body, as they do in the original
        lean: (f - 0.5) * 0.55,
      });
    }
  }

  _spawn(now) {
    const st = this._st;
    const lane = Math.floor(Math.random() * RGS_LANES);
    // in the sorting stage a ball only ever wears a colour some basket has,
    // or the task would be unwinnable rather than hard
    const pool = st.match ? st.baskets : RGS_HUES.length;
    this.balls.push({
      lane, z: 1, col: RGS_HUES[Math.floor(Math.random() * pool)],
      born: now, spin: Math.random() * TAU,
    });
  }

  // screen position of a ball at depth z (1 = horizon, 0 = at the hands)
  _posOf(b) {
    const tx = this.lanes[b.lane], ty = this.catchY;
    const z = Math.max(0, b.z);
    return { x: tx + (this.vanish.x - tx) * z, y: ty + (this.vanish.y - ty) * z };
  }
  _radOf(b) { return this.params.radius * (1 - 0.72 * Math.max(0, b.z)); }

  update(now, dt) {
    const s = dt / 1000;
    const speed = 1 / (RGS_TRAVEL * this.params.lifetime);
    const hL = this.t.palmRel("left"), hR = this.t.palmRel("right");
    const together = hL && hR && Math.hypot(hL.x - hR.x, hL.y - hR.y) < RGS_HANDS_MAX * A11Y.radiusScale;
    const mid = together ? { x: (hL.x + hR.x) / 2, y: (hL.y + hR.y) / 2 } : null;
    this.together = together; this.mid = mid;

    // a held ball rides the cupped hands; letting them apart is the release,
    // so a patient with no grasp can still play the whole game
    if (this.held) {
      if (mid) { this.held.x = mid.x; this.held.y = mid.y; }
      if (!together) this._release(now);
    } else if (now >= this.nextAt && this.balls.length < (this._st.wait ? 1 : 4)) {
      this.nextAt = now + (900 + Math.random() * 1200) * this.params.lifetime / 3;
      this._spawn(now);
    }

    const catchR = (this.params.radius + 0.1) * A11Y.radiusScale;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.z -= speed * s;
      const p = this._posOf(b);
      if (!this.held && b.z < RGS_CATCH_Z && together &&
          Math.hypot(hL.x - p.x, hL.y - p.y) < catchR &&
          Math.hypot(hR.x - p.x, hR.y - p.y) < catchR) {
        this.balls.splice(i, 1);
        this.caught++;
        audio.note(5);
        this.burst(p, b.col);
        this.hit({ reachFrac: Math.abs(p.x - CENTER.x) / (this.envAt(0) || 1), isFar: false });
        if (this._st.catchOnly) { this.say("Caught!"); continue; }
        this.held = { ...b, x: p.x, y: p.y };
        continue;
      }
      if (b.z < RGS_PASS_Z) {
        this.balls.splice(i, 1);
        this.passed++;
        this.miss({ isFar: false });
      }
    }
  }

  _release(now) {
    const b = this.held;
    this.held = null;
    let best = null, bestD = Infinity;
    for (const k of this.baskets) {
      const d = Math.hypot(b.x - k.x, b.y - k.y);
      if (d < bestD) { bestD = d; best = k; }
    }
    const inBasket = best && bestD < 0.42 * A11Y.radiusScale;
    if (!inBasket) { this.say("Bring it down to a basket."); return; }
    if (this._st.match && best.col !== b.col) {
      this.wrongBasket++;
      audio.miss();
      this.say("That one goes in its own colour.");
      return;
    }
    this.placed++;
    audio.hit();
    this.burst({ x: best.x, y: best.y }, b.col);
    this.stats.stars += 3;
    this.flash = { at: now, x: best.x, y: best.y };
  }

  drawBg(ctx, c, now) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#2b2c56"); g.addColorStop(0.55, "#232149"); g.addColorStop(1, "#15152f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    // the lanes drawn as receding rails: the depth cue is what makes an
    // approaching ball readable on a flat screen
    ctx.save();
    ctx.strokeStyle = "rgba(244,236,221,0.10)"; ctx.lineWidth = 2;
    const vp = this.toPx(this.vanish);
    for (const lx of this.lanes) {
      const p = this.toPx({ x: lx, y: this.catchY });
      ctx.beginPath(); ctx.moveTo(vp.x, vp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx, c, now) {
    const sw = this.sw();
    // the troughs: a coloured chute leaning outwards with an open mouth, so
    // the colour to match is unmistakable and the mouth reads as "put it here"
    for (const k of this.baskets) {
      const p = this.toPx(k);
      const mouth = 0.26 * sw, depth = 0.34 * sw;
      const lit = this.flash && now - this.flash.at < 500 && Math.abs(this.flash.x - k.x) < 1e-6;
      ctx.save();
      if (lit) { ctx.shadowColor = k.col; ctx.shadowBlur = 30; }
      // the chute body
      ctx.strokeStyle = k.col; ctx.lineWidth = lit ? 11 : 8; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - mouth, p.y);
      ctx.lineTo(p.x - mouth * 0.55 + k.lean * depth, p.y + depth);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x + mouth, p.y);
      ctx.lineTo(p.x + mouth * 0.55 + k.lean * depth, p.y + depth);
      ctx.stroke();
      // the mouth
      ctx.lineWidth = lit ? 8 : 5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, mouth, mouth * 0.34, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = k.col; ctx.globalAlpha = lit ? 0.45 : 0.16;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, mouth, mouth * 0.34, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // balls, far ones first so nearer ones overlap them
    const sorted = [...this.balls].sort((a, b) => b.z - a.z);
    for (const b of sorted) {
      const p = this.toPx(this._posOf(b));
      const r = Math.max(4, this._radOf(b) * sw);
      const near = b.z < RGS_CATCH_Z;
      ctx.save();
      const gr = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      gr.addColorStop(0, "#fff6d8"); gr.addColorStop(1, b.col);
      ctx.fillStyle = gr;
      if (near) { ctx.shadowColor = b.col; ctx.shadowBlur = 24; }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the held ball rides between the hands
    if (this.held) {
      const p = this.toPx(this.held);
      const r = this.params.radius * sw;
      ctx.save();
      ctx.shadowColor = this.held.col; ctx.shadowBlur = 30;
      const gr = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      gr.addColorStop(0, "#fff6d8"); gr.addColorStop(1, this.held.col);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the cup between the hands: the one piece of feedback the bilateral
    // rule needs, since "your hands are too far apart" is otherwise invisible
    const hL = this.t.palmRel("left"), hR = this.t.palmRel("right");
    if (hL && hR) {
      const a = this.toPx(hL), b2 = this.toPx(hR);
      ctx.save();
      ctx.strokeStyle = this.together ? "rgba(159,192,138,0.75)" : "rgba(232,168,106,0.3)";
      ctx.lineWidth = this.together ? 6 : 3;
      if (!this.together) ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      ctx.restore();
    }
    this.drawTimerWhisper(ctx, c, now);
  }

  extra() {
    return {
      rgsStage: this.stage,
      caught: this.caught, placed: this.placed,
      wrongBasket: this.wrongBasket, passedBy: this.passed,
    };
  }
}

/* ==================== G25 Connect the Dots ==================== */
// Sequenced point-to-point reaching with a picture as the payoff: hold on
// dot 1, then 2, then 3, and a line follows the hand until the shape appears.
// Clinically this is the opposite of the coverage games - every movement is a
// discrete reach to a KNOWN target, which is what makes it useful for
// accuracy and for patients who need a next step they can see rather than a
// field to sweep.
//
// The dots are laid inside the patient's OWN envelope (each one pulled
// radially in to `spread × envAt` if the shape would push it past their
// reach), so a picture is never partly unreachable. Levels add dots and
// shrink the capture radius together, exactly like the paper puzzles that go
// 1-10, 1-30, 1-150: the same drawing, asked for more precisely.
const DOT_LEVELS = [
  // dots = how many points the outline is resampled to
  // radius = capture radius, SW ; spread = fraction of the envelope used
  { dots: 10, radius: 0.30, spread: 0.60 },
  { dots: 14, radius: 0.26, spread: 0.70 },
  { dots: 20, radius: 0.22, spread: 0.80 },
  { dots: 26, radius: 0.19, spread: 0.90 },
  { dots: 34, radius: 0.16, spread: 1.00 },
  { dots: 44, radius: 0.14, spread: 1.00 },
];
const DOT_MAX = DOT_LEVELS.length;

// Outlines in a 0..1 box, y DOWN (so they read like a drawing when written).
// Dense enough that resampling to any dot count keeps the shape.
function starOutline() {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? 0.19 : 0.47;
    p.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
  }
  return p;
}
function heartOutline() {
  const p = [];
  for (let i = 0; i < 36; i++) {          // open ring: the class closes it
    const t = i / 36 * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    p.push([0.5 + x / 38, 0.5 + y / 38]);
  }
  return p;
}
const DOT_PUZZLES = [
  { name: "a star", pts: starOutline() },
  { name: "a house", pts: [[0.18, 0.92], [0.18, 0.46], [0.5, 0.14], [0.82, 0.46], [0.82, 0.92]] },
  { name: "a heart", pts: heartOutline() },
  { name: "a boat", pts: [[0.14, 0.72], [0.86, 0.72], [0.72, 0.9], [0.28, 0.9], [0.14, 0.72],
                          [0.5, 0.72], [0.5, 0.14], [0.8, 0.66], [0.5, 0.66]] },
  { name: "a fish", pts: [[0.2, 0.5], [0.42, 0.3], [0.66, 0.3], [0.8, 0.42], [0.96, 0.24],
                          [0.96, 0.76], [0.8, 0.58], [0.66, 0.7], [0.42, 0.7]] },
  { name: "a tree", pts: [[0.5, 0.1], [0.68, 0.4], [0.58, 0.4], [0.76, 0.66], [0.6, 0.66],
                          [0.6, 0.9], [0.4, 0.9], [0.4, 0.66], [0.24, 0.66], [0.42, 0.4], [0.32, 0.4]] },
];

// Turning an outline into N dots. Corners FIRST: a picture is recognisable
// because of its corners, and even arc-length spacing walks straight past
// them - a star resampled to 8 evenly spaced points stops looking like a
// star. So every vertex is a dot, and the spare dots go to the longest edges,
// which is exactly where a long undotted line looks wrong. N is exact either
// way, so the same drawing at 10 dots and at 44 is the same drawing.
function dotsFromOutline(pts, n) {
  if (n <= pts.length) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(pts[Math.round(k * pts.length / n) % pts.length]);
    return out;
  }
  const out = pts.slice();
  while (out.length < n) {
    let bi = 0, bd = -1;
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > bd) { bd = d; bi = i; }
    }
    const a = out[bi], b = out[(bi + 1) % out.length];
    out.splice(bi + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return out;
}

export class ConnectDots extends GameBase {
  id = "dots";
  setup() {
    this.tips = {
      objective: "Hold your hand on the next glowing dot.",
      miss: "Take your time — the next dot is the bright one.",
    };
    this.level = Math.max(1, Math.min(DOT_MAX, this.opts.level || 1));
    this.picturesDone = 0;
    this.doneAt = 0;
    this._newPuzzle();
    this.tellStory(STORIES.dots);
  }

  _lv() { return DOT_LEVELS[this.level - 1]; }

  _newPuzzle() {
    const lv = this._lv();
    this.puzzle = DOT_PUZZLES[(this.level - 1 + this.picturesDone) % DOT_PUZZLES.length];
    const raw = dotsFromOutline(this.puzzle.pts, lv.dots);
    // the picture's box: the axis reaches this patient actually has, so a
    // lopsided envelope gets a lopsided (but complete) picture rather than a
    // small symmetrical one
    const hw = Math.min(this.envAt(0), this.envAt(Math.PI)) * lv.spread;
    const hh = Math.min(this.envAt(Math.PI / 2), this.envAt(-Math.PI / 2)) * lv.spread;
    const c = this.canvas, M = 60;
    this.dots = raw.map(([ux, uy]) => {
      let x = CENTER.x + (ux - 0.5) * 2 * hw;
      let y = CENTER.y - (uy - 0.5) * 2 * hh;        // outlines are y-down
      // never place a dot past the measured reach in its own direction: the
      // corners of any box sit further out than the axes do
      const dx = x - CENTER.x, dy = y - CENTER.y;
      const r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const lim = lv.spread * this.envAt(th);
      if (r > lim && r > 0) { x = CENTER.x + dx / r * lim; y = CENTER.y + dy / r * lim; }
      // and keep it on screen, still body-anchored
      const px = this.toPx({ x, y });
      if (px.x < M || px.x > c.width - M || px.y < M || px.y > c.height - M) {
        px.x = Math.min(Math.max(px.x, M), c.width - M);
        px.y = Math.min(Math.max(px.y, M), c.height - M);
        return this.t.pxToRel(px, c);
      }
      return { x, y };
    });
    this.idx = 0;
    this.trail = [];
    this._dwells = {};
  }

  update(now) {
    // the finished picture gets a moment on screen before the next one
    if (this.doneAt) {
      if (now - this.doneAt > 3200) {
        this.doneAt = 0;
        this.picturesDone++;
        if (this.level < DOT_MAX) {
          this.level++;
          this.say(`Level ${this.level}. More dots this time.`);
        } else this.say("Another picture.");
        this._newPuzzle();
      }
      return;
    }
    const lv = this._lv();
    const target = this.dots[this.idx];
    if (!target) return;
    const inside = this.handNear(target, lv.radius);
    // squeeze is a shortcut, never a requirement: a patient with no grasp
    // still completes every dot on the hold alone
    const grabbed = inside && this.t.handClosed(this.side);
    const f = this.dwellProgress(`d${this.idx}`, inside, now);
    if (f >= 1 || grabbed) {
      this.trail.push({ ...target });
      this.idx++;
      const th = Math.atan2(target.y - CENTER.y, target.x - CENTER.x);
      this.hit({ reachFrac: Math.hypot(target.x - CENTER.x, target.y - CENTER.y) / (this.envAt(th) || 1) });
      this.burst(target, "#fff6d8");
      if (this.idx >= this.dots.length) {
        this.doneAt = now;
        audio.fanfare();
        this.say(`It's ${this.puzzle.name}!`);
      }
    }
  }

  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.45, 60, c.width / 2, c.height * 0.45, c.height * 0.95);
    g.addColorStop(0, "#2f2c58"); g.addColorStop(1, "#15152f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }

  draw(ctx, c, now) {
    const lv = this._lv();
    const sw = this.sw();
    const done = this.doneAt > 0;

    // the line drawn so far — and, once finished, closed and softly filled so
    // the shape reads as a picture rather than as a path
    if (this.trail.length > 1) {
      const P = this.trail.map(p => this.toPx(p));
      ctx.save();
      if (done) {
        ctx.beginPath();
        P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = "rgba(232,168,106,0.18)";
        ctx.fill();
      }
      ctx.strokeStyle = done ? "#9fc08a" : "#e8a86a";
      ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = done ? "rgba(159,192,138,0.7)" : "rgba(232,168,106,0.6)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (done) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Only the NEXT dot is bright, and it carries its number. Lighting every
    // dot equally is what makes a paper puzzle confusing; here there is
    // always exactly one thing to go to.
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(c.height * 0.022)}px Nunito, sans-serif`;
    for (let i = 0; i < this.dots.length; i++) {
      const p = this.toPx(this.dots[i]);
      const past = i < this.idx, next = i === this.idx && !done;
      if (next) {
        const pulse = Math.sin(now / 360) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(232,168,106,${0.45 + pulse * 0.4})`;
        ctx.lineWidth = 4; ctx.setLineDash([8, 9]);
        ctx.beginPath(); ctx.arc(p.x, p.y, lv.radius * sw, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        // read the dwell, never advance it: dwellProgress() has side effects
        // and calling it from draw() would count the hold twice a frame
        const f = Math.min(1, (this._dwells?.[`d${i}`]?.acc ?? 0) / A11Y.dwellMs);
        if (f > 0) {
          ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, lv.radius * sw + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
        }
        const gd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 20);
        gd.addColorStop(0, "#fff6d8"); gd.addColorStop(1, "#e8a86a");
        ctx.fillStyle = gd;
        ctx.shadowColor = "rgba(232,168,106,0.9)"; ctx.shadowBlur = 26;
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = past ? "rgba(159,192,138,0.9)" : "rgba(244,236,221,0.34)";
        ctx.beginPath(); ctx.arc(p.x, p.y, past ? 8 : 6, 0, TAU); ctx.fill();
      }
      if (!past && !done) {
        ctx.fillStyle = next ? "#1b1b3a" : "rgba(244,236,221,0.5)";
        ctx.fillText(String(i + 1), p.x, p.y + (next ? 0 : -18));
      }
    }
    ctx.restore();
    this.drawTimerWhisper(ctx, c, now);
  }

  extra() {
    return {
      dotsLevel: this.level,
      picturesFinished: this.picturesDone,
      dotsPlaced: this.idx,
      dotRadiusSW: this._lv().radius,
    };
  }
}

/* ==================== G11 Crane Keeper (hold high + squeeze) ==================== */
// Progressive abduction loading made playful: keep the arm inside a raised
// band (the crane stays up) and, while holding, squeeze to catch passing
// crates — proximal stabilization + distal action in one loop.
export class CraneKeeper extends GameBase {
  id = "crane";
  setup() {
    this.tips = {
      objective: "Keep your arm up, and squeeze when a crate is under the hook.",
      miss: "Rest a moment, then lift back into the glow.",
    };
    const top = this.profile.arcMaxDeg ?? 120;
    this.band = { lo: Math.max(35, top * 0.45), hi: Math.max(65, top * 0.8) };
    this.inBand = false;
    this.bandMs = 0; this.playMs = 0;
    this.crates = [];
    this.carried = null;
    this.nextCrate = 0;
    this.wasClosed = false;
    this.delivered = 0;
    this.tellStory(STORIES.crane);
  }
  update(now, dt) {
    this.playMs += dt;
    const ang = this.t.armAngle(this.side);
    this.inBand = ang != null && ang >= this.band.lo && ang <= this.band.hi;
    if (this.inBand) this.bandMs += dt;

    // crates drift across the water lane near the bottom of the reach space
    if (now > this.nextCrate && this.crates.length < 2) {
      const fromLeft = this.side === "right";
      this.crates.push({
        x: fromLeft ? -1.4 : 1.4,
        y: CENTER.y - 0.55,
        vx: (fromLeft ? 1 : -1) * (0.00022 + Math.random() * 0.0001),   // SW per ms
        held: false,
      });
      this.nextCrate = now + (this.params.lifetime * 1000) + Math.random() * 1500;
    }

    const closed = this.t.handClosed(this.side);
    const squeezeEdge = closed && !this.wasClosed;
    this.wasClosed = closed;

    for (const cr of this.crates) {
      if (cr.held) continue;
      cr.x += cr.vx * dt;
      if (Math.abs(cr.x) > 1.5) { cr.gone = true; this.miss(); }
    }
    this.crates = this.crates.filter(cr => !cr.gone);

    // the hook hangs under the claw: only live while the arm holds the band
    if (this.inBand && !this.carried && squeezeEdge) {
      const hook = { x: 0, y: CENTER.y - 0.15 };
      for (const cr of this.crates) {
        if (Math.abs(cr.x - hook.x) < 0.3 && !cr.held) {
          cr.held = true; this.carried = cr;
          audio.note(3);
          this.say("Got it! Now let it settle on the barge.");
          break;
        }
      }
    }
    // carried crate rises to the claw, then an open hand lowers it onto the barge
    if (this.carried) {
      const cr = this.carried;
      cr.x += (0 - cr.x) * 0.06;
      cr.y += ((CENTER.y - 0.05) - cr.y) * 0.06;
      if (!closed) {
        this.delivered++;
        this.hit({ reachFrac: 0.8 });
        this.burst({ x: cr.x, y: cr.y }, "#9fc08a");
        cr.gone = true; this.carried = null;
        this.crates = this.crates.filter(k => !k.gone);
      }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#1c2440"); g.addColorStop(0.62, "#25314e"); g.addColorStop(1, "#101a2e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    // water line + barge
    const wl = this.toPx({ x: 0, y: CENTER.y - 0.62 });
    ctx.fillStyle = "rgba(18, 40, 52, 0.55)";
    ctx.fillRect(0, wl.y, c.width, c.height - wl.y);
  }
  draw(ctx, c, now) {
    const sw = this.sw();
    // elevation band arc around the shoulder: the "keep the crane up" zone
    const sh = this.t.shoulder(this.side);
    if (sh) {
      const sp = this.t._videoToPx(sh.x, sh.y, c);
      // canvas angle: PI/2 = straight down; elevation rotates outward on the
      // trained side (screen-right for the right arm in the mirror view)
      const mirror = this.side === "left" ? -1 : 1;
      ctx.save();
      ctx.lineWidth = 16; ctx.lineCap = "round";
      ctx.strokeStyle = this.inBand ? "rgba(159,192,138,0.5)" : "rgba(232,168,106,0.3)";
      if (!this.inBand) ctx.setLineDash([14, 10]);
      const a0 = Math.PI / 2 - mirror * (this.band.lo * Math.PI / 180);
      const a1 = Math.PI / 2 - mirror * (this.band.hi * Math.PI / 180);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sw * 0.9, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      ctx.restore();
    }
    // claw + cable at top center of the work area
    const claw = this.toPx({ x: 0, y: CENTER.y + 0.55 });
    const hook = this.toPx({ x: 0, y: CENTER.y - 0.15 });
    ctx.strokeStyle = this.inBand ? "#e8b98a" : "rgba(232,185,138,0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(claw.x, claw.y - sw * 0.3); ctx.lineTo(hook.x, this.inBand ? hook.y : hook.y + sw * 0.35); ctx.stroke();
    this.glow(ctx, hook.x, this.inBand ? hook.y : hook.y + sw * 0.35, 12, "#fff6d8", this.inBand ? "#e8a86a" : "#5a5f80", 18);
    // crates
    for (const cr of this.crates) {
      const p = this.toPx(cr);
      crateShape(ctx, p.x, p.y, sw * 0.24, cr.held);
    }
    // barge (delivery spot) with the delivered stack — the count IS the test
    const barge = this.toPx({ x: this.side === "right" ? 0.65 : -0.65, y: CENTER.y - 0.68 });
    roundedRect(ctx, barge.x - sw * 0.4, barge.y, sw * 0.8, sw * 0.16, 6, "#3a3552", "#262242");
    for (let i = 0; i < this.delivered; i++) {
      crateShape(ctx, barge.x - sw * 0.28 + (i % 4) * sw * 0.19, barge.y - sw * 0.12 - Math.floor(i / 4) * sw * 0.2, sw * 0.15, false);
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    return { holdFrac: this.playMs ? this.bandMs / this.playMs : 0, delivered: this.delivered };
  }
}

/* ==================== G12 Feather Lantern (eccentric lowering) ==================== */
// Controlled lowering against gravity — the movement-quality deficit the
// hit/miss economy can't see. Lift briskly to the hook, then descend inside
// a gentle speed band; too fast and the flame gutters.
export class FeatherLantern extends GameBase {
  id = "feather";
  setup() {
    this.tips = {
      objective: "Lift the lantern up to its hook, then lower it slowly.",
      miss: "Let it drift down slow as a feather.",
    };
    this.phase = "lift";                    // lift → lower → (hit) → lift
    this.topY = CENTER.y + 0.55 * this.params.rangeScale;
    this.botY = CENTER.y - 0.5 * this.params.rangeScale;
    this.speedBand = 0.55;                  // max downward SW/s that keeps the flame
    this.inBandMs = 0; this.lowerMs = 0;
    this.cycles = 0;
    this.flame = 1;
    this.tellStory(STORIES.feather);
  }
  update(now, dt) {
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    if (!h) return;
    this.lanternY = h.y;
    if (this.phase === "lift") {
      if (h.y >= this.topY) {
        this.phase = "lower";
        this.flame = 1;
        audio.note(4);
        this.say("Lovely. Now lower it, slow and steady.");
      }
    } else {
      const v = this.t.handVel(this.side);
      const down = v ? -v.y : 0;            // positive when descending
      this.lowerMs += dt;
      if (down < this.speedBand) {
        this.inBandMs += dt;
        this.flame = Math.min(1, this.flame + dt / 900);
      } else {
        this.flame -= dt / 500;             // dropping too fast: the flame gutters
        if (this.flame <= 0) {
          this.miss();
          this.say(this.tips.miss);
          this.phase = "lift";
          this.flame = 1;
          return;
        }
      }
      if (h.y <= this.botY) {
        this.cycles++;
        this.hit({ reachFrac: 0.9 });
        this.burst({ x: h.x, y: h.y }, "#ffd98a");
        this.phase = "lift";
      }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#241f45"); g.addColorStop(1, "#131228");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const sw = this.sw();
    const hook = this.toPx({ x: CENTER.x, y: this.topY });
    const shelf = this.toPx({ x: CENTER.x, y: this.botY });
    // hook (target while lifting)
    ctx.strokeStyle = this.phase === "lift" ? "#e8a86a" : "rgba(232,168,106,0.3)";
    ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(hook.x, hook.y - 14, 12, Math.PI * 0.1, Math.PI * 1.2); ctx.stroke();
    // shelf (target while lowering)
    ctx.strokeStyle = this.phase === "lower" ? "#9fc08a" : "rgba(159,192,138,0.3)";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(shelf.x - sw * 0.35, shelf.y); ctx.lineTo(shelf.x + sw * 0.35, shelf.y); ctx.stroke();
    // the speed column: glows sage inside the gentle band, amber outside
    if (this.phase === "lower") {
      const v = this.t.handVel(this.side);
      const down = v ? Math.max(0, -v.y) : 0;
      const f = Math.min(1, down / (this.speedBand * 1.8));
      const colX = shelf.x + sw * 0.75 * (this.side === "right" ? 1 : -1);
      const colTop = hook.y, colBot = shelf.y;
      ctx.fillStyle = "rgba(244,236,221,0.08)";
      ctx.fillRect(colX - 10, colTop, 20, colBot - colTop);
      const okBand = down < this.speedBand;
      ctx.fillStyle = okBand ? "rgba(159,192,138,0.75)" : "rgba(232,168,106,0.85)";
      ctx.fillRect(colX - 10, colBot - (colBot - colTop) * f, 20, (colBot - colTop) * f);
      if (!okBand) {   // redundant non-color cue: the column wobbles when too fast
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
        ctx.strokeRect(colX - 13, colTop, 26, colBot - colTop);
        ctx.setLineDash([]);
      }
    }
    // the lantern rides the hand; flame size = how gently it is being carried
    const hp = this.t.palmPx(this.side, c);
    if (hp) {
      lanternShape(ctx, hp.x, hp.y + 26, 20 + this.flame * 6, this.phase === "lower" && this.flame > 0.6);
      ctx.globalAlpha = Math.max(0.15, this.flame);
      this.glow(ctx, hp.x, hp.y + 18, 9 + this.flame * 7, "#fff6d8", "#e8a86a", 20);
      ctx.globalAlpha = 1;
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    return { descentSmooth: this.lowerMs ? this.inBandMs / this.lowerMs : 0, cycles: this.cycles };
  }
}

/* ==================== G13 Two Lights (Fitts ladder) ==================== */
// Speed–accuracy staircase: touch two buoys alternately; every block resizes
// the buoys and their separation (Fitts index of difficulty), and the round
// reports throughput — a repeatable hidden assessment.
export class TwoLights extends GameBase {
  id = "buoys";
  setup() {
    this.tips = {
      objective: "Touch one light, then the other. Find your own rhythm.",
      miss: "No rush, steady taps back and forth.",
    };
    this.block = 0;
    this.taps = [];
    this._newBlock();
    this.activeIdx = 0;
    this.lastTapAt = null;
    this.tellStory(STORIES.buoys);
  }
  _newBlock() {
    // blocks sweep difficulty: separation fraction × target size
    const D = [0.5, 0.7, 0.9][this.block % 3];
    const W = [1.3, 1, 0.75][Math.floor(this.block / 3) % 3];
    this.sep = D; this.wScale = W;
    const th = this.side === "right" ? 0 : Math.PI;
    const r = (f) => ({
      x: CENTER.x + Math.cos(th) * this.envAt(th) * this.params.rangeScale * this.sep * f,
      y: CENTER.y + (f > 0 ? 0.08 : -0.08),
    });
    this.lights = [r(0.5), r(-0.5)];
    this.blockTapCount = 0;
    this.block++;
  }
  update(now) {
    const target = this.lights[this.activeIdx];
    const hitR = this.params.radius * this.wScale;
    if (this.handNear(target, hitR)) {
      // touch is enough — speed is the point of this game
      const mt = this.lastTapAt ? (now - this.lastTapAt) / 1000 : null;
      if (mt && mt > 0.15) {
        const Dsw = Math.hypot(this.lights[0].x - this.lights[1].x, this.lights[0].y - this.lights[1].y);
        const id = Math.log2((2 * Dsw) / (hitR * 2));
        if (id > 0) this.taps.push({ mt, id, tp: id / mt });
      }
      this.lastTapAt = now;
      this.hit({ reachFrac: 0.7 });
      this.burst(target, "#fff2c2");
      this.activeIdx = 1 - this.activeIdx;
      if (++this.blockTapCount >= 10) { this._newBlock(); this.say("New waters. Keep your rhythm."); }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#1a2140"); g.addColorStop(0.7, "#182a42"); g.addColorStop(1, "#0e1830");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const pulse = Math.sin(now / 350) * 0.5 + 0.5;
    this.lights.forEach((l, i) => {
      const p = this.toPx(l);
      const active = i === this.activeIdx;
      const r = this.params.radius * this.wScale * this.sw();
      // buoy body
      ctx.fillStyle = active ? "#e8a86a" : "rgba(120,126,160,0.7)";
      ctx.beginPath(); ctx.moveTo(p.x - 12, p.y + 20); ctx.lineTo(p.x + 12, p.y + 20); ctx.lineTo(p.x + 7, p.y - 6); ctx.lineTo(p.x - 7, p.y - 6); ctx.closePath(); ctx.fill();
      if (active) {
        this.glow(ctx, p.x, p.y - 16, 12 + pulse * 6, "#fff6d8", "#e8a86a", 26);
        ctx.strokeStyle = "rgba(255,246,216,0.5)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y - 8, r, 0, TAU); ctx.stroke();
      } else {
        this.glow(ctx, p.x, p.y - 16, 7, "rgba(244,236,221,0.5)", "rgba(140,150,190,0.4)", 10);
      }
    });
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    const tp = this.taps.map(t => t.tp);
    const mt = this.taps.map(t => t.mt);
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    return { throughput: +mean(tp).toFixed(2), meanMT: +mean(mt).toFixed(2), blocks: this.block };
  }
}

/* ==================== G14 Ferry Oars (bilateral rowing) ==================== */
// The suite's first two-arm game. Both hands cycle up and down to row; boat
// speed rewards amplitude × symmetry (a bonus, never a requirement — the
// Jintronix design). Mode "together" = in-phase; "bailing" = anti-phase,
// the harder interlimb pattern (BATRAC).
export class FerryOars extends GameBase {
  id = "oars";
  setup() {
    this.tips = {
      objective: "Row with both hands, nice and even.",
      miss: "Let both arms share the work, gently.",
    };
    this.opts.bothArms = true;
    this.mode = this.opts.mode === "bailing" ? "anti" : "in";
    this.boatX = 0;                          // 0 → 1 across the harbor
    this.crossings = 0;
    this.phase = { left: null, right: null };  // wave state per hand
    this.lastY = { left: null, right: null };
    this.dir = { left: 0, right: 0 };
    this.strokeAmp = { left: 0, right: 0 };
    this.strokeMin = { left: null, right: null };
    this.strokeMax = { left: null, right: null };
    this.symScore = [];
    this.speed = 0;
    this.tellStory(STORIES.oars);
  }
  _trackStroke(s, y, now) {
    // detect direction reversals → one half-stroke; amplitude = travel since last reversal
    if (this.lastY[s] == null) { this.lastY[s] = y; return null; }
    const dy = y - this.lastY[s];
    // tiny threshold: slow, effortful strokes must still register (only true
    // jitter is filtered; the reversal itself is the signal)
    if (Math.abs(dy) < 0.0006) return null;
    this.lastY[s] = y;
    const dir = Math.sign(dy);
    if (this.dir[s] === 0) { this.dir[s] = dir; this.strokeMin[s] = this.strokeMax[s] = y; return null; }
    this.strokeMin[s] = Math.min(this.strokeMin[s], y);
    this.strokeMax[s] = Math.max(this.strokeMax[s], y);
    if (dir !== this.dir[s]) {
      this.dir[s] = dir;
      const amp = this.strokeMax[s] - this.strokeMin[s];
      this.strokeMin[s] = this.strokeMax[s] = y;
      if (amp > 0.12) return { amp, at: now, dirNow: dir };
    }
    return null;
  }
  update(now, dt) {
    const ys = {};
    for (const s of ["left", "right"]) {
      const h = this.t.palmRel(s) || this.t.handRel(s);
      if (h) ys[s] = h.y;
    }
    let stroked = false;
    for (const s of ["left", "right"]) {
      if (ys[s] == null) continue;
      const st = this._trackStroke(s, ys[s], now);
      if (st) { this.strokeAmp[s] = st.amp; this.lastStroke = { ...st, side: s }; stroked = true; }
    }
    // symmetry: compare the two hands' current vertical positions
    if (ys.left != null && ys.right != null) {
      const diff = this.mode === "in"
        ? Math.abs(ys.left - ys.right)                               // together: same height
        : Math.abs((ys.left - CENTER.y) + (ys.right - CENTER.y));    // bailing: mirror heights
      this.sym = Math.max(0, 1 - diff / 0.5);
    } else this.sym = 0;

    if (stroked) {
      const amp = (this.strokeAmp.left + this.strokeAmp.right) / 2;
      const boost = amp * (0.6 + 0.4 * this.sym);      // symmetry sweetens, never gates
      this.speed = Math.min(0.00035, this.speed + boost * 0.0004);
      this.symScore.push(this.sym);
      audio.note(Math.floor(this.sym * 4));
    }
    this.speed *= Math.pow(0.9994, dt);                // gentle drag
    this.boatX += this.speed * dt;
    if (this.boatX >= 1) {
      this.crossings++;
      this.boatX = 0;
      this.hit({ reachFrac: 0.8 });
      this.say("Across! The ferry thanks you both.");
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#1b2342"); g.addColorStop(0.55, "#20355077"); g.addColorStop(1, "#0d1a30");
    ctx.fillStyle = "#1b2342"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    // far shore with waiting windows
    ctx.fillStyle = "#141b30";
    ctx.fillRect(c.width * 0.86, c.height * 0.42, c.width * 0.14, c.height * 0.2);
    for (let i = 0; i < this.crossings && i < 8; i++) {
      ctx.fillStyle = "#e8a86a";
      ctx.fillRect(c.width * (0.88 + (i % 4) * 0.03), c.height * (0.45 + Math.floor(i / 4) * 0.07), 8, 10);
    }
    // water
    ctx.fillStyle = "rgba(16, 40, 56, 0.5)";
    ctx.fillRect(0, c.height * 0.62, c.width, c.height * 0.38);
  }
  draw(ctx, c, now) {
    // the ferry crossing left → right
    const bx = c.width * (0.12 + this.boatX * 0.68);
    const by = c.height * 0.62 + Math.sin(now / 800) * 5;
    ctx.save();
    ctx.fillStyle = "#3a3552";
    ctx.beginPath();
    ctx.moveTo(bx - 60, by); ctx.lineTo(bx + 60, by); ctx.lineTo(bx + 40, by + 26); ctx.lineTo(bx - 40, by + 26);
    ctx.closePath(); ctx.fill();
    lanternShape(ctx, bx, by - 16, 11, this.sym > 0.7);
    // oars angle with the mean hand height
    const hL = this.t.palmRel("left"), hR = this.t.palmRel("right");
    const oar = (hx, side) => {
      const a = Math.max(-0.7, Math.min(0.7, (hx ?? CENTER.y) - CENTER.y));
      ctx.strokeStyle = "rgba(232,185,138,0.8)"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx + side * 26, by + 6);
      ctx.lineTo(bx + side * 78, by + 6 + a * -60);
      ctx.stroke();
    };
    oar(hL?.y, -1); oar(hR?.y, 1);
    ctx.restore();
    // the symmetry ribbon: a bar that levels when the two hands agree —
    // level line + steady glow = good (shape cue, not color-only)
    const rw = c.width * 0.22, rx = c.width / 2 - rw / 2, ry = c.height * 0.12;
    ctx.strokeStyle = "rgba(244,236,221,0.25)"; ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry - 12, rw, 24);
    const tilt = (this.sym != null ? (1 - this.sym) : 1) * 16;
    const dirSign = (hL?.y ?? 0) > (hR?.y ?? 0) ? -1 : 1;
    ctx.strokeStyle = this.sym > 0.7 ? "#9fc08a" : "#e8a86a";
    ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rx + 8, ry + dirSign * tilt);
    ctx.lineTo(rx + rw - 8, ry - dirSign * tilt);
    ctx.stroke();
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    return { crossings: this.crossings, symmetry: +mean(this.symScore).toFixed(2), rowMode: this.mode };
  }
}

/* ==================== G15 The Night Ferry (steering / berthing) ==================== */
// Continuous steering — the most repeated commercial rehab verb after reach.
// Solo: hand height is the rudder. Wheel mode: both hands grip an invisible
// wheel; the angle of the line between the palms steers (bimanual).
export class NightFerry extends GameBase {
  id = "ferry";
  setup() {
    this.tips = {
      objective: "Steer the ferry between the buoy gates.",
      miss: "Small and steady on the wheel. Bumps are soft here.",
    };
    this.wheel = this.opts.mode === "wheel";
    if (this.wheel) this.opts.bothArms = true;
    this.boat = { y: 0.5, vy: 0 };          // 0..1 vertical position in the channel
    this.gates = [];
    this.gateEvery = 0.32;                  // world-space gap between gates
    this.worldX = 0;
    this.nextGateX = 0.5;
    this.gatesThrough = 0;
    this.bumps = 0;
    this.steer = 0;
    this.jitterSum = 0; this.jitterN = 0;
    this.tellStory(STORIES.ferry);
  }
  update(now, dt) {
    // steering input → target lateral velocity
    let steer = null;
    if (this.wheel) {
      const l = this.t.palmRel("left"), r = this.t.palmRel("right");
      if (l && r) steer = Math.max(-1, Math.min(1, (r.y - l.y) / 0.7));
    } else {
      const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
      if (h) steer = Math.max(-1, Math.min(1, (h.y - CENTER.y) / (0.55 * this.params.rangeScale)));
    }
    if (steer != null) {
      this.jitterSum += Math.abs(steer - this.steer); this.jitterN++;
      this.steer = steer;
      this.boat.vy += (steer * 0.00042 - this.boat.vy) * 0.08;
    }
    this.boat.y = Math.max(0.06, Math.min(0.94, this.boat.y - this.boat.vy * dt));

    // the channel scrolls; gates arrive on a rhythm set by the profile's pace
    const speed = 0.00009 + 0.00002 * (this.gatesThrough > 4 ? 1 : 0);
    this.worldX += speed * dt;
    if (this.worldX + 1.2 > this.nextGateX) {
      const gapHalf = Math.max(0.09, 0.2 - this.gatesThrough * 0.008);
      this.gates.push({ x: this.nextGateX, yc: 0.2 + Math.random() * 0.6, gapHalf, done: false });
      this.nextGateX += this.gateEvery;
    }
    for (const gd of this.gates) {
      const sx = gd.x - this.worldX;        // screen-space 0..1 (boat sits at 0.22)
      if (!gd.done && sx < 0.22) {
        gd.done = true;
        if (Math.abs(this.boat.y - gd.yc) <= gd.gapHalf) {
          this.gatesThrough++;
          this.hit({ reachFrac: 0.7 });
          this.burst({ x: CENTER.x, y: CENTER.y }, "#9fc08a");
        } else {
          this.bumps++;
          this.miss();                       // soft: the buoy just dings
        }
      }
    }
    this.gates = this.gates.filter(gd => gd.x - this.worldX > -0.2);
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#151d3a"); g.addColorStop(0.4, "#1c2f4a"); g.addColorStop(1, "#0a1526");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    // moon road on the water
    ctx.fillStyle = "rgba(244,236,221,0.05)";
    ctx.fillRect(0, c.height * 0.1, c.width, c.height * 0.84);
  }
  draw(ctx, c, now) {
    const laneTop = c.height * 0.08, laneH = c.height * 0.84;
    // gates: paired buoys with a lit gap
    for (const gd of this.gates) {
      const sx = gd.x - this.worldX;
      const px = c.width * (0.1 + sx * 0.85);
      if (px > c.width + 40) continue;
      const yTop = laneTop + (gd.yc - gd.gapHalf) * laneH;
      const yBot = laneTop + (gd.yc + gd.gapHalf) * laneH;
      const pulse = Math.sin(now / 400) * 0.5 + 0.5;
      for (const [gy, flip] of [[yTop, -1], [yBot, 1]]) {
        ctx.fillStyle = gd.done ? "rgba(120,126,160,0.5)" : "#c77f4a";
        ctx.beginPath(); ctx.moveTo(px - 10, gy + flip * 14); ctx.lineTo(px + 10, gy + flip * 14); ctx.lineTo(px + 6, gy); ctx.lineTo(px - 6, gy); ctx.closePath(); ctx.fill();
        if (!gd.done) this.glow(ctx, px, gy, 6 + pulse * 4, "#fff6d8", "#e8a86a", 14);
      }
      if (!gd.done) {
        ctx.strokeStyle = "rgba(159,192,138,0.35)"; ctx.lineWidth = 3; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(px, yTop + 8); ctx.lineTo(px, yBot - 8); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // the ferry at fixed x, rides boat.y
    const bx = c.width * 0.22, by = laneTop + this.boat.y * laneH;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-this.boat.vy * 300);
    ctx.fillStyle = "#4a4468";
    ctx.beginPath(); ctx.moveTo(-44, -12); ctx.lineTo(30, -12); ctx.lineTo(48, 0); ctx.lineTo(30, 12); ctx.lineTo(-44, 12); ctx.closePath(); ctx.fill();
    lanternShape(ctx, -8, -20, 9, true);
    ctx.restore();
    // wheel-mode: show the invisible wheel between the palms
    if (this.wheel) {
      const l = this.t.palmPx("left", c), r = this.t.palmPx("right", c);
      if (l && r) {
        ctx.strokeStyle = "rgba(232,185,138,0.55)"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
        const mx = (l.x + r.x) / 2, my = (l.y + r.y) / 2;
        ctx.strokeStyle = "rgba(232,185,138,0.35)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(mx, my, Math.hypot(r.x - l.x, r.y - l.y) / 2, 0, TAU); ctx.stroke();
      }
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    return {
      gates: this.gatesThrough, bumps: this.bumps,
      steadiness: this.jitterN ? +(1 - Math.min(1, (this.jitterSum / this.jitterN) * 12)).toFixed(2) : 0,
      ferryMode: this.wheel ? "wheel" : "solo",
    };
  }
}

/* ==================== G16 Falling Stars (ballistic swipe) ==================== */
// The suite's missing speed axis: success is a sweep THROUGH the streak at
// real velocity, not a dwell. Later streaks spawn contralaterally, so the
// sweep crosses the midline.
export class FallingStars extends GameBase {
  id = "stars";
  setup() {
    this.tips = {
      objective: "Sweep your hand through the falling stars.",
      miss: "A flowing sweep, like brushing sand away.",
    };
    this.streaks = [];
    this.nextSpawn = 0;
    this.needVel = 0.9;                     // SW/s sweep speed to scatter a streak
    this.swept = 0;
    this.crossers = 0;
    this.tellStory(STORIES.stars);
  }
  update(now, dt) {
    if (now > this.nextSpawn && this.streaks.length < 3) {
      // from round midpoint on, some streaks sit across the midline
      const late = this.elapsed(now) > this.roundSeconds * 0.45;
      const cross = late && Math.random() < 0.4;
      const pos = this.samplePos({ upperHalf: true });
      if (cross) pos.x = -Math.abs(pos.x) * (this.side === "right" ? 1 : -1);
      this.streaks.push({ ...pos, born: now, life: this.params.lifetime * 1400, cross, drift: (Math.random() - 0.5) * 0.00004 });
      this.nextSpawn = now + 900 + Math.random() * 900;
    }
    const vel = this.t.handVel(this.side);
    for (const st of this.streaks) {
      st.y -= 0.00006 * dt;                  // slow fall
      st.x += st.drift * dt;
      if (now - st.born > st.life) { st.gone = true; this.miss(st); continue; }
      if (this.handNear(st, this.params.radius * 1.15) && vel && vel.mag > this.needVel) {
        st.gone = true;
        this.swept++;
        if (st.cross) this.crossers++;
        this.hit(st, this.swept);
        this.burst(st, "#fff2c2");
      }
    }
    this.streaks = this.streaks.filter(st => !st.gone);
  }
  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.2, 60, c.width / 2, c.height * 0.5, c.height);
    g.addColorStop(0, "#232a52"); g.addColorStop(1, "#0d1027");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    for (const st of this.streaks) {
      const p = this.toPx(st);
      const age = (now - st.born) / st.life;
      // the streak: a comet tail pointing up (it is falling)
      const grad = ctx.createLinearGradient(p.x, p.y - 70, p.x, p.y);
      grad.addColorStop(0, "rgba(255,246,216,0)");
      grad.addColorStop(1, st.cross ? "rgba(143,208,200,0.9)" : "rgba(255,242,194,0.9)");
      ctx.strokeStyle = grad; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 70); ctx.lineTo(p.x, p.y); ctx.stroke();
      this.glow(ctx, p.x, p.y, 11, "#fff6d8", st.cross ? "#8fd0c8" : "#e8a86a", 20);
      // life whisper: the streak fades as its moment passes
      ctx.globalAlpha = 1 - age * 0.6;
      starShape(ctx, p.x, p.y, 9, "#fff2c2");
      ctx.globalAlpha = 1;
    }
    // sweep-speed shimmer on the cursor when moving fast enough
    const vel = this.t.handVel(this.side);
    const hp = this.t.palmPx(this.side, c);
    if (hp && vel && vel.mag > this.needVel) {
      ctx.strokeStyle = "rgba(255,246,216,0.6)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 30 + Math.sin(now / 90) * 5, 0, TAU); ctx.stroke();
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() { return { swept: this.swept, midlineCrossed: this.crossers }; }
}

/* ==================== G17 Signal Flare (slingshot aim-hold-release) ==================== */
// Two-phase aim-then-commit: grab the flare line, pull back through the
// envelope (further = more power), hold the aim steady, open the hand to
// launch. Pairs stability-under-load with a timed release.
export class SignalFlare extends GameBase {
  id = "flare";
  setup() {
    this.tips = {
      objective: "Squeeze near the post, pull back, then open your hand to launch.",
      miss: "Pull back slowly, and let go when the line feels steady.",
    };
    this.post = { x: CENTER.x, y: CENTER.y - 0.15 };   // anchor post
    this.state = "idle";                                // idle → drawn → flying
    this.wasClosed = false;
    this.targets = [];
    this.flare = null;
    this.launches = 0; this.lit = 0;
    this._newTarget();
    this.tellStory(STORIES.flare);
  }
  _newTarget() {
    const pos = this.samplePos({ upperHalf: true });
    // sky targets sit high in the envelope
    pos.y = Math.max(pos.y, CENTER.y + 0.35 * this.params.rangeScale);
    this.targets = [{ ...pos, r: this.params.radius * 1.5, born: performance.now() }];
  }
  update(now, dt) {
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    const closed = this.t.handClosed(this.side);
    const edge = closed && !this.wasClosed;
    this.wasClosed = closed;
    if (!h) return;

    if (this.state === "idle") {
      if (edge && Math.hypot(h.x - this.post.x, h.y - this.post.y) < this.params.radius * 1.6) {
        this.state = "drawn";
        audio.serveTick();
      }
    } else if (this.state === "drawn") {
      this.drawVec = { x: this.post.x - h.x, y: this.post.y - h.y };   // launch direction
      this.power = Math.min(1, Math.hypot(this.drawVec.x, this.drawVec.y) / (0.8 * this.params.rangeScale));
      if (!closed) {
        // release: the flare flies along the draw vector
        const mag = Math.hypot(this.drawVec.x, this.drawVec.y) || 1e-6;
        if (this.power < 0.15) { this.state = "idle"; return; }   // a slip, not a shot
        this.launches++;
        this.flare = {
          x: this.post.x, y: this.post.y,
          vx: this.drawVec.x / mag * (0.0012 + this.power * 0.0022),
          vy: this.drawVec.y / mag * (0.0012 + this.power * 0.0022),
          born: now,
        };
        this.state = "flying";
        audio.whoosh();
      }
    } else if (this.state === "flying" && this.flare) {
      this.flare.x += this.flare.vx * dt;
      this.flare.y += this.flare.vy * dt;
      this.flare.vy -= 0.0000025 * dt;        // whisper of gravity
      const t0 = this.targets[0];
      if (t0 && Math.hypot(this.flare.x - t0.x, this.flare.y - t0.y) < t0.r) {
        this.lit++;
        this.hit(t0, this.lit);
        this.burst(t0, "#ffd98a");
        this.flare = null; this.state = "idle";
        this._newTarget();
        return;
      }
      if (now - this.flare.born > 2600) {
        this.miss(t0);
        this.flare = null; this.state = "idle";
      }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#101433"); g.addColorStop(0.65, "#232a52"); g.addColorStop(1, "#181d38");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const pp = this.toPx(this.post);
    const pulse = Math.sin(now / 400) * 0.5 + 0.5;
    // the post: grab point
    ctx.strokeStyle = "rgba(232,185,138,0.8)"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(pp.x, pp.y + 26); ctx.lineTo(pp.x, pp.y - 6); ctx.stroke();
    if (this.state === "idle") {
      this.glow(ctx, pp.x, pp.y - 10, 10 + pulse * 5, "#fff6d8", "#e8a86a", 20);
      ctx.strokeStyle = "rgba(255,246,216,0.4)"; ctx.lineWidth = 2.5; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(pp.x, pp.y - 10, this.params.radius * 1.6 * this.sw(), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    // drawn: the line from post to hand + power bloom + aim ghost
    if (this.state === "drawn") {
      const hp = this.t.palmPx(this.side, c);
      if (hp) {
        ctx.strokeStyle = "rgba(255,242,194,0.85)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(pp.x, pp.y - 10); ctx.lineTo(hp.x, hp.y); ctx.stroke();
        // aim ghost dots along the launch direction
        const mag = Math.hypot(this.drawVec.x, this.drawVec.y) || 1e-6;
        for (let i = 1; i <= 4; i++) {
          const gx = this.post.x + this.drawVec.x / mag * i * 0.22;
          const gy = this.post.y + this.drawVec.y / mag * i * 0.22;
          const gp = this.toPx({ x: gx, y: gy });
          ctx.globalAlpha = 0.5 - i * 0.09;
          ctx.fillStyle = "#fff2c2";
          ctx.beginPath(); ctx.arc(gp.x, gp.y, 4, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // power bloom at the post
        this.glow(ctx, pp.x, pp.y - 10, 8 + this.power * 18, "#fff6d8", "#e8a86a", 24);
      }
    }
    // the flare in flight
    if (this.flare) {
      const fp = this.toPx(this.flare);
      this.glow(ctx, fp.x, fp.y, 12, "#fff6d8", "#e8a86a", 26);
      ctx.strokeStyle = "rgba(232,168,106,0.5)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fp.x - this.flare.vx * 26000, fp.y + this.flare.vy * 26000); ctx.lineTo(fp.x, fp.y); ctx.stroke();
    }
    // sky target: a dark paper lantern waiting to be lit
    for (const t0 of this.targets) {
      const tp = this.toPx(t0);
      lanternShape(ctx, tp.x, tp.y, t0.r * this.sw() * 0.55, false, "#6a5f8a");
      ctx.strokeStyle = `rgba(255,246,216,${0.35 + pulse * 0.3})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(tp.x, tp.y, t0.r * this.sw(), 0, TAU); ctx.stroke();
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    return { launches: this.launches, lit: this.lit, accuracy: this.launches ? +(this.lit / this.launches).toFixed(2) : 0 };
  }
}

/* ==================== G18 Pantry Shelves (lift-to-shelf, ARAT) ==================== */
// The canonical ARAT grasp paradigm as gameplay: grasp a jar low in the
// envelope, carry it up, open the hand over a shelf. Shelves climb through
// the patient's own elevation range; the top one touches arcMaxDeg territory.
export class PantryShelves extends GameBase {
  id = "shelf";
  setup() {
    this.tips = {
      objective: "Squeeze the jar, lift it to the glowing shelf, and open your hand.",
      miss: "Take your time. Up it goes, shelf by shelf.",
    };
    this.shelfFracs = [0.25, 0.5, 0.75];    // of the vertical reach above center
    this.level = 0;
    this.placed = 0;
    this.jar = null; this.carrying = false;
    this.wasClosed = false;
    this._newJar();
    this.tellStory(STORIES.shelf);
  }
  _shelfPos(i) {
    const up = this.envAt(Math.PI / 2) * this.params.rangeScale;
    return { x: CENTER.x + (this.side === "right" ? 0.42 : -0.42), y: CENTER.y + this.shelfFracs[i] * up + 0.12 };
  }
  _newJar() {
    // jars start low on the trained side (table height)
    this.jar = {
      x: CENTER.x + (this.side === "right" ? -0.15 : 0.15),
      y: CENTER.y - 0.45 * this.params.rangeScale,
    };
    this.carrying = false;
  }
  update(now, dt) {
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    if (!h || !this.jar) return;
    const closed = this.t.handClosed(this.side);
    const edge = closed && !this.wasClosed;
    this.wasClosed = closed;

    if (!this.carrying) {
      // arrive open, then squeeze — the reach-to-grasp chain (same rule as Harbor Crates)
      if (edge && Math.hypot(h.x - this.jar.x, h.y - this.jar.y) < this.params.radius * 1.3) {
        this.carrying = true;
        audio.note(2);
      }
    } else {
      this.jar.x = h.x; this.jar.y = h.y;
      if (!closed) {
        const shelf = this._shelfPos(this.level);
        if (Math.hypot(h.x - shelf.x, h.y - shelf.y) < this.params.radius * 1.5) {
          this.placed++;
          this.hit({ reachFrac: 0.5 + this.shelfFracs[this.level] * 0.5 });
          this.burst(shelf, "#ffd98a");
          if (this.level < this.shelfFracs.length - 1) this.level++;
          else { this.level = 0; this.say("Top shelf! Starting a fresh row."); }
          this._newJar();
        } else {
          // the jar drifts back down to the table — soft, no shatter
          this.miss(null, true);
          audio.miss();
          this._newJar();
        }
      }
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#2a2344"); g.addColorStop(1, "#161226");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  }
  draw(ctx, c, now) {
    const sw = this.sw();
    const pulse = Math.sin(now / 400) * 0.5 + 0.5;
    // shelves: the active one glows; higher shelves wait in the dark
    this.shelfFracs.forEach((f, i) => {
      const sp = this.toPx(this._shelfPos(i));
      const active = i === this.level;
      ctx.strokeStyle = active ? `rgba(232,168,106,${0.65 + pulse * 0.3})` : "rgba(244,236,221,0.18)";
      ctx.lineWidth = active ? 7 : 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sp.x - sw * 0.3, sp.y); ctx.lineTo(sp.x + sw * 0.3, sp.y); ctx.stroke();
      if (active) {
        ctx.strokeStyle = "rgba(255,246,216,0.4)"; ctx.lineWidth = 2.5; ctx.setLineDash([6, 7]);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, this.params.radius * 1.5 * sw, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    // placed jars stack on the shelves below the active one
    for (let i = 0; i < this.placed && i < 12; i++) {
      const lvl = i % this.shelfFracs.length;
      const sp = this.toPx(this._shelfPos(lvl));
      const jx = sp.x - sw * 0.22 + (Math.floor(i / this.shelfFracs.length)) * sw * 0.15;
      this._jarShape(ctx, jx, sp.y - sw * 0.1, sw * 0.11, false);
    }
    // the live jar (on the table or in the hand)
    if (this.jar) {
      const jp = this.carrying ? this.t.palmPx(this.side, c) : this.toPx(this.jar);
      if (jp) this._jarShape(ctx, jp.x, jp.y + (this.carrying ? 20 : 0), sw * 0.14, this.carrying);
      if (!this.carrying) {
        const tp = this.toPx(this.jar);
        ctx.strokeStyle = "rgba(255,246,216,0.4)"; ctx.lineWidth = 2.5; ctx.setLineDash([6, 7]);
        ctx.beginPath(); ctx.arc(tp.x, tp.y, this.params.radius * 1.3 * sw, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  _jarShape(ctx, x, y, r, bright) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, bright ? "#ffe9b8" : "#d8b98a"); g.addColorStop(1, bright ? "#e8a86a" : "#a87848");
    ctx.fillStyle = g;
    ctx.shadowColor = "rgba(232,168,106,0.7)"; ctx.shadowBlur = bright ? 24 : 8;
    ctx.beginPath(); ctx.roundRect(x - r * 0.8, y - r, r * 1.6, r * 2, r * 0.4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(30,20,10,0.6)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x - r * 0.8, y - r, r * 1.6, r * 2, r * 0.4); ctx.stroke();
    ctx.fillStyle = "rgba(30,20,10,0.5)";
    ctx.fillRect(x - r * 0.5, y - r * 1.25, r, r * 0.35);
    ctx.restore();
  }
  extra() { return { jarsPlaced: this.placed, topShelfFrac: this.shelfFracs[this.level] }; }
}

/* ==================== G19 Light Every Window (scan-and-cancel) ==================== */
// Cancellation-scanning field: every window must be lit exactly once.
// With a visual-field flag set, spawns weight into the affected hemifield
// (scanning training) and each far-side window announces itself with a
// chime — per-hemifield latency is the round's clinical metric.
export class LightWindows extends GameBase {
  id = "windows";
  setup() {
    this.tips = {
      objective: "Light every dark window before dawn.",
      miss: "Sweep your eyes across the whole town, corner to corner.",
    };
    this.windows = [];
    this.lit = 0;
    this.latency = { left: [], right: [] };
    this._newTown();
    this.tellStory(STORIES.windows);
  }
  _newTown() {
    this.windows = [];
    // a row of houses across the reachable width; windows at two heights
    for (let i = 0; i < 8; i++) {
      const fx = -1 + (i + 0.5) / 4;                    // -1..1 across
      const th = Math.atan2(0.1, fx);
      const maxR = this.envAt(th) * this.params.rangeScale;
      const x = CENTER.x + fx * maxR * 0.95;
      const y = CENTER.y + (i % 2 ? 0.16 : -0.18) * maxR;
      const pos = { x, y };
      const px = this.toPx(pos);
      if (px.x < 60 || px.x > this.canvas.width - 60) continue;
      this.windows.push({ ...pos, lit: false, shown: performance.now(), announced: false });
    }
  }
  update(now, dt) {
    let dark = 0;
    for (const w of this.windows) {
      if (w.lit) continue;
      dark++;
      // hemifield chime: windows on the cut side call out once (audio S2 cue)
      if (!w.announced && A11Y.field !== "none") {
        const cutSide = A11Y.field;
        const onCut = cutSide === "left" ? w.x < CENTER.x : w.x > CENTER.x;
        if (onCut) { audio.serveTick(); w.announced = true; }
      }
      const prog = this.dwellProgress("w" + w.x.toFixed(2) + w.y.toFixed(2), this.handNear(w, this.params.radius * 1.2), now, 500);
      if (prog >= 1) {
        w.lit = true;
        this.lit++;
        const sideKey = w.x < CENTER.x ? "left" : "right";
        this.latency[sideKey].push((now - w.shown) / 1000);
        this.hit({ reachFrac: Math.abs(w.x - CENTER.x) });
        this.burst(w, "#ffd98a");
        this.clearDwell("w" + w.x.toFixed(2) + w.y.toFixed(2));
      }
    }
    if (!dark && this.windows.length) {
      this.say("The whole town is glowing. Here is the next street.");
      this._newTown();
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#191d3d"); g.addColorStop(0.75, "#232042"); g.addColorStop(1, "#141126");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const sw = this.sw();
    for (const w of this.windows) {
      const p = this.toPx(w);
      // the house behind the window
      ctx.fillStyle = "#100d1e";
      ctx.beginPath(); ctx.roundRect(p.x - sw * 0.17, p.y - sw * 0.2, sw * 0.34, sw * 0.42, 5); ctx.fill();
      // the window itself
      if (w.lit) {
        ctx.fillStyle = "#e8a86a";
        ctx.shadowColor = "#e8a86a"; ctx.shadowBlur = 18;
        ctx.fillRect(p.x - sw * 0.07, p.y - sw * 0.09, sw * 0.14, sw * 0.18);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "rgba(150,160,200,0.25)";
        ctx.fillRect(p.x - sw * 0.07, p.y - sw * 0.09, sw * 0.14, sw * 0.18);
        ctx.strokeStyle = `rgba(255,246,216,${0.3 + 0.25 * Math.sin(now / 600 + p.x)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - sw * 0.07, p.y - sw * 0.09, sw * 0.14, sw * 0.18);
      }
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() {
    const mean = a => a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null;
    return { windowsLit: this.lit, latencyLeft: mean(this.latency.left), latencyRight: mean(this.latency.right) };
  }
}

/* ==================== G20 Harbor Lights Sorting (cognitive-motor dual task) ==================== */
// A rule layer over reach-and-catch: only tonight's lanterns count, and the
// rule flips mid-round on a chime. Cognitive difficulty (rule flips) rides
// on top of motor difficulty — errors of commission are the metric.
export class HarborSorting extends GameBase {
  id = "sorting";
  setup() {
    this.tips = {
      objective: null,                       // set per rule below
      miss: "Check the lantern before you reach. There is always time.",
    };
    this.kinds = [
      { key: "amber", name: "round amber", hue: "#e8a86a", shape: "round" },
      { key: "teal", name: "long teal", hue: "#8fd0c8", shape: "tall" },
    ];
    this.rule = 0;
    this.lanterns = [];
    this.nextSpawn = 0;
    this.nextFlip = 0;
    this.commissions = 0;                    // caught the wrong lantern
    this.correct = 0;
    this._announceRule(true);
    this.tellStory(STORIES.sorting);
  }
  _announceRule(first) {
    const k = this.kinds[this.rule];
    this.tips.objective = `Catch only the ${k.name} lanterns tonight.`;
    if (!first) audio.point();
    this.say(this.tips.objective);
  }
  update(now, dt) {
    if (!this.nextFlip) this.nextFlip = now + 14000 + Math.random() * 6000;
    if (now > this.nextFlip) {
      this.rule = 1 - this.rule;
      this.nextFlip = now + 14000 + Math.random() * 6000;
      this._announceRule(false);
    }
    if (now > this.nextSpawn && this.lanterns.length < 3) {
      const kind = this.kinds[Math.random() < 0.55 ? this.rule : 1 - this.rule];
      this.lanterns.push({ ...this.samplePos(), kind, born: now, life: this.params.lifetime * 1600 });
      this.nextSpawn = now + 1100 + Math.random() * 900;
    }
    for (const l of this.lanterns) {
      const key = "l" + l.born;
      const prog = this.dwellProgress(key, this.handNear(l, this.params.radius), now, 600);
      if (prog >= 1) {
        l.gone = true;
        this.clearDwell(key);
        if (l.kind.key === this.kinds[this.rule].key) {
          this.correct++;
          this.hit(l, this.correct);
          this.burst(l, l.kind.hue);
        } else {
          this.commissions++;
          this.miss(l);
          this.say("Not that one tonight. " + this.tips.objective);
        }
        continue;
      }
      if (now - l.born > l.life) {
        l.gone = true;
        // letting a WRONG lantern pass is the right choice — quiet reward
        if (l.kind.key !== this.kinds[this.rule].key) { this.stats.stars += 2; }
        else this.miss(l, true);
      }
    }
    this.lanterns = this.lanterns.filter(l => !l.gone);
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#1d1f42"); g.addColorStop(1, "#101228");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    // tonight's rule, always visible as a shape on the mast (not color-only)
    const k = this.kinds[this.rule];
    const mx = c.width / 2, my = c.height * 0.09;
    ctx.strokeStyle = "rgba(244,236,221,0.5)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mx, my + 46); ctx.lineTo(mx, my - 8); ctx.stroke();
    this._lanternShape(ctx, mx, my + 14, 15, k, true);
  }
  draw(ctx, c, now) {
    for (const l of this.lanterns) {
      const p = this.toPx(l);
      const age = (now - l.born) / l.life;
      ctx.globalAlpha = age > 0.75 ? 1 - (age - 0.75) * 3 : 1;
      this._lanternShape(ctx, p.x, p.y, 17, l.kind, false);
      ctx.globalAlpha = 1;
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  _lanternShape(ctx, x, y, r, kind, mast) {
    ctx.save();
    ctx.shadowColor = kind.hue; ctx.shadowBlur = mast ? 22 : 14;
    ctx.fillStyle = kind.hue;
    ctx.beginPath();
    if (kind.shape === "round") ctx.ellipse(x, y, r, r, 0, 0, TAU);
    else ctx.roundRect(x - r * 0.55, y - r * 1.25, r * 1.1, r * 2.5, r * 0.5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath(); ctx.arc(x, y - (kind.shape === "round" ? 0 : r * 0.3), r * 0.35, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(20,16,40,0.7)"; ctx.lineWidth = 2;
    ctx.beginPath();
    if (kind.shape === "round") ctx.ellipse(x, y, r, r, 0, 0, TAU);
    else ctx.roundRect(x - r * 0.55, y - r * 1.25, r * 1.1, r * 2.5, r * 0.5);
    ctx.stroke();
    ctx.restore();
  }
  extra() { return { correctCatches: this.correct, wrongCatches: this.commissions }; }
}

/* ==================== G21 Teapot Turn (pronation/supination) ==================== */
// The hardest FMA-UE territory, absent from almost every camera suite:
// forearm rotation with the arm otherwise still. Palm up catches honey
// drops; palm down pours the tea. Uses tracker.palmFacing (self-calibrating
// 3-state with hysteresis).
export class TeapotTurn extends GameBase {
  id = "teapot";
  setup() {
    this.tips = {
      objective: "Turn your palm up for honey, palm down to pour.",
      miss: "Just the forearm turns, like turning a key.",
    };
    this.want = "up";
    this.holdMs = 0;
    this.turns = 0;
    this.noSignalSince = null;
    this.drop = null;
    this.tellStory(STORIES.teapot);
  }
  update(now, dt) {
    const facing = this.t.palmFacing(this.side);
    if (facing == null) {
      // hand model lost: coach the framing instead of failing silently
      this.noSignalSince ??= now;
      if (now - this.noSignalSince > 6000) {
        this.noSignalSince = now;
        this.say("Bring your hand a little closer to the camera.");
      }
      return;
    }
    this.noSignalSince = null;
    if (facing === this.want) {
      this.holdMs += dt;
      if (this.holdMs > 900) {                 // held the rotation: it counts
        this.turns++;
        this.hit({ reachFrac: 0.5 }, this.turns);
        const from = this.want;
        this.want = this.want === "up" ? "down" : "up";
        this.holdMs = 0;
        this.drop = { at: now, kind: from };   // little animation seed
        this.say(this.want === "up" ? "Now palm up, catch the honey." : "And palm down, pour the tea.");
      }
    } else this.holdMs = Math.max(0, this.holdMs - dt * 0.6);
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#2b2244"); g.addColorStop(1, "#191430");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const hp = this.t.palmPx(this.side, c);
    const sw = this.sw();
    const pulse = Math.sin(now / 400) * 0.5 + 0.5;
    // the ask, drawn as a big gentle arrow arc + icon (shape, not just words)
    const cx = c.width / 2, cy = c.height * 0.2;
    ctx.save();
    ctx.strokeStyle = `rgba(255,246,216,${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 7; ctx.lineCap = "round";
    const up = this.want === "up";
    ctx.beginPath();
    ctx.arc(cx, cy, 46, up ? Math.PI * 0.15 : Math.PI * 1.15, up ? Math.PI * 0.85 : Math.PI * 1.85, !up);
    ctx.stroke();
    // arrowhead
    const aA = up ? Math.PI * 0.85 : Math.PI * 1.85;
    const ax = cx + 46 * Math.cos(aA), ay = cy + 46 * Math.sin(aA);
    ctx.beginPath(); ctx.arc(ax, ay, 7, 0, TAU); ctx.fillStyle = "#fff6d8"; ctx.fill();
    ctx.restore();
    // rotation progress bowl/teapot at the hand
    if (hp) {
      const frac = Math.min(1, this.holdMs / 900);
      if (this.want === "up") {
        // bowl filling with honey drops
        ctx.strokeStyle = "#e8b98a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(hp.x, hp.y + 34, 26, 0, Math.PI); ctx.stroke();
        ctx.fillStyle = "rgba(232,168,106,0.8)";
        ctx.beginPath(); ctx.arc(hp.x, hp.y + 34, 24 * frac, 0, Math.PI); ctx.fill();
      } else {
        // teapot tipping, tea arc growing
        ctx.strokeStyle = "#9fc0c8"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(hp.x, hp.y + 30, 24, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = "rgba(143,208,200,0.85)"; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hp.x + 22, hp.y + 30);
        ctx.quadraticCurveTo(hp.x + 34, hp.y + 46, hp.x + 30, hp.y + 40 + 40 * frac);
        ctx.stroke();
      }
    }
    // celebration droplet after each completed turn
    if (this.drop && now - this.drop.at < 900) {
      const f = (now - this.drop.at) / 900;
      const dx = c.width / 2, dy = c.height * 0.32 + f * 60;
      ctx.globalAlpha = 1 - f;
      this.glow(ctx, dx, dy, 10, "#fff6d8", this.drop.kind === "up" ? "#e8a86a" : "#8fd0c8", 16);
      ctx.globalAlpha = 1;
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() { return { turns: this.turns }; }
}

/* ==================== G22 Firefly Glide (graded grasp control) ==================== */
// The continuous curl signal as an analog flight stick: squeeze gently and
// the firefly rises, relax and she sinks. Thread her between the reeds.
// An entry point below the suite's easiest difficulty — no reach needed.
export class FireflyGlide extends GameBase {
  id = "glide";
  setup() {
    this.tips = {
      objective: "Squeeze gently to rise, relax to sink.",
      miss: "Tiny squeezes. She answers the smallest movement.",
    };
    this.flyY = 0.5;                     // 0 bottom .. 1 top of the flight lane
    this.gaps = [];
    this.worldX = 0;
    this.nextGapX = 0.7;
    this.through = 0;
    this.brushes = 0;
    this.noSignalSince = null;
    this.tellStory(STORIES.glide);
  }
  _curl01() {
    // curl → 0..1 openness using the patient's own calibrated range
    const curl = this.t.handCurl(this.side);
    if (curl == null) return null;
    const cal = this.t.curlCal[this.side];
    if (!cal || cal.hi - cal.lo < 0.2) return null;
    return Math.max(0, Math.min(1, (curl - cal.lo) / (cal.hi - cal.lo)));
  }
  update(now, dt) {
    const open = this._curl01();
    if (open == null) {
      this.noSignalSince ??= now;
      if (now - this.noSignalSince > 6000) {
        this.noSignalSince = now;
        this.say("Show me your hand, nice and clear, then squeeze softly.");
      }
      return;
    }
    this.noSignalSince = null;
    const target = 1 - open;             // more squeeze = higher flight
    this.flyY += (target - this.flyY) * Math.min(1, dt / 260);

    const speed = 0.00008;
    this.worldX += speed * dt;
    if (this.worldX + 1.1 > this.nextGapX) {
      const gapHalf = Math.max(0.13, 0.24 - this.through * 0.01);
      this.gaps.push({ x: this.nextGapX, yc: 0.22 + Math.random() * 0.56, gapHalf, done: false });
      this.nextGapX += 0.42;
    }
    for (const gp of this.gaps) {
      const sx = gp.x - this.worldX;
      if (!gp.done && sx < 0.2) {
        gp.done = true;
        if (Math.abs(this.flyY - gp.yc) <= gp.gapHalf) {
          this.through++;
          this.hit({ reachFrac: 0.5 }, this.through);
        } else {
          this.brushes++;
          this.miss();                    // she brushes the reeds, feathers fly, no harm
        }
      }
    }
    this.gaps = this.gaps.filter(gp => gp.x - this.worldX > -0.2);
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#15243c"); g.addColorStop(1, "#0b1524");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    ctx.fillStyle = "rgba(14, 34, 30, 0.6)";
    ctx.fillRect(0, c.height * 0.9, c.width, c.height * 0.1);
  }
  draw(ctx, c, now) {
    const laneTop = c.height * 0.08, laneH = c.height * 0.8;
    // reed gates
    for (const gp of this.gaps) {
      const sx = gp.x - this.worldX;
      const px = c.width * (0.08 + sx * 0.88);
      if (px > c.width + 30) continue;
      const yTop = laneTop + (gp.yc - gp.gapHalf) * laneH;
      const yBot = laneTop + (gp.yc + gp.gapHalf) * laneH;
      ctx.strokeStyle = gp.done ? "rgba(110,140,110,0.4)" : "rgba(130,170,120,0.75)";
      ctx.lineWidth = 10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px, laneTop - 10); ctx.lineTo(px, yTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, yBot); ctx.lineTo(px, laneTop + laneH + 16); ctx.stroke();
      // seed heads
      for (const gy of [yTop, yBot]) {
        ctx.fillStyle = gp.done ? "rgba(160,180,150,0.4)" : "#b8c89a";
        ctx.beginPath(); ctx.ellipse(px, gy, 7, 13, 0, 0, TAU); ctx.fill();
      }
    }
    // the firefly at fixed x
    const fx = c.width * 0.2, fy = laneTop + this.flyY * laneH;
    const wob = Math.sin(now / 240) * 3;
    this.glow(ctx, fx, fy + wob, 12, "#fff6d8", "#cfe08a", 26);
    // wings
    ctx.strokeStyle = "rgba(255,246,216,0.5)"; ctx.lineWidth = 2.5;
    const wf = Math.sin(now / 70) * 8;
    ctx.beginPath(); ctx.moveTo(fx - 4, fy + wob - 4); ctx.quadraticCurveTo(fx - 16, fy + wob - 14 + wf, fx - 22, fy + wob - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx + 4, fy + wob - 4); ctx.quadraticCurveTo(fx + 16, fy + wob - 14 - wf, fx + 22, fy + wob - 4); ctx.stroke();
    // squeeze meter: a little vertical firefly ladder by the wrist side
    const open = this._curl01();
    if (open != null) {
      const mx = c.width * 0.06;
      ctx.strokeStyle = "rgba(244,236,221,0.25)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mx, c.height * 0.25); ctx.lineTo(mx, c.height * 0.75); ctx.stroke();
      const my = c.height * (0.75 - (1 - open) * 0.5);
      this.glow(ctx, mx, my, 7, "#fff6d8", "#cfe08a", 14);
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() { return { gatesThrough: this.through, reedBrushes: this.brushes }; }
}

/* ==================== G23 Night Blooms (aperture pre-shaping) ==================== */
// Reach-to-grasp coupling: the hand must ARRIVE already shaped — wide open
// for the big blooms, half-open for the small — then close at contact.
// Trains the transport-aperture link that stroke de-couples.
export class NightBlooms extends GameBase {
  id = "bloom";
  setup() {
    this.tips = {
      objective: "Shape your hand to the flower before you arrive.",
      miss: "Big flower, big open hand. Small flower, soft half-open.",
    };
    this.bloom = null;
    this.gathered = 0;
    this.wasClosed = false;
    this._newBloom();
    this.tellStory(STORIES.bloom);
  }
  _newBloom() {
    const big = Math.random() < 0.5;
    this.bloom = { ...this.samplePos(), big, born: performance.now(), state: "waiting" };
  }
  _aperture() {
    const curl = this.t.handCurl(this.side);
    const cal = this.t.curlCal[this.side];
    if (curl == null || !cal || cal.hi - cal.lo < 0.2) return null;
    return Math.max(0, Math.min(1, (curl - cal.lo) / (cal.hi - cal.lo)));   // 1 = wide open
  }
  update(now, dt) {
    if (!this.bloom) return;
    const b = this.bloom;
    const near = this.handNear(b, this.params.radius * 1.3);
    const ap = this._aperture();
    const closed = this.t.handClosed(this.side);
    const edge = closed && !this.wasClosed;
    this.wasClosed = closed;

    if (b.state === "waiting" && near) {
      // arrival check: was the hand pre-shaped correctly?
      const wantOpen = b.big ? 0.75 : 0.35;
      const tol = 0.28;
      b.state = ap != null && Math.abs(ap - wantOpen) < tol ? "shaped" : "wrongshape";
      b.arrivedAt = now;
      if (b.state === "wrongshape") {
        this.say(b.big ? "This one is big. Open your hand wide first." : "A little one. Just half open.");
      }
    }
    if (b.state === "wrongshape" && !near) b.state = "waiting";   // back out, try again
    if (b.state === "shaped") {
      if (!near) { b.state = "waiting"; return; }
      if (edge) {
        this.gathered++;
        this.hit(b, this.gathered);
        this.burst(b, b.big ? "#dba0b0" : "#cfe08a");
        this._newBloom();
        return;
      }
    }
    if (now - b.born > this.params.lifetime * 2200) {
      this.miss(b);
      this._newBloom();
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#1e1b3f"); g.addColorStop(1, "#121022");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }
  draw(ctx, c, now) {
    const b = this.bloom;
    if (!b) return;
    const p = this.toPx(b);
    const R = (b.big ? 34 : 17) + Math.sin(now / 500) * 2;
    // petals
    ctx.save();
    ctx.translate(p.x, p.y);
    for (let i = 0; i < (b.big ? 8 : 5); i++) {
      ctx.rotate(TAU / (b.big ? 8 : 5));
      ctx.fillStyle = b.state === "shaped" ? "rgba(159,192,138,0.85)" : (b.big ? "rgba(219,160,176,0.8)" : "rgba(207,224,138,0.8)");
      ctx.beginPath(); ctx.ellipse(R * 0.8, 0, R * 0.55, R * 0.3, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath(); ctx.arc(0, 0, R * 0.35, 0, TAU); ctx.fill();
    ctx.restore();
    // shape hint by the flower: a ring showing the wanted hand openness
    const hintR = b.big ? 26 : 13;
    ctx.strokeStyle = "rgba(255,246,216,0.55)"; ctx.lineWidth = 3;
    ctx.setLineDash(b.big ? [] : [5, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y - R - 26, hintR, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // live aperture ring at the cursor: match the hint to succeed
    const ap = this._aperture();
    const hp = this.t.palmPx(this.side, c);
    if (ap != null && hp) {
      ctx.strokeStyle = b.state === "shaped" ? "#9fc08a" : "rgba(232,168,106,0.8)";
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 8 + ap * 26, 0, TAU); ctx.stroke();
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() { return { bloomsGathered: this.gathered }; }
}

/* ==================== G24 Firefly Pinch (pincer precision) ==================== */
// ARAT's pinch subscale: catch fireflies with thumb and index only — a
// whole-fist squeeze scares them away, explicitly dissociating pincer from
// mass grasp. Prototype-grade: needs the hand close enough to the camera.
export class FireflyPinch extends GameBase {
  id = "pinch";
  setup() {
    this.tips = {
      objective: "Catch the firefly with just two fingertips.",
      miss: "Thumb and pointer only, soft as picking a berry.",
    };
    this.fly = null;
    this.caught = 0;
    this.scared = 0;
    this.wasPinch = false;
    this.wasFist = false;
    this.noSignalSince = null;
    this._newFly();
    this.tellStory(STORIES.pinch);
  }
  _newFly() {
    this.fly = { ...this.samplePos(), born: performance.now(), jx: Math.random() * 10 };
  }
  update(now, dt) {
    if (!this.fly) return;
    const f = this.fly;
    // firefly meanders gently
    f.x += Math.sin(now / 900 + f.jx) * 0.00003 * dt;
    f.y += Math.cos(now / 1100 + f.jx) * 0.00003 * dt;

    if (this.t._handPts(this.side) == null) {
      this.noSignalSince ??= now;
      if (now - this.noSignalSince > 6000) {
        this.noSignalSince = now;
        this.say("Bring your hand a little closer, so I can see your fingers.");
      }
      return;
    }
    this.noSignalSince = null;

    const near = this.handNear(f, this.params.radius * 1.2);
    const pinch = this.t.pinchOnly(this.side);
    const pinchEdge = pinch && !this.wasPinch;
    this.wasPinch = pinch;
    const fist = this.t.handClosed(this.side) && !pinch;
    const fistEdge = fist && !this.wasFist;
    this.wasFist = fist;

    if (near && pinchEdge) {
      this.caught++;
      this.hit(f, this.caught);
      this.burst(f, "#cfe08a");
      this._newFly();
      return;
    }
    if (near && fistEdge) {
      // the whole fist startles her — she darts to a new spot (soft teaching moment)
      this.scared++;
      this.miss(f, true);
      audio.whoosh();
      this.say(this.tips.miss);
      this._newFly();
      return;
    }
    if (now - f.born > this.params.lifetime * 2600) {
      this.miss(f);
      this._newFly();
    }
  }
  drawBg(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "#14202c"); g.addColorStop(1, "#0a121c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
    ctx.fillStyle = "rgba(20, 40, 30, 0.5)";
    ctx.fillRect(0, c.height * 0.88, c.width, c.height * 0.12);
  }
  draw(ctx, c, now) {
    const f = this.fly;
    if (!f) return;
    const p = this.toPx(f);
    const blink = 0.5 + 0.5 * Math.sin(now / 300 + f.jx);
    this.glow(ctx, p.x, p.y, 8 + blink * 6, "#fff6d8", "#cfe08a", 22);
    ctx.strokeStyle = "rgba(255,246,216,0.35)"; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, this.params.radius * 1.2 * this.sw(), 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // pinch meter: two dots that meet as thumb and index come together
    const gap = this.t.pinch(this.side);
    const hp = this.t.palmPx(this.side, c);
    if (gap != null && hp) {
      const d = Math.min(40, gap * 46);
      ctx.fillStyle = "#fff2c2";
      ctx.beginPath(); ctx.arc(hp.x - d / 2, hp.y - 34, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(hp.x + d / 2, hp.y - 34, 5, 0, TAU); ctx.fill();
    }
    this.drawTimerWhisper(ctx, c, now);
  }
  extra() { return { pinched: this.caught, fistScares: this.scared }; }
}

/* ==================== G25 Rainbow Crossing — the road to Strivealon ==================== */
// Walk the rainbow road (the hero follows your hand along the arc). Dark
// clouds block the way: WHOOSH them off with an outward forearm sweep
// (shoulder external rotation — elbow stays planted, or the sweep resets).
// Friends from the Quirky Crew are stuck on the road too: SAVE them with a
// gentle squeeze (or a steady hold, for hands that can't close yet) — never
// whoosh a friend! Reach the chest for the jackpot, then cross back the other
// way. Flat daylight cartoon look (ink on cream, high contrast, no
// glow-dependent cues) for visual accessibility. Round 1 opens with a
// skippable learn-by-doing tutorial.
const RAINBOW_STRIPES = ["#e8837a", "#e8a86a", "#ecd06f", "#9fc08a", "#a4b6e0"];
const INK = "#1b1b3a";
const FRIEND_KINDS = ["scribble", "stack"];
export class RainbowCrossing extends GameBase {
  id = "rainbow";
  setup() {
    this.roundSeconds = this.opts.tellStory ? 75 : 60;
    this.needDeg = 32;                  // outward sweep (deg) that whooshes a cloud
    this.saveHold = 1500;               // dwell fallback (ms) for saving friends
    this.cloudsPushed = 0; this.friendsSaved = 0; this.jackpots = 0;
    this.skyStars = 0;
    this.tips = { miss: "Keep your elbow by your side and sweep your hand outward, like brushing crumbs away." };
    this.path = this._buildPath();
    this.tut = this.opts.tellStory ? { step: 0, said: -1, skipDwell: null } : null;
    this._newCrossing(true);
    if (!this.tut) {
      this._prompt("Cross the rainbow", "Whoosh the clouds off. Squeeze to save your friends");
      setTimeout(() => this._prompt(""), 3400);
    }
  }
  extra() { return { cloudsPushed: this.cloudsPushed, friendsSaved: this.friendsSaved, jackpots: this.jackpots }; }

  // low on the opposite side, arching over the top to high on the trained
  // side — always inside rangeScale × envelope, clamped on-screen
  _buildPath() {
    const N = 48, a0 = 205, a1 = 55, M = 90, c = this.canvas;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let ad = a0 + (a1 - a0) * t;
      if (this.side === "left") ad = 180 - ad;
      const th = deg(ad);
      const r = (0.68 + 0.1 * Math.sin(t * Math.PI)) * this.params.rangeScale * this.envAt(th);
      const px = this.toPx(fromCenter(th, r));
      px.x = Math.min(Math.max(px.x, M), c.width - M);
      px.y = Math.min(Math.max(px.y, M), c.height - M);
      pts.push({ ...this.t.pxToRel(px, c), reachFrac: 0.72, isFar: false });
    }
    return pts;
  }

  _newCrossing(first) {
    if (!first) this.path.reverse();    // walk back across; the chest waits at the far end
    this.pos = 0;
    this.crew = [];
    const N = this.path.length - 1;
    let kinds, spots;
    if (this.tut) {                     // tutorial: cloud → friend → cloud, evenly spread
      kinds = ["cloud", "friend", "cloud"];
      spots = [0.3, 0.55, 0.78];
    } else {
      kinds = ["cloud", "cloud", "cloud", "friend"];
      const j = 1 + Math.floor(Math.random() * 3);   // friend anywhere but never first
      [kinds[3], kinds[j]] = [kinds[j], kinds[3]];
      spots = [0.28, 0.46, 0.64, 0.82].map(f => f + (Math.random() - 0.5) * 0.05);
    }
    this.ents = kinds.map((kind, i) => ({
      kind, friend: kind === "friend" ? pick(FRIEND_KINDS) : null,
      idx: Math.round(spots[i] * N),
      state: "blocking", born: null, need: this.needDeg, hold: this.saveHold,
      dwell: null, armed: false, gauge: 0, ph: Math.random() * TAU,
    }));
  }

  // outward forearm sweep, degrees, since the most-inward recent position.
  // The elbow must stay planted (true rotation, not a whole-arm swing).
  _updateSweep() {
    const e = this.t.elbow(this.side), w = this.t.wrist(this.side);
    if (!e?.ok || !w?.ok) { this.sweep = null; return 0; }
    const out = this.side === "right" ? 1 : -1;
    const a = Math.atan2(-(w.y - e.y), out * (w.x - e.x)) * 180 / Math.PI;
    if (a < -70 || a > 165) { this.sweep = null; return 0; }   // arm hanging / off-plane
    const sw = this.t.frame.sw;
    const ex = e.x / sw, ey = e.y / sw;
    if (!this.sweep || a > this.sweep.refA) { this.sweep = { refA: a, ex, ey }; return 0; }
    if (Math.hypot(ex - this.sweep.ex, ey - this.sweep.ey) > 0.4) { this.sweep = { refA: a, ex, ey }; return 0; }
    this.sweep.refA += (a - this.sweep.refA) * 0.004;   // slowly forget old inward reference
    return this.sweep.refA - a;
  }

  _pt(f) {
    const i = Math.max(0, Math.min(this.path.length - 1, f));
    const i0 = Math.floor(i), i1 = Math.min(this.path.length - 1, i0 + 1), w = i - i0;
    const a = this.path[i0], b = this.path[i1];
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  }

  _push(e, now) {
    e.state = "falling"; e.fall = now; e.gauge = 0;
    this.sweep = null;
    this.cloudsPushed++;
    this.hit(this.path[e.idx], this.cloudsPushed + this.friendsSaved);
    this.burst(this.path[e.idx], "#a4b6e0");
    if (this.tut?.step === 1) this.tut.step = 2;
  }
  _save(e, now) {
    e.state = "saved"; e.gauge = 0;
    this.friendsSaved++;
    this.crew.push(e.friend);
    this.hit(this.path[e.idx], this.cloudsPushed + this.friendsSaved);
    this.burst(this.path[e.idx], "#ecd06f");
    this.say("Saved! They will walk with you.");
    if (this.tut?.step === 2) {
      this.tut.step = 3;
      setTimeout(() => { if (this.active && this.tut) this._prompt(""); }, 3600);
    }
  }

  update(now, dt) {
    const N = this.path.length - 1;

    // jackpot celebration, then flip the crossing
    if (this.celebrate) {
      if (now > this.celebrate) { this.celebrate = null; this._newCrossing(false); }
      return;
    }

    const ent = this.ents.find(e => e.state === "blocking");
    const cap = ent ? Math.max(0, ent.idx - 2) : N;

    // walking: the hero follows the hand along the road
    this.moving = false;
    const h = this.t.palmRel(this.side) || this.t.handRel(this.side);
    if (h) {
      const corridor = Math.max(this.params.radius * 1.35, 0.34);
      let best = -1, bd = corridor;
      const from = Math.max(0, Math.floor(this.pos) - 2);
      const to = Math.min(cap, Math.floor(this.pos) + 14);
      for (let i = from; i <= to; i++) {
        const d = Math.hypot(h.x - this.path[i].x, h.y - this.path[i].y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best > this.pos) {
        this.pos = Math.min(best, this.pos + 20 * dt / 1000, cap);
        this.moving = true;
        if (this.tut?.step === 0 && this.pos > 6) this.tut.step = 1;
      }
    }

    // engaged with the blocker?
    this.engaged = ent && this.pos >= cap - 1.5 ? ent : null;
    if (this.engaged) {
      const e = this.engaged, p = this.path[e.idx];
      e.born ??= now;
      const swept = this._updateSweep();
      if (e.kind === "cloud") {
        e.gauge = Math.min(1, swept / e.need);
        if (swept >= e.need) this._push(e, now);
        else if (now - e.born > 8000 + this.params.lifetime * 2000) {
          this.miss(p);
          e.need = Math.max(15, e.need * 0.65);   // gets easier, never impossible
          e.born = now;
        }
      } else {
        // friend: arrive open, squeeze to save — steady hold works too
        const near = this.handNear(p, this.params.radius * 1.3);
        const closed = this.t.handClosed(this.side);
        if (near && !closed) e.armed = true;
        if (near && closed && e.armed) this._save(e, now);
        else if (near) {
          e.dwell ??= now;
          e.gauge = Math.min(1, (now - e.dwell) / e.hold);
          if (now - e.dwell > e.hold) this._save(e, now);
        } else { e.dwell = null; e.gauge = 0; }
        // whooshing a friend: kind correction, no penalty
        if (e.state === "blocking" && swept >= e.need) {
          this.sweep = null;
          e.wobble = now;
          this.say("Oh, that's a friend! Squeeze gently to save them.");
        }
        if (e.state === "blocking" && now - e.born > 10000 + this.params.lifetime * 2000) {
          this.miss(p);
          e.hold = Math.max(800, e.hold * 0.7);
          e.born = now;
          this.say("Hold your hand on your friend, nice and steady.");
        }
      }
    } else this.sweep = null;

    for (const e of this.ents) if (e.state === "falling" && now - e.fall > 1400) e.state = "gone";

    // jackpot!
    if (!ent && this.pos >= N - 0.5) {
      this.jackpots++;
      this.stats.stars += 25 + this.crew.length * 10;
      this.skyStars = Math.min(9, this.skyStars + 1 + this.crew.length);
      audio.fanfare();
      this.burst(this.path[N], "#ecd06f");
      this.celebrate = now + 2000;
      if (this.tut) { this.tut = null; this._prompt(""); }
      this.say(this.crew.length ? "Jackpot! And your friends are safe!" : "Jackpot! Wonderful crossing!");
      return;
    }

    this._tutTick(now);
  }

  _tutTick(now) {
    if (!this.tut) return;
    const c = this.canvas;
    // skip pill (top corner opposite the trained arm's start): hover to skip
    const hp = this.t.palmPx(this.side, c);
    const sx = c.width - 115, sy = 62;
    if (hp && Math.hypot(hp.x - sx, hp.y - sy) < 62) {
      this.tut.skipDwell ??= now;
      if (now - this.tut.skipDwell > 1200) {
        this.tut = null;
        this._prompt("");
        this.say("Alright, off you go!");
        return;
      }
    } else this.tut.skipDwell = null;
    const LINES = {
      0: ["Move your hand along the rainbow", "Your little friend walks where your hand leads"],
      1: ["A dark cloud blocks the road!", "Elbow by your side, sweep your hand outward. Whoosh!"],
      2: ["A friend is stuck on the road", "Reach to them and squeeze gently. Or just hold your hand on them"],
      3: ["You have it!", "Walk on to the treasure chest"],
    };
    if (this.tut.said !== this.tut.step) {
      this.tut.said = this.tut.step;
      const [a, b] = LINES[this.tut.step];
      this._prompt(a, b);
      this._speak(a + ". " + b + ".");
    }
  }

  drawBg(ctx, c, now) {
    ctx.fillStyle = "#f2ecdc";
    ctx.fillRect(0, 0, c.width, c.height);
    // sun peeking behind a soft cloud
    const sx = c.width * 0.16, sy = c.height * 0.13;
    ctx.fillStyle = "#ecd06f";
    ctx.beginPath(); ctx.arc(sx + 42, sy - 14, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fdfaf2";
    for (const [dx, r] of [[-32, 22], [0, 30], [34, 24]]) { ctx.beginPath(); ctx.arc(sx + dx, sy + 8, r, 0, TAU); ctx.fill(); }
    // stars returned to the Strivealon sky — one per jackpot, plus saved friends
    for (let i = 0; i < this.skyStars; i++) {
      const fx = 0.1 + (i * 0.61) % 0.8, fy = 0.05 + (i * 0.37) % 0.16;
      ctx.globalAlpha = 0.7 + Math.sin(now / 600 + i) * 0.3;
      starShape(ctx, c.width * fx, c.height * fy, 9, "#e8a86a");
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx, c, now) {
    const sw = this.sw();
    const pts = this.path.map(p => this.toPx(p));
    const nrm = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      return { x: -dy / L, y: dx / L };
    });
    // rainbow band: ink outline, then five flat stripes
    const bw = Math.max(46, sw * 0.3);
    const band = (off, w, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = p.x + nrm[i].x * off, y = p.y + nrm[i].y * off;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    };
    band(0, bw + 7, INK);
    const s5 = bw / 5;
    RAINBOW_STRIPES.forEach((col, k) => band((k - 2) * s5, s5 + 1.5, col));

    // treasure chest at the far end
    const end = pts[pts.length - 1];
    const open = !!this.celebrate || (!this.ents.some(e => e.state === "blocking") && this.pos > this.path.length - 6);
    chestShape(ctx, end.x, end.y - bw * 0.75, Math.max(56, sw * 0.34), open, now);

    // clouds falling off, behind everything else
    const out = this.side === "right" ? 1 : -1;
    for (const e of this.ents) {
      if (e.state !== "falling") continue;
      const p = pts[e.idx], t = (now - e.fall) / 1400;
      if (t >= 1) continue;
      cloudShape(ctx, p.x + out * 90 * t, p.y + t * t * c.height * 0.4, Math.max(40, sw * 0.22), 1 - t, out * t * 2.2);
      // whoosh trails
      ctx.strokeStyle = `rgba(27,27,58,${0.4 * (1 - t)})`;
      ctx.lineWidth = 3; ctx.lineCap = "round";
      for (const dy of [-14, 2, 18]) {
        ctx.beginPath();
        ctx.moveTo(p.x - out * 30, p.y + dy);
        ctx.quadraticCurveTo(p.x + out * 20 * t * 4, p.y + dy - 6, p.x + out * (30 + 60 * t), p.y + dy + 10 * t);
        ctx.stroke();
      }
    }

    // rescued crew trailing behind the hero
    this.crew.forEach((kind, i) => {
      const p = this.toPx(this._pt(this.pos - 3.2 * (i + 1)));
      friendShape(ctx, kind, p.x, p.y - bw * 0.55, Math.max(30, sw * 0.16), Math.sin(now / 240 + i) * 3);
    });
    // the hero
    const tp = this.toPx(this._pt(this.pos));
    puzzleShape(ctx, tp.x, tp.y - bw * 0.6, Math.max(38, sw * 0.2), this.moving ? Math.sin(now / 140) * 4 : Math.sin(now / 700) * 1.5);

    // blockers on the road
    for (const e of this.ents) {
      if (e.state !== "blocking") continue;
      const p = pts[e.idx];
      const bob = Math.sin(now / 520 + e.ph) * 4;
      const wob = e.wobble && now - e.wobble < 500 ? Math.sin((now - e.wobble) / 40) * 5 : 0;
      const es = Math.max(40, sw * 0.22);
      if (e.kind === "cloud") cloudShape(ctx, p.x + wob, p.y - bw * 0.55 + bob, es, 1, 0);
      else friendShape(ctx, e.friend, p.x + wob, p.y - bw * 0.55 + bob, es * 0.85, bob * 0.4);

      if (this.engaged === e) {
        const ringR = es * 0.95;
        const hint = (text) => {
          ctx.fillStyle = "rgba(27,27,58,0.85)";
          ctx.font = `800 ${Math.round(c.height * 0.028)}px Nunito, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(text, p.x, p.y - bw * 0.55 - ringR - 16);
        };
        // progress ring: sweep gauge (cloud) or squeeze-hold gauge (friend)
        if (e.gauge > 0) {
          ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 7; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(p.x, p.y - bw * 0.55, ringR, -Math.PI / 2, -Math.PI / 2 + TAU * e.gauge); ctx.stroke();
        }
        if (e.kind === "cloud") {
          hint("Sweep outward to whoosh ✋");
          // animated outward arc: a dot rides from the top of the cloud out
          // and away, showing the whoosh gesture
          const cy = p.y - bw * 0.55;
          const ar = es * 1.55, a0 = -Math.PI / 2, a1 = a0 + out * 1.6;
          ctx.strokeStyle = "rgba(27,27,58,0.5)"; ctx.lineWidth = 4; ctx.setLineDash([6, 8]);
          ctx.beginPath(); ctx.arc(p.x, cy, ar, a0, a1, out < 0); ctx.stroke();
          ctx.setLineDash([]);
          const f = (now % 1300) / 1300;
          const ad = a0 + out * 1.6 * f;
          ctx.fillStyle = "rgba(27,27,58,0.75)";
          ctx.beginPath(); ctx.arc(p.x + Math.cos(ad) * ar, cy + Math.sin(ad) * ar, 6 + 3 * Math.sin(f * Math.PI), 0, TAU); ctx.fill();
        } else {
          const closed = this.t.handClosed(this.side);
          const near = this.handNear(this.path[e.idx], this.params.radius * 1.3);
          if (near && closed && !e.armed) hint("Open your hand first ✋");
          else hint(this.tut ? "Squeeze gently to save ✊" : "Squeeze to save ✊");
        }
      }
    }

    // tutorial extras: guide dots ahead of the hero + the skip pill
    if (this.tut) {
      if (this.tut.step === 0) {
        for (let k = 0; k < 3; k++) {
          const g = this.toPx(this._pt(this.pos + 3 + k * 3 + ((now / 260) % 3)));
          ctx.globalAlpha = 0.55 - k * 0.14;
          ctx.fillStyle = INK;
          ctx.beginPath(); ctx.arc(g.x, g.y, 7, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const sx = c.width - 115, sy = 62;
      ctx.fillStyle = "rgba(253,250,242,0.9)";
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(sx - 75, sy - 26, 150, 52, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `800 ${Math.round(c.height * 0.03)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Skip ✋", sx, sy + 9);
      if (this.tut.skipDwell) {
        const f = Math.min(1, (now - this.tut.skipDwell) / 1200);
        ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy, 36, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }

    if (this.celebrate) {
      ctx.fillStyle = `rgba(27,27,58,${Math.min(1, (this.celebrate - now) / 2000 + 0.3)})`;
      ctx.font = `800 ${Math.round(c.height * 0.07)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Jackpot! ✦", c.width / 2, c.height * 0.2);
    }

    // timer whisper, ink flavored for the daylight scene
    const f = 1 - this.elapsed(now) / this.roundSeconds;
    ctx.strokeStyle = "rgba(27,27,58,0.22)";
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c.width * (0.5 - 0.4 * f), 10);
    ctx.lineTo(c.width * (0.5 + 0.4 * f), 10);
    ctx.stroke();
  }

  // flat ink-on-cream arm + cursor (the engine default is tuned for night scenes)
  _drawArmAndCursor(ctx, c, now) {
    const side = this.side;
    const sh = this.t.shoulder(side), el = this.t.elbow(side), wr = this.t.wrist(side);
    const P = pt => this.t._videoToPx(pt.x, pt.y, c);
    ctx.save();
    ctx.lineCap = "round";
    if (sh && el?.ok && wr?.ok) {
      const ps = P(sh), pe = P(el), pw = P(wr);
      ctx.strokeStyle = "rgba(27,27,58,0.16)"; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
      ctx.strokeStyle = "rgba(27,27,58,0.5)"; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
    }
    // real hand skeleton when available (amber/sage reads fine on cream);
    // otherwise a flat wrist→palm line + disc
    const handDrawn = drawHand(ctx, c, this.t, side, { fallback: false });
    if (!handDrawn) {
      const pm = this.t.palm(side);
      if (wr?.ok && pm) {
        const pw = P(wr), pp = P(pm);
        ctx.strokeStyle = "rgba(27,27,58,0.5)"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(pw.x, pw.y); ctx.lineTo(pp.x, pp.y); ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 7, 0, TAU);
        if (this.t.handClosed(side)) { ctx.fillStyle = "#e8a86a"; ctx.fill(); } else ctx.stroke();
      }
    }
    const hp = this.t.palmPx(side, c);   // cursor rides the palm center
    if (hp) {
      ctx.strokeStyle = "rgba(27,27,58,0.28)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, this.params.radius * this.sw(), 0, TAU); ctx.stroke();
      if (!handDrawn) {
        ctx.fillStyle = "#e8a86a";
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, TAU); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
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
/* ---- Rainbow Crossing cast (flat cartoon, ink outlines) ---- */
function cloudShape(ctx, x, y, s, alpha = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
  ctx.fillStyle = "#23234a";
  for (const [dx, dy, r] of [[-s * 0.5, 0.04 * s, s * 0.42], [0, -s * 0.28, s * 0.5], [s * 0.5, 0.04 * s, s * 0.42], [0, s * 0.2, s * 0.46]]) {
    ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill();
  }
  // sad eyes, frown, one tear
  ctx.fillStyle = "#f2ecdc";
  ctx.beginPath(); ctx.ellipse(-s * 0.22, -s * 0.08, s * 0.13, s * 0.16, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.22, -s * 0.08, s * 0.13, s * 0.16, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#3a5a9a";
  ctx.beginPath(); ctx.arc(-s * 0.22, -s * 0.03, s * 0.07, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.03, s * 0.07, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#f2ecdc"; ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, s * 0.46, s * 0.2, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  ctx.fillStyle = "#7ab0d8";
  ctx.beginPath(); ctx.arc(s * 0.36, s * 0.18, s * 0.08, 0, TAU); ctx.fill();
  ctx.restore();
}
function faceDots(ctx, s, dy) {
  ctx.fillStyle = "#fdfaf2";
  ctx.beginPath(); ctx.arc(-s * 0.16, dy, s * 0.11, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.16, dy, s * 0.11, 0, TAU); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-s * 0.16, dy, s * 0.05, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.16, dy, s * 0.05, 0, TAU); ctx.fill();
}
function faceSmile(ctx, s, dy) {
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, dy, s * 0.14, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
}
function puzzleShape(ctx, x, y, s, bob = 0) {
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = "#ecc94b"; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.beginPath(); ctx.arc(0, -s * 0.6, s * 0.18, 0, TAU); ctx.fill(); ctx.stroke();   // knob
  ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.18); ctx.fill();
  ctx.stroke();
  faceDots(ctx, s, -s * 0.08);
  faceSmile(ctx, s, s * 0.14);
  ctx.restore();
}
function friendShape(ctx, kind, x, y, s, bob = 0) {
  ctx.save();
  ctx.translate(x, y + bob);
  if (kind === "scribble") {
    ctx.fillStyle = "#e8827a";
    ctx.beginPath(); ctx.arc(0, 0, s * 0.52, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#c4574e"; ctx.lineWidth = Math.max(1.5, s * 0.05);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, s * (0.18 + i * 0.13), i, i + 4.6); ctx.stroke(); }
    faceDots(ctx, s, -s * 0.06);
    faceSmile(ctx, s, s * 0.16);
  } else {
    const blob = (dy, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, dy, rx, ry, 0, 0, TAU); ctx.fill(); };
    blob(s * 0.3, s * 0.5, s * 0.24, "#9fc08a");
    blob(0, s * 0.4, s * 0.2, "#7aa8c8");
    blob(-s * 0.3, s * 0.3, s * 0.22, "#e8827a");
    ctx.fillStyle = "#fdfaf2"; ctx.beginPath(); ctx.arc(0, -s * 0.32, s * 0.14, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, -s * 0.32, s * 0.06, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, s * 0.3, s * 0.16, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  }
  ctx.restore();
}
function chestShape(ctx, x, y, s, open, now) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.06);
  if (open) {   // lid tipped back, gold spilling out
    ctx.fillStyle = "#23234a";
    ctx.beginPath(); ctx.roundRect(-s * 0.58, -s * 0.72, s * 1.16, s * 0.3, s * 0.08); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ecd06f";
    for (const [dx, dy, r] of [[-s * 0.28, -s * 0.32, s * 0.13], [0, -s * 0.4, s * 0.15], [s * 0.28, -s * 0.32, s * 0.13]]) {
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill(); ctx.stroke();
    }
    starShape(ctx, 0, -s * (0.85 + 0.06 * Math.sin(now / 300)), s * 0.2, "#ecd06f");
  } else {
    ctx.fillStyle = "#23234a";
    ctx.beginPath(); ctx.roundRect(-s * 0.55, -s * 0.5, s * 1.1, s * 0.3, s * 0.08); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = "#fdfaf2";
  ctx.beginPath(); ctx.roundRect(-s / 2, -s * 0.24, s, s * 0.54, s * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;   // keyhole
  ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.07, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.04, -s * 0.02); ctx.lineTo(s * 0.04, -s * 0.02); ctx.lineTo(0, s * 0.12); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function crateShape(ctx, x, y, s, bright) {
  ctx.save();
  // vivid green blocks (like the physical BBT's colored blocks): high
  // saturation + a dark outline stays visible on ANY camera background,
  // bright room or dark — the carried block glows brighter still
  const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
  g.addColorStop(0, bright ? "#8ef07e" : "#5ed455"); g.addColorStop(1, bright ? "#3dbb45" : "#2e9e38");
  ctx.fillStyle = g;
  ctx.shadowColor = bright ? "rgba(120,240,110,0.95)" : "rgba(70,200,80,0.7)";
  ctx.shadowBlur = bright ? 30 : 16;
  ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, 6); ctx.fill();
  ctx.shadowBlur = 0;
  // dark outline + light top edge for contrast in both directions
  ctx.strokeStyle = "rgba(15, 40, 20, 0.85)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, 6); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - s / 2 + 5, y - s / 2 + 3); ctx.lineTo(x + s / 2 - 5, y - s / 2 + 3); ctx.stroke();
  ctx.restore();
}

// Focused set for now: Harbor Crates + Arc Pong + Echo Reach (plus the
// circle assessment). The originals stay implemented but hidden via
// `disabled`. The Aug 2026 additions (research pass in GAME_IDEAS.md) ship
// enabled for review — flip `disabled: true` to curate the patient menu.
// `trains` = the one movement the game trains, shown on its card so
// therapists can prescribe by movement (MindMotion labeling pattern).
export const GAMES = [
  { id: "constellations", name: "Constellations", cls: Constellations, disabled: true, trains: "Guided reaching" },
  { id: "drift", name: "Drift", cls: Drift, disabled: true, trains: "Interception" },
  { id: "ember", name: "Ember Watch", cls: EmberWatch, disabled: true, trains: "Reach and hold" },
  { id: "lantern", name: "Lantern Release", cls: LanternRelease, disabled: true, trains: "Carry and release" },
  { id: "pong", name: "Arc Pong", cls: ArcPong, trains: "Continuous control" },
  { id: "rhythm", name: "Melody Tiles", cls: MelodyTiles, disabled: true, trains: "Timed reaching" },
  { id: "boxes", name: "Harbor Crates", cls: HarborCrates, disabled: true, trains: "Grasp and carry" },
  { id: "compass", name: "Compass Rose", cls: CompassRose, disabled: true, trains: "Center-out reach" },
  { id: "echo", name: "Echo Reach", cls: EchoReach, disabled: true, trains: "Position sense" },
  // --- Aug 2026 additions: Tier 1 (no new tracking needed) ---
  { id: "lens", name: "Scratch Cards", cls: LighthouseLens, trains: "Sweeping coverage" },
  { id: "dots", name: "Connect the Dots", cls: ConnectDots, trains: "Point-to-point reach" },
  { id: "rgs", name: "Catch Together", cls: CatchTogether, trains: "Both arms together" },
  { id: "sling", name: "Cloud Slingshot", cls: CloudSlingshot, trains: "Pull, hold and release" },
  { id: "crane", name: "Crane Keeper", cls: CraneKeeper, disabled: true, trains: "Hold high + squeeze" },
  { id: "feather", name: "Feather Lantern", cls: FeatherLantern, disabled: true, trains: "Slow lowering" },
  { id: "buoys", name: "Two Lights", cls: TwoLights, disabled: true, trains: "Speed and accuracy" },
  { id: "oars", name: "Ferry Oars", cls: FerryOars, disabled: true, trains: "Both arms together" },
  { id: "ferry", name: "Night Ferry", cls: NightFerry, disabled: true, trains: "Steering control" },
  { id: "stars", name: "Falling Stars", cls: FallingStars, disabled: true, trains: "Quick sweeps" },
  { id: "flare", name: "Signal Flare", cls: SignalFlare, disabled: true, trains: "Aim, hold, release" },
  { id: "shelf", name: "Pantry Shelves", cls: PantryShelves, disabled: true, trains: "Lift to height" },
  { id: "windows", name: "Light Every Window", cls: LightWindows, disabled: true, trains: "Scanning reach" },
  { id: "sorting", name: "Harbor Lights", cls: HarborSorting, disabled: true, trains: "Think and reach" },
  // --- Tier 2 (hand-model dependent: hand should be nearer the camera) ---
  { id: "teapot", name: "Teapot Turn", cls: TeapotTurn, disabled: true, trains: "Palm rotation" },
  { id: "glide", name: "Firefly Glide", cls: FireflyGlide, disabled: true, trains: "Gentle squeeze control" },
  { id: "bloom", name: "Night Blooms", cls: NightBlooms, disabled: true, trains: "Hand shaping" },
  { id: "pinch", name: "Firefly Pinch", cls: FireflyPinch, disabled: true, trains: "Fingertip pinch" },
  { id: "rainbow", name: "Rainbow Crossing", cls: RainbowCrossing, disabled: true, trains: "Outward sweep + grasp" },
];

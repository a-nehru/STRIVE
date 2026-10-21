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
  candles: { title: "The lamplighter of Lumen", text: "The Night Moth put out every flame in the valley. Take a candle from the basket and carry it to each lantern. Pip the owl will cheer you on." },
  dots: { title: "Connect the dots", text: "There is a picture hiding in these dots. Go from one to the next and it will draw itself." },
  pairs: { title: "Memory pairs", text: "The cards hide in pairs. Have a good look, then turn two at a time and find each match." },
  windy: { title: "Windy City Flap", text: "Rook the cat pilot needs a co-pilot. Lift both arms to climb, lower them to dive, and keep them level to fly through the gaps." },
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
// A GAME IS 90 SECONDS (Oct 2026, by request; before that, best of five,
// first to three). Points are tallied both ways for TRICK_AT seconds of
// play (the tutorial does not count), then the patient's paddle is ablaze
// and their next return is the SMASH: it wins that point and ends the game.
// The game is won on the tally (more points than the star), lost on it, or
// drawn, and the next game's ball and the star's rank follow that result
// (main.js#onRoundEnd). The clock is the game, so the game ends when it
// says, never on a scoreline.
// THE STAR'S RANK (Sep 2026, by request): the opponent grows with the
// patient. A won game raises the rank, a lost one lowers it (main.js,
// stored per patient as "starRank"); each rank is a fancier, quicker star:
// its own paddle colours and glow, a sparkle tail from Comet up, and
// sharper reactions (gain = how fast it reads the ball, vmax = how fast it
// can move, in court heights a second). Rank 1 is the old star exactly.
// The star is GREY at every rank (Sep 2026, by request): only the patient's
// paddle carries colour, so "which one is me" never has to be worked out.
// A rank is a little brighter grey, more glow, a sparkle tail, and quicker.
export const STAR_RANKS = [
  { name: "Little star", cols: ["#b4b4be", "#6c6c78"], glow: 0,  gain: 3.0, vmax: 0.24, tail: false },
  { name: "Bright star", cols: ["#bfbfc9", "#75758a"], glow: 8,  gain: 3.5, vmax: 0.27, tail: false },
  { name: "Comet",       cols: ["#cacad4", "#7f7f92"], glow: 12, gain: 4.1, vmax: 0.30, tail: true },
  { name: "Nova",        cols: ["#d6d6df", "#8a8a9c"], glow: 16, gain: 4.8, vmax: 0.34, tail: true },
  { name: "Supernova",   cols: ["#e2e2ea", "#9696a8"], glow: 22, gain: 5.6, vmax: 0.38, tail: true },
];
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
// BETA came down from 8 to 5 (Sep 2026): the ZED bridge now delivers 30
// samples a second into a 60 fps loop, and a filter that opens wide on
// every movement lets each new sample show as a step. 5 keeps the paddle
// gliding between samples at a rehab pace for ~40 ms more lag on a sweep.
const PADDLE_MIN_CUT = 0.6, PADDLE_BETA = 5.0, PADDLE_D_CUT = 0.25;
// Before the One-Euro, a running MEDIAN over the last PADDLE_MEDIAN distinct
// tracker samples (Sep 2026, by request). A low-pass filter only spreads an
// outlier out; a median throws it away: one wild wrist landmark, or the
// occasional frame where the ZED swaps a joint, moves the paddle not at all.
// Distinct samples, not frames: at 30 fps in a 60 fps loop the same angle
// arrives twice, and a median over repeats would be a median over nothing.
const PADDLE_MEDIAN = 5;
const PONG_HAND_SCALE = 0.42, PONG_HAND_ALPHA = 0.38;
// nudged OUTWARD from the court so the hand hugs the back of its paddle
// rather than spilling into the play area (the paddle itself is only 16px)
const PONG_HAND_OUT = 16;
const PONG_PAD_T = 16;          // paddle thickness, px
// TWO PONGS (Sep 2026, by request). "fe" is Pong FE: the paddles stand at
// the left and right, the lane is vertical and the arm's elevation arc
// drives it (shoulder flexion and extension). "abd" is Pong Abd-Add: the
// court is turned on its side, the patient's paddle runs left and right
// along the BOTTOM of the screen, driven by the hand's sideways position,
// and the lane spans the assessment's own x limits (the furthest the wrist
// went out to the side and across the body: abduction and adduction). The
// physics never changes: the ball travels along court "x" between the two
// edges and the paddles along "y" inside the lane; only _P, the mapping
// from court to screen, knows which way up the court is drawn.
const PONG_ABD_X0 = 0.12, PONG_ABD_X1 = 0.88;   // where the sideways lane sits on screen (fractions of width)
const PONG_X_PAD = 0.05;        // SW shaved off each end of the sideways range so the ends are reachable
const PONG_X_MIN_SPAN = 0.5;    // SW: the sideways lane never collapses below this
// LIVE PADDLE COLOURS (Sep 2026, by request): the patient's paddle is amber,
// and a posture slip turns it a pulsing gold with the coach's cue, so the
// feedback is on the thing they are watching, not only in the corner. The
// hand no longer colours it: since Sep 2026 (by request) Pong asks nothing
// of the hand or the wrist, only of the arm, so a closed hand or a turned
// palm means nothing here and is not signalled.
const PAD_COLS = {
  patient: ["#e8b98a", "#c77f4a"],
  comp: ["#f5c96a", "#c0802a"],
  mate: ["#a8d8d0", "#5f9b93"], opp: ["#b4b4be", "#6c6c78"],
};
const COMP_TAGS = { lean: "sit tall", hike: "shoulder down", rotation: "face the screen", tilt: "straighten up" };
// the round-1 tutorial's teaching ball: never quicker than this many seconds
// across the court, and slower still for a slow paddle
const TUT_CROSS_MIN = 4.5;
const AI_SLIP_FROM = 80, AI_SLIP_BY = 85;   // (superseded by TRICK_AT below; kept for the duo/team modes' fade maths)
// THE SMASH (Oct 2026, by request: one game clock, the smash at the end of
// it; Sep 2026 had a trick per point and then no tricks at all). The game
// has ONE clock: a paddle at the top of the court catches fire over
// TRICK_AT seconds of play, with the seconds left in its head, so it is the
// time-left display as well as a promise. Once it is ablaze the patient's
// next return is the SMASH: the ball flies too fast for the star to read,
// that point is theirs, and the game ends on it. Nothing is asked of the
// hand or the wrist (no squeeze, no palm turn: the grip and spin shots are
// gone, by request): the smash is earned by playing out the clock and fired
// by the same return as any other. Points before it are won the ordinary
// way (the star's reactions lag and it can miss) or lost the ordinary way
// (a ball past the paddle), each followed by the CEREMONY (POINT_BREAK_MS:
// the point announced out loud with the tally, drawn big), then the next
// serve. The other tricks in TRICKS stay whole: set `nextTrick` to one of
// them in setup() to end a game on a curve or a ghost instead.
const PONG_TRICKS = true;
const TRICK_AT = 90;            // seconds of play until the smash is armed: the length of a game
const TRICK_GRACE = 40;         // seconds after arming for the smash to land, allowed for in the backstop clock
const POINT_BREAK_MS = 3000;    // the win / lose ceremony between points
const TRAIL_MS = 380;           // the ball's comet tail in a rally
const TRICK_TRAIL_MS = 700;     // and behind a trick, a long one in the trick's colours
const SHAKE_MS = 450;           // court shake on the smash (off under calm motion)
// THE TRICKS. Each is a way the ball flies to the star, paired with the
// star's misread of it, so it lands by construction (see _engageTrick and
// the slip in _paddles). `speed` is the return relative to the rally pace,
// `cols` run white-hot to deep for the ball, the trail and the paddle's
// fire, and `word` is what pops when the point lands.
//   smash    straight and much faster; the star holds the side the ball came from
//   curve    sets off towards the star, then bends away into the far corner
//   ghost    fades out across the middle of the court; the star loses it and stands still
//   zigzag   ricochets rail to rail on its way; the star follows the last bounce the wrong way
//   feather  floats slowly to mid court, then darts into the corner; the star relaxes, then is late
const TRICKS = [
  { key: "smash",   name: "Smash",   word: "SMASH!",   speed: 1.8,  cols: ["#fff6d8", "#ffd98a", "#ff8a4a", "#c2452a"] },
  { key: "curve",   name: "Curve",   word: "CURVE!",   speed: 1.25, cols: ["#fff6d8", "#d8c2ff", "#a07cf0", "#5f3fb8"] },
  { key: "ghost",   name: "Ghost",   word: "GHOST!",   speed: 1.3,  cols: ["#ffffff", "#d6ecf5", "#9fd0e6", "#4f8ba8"] },
  { key: "zigzag",  name: "Zigzag",  word: "ZIGZAG!",  speed: 1.25, cols: ["#ffffff", "#fff2a8", "#ffd23c", "#c99a10"] },
  { key: "feather", name: "Feather", word: "FEATHER!", speed: 1.0,  cols: ["#f6ffe8", "#cfe8b8", "#9fc08a", "#5f8a4a"] },
];
const FEATHER_FLOAT = 0.45, FEATHER_DART = 2.1;   // the feather's two paces, relative to the rally
const ZIGZAG_VY = 2.2;                            // the zigzag's rail-to-rail speed, as a multiple of |vx|
const GHOST_FADE = [0.15, 0.35, 0.78, 0.92];      // court fractions: visible, gone, gone, back
// BALL SPEED: starts at half the assessed crossing speed and creeps up a
// little with every return in a rally (a miss and a fresh serve reset it),
// never past PONG_SPEED_MAX of the assessed speed — slower overall, by request.
const PONG_SPEED_START = 0.5, PONG_SPEED_GAIN = 0.04, PONG_SPEED_MAX = 0.85;
// the staff ball-speed dial (drawer / two-player setup), a multiplier on the
// full assessed pace: the same dial for the single and the two-player game
const PONG_SPEED_DIAL = { chill: 0.8, normal: 1, frantic: 1.3 };
// THE STYLE LAYER (Oct 2026, by request: the single-player and the
// two-player game are ONE game, the star swapped for a second person).
// Every return by a person earns STYLE points on top of the tally: STYLE_HIT
// times the rally multiplier (one more for every STYLE_MULT_EVERY hits in the
// rally, up to STYLE_MULT_MAX). Bonuses, each popping as a floating word at
// the paddle: an EDGE hit (the ball on the outer EDGE_FRAC of the paddle,
// from either end), a CLUTCH save (the outer CLUTCH_FRAC) and a HEAT return
// (a ball arriving at HEAT_AT of the full assessed pace or faster). A rally
// of ON_FIRE_AT hits puts the court "ON FIRE". The UNDERDOG, trailing by
// UNDERDOG_GAP points, plays with a paddle UNDERDOG_GROW bigger until the gap
// is UNDERDOG_CLOSE. Glowing ORBS appear mid court every ORB_EVERY seconds
// (one at a time); the person who last hit the ball collects it by sending
// the ball through it, for one of POWERS: a big paddle or a shrunk opponent
// for POWER_MS, a shield (one save behind the goal) or a ghost shot (the
// next return fades out mid court). Each game opens with a CHALLENGE from
// CHALLENGES; the first to complete it takes STYLE_CHALLENGE and a banner.
// The final board names titles: the Wall (most returns), the Sniper (most
// edge hits) and the Showboat (most style). Points are still the game; the
// style is what makes a long rally worth more than a short one.
const STYLE_HIT = 10, STYLE_MULT_EVERY = 5, STYLE_MULT_MAX = 5;
const STYLE_EDGE = 20, STYLE_CLUTCH = 50, STYLE_HEAT = 30, STYLE_CHALLENGE = 200;
const EDGE_FRAC = 0.25, CLUTCH_FRAC = 0.10;
const HEAT_AT = 0.8;
const ON_FIRE_AT = 15;
const UNDERDOG_GAP = 3, UNDERDOG_CLOSE = 2, UNDERDOG_GROW = 0.15;
const ORB_EVERY = [7, 12], ORB_R = 0.035, POWER_MS = 8000;
const POWER_BIG = 0.5, POWER_SHRINK = 0.35;        // paddle growth and shrink, as fractions
const FLOATER_MS = 1100;
const POWERS = [
  { key: "big",    name: "Big paddle",  word: "BIG PADDLE!", col: "#9fc08a" },
  { key: "shrink", name: "Shrink",      word: "SHRINK!",     col: "#d8a0ff" },
  { key: "shield", name: "Shield",      word: "SHIELD!",     col: "#a8d8f0" },
  { key: "ghost",  name: "Ghost shot",  word: "GHOST SHOT!", col: "#9fd0e6" },
];
const CHALLENGES = [
  { key: "edge3",   text: "Land 3 edge hits",            need: p => p.edge >= 3 },
  { key: "rally10", text: "Be part of a 10-hit rally",   need: p => p.rallyBest >= 10 },
  { key: "orbs2",   text: "Collect 2 orbs",              need: p => p.orbs >= 2 },
  { key: "clutch1", text: "Make a clutch save",          need: p => p.clutch >= 1 },
  { key: "heat3",   text: "Hit 3 heat returns",          need: p => p.heat >= 3 },
];
// solo thresholds for the titles (two players are simply compared)
const TITLE_SOLO = { wall: 15, sniper: 3, showboat: 500 };
const mkPlayer = () => ({ style: 0, hits: 0, edge: 0, clutch: 0, heat: 0, orbs: 0, rallyBest: 0, powers: {} });
const PONG_ARC_PAD = 5;         // degrees shaved off each end of the arm's range so the lane ends are reachable
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
// The sideways lane of Pong Abd-Add: the assessment's own x limits, from
// the corner points of the traced shape (or the wedge radii for an older
// profile), about the body centre — the furthest the wrist went out to the
// side and across the body. Falls back to a modest range on that arm's side.
export function pongXLimits(prof, arm) {
  const xs = [];
  const cen = prof?.center?.x || 0;
  if (prof?.envPts?.length) for (const q of prof.envPts) if (q) xs.push(cen + q.x);
  if (xs.length < 2 && prof?.envelope?.length) {
    prof.envelope.forEach((r, i) => { if (r > 0) xs.push(cen + Math.cos((i + 0.5) / prof.envelope.length * TAU) * r); });
  }
  if (xs.length >= 2) return [Math.min(...xs), Math.max(...xs)];
  return arm === "left" ? [-0.9, 0.6] : [-0.6, 0.9];
}

export class ArcPong extends GameBase {
  id = "pong";
  armBehind = false;       // a hand ON the paddle has to be on top of it
  // ---- court → screen ----
  _P(fx, fy) {
    const c = this.canvas;
    if (this.axis !== "abd") return { x: fx * c.width, y: fy * c.height };
    // on its side: the patient's edge at the bottom, the lane left to right
    // (lane top = screen right, so a hand moved to the right moves the
    // paddle to the right for either arm — x is already mirrored)
    const f = (fy - this.court.top) / (this.court.bottom - this.court.top);
    return { x: (PONG_ABD_X1 - f * (PONG_ABD_X1 - PONG_ABD_X0)) * c.width,
             y: (this.patientRight ? fx : 1 - fx) * c.height };
  }
  _myEdge() { return this.patientRight ? "right" : "left"; }
  _edgeX(edge) { return edge === "right" ? this.court.right : this.court.left; }
  // unit vector pointing OUT of the court at an edge, in screen pixels
  _outward(edge) {
    if (this.axis !== "abd") return { x: edge === "right" ? 1 : -1, y: 0 };
    return { x: 0, y: edge === this._myEdge() ? 1 : -1 };
  }
  // a pixel point `out` px outside the court from the middle of a paddle
  _padOutPx(edge, laneY, out) {
    const p = this._P(this._edgeX(edge), laneY + this.paddleH / 2), o = this._outward(edge);
    return { x: p.x + o.x * out, y: p.y + o.y * out };
  }
  // the paddle's rectangle on screen: a bar PONG_PAD_T thick along its edge,
  // pushed `off` px outward for a teammate's second paddle
  _padRect(edge, laneY, off = 0) {
    const o = this._outward(edge);
    const grow = (this._padH(edge) - this.paddleH) / 2;
    const a = this._P(this._edgeX(edge), laneY - grow), b = this._P(this._edgeX(edge), laneY + this.paddleH + grow);
    const T = PONG_PAD_T;
    return this.axis === "abd"
      ? { x: Math.min(a.x, b.x), y: a.y - T / 2 + o.y * off, w: Math.abs(b.x - a.x), h: T }
      : { x: a.x - T / 2 + o.x * off, y: Math.min(a.y, b.y), w: T, h: Math.abs(b.y - a.y) };
  }
  _burstAt(fx, fy, color) { const p = this._P(fx, fy); this.burstAtPx(p.x, p.y, color); }
  // The posture coach sits beside the paddle the patient drives (Sep 2026,
  // by request): the bottom corner on the trained arm's side, clear of the
  // paddle's track and of the hand riding on it, and a little bigger than
  // the other games' dock so a slip is seen.
  coachDock(c) {
    const abd = this.axis === "abd";
    const h = c.height * (abd ? 0.14 : 0.17), w = h * 0.95;
    let x;
    if (abd) x = this.patientRight ? c.width - 10 - w : 10;
    else {
      const edge = this._P(this._edgeX(this._myEdge()), 0).x;
      x = this.patientRight ? Math.min(edge + 40, c.width - w - 6) : Math.max(edge - 40 - w, 6);
    }
    return { x, y: c.height * 0.98, h };
  }
  // Pong draws NO arm. The full skeleton translated across the court was a
  // second moving shape competing with the ball, and the capture ring means
  // nothing in a game driven by a paddle. What is left is the one useful
  // part: a small, translucent hand sitting ON the paddle it drives, still
  // curling and closing live, so the arm→paddle mapping stays visible
  // without anything crossing the play area. Each paddle gets the hand that
  // actually drives it — left paddle, left hand.
  _handPads() {
    const other = this.side === "right" ? "left" : "right";
    const mine = this._myEdge(), theirs = mine === "right" ? "left" : "right";
    const lane = (edge, second) => second ? (edge === "right" ? this.pads?.rightY2 : this.pads?.leftY2)
                                          : (edge === "right" ? this.pads?.rightY : this.pads?.leftY);
    const out = [{ edge: mine, y: lane(mine), side: this.side, out: PONG_HAND_OUT }];
    if (this.mode === "bimanual") out.push({ edge: theirs, y: lane(theirs), side: other, out: PONG_HAND_OUT });
    else if (this.mode === "team-arms") out.push({ edge: mine, y: lane(mine, true), side: other, out: 26 + PONG_HAND_OUT });
    return out.filter(h => h.y != null).map(h => ({ ...h, ...this._padOutPx(h.edge, h.y, h.out) }));
  }

  _drawArmAndCursor(ctx, c, now) {
    if (!this.pads) return;
    for (const h of this._handPads()) {
      const cy = h.y;
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
        // no hand model: a small disc stands in for the hand
        ctx.strokeStyle = "rgba(244,236,221,0.65)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(h.x, cy, 11, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }
  setup() {
    // the engine's clock is a BACKSTOP, set properly by _gameStart once the
    // tutorial is over: the game is TRICK_AT seconds of play and ends on the
    // smash (vs the star) or on the clock (every other mode)
    this.roundSeconds = TRICK_AT + TRICK_GRACE + POINT_BREAK_MS / 1000 + 6 + (this.opts.tellStory ? 60 : 0);
    this.mode = this.opts.mode || "solo";
    this.axis = this.opts.axis === "abd" ? "abd" : "fe";
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
    // the style layer, per player ("us" the patient, "them" the other side:
    // the star, player two, or the friend on the keys)
    this.pl = { us: mkPlayer(), them: mkPlayer() };
    this.fx = { us: {}, them: {} };          // live power-up effects per side: bigUntil, shrinkUntil, shield, ghostNext
    this.underdog = { us: false, them: false };
    this.floaters = [];                      // "+20 EDGE" words rising off a paddle
    this.orb = null; this.nextOrbAt = 0;
    this.powerups = this.opts.powerups !== false;
    this.speedK = PONG_SPEED_DIAL[this.opts.pongSpeed] || 1;
    this.challenge = null; this.challengeWon = null;
    this.lastHit = null;                     // who sent the ball on its way: {who, edge, human}
    this.onFire = false; this.shakeK = 1;
    this._finalPoint = false;                // two players: the smash is out, this point ends the game
    this.rank = STAR_RANKS[Math.max(0, Math.min(STAR_RANKS.length - 1, (this.opts.starRank || 1) - 1))];
    this._aiTrail = [];                      // the comet's sparkle behind the star's paddle
    // the game's one trick, the one that ends it: the smash (the one
    // everybody knows; the others in TRICKS are a swap away)
    this.nextTrick = TRICKS[0];
    this._finalTrick = null;                 // set when the smash lands and the game ends on it
    this.nextTrick = TRICKS[0];   // the trick this point ends with, if it goes the distance
    this.trick = null;            // the trick in flight, once fired
    this.trickShots = {};         // per trick, how many times it was fired this round
    this.flash = null;            // a big word over the court for a moment
    // a taller court and a shorter paddle: the paddle's centre travels 0.66
    // of the screen (it was 0.57), so the arm's full up-and-down reads as
    // full up-and-down on screen
    // FE: the top strip holds the smash paddle, the bottom strip the hand
    // state and grip gauge, the side strips the hand on its paddle and the
    // posture coach. Abd-Add: the strips above and below hold the same.
    this.court = this.axis === "abd" ? { top: 0.12, bottom: 0.94, left: 0.18, right: 0.82 }
                                     : { top: 0.16, bottom: 0.90, left: 0.1, right: 0.9 };
    this.paddleH = 0.15;
    // contained lane: hard walls pulled INSIDE the court to match the arc
    // span the DDA currently demands (rangeScale) — the ball can never go
    // where the paddle can't, so a small arc still gets a fully playable,
    // rebounding lane; walls widen as rangeScale grows between rounds
    // The lane is the WHOLE court (Sep 2026, by request): the patient's full
    // assessed arc, arcMinDeg to arcMaxDeg, is stretched across all of it,
    // so covering the court means using the whole range of motion. It used
    // to shrink with rangeScale, which made the arm's travel look small.
    this.wallTop = this.court.top;
    this.wallBottom = this.court.bottom;
    this.trickPoints = 0;                    // points taken with a trick shot
    this.pointsPlayed = 0;
    this.pointBreak = null;                  // the ceremony between points (see _pointTo)
    this.trickAt = 0;                        // when the ball in flight became the trick
    this.shakeUntil = 0;
    this._rallyT0 = 0;                       // elapsed seconds when the current point began
    this._gameT0 = 0;                        // elapsed seconds when PLAY began (after the tutorial): the game clock
    this.aiY = 0.5; this.keysY = 0.5; this.keys = { up: false, down: false };
    this.aiLagY = 0.5;                       // AI reacts with a lag — it CAN miss
    this.trail = [];
    this.flashUntil = 0;
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
      ? { step: null, n: 0, tries: 0, said: null, skipDwell: null, speeds: [], serveAt: 0, hold: false }
      : null;
    if (!this.tut) {
      const SUB = {
        solo: this.axis === "abd"
          ? "Reach out to the side and back across to move your paddle along the bottom!"
          : "Raise and lower your arm to score points past the other paddle!",
        bimanual: "Each arm has its own paddle. Rally with yourself!",
        coupled: "Both arms together steer one paddle",
        companion: "A friend plays the other paddle with the arrow keys",
        "team-arms": "Both your arms defend together. Beat the AI!",
        "team-keys": "You and your teammate defend together. Beat the AI!",
        duo: "Two players, one camera. Stand side by side and rally together!",
      };
      this._prompt("Rally with the light", SUB[this.mode]);
      setTimeout(() => this._prompt(""), 3200);
      this._gameStart(performance.now());
      this._startServe(performance.now());
    }
  }
  // PLAY BEGINS (after the tutorial, or at once without one): the game
  // clock starts here, and the engine's backstop is set from it: the game's
  // TRICK_AT seconds, plus (vs the star) the grace for the smash to land
  // and the final board, so the smash is never cut off by the clock
  _gameStart(now) {
    this._gameT0 = Math.max(0, this.elapsed(now) || 0);
    const tail = this.hasAI || this.isDuo ? TRICK_GRACE + POINT_BREAK_MS / 1000 + 6 : 6;
    this.roundSeconds = this._gameT0 + TRICK_AT + tail;
    // the game's challenge, the same for both players, said once and kept
    // on the board; and the first orb a little way in
    if (this.hasAI || this.isDuo || this.mode === "companion") {
      this.challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
      setTimeout(() => { if (this.active && !this.tut) { this._prompt("Challenge", this.challenge.text); this._speak("Challenge: " + this.challenge.text); } }, 3600);
      setTimeout(() => { if (this.active) this._prompt(""); }, 7600);
    }
    this.nextOrbAt = now + (ORB_EVERY[0] + Math.random() * (ORB_EVERY[1] - ORB_EVERY[0])) * 1000;
  }
  // who plays an edge, and whether a person does (the star is not a person)
  _whoAt(edge) { return edge === this._myEdge() || this.mode === "bimanual" ? "us" : "them"; }
  _humanAt(edge) { return this._whoAt(edge) === "us" || this.isDuo || this.mode === "companion" || this.mode === "team-keys"; }
  // the paddle's height at an edge, power-ups and the underdog's boost in
  // (the centre never moves, so the arm-to-paddle mapping is untouched)
  _padH(edge) {
    const who = this._whoAt(edge), f = this.fx[who], now = performance.now();
    let k = 1;
    if (f.bigUntil > now) k += POWER_BIG;
    if (f.shrinkUntil > now) k -= POWER_SHRINK;
    if (this.underdog[who]) k += UNDERDOG_GROW;
    return this.paddleH * Math.max(0.5, k);
  }
  _updateUnderdog() {
    const d = this.score.us - this.score.ai;
    for (const [who, gap] of [["us", -d], ["them", d]]) {
      if (gap >= UNDERDOG_GAP) this.underdog[who] = true;
      else if (gap <= UNDERDOG_CLOSE) this.underdog[who] = false;
    }
  }
  // a word rising off a point on the court
  _floater(fx, fy, text, col) { this.floaters.push({ fx, fy, text, col, t: performance.now() }); }
  _checkChallenge(who, now) {
    const C = this.challenge;
    if (!C || this.challengeWon || !this._humanAt(who === "us" ? this._myEdge() : (this._myEdge() === "right" ? "left" : "right"))) return;
    if (!C.need(this.pl[who])) return;
    this.challengeWon = who;
    this.pl[who].style += STYLE_CHALLENGE;
    this.flash = { text: `CHALLENGE DONE ✦ +${STYLE_CHALLENGE}`, col: "#ffd98a", until: now + 1800 };
    audio.fanfare();
    this._announce(who === "us" ? `Challenge done! ${C.text}. Two hundred style points!`
      : `${this.opts.p2Name || "Player two"} takes the challenge!`);
  }
  // the orbs: one at a time, mid court, collected by sending the ball through it
  _orbs(now) {
    if (!this.powerups || this.tut || this.matchOver || this.pointBreak) return;
    if (!this.orb && now >= this.nextOrbAt) {
      const lo = this.wallTop + ORB_R * 2, hi = this.wallBottom - ORB_R * 2;
      this.orb = { x: 0.5 + (Math.random() - 0.5) * 0.16, y: lo + Math.random() * (hi - lo), born: now };
    }
    const o = this.orb, b = this.ball;
    if (!o || !b || !this.lastHit?.human) return;
    if (Math.hypot(b.x - o.x, b.y - o.y) > ORB_R + 0.012) return;
    const who = this.lastHit.who, other = who === "us" ? "them" : "us";
    const P = POWERS[Math.floor(Math.random() * POWERS.length)];
    if (P.key === "big") this.fx[who].bigUntil = now + POWER_MS;
    else if (P.key === "shrink") this.fx[other].shrinkUntil = now + POWER_MS;
    else if (P.key === "shield") this.fx[who].shield = true;
    else if (P.key === "ghost") this.fx[who].ghostNext = true;
    const pl = this.pl[who];
    pl.orbs++; pl.powers[P.key] = (pl.powers[P.key] || 0) + 1;
    this.orb = null;
    this.nextOrbAt = now + (ORB_EVERY[0] + Math.random() * (ORB_EVERY[1] - ORB_EVERY[0])) * 1000;
    this._burstAt(o.x, o.y, P.col);
    this._floater(o.x, o.y, P.word, P.col);
    audio.note(6);
    this._checkChallenge(who, now);
  }
  stop() {
    if (this._keyDown) { removeEventListener("keydown", this._keyDown); removeEventListener("keyup", this._keyUp); }
    super.stop();
  }
  extra() {
    return {
      pongMode: this.mode, axis: this.axis, bestRally: this.bestRally, points: this.score.us, aiPoints: this.score.ai,
      // two-player rounds: whose arm, and whether the camera held them
      ...(this.isDuo ? { p2Side: this.p2Side, p2Name: this.opts.p2Name ?? null,
                         p2LostFrames: this._p2LostTotal | 0 } : {}),
      // the trick shots fired this round, by name (e.g. {smash: 1, curve: 1})
      trickShots: { ...this.trickShots },
      // tutorial warm-up measurement: median lane traversal time and the ball
      // crossing time derived from it (absent when the tutorial was skipped)
      paddleTraversalS: this.paddleTraversalS ?? null,
      // the arc the lane actually spanned this round (assessment union,
      // grown live by anything the arm did beyond it), per arm, degrees
      // (Abd-Add: the sideways range in SW instead, see laneUnits)
      laneUnits: this.axis === "abd" ? "SW" : "deg",
      laneArc: Object.fromEntries(Object.entries(this._padY ?? {})
        .filter(([, v]) => v.lo != null)
        .map(([k, v]) => [k, this.axis === "abd"
          ? { lo: Math.round(v.lo * 100) / 100, hi: Math.round(v.hi * 100) / 100 }
          : { lo: Math.round(v.lo), hi: Math.round(v.hi) }])),
      pongCrossTime: this.pongCrossTime ? Math.round(this.pongCrossTime * 100) / 100 : null,
      // whether that measurement set the ball's pace (first game on this arm)
      calibrated: !!this._calibrated,
      // points taken with a trick shot, and points played in all
      trickPoints: this.trickPoints, pointsPlayed: this.pointsPlayed,
      // seconds of play, the tutorial excluded (the game is TRICK_AT of them)
      gameSeconds: Math.round(this.gameT(performance.now()) * 10) / 10,
      // the game on the tally: won, lost, or null for a draw (or no points)
      matchWon: this.score.us > this.score.ai ? true : this.score.us < this.score.ai ? false : null,
      smashEnded: !!this._finalTrick,
      starRank: this.opts.starRank || 1,
      gameLength: TRICK_AT,
      // the style layer: the patient's and the other side's
      style: this.pl.us.style, styleThem: this.pl.them.style,
      edgeHits: this.pl.us.edge, clutchSaves: this.pl.us.clutch, heatReturns: this.pl.us.heat,
      orbs: this.pl.us.orbs, powers: { ...this.pl.us.powers },
      p2Stats: this.isDuo ? { ...this.pl.them } : null,
      titles: this.titles || this._titles(),
      challenge: this.challenge?.text ?? null,
      challengeWon: this.challengeWon,
      pongSpeed: this.opts.pongSpeed || "normal", powerups: this.powerups,
    };
  }
  _startServe(now) {
    this.serving = { start: now, beats: -1 };
    this.ball = null;
    this.trail = [];
    this.trick = null; this.trickAt = 0;
    this._tired = 0;
    if (!this.tut) this._rallyT0 = Math.max(0, this.elapsed(now) || 0);
    this._slip = null;        // the misread in progress (see AI_SLIP_FROM)
    this._slipUsed = false;   // one earned point per round, not a repeating gift
  }

  // ROUND-1 TUTORIAL (Sep 2026, by request): one thing at a time, each shown
  // before it is asked for, for someone who may be tired, in pain or slow to
  // take things in. The screen carries only the court, the paddles, the
  // ball, the spot where the ball will land and one line of instruction.
  //   meet   a slow ball comes to them from the star; move the paddle to
  //          where it is going (three returns; a miss just brings the ball
  //          again). The paddle's travel to meet each ball is the speed
  //          measurement that sets the ball's pace for the round.
  //   play   the game itself
  // (The catch and backspin steps went with the grip and spin shots, Sep
  // 2026: the trick shots ask nothing of the hand and are not taught, by
  // request; they simply happen when the paddle burns, so there is nothing
  // to teach but meeting the ball.) Nothing scores, the star never takes a
  // point, and hovering the skip pill goes straight to the game.
  _tutSteps() { return ["meet"]; }
  _tutLines(step) {
    const move = this.axis === "abd" ? "Move your arm to the side" : "Move your arm up or down";
    return {
      meet: ["Meet the ball", `A slow ball is coming. ${move} so your paddle is in its way`],
      play: ["Now let's play", "Score for 90 seconds. When your paddle catches fire, your next shot is the smash!"],
    }[step];
  }
  _tutGo(step, now) {
    const t = this.tut;
    if (!t) return;
    if (step === "play") {
      // the paddle's own pace, from the balls it met: median lane speed →
      // full-lane traversal time → the ball's crossing time for the round
      // (always measured and logged; it SETS the ball's pace only on the
      // first game ever on this arm, opts.calibrate. After that the pace is
      // the level the patient has played their way to, params.lifetime,
      // and the tutorial is a warm-up: re-measuring every session would
      // throw that level away each time.)
      if (t.speeds.length) {
        const v = [...t.speeds].sort((a, b) => a - b)[t.speeds.length >> 1];
        const T = (this.wallBottom - this.wallTop - this.paddleH) / Math.max(0.02, v);
        this.paddleTraversalS = Math.round(T * 100) / 100;
        this.pongCrossTime = Math.min(5.5, Math.max(1.6, 1.4 * T + 0.45));
        this._calibrated = !!this.opts.calibrate;
      }
      this.tut = null;
      this.ball = null; this.serving = null;
      this._rallyT0 = this.elapsed(now);
      this._gameStart(now);
      const [a, b] = this._tutLines("play");
      this._prompt(a, b); this._speak(a + ". " + b + ".");
      setTimeout(() => { if (this.active) this._prompt(""); }, 3500);
      this._startServe(now);
      return;
    }
    t.step = step; t.n = 0; t.tries = 0; t.said = null; t.hold = false; t.serveAt = 0;
  }
  _pongTut(now) {
    const t = this.tut, c = this.canvas;
    // hover the skip pill to jump straight in
    const hp = this.t.palmPx(this.side, c);
    const sx = c.width - 115, sy = 62;
    if (hp && Math.hypot(hp.x - sx, hp.y - sy) < 62) {
      t.skipDwell ??= now;
      if (now - t.skipDwell > 1200) { this._tutGo("play", now); this.say("Alright, rally time!"); return; }
    } else t.skipDwell = null;

    if (t.step == null) this._tutGo("meet", now);
    // one line per step, spoken once and kept on screen the whole step
    const key = t.step;
    if (t.said !== key) {
      t.said = key;
      const [a, b] = this._tutLines(key);
      this._prompt(a, b); this._speak(a + ". " + b + ".");
    }
    // the meet step's speed measurement: the travel is over the first time
    // the paddle sits where the ball is going to land (waiting there for
    // the slow ball must not count as slowness)
    if (t.step === "meet" && this.ball && t.arrivedT == null && t.serveY != null) {
      const b = this.ball, mine = this._myEdge();
      const tRemain = Math.abs(this._edgeX(mine) - b.x) / Math.abs(b.vx || 1e-6);
      const ay = this._predictY(b.y, b.vy, tRemain);
      const pad = this.patientRight ? this.pads?.rightY : this.pads?.leftY;
      if (pad != null && Math.abs(pad + this.paddleH / 2 - ay) < this.paddleH * 0.4) t.arrivedT = now;
    }
    // a ball whenever there is none, after a breath
    if (!t.hold && !this.ball && !this.serving) {
      if (!t.serveAt) t.serveAt = now + 1400;
      else if (now >= t.serveAt) { t.serveAt = 0; this._startServe(now); }
    }
  }
  // A teaching ball is over: returned or missed. Counts toward the step,
  // pops the ball, and moves on when the step is done (or after five tries,
  // so nobody is stuck).
  _tutDone(now, kind) {
    const t = this.tut;
    if (!t || t.hold) return;
    const b = this.ball;
    if (b && kind !== "miss") this._burstAt(b.x, b.y, "#ffd98a");
    if (b && kind !== "miss" && t.step === "meet" && t.serveY != null) {
      // how fast the paddle travelled to meet it (lane fractions a second)
      const pad = this.patientRight ? this.pads?.rightY : this.pads?.leftY;
      const d = pad != null ? Math.abs(pad + this.paddleH / 2 - t.serveY) : 0;
      const dt = ((t.arrivedT ?? now) - t.serveT) / 1000;
      if (d > 0.2 && dt > 0.2) t.speeds.push(d / dt);
    }
    this.ball = null; this.trail = []; this.serving = null;
    t.tries++;
    const ok = kind !== "miss" && (kind === t.step || t.step === "meet");
    if (ok) { t.n++; audio.note(Math.min(7, t.n)); }
    else if (kind === "miss") this.say("Here it comes again");
    const need = t.step === "meet" ? 3 : 1;
    if (t.n >= need || t.tries >= 5) {
      const steps = this._tutSteps();
      const next = steps[steps.indexOf(t.step) + 1] || "play";
      if (t.n >= need) this.say("Lovely, you have it");
      t.hold = true;
      setTimeout(() => { if (this.active && this.tut) this._tutGo(next, performance.now()); }, 2000);
    }
  }
  _launch(now) {
    if (this.tut) {
      // the teaching ball: from the star's paddle, slowly, to a spot the
      // paddle has to move to (the upper and lower part of the lane in turn)
      const t = this.tut;
      const cross = Math.max(TUT_CROSS_MIN, 1.5 * (this.params.lifetime || 3));
      const vx0 = (this.court.right - this.court.left) / cross;
      this.fullVx = vx0; this.baseVx = vx0;
      const x0 = this._aiEdgeX() + (this.patientRight ? 0.02 : -0.02);
      const span = this.wallBottom - this.wallTop - this.paddleH;
      const ty = this.wallTop + this.paddleH / 2 + span * (t.tries % 2 === 0 ? 0.25 : 0.75);
      const y0 = this.aiY;
      this.ball = { x: x0, y: y0, tx: ty, vx: (this.patientRight ? 1 : -1) * vx0, born: now };
      const tFlight = Math.abs(this._edgeX(this._myEdge()) - x0) / vx0;
      this.ball.vy = (ty - y0) / tFlight;
      this._capVy(this.ball);
      const pad = this.patientRight ? this.pads?.rightY : this.pads?.leftY;
      t.serveY = pad != null ? pad + this.paddleH / 2 : null; t.serveT = now; t.arrivedT = null;
      return;
    }
    // Served from the MIDDLE of the court, travelling towards the opponent:
    // the point opens with the patient's shot on its way out, so the first
    // thing they do in a rally is watch their own ball go rather than react
    // to one arriving.
    const laneMid = (this.wallTop + this.wallBottom) / 2;
    const ty = laneMid + (Math.random() - 0.5) * 0.5 * (this.wallBottom - this.wallTop - this.paddleH);
    // the rally's full pace: the ball crosses in params.lifetime seconds,
    // the level this arm has played its way to (quicker after a won game,
    // slower after a lost one, main.js#onRoundEnd). On the first game ever
    // on this arm the tutorial's measured paddle speed sets it instead.
    const vx0 = this.speedK * (this.court.right - this.court.left) / ((this._calibrated && this.pongCrossTime) || this.params.lifetime);
    this.fullVx = vx0;
    this.baseVx = vx0 * PONG_SPEED_START;   // every rally starts slow and builds (see PONG_SPEED_GAIN)
    const x0 = (this.court.left + this.court.right) / 2;
    const toAI = this.patientRight ? -1 : 1;          // away from the patient
    this.ball = { x: x0, y: laneMid, tx: ty, vx: toAI * vx0, born: now };
    this.rally = 0; this.onFire = false;
    this.lastHit = { who: "us", edge: this._myEdge(), human: true };   // the serve is the patient's shot
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
    const st = this._padY[arm] ??= { y: null, dy: 0, buf: [], seen: null, lo: null, hi: null };
    // FE reads the arm's elevation; Abd-Add the wrist's sideways position in
    // shoulder widths (mirrored: right on screen is positive)
    const abd = this.axis === "abd";
    let a = abd ? (this.t.handRel(arm)?.x ?? null) : this.t.armAngle(arm);
    const mid = (this.wallTop + this.wallBottom) / 2 - this.paddleH / 2;
    let target = null;
    if (a != null) {
      // median over the last few DISTINCT samples: outliers go, not spread
      if (this.t.lastSeen !== st.seen) {
        st.seen = this.t.lastSeen;
        st.buf.push(a);
        if (st.buf.length > PADDLE_MEDIAN) st.buf.shift();
      }
      const sorted = [...st.buf].sort((x, y) => x - y);
      a = sorted[sorted.length >> 1];
      // The lane spans the arm's own VERTICAL range. It used to take the
      // lift's resting and peak angles alone, but the lift is one movement
      // on one day: the circles often carry the arm further, and the paddle
      // then hit the wall while the arm still had range to give, so the game
      // asked for LESS than the patient could do (Sep 2026, reported). Now
      // the lane is the UNION of the lift and the whole elevation arc, and
      // it keeps GROWING within the round: an angle past either end widens
      // the lane to it, so the paddle always has somewhere to go when the
      // arm does. A few degrees are shaved off each end so the top and
      // bottom are reachable without a strain, and the span never collapses
      // below 20°.
      if (st.lo == null) {
        if (abd) [st.lo, st.hi] = pongXLimits(prof ?? this.profile, arm);
        else {
          const P = prof ?? this.profile;
          const los = [P?.lift?.startDeg, P?.arcMinDeg].filter(v => v != null);
          const his = [P?.lift?.peakDeg, P?.arcMaxDeg].filter(v => v != null);
          st.lo = los.length ? Math.min(...los) : 20;
          st.hi = his.length ? Math.max(...his) : 120;
        }
      }
      if (a < st.lo) st.lo = a;
      if (a > st.hi) st.hi = a;
      const pad = abd ? PONG_X_PAD : PONG_ARC_PAD;
      const lo = st.lo + pad;
      const hi = st.hi - pad;
      const f = Math.max(0, Math.min(1, (a - lo) / Math.max(abd ? PONG_X_MIN_SPAN : 20, hi - lo)));
      // whole vertical range maps onto the lane: paddle stays flush inside
      const cLo = this.wallTop + this.paddleH / 2, cHi = this.wallBottom - this.paddleH / 2;
      target = cHi - f * (cHi - cLo) - this.paddleH / 2;
    }
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
    if (b.free) return;          // a trick ball flies as its trick says
    const m = 0.38 * Math.abs(b.vx);
    if (Math.abs(b.vy) > m) b.vy = Math.sign(b.vy) * m;
  }
  // paddles: {leftY, rightY, leftY2?, rightY2?} — the 2s are teammate paddles
  // THE GAME IS OVER: on the smash (trick given) or on the clock. The tally
  // decides it, announced out loud and held on the final board for a beat
  // (update() ends the round after it). The tutorial never counts — it is a
  // warm-up, not a game.
  _gameOver(now, trick = null) {
    if (this.tut || this.matchOver) return;
    const us = this.score.us, them = this.score.ai;
    this.matchOver = now;
    this._finalTrick = trick;
    this.ball = null; this.serving = null; this._slip = null; this.pointBreak = null;
    const lead = trick ? `${trick.name}! ` : "";
    const p2 = this.opts.p2Name || "player two";
    const scored = this.hasAI || this.isDuo;
    this.titles = this._titles();
    if (!scored) { audio.fanfare(); this._announce(`Time! Lovely rallies, your best was ${this.bestRally}.`); return; }
    if (us > them) {
      audio.fanfare();
      this._announce(`${lead}Game! ${us} to ${them}. You won it!`);
    } else if (us === them) {
      audio.point();
      this._announce(`${lead}Game! ${us} all. A draw, well played.`);
    } else {
      audio.pointLost();
      this._announce(this.isDuo
        ? `Game to ${p2}, ${them} to ${us}. Good rallies.`
        : `${lead}Game! The star takes it, ${them} to ${us}. Great rallies, you will get it next time.`);
    }
  }
  // THE TITLES on the final board. Two people are compared (ties share);
  // alone, the patient earns each against TITLE_SOLO.
  _titles() {
    const u = this.pl.us, t = this.pl.them, out = { us: [], them: [] };
    const two = this.isDuo || this.mode === "companion" || this.mode === "team-keys";
    const award = (name, a, b, solo) => {
      if (two) { if (a >= b && a > 0) out.us.push(name); if (b >= a && b > 0) out.them.push(name); }
      else if (a >= solo) out.us.push(name);
    };
    award("Wall", u.hits, t.hits, TITLE_SOLO.wall);
    award("Sniper", u.edge, t.edge, TITLE_SOLO.sniper);
    award("Showboat", u.style, t.style, TITLE_SOLO.showboat);
    return out;
  }
  // spoken NOW, past the therapist voice's rate limit: a point announcement
  // that gets swallowed because the star said something 3 s ago is worse
  // than none, the patient would be left reading the board
  _announce(text) { this.fb.lastSpeak = 0; this.say(text); }

  // A point is decided: tally it, then the CEREMONY. The point is announced
  // out loud with the scoreline (patient's score first, always), drawn big
  // for POINT_BREAK_MS — a sunburst and confetti for the patient's point,
  // a soft lavender card for the star's, never a buzzer, never a failure —
  // and only then the next serve. In the tutorial there is no ceremony:
  // the easy serve just comes again.
  _pointTo(who, now) {
    const trick = (who === "us" && this._slip) || (this.isDuo && this._finalPoint) ? (this.trick || TRICKS[0]) : null;
    const bx = this.ball?.x ?? 0.5, by = this.ball?.y ?? 0.5;
    if (who === "us") {
      this.score.us++;
      if (this._slip) { this._slipUsed = true; this._slip = null; this.trickPoints++; }
    } else {
      if (!this.tut) this.miss({ isFar: false });   // a teaching ball missed is not a miss
      this.rally = 0;
      // in duo the far paddle is a person, not the AI: the same tally
      // counts their points, and they get named rather than "the star"
      if ((this.hasAI || this.isDuo) && !this.tut) this.score.ai++;
    }
    this.trick = null; this.trickAt = 0;
    if (this.tut) { this._tutDone(now, "miss"); return; }
    this.pointsPlayed++;
    this._updateUnderdog();
    this.orb = null;
    // the smash landed (or, with two players, the smash point is decided): that is the game
    if (trick) { this._burstAt(bx, by, trick.cols[2]); this._gameOver(now, trick); return; }
    this.ball = null; this.serving = null; this._slip = null;
    this.pointBreak = { who, trick, at: now, until: now + POINT_BREAK_MS, lastBurst: 0 };
    const us = this.score.us, them = this.score.ai;
    const p2 = this.opts.p2Name || "player two";
    const scored = this.hasAI || this.isDuo;
    if (who === "us") {
      this._burstAt(bx, by, "#ffd98a");
      audio.point();
      this._announce(`Point to you! ${us} to ${them}.`);
    } else {
      audio.pointLost();
      const tail = this.trickReady(now) ? " The smash is ready, hit the next ball." : "";
      this._announce(this.isDuo ? `Point to ${p2}. ${us} to ${them}.`
        : scored ? `The star takes that one. ${us} to ${them}.${tail}`
        : "Ball away. Here comes the next one.");
    }
  }

  // seconds into the current point, seconds of play in the game (the
  // tutorial does not count), and whether the smash is armed
  rallyT(now) { return Math.max(0, this.elapsed(now) - (this._rallyT0 || 0)); }
  gameT(now) { return this.tut ? 0 : Math.max(0, this.elapsed(now) - (this._gameT0 || 0)); }
  trickReady(now) { return PONG_TRICKS && (this.hasAI || this.isDuo) && !this.tut && this.gameT(now) >= TRICK_AT; }

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

  // One step of the ball's own motion, in court units: the flight, the
  // trick's shaping of it (a curve's bend, the feather's dart) and the
  // rebound off the rails. Shared by the update loop and by _simToAI, so
  // the star's prediction of where a trick lands is the ball's own physics
  // run ahead, never a second model of it that could disagree.
  _stepBall(b, s, live = false) {
    if (b.dartX != null && !b.darted && (b.vx > 0 ? b.x >= b.dartX : b.x <= b.dartX)) {
      // the feather's dart: it was floating, now it goes, into the corner
      b.darted = true;
      b.vx *= FEATHER_DART / FEATHER_FLOAT;
      const tLeft = Math.abs(this._aiHitX() - b.x) / Math.abs(b.vx);
      b.vy = tLeft > 0 ? (b.trickTy - b.y) / tLeft : 0;
      if (live) { this._burstAt(b.x, b.y, this.trick?.cols[2] || "#9fc08a"); audio.note(7); }
    }
    b.x += b.vx * s; b.y += b.vy * s;
    if (b.curve) b.vy += b.curve * s;                        // the curve bends the flight
    if (b.y < this.wallTop) { b.y = this.wallTop; b.vy = Math.abs(b.vy); if (live) audio.bounce(); }
    else if (b.y > this.wallBottom) { b.y = this.wallBottom; b.vy = -Math.abs(b.vy); if (live) audio.bounce(); }
  }
  // where the star's paddle is actually tested against the ball (update()
  // tests 0.02 inside the edge): predictions must run to HERE, not to the
  // edge, or a ball with a steep sideways speed is a third of a paddle
  // away from where it was predicted by the time it is tested
  _aiHitX() { return this.patientRight ? this.court.left + 0.02 : this.court.right - 0.02; }
  // Where and when a ball on its way to the star reaches the star's paddle
  // line: the ball's own motion run ahead in small steps, rails and trick
  // included.
  _simToAI(b) {
    const q = { ...b }, ex = this._aiHitX(), s = 1 / 120;
    let t = 0;
    while (t < 30 && (q.vx < 0 ? q.x > ex : q.x < ex)) { this._stepBall(q, s); t += s; }
    return { t, y: q.y };
  }
  // a ball back to plain flight: whatever trick it carried is over
  _plainBall(b) { b.curve = 0; b.dartX = null; b.darted = false; b.ghost = null; b.free = false; b.trickTy = null; }
  // the ghost's visibility along its flight: there for the first stretch,
  // gone across the middle of the court, back for the last, so the patient
  // sees it leave and sees it arrive, and the star sees neither
  _ghostAlpha(b) {
    if (!b?.ghost) return 1;
    const g = b.ghost, p = Math.max(0, Math.min(1, (b.x - g.x0) / (g.x1 - g.x0)));
    const [a, b1, c, d] = GHOST_FADE;
    const low = 0.08;
    if (p < a) return 1;
    if (p < b1) return 1 - (1 - low) * (p - a) / (b1 - a);
    if (p < c) return low;
    if (p < d) return low + (1 - low) * (p - c) / (d - c);
    return 1;
  }

  // FIRE THE TRICK on a ball the patient has just returned, and set up the
  // star's misread to match, so it lands by construction: the star holds
  // `wrongY` (a confident, WRONG read of the shot) and breaks late for a
  // spot a sliver past where the ball actually arrives (see the slip in
  // _paddles). Every trick sends the ball to the corner AWAY from the star;
  // what differs is how it gets there and what the star believes meanwhile.
  _engageTrick(now) {
    const b = this.ball, T = this.nextTrick || TRICKS[0];
    if (!b) return;
    const lo = this.wallTop + this.paddleH / 2, hi = this.wallBottom - this.paddleH / 2;
    const laneMid = (this.wallTop + this.wallBottom) / 2;
    const toTop = this.aiY > laneMid;
    const cornerY = toTop ? this.wallTop + this.paddleH * 0.35 : this.wallBottom - this.paddleH * 0.35;
    this._plainBall(b);
    b.free = true;
    b.vx *= T.speed;
    const tF = Math.abs(b.x - this._aiHitX()) / Math.abs(b.vx);
    let wrongY = toTop ? hi : lo;          // the smash: it holds the side the ball came from
    switch (T.key) {
      case "curve": {
        // sets off straight at where the star stands, then bends away: a
        // parabola from here to the corner whose first heading is the star
        const vy0 = (this.aiY - b.y) / tF;
        b.vy = vy0;
        b.curve = 2 * (cornerY - b.y - vy0 * tF) / (tF * tF);
        wrongY = this.aiY;
        break;
      }
      case "ghost":
        b.vy = (cornerY - b.y) / tF;
        b.ghost = { x0: b.x, x1: this._aiEdgeX() };
        wrongY = this.aiY;                 // it has lost the ball: it just stands there
        break;
      case "zigzag": {
        // rail to rail all the way across, and still arriving IN the far
        // corner: the rails fold the flight into a triangle wave, so the
        // corner is reached by aiming at one of its unfolded images (the
        // m-th reflection, either way up) and the image chosen is the one
        // whose sideways speed is nearest ZIGZAG_VY, with at least two
        // bounces. Aimed anywhere else the ball could arrive hard by a
        // rail, where the paddle's clamp would save it by construction.
        const H = this.wallBottom - this.wallTop, u0 = b.y - this.wallTop, cu = cornerY - this.wallTop;
        const want = ZIGZAG_VY * Math.abs(b.vx);
        let bestVy = (cornerY - b.y) / tF, bestErr = Infinity;
        for (const sg of [1, -1]) for (let m = 2; m <= 8; m++) {
          const target = sg * (m * H + (m % 2 === 0 ? cu : H - cu));
          const vy = (target - u0) / tF;
          const err = Math.abs(Math.abs(vy) - want);
          if (err < bestErr) { bestErr = err; bestVy = vy; }
        }
        b.vy = bestVy;
        break;
      }
      case "feather": {
        // floats: slow, drifting gently towards the star so it relaxes,
        // then darts from mid court into the corner
        b.vx *= FEATHER_FLOAT;
        b.dartX = (this.court.left + this.court.right) / 2;
        const tFloat = Math.abs(b.dartX - b.x) / Math.abs(b.vx);
        b.vy = tFloat > 0 ? (this.aiY - b.y) / tFloat * 0.6 : 0;
        b.trickTy = cornerY;
        wrongY = this.aiY;
        break;
      }
      default:                             // smash: straight into the corner, fast
        b.vy = (cornerY - b.y) / tF;
    }
    const arrive = this._simToAI(b).y;
    this._slip = {
      fromX: b.x,
      wrongY,
      missSign: arrive < laneMid ? 1 : -1,   // ends up just below a high ball, just above a low one
      at: now,
    };
    this.trick = T; this.trickAt = now;
    this.trickShots[T.key] = (this.trickShots[T.key] || 0) + 1;
    if (T.key === "smash") this.shakeUntil = now + SHAKE_MS;     // only the smash shudders the court
    this.flash = { text: `${T.word} ✦`, col: T.cols[1], until: now + 1500 };
    this._burstAt(b.x, b.y, T.cols[2]);
    audio.trick(T.key);
    this.stats.stars += 10;
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
    if (this.hasAI && this.ball) {
      const s = dt / 1000;
      // the star tires over the GAME, not the current rally: tied to rally
      // age it almost never fired, because a single rally rarely lasts 75 s.
      // It fades from AI_FADE_FROM towards the smash, so the last points
      // before the clock are a little easier to take through ordinary play.
      const age = this.gameT(now);           // seconds of play in the game
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
        const vmaxS = this.rank.vmax * 1.08;     // the lunge is a touch quicker than the rally pace
        // where and when the ball will actually arrive, rails and trick
        // included, and the spot that leaves it a sliver clear of the edge
        const { t: tRemain, y: arrive } = this._simToAI(this.ball);
        // plus one frame of the ball's own sideways travel: the hit test
        // runs once a frame, so a steep ball is tested up to that much
        // past its predicted arrival, and the gap has to survive it
        const slack = Math.abs(this.ball.vy) * 0.02;
        const missY = Math.max(lo, Math.min(hi,
          arrive + sl.missSign * (this.paddleH / 2 + this.paddleH * AI_SLIP_GAP + slack)));
        if (!sl.recover && tRemain <= (Math.abs(missY - this.aiY) / vmaxS) * AI_SLIP_LATE) {
          sl.recover = true;                       // it has seen it — too late
        }
        const want = sl.recover ? missY : sl.wrongY;
        this.aiY += Math.max(-vmaxS * s, Math.min(vmaxS * s, want - this.aiY));
        this.aiLagY = this.aiY;                    // no stale lag when it recovers
        this.aiY = Math.max(lo, Math.min(hi, this.aiY));
      } else {
        const gain = this.rank.gain * (1 - tired);
        const vmax = this.rank.vmax * (1 - tired);
        // a ghost shot (the power-up): while the ball is faded out the star
        // has nothing to read and holds its line
        if (this._ghostAlpha(this.ball) > 0.5) this.aiLagY += (this.ball.y - this.aiLagY) * Math.min(1, gain * s);
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
  _edgeHit(b, ys, edge) {
    const grow = edge ? (this._padH(edge) - this.paddleH) / 2 : 0;
    for (const y of ys) {
      if (y != null && b.y > y - 0.025 - grow && b.y < y + this.paddleH + 0.025 + grow) return y;
    }
    return null;
  }
  update(now, dt) {
    // the match is decided: hold the final board for a beat so the scoreline
    // is read, then finish the round on it rather than on the clock
    if (this.matchOver) {
      if (now - this.matchOver > 6500) this._end();
      this.pads = this._paddles(now, dt);
      return;
    }
    // the clock: without the smash (no star, or it never landed in the
    // grace) the game still ends on a board and a result, not a cut
    if (!this.tut && this.elapsed(now) >= this.roundSeconds - 7) { this._gameOver(now); return; }
    this.pads = this._paddles(now, dt);
    this.floaters = this.floaters.filter(f => now - f.t < FLOATER_MS);

    // the ceremony between points: paddles still follow the arm (the court
    // never freezes), confetti for the first moments of a won point, then
    // the next serve
    if (this.pointBreak) {
      const pb = this.pointBreak;
      if (pb.who === "us" && now - pb.at < 800 && now - pb.lastBurst > (A11Y.calm ? 800 : 90)) {
        pb.lastBurst = now;
        const c = this.canvas;
        this.burstAtPx((0.2 + Math.random() * 0.6) * c.width, (0.2 + Math.random() * 0.5) * c.height,
                       pb.trick ? pb.trick.cols[1 + Math.floor(Math.random() * 2)] : ["#ffd98a", "#9fc08a", "#e8a86a"][Math.floor(Math.random() * 3)]);
      }
      if (now >= pb.until) { this.pointBreak = null; this._startServe(now); }
      return;
    }

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

    const b = this.ball, s = dt / 1000;
    // the flight, the trick's shaping of it and the rails, in one place
    this._stepBall(b, s, true);
    this.trail.push({ x: b.x, y: b.y, t: now, a: this._ghostAlpha(b) });
    this.trail = this.trail.filter(p => now - p.t < (this.trick ? TRICK_TRAIL_MS : TRAIL_MS));

    const patRight = this.patientRight;
    this._orbs(now);
    const returnBall = (dir, py, isPlayerSide, edge) => {
      const who = this._whoAt(edge), human = this._humanAt(edge);
      const H = this._padH(edge);
      const arriving = Math.abs(b.vx);                 // the pace it came in at, for the heat bonus
      // the rally builds: each of the patient's returns adds a little speed,
      // up to PONG_SPEED_MAX of the assessed speed; a fresh serve starts slow again
      if (isPlayerSide && this.fullVx) {
        this.baseVx = Math.min(this.fullVx * PONG_SPEED_MAX, (this.baseVx || this.fullVx * PONG_SPEED_START) * (1 + PONG_SPEED_GAIN));
      }
      b.vx = dir * (this.baseVx || Math.abs(b.vx));
      b.vy += ((b.y - (py + this.paddleH / 2)) / H) * 0.12;   // gentle deflection: flat rallies
      this._plainBall(b);
      b.squash = now;
      this.lastHit = { who, edge, human };
      if (human && !this.tut) {
        // STYLE: the hit times the rally multiplier, and the bonuses
        const pl = this.pl[who];
        if (!isPlayerSide) this.rally++;             // the patient's own returns count below
        const rallyN = this.rally + (isPlayerSide ? 1 : 0);
        const mult = Math.min(STYLE_MULT_MAX, 1 + Math.floor(rallyN / STYLE_MULT_EVERY));
        let pts = STYLE_HIT * mult;
        const off = Math.abs(b.y - (py + this.paddleH / 2)) / (H / 2);   // 0 centre .. 1 the very end
        const tags = [];
        if (off >= 1 - CLUTCH_FRAC * 2) { pts += STYLE_CLUTCH; pl.clutch++; tags.push(`+${STYLE_CLUTCH} CLUTCH`); }
        else if (off >= 1 - EDGE_FRAC * 2) { pts += STYLE_EDGE; pl.edge++; tags.push(`+${STYLE_EDGE} EDGE`); }
        if (this.fullVx && arriving >= HEAT_AT * this.fullVx) { pts += STYLE_HEAT; pl.heat++; tags.push(`+${STYLE_HEAT} HEAT`); }
        pl.style += pts; pl.hits++;
        pl.rallyBest = Math.max(pl.rallyBest, rallyN);
        const out = this._outward(edge);
        for (const [i, t] of tags.entries()) this._floater(b.x - out.x * 0.04, b.y + (i - (tags.length - 1) / 2) * 0.07, t, who === "us" ? "#ffd98a" : "#a8d8f0");
        if (mult > 1 && !tags.length) this._floater(b.x - out.x * 0.04, b.y, `×${mult}`, "rgba(244,236,221,0.8)");
        // the ghost shot power-up: this return fades out across the middle
        if (this.fx[who].ghostNext) {
          this.fx[who].ghostNext = false;
          b.ghost = { x0: b.x, x1: dir > 0 ? this.court.right : this.court.left };
          this._floater(b.x, b.y - 0.1, "GHOST", POWERS[3].col);
        }
        // the court catches with the rally: a shudder from 8 hits, more as it grows
        if (rallyN >= 8 && !A11Y.calm) { this.shakeK = Math.min(1, rallyN / 25); this.shakeUntil = now + 140; }
        if (rallyN >= ON_FIRE_AT && !this.onFire) { this.onFire = true; this.flash = { text: "ON FIRE! 🔥", col: "#ff8a4a", until: now + 1500 }; }
        this._checkChallenge(who, now);
      }
      audio.paddle(isPlayerSide, this.rally);   // the "pock" of the return: brighter for the patient's own, rising with the rally
      // TWO PLAYERS: the clock is full, so this return, by either of them,
      // is the SMASH, and whoever takes this point takes the game
      if (this.isDuo && this.trickReady(now) && !this._finalPoint) {
        const T = TRICKS[0];
        this._finalPoint = true;
        b.free = true; b.vx *= T.speed;
        this.trick = T; this.trickAt = now; this.trickShots[T.key] = (this.trickShots[T.key] || 0) + 1;
        this.shakeK = 1; this.shakeUntil = now + SHAKE_MS;
        this.flash = { text: `${T.word} ✦`, col: T.cols[1], until: now + 1500 };
        this._burstAt(b.x, b.y, T.cols[2]);
        audio.trick(T.key);
      }
      if (isPlayerSide) {
        this.rally++; this.bestRally = Math.max(this.bestRally, this.rally);
        if (!this.tut) this.hit({ reachFrac: 0.7, isFar: false }, this.rally);
        // THE TRICK: the clock is full, so this return is the one. The ball
        // flies as this point's trick says, and the star misreads it.
        if (!this.isDuo && this.trickReady(now) && !this._slip && !this._slipUsed) this._engageTrick(now);
        else { this._burstAt(b.x, b.y, "#e8b98a"); this.flashUntil = now + 160; }
        // a teaching ball returned: counted, and the next one comes
        if (this.tut) { this._tutDone(now, "meet"); return; }
      } else {
        this.bestRally = Math.max(this.bestRally, this.rally);
        if (!this.isDuo) { this.trick = null; this.trickAt = 0; this._slip = null; }   // the star got it back after all
        if (this.hasAI) {   // AI aims inside the walled lane, near the middle
          const laneMid = (this.wallTop + this.wallBottom) / 2;
          b.tx = laneMid + (Math.random() - 0.5) * 0.5 * (this.wallBottom - this.wallTop - this.paddleH);
          b.vy = (b.tx - b.y) / ((this.court.right - this.court.left) / Math.abs(b.vx)) + (Math.random() - 0.5) * 0.03;
        }
      }
      if (this.ball) this._capVy(b);
    };

    // the shield power-up: one save behind the goal, then it is spent
    const shieldAt = edge => {
      const who = this._whoAt(edge);
      if (!this.fx[who].shield) return false;
      this.fx[who].shield = false;
      b.x = edge === "right" ? this.court.right - 0.02 : this.court.left + 0.02;
      b.vx = (edge === "right" ? -1 : 1) * Math.abs(b.vx);
      this._plainBall(b);
      this._burstAt(b.x, b.y, POWERS[2].col);
      this._floater(b.x, b.y, "SHIELD!", POWERS[2].col);
      audio.bounce();
      return true;
    };
    // right edge
    if (b.vx > 0 && b.x >= this.court.right - 0.02) {
      const py = this._edgeHit(b, [this.pads.rightY, this.pads.rightY2], "right");
      const playerSide = patRight || this.mode === "bimanual";
      if (py != null) returnBall(-1, py, patRight || this.mode === "bimanual", "right");
      else if (b.x > this.court.right + 0.04 && !shieldAt("right")) {
        this._pointTo(playerSide ? "them" : "us", now);
        return;
      }
    }
    // left edge
    if (b.vx < 0 && b.x <= this.court.left + 0.02) {
      const py = this._edgeHit(b, [this.pads.leftY, this.pads.leftY2], "left");
      const playerSide = !patRight || this.mode === "bimanual";
      if (py != null) returnBall(1, py, !patRight || this.mode === "bimanual", "left");
      else if (b.x < this.court.left - 0.04 && !shieldAt("left")) {
        this._pointTo(playerSide ? "them" : "us", now);
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
    const P = (fx, fy) => this._P(fx, fy);
    const tut = !!this.tut;
    const abd = this.axis === "abd";
    ctx.save();
    // the smash shakes the court for a moment (not under calm motion)
    if (now < this.shakeUntil && !A11Y.calm) {
      const k = (this.shakeUntil - now) / SHAKE_MS * 7 * (this.shakeK ?? 1);
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    // the goal lines: a dashed curve just outside each edge
    ctx.strokeStyle = "rgba(244,236,221,0.16)"; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
    for (const [ex, bulge] of [[this.court.left - 0.015, -0.04], [this.court.right + 0.015, 0.04]]) {
      const a = P(ex, this.wallTop), m = P(ex + bulge, (this.wallTop + this.wallBottom) / 2), b = P(ex, this.wallBottom);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y, b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // the lane walls: solid glowing rails the ball rebounds off — the whole
    // game visibly lives where the paddle can reach
    ctx.save();
    ctx.strokeStyle = "rgba(244,236,221,0.4)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(232,168,106,0.5)"; ctx.shadowBlur = 10;
    for (const wy of [this.wallTop, this.wallBottom]) {
      const a = P(this.court.left - 0.015, wy), b = P(this.court.right + 0.015, wy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();

    // scoreboard: the TALLY, a sun and the patient's points on their side,
    // a grey disc and the star's (or player two's) on the other: a 90 s
    // game has no target to fill, only a count to beat. Not during the
    // tutorial: nothing scores there and the screen is kept bare.
    const scored = this.hasAI || this.isDuo;
    if (scored && !tut) {
      const usX = this.patientRight ? 0.72 : 0.20, aiX = this.patientRight ? 0.20 : 0.72;
      const y = 0.062 * c.height;
      ctx.save();
      ctx.textBaseline = "middle"; ctx.shadowColor = "rgba(20,16,40,0.8)"; ctx.shadowBlur = 6;
      ctx.font = `800 ${Math.round(c.height * 0.045)}px Nunito, sans-serif`;
      starShape(ctx, usX * c.width, y, 11, "#ffd98a");
      ctx.fillStyle = "#fff6d8"; ctx.textAlign = "left";
      ctx.fillText(String(this.score.us), usX * c.width + 20, y + 1);
      ctx.fillStyle = "rgba(190,190,200,0.85)"; ctx.beginPath(); ctx.arc(aiX * c.width, y, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff6d8"; ctx.textAlign = "left";
      ctx.fillText(String(this.score.ai), aiX * c.width + 20, y + 1);
      ctx.font = `700 ${Math.round(c.height * 0.02)}px Nunito, sans-serif`;
      ctx.fillStyle = "rgba(244,236,221,0.7)";
      ctx.fillText("you", usX * c.width - 2, y + c.height * 0.038);
      ctx.fillText(this.isDuo ? (this.opts.p2Name || "player two") : "the star", aiX * c.width - 2, y + c.height * 0.038);
      // the style under each tally (the star earns none)
      ctx.fillStyle = "rgba(255,217,138,0.8)";
      ctx.fillText(`✦ ${this.pl.us.style}`, usX * c.width + 50, y + c.height * 0.038);
      if (this.isDuo) ctx.fillText(`✦ ${this.pl.them.style}`, aiX * c.width + 50, y + c.height * 0.038);
      ctx.restore();
    }
    // the orb: a glowing, breathing light mid court, waiting for the ball
    if (this.orb && !tut) {
      const op = P(this.orb.x, this.orb.y), pulse = A11Y.calm ? 0.5 : Math.sin(now / 220) * 0.5 + 0.5;
      const r = c.height * ORB_R * (0.85 + pulse * 0.3);
      this.glow(ctx, op.x, op.y, r, "#ffffff", "#ffd98a", 26 + pulse * 10);
      ctx.save();
      ctx.strokeStyle = `rgba(255,217,138,${0.4 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(op.x, op.y, r * 1.6, now / 900, now / 900 + TAU); ctx.stroke();
      ctx.restore();
    }
    // the challenge, small, under the clock, until it is taken
    if (this.challenge && !tut && !this.matchOver) {
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(c.height * 0.02)}px Nunito, sans-serif`;
      ctx.fillStyle = this.challengeWon ? "rgba(159,192,138,0.9)" : "rgba(244,236,221,0.6)";
      ctx.fillText(this.challengeWon ? `✓ ${this.challenge.text}` : `challenge: ${this.challenge.text}`, c.width / 2, c.height * (abd ? 0.205 : 0.135));
      ctx.restore();
    }
    // the game clock: vs the star, the paddle catching fire over the game
    // (the smash loader, seconds left in its head); otherwise a plain
    // shrinking line along the top
    if (PONG_TRICKS && (this.hasAI || this.isDuo) && !tut && !this.matchOver) this._drawRacket(ctx, c, now);
    else if (!tut && !this.matchOver) this._drawGameClock(ctx, c, now);

    // rally streak stars, just inside the far rail; ON FIRE past ON_FIRE_AT
    if (!tut) {
      const n = Math.min(this.rally, 14);
      const sy = c.height * (abd ? 0.235 : 0.20);
      for (let i = 0; i < n; i++) {
        const fx = 0.5 + (i - (n - 1) / 2) * 0.035;
        ctx.globalAlpha = 0.6 + Math.sin(now / 300 + i) * 0.4;
        starShape(ctx, fx * c.width, sy, i === n - 1 ? 11 : 8, this.onFire ? "#ff8a4a" : "#fff2c2");
        ctx.globalAlpha = 1;
      }
      if (this.onFire && this.rally >= ON_FIRE_AT) {
        ctx.save();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `800 ${Math.round(c.height * 0.026)}px Nunito, sans-serif`;
        ctx.fillStyle = `rgba(255,138,74,${0.7 + (A11Y.calm ? 0 : Math.sin(now / 150) * 0.3)})`;
        ctx.shadowColor = "#ff8a4a"; ctx.shadowBlur = 12;
        ctx.fillText(`ON FIRE · ${this.rally}`, c.width / 2, sy + c.height * 0.03);
        ctx.restore();
      }
    }

    // paddles. The patient's is amber, gold and pulsing under a posture cue
    // (see PAD_COLS); a teammate's is teal; the star's is grey at every rank.
    const pads = this.pads || {};
    const star = this.hasAI ? this.rank : null;
    const mine = this._myEdge(), theirs = mine === "right" ? "left" : "right";
    const stMain = this.coach.state === "alert"
      ? { cols: PAD_COLS.comp, tag: COMP_TAGS[this.coach.type] || "sit tall", pulse: true }
      : { cols: PAD_COLS.patient, tag: null };
    const stOther = stMain;
    const drawPad = (edge, y, kind, st, off = 0) => {
      if (y == null) return;
      const cols = kind === "patient" ? st.cols : kind === "mate" || (kind === "opp" && this.isDuo) ? PAD_COLS.mate : star ? star.cols : PAD_COLS.opp;
      const glow = kind === "opp" && star && star.glow;
      const r = this._padRect(edge, y, off);
      ctx.save();
      if (kind === "patient" && st.pulse) { ctx.shadowColor = cols[0]; ctx.shadowBlur = 14 + (A11Y.calm ? 0 : Math.sin(now / 200) * 8); }
      else if (kind === "patient" && st.tag) { ctx.shadowColor = cols[0]; ctx.shadowBlur = 12; }
      else if (glow) { ctx.shadowColor = cols[0]; ctx.shadowBlur = glow + (A11Y.calm ? 0 : Math.sin(now / 300) * 4); }
      if (kind === "opp" && star?.tail) {
        // the comet's sparkle: a few fading motes behind where the paddle has been
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        this._aiTrail.push({ x: cx, y: cy, t: now });
        this._aiTrail = this._aiTrail.filter(q => now - q.t < 500);
        for (const q of this._aiTrail) {
          const age = (now - q.t) / 500;
          ctx.globalAlpha = 0.5 * (1 - age);
          ctx.fillStyle = cols[0];
          const j = ((q.t * 3) % 11) / 11 - 0.5;
          const along = j * 2 * (abd ? r.w : r.h) * 0.4;
          ctx.beginPath();
          ctx.arc(q.x + (abd ? along : j * 26 * age), q.y + (abd ? j * 26 * age : along), 2.5 * (1 - age) + 0.5, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      roundedRect(ctx, r.x, r.y, r.w, r.h, 8, cols[0], cols[1]);
      ctx.restore();
    };
    const kindOf = edge => edge === mine || this.mode === "bimanual" ? "patient" : "opp";
    drawPad("left", pads.leftY, kindOf("left"), mine === "left" ? stMain : stOther);
    drawPad("right", pads.rightY, kindOf("right"), mine === "right" ? stMain : stOther);
    drawPad("left", pads.leftY2, "mate", null, 26);
    drawPad("right", pads.rightY2, "mate", null, 26);

    // who is who: "You" at the patient's edge, the star's rank at its own
    this._edgeLabel(ctx, c, mine, "You", PAD_COLS.patient[0]);
    if (star && !tut) this._edgeLabel(ctx, c, theirs, star.name, star.cols[0]);
    else if (this.isDuo) this._edgeLabel(ctx, c, theirs, this.opts.p2Name || "Player two", PAD_COLS.mate[0]);

    // the posture cue in a word, in the strip outside the patient's edge
    // (below the court in Abd-Add), beside the paddle it colours
    if (stMain.tag) {
      const e = P(this._edgeX(mine), this.wallBottom);
      let tx, ty, align;
      if (abd) { tx = c.width / 2; ty = e.y + 58; align = "center"; }
      else { tx = e.x + (this.patientRight ? 30 : -30); ty = e.y + 44; align = this.patientRight ? "right" : "left"; }
      ctx.save();
      ctx.fillStyle = stMain.cols[0];
      ctx.font = `800 ${Math.round(c.height * 0.021)}px Nunito, sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = "middle";
      ctx.fillText(stMain.tag, tx, ty);
      ctx.restore();
    }

    // sleepy z's over the star's paddle as a long rally wears it down — the
    // coming miss reads as earned, not random; never while it misreads a
    // shot (a sleepy cue over a lunge says the point was given, not won)
    const yawn = (this._tired || 0) / AI_FADE_MAX;
    if (this.hasAI && this.ball && !this._slip && !tut && yawn > 0.55) {
      const zp = this._padOutPx(theirs, this.aiY - this.paddleH / 2, 34);
      const ax = zp.x, ay = zp.y - 30;
      ctx.save();
      ctx.fillStyle = `rgba(190,190,200,${0.35 + 0.45 * yawn})`;
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

    if (tut) this._drawTut(ctx, c, now);

    if (this.serving) {
      const t = (now - this.serving.start) / 550;
      const beat = Math.floor(t), f = t - beat;
      if (beat >= 0 && beat < 3) {
        // the countdown ring: where the ball will start from
        const p = tut ? P(this._aiEdgeX() + (this.patientRight ? 0.02 : -0.02), this.aiY)
                      : P((this.court.left + this.court.right) / 2, (this.wallTop + this.wallBottom) / 2);
        ctx.strokeStyle = `rgba(244,236,221,${0.7 * (1 - f)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16 + f * 44, 0, TAU); ctx.stroke();
        this.glow(ctx, p.x, p.y, 10, "#ffffff", "#fff6d8", 14);
      }
    } else if (this.ball) {
      this._drawTrail(ctx, c, now);
      const bp = P(this.ball.x, this.ball.y);
      if (this.trick) this._drawTrickBall(ctx, c, now, bp);
      else {
        // squash and stretch: flattened against the paddle at the hit, then
        // drawn out along its flight, settling over 180 ms (not under calm motion)
        const age = now - (this.ball.squash || 0);
        ctx.save();
        if (age < 180 && !A11Y.calm) {
          const k = 1 - age / 180, sx = age < 50 ? 1 - 0.35 * k : 1 + 0.35 * k, sy = age < 50 ? 1 + 0.35 * k : 1 - 0.25 * k;
          const ang = Math.atan2(this.ball.vy, this.ball.vx) + (abd ? Math.PI / 2 : 0);
          ctx.translate(bp.x, bp.y); ctx.rotate(ang); ctx.scale(sx, sy); ctx.translate(-bp.x, -bp.y);
        }
        ctx.globalAlpha = this._ghostAlpha(this.ball);
        this.glow(ctx, bp.x, bp.y, 14, "#ffffff", "#fff6d8", 24);
        ctx.restore();
      }
    }
    // the floating words: "+20 EDGE", a power-up's name, rising and fading
    for (const f of this.floaters) {
      const k = (now - f.t) / FLOATER_MS, p = P(f.fx, f.fy);
      ctx.save();
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.fillStyle = f.col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(20,16,40,0.9)"; ctx.shadowBlur = 8;
      ctx.font = `800 ${Math.round(c.height * 0.03)}px Nunito, sans-serif`;
      ctx.fillText(f.text, p.x, p.y - k * c.height * 0.08);
      ctx.restore();
    }
    if (this.flash && now < this.flash.until) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (this.flash.until - now) / 1200) * 0.95;
      ctx.fillStyle = this.flash.col || "#9fc08a";
      ctx.shadowColor = "rgba(20,16,40,0.85)"; ctx.shadowBlur = 12;
      ctx.font = `800 ${Math.round(c.height * 0.05)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(this.flash.text, c.width / 2, c.height * 0.24);
      ctx.restore();
    }
    this._drawPointBreak(ctx, c, now);
    this._drawGameOver(ctx, c, now);
    ctx.restore();
  }

  // a name at an edge: above the rail in FE; beside the rail, at the end
  // away from the posture coach, in Abd-Add
  _edgeLabel(ctx, c, edge, text, col) {
    ctx.save();
    ctx.fillStyle = col; ctx.globalAlpha = 0.85;
    ctx.font = `700 ${Math.round(c.height * 0.021)}px Nunito, sans-serif`;
    ctx.textBaseline = "middle";
    if (this.axis !== "abd") {
      const p = this._P(this._edgeX(edge), this.wallTop);
      ctx.textAlign = "center";
      ctx.fillText(text, p.x, p.y - 14);
    } else {
      const y = this._P(this._edgeX(edge), this.wallTop).y;
      const onRight = !this.patientRight;
      ctx.textAlign = onRight ? "left" : "right";
      ctx.fillText(text, onRight ? PONG_ABD_X1 * c.width + 10 : PONG_ABD_X0 * c.width - 10, y);
    }
    ctx.restore();
  }

  // the tutorial's own marks: where the ball will land on the patient's
  // rail (with a dashed line from the ball, so "go where it is going" is
  // drawn, not explained), the three dots of the meet step, and the skip pill
  _drawTut(ctx, c, now) {
    const t = this.tut, b = this.ball, P = (fx, fy) => this._P(fx, fy);
    const mine = this._myEdge();
    const pulse = Math.sin(now / 300) * 0.5 + 0.5;
    ctx.save();
    if (b && Math.sign(b.vx) === (this.patientRight ? 1 : -1)) {
      const tRemain = Math.abs(this._edgeX(mine) - b.x) / Math.abs(b.vx || 1e-6);
      const ay = this._predictY(b.y, b.vy, tRemain);
      const q = P(this._edgeX(mine), ay), bp = P(b.x, b.y);
      ctx.setLineDash([6, 10]); ctx.strokeStyle = "rgba(255,217,138,0.4)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255,217,138,${0.5 + pulse * 0.4})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(q.x, q.y, 18 + pulse * 5, 0, TAU); ctx.stroke();
    }
    if (t.step === "meet") {
      for (let i = 0; i < 3; i++) {
        const x = c.width / 2 + (i - 1) * 30, y = c.height * 0.2;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU);
        if (i < t.n) { ctx.fillStyle = "#ffd98a"; ctx.fill(); }
        else { ctx.strokeStyle = "rgba(255,217,138,0.5)"; ctx.lineWidth = 2; ctx.stroke(); }
      }
    }
    const sx = c.width - 115, sy = 62;
    ctx.fillStyle = "rgba(20,16,40,0.85)";
    ctx.strokeStyle = "rgba(244,236,221,0.6)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(sx - 75, sy - 26, 150, 52, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f4ecdd";
    ctx.font = `800 ${Math.round(c.height * 0.03)}px Nunito, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("Skip ✋", sx, sy + 9);
    if (t.skipDwell) {
      const f = Math.min(1, (now - t.skipDwell) / 1200);
      ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(sx, sy, 36, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    }
    ctx.restore();
  }

  // THE TRICK LOADER: a paddle that catches fire. It fills from the handle
  // up over TRICK_AT seconds of the point, flames licking along the fill
  // line, and when it is full the whole thing burns, with flames above the
  // head and sparks rising: the next return is the trick. The fire is in
  // the coming trick's own colours and its name is beside the paddle, so
  // which trick is loading is visible all along. The seconds left sit in
  // the head, so it is a clock as well as a promise. Calm motion keeps the
  // fill and drops the flicker.
  _drawRacket(ctx, c, now) {
    const rt = this.gameT(now);
    const f = Math.min(1, rt / TRICK_AT);
    const ready = f >= 1;
    const T = this.nextTrick || TRICKS[0], K = T.cols;
    const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
    // bigger since Sep 2026 (by request): the head is 9% of the screen's
    // height and the court's top rail sits below the handle
    const R = Math.round(c.height * 0.045);
    const cx = c.width / 2, cy = Math.round(c.height * 0.062);
    const hw = R * 0.24, hTop = cy + R * 0.85, hBot = cy + R * 1.95;   // the handle
    const top = cy - R, H = hBot - top;
    const calm = A11Y.calm;
    const flick = (i, sp = 90) => calm ? 0.5 : Math.sin(now / sp + i * 1.7) * 0.5 + 0.5;
    const pulse = calm ? 0.5 : Math.sin(now / 240) * 0.5 + 0.5;
    const shape = () => {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.roundRect(cx - hw, hTop, hw * 2, hBot - hTop, hw);
    };
    ctx.save();
    if (ready) { ctx.shadowColor = rgba(K[2], 0.9); ctx.shadowBlur = 14 + pulse * 18; }
    shape(); ctx.fillStyle = "rgba(20,16,40,0.7)"; ctx.fill();   // dark wood
    ctx.shadowBlur = 0;
    if (f > 0) {
      ctx.save(); shape(); ctx.clip();
      const fy = hBot - f * H;                                     // the fire line
      const g = ctx.createLinearGradient(0, hBot, 0, Math.min(fy, hBot - 1));
      g.addColorStop(0, K[3]); g.addColorStop(0.55, K[2]); g.addColorStop(1, ready ? K[0] : K[1]);
      ctx.fillStyle = g;
      ctx.fillRect(cx - R - 2, fy, R * 2 + 4, hBot - fy + 2);
      // tongues of flame along the fire line
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = cx - R + (i + 0.5) * (2 * R / n);
        if (Math.abs(x - cx) > (fy > hTop ? hw : R * 0.98)) continue;   // inside the paddle at that height
        const h = R * (0.35 + 0.55 * flick(i)) * (ready ? 1.4 : 1);
        ctx.fillStyle = i % 2 ? rgba(K[1], 0.95) : rgba(K[2], 0.9);
        ctx.beginPath();
        ctx.moveTo(x - R * 0.13, fy + 2);
        ctx.quadraticCurveTo(x + (flick(i + 3, 130) - 0.5) * R * 0.3, fy - h * 0.6, x, fy - h);
        ctx.quadraticCurveTo(x + R * 0.1, fy - h * 0.5, x + R * 0.13, fy + 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (ready && !calm) {
      // ablaze: flames climb above the head and sparks rise off it
      for (let i = 0; i < 5; i++) {
        const x = cx + (i - 2) * R * 0.42;
        const h = R * (0.5 + 0.7 * flick(i, 70));
        ctx.fillStyle = i % 2 ? rgba(K[1], 0.85) : rgba(K[2], 0.8);
        ctx.beginPath();
        ctx.moveTo(x - R * 0.16, cy - R * 0.6);
        ctx.quadraticCurveTo(x + (flick(i + 5, 110) - 0.5) * R * 0.4, cy - R - h * 0.5, x, cy - R - h);
        ctx.quadraticCurveTo(x + R * 0.16, cy - R - h * 0.4, x + R * 0.16, cy - R * 0.6);
        ctx.fill();
      }
      for (let i = 0; i < 8; i++) {
        const ph = (now / 900 + i * 0.137) % 1;
        const x = cx + Math.sin(i * 2.3 + now / 400) * R * 1.3;
        const y = cy - R * 0.5 - ph * R * 2.6;
        ctx.globalAlpha = (1 - ph) * 0.9;
        ctx.fillStyle = i % 3 ? K[1] : K[0];
        ctx.beginPath(); ctx.arc(x, y, 1.5 + (1 - ph) * 1.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    shape(); ctx.strokeStyle = ready ? rgba(K[0], 0.9) : "rgba(244,236,221,0.45)"; ctx.lineWidth = 2.5; ctx.stroke();
    // the seconds left, in the head; the caption beside the paddle
    ctx.fillStyle = "#fff6d8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(20,16,40,0.9)"; ctx.shadowBlur = 6;
    ctx.font = `800 ${Math.round(c.height * 0.04)}px Nunito, sans-serif`;
    ctx.fillText(ready ? "✦" : String(Math.ceil(TRICK_AT - rt)), cx, cy + 1);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
    ctx.font = `800 ${Math.round(c.height * 0.026)}px Nunito, sans-serif`;
    ctx.fillStyle = ready ? rgba(K[1], 0.6 + pulse * 0.4) : "rgba(244,236,221,0.75)";
    ctx.fillText(ready ? `${T.word} hit the ball to end the game` : `${T.name.toLowerCase()} in ${Math.ceil(TRICK_AT - rt)} s`, cx + R * 1.4, cy + 1);
    ctx.restore();
  }
  // the game clock without a star to smash (bimanual, companion, duo): a
  // line along the top that shrinks from both ends over the game, with the
  // seconds left in the middle
  _drawGameClock(ctx, c, now) {
    const len = TRICK_AT;
    const left = Math.max(0, len - this.gameT(now));
    const f = left / len;
    ctx.save();
    ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(c.width * (0.5 - 0.3 * f), c.height * 0.035); ctx.lineTo(c.width * (0.5 + 0.3 * f), c.height * 0.035); ctx.stroke();
    ctx.fillStyle = "#fff6d8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(20,16,40,0.9)"; ctx.shadowBlur = 6;
    ctx.font = `800 ${Math.round(c.height * 0.034)}px Nunito, sans-serif`;
    ctx.fillText(`${Math.ceil(left)} s`, c.width / 2, c.height * 0.075);
    ctx.restore();
  }

  // THE TRICK BALL, each trick drawn as itself:
  //   smash    a fireball with a flickering ring
  //   curve    a violet ball with a crescent turning about it, the way it bends
  //   ghost    the ball fading to a shimmer across the middle and back
  //   zigzag   a gold ball throwing short lightning sparks
  //   feather  a soft green ball that sways while it floats, a streak once it darts
  _drawTrickBall(ctx, c, now, bp) {
    const b = this.ball, T = this.trick, K = T.cols;
    const calm = A11Y.calm;
    const pulse = calm ? 0.5 : Math.sin(now / 60) * 0.5 + 0.5;
    ctx.save();
    switch (T.key) {
      case "ghost": {
        const a = this._ghostAlpha(b);
        ctx.globalAlpha = a;
        this.glow(ctx, bp.x, bp.y, 16, K[0], K[2], 30);
        if (a < 0.5) {   // a faint ring where it is, so the patient never loses it entirely
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = K[1]; ctx.lineWidth = 1.5; ctx.setLineDash([3, 6]);
          ctx.beginPath(); ctx.arc(bp.x, bp.y, 14 + pulse * 3, 0, TAU); ctx.stroke();
        }
        break;
      }
      case "curve": {
        this.glow(ctx, bp.x, bp.y, 17, K[0], K[2], 32);
        ctx.strokeStyle = K[1]; ctx.lineWidth = 3;
        const a = calm ? 0 : now / 110;
        ctx.beginPath(); ctx.arc(bp.x, bp.y, 22, a, a + Math.PI * 1.1); ctx.stroke();
        break;
      }
      case "zigzag": {
        this.glow(ctx, bp.x, bp.y, 17, K[0], K[2], 34);
        ctx.strokeStyle = K[1]; ctx.lineWidth = 2; ctx.lineCap = "round";
        for (let i = 0; i < 4; i++) {   // short jagged sparks, turning with time
          const a0 = (calm ? i * 1.6 : now / 140 + i * 1.6), r0 = 20, r1 = 30 + pulse * 6;
          const mx = bp.x + Math.cos(a0 + 0.3) * (r0 + r1) / 2, my = bp.y + Math.sin(a0 + 0.3) * (r0 + r1) / 2;
          ctx.beginPath();
          ctx.moveTo(bp.x + Math.cos(a0) * r0, bp.y + Math.sin(a0) * r0);
          ctx.lineTo(mx, my);
          ctx.lineTo(bp.x + Math.cos(a0 - 0.2) * r1, bp.y + Math.sin(a0 - 0.2) * r1);
          ctx.stroke();
        }
        break;
      }
      case "feather": {
        if (!b.darted) {
          const sway = calm ? 0 : Math.sin(now / 260) * 5;
          this.glow(ctx, bp.x + sway, bp.y, 15, K[0], K[2], 26);
          ctx.globalAlpha = 0.6; ctx.strokeStyle = K[1]; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(bp.x + sway, bp.y, 24, 12, calm ? 0 : Math.sin(now / 500) * 0.4, 0, TAU); ctx.stroke();
        } else {
          this.glow(ctx, bp.x, bp.y, 19 + pulse * 3, K[0], K[2], 36);
        }
        break;
      }
      default: {   // smash: the fireball
        this.glow(ctx, bp.x, bp.y, 20 + pulse * 5, K[0], K[2], 40);
        ctx.strokeStyle = `rgba(255,140,60,${0.5 + pulse * 0.4})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bp.x, bp.y, 26 + pulse * 6, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // TRAIL RENDERER: a comet tail of fading, shrinking discs behind the ball.
  // A rally leaves a short cream tail; a trick leaves a long one in its own
  // colours, white-hot to deep with age, and the smash sheds embers. The
  // ghost's tail fades with the ghost (each sample keeps the alpha it was
  // drawn at), and the feather's stays short until it darts.
  _drawTrail(ctx, c, now) {
    const T = this.trick, b = this.ball;
    const long = !!T && !(T.key === "feather" && b && !b.darted);
    const life = long ? TRICK_TRAIL_MS : TRAIL_MS;
    const fire = T ? T.cols : null;
    for (const p of this.trail) {
      const age = Math.min(1, (now - p.t) / life);
      if (age >= 1) continue;
      const r = (long ? 16 : 9) * (1 - age) + 1;
      const q = this._P(p.x, p.y);
      ctx.globalAlpha = (long ? 0.75 : 0.35) * (1 - age) * (p.a ?? 1);
      ctx.fillStyle = fire ? fire[Math.min(3, Math.floor(age * 4))] : "#fff6d8";
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
      if (T?.key === "smash" && !A11Y.calm) {
        const j = ((p.t * 7) % 13) / 13;                            // ember, deterministic per sample
        ctx.globalAlpha *= 0.6;
        ctx.beginPath(); ctx.arc(q.x + (j - 0.5) * 30 * age, q.y - age * 26 * (0.5 + j), 2, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // the ceremony between points, drawn over the court for POINT_BREAK_MS:
  // the patient's point pops in big under a slowly turning sunburst with the
  // scoreline beneath; the star's point is a soft lavender card that dims
  // the court a little and promises the next serve. Both fade out at the
  // end. Nothing here says "miss" or "lost".
  _drawPointBreak(ctx, c, now) {
    const pb = this.pointBreak;
    if (!pb) return;
    const t = (now - pb.at) / POINT_BREAK_MS;
    const k = Math.min(1, t / 0.15);
    const pop = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3)) + (k < 1 && !A11Y.calm ? 0.15 * Math.sin(k * Math.PI) : 0);
    const alpha = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
    const cx = c.width / 2, cy = c.height * 0.42;
    const us = this.score.us, them = this.score.ai;
    const won = pb.who === "us";
    const scored = this.hasAI || this.isDuo;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!won) {
      ctx.fillStyle = "rgba(20,16,40,0.28)"; ctx.fillRect(0, 0, c.width, c.height);
    } else {
      // sunburst: twelve soft rays turning slowly behind the word
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(A11Y.calm ? 0 : now / 4000);
      const Rr = c.height * 0.55;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = pb.trick ? "rgba(255,255,255,0.09)" : "rgba(255,217,138,0.11)";
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, Rr, i * TAU / 12, i * TAU / 12 + TAU / 24); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.translate(cx, cy); ctx.scale(pop, pop);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(20,16,40,0.85)"; ctx.shadowBlur = 16;
    const big = Math.round(c.height * (won ? 0.11 : 0.075));
    ctx.font = `800 ${big}px Nunito, sans-serif`;
    ctx.fillStyle = won ? (pb.trick ? pb.trick.cols[1] : "#ffd98a") : "#c9c9d3";
    const p2 = this.opts.p2Name || "player two";
    ctx.fillText(won ? (pb.trick ? pb.trick.word : "POINT!") : this.isDuo ? `${p2}'s point` : scored ? "The star's point" : "Ball away", 0, -big * 0.35);
    if (scored) {
      ctx.font = `800 ${Math.round(c.height * 0.075)}px Nunito, sans-serif`;
      ctx.fillStyle = "#fff6d8";
      ctx.fillText(`${us}  –  ${them}`, 0, big * 0.55);
      ctx.font = `700 ${Math.round(c.height * 0.022)}px Nunito, sans-serif`;
      ctx.fillStyle = "rgba(244,236,221,0.8)";
      ctx.fillText(`you          ${this.isDuo ? p2 : "the star"}`, 0, big * 0.55 + c.height * 0.055);
      const note = this.trickReady(now) ? "the smash is ready: hit the next ball"
        : "next serve coming";
      ctx.fillText(note, 0, big * 0.55 + c.height * 0.095);
    } else {
      ctx.font = `700 ${Math.round(c.height * 0.024)}px Nunito, sans-serif`;
      ctx.fillStyle = "rgba(244,236,221,0.8)";
      ctx.fillText("next serve coming", 0, big * 0.5);
    }
    ctx.restore();
  }

  // the final board, held while the match is over: GAME!, the scoreline,
  // and the outcome in a sentence, before the round ends on it
  _drawGameOver(ctx, c, now) {
    if (!this.matchOver) return;
    const t = (now - this.matchOver) / 600;
    const pop = 0.7 + 0.3 * Math.min(1, t);
    const us = this.score.us, them = this.score.ai, won = us > them, draw = us === them;
    const scored = this.hasAI || this.isDuo;
    ctx.save();
    ctx.fillStyle = "rgba(20,16,40,0.35)"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height * 0.42); ctx.scale(pop, pop);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(20,16,40,0.85)"; ctx.shadowBlur = 16;
    const big = Math.round(c.height * 0.12);
    ctx.font = `800 ${big}px Nunito, sans-serif`;
    ctx.fillStyle = won ? (this._finalTrick ? this._finalTrick.cols[1] : "#ffd98a") : "#c9c9d3";
    ctx.fillText(this._finalTrick ? `${this._finalTrick.word} GAME!` : scored ? "GAME!" : "TIME!", 0, -big * 0.4);
    ctx.font = `800 ${Math.round(c.height * 0.08)}px Nunito, sans-serif`;
    ctx.fillStyle = "#fff6d8";
    ctx.fillText(scored ? `${us}  –  ${them}` : `best rally ${this.bestRally}`, 0, big * 0.5);
    ctx.font = `700 ${Math.round(c.height * 0.026)}px Nunito, sans-serif`;
    ctx.fillStyle = "rgba(244,236,221,0.85)";
    ctx.fillText(!scored ? "lovely rallies" : won ? "you won it!" : draw ? "a draw, well played" : "great rallies, next time it is yours", 0, big * 0.5 + c.height * 0.07);
    // the summary: style, the longest rally, the titles
    const T = this.titles || this._titles();
    const p2 = this.isDuo ? (this.opts.p2Name || "player two") : "the star";
    const two = this.isDuo || this.mode === "companion" || this.mode === "team-keys";
    const lines = [
      two ? `style  you ${this.pl.us.style} · ${p2} ${this.pl.them.style}` : `style ${this.pl.us.style}`,
      `longest rally ${this.bestRally}` + (this.pl.us.orbs ? ` · ${this.pl.us.orbs} orb${this.pl.us.orbs === 1 ? "" : "s"}` : ""),
    ];
    if (T.us.length) lines.push(`🏅 you: ${T.us.join(" · ")}`);
    if (two && T.them.length) lines.push(`🏅 ${p2}: ${T.them.join(" · ")}`);
    if (this.challenge) lines.push(this.challengeWon ? `challenge done by ${this.challengeWon === "us" ? "you" : p2}` : `challenge not taken: ${this.challenge.text.toLowerCase()}`);
    ctx.font = `700 ${Math.round(c.height * 0.024)}px Nunito, sans-serif`;
    ctx.fillStyle = "rgba(244,236,221,0.8)";
    lines.forEach((l, i) => ctx.fillText(l, 0, big * 0.5 + c.height * (0.12 + i * 0.038)));
    ctx.restore();
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

/* ==================== Lantern (candles): the Lamplighter of Lumen ==================== */
// Oct 2026, by request: rebuilt from mockups/lantern-game (1).zip, the
// "Lamplighter of Lumen" (Mira the lamplighter, Pip the owl, the Night
// Moth). The loop is the mockup's: hold the hand on the BASKET to take a
// candle, a LANTERN appears in the workspace (hidden until the candle is
// taken, so the first move out is a reaction), carry the flame to it (the
// candle burns down while it moves and stops burning while it is held
// inside the lantern), light it, and come back to the basket for the next
// candle. The basket moves left / centre / right between candles (a
// balanced shuffle, so the return is a different reach each time) while the
// lanterns stay where they are.
//
// Twenty-three levels in six stages (LUMEN_LEVELS / LUMEN_STAGES, the
// mockup's ladder verbatim): Reach (touch to light; more positions, smaller
// lanterns), Reach and Hold (hold inside until the ring fills), Colour Match
// (a decoy lantern; the candle's colour and glyph say which one), Number
// Trail (light in order; every finished trail reveals a constellation for
// the Star Atlas; level 16 alternates 1 A 2 B), the Night Moth (a no-go
// circle on the path with a dotted way round) and Moving Lights (the
// lantern glides along a track; from level 22 the basket drifts too). One
// level is one STRIVE round (LUMEN_ROUND_S of play); it moves up at
// LUMEN_UP lit with at least LUMEN_MIN candles and down below LUMEN_DOWN,
// banked as `candlesLevel`. Pip climbs a pole beside the stage towards a
// flag as the score grows (the mockup's target score: what a solid run
// would score under the same rules, later the patient's own best on that
// level plus 5%, kept per level in the `candlesLumen` progress bag with the
// Star Atlas); reaching the flag ends the level early with a celebration. A
// slow candle lets him slip a little, never all the way home: the mockup
// ends the level when he slides home, and that is a punishment for being
// slow, which this population does not need.
//
// STAGE TWO IS BIMANUAL (Oct 2026, by request): the candle comes out of the
// basket UNLIT. The trained hand carries it to the lantern and KEEPS it
// there; then the other hand reaches to the FIRE (a brazier on its own
// side, where the keeping hand's stand would be), takes the flame, brings
// it to the lantern, and with both hands held there the ring fills and the
// lantern lights. Reach and hold, with both hands: the candle hand holds a
// position while the flame hand reaches, then both hold together. The
// drawer's keeping-hand modes do not apply in this stage (both hands are
// busy), and the basket stays in the centre. `c.step` records the trial's
// progress: candle (to the lantern) → fire (the other hand to the brazier)
// → bring (the flame to the lantern); `tFire` is when the flame was taken.
//
// What stays STRIVE's: the ROM DISC (Oct 2026): a point is a fraction of
// the measured reach in its direction about the body centre, drawn as a
// circle filling the middle of the screen (`_geo`/`_px`, CANDLE_DISC_FILL),
// so a patient's full reach always covers the whole circle whatever its
// shape and however far from the camera they sit. The basket's home row is
// low on the disc (LUMEN_BASKET_Y) and every lantern position sits on the
// ray from that home at its angle (15°..165°, the mockup's arc) where it
// crosses the circle at the level's reach share (never past
// CANDLE_REACH_MAX), so a lantern is at exactly that share of THIS
// patient's reach in its own direction. No HUD numbers (project rule):
// Pip's pole and flag carry no figures, praise is words, and the score,
// combo and target are computed and logged for the therapist. The staff
// modes (`together` / `hold`) keep a second candle-stand for the keeping
// hand: the flame gutters when it drifts (CANDLE_HOLD_GRACE), lapses and
// `holdFrac` are logged; the basket stays put in those modes. A burnt-out
// or moth-blown candle is `miss()` (soft words; the DDA hears about it,
// and the DDA's `lifetime` sets how long a candle burns); a lit lantern
// is a hit with its reach fraction. Lighting is a dwell or a hold, never a
// squeeze: nothing is asked of the hand.
const CANDLE_REACH_MAX = 0.8;        // no lantern past this fraction of the measured reach, at any level
const CANDLE_BOX_R = 0.2;            // disc: capture radius at the keeping hand's stand (a rest point, so generous)
const CANDLE_DISC_FILL = 0.92;       // the disc's diameter as a fraction of the shorter screen side
const CANDLE_HAND_SMOOTH = 0.45;     // EMA weight of the newest hand sample in disc space
const CANDLE_HOLD_GRACE = 700;       // ms the keeping hand may drift off its stand before the flame gutters
const CANDLE_PROMPT_MS = 4200;
// The ladder, from the mockup: n = fixed lantern positions on the arc, size
// = lantern size (of LUMEN_LANTERN_R), hold = seconds inside to light, mode
// = colour | trail | trailAB, moth = the Night Moth on the path, move =
// target | both (lantern on a track; both = the basket drifts too), speed =
// back-and-forth cycles per second. `reach` eases the first two levels in.
const LUMEN_LEVELS = [
  { n: 3, size: 1.00, hold: 0, reach: 0.7 },
  { n: 5, size: 1.00, hold: 0, reach: 0.75 },
  { n: 5, size: 0.80, hold: 0 },
  { n: 7, size: 0.80, hold: 0 },
  { n: 7, size: 0.65, hold: 0 },
  { n: 3, size: 1.00, hold: 1.0 },
  { n: 5, size: 0.80, hold: 1.0 },
  { n: 7, size: 0.80, hold: 1.5 },
  { n: 7, size: 0.65, hold: 2.0 },
  { n: 9, size: 0.55, hold: 2.0 },
  { n: 5, size: 0.90, hold: 0, mode: "color" },
  { n: 7, size: 0.80, hold: 0, mode: "color" },
  { n: 7, size: 0.80, hold: 1.0, mode: "color" },
  { n: 5, size: 0.90, hold: 0, mode: "trail" },
  { n: 7, size: 0.80, hold: 0, mode: "trail" },
  { n: 8, size: 0.80, hold: 0, mode: "trailAB" },
  { n: 5, size: 0.90, hold: 0, moth: true },
  { n: 7, size: 0.80, hold: 1.0, moth: true },
  { n: 7, size: 0.80, hold: 0, moth: true, mode: "color" },
  { n: 5, size: 0.95, hold: 1.5, move: "target", speed: 0.18 },
  { n: 5, size: 0.85, hold: 2.0, move: "target", speed: 0.28 },
  { n: 5, size: 0.90, hold: 1.5, move: "both", speed: 0.2 },
  { n: 7, size: 0.80, hold: 2.0, move: "both", speed: 0.3 },
];
export const CANDLE_MAX = LUMEN_LEVELS.length;
export const LUMEN_STAGES = [
  { name: "Reach", from: 1, to: 5, skill: null, owl: "Hold your hand on the basket to take a candle." },
  { name: "Reach and hold, both hands", from: 6, to: 10, skill: "Something new: two hands. Carry the candle to the lantern and keep it there. Then reach to the fire with your other hand, bring the flame to the lantern, and hold both there until the ring fills.", owl: "Candle in one hand, flame in the other: hold both at the lantern." },
  { name: "Colour match", from: 11, to: 13, skill: "Something new: two lanterns. Your candle's colour and its little sign say which one to light.", owl: "Match your candle's colour." },
  { name: "Number trail", from: 14, to: 16, skill: "Something new: the lanterns are numbered. Light them in order, and a picture appears in the sky.", owl: "Light them in order: one, two, three." },
  { name: "The Night Moth", from: 17, to: 19, skill: "Something new: a moth waits on the way. Go round its red circle, along the dotted path.", owl: "Watch out for the Night Moth." },
  { name: "Moving lights", from: 20, to: 23, skill: "Something new: the lantern glides along its track. Follow it, and keep the flame inside.", owl: "Follow the moving lantern." },
];
const lumenStageOf = L => LUMEN_STAGES.findIndex(s => L >= s.from && L <= s.to);
const lumenModeOf = L => LUMEN_LEVELS[L - 1].mode || "reach";
const lumenIsChoice = L => lumenModeOf(L) !== "reach";
const lumenIsTrail = L => lumenModeOf(L).startsWith("trail");
// the story: one chapter per stretch of the ladder, its scene lighting up
// as the level's lanterns are lit (LUMEN_GOAL wakes it fully)
const LUMEN_STORY = [
  { key: "village", title: "The darkened village", owl: "Hoo! Light the village.",
    intro: "Long ago the Night Moth swept through the valley and put out every flame. Your grandmother left you a basket of candles that never runs empty.",
    more: "The far streets of Lumen are still asleep. They need their lanterns too.",
    win: "Windows glow, doors open, and people step out into the warm light. The lamplighter has returned!",
    part: "A few houses wake and peek outside. A good start, and the rest will follow." },
  { key: "river", title: "The river crossing", owl: "Light the bridge so travellers can cross.",
    intro: "Beyond the village the old bridge lies in darkness. Pip ruffles his feathers and points the way.",
    more: "More travellers are waiting at the riverbank. Light their way across.",
    win: "Lantern by lantern the bridge shimmers on the water, and the ferryman waves his hat.",
    part: "Part of the bridge glows on the water. Travellers can find their way, step by step." },
  { key: "forest", title: "The whispering forest", owl: "Golden lanterns hide star fragments.",
    intro: "The forest path is so dark that even the fireflies are hiding. Every lantern wakes a few of them.",
    more: "The deep forest is darker still. These old lanterns only catch when you hold the flame steady.",
    win: "The forest fills with dancing fireflies. They swirl around you and lead you to the mountain.",
    part: "A small swarm of fireflies wakes and follows you, lighting the path ahead." },
  { key: "tower", title: "The mountain beacon", owl: "Up we go. The beacon is waiting.",
    intro: "At the top of the mountain stands the great beacon. Each lantern on the path fills it a little more.",
    more: "The beacon is nearly full. A few more lanterns on the high path will set it ablaze.",
    win: "With a roar of golden light the beacon blazes, and the Night Moth flees beyond the hills.",
    part: "The beacon flickers awake and glows softly. The Night Moth has not won." },
  { key: "festival", title: "The festival of lights", owl: "Make the sky sparkle.",
    intro: "The darkness is broken. Tonight the valley gathers for the festival of lights, and the lamplighter sends the first lanterns into the sky.",
    more: "The grand finale. The festival wants the sky full of lanterns.",
    win: "The sky fills with lanterns and the whole valley cheers your name.",
    part: "Lanterns rise over the valley and the festival music begins." },
];
const lumenSceneOf = L => Math.min(LUMEN_STORY.length - 1, Math.floor((L - 1) * LUMEN_STORY.length / CANDLE_MAX));
// colour match: each colour also has a sign, for colour-blind players
const LUMEN_COLORS = [
  { name: "red", hex: "#ff5f5f", glyph: "♥" },
  { name: "blue", hex: "#4da6ff", glyph: "◆" },
  { name: "green", hex: "#4fdc7f", glyph: "▲" },
  { name: "purple", hex: "#c084ff", glyph: "★" },
];
// number trail: every finished trail uncovers one hidden constellation
// (points in a 0..1 box, lines join point indices)
const LUMEN_CONSTELLATIONS = [
  { name: "The Owl", lore: "That is my great-great-grandmother. She watched over Lumen.",
    pts: [[.25, 0], [.75, 0], [.15, .3], [.85, .3], [.38, .33], [.62, .33], [.25, .85], [.75, .85], [.5, .58]],
    lines: [[0, 2], [1, 3], [0, 4], [1, 5], [4, 5], [2, 6], [3, 7], [6, 7], [4, 8], [5, 8]] },
  { name: "The Whale", lore: "The sky whale swims across the night and brings the rain.",
    pts: [[0, .5], [.15, .3], [.45, .2], [.75, .3], [.88, .5], [.75, .7], [.4, .76], [.98, .22], [1, .7], [.22, .44]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [4, 7], [4, 8]] },
  { name: "The Fox", lore: "The star fox knows every secret path through the forest.",
    pts: [[.1, 0], [.3, .38], [.5, .16], [.7, .38], [.9, 0], [.5, .72], [.62, 1], [.98, .86]],
    lines: [[0, 2], [2, 4], [0, 1], [4, 3], [1, 5], [3, 5], [5, 6], [6, 7]] },
  { name: "The Deer", lore: "The sky deer leaps over the mountains every winter.",
    pts: [[.33, 0], [.22, .16], [.4, .22], [.67, 0], [.78, .16], [.6, .22], [.5, .42], [.5, .62], [.2, .66], [.8, .66], [.24, 1], [.76, 1]],
    lines: [[0, 1], [1, 2], [2, 6], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [7, 9], [8, 10], [9, 11]] },
  { name: "The Butterfly", lore: "Not every moth is a Night Moth. This one is a friend.",
    pts: [[.5, .2], [.5, .82], [.1, 0], [0, .42], [.5, .46], [.9, 0], [1, .42], [.15, .96], [.85, .96]],
    lines: [[0, 2], [2, 3], [3, 4], [4, 0], [0, 5], [5, 6], [6, 4], [4, 7], [7, 1], [4, 8], [8, 1], [0, 1]] },
  { name: "The Swan", lore: "The swan glides on the river of stars.",
    pts: [[.15, .1], [.25, 0], [.3, .2], [.3, .5], [.1, .7], [.5, .9], [.9, .75], [.75, .55], [.45, .6]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 3]] },
  { name: "The Fish", lore: "The ferryman says the star fish brings good luck.",
    pts: [[0, .5], [.25, .2], [.6, .25], [.76, .5], [.6, .75], [.25, .8], [1, .2], [1, .8], [.16, .45]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [6, 7], [7, 3]] },
  { name: "The Great Lantern", lore: "The very first lantern ever lit. You found it.",
    pts: [[.5, 0], [.3, .16], [.7, .16], [.2, .5], [.8, .5], [.3, .85], [.7, .85], [.5, 1]],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [1, 2], [5, 6]] },
];
const LUMEN_PRAISE = ["Lovely reach!", "Hoo-ray!", "Nice and smooth!", "Bright work!", "Wonderful!", "Keep it glowing!"];
const LUMEN_ROUND_S = 90;            // play time per level (the story, the level line and 3-2-1 come before it)
const LUMEN_GOAL = 10;               // lanterns that wake the chapter's scene fully
const LUMEN_UP = 0.8, LUMEN_DOWN = 0.5, LUMEN_MIN = 5;   // level up / down rule, min candles
const LUMEN_BASKET_Y = -0.62;        // disc: the basket's home row
const LUMEN_BASKET_SIDE = 0.22;      // disc: the left / right basket spots (near enough the low lanterns to be clear of them)
const LUMEN_MOVE_PEAK = 2.2;         // a moving lantern's peak speed, disc units/s, is this over the DDA's lifetime (clamped below)
const LUMEN_BASKET_R = 0.17;         // disc: hover radius at the basket
const LUMEN_LANTERN_R = 0.16;        // disc: lantern capture radius at size 1 (× A11Y.radiusScale)
const LUMEN_STAND = { x: 0.62, y: -0.55 };   // disc: the keeping hand's candle-stand, on its own side
const LUMEN_HOLD_GRACE = 400;        // ms out of the lantern a hold survives (tremor)
const LUMEN_SLOW_S = 10;             // a candle taking longer than this lets Pip slip
const LUMEN_GOLDEN = 0.15;           // share of plain-reach lanterns that are golden (a chime and a star fragment)
const LUMEN_MOVE_AMP = 45;           // degrees either side of a moving lantern's base angle
const LUMEN_DRIFT = 0.28;            // disc: the basket's drift either side of centre (levels 22 and 23)
const LUMEN_INTRO_S = 5.2, LUMEN_COUNT_S = 3;

const lumenSeed = i => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
const lumenRand = (a, b) => a + Math.random() * (b - a);
const lumenRi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const lumenShuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const lumenHexA = (h, a) => `rgba(${parseInt(h.substr(1, 2), 16)},${parseInt(h.substr(3, 2), 16)},${parseInt(h.substr(5, 2), 16)},${a})`;
const lumenMix = (a, b, t) => {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return "rgb(" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",") + ")";
};
const lumenDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// the scoring rule, one place (the mockup's `scoreParts`): per lantern =
// (100 + speed bonus 0..100 + steady hold 50 + challenge 50/50) × combo
// (1 + 0.25 per lantern in a row, max ×3) × level (1 + 0.1 per level)
// × golden ×2 × wrong-lantern-first ×0.4
function lumenScore({ speedFrac, holdSteady, choice, moth, combo, level, golden, clean }) {
  const base = 100, speed = Math.round(100 * speedFrac), hold = holdSteady ? 50 : 0, chal = (choice ? 50 : 0) + (moth ? 50 : 0);
  const raw = base + speed + hold + chal;
  const m1 = 1 + 0.25 * Math.min(combo, 8), m2 = 1 + 0.1 * (level - 1), g = golden ? 2 : 1, cl = clean ? 1 : 0.4;
  return { total: Math.round(raw * m1 * m2 * g * cl), speed, m1, m2 };
}

export class Candles extends GameBase {
  id = "candles";
  setup() {
    this.mode = ["solo", "together", "hold"].includes(this.opts.mode) ? this.opts.mode : "solo";
    const other = this.side === "right" ? "left" : "right";
    this.lightSide = this.mode === "hold" ? other : this.side;
    this.holdSide = this.mode === "solo" ? null : this.mode === "hold" ? this.side : other;
    this.level = Math.max(1, Math.min(CANDLE_MAX, this.opts.level || 1));
    this.lv = LUMEN_LEVELS[this.level - 1];
    this.stage = lumenStageOf(this.level);
    this.chap = lumenSceneOf(this.level);
    const pr = this.opts.lumen || {};
    this.prog = { best: { ...(pr.best || {}) }, atlas: [...(pr.atlas || [])], atlasNext: pr.atlasNext || 0, stars: { ...(pr.stars || {}) } };
    // how long a candle burns: from the DDA's lifetime, generous
    this.burnMax = Math.max(8, this.params.lifetime * 3);
    this.tips = {
      objective: "Hold your hand on the basket to take a candle.",
      miss: "No rush. Take another candle when you are ready.",
    };
    this.score = 0; this.combo = 0; this.bestCombo = 0; this.lit = 0; this.fail = 0; this.clean = 0; this.frags = 0; this.mothHits = 0;
    this.trials = []; this.cur = null; this.trialN = 0; this.prevTrial = null; this.returnStart = null;
    this.targets = []; this.seq = []; this.lastIdx = -1; this.target = null; this.moth = null; this.trail = null;
    this.homeSeq = []; this.home = 0; this.bph = 0;
    this.basket = { x: 0, y: LUMEN_BASKET_Y, hx: 0 };   // disc; hx = where it is heading
    this.stand = this.holdSide ? { x: (this.holdSide === "right" ? 1 : -1) * LUMEN_STAND.x, y: LUMEN_STAND.y } : null;
    // stage two: both hands (see the header). The fire sits on the other
    // hand's side; the keeping-hand modes stand down.
    this.bimanual = this.stage === 1;
    this.otherSide = other;
    if (this.bimanual) {
      this.holdSide = null; this.stand = null; this.lightSide = this.side;
      this.fire = { x: (other === "right" ? 1 : -1) * LUMEN_STAND.x, y: LUMEN_STAND.y };
    } else this.fire = null;
    this.matchLit = false;
    this.sky = []; this.texts = []; this.lightTrail = []; this.smoke = [];
    this.owl = { msg: "", life: 0, hop: 0, pos: 0 };
    this.targetScore = this._targetScoreFor(this.level); this.targetHit = false;
    this.slip = 0; this.slipping = false; this.slipWarned = false; this.cycleStart = 0; this.hasClimbed = false;
    this.endReason = "time"; this.endDelay = 0;
    this.goalHit = false; this.constellations = 0; this.revealed = []; this.revealFx = null; this.trailFx = null; this.popT = 0; this.lastShown = 0;
    this.held = false; this.lostSince = null; this.holdMs = 0; this.activeMs = 0; this.holdLapses = 0;
    this.burn = 0; this.holdT = 0; this.inside = false; this.outSince = null; this.insideWrong = false;
    this._sm = {}; this._lastH = null; this.clock = 0; this.playT = 0; this.cd = null; this.nearlySaid = false;
    this.stars = [];
    for (let i = 0; i < 140; i++) this.stars.push({ x: lumenSeed(i + 1), y: lumenSeed(i + 300) * 0.7, r: 0.3 + lumenSeed(i + 600) * 1.4, p: lumenSeed(i + 900) * TAU });
    this._buildTargets();
    this._setHome(this._nextHome(), true);
    this._spawnTarget();
    // before play: the story (round 1), the level's own line, then 3-2-1
    const storyMs = this.tellStory(STORIES.candles);
    this.introAt = storyMs / 1000;
    this.playAt = this.introAt + LUMEN_INTRO_S + LUMEN_COUNT_S;
    this.roundSeconds = this.playAt + LUMEN_ROUND_S;
    this.phase = "story";          // story | intro | countdown | toBasket | carrying | over
  }

  // ---- the ROM disc ----
  _geo() {
    const c = this.canvas;
    return { cx: c.width / 2, cy: c.height / 2, Rs: Math.min(c.width, c.height) * CANDLE_DISC_FILL / 2, U: Math.min(c.width, c.height) };
  }
  _px(d) { const g = this._geo(); return { x: g.cx + d.x * g.Rs, y: g.cy - d.y * g.Rs }; }
  _disc(side) {
    const h = this.t.palmRel(side) || this.t.handRel(side);
    if (!h) { delete this._sm[side]; return null; }
    const dx = h.x - CENTER.x, dy = h.y - CENTER.y;
    const r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const f = Math.min(1.25, r / Math.max(0.2, this.envAt(th)));
    const raw = { x: Math.cos(th) * f, y: Math.sin(th) * f };
    const s = this._sm[side];
    if (!s) return (this._sm[side] = raw);
    s.x += (raw.x - s.x) * CANDLE_HAND_SMOOTH; s.y += (raw.y - s.y) * CANDLE_HAND_SMOOTH;
    return s;
  }
  _near(side, pos, radius) {
    const d = this._disc(side);
    return !!d && Math.hypot(d.x - pos.x, d.y - pos.y) < radius;
  }
  _lanternR() { return LUMEN_LANTERN_R * this.lv.size * (A11Y.radiusScale || 1); }
  _reach() { return Math.min(CANDLE_REACH_MAX, this.lv.reach ?? CANDLE_REACH_MAX); }

  // a lantern position: on the ray from the basket's home at angle a (0 =
  // right, 90 = up, 180 = left) where it crosses the circle at the level's
  // reach share (× rs for the moving track), never nearer the basket than a
  // lantern and a half
  _anglePos(a, rs = 1) {
    const reach = Math.min(0.92, this._reach() * rs);
    const H = { x: 0, y: LUMEN_BASKET_Y };
    const u = { x: Math.cos(a * Math.PI / 180), y: Math.sin(a * Math.PI / 180) };
    const hu = H.x * u.x + H.y * u.y, hh = H.x * H.x + H.y * H.y;
    const disc = Math.max(0, hu * hu - hh + reach * reach);
    let t = -hu + Math.sqrt(disc);
    t = Math.max(t, LUMEN_BASKET_R + this._lanternR() * 1.8);
    // and clear of every spot the basket can sit at (the low lanterns at
    // the ends of the arc pass close to the side spots): pushed out along
    // the ray, never past the rim
    const minD = LUMEN_BASKET_R + this._lanternR() * 1.5;
    const tMax = -hu + Math.sqrt(Math.max(0, hu * hu - hh + 0.92 * 0.92));
    const spots = [-LUMEN_BASKET_SIDE, 0, LUMEN_BASKET_SIDE].map(x => ({ x, y: LUMEN_BASKET_Y }));
    for (let k = 0; k < 40 && t < tMax; k++) {
      const p = { x: H.x + u.x * t, y: H.y + u.y * t };
      if (spots.every(s => lumenDist(p, s) >= minD)) break;
      t = Math.min(tMax, t + 0.02);
    }
    return { x: H.x + u.x * t, y: H.y + u.y * t };
  }
  // a moving lantern's rate: the level's cycles per second, capped so its
  // peak speed along the track suits THIS patient (quicker as the DDA's
  // lifetime shortens). The mockup's speeds are for a mouse.
  _moveSpeed(base) {
    const [lo, hi] = this._moveRange(base);
    const H = { x: 0, y: LUMEN_BASKET_Y };
    // the track's farthest point from the basket's home is where it moves fastest
    const dist = Math.max(...[lo, (lo + hi) / 2, hi].map(a => lumenDist(H, this._anglePos(a))));
    const peakAllowed = Math.max(0.4, Math.min(1.4, LUMEN_MOVE_PEAK / Math.max(1, this.params.lifetime)));
    // peak linear speed at 1 cycle/s: the sweep, plus the in-and-out at twice the rate
    const perCycle = dist * (hi - lo) / 2 * Math.PI / 180 * TAU + 0.18 * this._reach() * 2 * TAU;
    return Math.min(this.lv.speed, peakAllowed / Math.max(0.1, perCycle));
  }
  _buildTargets() {
    const n = this.lv.n;
    this.targets = [];
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? 90 : 15 + i * 150 / (n - 1);
      const p = this._anglePos(a);
      // visual-field policy: in comfort mode a position on the cut side is
      // left out of the draw when enough remain (scan mode keeps them all)
      const cut = A11Y.field === "left" ? p.x < -0.05 : A11Y.field === "right" ? p.x > 0.05 : false;
      this.targets.push({ i, ang: Math.round(a * 10) / 10, x: p.x, y: p.y, cut });
    }
  }
  _moveRange(base) {
    let lo = base - LUMEN_MOVE_AMP, hi = base + LUMEN_MOVE_AMP;
    if (lo < 10) { hi += 10 - lo; lo = 10; } if (hi > 170) { lo -= hi - 170; hi = 170; }
    return [Math.max(10, lo), Math.min(170, hi)];
  }
  _trackPos(mv, ph) {
    const [lo, hi] = this._moveRange(mv.base);
    const a = (lo + hi) / 2 + (hi - lo) / 2 * Math.sin(ph);
    return { a, ...this._anglePos(a, 1 + 0.18 * Math.sin(2 * ph)) };
  }
  _homeX(side) {
    if (!side) return 0;
    return side * LUMEN_BASKET_SIDE;
  }
  _nextHome() {
    if (this.holdSide || this.bimanual || this.lv.move === "both") return 0;   // the keeping hand's stand (or the fire) needs the basket to stay put
    if (!this.homeSeq.length) {
      let a; do { a = lumenShuffle([-1, 0, 1]); } while (a[0] === this.home);
      this.homeSeq = a;
    }
    return this.homeSeq.shift();
  }
  _setHome(side, instant) {
    this.home = side; this.basket.hx = this._homeX(side);
    if (instant) this.basket.x = this.basket.hx;
  }
  _nextIdx() {
    if (!this.seq.length) {
      let pool = this.targets.map(p => p.i);
      if (A11Y.field !== "none" && A11Y.fieldMode === "comfort") {
        const kept = this.targets.filter(p => !p.cut).map(p => p.i);
        if (kept.length >= 2) pool = kept;
      }
      do { lumenShuffle(pool); } while (pool.length > 1 && pool[0] === this.lastIdx);
      this.seq = pool;
    }
    return this.seq.shift();
  }
  _trailLabels(n, ab) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(ab ? (k % 2 === 0 ? "" + (k / 2 + 1) : "ABCDEFGH"[(k - 1) / 2]) : "" + (k + 1));
    return out;
  }
  _newTrail() {
    const n = this.targets.length, seqL = this._trailLabels(n, lumenModeOf(this.level) === "trailAB");
    const order = lumenShuffle([...Array(n).keys()]);
    const labels = new Array(n);
    order.forEach((pos, k) => { labels[pos] = seqL[k]; });
    this.trail = { labels, order, k: 0, lit: [], fig: this.prog.atlasNext % LUMEN_CONSTELLATIONS.length };
  }
  _spawnTarget() {
    const mode = lumenModeOf(this.level);
    let i;
    if (lumenIsTrail(this.level)) {
      if (!this.trail || this.trail.k >= this.trail.order.length) this._newTrail();
      i = this.trail.order[this.trail.k];
    } else i = this._nextIdx();
    this.lastIdx = i;
    const p = this.targets[i];
    this.target = { i, ang: p.ang, x: p.x, y: p.y, r: this._lanternR(),
                    golden: mode === "reach" && !this.lv.moth && !this.lv.move && Math.random() < LUMEN_GOLDEN,
                    born: this.clock, match: null, decoys: [], reachFrac: Math.hypot(p.x, p.y) };
    if (mode === "color" && this.targets.length > 1) {
      const ci = lumenRi(0, LUMEN_COLORS.length - 1);
      let di; do { di = lumenRi(0, LUMEN_COLORS.length - 1); } while (di === ci);
      let j; do { j = lumenRi(0, this.targets.length - 1); } while (j === i);
      const c = LUMEN_COLORS[ci], d = LUMEN_COLORS[di], q = this.targets[j];
      this.target.match = { cue: c.glyph, cueName: c.name, tint: c.hex, label: c.glyph, key: c.name };
      this.target.decoys = [{ i: j, ang: q.ang, x: q.x, y: q.y, label: d.glyph, tint: d.hex, key: d.name, shake: 0 }];
    } else if (lumenIsTrail(this.level)) {
      const lab = this.trail.labels;
      this.target.match = { cue: lab[i], cueName: lab[i], tint: null, label: lab[i], key: lab[i] };
      this.target.decoys = this.targets.filter(q => q.i !== i && !this.trail.lit.includes(q.i))
        .map(q => ({ i: q.i, ang: q.ang, x: q.x, y: q.y, label: lab[q.i], tint: null, key: lab[q.i], shake: 0 }));
    }
    this.moth = this.lv.moth ? this._placeMoth(this.target) : null;
    if (this.lv.move) this.target.move = { base: p.ang, ph: lumenRand(0, TAU), speed: this._moveSpeed(p.ang) };
  }
  // the Night Moth: on the straight way from the basket's coming home to the
  // lantern, a little off the line, touching neither
  _placeMoth(tg) {
    const r = Math.max(tg.r * 0.85, 0.1);
    const b = { x: this.basket.hx, y: LUMEN_BASKET_Y };
    const dx = tg.x - b.x, dy = tg.y - b.y, L = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 20; k++) {
      const t = lumenRand(0.38, 0.62), off = lumenRand(-0.25, 0.25) * tg.r;
      const x = b.x + dx * t - dy / L * off, y = b.y + dy * t + dx / L * off;
      if (Math.hypot(x - tg.x, y - tg.y) > tg.r + r + 0.03 && Math.hypot(x - b.x, y - b.y) > LUMEN_BASKET_R + r + 0.03)
        return { x0: x, y0: y, x, y, r, ph: lumenRand(0, TAU), flee: 0 };
    }
    return null;   // the reach is too short for a moth to fit safely
  }

  // ---- the target score and Pip's climb ----
  _expectedLanterns(L) {
    const lv = LUMEN_LEVELS[L - 1];
    const cycle = A11Y.dwellMs / 1000 + 5 + lv.hold + (lumenIsChoice(L) ? 1 : 0) + (lv.moth ? 0.8 : 0) + (lv.move ? 1 : 0);
    return Math.max(3, Math.floor(0.8 * LUMEN_ROUND_S / cycle));
  }
  _expectedScore(L) {
    const lv = LUMEN_LEVELS[L - 1], n = this._expectedLanterns(L);
    let sum = 0;
    for (let k = 0; k < n; k++) sum += lumenScore({ speedFrac: 0.5, holdSteady: lv.hold > 0, choice: lumenIsChoice(L), moth: !!lv.moth, combo: k, level: L, golden: false, clean: true }).total;
    if (lumenIsTrail(L)) sum += Math.floor(n / lv.n) * Math.round(300 * (1 + 0.1 * (L - 1)));
    return sum;
  }
  _targetScoreFor(L) {
    const best = this.prog.best[L];
    return Math.max(50, Math.round((best ? best * 1.05 : this._expectedScore(L)) / 50) * 50);
  }
  _climb() { return Math.max(0, this.score - this.slip); }

  // ---- words ----
  _say(main, sub, spoken) {
    this._prompt(main, sub);
    clearTimeout(this._promptTimer);
    this._promptTimer = setTimeout(() => { if (this.active) this._prompt(""); }, CANDLE_PROMPT_MS);
    if (spoken !== false) this._speak(spoken || main);
  }
  // Pip's bubble: short, hooted, never spoken (the therapist voice is `say`)
  _pip(msg, life = 2.6) {
    this.owl.msg = msg; this.owl.life = life; this.owl.hop = 0.9;
    audio.lumen("hoot");
  }
  _text(d, s, col, size) { const p = this._px(d); this.texts.push({ x: p.x, y: p.y, s, col, size, life: 1.2 }); }
  _textPx(x, y, s, col, size) { this.texts.push({ x, y, s, col, size, life: 1.2 }); }
  _askBasket() {
    if (this.holdSide && !this.held) {
      this._say(`Keep the candle on its stand with your ${this.holdSide} hand`, "Hold it there, and keep it there");
      return;
    }
    const hand = this.holdSide ? `your ${this.lightSide} hand` : "your hand";
    this.tips.objective = "Hold your hand on the basket to take a candle.";
    if (this.trialN === 0) this._say("Take a candle from the basket", `Hold ${hand} on the basket`);
    else this._prompt("Back to the basket", "for the next candle");
  }
  _sayLevel() {
    const st = LUMEN_STAGES[this.stage], sc = LUMEN_STORY[this.chap];
    const firstOfScene = this.level === 1 || lumenSceneOf(this.level - 1) !== this.chap;
    const newSkill = st.skill && this.level === st.from ? st.skill : null;
    const line = newSkill || (firstOfScene ? sc.intro : sc.more);
    this._prompt(`${sc.title}`, `${st.name}. ${line}`);
    this._speak(`${st.name}. ${line}`);
  }

  // ---- the candle's life ----
  _pickup(now) {
    this.phase = "carrying";
    this.burn = this.burnMax; this.holdT = 0; this.inside = false; this.outSince = null; this.insideWrong = false;
    this.trialN++;
    const tg = this.target, lv = this.lv;
    this.cur = { trial: this.trialN, level: this.level, angle: tg.ang, golden: tg.golden,
      reachFrac: Math.round(tg.reachFrac * 100) / 100, targetR: Math.round(tg.r * 100) / 100, holdReq: lv.hold,
      basket: ["left", "centre", "right"][(this.home || 0) + 1],
      tPickup: this.playT, tLeave: null, leave: null, tEnter: null, lastEnter: null, path: 0, eff: null, peak: 0,
      holdBreaks: 0, outcome: "", mt: null, rt: null, returnTime: null, points: 0,
      challenge: lumenModeOf(this.level), cue: tg.match ? tg.match.cueName : "",
      firstChoice: "", wrongTouches: 0, moth: this.moth ? 1 : 0, mothHit: 0, minClear: null, warned: false, success: 0,
      bimanual: this.bimanual ? 1 : 0, step: this.bimanual ? "candle" : null, tFire: null };
    tg.born = this.clock;
    this.matchLit = false; this.matchOut = null;
    this._burstAt(this.basket, "#ffd27a", 10);
    audio.lumen("pickup");
    if (this.bimanual) {
      this.tips.objective = `Carry the candle to the lantern and keep it there. Then fetch the flame from the fire with your ${this.otherSide} hand and bring it to the lantern.`;
      if (this.trialN === 1) this._say("Carry the candle to the lantern", `Keep it there, then fetch the flame with your ${this.otherSide} hand`, this.tips.objective);
      else this._prompt("");
      return;
    }
    this.tips.objective = lv.hold ? "Carry the flame to the lantern, and hold it inside until the ring fills."
      : tg.match ? (lumenIsTrail(this.level) ? "Light the lanterns in order. The number on your candle is the next one." : "Light the lantern that matches your candle's colour.")
      : this.moth ? "Carry the flame to the lantern, round the moth."
      : "Carry the flame to the lantern.";
    if (this.trialN === 1) this._say("Carry the flame to the lantern", lv.hold ? "Hold it inside until the ring fills" : tg.match ? "The sign on your candle says which" : "", this.tips.objective);
    else this._prompt("");
  }
  _hitQuiet(reachFrac) {   // GameBase.hit without its note: the bell below is the sound
    this.stats.hits++; this.stats.stars += 10;
    if (reachFrac) this.stats.reachFracs.push(reachFrac);
    this.fb.lastEvent = performance.now(); this.fb.hitStreak++; this.fb.missStreak = 0;
  }
  _light(now) {
    const c = this.cur, tg = this.target, lv = this.lv;
    this.matchLit = false; this.matchOut = null;
    c.tEnd = this.playT; c.outcome = "lit";
    c.mt = Math.round(((c.tEnter ?? this.playT) - (c.tLeave ?? c.tPickup)) * 100) / 100;
    c.holdDur = c.holdReq > 0 ? Math.round((this.playT - c.lastEnter) * 100) / 100 : 0;
    const clean = !lumenIsChoice(this.level) || c.firstChoice === "correct";
    c.success = clean ? 1 : 0;
    if (clean) this.clean++;
    const P = lumenScore({ speedFrac: Math.max(0, this.burn / this.burnMax), holdSteady: c.holdReq > 0 && c.holdBreaks === 0,
      choice: lumenIsChoice(this.level), moth: !!c.moth, combo: this.combo, level: this.level, golden: tg.golden, clean });
    c.points = P.total;
    this.score += P.total;
    audio.lumen("light", this.combo, tg.golden);
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.lit++;
    this._hitQuiet(tg.reachFrac);
    // praise in words, never points
    if (c.holdReq > 0 && c.holdBreaks === 0) this._text({ x: tg.x, y: tg.y + tg.r * 1.7 }, "Steady hand!", "#c9b8ff", 22);
    else if (P.speed > 80) this._text({ x: tg.x, y: tg.y + tg.r * 1.7 }, "Swift!", "#9fe8ff", 22);
    else this._text({ x: tg.x, y: tg.y + tg.r * 1.7 }, "Lit!", "#ffd27a", 22);
    if (tg.golden) { this.frags++; this._text({ x: tg.x, y: tg.y - tg.r * 1.9 }, "A star fragment!", "#fff1a0", 18); }
    this._burstAt(tg, tg.golden ? "#fff1a0" : "#ffb84d", tg.golden ? 40 : 26);
    if (!lumenIsTrail(this.level)) this.sky.push({ ...this._px(tg), vy: -lumenRand(38, 60), sway: lumenRand(0, TAU), s: lv.size, golden: tg.golden, tint: tg.match && tg.match.tint });
    if (lumenIsTrail(this.level)) {
      this.trail.lit.push(tg.i); this.trail.k++;
      if (this.trail.k >= this.trail.order.length) {      // the constellation is complete
        const pts2 = Math.round(300 * P.m2);
        this.score += pts2; this.constellations++;
        this.trailFx = { pts: this.trail.order.map(k => this._px(this.targets[k])), life: 2 };
        for (const k of this.trail.order) this.sky.push({ ...this._px(this.targets[k]), vy: -lumenRand(38, 60), sway: lumenRand(0, TAU), s: lv.size });
        const fig = LUMEN_CONSTELLATIONS[this.trail.fig];
        this.revealFx = { fig: this.trail.fig, life: 5 };
        this.revealed.push(this.trail.fig);
        if (!this.prog.atlas.includes(this.trail.fig)) this.prog.atlas.push(this.trail.fig);
        this.prog.atlasNext++;
        this._textPx(this.canvas.width / 2, this.canvas.height * 0.32, `You revealed ${fig.name}!`, "#cfe1ff", 30);
        this._pip(fig.lore, 4);
        audio.lumen("constellation");
      }
    }
    if (!this.goalHit && this.lit >= LUMEN_GOAL) {
      this.goalHit = true;
      this._textPx(this.canvas.width / 2, this.canvas.height * 0.3, LUMEN_STORY[this.chap].win.split(/[.!]/)[0] + "!", "#ffe08a", 34);
      this._burstPx(this.canvas.width / 2, this.canvas.height * 0.3, "#ffe08a", 50);
      this.say("Wonderful! The whole street is awake. Keep going.");
    } else if ([3, 5, 8, 12].includes(this.combo)) this._pip(`${this.combo} in a row! Hoo-hoo!`);
    else if (Math.random() < 0.3) this._pip(LUMEN_PRAISE[Math.floor(Math.random() * LUMEN_PRAISE.length)]);
    this._finishTrial(c);
    this._spawnTarget();
  }
  _extinguish(now) {
    const c = this.cur;
    c.tEnd = this.playT; c.outcome = "burnt_out";
    if (c.tEnter != null) c.mt = Math.round((c.tEnter - (c.tLeave ?? c.tPickup)) * 100) / 100;
    this.combo = 0; this.fail++;
    this.miss({ isFar: this.target.reachFrac > 0.7 * this._reach() }, true);
    const h = this._disc(this.lightSide);
    if (h) { this._smokeAt(h); this._text({ x: h.x, y: h.y + 0.12 }, "The candle went out", "#b9b4d6", 20); }
    audio.lumen("puff");
    this._pip("No worries, take another candle.");
    this._finishTrial(c);                 // the same lantern stays: that direction again
  }
  _mothHit(now) {
    const c = this.cur;
    c.tEnd = this.playT; c.outcome = "moth"; c.mothHit = 1;
    this.combo = 0; this.fail++; this.mothHits++;
    this.miss({ isFar: this.target.reachFrac > 0.7 * this._reach() }, true);
    const h = this._disc(this.lightSide);
    if (h) { this._smokeAt(h); this._text({ x: h.x, y: h.y + 0.12 }, "The moth blew it out", "#d9b8ff", 20); }
    if (this.moth) this.moth.flee = 0.5;
    audio.lumen("moth");
    this._pip("Go round the moth next time.");
    this._finishTrial(c);
  }
  _finishTrial(c) {
    // the record kept per candle, compact: what the therapist's log needs
    this.trials.push({ trial: c.trial, angle: c.angle, basket: c.basket, reachFrac: c.reachFrac, golden: c.golden ? 1 : 0,
      rt: c.rt, mt: c.mt, eff: c.eff == null ? null : Math.round(c.eff * 100) / 100, peak: Math.round(c.peak * 100) / 100,
      holdBreaks: c.holdBreaks, holdDur: c.holdDur ?? null, outcome: c.outcome, success: c.success,
      challenge: c.challenge, cue: c.cue, firstChoice: c.firstChoice, wrongTouches: c.wrongTouches,
      moth: c.moth, mothHit: c.mothHit, minClear: c.minClear == null ? null : Math.round(c.minClear * 100) / 100,
      onTargetPct: c.onTargetPct ?? null, trackErr: c.trackErr == null ? null : Math.round(c.trackErr * 100) / 100,
      points: c.points, returnTime: null });
    this.prevTrial = this.trials[this.trials.length - 1];
    this.returnStart = this.playT;
    this.cycleStart = this.playT; this.slipWarned = false;
    if (!this.lv.move) this._setHome(this._nextHome(), false);   // the basket slides to its next spot
    this.cur = null; this.phase = "toBasket"; this.holdT = 0; this.inside = false; this.outSince = null;
    this.matchLit = false; this.matchOut = null;
    this.clearDwell("basket");
    this._askBasket();
  }

  // ---- effects ----
  _burstAt(d, color, n = 14) { const p = this._px(d); this._burstPx(p.x, p.y, color, n); }
  _burstPx(x, y, color, n = 14) {
    const m = A11Y.calm ? Math.ceil(n / 3) : n;
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU, s = A11Y.calm ? 1 + Math.random() * 1.5 : 2 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
    }
  }
  _smokeAt(d) {
    const p = this._px(d);
    for (let i = 0; i < 12; i++) this.smoke.push({ x: p.x + lumenRand(-4, 4), y: p.y - 20, vx: lumenRand(-15, 15), vy: lumenRand(-60, -25), life: lumenRand(0.8, 1.4), max: 1.4, r: lumenRand(4, 8) });
  }
  _fx(dts) {
    for (const p of this.smoke) { p.x += p.vx * dts; p.y += p.vy * dts; p.life -= dts; p.r += 6 * dts; }
    this.smoke = this.smoke.filter(p => p.life > 0);
    for (const t of this.texts) { t.y -= 40 * dts; t.life -= dts; }
    this.texts = this.texts.filter(t => t.life > 0);
    for (const l of this.sky) { l.y += l.vy * dts; l.sway += dts * 1.5; }
    this.sky = this.sky.filter(l => l.y > -80);
    if (this.owl.life > 0) this.owl.life -= dts;
    if (this.owl.hop > 0) this.owl.hop -= dts;
    if (this.target) for (const d of this.target.decoys) if (d.shake > 0) d.shake -= dts;
    if (this.trailFx) { this.trailFx.life -= dts; if (this.trailFx.life <= 0) this.trailFx = null; }
    if (this.popT > 0) this.popT -= dts;
    if (this.revealFx) { this.revealFx.life -= dts; if (this.revealFx.life <= 0) this.revealFx = null; }
    for (const p of this.lightTrail) p.life -= dts * 1.6;
    this.lightTrail = this.lightTrail.filter(p => p.life > 0);
    if (this.moth) {
      const m = this.moth; m.ph += dts;
      m.x = m.x0 + Math.sin(m.ph * 1.3) * m.r * 0.35; m.y = m.y0 + Math.cos(m.ph * 1.9) * m.r * 0.25;
      if (m.flee > 0) m.flee -= dts;
    }
  }
  _updateMovers(dts) {
    const tg = this.target;
    if (tg && tg.move) {
      const mv = tg.move;
      mv.ph += dts * mv.speed * TAU;
      const p = this._trackPos(mv, mv.ph); tg.x = p.x; tg.y = p.y; tg.ang = Math.round(p.a * 10) / 10;
    }
    if (this.lv.move === "both") {
      this.bph += dts * (this.target?.move?.speed ?? this.lv.speed) * 0.8 * TAU;
      this.basket.x = LUMEN_DRIFT * Math.sin(this.bph);
    } else this.basket.x += (this.basket.hx - this.basket.x) * Math.min(1, dts * 6);
  }

  update(now, dt) {
    const dts = dt / 1000;
    const el = this.elapsed(now);
    this.clock += dts;
    this._fx(dts);
    // Pip eases up the pole towards the flag
    {
      const climb = this._climb();
      const goal = this.phase !== "story" && this.phase !== "intro" && this.targetScore ? Math.min(1, climb / this.targetScore) : 0;
      this.owl.pos += (goal - this.owl.pos) * Math.min(1, dts * 2.5);
    }
    if (this.phase === "story") { if (el >= this.introAt) { this.phase = "intro"; this._sayLevel(); } return; }
    if (this.phase === "intro") {
      if (el >= this.introAt + LUMEN_INTRO_S) { this.phase = "countdown"; this.cd = null; this._prompt("Get ready", "3… 2… 1…"); }
      return;
    }
    if (this.phase === "countdown") {
      const left = LUMEN_COUNT_S - Math.floor(el - this.introAt - LUMEN_INTRO_S);
      if (left !== this.cd && left > 0) { this.cd = left; audio.serveTick(false); }
      if (el >= this.playAt) {
        this.phase = "toBasket"; audio.serveTick(true);
        const st = LUMEN_STAGES[this.stage];
        this._pip(st.owl, 3.5);
        this._askBasket();
      }
      return;
    }
    if (this.phase === "over") {
      if (this.endDelay > 0) { this.endDelay -= dts; if (this.endDelay <= 0) this.roundSeconds = el; }
      return;
    }
    this.playT = el - this.playAt;
    this.activeMs += dt;
    // the keeping hand (together / hold): sticky, so a tremor off the stand
    // does not gutter the flame, but a real drift does
    if (this.holdSide) {
      const on = this._near(this.holdSide, this.stand, CANDLE_BOX_R);
      if (on) {
        this.lostSince = null;
        if (!this.held) { this.held = true; audio.note(0); if (this.phase === "toBasket") this._askBasket(); }
      } else if (this.held) {
        this.lostSince ??= now;
        if (now - this.lostSince > CANDLE_HOLD_GRACE) {
          this.held = false; this.holdLapses++;
          this.say(`Keep your ${this.holdSide} hand on the candle stand.`);
        }
      }
      if (this.held) this.holdMs += dt;
    }
    const flame = !this.holdSide || this.held;
    this._flameAlive = flame;
    this._updateMovers(dts);
    // the target score: Pip reaches the flag and the level ends on a high
    const climb = this._climb();
    if (climb > 0) this.hasClimbed = true;
    if (!this.targetHit && climb >= this.targetScore) {
      this.targetHit = true;
      const P = this._owlPole();
      this._burstPx(P.x, P.top - P.s, "#ffd27a", 40);
      this._textPx(this.canvas.width / 2, this.canvas.height * 0.26, "Pip reached the flag!", "#ffd27a", 34);
      this.owl.msg = "I made it to the top! Hoo-hoo!"; this.owl.life = 3.2; this.owl.hop = 0.9;
      audio.lumen("target");
      this.say("Pip reached the flag! What a lamplighter.");
      this.phase = "over"; this.endReason = "target"; this.endDelay = 2.5;
      if (this.cur) { this.cur.outcome = "time_up"; this.cur.tEnd = this.playT; this._closeTrial(); }
      return;
    }
    // a slow candle lets Pip slip a little (never home: see the header)
    this.slipping = !this.targetHit && climb > 0 && this.playT - this.cycleStart > LUMEN_SLOW_S;
    if (this.slipping) {
      this.slip = Math.min(this.score * 0.85, this.slip + this.targetScore * 0.03 * dts);
      if (!this.slipWarned) { this.slipWarned = true; this._pip("Hoo! I'm slipping!", 2.4); }
      this.slipSnd = (this.slipSnd || 0) - dts;
      if (this.slipSnd <= 0) { this.slipSnd = 0.6; audio.lumen("slip"); }
    }
    if (!this.nearlySaid && this.roundSeconds - el < 10) { this.nearlySaid = true; this._pip("Nearly time!"); }

    // the lighting hand
    const h = this._disc(this.lightSide);
    const step = h && this._lastH ? lumenDist(h, this._lastH) : 0;
    const speed = dts > 0 ? step / dts : 0;
    this._lastH = h ? { x: h.x, y: h.y } : null;
    if (!h) return;
    if (this.phase === "carrying") {
      const last = this.lightTrail[this.lightTrail.length - 1], hp = this._px(h);
      if (!last || Math.hypot(hp.x - last.x, hp.y - last.y) > 6) this.lightTrail.push({ x: hp.x, y: hp.y - this._geo().U * 0.04, life: 1 });
      if (this.lightTrail.length > 60) this.lightTrail.shift();
    }
    const dB = lumenDist(h, this.basket);
    if (this.phase === "toBasket") {
      const inB = dB < LUMEN_BASKET_R;
      if (inB && this.returnStart != null && this.prevTrial) {
        this.prevTrial.returnTime = Math.round((this.playT - this.returnStart) * 100) / 100; this.returnStart = null;
      }
      if (!flame) return;
      if (this.dwellProgress("basket", inB, now) >= 1) { this.clearDwell("basket"); this._pickup(now); }
      return;
    }
    // carrying
    const c = this.cur, tg = this.target, hold = this.lv.hold;
    const inside = flame && lumenDist(h, tg) < tg.r;
    if (c.tLeave == null && dB > LUMEN_BASKET_R) { c.tLeave = this.playT; c.leave = { x: h.x, y: h.y }; c.rt = Math.round((c.tLeave - c.tPickup) * 100) / 100; }
    // the decoy lantern (a thinking challenge)
    if (tg.decoys.length) {
      const dj = tg.decoys.find(d => lumenDist(h, d) < tg.r);
      if (dj && !this.insideWrong) {
        c.wrongTouches++; if (!c.firstChoice) c.firstChoice = "wrong";
        this.combo = 0; dj.shake = 0.45; audio.lumen("wrong");
        this._text({ x: dj.x, y: dj.y + tg.r * 1.8 }, lumenModeOf(this.level) === "color" ? "Not that colour" : "Not that one", "#ff9a9a", 20);
        this._pip(lumenModeOf(this.level) === "color" ? `Find the ${tg.match.cueName} lantern.` : `Look for ${tg.match.cue}.`, 2);
      }
      this.insideWrong = !!dj;
    }
    // the Night Moth
    if (this.moth && c.tLeave != null && c.tEnter == null) {
      const clear = lumenDist(h, this.moth) - this.moth.r;
      c.minClear = c.minClear == null ? clear : Math.min(c.minClear, clear);
      if (clear < this.moth.r * 0.8 && !c.warned) { c.warned = true; this.say("Careful. Go round the moth."); }
      if (clear < -this.moth.r * 0.15) { this._mothHit(now); return; }
    }
    if (inside && !c.firstChoice) c.firstChoice = "correct";
    // STAGE TWO, the other hand: once the candle is at the lantern, the
    // flame is fetched from the fire and brought to it (see the header)
    let matchIn = false;
    if (this.bimanual) {
      const h2 = this._disc(this.otherSide);
      if (c.step === "candle" && inside) {
        c.step = "fire";
        audio.note(2);
        this._say("Now the flame", `Reach to the fire with your ${this.otherSide} hand`, `Keep the candle there. Now reach to the fire with your ${this.otherSide} hand.`);
      }
      if (c.step === "fire") {
        const atFire = !!h2 && lumenDist(h2, this.fire) < CANDLE_BOX_R;
        if (this.dwellProgress("fire", atFire, now, 600) >= 1) {
          this.clearDwell("fire");
          this.matchLit = true; c.step = "bring"; c.tFire = this.playT;
          this._burstAt(this.fire, "#ffd27a", 12);
          audio.lumen("pickup");
          this._say("Bring the flame to the lantern", "and hold both hands there until the ring fills");
        }
      }
      matchIn = c.step === "bring" && !!h2 && lumenDist(h2, tg) < tg.r * 1.25;
    }
    const holdOn = this.bimanual ? (inside && matchIn) : inside;
    if (tg.move && c.tEnter != null) {         // pursuit: time on target and distance to its centre
      c.trackT = (c.trackT || 0) + dts; if (inside) c.inT = (c.inT || 0) + dts;
      c.errSum = (c.errSum || 0) + lumenDist(h, tg); c.errN = (c.errN || 0) + 1;
      c.onTargetPct = Math.round(100 * (c.inT || 0) / c.trackT);
      c.trackErr = c.errSum / c.errN;
    }
    if (c.tLeave != null && c.tEnter == null && step < 0.4) { c.path += step; c.peak = Math.max(c.peak, speed); }
    if (inside) {
      this.outSince = null;
      if (c.tEnter == null) {
        c.tEnter = this.playT;
        const straight = c.leave ? lumenDist(h, c.leave) : 0;
        c.eff = c.path > 0 ? Math.min(1, straight / c.path) : null;
        if (hold > 0 && Math.random() < 0.35) this.say("Steady. Hold it there.");
      }
      if (!this.inside) { c.lastEnter = this.playT; this.inside = true; }
      if (hold <= 0) { this._light(now); return; }
      if (holdOn) {
        this.matchOut = null;
        const before = Math.floor(this.holdT / 0.25);
        this.holdT += dts;
        if (Math.floor(this.holdT / 0.25) !== before) audio.lumen("hold", Math.min(1, this.holdT / hold));
        if (this.holdT >= hold) { this._light(now); return; }
      } else if (this.bimanual && this.holdT > 0) {
        // the flame hand slipped out of the lantern: a wobble is forgiven, a
        // real exit empties the ring
        this.matchOut ??= now;
        if (now - this.matchOut > LUMEN_HOLD_GRACE) {
          c.holdBreaks++; this.holdT = 0; this.matchOut = null;
          if (Math.random() < 0.5) this.say("Keep the flame at the lantern too.");
        }
      }
    } else {
      if (this.inside) { this.inside = false; this.outSince = now; }
      // a brief wobble out of the lantern is forgiven; a real exit is a break
      const inGrace = this.outSince != null && now - this.outSince <= LUMEN_HOLD_GRACE;
      if (this.outSince != null && !inGrace && this.holdT > 0) {
        c.holdBreaks++; this.holdT = 0; this.outSince = null;
        if (hold > 0 && Math.random() < 0.5) this.say("Keep the flame inside the lantern.");
      }
      if (!inGrace) this.burn -= dts;         // the candle only burns while it travels
      if (this.burn <= 0) { this._extinguish(now); return; }
    }
  }
  _closeTrial() {
    const c = this.cur; if (!c) return;
    this._finishTrial(c);
    this.phase = "over";
  }

  // ---- drawing ----
  _glowAt(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col.replace("A", a)); g.addColorStop(1, col.replace("A", 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  _sceneP() { return Math.min(1, this.lit / LUMEN_GOAL); }
  _sceneKey() { return LUMEN_STORY[this.chap].key; }
  drawBg(ctx, c) {
    const W = c.width, H = c.height, p = this._sceneP(), key = this._sceneKey();
    const glow = key === "festival" ? Math.max(p, 0.6) : p;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#070b1f");
    g.addColorStop(0.6, lumenMix("#141a44", "#3a2a55", glow));
    g.addColorStop(1, lumenMix("#1d1f45", "#5a3a4a", glow));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    for (const s of this.stars) {
      ctx.globalAlpha = A11Y.calm ? 0.6 : 0.4 + 0.6 * Math.abs(Math.sin(this.clock * 1.3 + s.p));
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const { U, cx, cy, Rs } = this._geo();
    const mx = W * 0.1, my = H * 0.12, mr = U * 0.045;
    this._glowAt(ctx, mx, my, mr * 3, "rgba(255,240,200,A)", 0.25);
    ctx.fillStyle = "#f6ecc9"; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    if (key === "village" || key === "festival") this._drawVillage(ctx, c, p, key === "festival");
    else if (key === "river") this._drawRiver(ctx, c, p);
    else if (key === "forest") this._drawForest(ctx, c, p);
    else this._drawTower(ctx, c, p);
    // the disc: the patient's whole reach, faint, so the world has an edge
    const rg = ctx.createRadialGradient(cx, cy, Rs * 0.2, cx, cy, Rs);
    rg.addColorStop(0, "rgba(244,236,221,0.04)"); rg.addColorStop(1, "rgba(244,236,221,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, Rs, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(244,236,221,0.08)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, Rs, 0, TAU); ctx.stroke();
    this._drawCandleLight(ctx);
    this._drawSky(ctx);
    if (lumenIsTrail(this.level)) this._drawConstellation(ctx, c);
  }
  _hills(ctx, c, col, base, amp, f, ph) {
    const W = c.width, H = c.height;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * base - Math.sin(x / W * f + ph) * H * amp - Math.sin(x / W * f * 2.6) * H * amp * 0.3);
    ctx.lineTo(W, H); ctx.fill();
  }
  _drawVillage(ctx, c, p, fest) {
    const W = c.width, H = c.height;
    this._hills(ctx, c, "#10132e", 0.8, 0.04, 5, 1);
    const houses = 9, order = [4, 2, 6, 0, 8, 3, 5, 1, 7], nLit = fest ? houses : Math.round(p * houses), base = H * 0.93;
    for (let i = 0; i < houses; i++) {
      const hx = (i + 0.3) * W / houses, hw = W / houses * 0.55, hh = H * (0.06 + (i * 37 % 5) * 0.012);
      ctx.fillStyle = "#0a0c22";
      ctx.fillRect(hx, base - hh, hw, hh + H * 0.1);
      ctx.beginPath(); ctx.moveTo(hx - hw * 0.1, base - hh); ctx.lineTo(hx + hw / 2, base - hh - hw * 0.45); ctx.lineTo(hx + hw * 1.1, base - hh); ctx.fill();
      const lit = order.indexOf(i) < nLit;
      const wx = hx + hw * 0.35, wy = base - hh * 0.6, ww = hw * 0.3, wh = hh * 0.3;
      if (lit) this._glowAt(ctx, wx + ww / 2, wy + wh / 2, hw * 0.7, "rgba(255,190,90,A)", 0.35);
      ctx.fillStyle = lit ? "rgba(255,200,110,.95)" : "rgba(70,80,120,.35)";
      ctx.fillRect(wx, wy, ww, wh);
    }
    if (fest) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, x = t * W, y = H * 0.905 + Math.sin(t * Math.PI * 5) * H * 0.008;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = `hsl(${i * 37 % 360},70%,62%)`; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#080a1c"; ctx.fillRect(0, base, W, H - base);
  }
  _drawRiver(ctx, c, p) {
    const W = c.width, H = c.height;
    this._hills(ctx, c, "#10132e", 0.78, 0.05, 4, 2);
    const top = H * 0.9;
    ctx.fillStyle = "#0c1636"; ctx.fillRect(0, top, W, H - top);
    ctx.strokeStyle = "rgba(150,180,255,.15)"; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = top + 6 + lumenSeed(i) * (H - top - 8), x = ((lumenSeed(i + 50) * W + this.clock * 20 * (0.5 + lumenSeed(i + 9))) % (W + 80)) - 40;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y); ctx.stroke();
    }
    const N = 10, nLit = Math.round(p * N);
    const by = t => top - Math.sin(t * Math.PI) * H * 0.07;
    ctx.strokeStyle = "#1b1733"; ctx.lineWidth = 9; ctx.beginPath();
    for (let i = 0; i <= 50; i++) { const t = i / 50, x = W * (0.03 + 0.94 * t); i ? ctx.lineTo(x, by(t)) : ctx.moveTo(x, by(t)); }
    ctx.stroke();
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N, x = W * (0.03 + 0.94 * t), y = by(t), ph = Math.min(W, H) * 0.045;
      ctx.strokeStyle = "#1b1733"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - ph); ctx.stroke();
      const lit = i < nLit;
      if (lit) { this._glowAt(ctx, x, y - ph, Math.min(W, H) * 0.05, "rgba(255,190,90,A)", 0.5); this._glowAt(ctx, x, top + (H - top) * 0.5, Math.min(W, H) * 0.035, "rgba(255,190,90,A)", 0.25); }
      ctx.fillStyle = lit ? "#ffcf73" : "#2a2648"; ctx.fillRect(x - 5, y - ph - 6, 10, 12);
    }
  }
  _drawForest(ctx, c, p) {
    const W = c.width, H = c.height;
    this._hills(ctx, c, "#0e1430", 0.8, 0.05, 6, 0.5);
    const base = H * 0.95;
    for (let i = 0; i < 24; i++) {
      const x = (i / 23) * W + (lumenSeed(i) - 0.5) * 40, h = H * (0.13 + lumenSeed(i + 30) * 0.12), w = h * 0.45;
      ctx.fillStyle = i % 2 ? "#0a1124" : "#0c1428";
      for (let k = 0; k < 3; k++) {
        const ty = base - h + k * h * 0.25, tw = w * (0.55 + k * 0.25);
        ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x - tw / 2, ty + h * 0.4); ctx.lineTo(x + tw / 2, ty + h * 0.4); ctx.fill();
      }
      ctx.fillRect(x - w * 0.06, base - h * 0.2, w * 0.12, h * 0.2);
    }
    ctx.fillStyle = "#070a1a"; ctx.fillRect(0, base, W, H - base);
    const n = Math.round(4 + p * (A11Y.calm ? 20 : 60));
    for (let i = 0; i < n; i++) {
      const fx = lumenSeed(i + 100) * W + Math.sin(this.clock * 0.6 + i) * 40;
      const fy = H * (0.4 + lumenSeed(i + 200) * 0.5) + Math.cos(this.clock * 0.8 + i * 1.3) * 25;
      const a = 0.3 + 0.7 * Math.abs(Math.sin(this.clock * 2.2 + i * 0.7));
      this._glowAt(ctx, fx, fy, 10, "rgba(210,255,140,A)", 0.35 * a);
      ctx.globalAlpha = a; ctx.fillStyle = "#e4ff9a"; ctx.beginPath(); ctx.arc(fx, fy, 2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  _drawTower(ctx, c, p) {
    const W = c.width, H = c.height, U = Math.min(W, H);
    this._hills(ctx, c, "#0f1330", 0.82, 0.03, 4, 3);
    const pk = { x: W * 0.8, y: H * 0.36 };
    ctx.fillStyle = "#121536";
    ctx.beginPath(); ctx.moveTo(W * 0.4, H); ctx.lineTo(pk.x, pk.y); ctx.lineTo(W * 1.2, H); ctx.fill();
    const N = 9, nLit = Math.round(p * N);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const x = W * 0.9 - t * (W * 0.9 - pk.x) + Math.sin(t * 14) * W * 0.03 * (1 - t);
      const y = H * 0.95 - t * (H * 0.95 - pk.y - U * 0.02);
      const lit = i < nLit;
      if (lit) this._glowAt(ctx, x, y, U * 0.03, "rgba(255,190,90,A)", 0.55);
      ctx.fillStyle = lit ? "#ffcf73" : "#2a2648"; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
    }
    const tw = U * 0.032, th = U * 0.1, ty = pk.y - th;
    ctx.fillStyle = "#1d1a38";
    ctx.beginPath(); ctx.moveTo(pk.x - tw, pk.y + 4); ctx.lineTo(pk.x - tw * 0.6, ty); ctx.lineTo(pk.x + tw * 0.6, ty); ctx.lineTo(pk.x + tw, pk.y + 4); ctx.fill();
    ctx.fillRect(pk.x - tw * 0.9, ty - tw * 0.3, tw * 1.8, tw * 0.3);
    const bx = pk.x, byy = ty - tw * 0.5;
    if (p > 0) {
      this._glowAt(ctx, bx, byy, U * (0.04 + 0.3 * p), "rgba(255,200,90,A)", 0.2 + 0.45 * p);
      if (p >= 1 && !A11Y.calm) {
        ctx.save(); ctx.translate(bx, byy); ctx.rotate(this.clock * 0.3);
        ctx.fillStyle = "rgba(255,220,140,.08)";
        for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-U * 0.04, -U * 0.6); ctx.lineTo(U * 0.04, -U * 0.6); ctx.fill(); }
        ctx.restore();
      }
      this._drawFlame(ctx, bx, byy + tw * 0.3, tw * (0.3 + 0.6 * p));
    }
    ctx.fillStyle = "#080a1c"; ctx.fillRect(0, H * 0.95, W, H * 0.05);
  }
  // the candle lights the night around it: a warm pool that follows the
  // flame (shrinking as the candle burns) and a fading trail where it moved
  _drawCandleLight(ctx) {
    const carrying = this.phase === "carrying";
    if (!carrying && !this.lightTrail.length) return;
    const { U } = this._geo();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.lightTrail) this._glowAt(ctx, p.x, p.y, U * 0.07 * p.life, "rgba(255,160,70,A)", 0.045 * p.life);
    // the light rides with the flame: on the candle, or in stage two on the
    // match in the other hand (and nowhere until it is taken from the fire)
    const glowSide = this.bimanual ? (this.matchLit ? this.otherSide : null) : this.lightSide;
    const h = carrying && glowSide ? this._disc(glowSide) : null;
    if (h) {
      const hp = this._px(h);
      const frac = Math.max(0, this.burn / this.burnMax);
      const flick = A11Y.calm ? 1 : 1 + 0.03 * Math.sin(this.clock * 19) + 0.02 * Math.sin(this.clock * 31);
      this._glowAt(ctx, hp.x, hp.y - U * 0.04, U * 0.36 * (0.55 + 0.45 * frac) * flick, "rgba(255,170,80,A)", 0.09 + 0.05 * frac);
      this._glowAt(ctx, hp.x, hp.y - U * 0.04, U * 0.11 * flick, "rgba(255,205,140,A)", 0.06 + 0.03 * frac);
    }
    ctx.restore();
  }
  _drawSky(ctx) {
    const { U } = this._geo();
    for (const l of this.sky) {
      const x = l.x + Math.sin(l.sway) * 10, s = U * 0.03 * Math.max(0.6, l.s);
      this._glowAt(ctx, x, l.y, s * 3, l.tint ? lumenHexA(l.tint, "A") : l.golden ? "rgba(255,240,150,A)" : "rgba(255,170,70,A)", 0.4);
      ctx.fillStyle = l.tint || (l.golden ? "#ffe680" : "#ff9a3c");
      ctx.beginPath();
      ctx.moveTo(x - s * 0.7, l.y - s); ctx.lineTo(x + s * 0.7, l.y - s);
      ctx.lineTo(x + s * 0.5, l.y + s); ctx.lineTo(x - s * 0.5, l.y + s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff3c4"; ctx.beginPath(); ctx.ellipse(x, l.y + s * 0.7, s * 0.25, s * 0.18, 0, 0, TAU); ctx.fill();
    }
  }
  // the hidden picture's box: top right, clear of the disc's upper arc
  _constBox(c) {
    const W = c.width, H = c.height, U = Math.min(W, H);
    const w = Math.min(W * 0.22, U * 0.38), h = Math.min(H * 0.22, U * 0.3);
    return { x: W - w - Math.max(24, W * 0.02), y: Math.max(H * 0.06, 40), w, h };
  }
  _drawFigure(ctx, c, fig, shown, bright, scaleIn) {
    const b = this._constBox(c), P = fig.pts.map(([px, py]) => ({ x: b.x + px * b.w, y: b.y + py * b.h }));
    ctx.strokeStyle = `rgba(190,215,255,${bright ? 0.85 : 0.45})`; ctx.lineWidth = bright ? 2.5 : 1.5;
    if (bright) { ctx.shadowColor = "#9fc3ff"; ctx.shadowBlur = 14; }
    for (const [i, j] of fig.lines) if (i < shown && j < shown) { ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
    ctx.shadowBlur = 0;
    P.forEach((p, i) => {
      if (i >= shown) { ctx.fillStyle = "rgba(190,215,255,.12)"; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, TAU); ctx.fill(); return; }
      const pop = i === shown - 1 && scaleIn ? 1 + 1.5 * scaleIn : 1;
      this._glowAt(ctx, p.x, p.y, 12 * pop, "rgba(200,225,255,A)", bright ? 0.6 : 0.4);
      ctx.fillStyle = "#f4f8ff"; ctx.beginPath(); ctx.arc(p.x, p.y, (bright ? 3.2 : 2.6) * pop, 0, TAU); ctx.fill();
    });
    return b;
  }
  _drawConstellation(ctx, c) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    if (this.revealFx) {
      const fig = LUMEN_CONSTELLATIONS[this.revealFx.fig];
      ctx.globalAlpha = Math.min(1, this.revealFx.life / 1.2);
      const b = this._drawFigure(ctx, c, fig, fig.pts.length, true, 0);
      ctx.font = "800 18px Nunito, sans-serif"; ctx.fillStyle = "#dfeaff";
      ctx.fillText(fig.name, b.x + b.w / 2, b.y + b.h + 10);
      ctx.restore();
      return;
    }
    if (!this.trail) { ctx.restore(); return; }
    const fig = LUMEN_CONSTELLATIONS[this.trail.fig], n = this.trail.order.length;
    const shown = Math.round(fig.pts.length * this.trail.k / n);
    if (shown !== this.lastShown) { this.popT = 0.4; this.lastShown = shown; }
    const b = this._drawFigure(ctx, c, fig, shown, false, this.popT > 0 ? this.popT / 0.4 : 0);
    ctx.font = "600 13px Nunito, sans-serif"; ctx.fillStyle = "rgba(200,215,255,.6)";
    ctx.fillText(shown ? "A hidden picture is appearing" : "Light the lanterns in order to reveal a picture", b.x + b.w / 2, b.y + b.h + 10);
    ctx.restore();
  }
  _drawFlame(ctx, x, y, s) {
    const f = A11Y.calm ? 1 : 1 + 0.12 * Math.sin(this.clock * 23) + 0.08 * Math.sin(this.clock * 37);
    const lean = A11Y.calm ? 0 : Math.sin(this.clock * 5) * s * 0.08;
    this._glowAt(ctx, x, y - s * 0.6, s * 3, "rgba(255,180,60,A)", 0.45);
    ctx.fillStyle = "#ff9a2e";
    ctx.beginPath(); ctx.moveTo(x - s * 0.45, y);
    ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.9 * f, x + lean, y - s * 1.7 * f);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.9 * f, x + s * 0.45, y);
    ctx.quadraticCurveTo(x, y + s * 0.35, x - s * 0.45, y); ctx.fill();
    ctx.fillStyle = "#fff2b8";
    ctx.beginPath(); ctx.ellipse(x + lean * 0.3, y - s * 0.4, s * 0.2, s * 0.45 * f, 0, 0, TAU); ctx.fill();
  }
  _drawLantern(ctx, x, y, r, lit, golden, pre, label, tint) {
    const w = r, h = r * 1.35;
    const metal = golden ? "#ffd34d" : "#d9b97a";
    ctx.strokeStyle = "#5b5470"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.95); ctx.lineTo(x, y - h * 1.5); ctx.stroke();
    if (label == null) { ctx.beginPath(); ctx.arc(x, y - h * 0.92, r * 0.12, 0, TAU); ctx.stroke(); }
    if (lit) this._glowAt(ctx, x, y, r * 3.5, tint ? lumenHexA(tint, "A") : "rgba(255,190,80,A)", 0.5);
    else if (pre > 0) this._glowAt(ctx, x, y, r * 3 * pre, "rgba(255,190,80,A)", 0.45 * pre);
    ctx.fillStyle = metal; ctx.strokeStyle = "#fff6dc"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - w * 0.75, y - h * 0.5); ctx.lineTo(x, y - h * 0.85); ctx.lineTo(x + w * 0.75, y - h * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = tint ? lumenHexA(tint, lit ? 0.95 : 0.8)
      : lit ? "#ffcf73" : pre > 0 ? `rgba(255,207,115,${0.4 + 0.6 * pre})` : (golden ? "rgba(255,236,160,.55)" : "rgba(255,244,215,.42)");
    ctx.fillRect(x - w * 0.55, y - h * 0.5, w * 1.1, h);
    ctx.strokeStyle = metal; ctx.lineWidth = Math.max(3, r * 0.1);
    ctx.strokeRect(x - w * 0.55, y - h * 0.5, w * 1.1, h);
    if (label == null) { ctx.beginPath(); ctx.moveTo(x, y - h * 0.5); ctx.lineTo(x, y + h * 0.5); ctx.stroke(); }
    ctx.fillStyle = metal; ctx.fillRect(x - w * 0.7, y + h * 0.5, w * 1.4, h * 0.14);
    if (label != null) {
      ctx.fillStyle = tint ? "#ffffff" : "#3a2410";
      ctx.font = `800 ${Math.round(r * (label.length > 1 ? 0.75 : 0.95))}px Nunito, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, x, y + h * 0.04);
      return;
    }
    ctx.fillStyle = "#e8dcc0"; ctx.fillRect(x - r * 0.08, y + h * 0.15, r * 0.16, h * 0.3);
    if (lit) this._drawFlame(ctx, x, y + h * 0.12, r * 0.35);
  }
  _drawChoiceLanterns(ctx, litOnly, hp) {
    const tg = this.target, hold = this.lv.hold, pulse = A11Y.calm ? 0.5 : 0.5 + 0.5 * Math.sin(this.clock * 4);
    const { Rs } = this._geo();
    const T = this._px(tg), tr = tg.r * Rs;
    const trail = lumenIsTrail(this.level) ? this.trail : null;
    if (trail) {
      const pts = trail.order.slice(0, trail.k).map(k => this._px(this.targets[k]));
      if (pts.length > 1) {
        ctx.strokeStyle = "rgba(207,225,255,.75)"; ctx.lineWidth = 3; ctx.shadowColor = "#9fc3ff"; ctx.shadowBlur = 12;
        ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (const k of trail.lit) {
        const p = this._px(this.targets[k]);
        this._drawLantern(ctx, p.x, p.y, tr * 0.9, true, false, 0, trail.labels[k], null);
      }
    }
    if (this.trailFx) {
      const a = Math.min(1, this.trailFx.life);
      ctx.strokeStyle = `rgba(207,225,255,${a})`; ctx.lineWidth = 4; ctx.shadowColor = "#9fc3ff"; ctx.shadowBlur = 20;
      ctx.beginPath(); this.trailFx.pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (litOnly) return;
    const all = [{ x: tg.x, y: tg.y, label: tg.match.label, tint: tg.match.tint, shake: 0, me: true }, ...tg.decoys];
    const holdFrac = hold > 0 && this.phase === "carrying" && this.inside ? Math.min(1, this.holdT / hold) : 0;
    for (const d of all) {
      const p = this._px(d);
      const sx = d.shake > 0 ? Math.sin(d.shake * 60) * 6 : 0;
      this._glowAt(ctx, p.x, p.y, tr * 2.1, d.tint ? lumenHexA(d.tint, "A") : "rgba(190,210,255,A)", 0.22 + 0.1 * pulse);
      ctx.strokeStyle = d.shake > 0 ? "#ff7a7a" : d.tint ? lumenHexA(d.tint, 0.85) : "rgba(255,236,190,.75)";
      ctx.lineWidth = 3; if (!hold) ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.arc(p.x + sx, p.y, tr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = Math.min(1, (this.clock - tg.born) / 0.3);
      this._drawLantern(ctx, p.x + sx, p.y + (A11Y.calm ? 0 : Math.sin(this.clock * 2 + p.x) * tr * 0.04), tr * 0.9, false, false, d.me ? holdFrac : 0, d.label, d.tint);
      ctx.globalAlpha = 1;
    }
    if (holdFrac > 0) {
      ctx.strokeStyle = "#c9b8ff"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(T.x, T.y, tr * 1.18, -Math.PI / 2, -Math.PI / 2 + TAU * holdFrac); ctx.stroke();
      ctx.lineCap = "butt";
    }
  }
  _drawMoth(ctx, hp) {
    const m = this.moth, { Rs, U } = this._geo();
    const M = this._px(m), r = m.r * Rs, flap = A11Y.calm ? 0 : Math.sin(this.clock * 14);
    const carrying = this.phase === "carrying";
    const clear = hp ? Math.hypot(hp.x - M.x, hp.y - M.y) - r : Infinity;
    const near = carrying && clear < r * 0.8;
    ctx.save(); ctx.translate(M.x, M.y);
    if (m.flee > 0) ctx.translate(0, -(0.5 - m.flee) * 60);
    const flash = near && !A11Y.calm ? 0.5 + 0.5 * Math.sin(this.clock * 18) : near ? 0.5 : 0;
    ctx.fillStyle = `rgba(255,70,100,${0.14 + 0.18 * flash})`;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = near ? `rgba(255,90,110,${0.7 + 0.3 * flash})` : "rgba(255,110,130,.75)";
    ctx.lineWidth = near ? 4 : 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.scale(sd, 1); ctx.rotate(-0.25 + flap * 0.35);
      ctx.fillStyle = "#a58be6"; ctx.strokeStyle = "#f4ecff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(r * 0.42, -r * 0.14, r * 0.5, r * 0.34, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(r * 0.32, r * 0.27, r * 0.32, r * 0.22, 0.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#3d2a63"; ctx.beginPath(); ctx.arc(r * 0.46, -r * 0.14, r * 0.13, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#20163a"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.16, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ff6b8f";
    ctx.beginPath(); ctx.arc(-r * 0.07, -r * 0.38, r * 0.06, 0, TAU); ctx.arc(r * 0.07, -r * 0.38, r * 0.06, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#20163a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 0.48); ctx.lineTo(-r * 0.2, -r * 0.75); ctx.moveTo(r * 0.05, -r * 0.48); ctx.lineTo(r * 0.2, -r * 0.75); ctx.stroke();
    ctx.restore();
    if (near) {
      ctx.font = `800 ${Math.max(14, U * 0.018)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillStyle = "#ff8a9a"; ctx.fillText("Too close", M.x, M.y - r - 8);
    }
  }
  // the way round the moth: a dotted path that bends away from it, shown
  // through the first moth level and for the first candles of the others
  _drawMothGuide(ctx) {
    const m = this.moth, tg = this.target;
    if (!m || !(this.level === LUMEN_STAGES[4].from || this.trialN < 3 || (this.trialN === 3 && this.phase === "carrying"))) return;
    const B = this._px(this.basket), T = this._px(tg), M = this._px(m), { Rs } = this._geo();
    const sx = B.x, sy = B.y - LUMEN_BASKET_R * Rs * 0.5, dx = T.x - sx, dy = T.y - sy, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const side = ((M.x - sx) * nx + (M.y - sy) * ny) > 0 ? -1 : 1;
    const off = m.r * Rs * 2.8;
    const cx = M.x + nx * side * off, cy = M.y + ny * side * off;
    const qx = 2 * cx - 0.5 * (sx + T.x), qy = 2 * cy - 0.5 * (sy + T.y);
    const a = A11Y.calm ? 0.55 : 0.45 + 0.25 * Math.sin(this.clock * 3);
    ctx.strokeStyle = `rgba(150,235,150,${a})`; ctx.lineWidth = 3; ctx.setLineDash([3, 9]); ctx.lineDashOffset = A11Y.calm ? 0 : -this.clock * 30;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(qx, qy, T.x, T.y); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const t = 0.88, px = (1 - t) ** 2 * sx + 2 * (1 - t) * t * qx + t * t * T.x, py = (1 - t) ** 2 * sy + 2 * (1 - t) * t * qy + t * t * T.y;
    const ang = Math.atan2(T.y - py, T.x - px);
    ctx.fillStyle = `rgba(150,235,150,${a + 0.2})`;
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill(); ctx.restore();
  }
  _drawMoveTrack(ctx) {
    const mv = this.target.move, tg = this.target, { Rs } = this._geo();
    ctx.strokeStyle = "rgba(255,236,190,.4)"; ctx.lineWidth = 3; ctx.setLineDash([2, 9]); ctx.lineCap = "round";
    ctx.beginPath();
    for (let k = 0; k <= 120; k++) { const p = this._px(this._trackPos(mv, k / 120 * TAU)); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = "butt";
    for (const ph of [Math.PI / 2, -Math.PI / 2]) { const p = this._px(this._trackPos(mv, ph)); ctx.fillStyle = "rgba(255,236,190,.6)"; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill(); }
    const T = this._px(tg), ahead = this._px(this._trackPos(mv, mv.ph + 0.15));
    const ang = Math.atan2(ahead.y - T.y, ahead.x - T.x), tr = tg.r * Rs;
    ctx.save(); ctx.translate(T.x + Math.cos(ang) * tr * 1.45, T.y + Math.sin(ang) * tr * 1.45); ctx.rotate(ang);
    ctx.fillStyle = "rgba(255,236,190,.8)"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.fill(); ctx.restore();
  }
  _drawBasketRail(ctx) {
    const { Rs } = this._geo();
    const a = this._px({ x: -LUMEN_DRIFT, y: LUMEN_BASKET_Y }), b = this._px({ x: LUMEN_DRIFT, y: LUMEN_BASKET_Y });
    ctx.strokeStyle = "rgba(255,236,190,.3)"; ctx.lineWidth = 3; ctx.setLineDash([2, 9]); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a.x, a.y + LUMEN_BASKET_R * Rs * 0.7); ctx.lineTo(b.x, b.y + LUMEN_BASKET_R * Rs * 0.7); ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = "butt";
  }
  _drawTargetLantern(ctx, hp) {
    const tg = this.target, { Rs } = this._geo();
    if (this.phase !== "carrying") { if (tg.match) this._drawChoiceLanterns(ctx, true, hp); return; }   // the lantern appears with the candle
    if (this.moth) { this._drawMothGuide(ctx); this._drawMoth(ctx, hp); }
    if (tg.match) { this._drawChoiceLanterns(ctx, false, hp); return; }
    if (tg.move) this._drawMoveTrack(ctx);
    const T = this._px(tg), tr = tg.r * Rs, pulse = A11Y.calm ? 0.5 : 0.5 + 0.5 * Math.sin(this.clock * 4);
    const hold = this.lv.hold;
    for (const p of this.targets) {   // faint marks for the level's other positions
      if (p.i === tg.i) continue;
      const q = this._px(p);
      ctx.strokeStyle = "rgba(255,210,122,.1)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, tr * 0.5, 0, TAU); ctx.stroke();
    }
    this._glowAt(ctx, T.x, T.y, tr * 2.4, tg.golden ? "rgba(255,230,140,A)" : "rgba(190,210,255,A)", 0.28 + 0.14 * pulse);
    if (!A11Y.calm) {
      const rip = (this.clock * 0.8) % 1;
      ctx.strokeStyle = `rgba(255,236,190,${0.55 * (1 - rip)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(T.x, T.y, tr * (1 + 0.9 * rip), 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = tg.golden ? `rgba(255,230,120,${0.7 + 0.3 * pulse})` : `rgba(255,236,190,${0.65 + 0.3 * pulse})`;
    ctx.lineWidth = 4;
    if (!hold) ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.arc(T.x, T.y, tr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (tg.golden) {
      for (let i = 0; i < 4; i++) {
        const a = this.clock * 2 + i * 1.57;
        ctx.fillStyle = "#fff1a0"; ctx.beginPath(); ctx.arc(T.x + Math.cos(a) * tr * 1.3, T.y + Math.sin(a) * tr * 1.3, 2.5, 0, TAU); ctx.fill();
      }
    }
    const holdFrac = hold > 0 && this.inside ? Math.min(1, this.holdT / hold) : 0;
    ctx.globalAlpha = Math.min(1, (this.clock - tg.born) / 0.3);
    this._drawLantern(ctx, T.x, T.y + (A11Y.calm ? 0 : Math.sin(this.clock * 2) * tr * 0.04), tr * 0.9, false, tg.golden, holdFrac);
    ctx.globalAlpha = 1;
    if (holdFrac > 0) {
      ctx.strokeStyle = "#c9b8ff"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(T.x, T.y, tr * 1.18, -Math.PI / 2, -Math.PI / 2 + TAU * holdFrac); ctx.stroke();
      ctx.lineCap = "butt";
    }
  }
  _drawBasket(ctx, hp) {
    const { Rs } = this._geo();
    const B = this._px(this.basket), x = B.x, y = B.y, r = LUMEN_BASKET_R * Rs;
    const waiting = this.phase === "toBasket";
    const hover = waiting && hp && Math.hypot(hp.x - x, hp.y - y) < r;
    if (waiting) this._glowAt(ctx, x, y - r * 0.2, r * 2, "rgba(255,200,100,A)", hover ? 0.35 : 0.12 + (A11Y.calm ? 0.05 : 0.1 * Math.abs(Math.sin(this.clock * 1.5))));
    const cols = ["#f4ead2", "#efe0c0", "#f7f0de", "#eadbb8", "#f4ead2"];
    for (let i = 0; i < 5; i++) {
      const cx = x + (i - 2) * r * 0.32, ch = r * (0.75 + (i % 2) * 0.2), cw = r * 0.18;
      ctx.save(); ctx.translate(cx, y - r * 0.2); ctx.rotate((i - 2) * 0.12);
      ctx.fillStyle = cols[i]; ctx.fillRect(-cw / 2, -ch, cw, ch);
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -ch); ctx.lineTo(0, -ch - r * 0.1); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#7a4d26";
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.25); ctx.lineTo(x + r, y - r * 0.25); ctx.lineTo(x + r * 0.78, y + r * 0.55); ctx.lineTo(x - r * 0.78, y + r * 0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#5a361a"; ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) { const yy = y - r * 0.25 + k * r * 0.2; ctx.beginPath(); ctx.moveTo(x - r + k * 0.055 * r, yy); ctx.lineTo(x + r - k * 0.055 * r, yy); ctx.stroke(); }
    for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * r * 0.22, y - r * 0.25); ctx.lineTo(x + k * r * 0.17, y + r * 0.55); ctx.stroke(); }
    ctx.fillStyle = "#9a6634"; ctx.beginPath(); ctx.ellipse(x, y - r * 0.25, r, r * 0.12, 0, 0, TAU); ctx.fill();
    // what "on the basket" means, and the dwell filling
    if (waiting) {
      ctx.strokeStyle = "rgba(255,210,122,0.45)"; ctx.lineWidth = 3; ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const f = Math.min(1, (this._dwells?.basket?.acc ?? 0) / A11Y.dwellMs);
      if (f > 0) {
        ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x, y, r * 1.15, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }
  }
  // the keeping hand's candle-stand (together / hold)
  _drawStand(ctx) {
    if (!this.stand) return;
    const { Rs } = this._geo(), p = this._px(this.stand), R = CANDLE_BOX_R * Rs, w = Rs * 0.14, h = w * 0.5;
    ctx.save();
    ctx.fillStyle = "#3b2a2a"; ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - h * 0.3, w, h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f4ecdd"; ctx.beginPath(); ctx.roundRect(p.x - w * 0.06, p.y - h * 0.9, w * 0.12, h * 0.65, 3); ctx.fill();
    if (this.held) {
      ctx.strokeStyle = "rgba(159,192,138,0.85)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
      this._drawFlame(ctx, p.x, p.y - h * 0.95, Math.max(8, Rs * 0.03));
    } else {
      const pulse = A11Y.calm ? 0.6 : Math.sin(this.clock * 3.3) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(232,168,106,${0.4 + pulse * 0.45})`; ctx.lineWidth = 5; ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
  // stage two's FIRE: a brazier on the other hand's side. Its ring pulses
  // when it is the flame hand's turn, and the bowl burns on either way.
  _drawFire(ctx) {
    if (!this.fire) return;
    const { Rs, U } = this._geo(), p = this._px(this.fire), R = CANDLE_BOX_R * Rs, w = Rs * 0.16, h = w * 0.45;
    const turn = this.phase === "carrying" && this.cur?.step === "fire";
    ctx.save();
    this._glowAt(ctx, p.x, p.y - h * 0.6, U * 0.12, "rgba(255,160,70,A)", turn ? 0.16 : 0.08);
    ctx.fillStyle = "#3b2a2a"; ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x - w / 2, p.y - h * 0.4); ctx.lineTo(p.x + w / 2, p.y - h * 0.4);
    ctx.lineTo(p.x + w * 0.35, p.y + h * 0.5); ctx.lineTo(p.x - w * 0.35, p.y + h * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = -1; i <= 1; i++) this._drawFlame(ctx, p.x + i * w * 0.18, p.y - h * 0.45, Math.max(7, Rs * (0.028 - Math.abs(i) * 0.006)));
    if (turn) {
      const pulse = A11Y.calm ? 0.6 : Math.sin(this.clock * 3.3) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(232,168,106,${0.4 + pulse * 0.45})`; ctx.lineWidth = 5; ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(244,236,221,0.2)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  _owlPole() {
    const c = this.canvas, U = Math.min(c.width, c.height);
    const s = U * 0.042, x = Math.max(s * 1.4, c.width * 0.05);
    const B = this._px({ x: 0, y: LUMEN_BASKET_Y });
    return { s, x, base: B.y + LUMEN_BASKET_R * this._geo().Rs * 0.05, top: Math.max(c.height * 0.24, 150) };
  }
  // Pip on his pole: he climbs towards the flag as the score grows. No
  // figures on the pole (project rule), just the notches and the flag.
  _drawOwl(ctx, hp) {
    const P = this._owlPole(), s = P.s, x = P.x, c = this.canvas;
    const inLevel = this.phase !== "story" && this.phase !== "intro";
    if (inLevel) {
      const tTop = P.top - s * 0.9;
      ctx.fillStyle = "#3a2a1c"; ctx.fillRect(x - s * 0.13, tTop, s * 0.26, c.height - tTop);
      const reached = this.targetHit;
      for (const f of [0.25, 0.5, 0.75]) {
        const yy = P.base + s * 0.9 - (P.base - P.top) * f;
        const on = this.owl.pos >= f - 0.001;
        ctx.fillStyle = on ? "#ffd27a" : "#5a4a3a"; ctx.fillRect(x - s * 0.45, yy - 2, s * 0.9, 4);
      }
      const fy = tTop;
      if (reached) this._glowAt(ctx, x, fy, s * 3, "rgba(255,220,120,A)", 0.4 + (A11Y.calm ? 0.1 : 0.2 * Math.sin(this.clock * 5)));
      ctx.fillStyle = reached ? "#ffd27a" : "#e8dfc6";
      ctx.beginPath(); ctx.moveTo(x + s * 0.13, fy); ctx.lineTo(x + s * 1.2, fy + s * 0.35 + (A11Y.calm ? 0 : Math.sin(this.clock * 4) * 3)); ctx.lineTo(x + s * 0.13, fy + s * 0.7); ctx.fill();
    }
    const climbTop = P.top + s * 1.4;
    const y = P.base - (inLevel ? (P.base - climbTop) * this.owl.pos : 0);
    if (!inLevel) { ctx.fillStyle = "#3a2a1c"; ctx.fillRect(x - s * 0.15, y + s * 0.9, s * 0.3, c.height - y); }
    ctx.fillStyle = "#4a3524"; ctx.fillRect(x - s * 0.9, y + s * 0.85, s * 1.8, s * 0.18);
    const o = this.owl;
    const hp2 = o.hop > 0 ? (0.9 - o.hop) / 0.9 : 1;
    const bounce = o.hop > 0 && !A11Y.calm ? Math.abs(Math.sin(hp2 * Math.PI * 2)) * (1 - hp2 * 0.4) : 0;
    const lift = bounce * s * 1.1 + (A11Y.calm ? 0 : Math.sin(this.clock * 2) * s * 0.04);
    const squash = o.hop > 0 && bounce < 0.15 && !A11Y.calm ? 0.88 : 1;
    const flap = o.hop > 0 && !A11Y.calm ? Math.sin(this.clock * 30) * 0.9 : Math.sin(this.clock * 1.5) * 0.08;
    const tilt = o.hop > 0 && !A11Y.calm ? Math.sin(hp2 * Math.PI * 4) * 0.12
      : this.slipping && !A11Y.calm ? Math.sin(this.clock * 9) * 0.18
      : Math.sin(this.clock * 0.7) * 0.04;
    ctx.save();
    ctx.translate(x, y + s * 0.9); ctx.rotate(tilt); ctx.scale(1 / squash, squash); ctx.translate(-x, -(y + s * 0.9) - lift);
    ctx.fillStyle = "#7a5636";
    ctx.save(); ctx.translate(x - s * 0.6, y - s * 0.2); ctx.rotate(0.25 + flap);
    ctx.beginPath(); ctx.ellipse(-s * 0.1, s * 0.35, s * 0.28, s * 0.65, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x + s * 0.6, y - s * 0.2); ctx.rotate(-0.25 - flap);
    ctx.beginPath(); ctx.ellipse(s * 0.1, s * 0.35, s * 0.28, s * 0.65, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#8a6440";
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.8, s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s * 0.62, y - s * 0.6); ctx.lineTo(x - s * 0.72, y - s * 1.2); ctx.lineTo(x - s * 0.2, y - s * 0.85); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + s * 0.62, y - s * 0.6); ctx.lineTo(x + s * 0.72, y - s * 1.2); ctx.lineTo(x + s * 0.2, y - s * 0.85); ctx.fill();
    ctx.fillStyle = "#d8b98a"; ctx.beginPath(); ctx.ellipse(x, y + s * 0.32, s * 0.5, s * 0.58, 0, 0, TAU); ctx.fill();
    const blink = (this.clock % 4) < 0.13;
    for (const ex of [x - s * 0.32, x + s * 0.32]) {
      const ey = y - s * 0.3;
      ctx.fillStyle = blink ? "#8a6440" : "#fff8e6"; ctx.beginPath(); ctx.arc(ex, ey, s * 0.3, 0, TAU); ctx.fill();
      if (blink) continue;
      const dx = hp ? hp.x - ex : 0, dy = hp ? hp.y - ey : 0, d = Math.hypot(dx, dy) || 1;
      ctx.fillStyle = "#1a1208"; ctx.beginPath(); ctx.arc(ex + dx / d * s * 0.11, ey + dy / d * s * 0.11, s * 0.14, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#f2a03a"; ctx.beginPath(); ctx.moveTo(x - s * 0.12, y - s * 0.08); ctx.lineTo(x + s * 0.12, y - s * 0.08); ctx.lineTo(x, y + s * 0.18); ctx.fill();
    ctx.restore();
    if (o.life > 0 && o.msg) {
      ctx.globalAlpha = Math.min(1, o.life * 3);
      const fs = Math.max(15, Math.round(c.height * 0.02));
      ctx.font = `700 ${fs}px Nunito, sans-serif`;
      const tw = ctx.measureText(o.msg).width + 24, th = fs * 2.1;
      const bx = Math.min(c.width - tw - 8, x + s * 1.3), byy = y - s * 0.9 - th / 2;
      ctx.fillStyle = "#fff4dc";
      ctx.beginPath(); ctx.roundRect(bx, byy, tw, th, 12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, byy + th * 0.35); ctx.lineTo(bx - 12, byy + th * 0.6); ctx.lineTo(bx, byy + th * 0.8); ctx.fill();
      ctx.fillStyle = "#2a1d10"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(o.msg, bx + 12, byy + th / 2);
      ctx.globalAlpha = 1;
    }
  }
  _drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 1.5);
      ctx.font = `800 ${t.size}px Nunito, sans-serif`; ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y);
    }
    ctx.restore();
  }
  _drawCandle(ctx, x, y, frac, match, unlit = false) {
    const { U } = this._geo();
    const ch = U * 0.06 * (0.35 + 0.65 * frac), cw = U * 0.016;
    ctx.fillStyle = match && match.tint ? match.tint : "#f4ead2"; ctx.fillRect(x - cw / 2, y - ch, cw, ch);
    ctx.fillStyle = "#e2d3ae"; ctx.beginPath(); ctx.ellipse(x, y - ch, cw / 2, cw * 0.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#8a6a3a"; ctx.beginPath(); ctx.ellipse(x, y + 2, cw * 1.3, cw * 0.4, 0, 0, TAU); ctx.fill();
    if (unlit) {   // stage two: a bare wick until the flame arrives
      ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - ch); ctx.lineTo(x, y - ch - U * 0.008); ctx.stroke();
    } else if (this._flameAlive) this._drawFlame(ctx, x, y - ch - 2, U * 0.014 * (0.6 + 0.4 * frac));
    else {   // guttered: a wisp of smoke
      ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - ch - 4); ctx.quadraticCurveTo(x + cw, y - ch - U * 0.03, x, y - ch - U * 0.06); ctx.stroke();
    }
    if (match) {   // the cue badge beside the candle: the colour and its sign, or the next number
      const bx = x + U * 0.04, by = y - ch * 0.6, br = U * 0.024;
      ctx.fillStyle = match.tint || "#fff4dc"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = match.tint ? "#fff" : "#3a2410";
      ctx.font = `800 ${Math.round(br * (match.cue.length > 1 ? 0.95 : 1.25))}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(match.cue, bx, by + 1);
    }
  }

  draw(ctx, c, now) {
    const h = this._disc(this.lightSide), hp = h ? this._px(h) : null;
    const inLevel = this.phase !== "story" && this.phase !== "intro";
    if (inLevel && this.target) this._drawTargetLantern(ctx, hp);
    if (inLevel && this.lv.move === "both") this._drawBasketRail(ctx);
    this._drawBasket(ctx, hp);
    this._drawStand(ctx);
    this._drawFire(ctx);
    this._drawOwl(ctx, hp);
    // smoke from a candle that went out
    for (const p of this.smoke) {
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.5;
      ctx.fillStyle = "#8a87a3"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this._drawTexts(ctx);
    if (this.phase === "countdown" && this.cd) {
      const { U } = this._geo();
      ctx.save();
      ctx.fillStyle = "#ffd27a"; ctx.font = `800 ${Math.round(U * 0.16)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(this.cd), c.width / 2, c.height * 0.42);
      ctx.restore();
    }
    // the level's time, a whisper at the top (play time only)
    if (inLevel && this.phase !== "over") {
      const f = Math.max(0, 1 - (this.elapsed(now) - this.playAt) / LUMEN_ROUND_S);
      ctx.strokeStyle = "rgba(244,236,221,0.22)"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c.width * (0.5 - 0.4 * f), 10); ctx.lineTo(c.width * (0.5 + 0.4 * f), 10); ctx.stroke();
    }
  }

  // The hand on the disc, not the camera's arm: a glow with its capture
  // ring, and while carrying the candle itself riding on the lighting hand,
  // burning down as it travels. The keeping hand (modes) gets its own ring.
  _drawArmAndCursor(ctx, c, now) {
    const { Rs } = this._geo();
    const sides = this.holdSide ? [this.holdSide, this.lightSide] : this.bimanual ? [this.otherSide, this.lightSide] : [this.lightSide];
    for (const side of sides) {
      const d = this._disc(side);
      if (!d) continue;
      const hp = this._px(d);
      const lighting = side === this.lightSide;
      // stage two: the match in the other hand, once it is lit
      if (this.bimanual && !lighting && this.phase === "carrying" && this.matchLit) {
        const { U } = this._geo(), len = U * 0.045;
        ctx.save();
        ctx.strokeStyle = "#c9a26a"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(hp.x, hp.y + len * 0.3); ctx.lineTo(hp.x, hp.y - len * 0.7); ctx.stroke();
        this._drawFlame(ctx, hp.x, hp.y - len * 0.75, U * 0.013 * (0.6 + 0.4 * Math.max(0, this.burn / this.burnMax)));
        ctx.restore();
        continue;
      }
      if (lighting && this.phase === "carrying") {
        this._drawCandle(ctx, hp.x, hp.y, Math.max(0, this.burn / this.burnMax), this.target && this.target.match, this.bimanual);
        ctx.strokeStyle = "rgba(244,236,221,0.2)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, this.target.r * Rs * 0.35, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = lighting ? "rgba(244,236,221,0.22)" : "rgba(200,230,235,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, (lighting ? LUMEN_BASKET_R * 0.6 : CANDLE_BOX_R) * Rs, 0, TAU); ctx.stroke();
      this.glow(ctx, hp.x, hp.y, lighting ? 13 : 11, "#fff2c2", lighting ? "#e8a86a" : "#9fc0c8", 22);
    }
  }
  // Pip has the bottom-left corner, so the posture coach docks bottom-right
  coachDock(c) {
    const h = c.height * 0.18, w = h * 0.95;
    return { x: c.width - w - c.width * 0.02, y: c.height * 0.96, h };
  }

  extra() {
    if (this.cur) { this.cur.outcome = "time_up"; this.cur.tEnd = this.playT; this._finishTrial(this.cur); this.cur = null; }
    const L = this.level, choice = lumenIsChoice(L);
    const good = choice ? this.clean : this.lit;
    const att = this.lit + this.fail, rate = att ? good / att : 0, pct = Math.round(rate * 100);
    const enough = att >= LUMEN_MIN || this.endReason === "target";
    let verdict = "same";
    if (enough && rate >= LUMEN_UP) verdict = "up";
    else if (att >= 3 && rate < LUMEN_DOWN && L > 1) verdict = "down";
    const stars = (rate >= LUMEN_DOWN ? 1 : 0) + (rate >= LUMEN_UP && enough ? 1 : 0) + (rate >= LUMEN_UP && this.targetHit ? 1 : 0);
    const next = Math.max(1, Math.min(CANDLE_MAX, verdict === "up" ? L + 1 : verdict === "down" ? L - 1 : L));
    this.prog.best[L] = Math.max(this.prog.best[L] || 0, this.score);
    this.prog.stars[L] = Math.max(this.prog.stars[L] || 0, stars);
    const done = this.trials.filter(t => t.outcome === "lit");
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const r2 = v => v == null ? null : Math.round(v * 100) / 100;
    const mt = mean(done.map(t => t.mt).filter(v => v != null));
    return {
      candlesLevel: next,                       // the level the next round starts at (banked by main.js)
      levelPlayed: L,
      stage: LUMEN_STAGES[this.stage].name,
      chapter: LUMEN_STORY[this.chap].key,
      mode: this.mode,
      lightArm: this.lightSide,
      lanternsLit: this.lit,
      burntOut: this.fail - this.mothHits,
      mothHits: this.mothHits,
      candles: att,
      successPct: pct,
      verdict,
      lumenStars: stars,
      score: this.score,
      bestCombo: this.bestCombo,
      targetScore: this.targetScore,
      targetHit: this.targetHit,
      climbLost: Math.round(this.slip),
      endReason: this.endReason,
      starFragments: this.frags,
      meanReachMs: mt == null ? null : Math.round(mt * 1000),
      pathEfficiency: r2(mean(done.map(t => t.eff).filter(v => v != null))),
      meanPeakSpeed: r2(mean(done.map(t => t.peak))),          // reach fractions per second
      holdBreaks: this.lv.hold ? r2(mean(done.map(t => t.holdBreaks))) : null,
      meanReturnS: r2(mean(this.trials.map(t => t.returnTime).filter(v => v != null))),
      correctFirst: choice ? this.clean : null,
      wrongTouches: this.trials.reduce((s, t) => s + (t.wrongTouches || 0), 0),
      constellations: lumenIsTrail(L) ? this.constellations : null,
      atlasFound: this.prog.atlas.length,
      onTargetPct: this.lv.move ? r2(mean(done.map(t => t.onTargetPct).filter(v => v != null))) : null,
      trackErr: this.lv.move ? r2(mean(done.map(t => t.trackErr).filter(v => v != null))) : null,
      holdFrac: this.holdSide && this.activeMs ? Math.round(this.holdMs / this.activeMs * 100) / 100 : null,
      holdLapses: this.holdSide ? this.holdLapses : null,
      burnSeconds: Math.round(this.burnMax * 10) / 10,
      candlesProgress: this.prog,
      trials: this.trials,
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
        this._rallyT0 = this.elapsed(now);
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

/* ==================== Memory Pairs — the card-matching game, rebuilt for the arm ==================== */
// The classic Memory (Concentration) game from the mockup
// (mockups/memory-game-master.zip: a grid of face-down cards, turn two, a
// matching pair stays up, the rest turn back), rebuilt for the arm (Sep
// 2026, by request). What the mockup has that this keeps: a grid, two cards
// at a time, a pair stays, a mismatch turns back after a moment, and the
// board is done when every pair is found. What is different, and why:
//   - a card is turned by HOLDING the hand on it (sticky dwell), never by a
//     click or a squeeze: every turn is a reach to a place in the patient's
//     own workspace, and nothing is asked of the hand;
//   - the grid is laid INSIDE the measured envelope (like Connect the Dots:
//     a box on the axes the arm actually has, every card pulled radially in
//     to `spread × envAt`, and kept on screen), so no card is ever quietly
//     out of reach, and the levels widen the grid across more of the reach
//     while the cards get more numerous and the capture radius smaller;
//   - every board opens with a PEEK, all cards face up for a study time
//     that grows with the pairs, then they turn down: a memory task proper
//     (study, then recall) rather than blind guessing at first, which for
//     someone with cognitive as well as motor impairment is the difference
//     between a game and a lottery;
//   - a mismatch is not a miss: the DDA reads motor performance and a
//     forgotten card is not a motor error, so mismatches are counted as
//     `wrongTurns` in the round record and never fed to miss();
//   - the mockup's emoji fruit become drawn glyphs in the suite's own
//     palette (star, moon, heart, boat, fish, house, sun, cloud, lantern,
//     anchor): emoji render differently on every machine and a clinic PC
//     may have no colour emoji font at all;
//   - no moves counter, no clock on screen (diegetic rule): the count goes
//     to the therapist's log and the between-rounds card;
//   - THE CARDS NEVER MOVE (Sep 2026, by request after the first play): the
//     grid is laid out ONCE per board, in screen pixels, from the envelope
//     as it stands at that moment, and then frozen: positions, card size
//     and capture radius. Re-projecting each card from the body frame every
//     frame, as the other games do with their targets, let a tracking
//     re-snap or a scale change shift the whole board under the hand, and
//     a board you are trying to remember must not shift. Only the level's
//     `spread` changes how big the grid is, board to board.
const PAIR_LEVELS = [
  // cols x rows = cards; radius = capture radius, SW; spread = fraction of the envelope the grid fills
  { cols: 2, rows: 2, radius: 0.30, spread: 0.60 },
  { cols: 3, rows: 2, radius: 0.27, spread: 0.70 },
  { cols: 4, rows: 2, radius: 0.24, spread: 0.80 },
  { cols: 4, rows: 3, radius: 0.21, spread: 0.90 },
  { cols: 4, rows: 4, radius: 0.18, spread: 1.00 },
  { cols: 5, rows: 4, radius: 0.16, spread: 1.00 },
];
const PAIR_MAX = PAIR_LEVELS.length;
const PAIR_PEEK_MS = 2200;      // study time per pair when a board opens (plus a base)
const PAIR_PEEK_BASE = 2500;
const PAIR_SHOW_MS = 1800;      // a mismatched pair stays face up this long before turning back
const PAIR_FLIP_MS = 380;       // the turn animation (instant under calm motion)
const PAIR_COOL_MS = 700;       // after cards turn back, a hand still on one does not re-turn it at once
const PAIR_GLYPHS = ["star", "moon", "heart", "boat", "fish", "house", "sun", "cloud", "lantern", "anchor"];

function pairShuffle(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
// the card faces: simple shapes in the suite's palette, s = half size in px,
// `bg` is the card's face colour for the moon's cut-out
function drawGlyph(ctx, kind, x, y, s, col, bg) {
  ctx.save();
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * 0.22); ctx.lineCap = "round"; ctx.lineJoin = "round";
  switch (kind) {
    case "star": starShape(ctx, x, y, s, col); break;
    case "moon":
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x + s * 0.45, y - s * 0.2, s * 0.8, 0, TAU); ctx.fill();
      break;
    case "heart":
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x - s * 1.3, y - s * 0.1, x - s * 0.6, y - s * 1.0, x, y - s * 0.35);
      ctx.bezierCurveTo(x + s * 0.6, y - s * 1.0, x + s * 1.3, y - s * 0.1, x, y + s * 0.9);
      ctx.fill();
      break;
    case "boat":
      ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.3); ctx.lineTo(x + s, y + s * 0.3); ctx.lineTo(x + s * 0.65, y + s * 0.85); ctx.lineTo(x - s * 0.65, y + s * 0.85); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + s * 0.2); ctx.lineTo(x, y - s * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * 0.08, y - s * 0.9); ctx.lineTo(x + s * 0.8, y + s * 0.1); ctx.lineTo(x + s * 0.08, y + s * 0.1); ctx.closePath(); ctx.fill();
      break;
    case "fish":
      ctx.beginPath(); ctx.ellipse(x - s * 0.15, y, s * 0.75, s * 0.5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + s * 0.45, y); ctx.lineTo(x + s, y - s * 0.55); ctx.lineTo(x + s, y + s * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x - s * 0.5, y - s * 0.12, s * 0.1, 0, TAU); ctx.fill();
      break;
    case "house":
      ctx.beginPath(); ctx.rect(x - s * 0.7, y - s * 0.1, s * 1.4, s * 1.0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - s * 0.95, y - s * 0.05); ctx.lineTo(x, y - s * 0.95); ctx.lineTo(x + s * 0.95, y - s * 0.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.rect(x - s * 0.18, y + s * 0.3, s * 0.36, s * 0.6); ctx.fill();
      break;
    case "sun":
      ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.68, y + Math.sin(a) * s * 0.68); ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); ctx.stroke();
      }
      break;
    case "cloud":
      ctx.beginPath();
      ctx.arc(x - s * 0.45, y + s * 0.15, s * 0.42, 0, TAU);
      ctx.arc(x + s * 0.05, y - s * 0.2, s * 0.55, 0, TAU);
      ctx.arc(x + s * 0.55, y + s * 0.15, s * 0.42, 0, TAU);
      ctx.rect(x - s * 0.45, y + s * 0.15, s * 1.0, s * 0.42);
      ctx.fill();
      break;
    case "lantern":
      ctx.beginPath(); ctx.roundRect(x - s * 0.55, y - s * 0.6, s * 1.1, s * 1.3, s * 0.25); ctx.fill();
      ctx.beginPath(); ctx.rect(x - s * 0.35, y - s * 0.95, s * 0.7, s * 0.3); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(x, y + s * 0.05, s * 0.22, s * 0.4, 0, 0, TAU); ctx.fill();
      break;
    case "anchor":
      ctx.beginPath(); ctx.arc(x, y - s * 0.7, s * 0.22, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.48); ctx.lineTo(x, y + s * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s * 0.1); ctx.lineTo(x + s * 0.55, y - s * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.8, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      break;
  }
  ctx.restore();
}

export class MemoryPairs extends GameBase {
  id = "pairs";
  setup() {
    this.tips = { objective: "Hold your hand on a card to turn it over. Find the two that match." };
    this.roundSeconds = 150;
    this.level = Math.max(1, Math.min(PAIR_MAX, this.opts.level || 1));
    this.boardsCleared = 0;
    this.pairsFound = 0; this.turns = 0; this.wrongTurns = 0;
    this.doneAt = 0;
    const wait = this.tellStory(STORIES.pairs);
    this._newBoard(performance.now() + wait);
  }
  _lv() { return PAIR_LEVELS[this.level - 1]; }

  // a fresh board: the deck, the grid inside the envelope, and the peek
  _newBoard(peekFrom) {
    const lv = this._lv();
    const n = lv.cols * lv.rows, pairs = n / 2;
    const kinds = pairShuffle(PAIR_GLYPHS).slice(0, pairs);
    const deck = pairShuffle([...kinds, ...kinds]);
    // the grid's box: the axis reaches this patient actually has (the
    // shorter side of each axis, so a lopsided envelope still gets a whole
    // grid), then every card pulled inside the reach in its own direction
    const hw = Math.min(this.envAt(0), this.envAt(Math.PI)) * lv.spread;
    const hh = Math.min(this.envAt(Math.PI / 2), this.envAt(-Math.PI / 2)) * lv.spread;
    const c = this.canvas, M = 70;
    this.cards = deck.map((kind, i) => {
      const ci = i % lv.cols, ri = Math.floor(i / lv.cols);
      const ux = lv.cols === 1 ? 0.5 : ci / (lv.cols - 1), uy = lv.rows === 1 ? 0.5 : ri / (lv.rows - 1);
      let x = CENTER.x + (ux - 0.5) * 2 * hw;
      let y = CENTER.y - (uy - 0.5) * 2 * hh;
      const dx = x - CENTER.x, dy = y - CENTER.y;
      const r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const lim = lv.spread * this.envAt(th);
      if (r > lim && r > 0) { x = CENTER.x + dx / r * lim; y = CENTER.y + dy / r * lim; }
      // to pixels ONCE, kept on screen, and frozen for the board
      const px = this.toPx({ x, y });
      px.x = Math.min(Math.max(px.x, M), c.width - M);
      px.y = Math.min(Math.max(px.y, M), c.height - M);
      const reachFrac = Math.hypot(dx, dy) / (this.envAt(th) || 1);
      return { px: px.x, py: px.y, reachFrac, kind, up: true, f: 1, matched: false, coolUntil: 0 };
    });
    // card size from the closest two cards, so a grid squeezed by a small
    // envelope or the screen edge never overlaps; frozen with the positions
    let cell = Infinity;
    for (let i = 0; i < this.cards.length; i++) for (let j = i + 1; j < this.cards.length; j++) {
      const a = this.cards[i], b = this.cards[j];
      cell = Math.min(cell, Math.hypot(a.px - b.px, a.py - b.py));
    }
    if (!isFinite(cell)) cell = c.height * 0.25;
    this.cardW = Math.min(cell * 0.78, c.height * 0.2);
    this.cardH = this.cardW * 1.18;
    this.radiusPx = lv.radius * this.sw();
    this.open = [];               // the one or two cards turned up and not yet matched
    this.hideAt = 0;              // when a mismatched pair turns back
    this._dwells = {};
    this.peekUntil = peekFrom + PAIR_PEEK_BASE + PAIR_PEEK_MS * pairs;
    this.phase = "peek";
    this._prompt("Have a good look", "The cards turn face down in a moment");
    if (this.boardsCleared === 0 || this.level <= 2) {
      this._speak("Have a good look at the cards. In a moment they turn face down, and you find the pairs.");
    }
  }

  // the nearest card the hand is over, or null: one card at a time, so a
  // hand between two cards never turns both. In pixels, against the frozen
  // board, at the palm (wrist fallback) like every other game.
  _hovered() {
    const c = this.canvas;
    const h = this.t.palmPx?.(this.side, c) || this.t.handPx(this.side, c);
    if (!h) return null;
    let best = null, bd = Infinity;
    this.cards.forEach((k, i) => { const d = Math.hypot(h.x - k.px, h.y - k.py); if (d < bd) { bd = d; best = i; } });
    return bd < this.radiusPx ? best : null;
  }

  update(now, dt) {
    const lv = this._lv();
    // the turn animation
    const step = A11Y.calm ? 1 : dt / PAIR_FLIP_MS;
    for (const k of this.cards) k.f = k.up ? Math.min(1, k.f + step) : Math.max(0, k.f - step);

    if (this.doneAt) {
      if (now - this.doneAt > 3400) {
        this.doneAt = 0;
        this.boardsCleared++;
        if (this.level < PAIR_MAX) { this.level++; this.say(`Level ${this.level}. A few more cards this time.`); }
        else this.say("Another board.");
        this._newBoard(now);
      }
      return;
    }
    if (this.phase === "peek") {
      if (now >= this.peekUntil) {
        this.phase = "play";
        for (const k of this.cards) k.up = false;
        this._prompt("Find the pairs", "Hold your hand on a card to turn it over");
        setTimeout(() => { if (this.active && this.phase === "play") this._prompt(""); }, 3200);
        this.fb.lastEvent = now;
      }
      return;
    }
    // a mismatched pair turns back after its moment
    if (this.hideAt) {
      if (now >= this.hideAt) {
        for (const i of this.open) { this.cards[i].up = false; this.cards[i].coolUntil = now + PAIR_COOL_MS; this.clearDwell(`c${i}`); }
        this.open = []; this.hideAt = 0;
      }
      return;
    }
    const hi = this._hovered();
    // dwell on one card at a time: any other card's progress is dropped
    for (let i = 0; i < this.cards.length; i++) if (i !== hi) this.clearDwell(`c${i}`);
    if (hi == null) return;
    const k = this.cards[hi];
    if (k.up || k.matched || now < k.coolUntil || this.open.length >= 2) return;
    const f = this.dwellProgress(`c${hi}`, true, now);
    if (f < 1) return;
    this.clearDwell(`c${hi}`);
    k.up = true;
    this.open.push(hi);
    this.hit({ reachFrac: k.reachFrac }, Math.min(7, this.open.length + 1));
    if (this.open.length < 2) return;
    // two are up: a pair stays, anything else goes back after a moment
    this.turns++;
    const [a, b] = this.open.map(i => this.cards[i]);
    if (a.kind === b.kind) {
      a.matched = b.matched = true;
      this.open = [];
      this.pairsFound++;
      this.stats.stars += 15;
      audio.note(6);
      this.burstAtPx(a.px, a.py, "#9fc08a"); this.burstAtPx(b.px, b.py, "#9fc08a");
      if (this.cards.every(q => q.matched)) {
        this.doneAt = now;
        audio.fanfare();
        this.say("You found them all!");
      } else if (this.pairsFound % 3 === 0) this.say(["A pair! Lovely.", "That's a match.", "Well remembered."][this.pairsFound % 3]);
    } else {
      this.wrongTurns++;
      this.hideAt = now + PAIR_SHOW_MS;
      audio.note(1);
      if (this.wrongTurns === 2 || this.wrongTurns % 5 === 0) this.say("Not those two. They go back. Have another go.");
    }
  }

  drawBg(ctx, c) {
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.45, 60, c.width / 2, c.height * 0.45, c.height * 0.95);
    g.addColorStop(0, "#2c3556"); g.addColorStop(1, "#141830");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    twinkles(ctx, c);
  }

  // a burst at a screen point (the board lives in pixels, not the body frame)
  burstAtPx(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
  }

  draw(ctx, c, now) {
    const P = this.cards.map(k => ({ x: k.px, y: k.py }));
    const W = this.cardW, H = this.cardH, R = W * 0.14;
    const pulse = Math.sin(now / 360) * 0.5 + 0.5;
    const hi = this.phase === "play" && !this.hideAt && !this.doneAt ? this._hovered() : null;
    ctx.save();
    this.cards.forEach((k, i) => {
      const p = P[i];
      // the turn: the card narrows to an edge and widens again, face up
      // for the second half
      const s = Math.abs(Math.cos(k.f * Math.PI));
      const faceUp = k.f > 0.5;
      const w = Math.max(W * s, 2);
      const x = p.x - w / 2, y = p.y - H / 2;
      ctx.save();
      if (k.matched) ctx.globalAlpha = 0.72;
      if (faceUp) {
        roundedRect(ctx, x, y, w, H, R, k.matched ? "#dfe9c8" : "#fdf6e3", k.matched ? "#b9cf9c" : "#e9dcc0");
        if (s > 0.35) {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.scale(s, 1);
          drawGlyph(ctx, k.kind, 0, 0, W * 0.3, k.matched ? "#6f9b58" : "#c77f4a", k.matched ? "#dfe9c8" : "#fdf6e3");
          ctx.restore();
        }
      } else {
        roundedRect(ctx, x, y, w, H, R, "#2f3358", "#1b1b3a");
        ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x + 5, y + 5, Math.max(w - 10, 1), H - 10, R * 0.7); ctx.stroke();
        if (s > 0.35) {   // a small mark on the back, so the backs read as cards
          ctx.fillStyle = "rgba(232,168,106,0.55)";
          ctx.beginPath(); ctx.arc(p.x, p.y, W * 0.08, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      // the card the hand is over: a soft ring and the hold's progress
      if (hi === i && !k.up && !k.matched) {
        ctx.strokeStyle = `rgba(232,168,106,${0.45 + pulse * 0.4})`; ctx.lineWidth = 4; ctx.setLineDash([8, 9]);
        ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, H + 16, R + 6); ctx.stroke(); ctx.setLineDash([]);
        const f = Math.min(1, (this._dwells?.[`c${i}`]?.acc ?? 0) / A11Y.dwellMs);
        if (f > 0) {
          ctx.strokeStyle = "#9fc08a"; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, W * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
        }
      }
    });
    ctx.restore();
    // the peek's remaining time, as a thin bar above the grid: "they turn
    // over in a moment" drawn, not counted down out loud
    if (this.phase === "peek" && this.peekUntil > now) {
      const total = PAIR_PEEK_BASE + PAIR_PEEK_MS * (this.cards.length / 2);
      const f = Math.max(0, Math.min(1, (this.peekUntil - now) / total));
      const top = Math.min(...P.map(p => p.y)) - H / 2 - 26;
      const bw = c.width * 0.28;
      ctx.fillStyle = "rgba(244,236,221,0.18)";
      ctx.beginPath(); ctx.roundRect(c.width / 2 - bw / 2, top, bw, 8, 4); ctx.fill();
      ctx.fillStyle = "#e8a86a";
      ctx.beginPath(); ctx.roundRect(c.width / 2 - bw / 2, top, bw * f, 8, 4); ctx.fill();
    }
    this.drawTimerWhisper(ctx, c, now);
  }

  extra() {
    return {
      pairsLevel: this.level,
      boardsCleared: this.boardsCleared,
      pairsFound: this.pairsFound,
      turns: this.turns,             // two-card turns taken
      wrongTurns: this.wrongTurns,   // of which mismatches (a memory slip, never a motor miss)
      cards: this._lv().cols * this._lv().rows,
      cardRadiusSW: this._lv().radius,
    };
  }
}

/* ================= Windy City Flap (Oct 2026, by request) =================
 * Rebuilt from mockups/windy-city-flap-share (1).zip: Rook the cat pilot
 * flies a small jet through a painted city, and the player keeps the jet
 * LEVEL. The mockup steered with one thumb from each hand; here the two ARMS
 * are the thumbs. Height is the mean of the two wrists' heights, tilt is the
 * difference between them, so both arms have to move together and stay
 * even: symmetric, in-phase bimanual control with a steady correction
 * against tilt and wind. The one bimanual game in STRIVE.
 *
 * What is the patient's: the lane. The jet's whole vertical range is the
 * trained arm's measured reach straight up and down (rangeScale × envAt,
 * grown live like Pong's lane), so a full lift flies to the top of the lane,
 * arms down is the bottom, and every gap is inside the lane by construction:
 * a tower never asks for more than the arm was measured to have. Flying
 * speed follows params.lifetime (a slower patient flies a slower city) and
 * the mockup's pixel constants are fractions of the lane and the screen.
 *
 * Kept from the mockup: Rook sliding toward the low end and falling off past
 * the edge (from level 2), the 12-level ladder and its endless extension,
 * 90-second levels, 3 hearts, feathers (a certain reward, counted, never a
 * currency), the combo for staying under 5° of tilt, the painted skies, the
 * generated sounds (audio.windy), the tilt gauge in degrees (the one number
 * on screen, because it IS the task), the guided first flight at level 1.
 * Dropped: the daily flight, streaks, scarves and shop, power-ups, sharing,
 * vibration, paying feathers to continue, the level map.
 */
const WINDY_LEVELS = [
  // speed: the mockup's px/frame at 640 px high; gap and mov: fractions of
  // the lane; spacing: px between towers at 640 high; vary: how far the gap
  // wanders from the middle of the lane (1 = anywhere)
  { speed: 1.5, gap: 0.77, mov: 0, wind: 0, drones: 0, slide: 0, vary: 0.25, spacing: 430, note: "Learn to fly: slow, wide and steady" },
  { speed: 1.8, gap: 0.69, mov: 0, wind: 0, drones: 0, slide: 0.4, vary: 0.6, spacing: 390, note: "Now Rook slides when the jet tilts. Keep it level!" },
  { speed: 2.3, gap: 0.64, mov: 0, wind: 0, drones: 0, slide: 0.45, note: "Faster flying" },
  { speed: 2.3, gap: 0.64, mov: 0, wind: 0, drones: 0.35, slide: 0.45, note: "Drones appear: fly around them" },
  { speed: 2.3, gap: 0.64, mov: 0.043, wind: 0, drones: 0.35, slide: 0.48, note: "Bridges start to move" },
  { speed: 2.3, gap: 0.61, mov: 0.043, wind: 0, drones: 0.35, slide: 0.48, note: "Narrower gaps" },
  { speed: 2.6, gap: 0.61, mov: 0.043, wind: 0, drones: 0.35, slide: 0.5, note: "Faster flying" },
  { speed: 2.6, gap: 0.61, mov: 0.043, wind: 0.10, drones: 0.35, slide: 0.5, note: "A crosswind tilts the jet" },
  { speed: 2.6, gap: 0.61, mov: 0.043, wind: 0.10, drones: 0.6, slide: 0.52, note: "More drones to dodge" },
  { speed: 2.6, gap: 0.61, mov: 0.075, wind: 0.10, drones: 0.6, slide: 0.52, note: "Bridges move further" },
  { speed: 2.6, gap: 0.61, mov: 0.075, wind: 0.16, drones: 0.6, slide: 0.55, note: "Stronger crosswind" },
  { speed: 3.0, gap: 0.58, mov: 0.086, wind: 0.16, drones: 0.6, slide: 0.6, note: "The finale: everything at once" },
];
export const WINDY_MAX = 24;              // 12 on the ladder, then endless levels, a little tighter each
export function windyLevel(n) {
  if (n <= WINDY_LEVELS.length) return WINDY_LEVELS[n - 1];
  const k = n - WINDY_LEVELS.length;
  return { speed: Math.min(4.6, 3.0 + k * 0.12), gap: Math.max(0.5, 0.58 - k * 0.008), mov: Math.min(0.124, 0.086 + k * 0.0054),
    wind: Math.min(0.24, 0.16 + k * 0.008), drones: Math.min(0.8, 0.6 + k * 0.02), slide: Math.min(0.75, 0.6 + k * 0.01), note: "A little faster and tighter" };
}
const WINDY_LEVEL_S = 90;                 // one level is one round of flying
const WINDY_HEARTS = 3;
const WINDY_REF_H = 640;                  // the mockup's logical height: its px constants scale by H / this
const WINDY_LIFETIME_REF = 2.2;           // params.lifetime at which the city flies at the mockup's pace: a typical
                                          // patient (lifetime about 2.8) flies about a quarter slower than the mockup
const WINDY_STEP_MAX = 0.55;              // consecutive gaps are never further apart than this share of the lane, so
                                          // no tower asks for a full-range swing of the arms in one interval
const WINDY_LANE_TOP = 0.12, WINDY_LANE_BOT = 0.82, WINDY_GROUND = 0.88;   // fractions of the screen height
const WINDY_BOARD = 0.105;                // jet length, fraction of the screen height (the mockup's 66 of 640)
const WINDY_SPAN_MIN = 0.6;               // SW: the hands' sideways distance never reads narrower than this (tilt = atan2(dy, dx))
const WINDY_DEAD_DEG = 3;                 // degrees of tilt forgiven before the jet leans at all
const WINDY_LANE_PAD = 0.9;               // the lane ends at 90% of the measured reach, so top and bottom are reachable without a strain
const WINDY_STEADY_DEG = 5, WINDY_LOSE_DEG = 12;   // under 5° builds the combo, over 12° loses it
const WINDY_HANDS_LOST_MS = 1500;         // both hands out of view this long pauses the jet
const WINDY_SKIES = [
  { g: ["#6c8fc9", "#b9c7e6", "#f2c9c4", "#fde3c8"], sun: [0.2, 0.66, "#ffe7c9", 30], cl: ["#f0d6d6", "#fbeaea", "#fff"], shade: 0 },
  { g: ["#4f8ccc", "#8fc1e6", "#cfe7f3", "#f8ebcf"], sun: [0.8, 0.16, "#fffbe6", 26], cl: ["#c7d6ea", "#eef3fa", "#fff"], shade: 0 },
  { g: ["#3a7fd0", "#6fb1ea", "#b8def4", "#e4f2f8"], sun: [0.5, 0.1, "#ffffff", 24], cl: ["#c3d6ee", "#eef4fb", "#fff"], shade: 0 },
  { g: ["#4d86c9", "#88bde6", "#d7e9f0", "#f6e6c2"], sun: [0.75, 0.3, "#fff3d0", 28], cl: ["#c9d3e6", "#f2f0ee", "#fff"], shade: 0 },
  { g: ["#5b7fc0", "#a9b8d8", "#f4cf9a", "#f6b26b"], sun: [0.7, 0.55, "#ffd27f", 34], cl: ["#d8b8a8", "#f6dcc0", "#fff3dc"], shade: 0.05 },
  { g: ["#3d4f93", "#8a6fa8", "#e88a7a", "#f6b06a"], sun: [0.5, 0.72, "#ff9c55", 44], cl: ["#a77d98", "#e6a49a", "#ffd0a8"], shade: 0.15 },
  { g: ["#6f85a3", "#9fb1c6", "#c9d3dc", "#dfe3e2"], sun: null, cl: ["#8f9db0", "#c2cbd6", "#e3e8ee"], shade: 0.1, clouds: 4 },
  { g: ["#2b2f5e", "#5a4a85", "#b0708a", "#f0a07a"], sun: [0.3, 0.86, "#ff8a5c", 40], cl: ["#5e5486", "#8c6f9a", "#c48c9c"], shade: 0.3 },
  { g: ["#0f1838", "#1f2b5a", "#34477a", "#4a5e8c"], moon: [0.75, 0.18, 22], cl: ["#2a3866", "#3a4a7a", "#56679a"], shade: 0.55, night: 1 },
  { g: ["#142045", "#26386b", "#3f5a8f", "#6a7fae"], moon: [0.3, 0.22, 34], cl: ["#34467a", "#4c5f92", "#7486b4"], shade: 0.5, night: 1 },
  { g: ["#2c3442", "#46536a", "#6b778c", "#8a93a3"], sun: null, cl: ["#3a4354", "#55607a", "#727d94"], shade: 0.45, night: 1, clouds: 4 },
  { g: ["#0c1230", "#24215a", "#4a2f6e", "#7a3f73"], moon: [0.85, 0.12, 16], cl: ["#2a2758", "#3e3570", "#5a4580"], shade: 0.55, night: 1, fire: 1 },
];
const WINDY_TOWER_PAL = [["#f1dcc0", "#cdb499", "#8a6f5a"], ["#dfe6ee", "#b6c3d4", "#6b7f99"], ["#ecd1c6", "#c8a49a", "#9a6d63"]];
const windyRnd = s => { const x = Math.sin(s * 127.1) * 43758.5; return x - Math.floor(x); };

// the painted city, once per level, as an offscreen canvas (the mockup's
// paintScene with its pixel sizes scaled to the screen height)
function windyPaintScene(S, W, H, k) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, W); c.height = Math.max(1, H);
  const x = c.getContext("2d");
  const GROUND = H * WINDY_GROUND;
  const g = x.createLinearGradient(0, 0, 0, H);
  [0, 0.42, 0.7, 0.88].forEach((p, i) => g.addColorStop(p, S.g[i]));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  if (S.night) { x.fillStyle = "#e9f0ff"; for (let i = 0; i < 90; i++) { x.globalAlpha = 0.3 + windyRnd(i + 0.3) * 0.6; x.fillRect(windyRnd(i) * W, windyRnd(i + 0.7) * H * 0.5, 1.6 * k, 1.6 * k); } x.globalAlpha = 1; }
  if (S.sun) {
    const [sx, sy, col, r0] = S.sun, r = r0 * k;
    const gl = x.createRadialGradient(W * sx, H * sy, r * 0.6, W * sx, H * sy, r * 6);
    gl.addColorStop(0, col); gl.addColorStop(1, "rgba(255,255,255,0)");
    x.globalAlpha = 0.55; x.fillStyle = gl; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    x.fillStyle = col; x.beginPath(); x.arc(W * sx, H * sy, r, 0, TAU); x.fill();
  }
  if (S.moon) {
    const [mx, my, r0] = S.moon, r = r0 * k;
    const gl = x.createRadialGradient(W * mx, H * my, r, W * mx, H * my, r * 5);
    gl.addColorStop(0, "rgba(220,230,255,.35)"); gl.addColorStop(1, "rgba(220,230,255,0)");
    x.fillStyle = gl; x.fillRect(0, 0, W, H);
    x.fillStyle = "#f4f1dc"; x.beginPath(); x.arc(W * mx, H * my, r, 0, TAU); x.fill();
    x.fillStyle = "rgba(200,195,170,.5)"; x.beginPath(); x.arc(W * mx - r * 0.3, H * my + r * 0.1, r * 0.22, 0, TAU); x.arc(W * mx + r * 0.25, H * my - r * 0.3, r * 0.15, 0, TAU); x.fill();
  }
  if (S.fire) {
    for (let f = 0; f < 3; f++) {
      const fx = W * (0.2 + f * 0.3), fy = H * (0.18 + windyRnd(f) * 0.15), cols = ["#f3b562", "#f19bb5", "#9fd8f0"];
      x.strokeStyle = cols[f]; x.lineWidth = 2 * k; x.globalAlpha = 0.8;
      for (let q = 0; q < 14; q++) { const a = q / 14 * TAU; x.beginPath(); x.moveTo(fx + Math.cos(a) * 8 * k, fy + Math.sin(a) * 8 * k); x.lineTo(fx + Math.cos(a) * 26 * k, fy + Math.sin(a) * 26 * k); x.stroke(); }
      x.globalAlpha = 1;
    }
  }
  const cloud = (cx, cy, w, seed) => {
    const puffs = [];
    for (let i = 0; i < 12; i++) {
      const px = cx - w * 0.35 + windyRnd(seed + i) * w * 0.7, py = cy - windyRnd(seed + i + 0.5) * w * 0.25 * (1 - Math.abs((px - cx) / w) * 1.6), r = w * 0.09 + windyRnd(seed + i + 0.2) * w * 0.1;
      puffs.push([px, py, r]);
    }
    x.fillStyle = S.cl[0]; for (const [p, q, r] of puffs) { x.beginPath(); x.arc(p, q + r * 0.2, r, 0, TAU); x.fill(); }
    x.fillStyle = S.cl[1]; for (const [p, q, r] of puffs) { x.beginPath(); x.arc(p, q, r * 0.9, 0, TAU); x.fill(); }
    x.fillStyle = S.cl[2]; for (const [p, q, r] of puffs) { x.beginPath(); x.arc(p + r * 0.15, q - r * 0.2, r * 0.6, 0, TAU); x.fill(); }
  };
  cloud(W * 0.22, H * 0.2, H * 0.5, 3); cloud(W * 0.75, H * 0.38, H * 0.45, 11);
  if (S.clouds) { cloud(W * 0.55, H * 0.12, H * 0.55, 21); cloud(W * 0.05, H * 0.42, H * 0.4, 31); }
  // the far skyline, then the near one with its windows
  let px = 0, i = 0;
  x.fillStyle = S.night ? "rgba(40,55,95,.8)" : "rgba(130,158,196,.45)";
  while (px < W) { const w = (24 + windyRnd(i) * 32) * k, h = (50 + windyRnd(i + 0.5) * 130) * k; x.fillRect(px, GROUND - 60 * k - h, w, h); if (windyRnd(i + 0.7) > 0.75) x.fillRect(px + w / 2 - k, GROUND - 60 * k - h - 20 * k, 2 * k, 20 * k); px += w + 3 * k; i++; }
  px = -10 * k; i = 40;
  const pal = ["#ecd3b2", "#dcb59a", "#d4c6ae", "#e8dcc0"], wins = [];
  while (px < W) {
    const w = (40 + windyRnd(i) * 46) * k, h = (70 + windyRnd(i + 0.3) * 120) * k, y = GROUND - 40 * k - h;
    x.fillStyle = pal[Math.floor(windyRnd(i + 0.1) * pal.length)]; x.fillRect(px, y, w, h);
    x.fillStyle = "rgba(80,95,130,.12)"; x.fillRect(px + w * 0.72, y, w * 0.28, h);
    x.fillStyle = "#7aad62"; x.beginPath(); x.arc(px + w * 0.3, y, 6 * k, 0, TAU); x.arc(px + w * 0.65, y, 5 * k, 0, TAU); x.fill();
    for (let wy = y + 12 * k; wy < GROUND - 48 * k; wy += 16 * k) for (let wx = px + 7 * k; wx < px + w - 10 * k; wx += 11 * k) if (windyRnd(wx * 0.13 + wy * 0.07) > 0.55) wins.push([wx, wy]);
    px += w + 6 * k; i++;
  }
  const lg = x.createLinearGradient(0, GROUND - 40 * k, 0, GROUND);
  lg.addColorStop(0, "#6dbccc"); lg.addColorStop(1, "#4795b1");
  x.fillStyle = lg; x.fillRect(0, GROUND - 40 * k, W, 40 * k);
  for (let q = -10 * k; q < W; q += 30 * k) {
    const r = (15 + windyRnd(q) * 10) * k, cx = q + windyRnd(q + 1) * 8 * k, cy = GROUND - 10 * k;
    x.fillStyle = "#57894b"; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.fillStyle = "#78ad5f"; x.beginPath(); x.arc(cx - r * 0.2, cy - r * 0.25, r * 0.7, 0, TAU); x.fill();
  }
  const gg = x.createLinearGradient(0, GROUND, 0, H);
  gg.addColorStop(0, "#82b862"); gg.addColorStop(1, "#5a8f4a");
  x.fillStyle = gg; x.fillRect(0, GROUND, W, H - GROUND);
  x.fillStyle = "#eadfc2"; x.fillRect(0, GROUND + 28 * k, W, 10 * k);
  if (S.shade) { x.fillStyle = `rgba(18,24,60,${S.shade})`; x.fillRect(0, GROUND - 260 * k, W, H); }
  if (S.night) {
    x.fillStyle = "rgba(255,224,150,.85)"; for (const [wx, wy] of wins) x.fillRect(wx, wy, 4 * k, 6 * k);
    x.fillStyle = "rgba(255,224,150,.5)"; for (let q = 0; q < W; q += 60 * k) x.fillRect(q, GROUND - 6 * k + ((q / (60 * k)) % 2) * 3 * k, 22 * k, 2 * k);
  }
  return c;
}

// One control channel: a running median over the last PADDLE_MEDIAN distinct
// tracker samples, then an adaptive One-Euro filter, the way Pong's paddle is
// smoothed (same constants, same reasons: a median discards an outlier where
// a low-pass only spreads it; the cutoff opens with speed so holding still is
// quiet and moving is not laggy). A missing sample HOLDS the last value.
class WindyChannel {
  constructor() { this.v = null; this.dv = 0; this.buf = []; this.seen = null; }
  push(raw, seen, dt) {
    if (raw == null) return this.v;
    if (seen !== this.seen) { this.seen = seen; this.buf.push(raw); if (this.buf.length > PADDLE_MEDIAN) this.buf.shift(); }
    const sorted = [...this.buf].sort((a, b) => a - b);
    const target = sorted[sorted.length >> 1];
    if (this.v == null) { this.v = target; return target; }
    const dts = Math.max(1, dt) / 1000;
    const lp = (cut) => { const r = TAU * cut * dts; return r / (r + 1); };
    const rawD = (target - this.v) / dts;
    this.dv += lp(PADDLE_D_CUT) * (rawD - this.dv);
    this.v += lp(PADDLE_MIN_CUT + PADDLE_BETA * Math.abs(this.dv)) * (target - this.v);
    return this.v;
  }
}

export class WindyCity extends GameBase {
  id = "windy";
  setup() {
    this.tips = { objective: "Lift both arms together to climb, lower them to dive, and keep them level to fly through the gaps." };
    this.level = Math.max(1, Math.min(WINDY_MAX, this.opts.level || 1));
    this.lvl = windyLevel(this.level);
    const c = this.canvas;
    this._layout(c);
    // the city flies at the mockup's pace for a typical patient and slower
    // for a slower one: lifetime is the DDA's own "how fast can they go"
    this.paceK = Math.max(0.8, Math.min(2.2, (this.params.lifetime || 2.8) / WINDY_LIFETIME_REF));
    this.scene = windyPaintScene(WINDY_SKIES[(this.level - 1) % WINDY_SKIES.length], c.width, c.height, this.k);
    this.sceneSize = `${c.width}x${c.height}`;
    this.board = { y: this.laneBot, ang: 0 };
    this.rider = { off: 0, v: 0 };
    this.obs = []; this.items = []; this.drones = []; this.toasts = [];
    this.lives = WINDY_HEARTS; this.heartsLost = 0;
    this.combo = 1; this.steadyT = 0;
    this.invuln = 0; this.fallT = 0; this.shake = 0; this.frame = 0;
    this.lvT = 0;                               // frames of play on the level clock (tutorial and pauses excluded)
    this.lvFrames = WINDY_LEVEL_S * 60;
    this.passed = 0; this.crashes = 0; this.falls = 0; this.crashBy = { tower: 0, bridge: 0, ground: 0, drone: 0 };
    this.feathersGot = 0; this.feathersSpawned = 0;
    this.tiltSum = 0; this.tiltN = 0; this.tiltMax = 0; this.steadyFrames = 0;
    this.score = 0;
    this.windNow = 0;
    this.acc = 0;
    this.fH = new WindyChannel(); this.fTilt = new WindyChannel();
    this.fHeight = 0; this.tiltDeg = 0; this.hL = null; this.hR = null; this.handsAt = 0; this.handsLost = false;
    this.laneLo = null; this.laneHi = null;
    this.over = null;
    // the level's own backstop on the engine clock: the flight, the guided
    // first flight before it, the card after it
    const tutorial = !!this.opts.tellStory && this.level === 1;
    this.roundSeconds = WINDY_LEVEL_S + 25 + (tutorial ? 75 : 0);
    this.tut = tutorial ? { step: 0, hold: 0, said: -1 } : null;
    this.hadTutorial = tutorial;
    if (this.tut) {
      this._prompt("First flight", "We will show you how to steer");
      this._speak("Rook needs a co-pilot. Let's learn to fly. Lift both arms together to fly up into the ring.");
      this._tutKey = e => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); this._endTutorial(true); } };
      addEventListener("keydown", this._tutKey);
    } else {
      const wait = this.opts.tellStory ? this.tellStory(STORIES.windy) : 0;
      setTimeout(() => { if (!this.active) return; this._prompt(`Level ${this.level}`, this.lvl.note); if (!wait) this._speak(`Level ${this.level}. ${this.lvl.note}`); setTimeout(() => { if (this.active) this._prompt(""); }, 3600); }, wait);
      this._takeOff();
    }
  }
  stop() { super.stop(); if (this._tutKey) { removeEventListener("keydown", this._tutKey); this._tutKey = null; } }

  _layout(c) {
    const H = c.height;
    this.k = H / WINDY_REF_H;                   // the mockup's pixel constants scale with the screen height
    this.ground = H * WINDY_GROUND;
    this.laneTop = H * WINDY_LANE_TOP; this.laneBot = H * WINDY_LANE_BOT;
    this.laneH = this.laneBot - this.laneTop;
    this.boardLen = H * WINDY_BOARD;
    this.bx = Math.min(c.width * 0.32, 300 * this.k);
  }
  _takeOff() {
    this.flying = true;
    audio.windy("start");
    const spc = this._spacing();
    for (let i = 0; i < 4; i++) this._spawn(this.canvas.width + 170 * this.k + i * spc);
  }
  _endTutorial(skipped) {
    if (!this.tut) return;
    this.tut = null;
    if (this._tutKey) { removeEventListener("keydown", this._tutKey); this._tutKey = null; }
    this._prompt(skipped ? "Here they come" : "You've got it!", "Fly through the gaps");
    this._speak(skipped ? "Here come the towers. Fly through the gaps." : "You've got it. Here come the towers. Fly through the gaps.");
    setTimeout(() => { if (this.active) this._prompt(""); }, 3200);
    this.fb.lastEvent = performance.now();
    this._takeOff();
  }
  _spacing() { return (this.lvl.spacing || 340) * this.k; }
  _speedPx() { return this.lvl.speed * this.k / this.paceK; }   // px per 60 Hz step

  // ---- the two hands: height = mean, tilt = difference ------------------
  _readHands(now, dt) {
    const L = this.t.handRel("left"), R = this.t.handRel("right");
    if (L) this.hL = L;
    if (R) this.hR = R;
    if (L || R) this.handsAt = now;
    this.handsLost = !L && !R && now - this.handsAt > WINDY_HANDS_LOST_MS;
    if (!this.hL || !this.hR) return;
    const seen = this.t.lastSeen;
    // the lane in shoulder widths: the trained arm's measured reach straight
    // down to straight up (both arms move together, so the trained one is
    // the limit), grown live if the hands go past it, like Pong's lane
    if (this.laneLo == null) {
      this.laneLo = -this.params.rangeScale * this.envAt(-Math.PI / 2) * WINDY_LANE_PAD;
      this.laneHi = this.params.rangeScale * this.envAt(Math.PI / 2) * WINDY_LANE_PAD;
    }
    const mean = (this.hL.y + this.hR.y) / 2;
    if (mean < this.laneLo) this.laneLo = mean;
    if (mean > this.laneHi) this.laneHi = mean;
    const f = (mean - this.laneLo) / Math.max(0.5, this.laneHi - this.laneLo);
    this.fHeight = this.fH.push(Math.max(0, Math.min(1, f)), seen, dt) ?? 0;
    // tilt: the line between the two hands, degrees, positive = right hand
    // higher; a 0.5 SW difference across a shoulder width is about 25°
    const dx = Math.max(WINDY_SPAN_MIN, Math.abs(this.hR.x - this.hL.x));
    let a = Math.atan2(this.hR.y - this.hL.y, dx) * 180 / Math.PI;
    a = Math.sign(a) * Math.max(0, Math.abs(a) - WINDY_DEAD_DEG);
    this.tiltDeg = this.fTilt.push(a, seen, dt) ?? 0;
  }

  // ---- the world ---------------------------------------------------------
  _spawn(x) {
    const lvl = this.lvl, k = this.k, R = Math.random;
    const gap = lvl.gap * this.laneH, vary = lvl.vary == null ? 1 : lvl.vary;
    let top = this.laneTop + (0.5 + (R() - 0.5) * vary) * (this.laneH - gap);
    // the gap wanders from tower to tower, but never by more than WINDY_STEP_MAX of the lane
    if (this.lastGapCy != null) {
      const cy = Math.max(this.lastGapCy - WINDY_STEP_MAX * this.laneH, Math.min(this.lastGapCy + WINDY_STEP_MAX * this.laneH, top + gap / 2));
      top = Math.max(this.laneTop, Math.min(this.laneBot - gap, cy - gap / 2));
    }
    this.lastGapCy = top + gap / 2;
    const mov = lvl.mov && R() < 0.6 ? lvl.mov * this.laneH : 0;
    const o = { x, base: top, top, gap, w: 66 * k, passed: false, mov, ph: R() * 6, style: Math.floor(R() * 3), hue: Math.floor(R() * 3), seed: R() * 999 };
    this.obs.push(o);
    if (R() < 0.85) { this.items.push({ x: x + o.w / 2, y: top + gap / 2, ph: R() * 6, follow: o }); this.feathersSpawned++; }
    const spc = this._spacing();
    if (lvl.drones && R() < lvl.drones) this.drones.push({ x: x + spc / 2 + o.w / 2, base: this.laneTop + this.laneH * (0.15 + R() * 0.7), ph: R() * 6 });
    else if (R() < 0.5) { this.items.push({ x: x + spc / 2 + o.w / 2, y: this.laneTop + this.laneH * (0.1 + R() * 0.8), ph: R() * 6 }); this.feathersSpawned++; }
  }
  _toast(text, col) { this.toasts.push({ text, t: 0, col }); }
  _sparks(x, y, col, n = 10, sp = 1) {
    const m = A11Y.calm ? Math.ceil(n / 3) : n;
    for (let i = 0; i < m; i++) { const a = Math.random() * TAU, s = sp * (1 + Math.random() * 3) * this.k * 0.8; this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col }); }
  }
  _riderPos() {
    const c = Math.cos(this.board.ang), s = Math.sin(this.board.ang), k = this.k;
    if (this.fallT > 0) { const q = 60 - this.fallT, dir = Math.sign(this.rider.off || 1); return { x: this.bx + c * this.rider.off + q * 1.2 * k * dir, y: this.board.y + s * this.rider.off - 16 * k + q * q * 0.12 * k }; }
    return { x: this.bx + c * this.rider.off + s * 14 * k, y: this.board.y + s * this.rider.off - c * 14 * k };
  }
  _loseLife(kind, what = "tower") {
    if (this.invuln > 0 || this.fallT > 0 || this.over) return;
    this.fallT = 60; this.shake = A11Y.calm ? 0 : 10 * this.k;
    this.lives--; this.heartsLost++; this.combo = 1; this.steadyT = 0;
    if (kind === "fall") { this.falls++; audio.windy("fall"); this._toast("Rook slid off!", "#d97b6c"); }
    else { this.crashes++; this.crashBy[what] = (this.crashBy[what] || 0) + 1; audio.windy("hit"); this._toast("Bonk!", "#d97b6c"); }
    const o = this._gapAhead();
    this.miss({ isFar: !!o && o.reach > 0.7 }, true);   // silent: the bonk or the fall is the sound
    if (this.lives > 0) this.say(kind === "fall" ? "Rook slipped off. Keep the arms level and he stays on." : "A soft bump. The towers are tricky. On we go.");
  }
  _respawn() {
    if (this.lives <= 0) { this._finish(false); return; }
    this.rider.off = 0; this.rider.v = 0; this.invuln = 120;
    const spc = this._spacing();
    for (const o of this.obs) if (o.x < this.bx + 60 * this.k && o.x + o.w > this.bx - 60 * this.k) o.x += spc * 0.6;
  }
  // the next gap the jet has to fly through: its centre as a share of the
  // lane from the bottom (1 = a full lift), for the DDA's reach fraction
  _gapAhead() {
    const o = this.obs.find(q => !q.passed && q.x + q.w > this.bx - 20 * this.k);
    if (!o) return null;
    const cy = o.top + o.gap / 2;
    return { o, cy, reach: 1 - (cy - this.laneTop) / this.laneH };
  }
  _finish(completed) {
    if (this.over) return;
    const fr = this.feathersSpawned ? this.feathersGot / this.feathersSpawned : 1;
    const stars = !completed ? 0 : this.heartsLost === 0 && fr >= 0.6 ? 3 : this.heartsLost <= 1 ? 2 : 1;
    this.over = { completed, stars, at: performance.now() };
    this.flying = false;
    if (completed) {
      audio.windy("win");
      this.score += 50 * this.level + (this.heartsLost === 0 ? 25 * this.level : 0);
      for (let i = 0; i < 5; i++) this._sparks(this.canvas.width * (0.2 + 0.15 * i), this.canvas.height * 0.3, ["#f3b562", "#d97b6c", "#6fa35a", "#5b9bd5", "#f19bb5"][i], 16, 1.6);
      this._prompt(stars === 3 ? "Perfect flight!" : stars === 2 ? "Great flying!" : "Level done!", `Level ${this.level} flown`);
      this.say(stars === 3 ? "A perfect flight. Rook is very impressed." : "Level done. Lovely flying.");
    } else {
      audio.windy("lose");
      this._prompt("The wind won that one", "Let's try again");
      this.say("The wind won that one. Let's try again.");
    }
  }

  // ---- the 60 Hz step (the mockup's physics, in screen pixels) ------------
  update(now, dt) {
    const c = this.canvas;
    if (this.sceneSize !== `${c.width}x${c.height}`) {
      this._layout(c);
      this.scene = windyPaintScene(WINDY_SKIES[(this.level - 1) % WINDY_SKIES.length], c.width, c.height, this.k);
      this.sceneSize = `${c.width}x${c.height}`;
    }
    this._readHands(now, dt);
    if (this.over) {
      if (now - this.over.at > (this.over.completed ? 4500 : 3800)) this._end();
      for (const q of this.toasts) q.t++;
      return;
    }
    if (this.handsLost) { this._prompt("Show both hands", "Rook holds the jet steady while he waits"); this._lostPrompt = true; return; }
    if (this._lostPrompt) { this._prompt(""); this._lostPrompt = false; }
    this.acc += Math.min(50, dt);
    while (this.acc >= 16.67) { this._step(); this.acc -= 16.67; }
  }
  _step() {
    const k = this.k, lvl = this.lvl, c = this.canvas;
    this.frame++;
    for (const q of this.toasts) q.t++;
    this.toasts = this.toasts.filter(q => q.t < 110).slice(-3);
    this.windNow = this.flying && lvl.wind && !this.tut
      ? Math.sin(this.frame * 0.011) * lvl.wind + Math.sin(this.frame * 0.027 + 1) * lvl.wind * 0.4
      : this.windNow * 0.95;
    // the jet follows the hands: height from the lane fraction, tilt from
    // the hands' angle (screen y points down, so a higher right hand is a
    // negative, anticlockwise angle) plus the crosswind
    const ty = this.laneBot - this.fHeight * this.laneH;
    const ta = Math.max(-0.9, Math.min(0.9, -this.tiltDeg * Math.PI / 180 + this.windNow));
    this.board.y += Math.max(-8 * k, Math.min(8 * k, (ty - this.board.y) * 0.2));
    this.board.ang += (ta - this.board.ang) * 0.25;
    const tiltAbs = Math.abs(this.board.ang * 180 / Math.PI);
    if (this.tut) { this._tutStep(tiltAbs); return; }
    if (!this.flying) return;
    this.tiltSum += tiltAbs; this.tiltN++; this.tiltMax = Math.max(this.tiltMax, tiltAbs);
    if (tiltAbs < WINDY_STEADY_DEG) this.steadyFrames++;
    if (this.fallT > 0) { this.fallT--; if (this.fallT === 0) this._respawn(); }
    else {
      if (lvl.slide) {
        this.rider.v += Math.sin(this.board.ang) * lvl.slide * k; this.rider.v *= 0.9;
        if (tiltAbs < 4) this.rider.off *= 0.96;
        this.rider.off += this.rider.v;
        if (Math.abs(this.rider.off) > this.boardLen / 2 - k) this._loseLife("fall");
      } else { this.rider.v = 0; this.rider.off *= 0.85; }
      if (tiltAbs < WINDY_STEADY_DEG) {
        this.steadyT += 1 / 60;
        const nc = this.steadyT > 12 ? 5 : this.steadyT > 7 ? 4 : this.steadyT > 4 ? 3 : this.steadyT > 2 ? 2 : 1;
        if (nc > this.combo) { this._toast(["", "", "Steady!", "Lovely and level", "Smooth flying", "Rock steady"][nc], "#f3b562"); this._sparks(this.bx, this.board.y, "#f3b562", 8); audio.windy("combo"); if (nc >= 4) this.say("Rock steady. Rook is loving this."); }
        this.combo = nc;
      } else if (tiltAbs > WINDY_LOSE_DEG) { this.steadyT = 0; this.combo = 1; }
      else this.steadyT = Math.max(0, this.steadyT - 1 / 60);
    }
    if (this.invuln > 0) this.invuln--;
    const sp = this._speedPx(), p = this._riderPos();
    for (const o of this.obs) {
      o.x -= sp;
      if (o.mov) o.top = Math.max(this.laneTop, Math.min(this.laneBot - o.gap, o.base + Math.sin(this.frame * 0.025 + o.ph) * o.mov));
      if (!o.passed && o.x + o.w < this.bx - 20 * k) {
        o.passed = true; this.passed++; this.score += 10 * this.combo;
        const reach = 1 - (o.top + o.gap / 2 - this.laneTop) / this.laneH;
        this.hit({ reachFrac: Math.max(0.25, Math.min(1, reach)) });
      }
    }
    for (const it of this.items) { it.x -= sp; if (it.follow) it.y = it.follow.top + it.follow.gap / 2; }
    for (const d of this.drones) { d.x -= sp + 0.5 * k; d.y = d.base + Math.sin(this.frame * 0.05 + d.ph) * 18 * k; }
    this.drones = this.drones.filter(d => !d.dead && d.x > -30 * k);
    if (this.obs.length && this.obs[0].x + this.obs[0].w < -20 * k) this.obs.shift();
    const spc = this._spacing();
    if (!this.obs.length || this.obs[this.obs.length - 1].x < c.width + 170 * k - spc) this._spawn((this.obs.length ? this.obs[this.obs.length - 1].x : c.width) + spc);
    this.lvT++;
    if (this.lvT >= this.lvFrames - 600 && this.lvT % 60 === 0) { audio.windy("tick"); if (this.lvT === this.lvFrames - 600) this._toast("Nearly there", "#f3b562"); }
    if (this.lvT >= this.lvFrames && this.fallT === 0) { this._finish(true); return; }
    // collisions: the cat's head and the jet's two ends against towers,
    // bridges, the ground and the drones
    const cs = Math.cos(this.board.ang), sn = Math.sin(this.board.ang), B = this.boardLen / 2;
    const pts = [[p.x + sn * 5 * k, p.y - cs * 5 * k, 6 * k], [this.bx - cs * (B - 4 * k), this.board.y - sn * (B - 4 * k) + 2 * k, 3 * k], [this.bx + cs * (B + 2 * k), this.board.y + sn * (B + 2 * k) + 2 * k, 3 * k]];
    if (this.fallT === 0 && this.invuln === 0) {
      outer: for (const o of this.obs) for (const [x, y, r] of pts) if (x + r > o.x + 3 * k && x - r < o.x + o.w - 3 * k && (y - r < o.top || y + r > o.top + o.gap)) { this._loseLife("hit", y - r < o.top ? "bridge" : "tower"); break outer; }
      if (this.board.y + 8 * k > this.ground - 2 * k) this._loseLife("hit", "ground");
      outer2: for (const d of this.drones) for (const [x, y, r] of pts) if (Math.hypot(d.x - x, d.y - y) < r + 9 * k) { d.dead = true; this._sparks(d.x, d.y, "#ff8a4c", 14); this._loseLife("hit", "drone"); break outer2; }
    }
    for (const it of this.items) if (!it.got && this.fallT === 0 && Math.hypot(it.x - p.x, it.y - p.y) < 34 * k) {
      it.got = true; this.feathersGot++; this.score += 5 * this.combo; this.stats.stars += 2;
      this._sparks(it.x, it.y, "#f3c05e", 6); audio.windy("feather");
    }
    this.items = this.items.filter(i => i.x > -30 * k && !i.got);
    if (this.shake > 0) { this.shake *= 0.85; if (this.shake < 0.5) this.shake = 0; }
  }
  // the guided first flight: up into a ring, down into a ring, tilt, level
  _tutStep(tiltAbs) {
    const tut = this.tut, H = this.canvas.height;
    this.rider.v = 0; this.rider.off *= 0.85;
    const goals = [this.laneTop + this.laneH * 0.25, this.laneTop + this.laneH * 0.78];
    let done = false;
    if (tut.step < 2) done = Math.abs(this.board.y - goals[tut.step]) < H * 0.05;
    else if (tut.step === 2) done = tiltAbs > 8;
    else if (tut.step === 3) done = tiltAbs < 5;
    else done = true;
    tut.hold = done ? tut.hold + 1 : Math.max(0, tut.hold - 1);
    const need = [30, 30, 25, 90, 100][tut.step];
    const lines = ["Lift both arms together to fly up into the ring", "Now lower both arms to fly down to the ring", "Lift one hand a little higher. See the jet tilt?", "Now make them level again and hold steady", "You've got it! Get ready"];
    if (tut.said !== tut.step) {
      tut.said = tut.step;
      this._prompt("First flight", lines[tut.step]);
      if (tut.step > 0) this._speak(lines[tut.step]);
    }
    if (tut.hold >= need) {
      tut.step++; tut.hold = 0;
      audio.windy("combo"); this._sparks(this.bx, this.board.y, "#6fa35a", 12);
      if (tut.step > 4) this._endTutorial(false);
    }
  }

  // ---- drawing --------------------------------------------------------
  drawBg(ctx, c) {
    if (this.scene) ctx.drawImage(this.scene, 0, 0, c.width, c.height);
    else { ctx.fillStyle = "#6c8fc9"; ctx.fillRect(0, 0, c.width, c.height); }
  }
  _tower(ctx, o) {
    const k = this.k, x = o.x, y = o.top + o.gap, w = o.w, h = this.ground - y + 6 * k, [c1, c2, c3] = WINDY_TOWER_PAL[o.hue];
    ctx.fillStyle = c1;
    if (o.style === 0) { ctx.fillRect(x, y + 34 * k, w, h - 34 * k); ctx.fillRect(x + 8 * k, y + 14 * k, w - 16 * k, 24 * k); ctx.fillRect(x + 18 * k, y, w - 36 * k, 18 * k); ctx.fillStyle = c3; ctx.fillRect(x + w / 2 - 1.5 * k, y - 24 * k, 3 * k, 24 * k); }
    else if (o.style === 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, [w / 2, w / 2, 0, 0]); ctx.fill(); ctx.fillStyle = c2; for (let q = y + 22 * k; q < this.ground; q += 16 * k) ctx.fillRect(x + 4 * k, q, w - 8 * k, 4 * k); }
    else { ctx.fillRect(x, y + 28 * k, w, h - 28 * k); ctx.beginPath(); ctx.moveTo(x + 4 * k, y + 30 * k); ctx.lineTo(x + w / 2, y - 12 * k); ctx.lineTo(x + w - 4 * k, y + 30 * k); ctx.fill(); ctx.fillStyle = "#f3b562"; ctx.beginPath(); ctx.arc(x + w / 2, y + 12 * k, 5 * k, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "rgba(70,90,130,.18)"; ctx.fillRect(x + w * 0.7, y + 34 * k, w * 0.3, h - 34 * k);
    ctx.fillStyle = "rgba(255,252,240,.6)"; ctx.fillRect(x, y + 34 * k, 3 * k, h - 34 * k);
    if (o.style !== 1) { ctx.fillStyle = this._sky().night ? "rgba(255,224,150,.8)" : "rgba(90,130,170,.4)"; for (let wy = y + 48 * k; wy < this.ground - 8 * k; wy += 20 * k) ctx.fillRect(x + 10 * k, wy, w - 26 * k, 6 * k); }
    ctx.fillStyle = "#7aad62"; ctx.beginPath(); ctx.arc(x + w * 0.3, y + (o.style === 2 ? 26 : 32) * k, 7 * k, 0, TAU); ctx.arc(x + w * 0.68, y + (o.style === 2 ? 28 : 34) * k, 6 * k, 0, TAU); ctx.fill();
  }
  _bridge(ctx, o) {
    const k = this.k, x = o.x, w = o.w, bot = o.top;
    ctx.fillStyle = o.mov ? "#7f6b9a" : "#5e8b86"; ctx.fillRect(x + 4 * k, -10 * k, w - 8 * k, bot + 10 * k);
    ctx.strokeStyle = o.mov ? "#a593c0" : "#7fb0a8"; ctx.lineWidth = 3 * k;
    for (let yy = bot; yy > -40 * k; yy -= 40 * k) { ctx.beginPath(); ctx.moveTo(x + 5 * k, yy); ctx.lineTo(x + w - 5 * k, yy - 40 * k); ctx.moveTo(x + w - 5 * k, yy); ctx.lineTo(x + 5 * k, yy - 40 * k); ctx.stroke(); }
    ctx.fillStyle = o.mov ? "#5f4f78" : "#46706c"; ctx.fillRect(x, bot - 14 * k, w, 14 * k);
    if (o.mov) { ctx.fillStyle = "#f3b562"; ctx.beginPath(); ctx.arc(x + w / 2, bot - 7 * k, 4 * k, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "#4e7f45"; ctx.lineWidth = 2 * k;
    for (let q = 0; q < 3; q++) { const vx = x + (14 + q * 19) * k, len = (16 + windyRnd(o.seed + q) * 22) * k; ctx.beginPath(); ctx.moveTo(vx, bot); ctx.quadraticCurveTo(vx + 3 * k, bot + len / 2, vx, bot + len); ctx.stroke(); }
  }
  _feather(ctx, it) {
    const k = this.k, bob = Math.sin(this.frame * 0.08 + it.ph) * 4 * k;
    ctx.save(); ctx.translate(it.x, it.y + bob); ctx.rotate(-0.5);
    ctx.fillStyle = "rgba(255,230,160,.35)"; ctx.beginPath(); ctx.arc(0, 0, 15 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f3c05e"; ctx.beginPath(); ctx.ellipse(0, 0, 4.5 * k, 11 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#b98a3a"; ctx.lineWidth = 1.2 * k; ctx.beginPath(); ctx.moveTo(0, -11 * k); ctx.lineTo(0, 13 * k); ctx.stroke();
    ctx.restore();
  }
  _drone(ctx, d) {
    const k = this.k;
    ctx.save(); ctx.translate(d.x, d.y);
    ctx.strokeStyle = "#3b4a5a"; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(-14 * k, -8 * k); ctx.lineTo(14 * k, -8 * k); ctx.stroke();
    const sp = Math.abs(Math.sin(this.frame * 0.9)) * 12 * k; ctx.fillStyle = "rgba(59,74,90,.6)"; ctx.fillRect(-14 * k - sp / 2, -11 * k, sp, 2 * k); ctx.fillRect(14 * k - sp / 2, -11 * k, sp, 2 * k);
    ctx.fillStyle = "#4a4f63"; ctx.beginPath(); ctx.roundRect(-11 * k, -6 * k, 22 * k, 14 * k, 6 * k); ctx.fill();
    ctx.fillStyle = "#ff4b4b"; ctx.beginPath(); ctx.arc(-4 * k, k, 3.4 * k, 0, TAU); ctx.fill();
    ctx.restore();
  }
  _catPos() {
    const c = Math.cos(this.board.ang), s = Math.sin(this.board.ang), o = this.rider.off, k = this.k;
    if (this.fallT > 0) { const q = 60 - this.fallT, dir = Math.sign(this.rider.off || 1); return { x: this.bx + c * o + q * 1.1 * k * dir, y: this.board.y + s * o - 10 * k + q * q * 0.12 * k, r: q * 0.2 * dir }; }
    return { x: this.bx + c * o + s * 10 * k, y: this.board.y + s * o - c * 10 * k, r: this.board.ang };
  }
  _jet(ctx, front) {
    const k = this.k, B = this.boardLen / 2, blink = this.invuln > 0 && Math.floor(this.frame / 5) % 2;
    ctx.save(); ctx.translate(this.bx, this.board.y); ctx.rotate(this.board.ang); if (blink) ctx.globalAlpha = 0.45;
    if (!front) {
      const tilt = Math.abs(this.board.ang * 180 / Math.PI), glow = tilt < 5 ? "rgba(140,220,120,.55)" : tilt < 12 ? "rgba(243,181,98,.55)" : "rgba(217,123,108,.6)";
      ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(0, 14 * k, B, 4.5 * k, 0, 0, TAU); ctx.fill();
      const fl = (9 + Math.sin(this.frame * 0.6) * 3 + Math.random() * 2) * k;
      ctx.fillStyle = "rgba(243,150,80,.9)"; ctx.beginPath(); ctx.moveTo(-B, -3 * k); ctx.lineTo(-B - fl - 8 * k, k); ctx.lineTo(-B, 6 * k); ctx.fill();
      ctx.fillStyle = "#fff3c4"; ctx.beginPath(); ctx.moveTo(-B, -k); ctx.lineTo(-B - fl, k); ctx.lineTo(-B, 4 * k); ctx.fill();
      ctx.fillStyle = "#ff8a4c"; ctx.beginPath(); ctx.moveTo(-B + 2 * k, -3 * k); ctx.lineTo(-B - 3 * k, -19 * k); ctx.lineTo(-B + 12 * k, -19 * k); ctx.lineTo(-B + 20 * k, -3 * k); ctx.fill();
    } else {
      ctx.fillStyle = "#3b4766"; ctx.beginPath(); ctx.moveTo(-6 * k, 3 * k); ctx.lineTo(-20 * k, 13 * k); ctx.lineTo(6 * k, 13 * k); ctx.lineTo(11 * k, 3 * k); ctx.fill();
      ctx.fillStyle = "#2b3550"; ctx.beginPath(); ctx.moveTo(-B, -4 * k); ctx.lineTo(B - 14 * k, -4 * k); ctx.quadraticCurveTo(B + 7 * k, -k, B + 7 * k, 2 * k); ctx.quadraticCurveTo(B + k, 8 * k, B - 14 * k, 8 * k); ctx.lineTo(-B, 8 * k); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-B, 4 * k, B * 2 - 12 * k, 4 * k);
      ctx.fillStyle = "#d9483b"; ctx.fillRect(-B + 4 * k, 0, B * 2 - 22 * k, 3 * k);
      ctx.fillStyle = "#ff8a4c"; ctx.beginPath(); ctx.arc(B + 3 * k, 2 * k, 3 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = "#8fa0c4"; ctx.fillRect(B - 6 * k, 7 * k, 16 * k, 3 * k);
      ctx.beginPath(); ctx.arc(-B + 26 * k, -k, 2 * k, 0, TAU); ctx.arc(-B + 56 * k, -k, 2 * k, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  _cat(ctx) {
    const k = this.k, p = this._catPos(), tilt = Math.abs(this.board.ang * 180 / Math.PI), falling = this.fallT > 0, happy = !!this.over?.completed;
    const blink = this.invuln > 0 && Math.floor(this.frame / 5) % 2;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(k, k); if (blink) ctx.globalAlpha = 0.45;
    const fur = "#2f3340", belly = "#f4f1ea";
    ctx.strokeStyle = "#d9483b"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(2, -3); for (let q = 1; q <= 4; q++) ctx.lineTo(2 - q * 6, -3 + Math.sin(this.frame * 0.25 - q * 0.9) * (1.5 + q)); ctx.stroke();
    ctx.strokeStyle = fur; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-7, 4); ctx.quadraticCurveTo(-16, 0, -14, -10 + Math.sin(this.frame * 0.1) * 2); ctx.stroke();
    ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(0, 3, 9, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(3, 6, 5, 5, 0, 0, TAU); ctx.fill();
    const arm = happy ? 0.9 + Math.sin(this.frame * 0.3) * 0.3 : Math.min(0.9, tilt * 0.06);
    ctx.strokeStyle = fur; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(4, 1); ctx.lineTo(12, -2 - arm * 8); ctx.stroke();
    ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(3, -10, 9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-3, -24); ctx.lineTo(3, -17); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(12, -25); ctx.lineTo(12, -13); ctx.fill();
    ctx.fillStyle = "#f3b1b1"; ctx.beginPath(); ctx.moveTo(-2.5, -16); ctx.lineTo(-2.5, -21); ctx.lineTo(1, -17); ctx.fill();
    ctx.fillStyle = "#d9483b"; ctx.beginPath(); ctx.arc(3, -11, 10, Math.PI, TAU); ctx.fill(); ctx.fillRect(-7, -12, 20, 2.5);
    ctx.fillStyle = "#fbf4e4"; ctx.fillRect(-1, -21, 2, 8);
    ctx.fillStyle = "rgba(120,200,240,.8)"; ctx.beginPath(); ctx.roundRect(2, -20, 11, 4, 2); ctx.fill();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(9, -7, 4.5, 3.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e58a8a"; ctx.beginPath(); ctx.moveTo(11.5, -9); ctx.lineTo(13.5, -9); ctx.lineTo(12.5, -7.5); ctx.fill();
    ctx.strokeStyle = "#fbf4e4"; ctx.fillStyle = "#fbf4e4"; ctx.lineWidth = 1.7;
    if (falling) { for (const ex of [3, 9]) { ctx.beginPath(); ctx.moveTo(ex - 2, -12); ctx.lineTo(ex + 2, -8); ctx.moveTo(ex + 2, -12); ctx.lineTo(ex - 2, -8); ctx.stroke(); } }
    else if (happy || tilt < 5) { for (const ex of [3, 9]) { ctx.beginPath(); ctx.arc(ex, -9, 2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); } }
    else if (tilt < 12) { for (const ex of [3, 9]) { ctx.fillStyle = "#6fb35a"; ctx.beginPath(); ctx.ellipse(ex, -10, 1.8, 2.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#2b2f2c"; ctx.fillRect(ex - 0.5, -11.5, 1, 3); } }
    else { for (const ex of [3, 9]) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -10, 2.7, 0, TAU); ctx.fill(); ctx.fillStyle = "#3b2f2c"; ctx.beginPath(); ctx.arc(ex, -10, 1.3, 0, TAU); ctx.fill(); } }
    ctx.restore();
  }
  _sky() { return WINDY_SKIES[(this.level - 1) % WINDY_SKIES.length]; }
  _chip(ctx, x, y, w, h) { ctx.fillStyle = "rgba(251,244,228,.9)"; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill(); }

  draw(ctx, c, now) {
    const k = this.k, H = c.height, W = c.width;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    for (const o of this.obs) { this._bridge(ctx, o); this._tower(ctx, o); }
    const sh = this._sky().shade;
    if (sh && this.obs.length) { ctx.fillStyle = `rgba(18,24,60,${sh * 0.45})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    for (const it of this.items) this._feather(ctx, it);
    for (const d of this.drones) this._drone(ctx, d);
    this._jet(ctx, false); this._cat(ctx); this._jet(ctx, true);
    ctx.restore();
    // hearts (icons, never a number), the level's clock as a thin line, the
    // wind, and the one number on screen: the tilt in degrees
    for (let i = 0; i < WINDY_HEARTS; i++) {
      const x = (26 + i * 30) * k, y = 40 * k;
      ctx.fillStyle = i < this.lives ? "#d97b6c" : "rgba(59,74,90,.3)";
      ctx.beginPath(); ctx.moveTo(x, y + 6 * k); ctx.bezierCurveTo(x - 12 * k, y - 4 * k, x - 6 * k, y - 12 * k, x, y - 5 * k); ctx.bezierCurveTo(x + 6 * k, y - 12 * k, x + 12 * k, y - 4 * k, x, y + 6 * k); ctx.fill();
    }
    if (this.flying || this.over) {
      const bw = Math.min(260 * k, W * 0.3), bx = W / 2 - bw / 2, by = 24 * k;
      this._chip(ctx, bx - 4 * k, by - 2 * k, bw + 8 * k, 14 * k);
      ctx.fillStyle = this.lvT > this.lvFrames - 600 ? "rgba(243,181,98,.95)" : "rgba(111,163,90,.85)";
      ctx.beginPath(); ctx.roundRect(bx, by, Math.max(10 * k, bw * Math.min(1, this.lvT / this.lvFrames)), 10 * k, 5 * k); ctx.fill();
    }
    if (this.lvl.wind && !this.tut && this.flying) {
      const wx = W - 110 * k, wy = 28 * k;
      this._chip(ctx, wx, wy, 90 * k, 20 * k);
      ctx.fillStyle = "#3b4a5a"; ctx.font = `700 ${Math.round(12 * k)}px Nunito, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("Wind", wx + 8 * k, wy + 14 * k);
      const d = this.windNow / this.lvl.wind, cx = wx + 62 * k, sg = Math.sign(d || 1);
      ctx.strokeStyle = "#4f9bd9"; ctx.lineWidth = 3 * k; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx - 12 * k * d, wy + 10 * k); ctx.lineTo(cx + 12 * k * d, wy + 10 * k); ctx.lineTo(cx + 12 * k * d - 5 * k * sg, wy + 6 * k); ctx.moveTo(cx + 12 * k * d, wy + 10 * k); ctx.lineTo(cx + 12 * k * d - 5 * k * sg, wy + 14 * k); ctx.stroke();
    }
    this._gauge(ctx, c);
    // toasts: a word or two, mid screen
    let ty = H * 0.3;
    for (const q of this.toasts) {
      const a = q.t < 12 ? q.t / 12 : q.t > 90 ? (110 - q.t) / 20 : 1;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.font = `800 ${Math.round(22 * k)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w2 = Math.max(160 * k, ctx.measureText(q.text).width + 40 * k);
      ctx.fillStyle = "rgba(251,244,228,.93)"; ctx.beginPath(); ctx.roundRect(W / 2 - w2 / 2, ty - 20 * k, w2, 40 * k, 12 * k); ctx.fill();
      if (q.col) { ctx.fillStyle = q.col; ctx.beginPath(); ctx.roundRect(W / 2 - w2 / 2, ty - 20 * k, 6 * k, 40 * k, [12 * k, 0, 0, 12 * k]); ctx.fill(); }
      ctx.fillStyle = "#3b4a5a"; ctx.fillText(q.text, W / 2, ty);
      ctx.restore(); ty += 48 * k;
    }
    if (this.tut && this.tut.step < 2) {
      const gy = [this.laneTop + this.laneH * 0.25, this.laneTop + this.laneH * 0.78][this.tut.step];
      ctx.save();
      ctx.strokeStyle = "rgba(111,163,90,.9)"; ctx.lineWidth = 4 * k; ctx.setLineDash([8 * k, 8 * k]); ctx.lineDashOffset = -this.frame * 0.5;
      ctx.beginPath(); ctx.ellipse(this.bx, gy - 6 * k, this.boardLen / 2 + 18 * k, 34 * k, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#fbf4e4"; ctx.font = `700 ${Math.round(24 * k)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(this.tut.step === 0 ? "▲" : "▼", this.bx + this.boardLen / 2 + 44 * k, gy + Math.sin(this.frame * 0.15) * 5 * k);
      ctx.restore();
    }
    if (this.tut) {
      const need = [30, 30, 25, 90, 100][this.tut.step], bw = W * 0.24;
      ctx.fillStyle = "rgba(244,236,221,0.18)"; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, H * 0.2, bw, 8 * k, 4 * k); ctx.fill();
      ctx.fillStyle = "#9fc08a"; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, H * 0.2, bw * Math.min(1, this.tut.hold / need), 8 * k, 4 * k); ctx.fill();
    }
    if (this.handsLost && !this.over) {
      ctx.fillStyle = "rgba(59,74,90,.35)"; ctx.fillRect(0, 0, W, H);
    }
  }
  // the tilt gauge: a bubble level under the city, green inside 5°, the
  // degrees beside it
  _gauge(ctx, c) {
    const k = this.k, cx = c.width / 2, cy = this.ground + 20 * k, w = 170 * k, deg = this.board.ang * 180 / Math.PI, a = Math.abs(deg);
    ctx.save();
    ctx.fillStyle = "rgba(251,244,228,.9)"; ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - 11 * k, w, 22 * k, 11 * k); ctx.fill();
    ctx.fillStyle = "rgba(111,163,90,.35)"; ctx.fillRect(cx - w * 5 / 60, cy - 9 * k, w * 10 / 60, 18 * k);
    ctx.strokeStyle = "rgba(59,74,90,.3)"; ctx.lineWidth = k; ctx.beginPath(); ctx.moveTo(cx, cy - 9 * k); ctx.lineTo(cx, cy + 9 * k); ctx.stroke();
    const bx = cx + Math.max(-1, Math.min(1, deg / 30)) * (w / 2 - 12 * k);
    ctx.fillStyle = a < 5 ? "#6fa35a" : a < 12 ? "#f3b562" : "#d97b6c"; ctx.beginPath(); ctx.arc(bx, cy, 8 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fbf4e4"; ctx.font = `700 ${Math.round(13 * k)}px Nunito, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(Math.round(a) + "°", cx + w / 2 + 8 * k, cy);
    const goal = [2, 4, 7, 12].find(n => n > this.steadyT);
    if (goal && !this.tut && this.flying) { ctx.fillStyle = "rgba(243,181,98,.9)"; ctx.fillRect(cx - w / 2 + 8 * k, cy + 13 * k, (w - 16 * k) * Math.min(1, this.steadyT / goal), 3 * k); }
    ctx.restore();
  }
  // no arm skeleton: two small translucent hands at the ends of the jet they
  // drive (the patient's real hand shapes, shrunk and moved, like Pong's
  // hand on its paddle), the left hand at the left end, the right at the right
  _drawArmAndCursor(ctx, c, now) {
    const k = this.k, cs = Math.cos(this.board.ang), sn = Math.sin(this.board.ang), B = this.boardLen / 2 + 10 * k;
    for (const [side, dir] of [["left", -1], ["right", 1]]) {
      const hx = this.bx + cs * B * dir, hy = this.board.y + sn * B * dir - 6 * k;
      const pm = this.t.palmPx(side, c);
      ctx.save(); ctx.globalAlpha = PONG_HAND_ALPHA;
      const map = pm ? (q => ({ x: (q.x - pm.x) * PONG_HAND_SCALE + hx, y: (q.y - pm.y) * PONG_HAND_SCALE + hy })) : null;
      const drawn = map && drawHand(ctx, c, this.t, side, { map, scale: PONG_HAND_SCALE, fallback: false });
      if (!drawn) {
        ctx.strokeStyle = (side === "left" ? this.hL : this.hR) ? "rgba(244,236,221,0.7)" : "rgba(217,123,108,0.7)"; ctx.lineWidth = 2.5 * k;
        ctx.beginPath(); ctx.arc(hx, hy, 11 * k, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }

  extra() {
    const completed = !!this.over?.completed;
    // the ladder: up a level on a finished flight (hearts are always left on
    // one), down one at most when the hearts ran out
    const next = completed ? Math.min(WINDY_MAX, this.level + 1) : Math.max(1, this.level - 1);
    return {
      level: this.level,
      windyLevel: next,
      completed,
      gapsPassed: this.passed,
      crashes: this.crashes,
      crashBy: { ...this.crashBy },        // what was hit: tower | bridge | ground | drone
      falls: this.falls,
      feathers: this.feathersGot,
      feathersSpawned: this.feathersSpawned,
      steadyPct: this.tiltN ? Math.round(100 * this.steadyFrames / this.tiltN) : 0,
      meanTiltDeg: this.tiltN ? Math.round(10 * this.tiltSum / this.tiltN) / 10 : 0,
      maxTiltDeg: Math.round(this.tiltMax),
      heartsLeft: this.lives,
      levelStars: this.over?.stars ?? 0,     // the mockup's 1-3 stars for the level (the record's `stars` stays the engine's points)
      score: this.score,
      flightSeconds: Math.round(this.lvT / 60),
      tutorial: this.hadTutorial,
      laneSW: this.laneLo != null ? { lo: Math.round(this.laneLo * 100) / 100, hi: Math.round(this.laneHi * 100) / 100 } : null,
    };
  }
}

// `trains` = the one movement the game trains, shown on its card so
// therapists can prescribe by movement (MindMotion labeling pattern).
export const GAMES = [
  { id: "constellations", name: "Constellations", cls: Constellations, disabled: true, trains: "Guided reaching" },
  { id: "drift", name: "Drift", cls: Drift, disabled: true, trains: "Interception" },
  { id: "ember", name: "Ember Watch", cls: EmberWatch, disabled: true, trains: "Reach and hold" },
  { id: "lantern", name: "Lantern Release", cls: LanternRelease, disabled: true, trains: "Carry and release" },
  // two cards on the select screen (main.js): Pong FE (elevation) and Pong
  // Abd-Add (sideways), the same class with opts.axis "fe" | "abd"
  { id: "pong", name: "Pong", cls: ArcPong, trains: "Continuous control" },
  { id: "rhythm", name: "Melody Tiles", cls: MelodyTiles, disabled: true, trains: "Timed reaching" },
  { id: "boxes", name: "Harbor Crates", cls: HarborCrates, disabled: true, trains: "Grasp and carry" },
  { id: "compass", name: "Compass Rose", cls: CompassRose, disabled: true, trains: "Center-out reach" },
  { id: "echo", name: "Echo Reach", cls: EchoReach, disabled: true, trains: "Position sense" },
  // --- Aug 2026 additions: Tier 1 (no new tracking needed) ---
  { id: "lens", name: "Scratch Cards", disabled: true, cls: LighthouseLens, trains: "Sweeping coverage" },
  { id: "dots", name: "Connect the Dots", disabled: true, cls: ConnectDots, trains: "Point-to-point reach" },
  // Lantern (Oct 2026, by request): chained reaches along a glowing line, from a candle box and back
  { id: "candles", name: "Lantern", cls: Candles, trains: "Point-to-point reach" },
  // the card-matching Memory game from the mockups (Sep 2026, by request)
  { id: "pairs", name: "Memory Pairs", cls: MemoryPairs, trains: "Reach and remember" },
  // Windy City Flap (Oct 2026, by request): the two arms fly one jet, height from their mean and tilt from their difference
  { id: "windy", name: "Windy City Flap", cls: WindyCity, trains: "Both arms together" },
  // bimanual by definition, so off while every game is for the chosen arm alone
  { id: "rgs", name: "Catch Together", cls: CatchTogether, disabled: true, trains: "Both arms together" },
  { id: "sling", name: "Cloud Slingshot", disabled: true, cls: CloudSlingshot, trains: "Pull, hold and release" },
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

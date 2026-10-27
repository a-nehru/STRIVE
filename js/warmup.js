// The opening stretch (Oct 2026, by request): a brief, optional warm-up
// led by the Warm-Up Time recording (one per arm since Oct 2026, by
// request: assets/music/Warmup_Stretches_LEFT_arm.mp4 and _RIGHT_arm.mp4,
// 1:45 each: five seated stretches, shoulder blade squeeze, cradle and
// lift, scoop and elbows out, elbow stretch and wrist waves, with its own
// titles, hold counts, captions and voice). Nothing is measured and nothing
// is stored but the play time: it is there to loosen up and to be enjoyed.
// It opens the day's assessment (main.js startAssessment, once a session,
// the ✕ skips it) and can be taken from the welcome screen at any time.
// The video is the star, large on the left, and the patient sees themselves
// beside it with their skeleton so they can match the picture; a note and
// a little shower of light mark each new stretch, and a cheer ends it.
// Captions are the video's own.
import { drawBody, TAU } from "./engine.js";
import { audio } from "./audio.js";
import { A11Y, speakLine, hushVoice } from "./a11y.js";

export const WARMUP_SRCS = {
  left: "assets/music/Warmup_Stretches_LEFT_arm.mp4",
  right: "assets/music/Warmup_Stretches_RIGHT_arm.mp4",
};
export const warmupSrc = side => WARMUP_SRCS[side] || WARMUP_SRCS.left;
// where each stretch begins, seconds into the recording (its own title
// changes): a chime and a shower of light there, and the name spoken only
// if the video has to play muted
export const WARMUP_STEPS = [
  { t: 0, name: "Warm-up time. Five gentle stretches to get ready." },
  { t: 4, name: "Shoulder blade squeeze. Pull them back and together, and hold." },
  { t: 23, name: "Cradle and lift. Cup your arm and lift it up high." },
  { t: 42, name: "Scoop and elbows out. Lift up, push your elbows wide." },
  { t: 61, name: "Elbow stretch. Hold your wrist, bring it up." },
  { t: 83, name: "Wrist waves. Fingers laced, forward and back." },
  { t: 100, name: "All warmed up. Five stretches done." },
];
const WARMUP_END_HOLD = 3200;    // ms the cheer stays before what comes next

// hidden, preloaded <video> elements by src: Warmup.preload(side) makes one
// as soon as the arm is known (the welcome screen), so the stretch starts
// the moment it is asked for instead of fetching 13 MB first. start() takes
// it out of the cache; stop() removes it from the document.
const PRELOADED = new Map();
function makeVideo(src) {
  const v = document.createElement("video");
  v.src = src; v.playsInline = true; v.preload = "auto";
  v.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  v.setAttribute("aria-hidden", "true");
  document.body.appendChild(v);
  try { v.load(); } catch {}
  return v;
}

export class Warmup {
  constructor(tracker, canvas, opts = {}) {
    this.t = tracker;
    this.canvas = canvas;
    this.opts = opts;       // side: the arm (which recording); endLine: what to say at the end
    this.active = false;
  }

  static preload(side) {
    const src = warmupSrc(side);
    if (!PRELOADED.has(src)) PRELOADED.set(src, makeVideo(src));
    return PRELOADED.get(src);
  }

  start(onDone) {
    this.onDone = onDone;
    this.active = true;
    hushVoice();                     // her voice leads: nothing left over from the screen before
    this.startT = performance.now();
    this.step = -1;
    this.sparks = [];
    this.endAt = null;
    this.failedAt = null;
    this.spoken = false;
    const src = warmupSrc(this.opts.side);
    const v = PRELOADED.get(src) || makeVideo(src);
    PRELOADED.delete(src);
    if (v.error) { v.removeAttribute("src"); v.src = src; try { v.load(); } catch {} }
    v.addEventListener("error", () => { this.failedAt ??= performance.now(); });
    v.addEventListener("ended", () => { this.endAt ??= performance.now(); });
    this.vid = v;
    v.play().catch(() => {
      // sound refused by the browser: play it silent and speak the move names instead
      v.muted = true; this.spoken = true;
      v.play().catch(() => { this.failedAt ??= performance.now(); });
    });
    this._prompt("A quick stretch", "Follow along, as far as is comfortable");
    this._loop();
  }

  stop() {
    this.active = false;
    this._prompt("");
    if (this.vid) { try { this.vid.pause(); this.vid.remove(); } catch {} this.vid = null; }
    hushVoice();
  }

  _prompt(main, sub = "") {
    const el = document.getElementById("prompt");
    el.innerHTML = main ? main + (sub ? `<small>${sub}</small>` : "") : "";
  }

  _loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const c = this.canvas, ctx = c.getContext("2d");
    const W = c.width, H = c.height, v = this.vid;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#20204a"); g.addColorStop(1, "#161636");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // the video, large on the left, in its own 16:9 shape
    const pad = Math.round(W * 0.022);
    const top = Math.round(H * 0.16), bodyH = H - top - pad;
    const aspect = v?.videoWidth && v?.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
    const boxW = Math.min(Math.round(W * 0.64), Math.round(bodyH * aspect));
    const boxH = Math.round(boxW / aspect);
    const bx = pad, by = top + Math.round((bodyH - boxH) / 2);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 30;
    ctx.fillStyle = "rgba(10,10,30,0.7)";
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 18); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    if (v && v.readyState >= 2 && v.videoWidth) ctx.drawImage(v, bx, by, boxW, boxH);
    else {
      ctx.fillStyle = "rgba(244,236,221,0.6)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(H * 0.03)}px Nunito, sans-serif`;
      ctx.fillText(this.failedAt ? "The video could not be played" : "Loading…", bx + boxW / 2, by + boxH / 2);
    }
    ctx.restore();
    if (v && v.duration > 0) {
      const f = Math.min(1, v.currentTime / v.duration);
      ctx.fillStyle = "rgba(244,236,221,0.16)"; ctx.fillRect(bx, by + boxH - 6, boxW, 6);
      ctx.fillStyle = "rgba(232,168,106,0.9)"; ctx.fillRect(bx, by + boxH - 6, boxW * f, 6);
    }
    ctx.strokeStyle = "rgba(244,236,221,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 18); ctx.stroke();

    // the patient beside it, cropped to the person, with their skeleton
    const panel = { x: bx + boxW + pad, y: top, w: W - (bx + boxW + pad) - pad, h: bodyH };
    ctx.save();
    ctx.fillStyle = "rgba(10,10,30,0.55)";
    ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 18); ctx.fill();
    ctx.clip();
    this._drawPersonPanel(ctx, c, panel);
    ctx.restore();
    ctx.fillStyle = "rgba(244,236,221,0.75)";
    ctx.font = `600 ${Math.round(H * 0.024)}px Nunito, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("You", panel.x + 12, panel.y - 8);
    ctx.beginPath(); ctx.arc(panel.x + panel.w - 18, panel.y - 15, 6, 0, TAU);
    ctx.fillStyle = this.t.trackingOk ? "#9fc08a" : "#e8a86a"; ctx.fill();

    // a new move: a note, a shower of light, and its name if the sound is off
    const tv = v ? v.currentTime : 0;
    let idx = -1;
    for (let i = 0; i < WARMUP_STEPS.length; i++) if (tv >= WARMUP_STEPS[i].t) idx = i;
    if (idx !== this.step && idx >= 0) {
      this.step = idx;
      if (this.spoken) speakLine(WARMUP_STEPS[idx].name, 0.9, A11Y.captions);
      if (idx > 0) { audio.note(idx % 8); this._shower(bx + boxW / 2, by + boxH * 0.3); }
    }

    for (const p of this.sparks) { p.x += p.vx; p.y += p.vy; p.vy -= 0.03; p.life -= 0.012; }
    this.sparks = this.sparks.filter(p => p.life > 0);
    for (const p of this.sparks) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the end: a cheer, then what comes next
    const failedLong = this.failedAt && now - this.failedAt > 6000;
    if (!this.endAt && (failedLong || (v && v.duration > 0 && v.currentTime >= v.duration - 0.05))) this.endAt = now;
    if (this.endAt) {
      if (!this.cheered) {
        this.cheered = true;
        const line = this.opts.endLine || "Lovely. Nice and loose. Let's play.";
        this._prompt("Lovely!", line.replace(/^Lovely\. /, ""));
        // nothing spoken: the recording ends with its own voice
        audio.fanfare();
        for (let k = 0; k < 5; k++) this._shower(W * (0.2 + 0.15 * k), H * 0.3, 18);
      }
      if (now - this.endAt > WARMUP_END_HOLD) {
        this.stop();
        this.onDone?.({ seconds: Math.round((now - this.startT) / 1000), completed: !failedLong });
      }
    }
  }

  // the camera picture, mirrored and "covering" the panel, slid so the
  // tracked body sits in the middle; the skeleton goes through the same map
  _drawPersonPanel(ctx, c, panel) {
    const t = this.t, cam = t.video;
    if (!cam || !(cam.readyState >= 2) || !t.srcW) return;
    const sw = t.srcW, sh = t.srcH;
    const scale = Math.max(panel.w / sw, panel.h / sh);
    const dw = sw * scale, dh = sh * scale;
    const f = t.frame || { x: 0.5, y: 0.42 };
    // in the mirrored drawing, source x_s lands at panel.x + panel.w - ox - x_s·dw;
    // the body (source x = 1 - f.x) should land in the middle
    let ox = panel.w / 2 - (1 - f.x) * dw, oy = panel.h * 0.42 - f.y * dh;
    ox = Math.max(panel.w - dw, Math.min(0, ox)); oy = Math.max(panel.h - dh, Math.min(0, oy));
    ctx.save();
    ctx.translate(panel.x + panel.w, panel.y); ctx.scale(-1, 1);
    ctx.drawImage(cam, 0, 0, sw, sh, ox, oy, dw, dh);
    ctx.restore();
    ctx.fillStyle = "rgba(22,22,54,0.22)"; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    if (!t.trackingOk || !t.pts) return;
    // full-screen "cover" pixels (what the tracker's _videoToPx gives) back to
    // normalised mirrored coordinates, then into the panel
    const sc = Math.max(c.width / sw, c.height / sh);
    const dwC = sw * sc, dhC = sh * sc;
    const map = px => {
      const nx = (px.x - (c.width - dwC) / 2) / dwC, ny = (px.y - (c.height - dhC) / 2) / dhC;
      return { x: panel.x + panel.w - ox - (1 - nx) * dw, y: panel.y + oy + ny * dh };
    };
    drawBody(ctx, c, t, { framed: true, map, scale: dw / dwC, hands: true });
  }

  _shower(x, y, n = A11Y.calm ? 6 : 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = A11Y.calm ? 0.6 + Math.random() : 1 + Math.random() * 2.2;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.8, r: 2 + Math.random() * 2.5, life: 1,
                         color: Math.random() < 0.5 ? "#ffd98a" : "#fff6d8" });
    }
  }
}

// The opening stretch (Oct 2026, by request): a brief, optional warm-up
// led by the Warm-Up Time recording (one per arm since Oct 2026, by
// request: assets/music/Warmup_Stretches_LEFT_arm.mp4 and _RIGHT_arm.mp4,
// 1:45 each: five seated stretches, shoulder blade squeeze, cradle and
// lift, scoop and elbows out, elbow stretch and wrist waves, with its own
// titles, hold counts, captions and voice). Nothing is measured and nothing
// is stored but the play time: it is there to loosen up and to be enjoyed.
// It opens the day's assessment (main.js startAssessment, once a session,
// the ✕ skips it) and can be taken from the welcome screen at any time.
// The video is drawn whole and as large as fits; its right part is left
// empty on purpose (Oct 2026, by request) and the patient sees themselves
// there, cropped to the person with their skeleton (WARMUP_PERSON_SLOT,
// fractions of the frame), so they can match the picture; a note and
// a little shower of light mark each new stretch, and a cheer ends it.
// Captions are the video's own.
import { drawBody, drawPersonSlot, TAU } from "./engine.js";
import { audio } from "./audio.js";
import { A11Y, speakLine, hushVoice } from "./a11y.js";
import { C, ACCENTS, alpha } from "./theme.js";
import { rrect } from "./ui.js";
const AC = ACCENTS.warmup;        // the warm-up's accent (theme.js)

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
// the recording's empty right part: title, demonstrator and captions fill the left 60%
const WARMUP_PERSON_SLOT = { x0: 0.6, x1: 0.965, y0: 0.08, y1: 0.94 };
const WARMUP_CROP_SW = 4.4, WARMUP_ZOOM_MAX = 3;   // the person's crop: shoulder widths across, and the most it zooms
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
  audio.watchMedia(v);                    // the recording's voice ducks the music while it plays
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

    // the Day surface (30 Oct 2026): the recording in a card on warm white,
    // a plum progress bar under it
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);

    // the video, whole, as large as fits under the prompt
    const pad = Math.round(W * 0.022);
    const barH = Math.round(H * 0.014), barGap = Math.round(H * 0.018);
    const top = Math.round(H * 0.16), bodyH = H - top - pad - barH - barGap;
    const aspect = v?.videoWidth && v?.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
    let boxW = W - pad * 2, boxH = Math.round(boxW / aspect);
    if (boxH > bodyH) { boxH = bodyH; boxW = Math.round(boxH * aspect); }
    const bx = Math.round((W - boxW) / 2), by = top + Math.round((bodyH - boxH) / 2);
    const S = WARMUP_PERSON_SLOT;
    ctx.save();
    ctx.shadowColor = "rgba(30,34,53,0.18)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
    ctx.fillStyle = C.nightCard;
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 24); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    if (v && v.readyState >= 2 && v.videoWidth) ctx.drawImage(v, bx, by, boxW, boxH);
    else {
      ctx.fillStyle = C.onNight; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.round(H * 0.034)}px Nunito, sans-serif`;
      ctx.fillText(this.failedAt ? "The video could not be played" : "Loading…", bx + boxW * S.x0 / 2, by + boxH / 2);
    }
    ctx.restore();
    {
      const f = v && v.duration > 0 ? Math.min(1, v.currentTime / v.duration) : 0;
      const y = by + boxH + barGap;
      ctx.fillStyle = alpha(AC.solid, 0.18); rrect(ctx, bx, y, boxW, barH, barH / 2); ctx.fill();
      if (f > 0) { ctx.fillStyle = AC.solid; rrect(ctx, bx, y, Math.max(barH, boxW * f), barH, barH / 2); ctx.fill(); }
    }

    // the patient, cropped to the person, in the recording's empty slot
    const panel = { x: bx + boxW * S.x0, y: by + boxH * S.y0, w: boxW * (S.x1 - S.x0), h: boxH * (S.y1 - S.y0) };
    drawPersonSlot(ctx, panel, this.t.trackingOk, Math.round(H * 0.024), () => this._drawPersonPanel(ctx, c, panel));

    // a new move: a note, a shower of light, and its name if the sound is off
    const tv = v ? v.currentTime : 0;
    let idx = -1;
    for (let i = 0; i < WARMUP_STEPS.length; i++) if (tv >= WARMUP_STEPS[i].t) idx = i;
    if (idx !== this.step && idx >= 0) {
      this.step = idx;
      if (this.spoken) speakLine(WARMUP_STEPS[idx].name, 0.9, A11Y.captions);
      if (idx > 0) { audio.note(idx % 8); this._shower(bx + boxW * S.x0 / 2, by + boxH * 0.3); }
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

  // the camera picture, mirrored and "covering" the panel, zoomed in so the
  // person is WARMUP_CROP_SW shoulder widths across it (a patient a few
  // metres back still fills the slot), slid so the tracked body sits in the
  // middle; the skeleton goes through the same map
  _drawPersonPanel(ctx, c, panel) {
    const t = this.t, cam = t.video;
    if (!cam || !(cam.readyState >= 2) || !t.srcW) return;
    const sw = t.srcW, sh = t.srcH;
    const f = t.frame || { x: 0.5, y: 0.42 };
    const cover = Math.max(panel.w / sw, panel.h / sh);
    const fit = f.sw ? panel.w / (WARMUP_CROP_SW * f.sw * sw) : cover;
    const scale = Math.max(cover, Math.min(fit, cover * WARMUP_ZOOM_MAX));
    const dw = sw * scale, dh = sh * scale;
    // in the mirrored drawing, source x_s lands at panel.x + panel.w - ox - x_s·dw;
    // the body (source x = 1 - f.x) should land in the middle
    let ox = panel.w / 2 - (1 - f.x) * dw, oy = panel.h * 0.42 - f.y * dh;
    ox = Math.max(panel.w - dw, Math.min(0, ox)); oy = Math.max(panel.h - dh, Math.min(0, oy));
    ctx.save();
    ctx.translate(panel.x + panel.w, panel.y); ctx.scale(-1, 1);
    ctx.drawImage(cam, 0, 0, sw, sh, ox, oy, dw, dh);
    ctx.restore();
    ctx.fillStyle = "rgba(20,23,42,0.22)"; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    if (!t.trackingOk || !t.pts) return;
    // full-screen "cover" pixels (what the tracker's _videoToPx gives) back to
    // normalised mirrored coordinates, then into the panel
    const sc = Math.max(c.width / sw, c.height / sh);
    const dwC = sw * sc, dhC = sh * sc;
    const map = px => {
      const nx = (px.x - (c.width - dwC) / 2) / dwC, ny = (px.y - (c.height - dhC) / 2) / dhC;
      return { x: panel.x + panel.w - ox - (1 - nx) * dw, y: panel.y + oy + ny * dh };
    };
    drawBody(ctx, c, t, { framed: true, map, scale: dw / dwC, hands: true, thinHands: true });
  }

  _shower(x, y, n = A11Y.calm ? 6 : 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = A11Y.calm ? 0.6 + Math.random() : 1 + Math.random() * 2.2;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.8, r: 2 + Math.random() * 2.5, life: 1,
                         color: Math.random() < 0.5 ? AC.solid : C.coach });
    }
  }
}

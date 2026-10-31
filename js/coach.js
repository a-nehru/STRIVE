// Posture Coach — docked mini-figure that mirrors the patient's ACTUAL pose
// (live MediaPipe landmarks, scaled into the dock), so the feedback shows
// what THEY are doing, not a canned drawing. Faint while posture is good;
// on compensation the offending segments glow amber, a dashed upright ghost
// shows the corrected posture, the world dims, one spoken cue plays.

import { audio } from "./audio.js";
import { speakLine, voiceBusy } from "./a11y.js";
import { coachLine } from "./coachlines.js";
import { C } from "./theme.js";
import { rrect } from "./ui.js";
import { Character } from "./cast.js";
import { COMP_T } from "./compensation.js";

// The cue's words come from the chosen coach's phrasebook (coachlines.js,
// Oct 2026): lean | hike | rotation | tilt each have a line in Rook's,
// Lumi's and Maple's voice. Lumi's first lines are the original cues.
const THRESH = { gentle: 1.0, strict: 0.65 };
// an alert clears only once the slip is back under this share of the
// threshold (compensation.js's hysteresis), so a posture hovering at the
// line does not flicker the cue on and off
const RELEASE = 0.7;
// what a score of 1.0 means in real terms, per slip (tracker.compensation,
// js/compensation.js): the main measure of each
const SCALE = { lean: [COMP_T.fwdRatio * 100, "% wider"], hike: [COMP_T.hike, "SW"], rotation: [COMP_T.rotDeg, "°"], tilt: [COMP_T.tiltDeg, "°"] };
const NAMES = { lean: "Lean", hike: "Hike", rotation: "Turn", tilt: "Tilt" };
// staff readout of the four scores under the figure (28 Oct 2026, by
// request, to check the thresholds): device-level, the staff drawer's
// "Posture numbers" switch, never on for a patient by default
export const postureDebug = () => { try { return localStorage.getItem("strive-posture-debug") === "1"; } catch { return false; } };

export class Coach {
  // opts.quiet: watch and log compensation but never speak, dim or show
  // the cue pill (the assessment's ASSESS_COACH_CUES flips it)
  constructor(tracker, side, sensitivity = "gentle", opts = {}) {
    this.t = tracker;
    this.side = side;
    this.sens = sensitivity;
    this.quiet = !!opts.quiet;
    this.mute = false;   // shows the cue but says nothing (a video's own voice is playing)
    this.state = "idle";
    this.type = null;
    this.overSince = null;
    this.stateT = 0;
    this.cooldownUntil = 0;
    this.events = [];
    this.alertStart = 0;
    // per round, per slip: the largest score and the time spent over the
    // threshold, for the therapist (the round record's compStats): the data a
    // per-patient threshold would be tuned on
    this.stats = { lean: { max: 0, overMs: 0 }, hike: { max: 0, overMs: 0 }, rotation: { max: 0, overMs: 0 }, tilt: { max: 0, overMs: 0 } };
    this._lastU = null;
  }
  summary() {
    const out = {};
    for (const [k, v] of Object.entries(this.stats)) out[k] = { max: Math.round(v.max * 100) / 100, overS: Math.round(v.overMs / 100) / 10 };
    return out;
  }

  update(now) {
    if (this.sens === "off") { this.state = "idle"; return; }
    const c = this.t.compensation(this.side);
    const worst = Object.entries(c).filter(([k]) => k in this.stats).sort((a, b) => b[1] - a[1])[0];
    const over = worst[1] > THRESH[this.sens];
    const dt = this._lastU == null ? 0 : Math.min(200, now - this._lastU);
    this._lastU = now;
    for (const k of Object.keys(this.stats)) {
      const v = c[k] || 0, st = this.stats[k];
      if (v > st.max) st.max = v;
      if (v > THRESH[this.sens]) st.overMs += dt;
    }

    if (this.state === "idle") {
      if (over && now > this.cooldownUntil) {
        if (!this.overSince) this.overSince = now;
        if (now - this.overSince > 600) {
          this.state = "alert"; this.type = worst[0]; this.alertStart = now; this.stateT = now;
          if (!this.quiet) {
            audio.whoosh();
            const cue = coachLine("compensation", { type: this.type });
            this._speak(cue);
            this._cuePill(cue, true);
          }
        }
      } else if (!over) this.overSince = null;
    } else if (this.state === "alert") {
      if (worst[1] < THRESH[this.sens] * RELEASE) {
        this.state = "recover"; this.stateT = now;
        this.events.push({ type: this.type, at: new Date().toISOString(), durationMs: Math.round(now - this.alertStart) });
        this.cooldownUntil = now + 5000;
        this._cuePill("", false);
      }
    } else if (this.state === "recover") {
      if (now - this.stateT > 1100) { this.state = "idle"; this.overSince = null; }
    }
  }

  get dimming() { return this.state === "alert" && !this.quiet ? 0.15 : 0; }

  // caption false: the cue pill already shows the text on screen. A cue
  // never talks over another line: the pill and the dim carry it then.
  _speak(text) { if (!this.mute && !voiceBusy()) speakLine(text, 0.95, false); }
  _cuePill(text, show) {
    const el = document.getElementById("cue");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("hidden", !show);
    el.classList.toggle("posture", !!show);     // the dashed attention ring and "!" (css #cue.posture)
  }

  // THE DOCK (30 Oct 2026, by request: one look for every game): a card in a
  // bottom corner with the coach character beside the patient's LIVE
  // posture figure. The figure is the movement channel (framework P5): faint
  // while posture is good; on a slip the slipping segment turns the attention
  // colour, a dashed upright ghost shows the correction, the card gets a
  // dashed attention ring and the character looks focused; on recovery it
  // beams. (x, y) = bottom-left of the card, h = its height; opts.surface
  // "night" for dark stages, opts.compact for the figure alone (in the
  // assessment's video slot).
  draw(ctx, x, y, h, now, opts = {}) {
    const night = opts.surface === "night";
    const compact = !!opts.compact;
    const alert = this.state === "alert";
    const recover = this.state === "recover";
    const w = compact ? h * 0.95 : h * 2.25;
    const r = h * 0.2;
    // the card
    ctx.save();
    if (!night) { ctx.shadowColor = "rgba(30,34,53,0.14)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; }
    ctx.fillStyle = night ? (compact ? "rgba(34,38,61,0.85)" : C.nightCard) : (compact ? "rgba(255,255,255,0.88)" : C.card);
    rrect(ctx, x, y - h, w, h, r); ctx.fill();
    ctx.restore();
    if (alert && !this.quiet) {
      ctx.save();
      ctx.strokeStyle = C.attention; ctx.lineWidth = Math.max(3, h * 0.03); ctx.setLineDash([h * 0.07, h * 0.05]);
      rrect(ctx, x + 2, y - h + 2, w - 4, h - 4, r); ctx.stroke();
      ctx.restore();
    }
    // the character
    if (!compact) {
      this.face ??= new Character({ who: "coach" });
      if (alert && !this.quiet) this.face.setMood("focused");
      else this.face.setMood("neutral");
      if (recover && this._beamed !== this.stateT) { this._beamed = this.stateT; this.face.flashMood("happy", 1400); }
      this.face.draw(ctx, x + h * 0.56, y - h * 0.09, h * 0.72, now);
    }
    // the posture figure
    const fx = compact ? x : x + h * 1.12;
    this._drawFigure(ctx, fx, y, h, now, night, alert && !this.quiet, recover);
    if (postureDebug()) this._drawNumbers(ctx, x, y, h, now);
  }

  _drawFigure(ctx, x, y, h, now, night, alert, recover) {
    const p = this.t.pts;
    if (!p || !p.shL || !p.shR) return;
    // transform: body-relative (SW units) -> dock pixels
    const sw = this.t.shoulderW;
    const s = h / 4.8;                                  // px per shoulder-width in dock
    const cx = x + h * 0.48, cy = y - h * 0.64;          // shoulder line: head and hanging arms both fit the card
    const P = pt => ({ x: cx + (pt.x - this.t.anchorFast.x) / sw * s, y: cy + (pt.y - this.t.anchorFast.y) / sw * s });
    const shL = P(p.shL), shR = P(p.shR);
    const shMid = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
    const hipMid = p.hipL && p.hipR ? P({ x: (p.hipL.x + p.hipR.x) / 2, y: (p.hipL.y + p.hipR.y) / 2 }) : { x: shMid.x, y: shMid.y + s * 1.4 };
    const head = p.earL && p.earR
      ? P({ x: (p.earL.x + p.earR.x) / 2, y: (p.earL.y + p.earR.y) / 2 })
      : { x: shMid.x, y: shMid.y - s * 0.55 };
    const base = night ? C.onNight : C.ink;
    const faint = night ? "rgba(246,242,234,0.5)" : "rgba(30,34,53,0.42)";
    const slip = C.attention, good = C.ok;
    const idle = !alert && !recover;
    const spineColor = alert && (this.type === "lean" || this.type === "rotation" || this.type === "tilt") ? slip : recover ? good : base;
    const shoulderColor = alert && (this.type === "hike" || this.type === "rotation") ? slip : recover ? good : base;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.globalAlpha = idle ? 0.6 : 1;
    if (alert) {
      // the upright ghost: vertical spine, level shoulders, dashed
      ctx.strokeStyle = night ? "rgba(246,242,234,0.55)" : "rgba(30,34,53,0.35)";
      ctx.lineWidth = Math.max(2, h * 0.02); ctx.setLineDash([h * 0.035, h * 0.04]);
      const spineLen = Math.hypot(hipMid.x - shMid.x, hipMid.y - shMid.y);
      const shHalf = Math.hypot(shR.x - shL.x, shR.y - shL.y) / 2;
      ctx.beginPath(); ctx.moveTo(hipMid.x, hipMid.y); ctx.lineTo(hipMid.x, hipMid.y - spineLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hipMid.x - shHalf, hipMid.y - spineLen); ctx.lineTo(hipMid.x + shHalf, hipMid.y - spineLen); ctx.stroke();
      ctx.beginPath(); ctx.arc(hipMid.x, hipMid.y - spineLen - s * 0.5, s * 0.3, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = Math.max(3, h * 0.035);
    const seg = (a, b, color) => { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    seg(shMid, hipMid, spineColor);
    seg(shL, shR, shoulderColor);
    if (p.hipL && p.hipR) seg(P(p.hipL), P(p.hipR), base);
    for (const [sh, el, wr, sideName] of [[p.shL, p.elL, p.wrL, "left"], [p.shR, p.elR, p.wrR, "right"]]) {
      const col = sideName === this.side ? base : faint;
      if (!el?.ok) continue;
      seg(P(sh), P(el), col);
      if (!wr?.ok) continue;
      seg(P(el), P(wr), col);
      const pm = this.t.palm(sideName);
      if (pm) {
        seg(P(wr), P(pm), col);
        const pp = P(pm);
        ctx.fillStyle = this.t.handClosed(sideName) ? good : col;
        ctx.beginPath(); ctx.arc(pp.x, pp.y, Math.max(3, h * 0.03), 0, 7); ctx.fill();
      }
    }
    ctx.strokeStyle = base;
    ctx.beginPath(); ctx.arc(head.x, head.y, s * 0.32, 0, 7); ctx.stroke();
    ctx.restore();
  }


  // the four scores as bars with the threshold marked, the real amount beside
  // each, and the state; below the dock when there is room, else beside it
  _drawNumbers(ctx, x, y, h, now) {
    const c = this.t.compensation(this.side);
    const th = THRESH[this.sens] ?? 1;
    const fs = Math.max(12, Math.round(h * 0.075)), row = fs * 1.45;
    const wb = this.t.wristBend?.(this.side);
    const w = Math.max(h * 0.95, fs * 15), ph = row * (wb ? 7 : 5) + fs * 0.6;
    const cv = ctx.canvas;
    let px = x, py = y + 6;
    if (py + ph > cv.height) { px = x + h * 0.95 + 8; py = y - ph; }
    if (px + w > cv.width) px = cv.width - w - 4;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(16,12,30,0.82)";
    ctx.beginPath(); ctx.roundRect(px, py, w, ph, 10); ctx.fill();
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const pad = fs * 0.6, labW = fs * 3.2, valW = fs * 4.6, barW = w - pad * 2 - labW - valW;
    const max = Math.max(1.5, th * 1.5);
    const head = this.sens === "off" ? "Coach off"
      : `${this.state}${this.state === "alert" ? ": " + NAMES[this.type] : ""} · fires at ${th}`
        + (this.state === "idle" && now < this.cooldownUntil ? " · resting" : "")
        + ` · ${c.src3 === "zed" ? "3D (ZED)" : "2D"}`;
    ctx.fillStyle = "#f4ecdd"; ctx.textAlign = "left";
    ctx.fillText(head, px + pad, py + pad + fs * 0.5);
    Object.keys(SCALE).forEach((k, i) => {
      const v = c[k] || 0, ry = py + pad + row * (i + 1) + fs * 0.5;
      const over = v > th, bx = px + pad + labW;
      ctx.fillStyle = over ? "#e8a86a" : "#f4ecdd";
      ctx.fillText(NAMES[k], px + pad, ry);
      ctx.fillStyle = "rgba(244,236,221,0.18)"; ctx.fillRect(bx, ry - fs * 0.3, barW, fs * 0.6);
      ctx.fillStyle = over ? "#e8a86a" : "#9fc08a"; ctx.fillRect(bx, ry - fs * 0.3, barW * Math.min(1, v / max), fs * 0.6);
      ctx.fillStyle = "#f4ecdd"; ctx.fillRect(bx + barW * th / max - 1, ry - fs * 0.5, 2, fs);
      const [u, unit] = SCALE[k], real = v * u;
      ctx.textAlign = "right";
      ctx.fillText(`${v.toFixed(2)}  ${unit === "SW" ? real.toFixed(2) : Math.round(real)}${unit === "SW" ? " SW" : unit}`, px + w - pad, ry);
      ctx.textAlign = "left";
    });
    // the wrist bend (ZED only): live angle on a -90..+90 bar, the range seen
    // as a band, and how many new readings a second arrive
    if (wb) {
      const ry = py + pad + row * 5 + fs * 0.5, bx = px + pad + labW, mid = bx + barW / 2, k = barW / 180;
      const clamp = d => Math.max(-90, Math.min(90, d));
      ctx.fillStyle = "#f4ecdd"; ctx.fillText("Wrist", px + pad, ry);
      ctx.fillStyle = "rgba(244,236,221,0.18)"; ctx.fillRect(bx, ry - fs * 0.3, barW, fs * 0.6);
      ctx.fillStyle = "rgba(201,167,255,0.45)"; ctx.fillRect(mid + clamp(wb.lo) * k, ry - fs * 0.3, (clamp(wb.hi) - clamp(wb.lo)) * k, fs * 0.6);
      ctx.fillStyle = "#f4ecdd"; ctx.fillRect(mid - 1, ry - fs * 0.5, 2, fs);
      ctx.fillStyle = "#ffd54a"; ctx.fillRect(mid + clamp(wb.deg) * k - 2, ry - fs * 0.55, 4, fs * 1.1);
      ctx.textAlign = "right";
      ctx.fillText(`${wb.deg > 0 ? "+" : ""}${Math.round(wb.deg)}°`, px + w - pad, ry);
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(244,236,221,0.75)";
      ctx.fillText(`+ bend down  − bend back  ·  seen ${Math.round(wb.lo)}…${Math.round(wb.hi)}°${wb.rate ? `  ·  ${wb.rate.toFixed(1)}/s` : ""}`, px + pad, ry + row);
    }
    ctx.restore();
  }
}

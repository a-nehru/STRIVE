// Posture Coach — docked mini-figure that mirrors the patient's ACTUAL pose
// (live MediaPipe landmarks, scaled into the dock), so the feedback shows
// what THEY are doing, not a canned drawing. Faint while posture is good;
// on compensation the offending segments glow amber, a dashed upright ghost
// shows the corrected posture, the world dims, one spoken cue plays.

import { audio } from "./audio.js";

const CUES = {
  lean: "Sit tall — reach with your arm",
  hike: "Let your shoulder relax",
  rotation: "Keep your chest facing me",
  tilt: "Straighten up gently — nice and tall",
};
const THRESH = { gentle: 1.0, strict: 0.65 };

export class Coach {
  constructor(tracker, side, sensitivity = "gentle") {
    this.t = tracker;
    this.side = side;
    this.sens = sensitivity;
    this.state = "idle";
    this.type = null;
    this.overSince = null;
    this.stateT = 0;
    this.cooldownUntil = 0;
    this.events = [];
    this.alertStart = 0;
  }

  update(now) {
    if (this.sens === "off") { this.state = "idle"; return; }
    const c = this.t.compensation(this.side);
    const worst = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    const over = worst[1] > THRESH[this.sens];

    if (this.state === "idle") {
      if (over && now > this.cooldownUntil) {
        if (!this.overSince) this.overSince = now;
        if (now - this.overSince > 600) {
          this.state = "alert"; this.type = worst[0]; this.alertStart = now; this.stateT = now;
          audio.whoosh();
          this._speak(CUES[this.type]);
          this._cuePill(CUES[this.type], true);
        }
      } else if (!over) this.overSince = null;
    } else if (this.state === "alert") {
      if (!over) {
        this.state = "recover"; this.stateT = now;
        this.events.push({ type: this.type, at: new Date().toISOString(), durationMs: Math.round(now - this.alertStart) });
        this.cooldownUntil = now + 5000;
        this._cuePill("", false);
      }
    } else if (this.state === "recover") {
      if (now - this.stateT > 1100) { this.state = "idle"; this.overSince = null; }
    }
  }

  get dimming() { return this.state === "alert" ? 0.15 : 0; }

  _speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch { /* voice optional */ }
  }
  _cuePill(text, show) {
    const el = document.getElementById("cue");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("hidden", !show);
  }

  // Draw the LIVE skeleton in a dock box. (x, y) = bottom-left of dock, h = height.
  draw(ctx, x, y, h, now) {
    const p = this.t.pts;
    if (!p || !p.shL || !p.shR) return;
    const alert = this.state === "alert";
    const recover = this.state === "recover";

    // transform: body-relative (SW units) -> dock pixels
    const sw = this.t.shoulderW;
    const s = h / 3.6;                                  // px per shoulder-width in dock
    const cx = x + h * 0.45, cy = y - h * 0.62;          // dock center ~ shoulder line
    const P = pt => ({ x: cx + (pt.x - this.t.anchorFast.x) / sw * s, y: cy + (pt.y - this.t.anchorFast.y) / sw * s });

    const shL = P(p.shL), shR = P(p.shR);
    const shMid = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
    const hipMid = p.hipL && p.hipR ? P({ x: (p.hipL.x + p.hipR.x) / 2, y: (p.hipL.y + p.hipR.y) / 2 }) : { x: shMid.x, y: shMid.y + s * 1.4 };
    const head = p.earL && p.earR
      ? P({ x: (p.earL.x + p.earR.x) / 2, y: (p.earL.y + p.earR.y) / 2 })
      : { x: shMid.x, y: shMid.y - s * 0.55 };

    ctx.save();
    ctx.lineCap = "round";
    const idleA = 0.28 + Math.sin(now / 900) * 0.04;
    const baseA = alert || recover ? 1 : idleA;
    const cream = "#f4ecdd";
    const amber = "#e8a86a";
    const green = "#9fc08a";
    const spineColor = alert && (this.type === "lean" || this.type === "rotation" || this.type === "tilt") ? amber : recover ? green : cream;
    const shoulderColor = alert && (this.type === "hike" || this.type === "rotation") ? amber : recover ? green : cream;

    // dock backing so the skeleton reads against any scene
    ctx.globalAlpha = baseA * 0.35;
    ctx.fillStyle = "rgba(16,12,30,0.55)";
    ctx.beginPath(); ctx.roundRect(x, y - h, h * 0.95, h, 14); ctx.fill();

    if (alert) {
      // ghost of CORRECT posture: vertical spine + level shoulders (dashed white)
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3; ctx.setLineDash([5, 6]);
      const spineLen = Math.hypot(hipMid.x - shMid.x, hipMid.y - shMid.y);
      const shHalf = Math.hypot(shR.x - shL.x, shR.y - shL.y) / 2;
      ctx.beginPath(); ctx.moveTo(hipMid.x, hipMid.y); ctx.lineTo(hipMid.x, hipMid.y - spineLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hipMid.x - shHalf, hipMid.y - spineLen); ctx.lineTo(hipMid.x + shHalf, hipMid.y - spineLen); ctx.stroke();
      ctx.beginPath(); ctx.arc(hipMid.x, hipMid.y - spineLen - s * 0.5, s * 0.3, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- the LIVE skeleton ----
    ctx.globalAlpha = baseA;
    ctx.lineWidth = 5;
    if (alert) { ctx.shadowColor = amber; ctx.shadowBlur = 10 + Math.sin(now / 280) * 6; }
    if (recover) { ctx.shadowColor = green; ctx.shadowBlur = 12; }

    const seg = (a, b, color) => {
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    // spine + shoulders + hips
    seg(shMid, hipMid, spineColor);
    seg(shL, shR, shoulderColor);
    if (p.hipL && p.hipR) seg(P(p.hipL), P(p.hipR), cream);
    // arms (tracked side slightly brighter), wrist → palm included
    for (const [sh, el, wr, sideName] of [[p.shL, p.elL, p.wrL, "left"], [p.shR, p.elR, p.wrR, "right"]]) {
      const emph = sideName === this.side;
      const col = emph ? cream : "rgba(244,236,221,0.55)";
      if (el?.ok) {
        seg(P(sh), P(el), col);
        if (wr?.ok) {
          seg(P(el), P(wr), col);
          const pm = this.t.palm(sideName);
          if (pm) {
            seg(P(wr), P(pm), col);
            const pp = P(pm);
            if (this.t.handClosed(sideName)) {
              // caught a firefly! glowing hand + orbiting sparkles
              ctx.save();
              ctx.shadowColor = amber; ctx.shadowBlur = 10;
              ctx.fillStyle = amber;
              ctx.beginPath(); ctx.arc(pp.x, pp.y, 5, 0, 7); ctx.fill();
              ctx.fillStyle = "#fff6d8";
              ctx.beginPath(); ctx.arc(pp.x, pp.y, 2.2, 0, 7); ctx.fill();
              ctx.restore();
              ctx.fillStyle = "rgba(255,246,216,0.9)";
              for (let k = 0; k < 3; k++) {
                const a = now / 500 + k * 2.1;
                ctx.beginPath(); ctx.arc(pp.x + Math.cos(a) * 9, pp.y + Math.sin(a) * 9, 1.3, 0, 7); ctx.fill();
              }
            } else {
              ctx.fillStyle = col;
              ctx.beginPath(); ctx.arc(pp.x, pp.y, 3.5, 0, 7); ctx.fill();
            }
          }
        }
      }
    }
    // head
    ctx.strokeStyle = cream;
    ctx.beginPath(); ctx.arc(head.x, head.y, s * 0.32, 0, 7); ctx.stroke();

    // friendly face — blinks, smiles, worries with you, beams on recovery
    {
      const fr = s * 0.32;
      ctx.save();
      ctx.globalAlpha = Math.min(1, baseA + 0.25);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      const ex = fr * 0.4, ey = head.y - fr * 0.12;
      const blink = !alert && !recover && (now % 3600) < 130;
      if (recover) {          // happy closed eyes  ^ ^
        ctx.strokeStyle = green;
        for (const dx of [-ex, ex]) { ctx.beginPath(); ctx.arc(head.x + dx, ey + fr * 0.12, fr * 0.17, Math.PI, 0); ctx.stroke(); }
      } else if (blink) {
        ctx.strokeStyle = cream;
        for (const dx of [-ex, ex]) { ctx.beginPath(); ctx.moveTo(head.x + dx - fr * 0.13, ey); ctx.lineTo(head.x + dx + fr * 0.13, ey); ctx.stroke(); }
      } else {
        ctx.fillStyle = alert ? amber : cream;
        for (const dx of [-ex, ex]) { ctx.beginPath(); ctx.arc(head.x + dx, ey, fr * 0.11, 0, 7); ctx.fill(); }
      }
      ctx.strokeStyle = alert ? amber : recover ? green : cream;
      ctx.beginPath();
      if (alert) ctx.arc(head.x, head.y + fr * 0.42, fr * 0.14, 0, 7);                       // little "o" — oops!
      else if (recover) ctx.arc(head.x, head.y + fr * 0.05, fr * 0.5, Math.PI * 0.15, Math.PI * 0.85);  // big smile
      else ctx.arc(head.x, head.y + fr * 0.12, fr * 0.38, Math.PI * 0.2, Math.PI * 0.8);      // gentle smile
      ctx.stroke();
      if (!alert) {           // soft rosy cheeks
        ctx.fillStyle = "rgba(232,168,106,0.4)";
        for (const dx of [-fr * 0.62, fr * 0.62]) { ctx.beginPath(); ctx.arc(head.x + dx, head.y + fr * 0.3, fr * 0.13, 0, 7); ctx.fill(); }
      }
      ctx.restore();
    }

    ctx.shadowBlur = 0;
    if (alert) {
      // green nudge arrow: from current head toward the ghost's upright head
      const spineLen = Math.hypot(hipMid.x - shMid.x, hipMid.y - shMid.y);
      const gx = hipMid.x, gy = hipMid.y - spineLen - s * 0.5;
      const nudge = Math.sin(now / 400) * 0.5 + 0.5;
      ctx.globalAlpha = 0.5 + nudge * 0.5;
      ctx.strokeStyle = green; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(head.x, head.y - s * 0.5); ctx.quadraticCurveTo((head.x + gx) / 2, gy - s * 0.4, gx, gy - s * 0.42); ctx.stroke();
      const angle = Math.atan2((gy - s * 0.42) - (gy - s * 0.4), gx - (head.x + gx) / 2);
      ctx.beginPath();
      ctx.moveTo(gx, gy - s * 0.42);
      ctx.lineTo(gx - 9 * Math.cos(angle - 0.5), gy - s * 0.42 - 9 * Math.sin(angle - 0.5));
      ctx.moveTo(gx, gy - s * 0.42);
      ctx.lineTo(gx - 9 * Math.cos(angle + 0.5), gy - s * 0.42 - 9 * Math.sin(angle + 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Therapist contact: troubleshooting reports and progress summaries.
//
// A static page cannot send email, so this talks to tools/mail_bridge.py on
// localhost — the same shape as the ZED bridge, and for the same reason: the
// credential stays on the clinic machine and patient data never passes
// through a third party. When the bridge is not running every button still
// works, it just opens the staff member's own mail client with the message
// already written (mailto:) instead of sending it silently. Nothing here
// fires on its own: an email leaves only when somebody presses a button.

const MAIL_BRIDGE = "http://localhost:8323";
export const FALLBACK_TO = "nehru.aravind@gmail.com";

let bridge = null;              // { to, from } once probed, false when absent

export async function probeMail() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 900);
    const r = await fetch(`${MAIL_BRIDGE}/status`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { bridge = false; return false; }
    const s = await r.json();
    bridge = s.ok ? s : false;
    return bridge;
  } catch { bridge = false; return false; }
}

export function mailTarget() { return bridge ? bridge.to : FALLBACK_TO; }
export function mailReady() { return !!bridge; }

// Returns { ok, via } — via "bridge" when it really sent, "mailto" when the
// staff member's mail client was opened instead. Never throws: a failed
// report must not become a second problem to troubleshoot.
export async function sendMail(kind, subject, body) {
  if (bridge === null) await probeMail();
  if (bridge) {
    try {
      const r = await fetch(`${MAIL_BRIDGE}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, subject, body }),
      });
      const s = await r.json().catch(() => ({}));
      if (r.ok && s.ok) return { ok: true, via: "bridge" };
      return { ok: false, via: "bridge", error: s.error || `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, via: "bridge", error: String(e.message || e) };
    }
  }
  // no bridge: hand it to whatever mail client this machine has
  const href = `mailto:${mailTarget()}?subject=${encodeURIComponent("[STRIVE] " + subject)}`
             + `&body=${encodeURIComponent(body)}`;
  window.open(href, "_blank");
  return { ok: true, via: "mailto" };
}

// What a troubleshooting report needs to be useful without a phone call:
// what the camera is, what the tracker can see right now, and what the
// browser is. No patient identity beyond the participant label.
export function diagnostics(state, tracker) {
  const t = tracker || {};
  const lines = [
    `When:          ${new Date().toISOString()}`,
    `Participant:   ${state.patient ?? "(not logged in)"}`,
    `Training arm:  ${state.side ?? "-"}`,
    `Camera source: ${t.source ?? "not started"}` +
      (t.zedInfo ? ` (ZED ${t.zedInfo.w}x${t.zedInfo.h}, ${t.zedInfo.profile}, ${t.zedInfo.fps} fps)` : ""),
    `Stereo webcam: ${t.isStereo ? "yes (left eye cropped)" : "no"}`,
    `Depth (3D):    ${t.has3D ? "yes" : "no"}`,
    `Tracking now:  ${t.trackingOk ? "OK" : "NOT tracking"}`,
    `People seen:   ${t.peopleSeen ?? "-"}`,
    `Hand model:    ${t.handLandmarker ? "loaded" : "unavailable (pose fallback)"}`,
    `Shoulder (m):  ${t.shoulderM ?? "-"}`,
    `Arm length SW: L ${t.armLenSW?.("left") ?? "-"} / R ${t.armLenSW?.("right") ?? "-"}`,
    `Page:          ${location.href}`,
    `Browser:       ${navigator.userAgent}`,
    `Screen:        ${window.innerWidth}x${window.innerHeight}`,
  ];
  return lines.join("\n");
}

// The therapist-facing progress summary: the assessment for the trained arm,
// and how the recent rounds went. Plain text on purpose — it has to be
// readable in any mail client, including on a phone in a corridor.
export function progressReport(patientName, p, side) {
  const prof = p.profiles?.[side];
  const cm = p.shoulderCm;
  const out = [
    `STRIVE progress — participant ${patientName}`,
    `Generated ${new Date().toLocaleString()}`,
    `Training arm: ${side}`,
    "",
  ];

  if (!prof) {
    out.push("No assessment on record for this arm yet.");
  } else {
    const area = prof.areaSW2 != null && cm
      ? `${Math.round(prof.areaSW2 * cm * cm)} cm²`
      : prof.areaSW2 != null ? `${prof.areaSW2.toFixed(2)} SW²` : "—";
    out.push(
      `ASSESSMENT (${new Date(prof.date).toLocaleDateString()})`,
      `  Arm elevation arc:  ${prof.arcMinDeg}°–${prof.arcMaxDeg}°` +
        (prof.arcMeasured === false ? "  (not measured — default shown)" : ""),
      `  Workspace area:     ${area}`,
      `  Reach coverage:     ${prof.coverage != null ? Math.round(prof.coverage * 100) + "% of full reach" : "—"}`,
      `  Circle measured:    ${Math.round((prof.covered ?? 0) * 100)}% of directions`,
      `  Arm length:         ${prof.armLenSW != null && cm ? Math.round(prof.armLenSW * cm) + " cm" : prof.armLenSW != null ? prof.armLenSW + " SW" : "—"}`,
    );
    if (prof.volumeM3 != null) {
      out.push(`  Workspace volume:   ${(prof.volumeM3 * 1000).toFixed(1)} litres` +
               (prof.depthRangeM != null ? `  (forward reach ${Math.round(prof.depthRangeM * 100)} cm)` : ""));
    }
    if (prof.quadrants) {
      const q = prof.quadrants;
      out.push(`  By quadrant:        up-out ${pct(q.upOut)}, up-across ${pct(q.upAcross)}, ` +
               `down-across ${pct(q.downAcross)}, down-out ${pct(q.downOut)}`);
    }
    if (prof.extremes?.length) {
      const got = prof.extremes.filter(e => e.reached).length;
      out.push(`  Edges reached:      ${got} of ${prof.extremes.length}`);
      for (const e of prof.extremes) {
        out.push(`    ${e.key.padEnd(10)} ${e.reached ? "reached" : `${Math.round(e.frac * 100)}% of the way`}`);
      }
    }
    if (prof.grasp?.length) {
      const ok = prof.grasp.filter(g => g.ok).length;
      const sq = prof.grasp.filter(g => g.squeeze).length;
      out.push(`  Grasp:              ${ok}/${prof.grasp.length} held, ${sq} with a real squeeze`);
    }
  }

  const rounds = (p.sessions || []).filter(s => s.arm === side);
  const last = rounds.slice(-10);
  out.push("", `ROUNDS (${rounds.length} on this arm, last ${last.length} shown)`);
  if (!last.length) out.push("  none yet");
  for (const r of last) {
    out.push(`  ${new Date(r.date).toLocaleDateString()}  ${String(r.game).padEnd(10)} ` +
             `hits ${r.hits}/${r.hits + r.misses}  (${Math.round((r.hitRate || 0) * 100)}%)  ` +
             `range ${Math.round((r.params?.rangeScale ?? 0) * 100)}%  ` +
             `compensation ${(r.compEvents || []).length}`);
  }

  const evs = rounds.slice(-6).flatMap(r => r.compEvents || []);
  if (evs.length) {
    const by = {};
    for (const e of evs) by[e.type] = (by[e.type] || 0) + 1;
    out.push("", "COMPENSATION (last 6 rounds)",
             "  " + Object.entries(by).map(([k, n]) => `${k}: ${n}`).join(", "));
  }

  out.push("", "Sent from STRIVE by a staff member using Staff → Therapist contact.");
  return out.join("\n");
}

const pct = v => (v == null ? "—" : Math.round(v * 100) + "%");

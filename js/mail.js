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

// Snapshot for update-by-email: the relay answers a therapist's "STRIVE
// update <name>" from the last snapshot it was given, because the browser is
// not running when the email arrives. Silent when there is no relay.
export async function pushSnapshot(name, report, exportJson) {
  if (bridge === null) await probeMail();
  if (!bridge) return { ok: false, error: "no relay" };
  try {
    const r = await fetch(`${MAIL_BRIDGE}/snapshot`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, report, export: exportJson }),
    });
    const s = await r.json().catch(() => ({}));
    return { ok: r.ok && s.ok, error: s.error };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// Session reminder: the relay keeps the schedule and sends it, because the
// page is not running at 9 a.m. tomorrow. Silent when there is no relay.
export async function setReminder(rec) {
  if (bridge === null) await probeMail();
  if (!bridge) return { ok: false, error: "no relay" };
  try {
    const r = await fetch(`${MAIL_BRIDGE}/reminder`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec),
    });
    const s = await r.json().catch(() => ({}));
    return { ok: r.ok && s.ok, error: s.error };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

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
// play time, local days, most recent first
export function playtimeLines(p) {
  const pt = p.playtime || {};
  const days = Object.keys(pt).sort().reverse();
  if (!days.length) return ["  Play time:          none recorded yet"];
  const f = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
  const cutoff = Date.now() - 7 * 86400000;
  const week = days.filter(d => new Date(d).getTime() >= cutoff).reduce((a, d) => a + pt[d].ms, 0);
  const total = days.reduce((a, d) => a + pt[d].ms, 0);
  const out = [`  Play time:          last 7 days ${f(week)}, all time ${f(total)} over ${days.length} day${days.length === 1 ? "" : "s"}`];
  for (const d of days.slice(0, 14)) {
    const e = pt[d];
    out.push(`    ${d}  ${f(e.ms).padEnd(12)} ${e.rounds} round${e.rounds === 1 ? "" : "s"}${e.assessments ? `, ${e.assessments} assessment${e.assessments === 1 ? "" : "s"}` : ""}`);
  }
  return out;
}

export function progressReport(patientName, p, side) {
  const prof = p.profiles?.[side];
  const cm = p.shoulderCm;
  const out = [
    `STRIVE progress — participant ${patientName}`,
    `Generated ${new Date().toLocaleString()}`,
    `Training arm: ${side}`,
    "",
  ];
  out.push(...playtimeLines(p));

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
    if (prof.lift?.peakDeg != null) {
      out.push(`  Arm lift:           ${prof.lift.peakDeg} deg peak` +
               (prof.lift.rangeDeg != null ? ` (${prof.lift.rangeDeg} deg up from rest)` : "") +
               (prof.lift.returned ? "" : ", did not come back down"));
    }
    if (prof.laps?.length) {
      out.push(`  Circles:            ${prof.laps.filter(l => l.complete).length} of ${prof.laps.length} complete   ` +
               prof.laps.map(l => `${l.dir} ${l.seconds}s`).join(", "));
    }
    if (prof.rsa) {
      const r = prof.rsa, f2 = v => (v ?? 0).toFixed(2);
      out.push(`  RSA (planar):       ${f2(r.total14)} of 1.00   ` +
               `[Q1 ${f2(r.q1)} Q2 ${f2(r.q2)} Q3 ${f2(r.q3)} Q4 ${f2(r.q4)}]` +
               (prof.rsaElbow ? `, elbow ${f2(prof.rsaElbow.total14)}` : ""),
               `                      planar envelope, no dorsal quadrant (single camera)`);
    }
    if (prof.extremes?.length) {
      const got = prof.extremes.filter(e => e.reached).length;
      out.push(`  Targets reached:    ${got} of ${prof.extremes.length}`);
      for (const e of prof.extremes) {
        // percentages are of FULL arm reach, and a target brought in to keep
        // it reachable says so — "reached" alone would read as the edge
        const pct = Math.round((e.fracAnat ?? e.frac ?? 0) * 100);
        const askedIn = e.askFrac != null && e.askFrac < 0.97
          ? ` (target set at ${Math.round(e.askFrac * 100)}% of full reach)` : "";
        out.push(`    ${e.key.padEnd(10)} ${e.reached ? `reached${askedIn}` : `${pct}% of full reach${askedIn}`}`);
      }
    }
    if (prof.grasp?.length) {
      const ok = prof.grasp.filter(g => g.ok).length;
      const sq = prof.grasp.filter(g => g.squeeze).length;
      // a hand that was already closed when the squeeze was asked for is
      // resting flexion, not a grasp, and a therapist should see how often
      // that was the starting state
      const pre = (prof.extremes || []).filter(e => e.preClosed).length;
      out.push(`  Grasp:              ${ok}/${prof.grasp.length} held, ${sq} with a real squeeze`
        + (pre ? `, ${pre} started with the hand already closed` : ""));
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

// The coach relay client (Oct 2026): asks tools/coach_bridge.py on localhost
// for a Claude-written line, the way mail.js asks the mail relay. The relay
// is optional and the game never waits on it: coachlines.js speaks its own
// phrasebook line whenever this has no answer within LINE_MS.
//
// What leaves the browser is one JSON event of de-identified numbers (the
// coach id, the event name, the game id, the measured values, the coach's
// last few lines so it does not repeat itself). Never a name, never a
// picture. The relay holds the API key; the page never sees it.

const COACH_BRIDGE = "http://localhost:8324";
const LINE_MS = 2500;             // the prompt doc's budget for a between-rep line

let bridge = null;                // {ok, model} once probed, false when absent

export async function probeCoach() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 900);
    const r = await fetch(`${COACH_BRIDGE}/status`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { bridge = false; return false; }
    const s = await r.json();
    bridge = s.ok ? s : false;
    return bridge;
  } catch { bridge = false; return false; }
}

export function coachRelayReady() { return !!bridge; }
export function coachRelayInfo() { return bridge || null; }

// One line from the relay, or null (offline, slow, refused, malformed).
// `event` is the prompt doc's shape: {coach, event, feedback_type, game,
// data, recent_lines, language_level}.
export async function requestCoachLine(event) {
  if (bridge === null) await probeCoach();
  if (!bridge) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LINE_MS);
    const r = await fetch(`${COACH_BRIDGE}/line`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event), signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const s = await r.json().catch(() => null);
    const say = s && s.ok && typeof s.say === "string" ? s.say.trim() : "";
    // the relay checks the line already; this is the last guard before a voice
    if (!say || say.split(/\s+/).length > 20 || /\d/.test(say)) return null;
    return { say, mood: s.mood || "neutral" };
  } catch { return null; }
}

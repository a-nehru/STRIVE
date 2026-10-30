// The voice bridge client (Oct 2026): asks tools/tts_bridge.py on localhost
// for a line rendered by Chatterbox Turbo in the chosen coach's own voice,
// the way coachline.js asks the coach relay for words. Optional, like every
// bridge: speakLine (a11y.js) uses the browser's speech engine whenever this
// is down or slow, so a line is never lost, it only changes voice.
//
// probeTts()                      -> status once, at boot (and again on demand)
// fetchVoice(coach, text)         -> an object URL for the WAV, or null
// prerenderVoice(coach, lines)    -> asks the bridge to render these in the
//                                    background so the phrasebook is on disk
//                                    before a cue needs it
//
// What leaves the browser is the coach id and the text of a line: never a
// name (the greeting says the name locally, see main.js), never a picture.

const TTS_BRIDGE = "http://localhost:8325";
const PROBE_MS = 900;
const LINE_MS = 6000;             // a cached line answers in tens of ms; a fresh render of a long line takes a few seconds on the 4070 (about 0.7x realtime)
const MEM_MAX = 400;              // object URLs kept in memory (the bridge keeps every line on disk)

let bridge = null;                // the /status payload once probed, false when absent
const mem = new Map();            // "coach\ntext" -> object URL
const pending = new Map();        // "coach\ntext" -> Promise<url|null>, so a repeat is one request

export async function probeTts() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_MS);
    const r = await fetch(`${TTS_BRIDGE}/status`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { bridge = false; return false; }
    const s = await r.json();
    // the model may still be loading: that is "present", and a line asked
    // for before it is ready just falls back to the browser for now
    bridge = s && (s.ok || s.loading) ? s : false;
    return bridge;
  } catch { bridge = false; return false; }
}

export function ttsReady() { return !!(bridge && bridge.ok); }
export function ttsKnown() { return bridge !== null; }   // probed, present or not
export function ttsInfo() { return bridge || null; }

function key(coach, text) { return `${coach}\n${text}`; }

// The WAV for this line as an object URL: from memory, else from the bridge
// (which renders it or reads it from its disk cache). null when the bridge
// is absent, refuses, or takes longer than LINE_MS. A slow render is NOT
// aborted: it finishes into the memory cache so the next time is instant.
export function fetchVoice(coach, text, waitMs = LINE_MS) {
  if (!text || !ttsReady()) return Promise.resolve(null);
  const k = key(coach, text);
  if (mem.has(k)) return Promise.resolve(mem.get(k));
  if (pending.has(k)) return pending.get(k);
  const p = (async () => {
    try {
      const r = await fetch(`${TTS_BRIDGE}/tts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coach, text }),
      });
      if (!r.ok) {
        if (r.status === 503) probeTts();          // model loading or gone: re-read its state
        return null;
      }
      const blob = await r.blob();
      if (!blob.size) return null;
      const url = URL.createObjectURL(blob);
      remember(k, url);
      return url;
    } catch { return null; }
    finally { pending.delete(k); }
  })();
  pending.set(k, p);
  const timeout = new Promise(res => setTimeout(() => res(null), waitMs));
  return Promise.race([p, timeout]);
}

function remember(k, url) {
  if (mem.size >= MEM_MAX) {
    const [oldest] = mem.keys();
    try { URL.revokeObjectURL(mem.get(oldest)); } catch {}
    mem.delete(oldest);
  }
  mem.set(k, url);
}

// Hand the bridge a list of lines to render while nothing is being said.
export async function prerenderVoice(coach, lines) {
  if (bridge === null) await probeTts();
  if (!bridge) return null;
  const list = [...new Set((lines || []).filter(t => typeof t === "string" && t.trim()))];
  if (!list.length) return { queued: 0, cached: 0 };
  try {
    const r = await fetch(`${TTS_BRIDGE}/prerender`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach, lines: list }),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

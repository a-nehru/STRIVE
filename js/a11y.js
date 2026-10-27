// Shared accessibility state + helpers (GAG/WCAG/stroke-specific pass).
// A11Y mirrors the active patient's saved settings (storage.js getSettings);
// main.js calls applySettings on login and whenever staff change a control.
// Kept in its own module so engine.js, coach.js, audio.js and main.js can all
// read it without import cycles.

import { ttsReady, fetchVoice } from "./tts.js";

export const A11Y = {
  captions: true,
  dwellMs: 1400,
  radiusScale: 1,
  squeezeEase: "normal",
  contrast: false,
  calm: false,
  textScale: 1,
  practice: false,
  field: "none",
  fieldMode: "comfort",
  volVoice: 1, volMusic: 1, volFx: 1,
  coach: "lumi",            // rook | lumi | maple (coachlines.js has the words, COACH_VOICE the sound)
};

// The three coaches (Oct 2026, by request, from the choose-your-coach mockup
// and the coach feedback prompt): a coaching STYLE each, never a real person.
// The words are in coachlines.js; this is how each one sounds through the
// browser's own speech engine, with no server: a pitch and a pace about the
// house rate, and a preferred voice when the machine offers one of them.
// `intro` is what a coach says when their card is chosen on the login step
// (Oct 2026, by request): who they are and how they coach, in their own
// voice, so the pick is made on the voice and not only on the drawing.
export const COACHES = {
  rook:  { name: "Rook",  title: "Rook the cat pilot",       style: "Fun and upbeat",
           sample: "Smooth flying, co-pilot! Two more!",
           intro: "Hi, I'm Rook, your cat pilot. I keep things fun and upbeat, and I cheer every rep [chuckle]. Ready to fly?" },
  lumi:  { name: "Lumi",  title: "Lumi the lantern firefly", style: "Calm and gentle",
           sample: "Nice and slow. Take your time.",
           intro: "Hello, I'm Lumi, the lantern firefly. I'm calm and gentle. We go at your pace, one easy move at a time." },
  maple: { name: "Maple", title: "Coach Maple the bear",     style: "Pushes you to do more",
           sample: "Up six from last week. Now beat it.",
           intro: "I'm Coach Maple, the bear. I'll push you to do a little more each day. That's how an arm gets stronger." },
};
// ONE voice for everything (Oct 2026, by request: the first pick came out
// deep, and the voice must not change between the intro, the coach and the
// games). The coaches differ in their words only. A clear, warm, not-deep
// voice is preferred wherever the browser has one; the pitch is never bent.
export const VOICE_PREFER = ["Microsoft Aria Online (Natural)", "Microsoft Jenny Online (Natural)", "Microsoft Aria",
  "Microsoft Jenny", "Microsoft Zira", "Google US English", "Samantha", "Microsoft Libby Online (Natural)",
  "Google UK English Female", "Karen", "Moira"];
const ONE_VOICE = { pitch: 1.0, rate: 1.0, prefer: VOICE_PREFER };
export const COACH_VOICE = { rook: ONE_VOICE, lumi: ONE_VOICE, maple: ONE_VOICE };
export function coachInfo(id = A11Y.coach) { return COACHES[id] || COACHES.lumi; }

// A voice for the coach: the first preferred name the browser has, else an
// English voice, else the default (null). getVoices() is empty until the
// engine has listed them, so the answer is cached per list length and asked
// again whenever that changes.
let _voiceCache = { key: "", voice: null };
try { speechSynthesis.addEventListener("voiceschanged", () => { _voiceCache = { key: "", voice: null }; }); } catch {}
export function coachVoice(id = A11Y.coach) {
  let voices = [];
  try { voices = speechSynthesis.getVoices() || []; } catch { return null; }
  const key = id + ":" + voices.length;
  if (_voiceCache.key === key) return _voiceCache.voice;
  const v = COACH_VOICE[id] || COACH_VOICE.lumi;
  let pick = null;
  for (const name of v.prefer) {
    pick = voices.find(x => x.name === name) || voices.find(x => x.name.startsWith(name));
    if (pick) break;
  }
  if (!pick) pick = voices.find(x => /^en[-_]/i.test(x.lang) && /female|aria|jenny|zira|samantha|libby|karen|moira|sonia|natasha/i.test(x.name))
    || voices.find(x => /^en[-_]/i.test(x.lang) && x.default) || voices.find(x => /^en[-_]/i.test(x.lang)) || null;
  _voiceCache = { key, voice: pick };
  return pick;
}

export function applySettings(s) {
  Object.assign(A11Y, s);
  // system preference counts as an opt-in for reduced motion
  try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) A11Y.calm = true; } catch {}
  document.body.classList.toggle("hc", !!A11Y.contrast);
  document.body.classList.toggle("calm", !!A11Y.calm);
  document.body.classList.remove("t125", "t150");
  if (A11Y.textScale >= 1.5) document.body.classList.add("t150");
  else if (A11Y.textScale >= 1.25) document.body.classList.add("t125");
}

// One speech path for the whole app: unhurried rate, patient-set volume,
// and an optional on-screen caption (hearing loss is near-universal in the
// target demographic — GAG "subtitles for all important speech").
// `coach` (optional) speaks as that coach instead of the chosen one: the
// chooser's "Hear it" buttons.
//
// Two voices can be behind it (Oct 2026, by request: the coaches should
// SOUND different, not only read differently). When the voice bridge
// (tools/tts_bridge.py, js/tts.js) is up, the line is rendered by Chatterbox
// Turbo in the coach's own cloned voice and played as audio, tags like
// "[chuckle]" rendered as sounds; the phrasebook is pre-rendered at login, a
// Claude-written line is rendered as it arrives. Without the bridge, or when
// it does not answer in time, the browser's speech engine reads it as
// before, with the tags stripped (it would read the brackets out). Either
// way the whole app speaks in the chosen coach's voice: the intro, the
// games and the coach never change voice within a session.
let voiceSeq = 0;                 // a newer line supersedes an older one still being fetched
let voiceEl = null;               // the <audio> playing now
// Who is talking (Oct 2026, by request: the voice kept cutting itself off
// mid-sentence). `busy` is the seq of the line still being fetched or said,
// 0 when quiet; `busyCap` lets a stuck engine go after a reading-paced while.
let busy = 0, busyCap = 0;
export function voiceBusy() { return busy !== 0 && busy === voiceSeq && performance.now() < busyCap; }
// A line that must be heard but should not cut the one being said waits its
// turn here; one still waiting after maxWaitMs is out of date and dropped.
const voiceQueue = [];
let queueTimer = null;
export function speakQueued(text, rate = 0.9, caption = false, maxWaitMs = 9000) {
  if (!voiceBusy() && !voiceQueue.length) { speakLine(text, rate, caption); return; }
  voiceQueue.push({ text, rate, caption, until: performance.now() + maxWaitMs });
  if (!queueTimer) queueTimer = setInterval(drainQueue, 200);
}
function drainQueue() {
  const now = performance.now();
  while (voiceQueue.length && voiceQueue[0].until < now) voiceQueue.shift();
  if (!voiceQueue.length) { clearInterval(queueTimer); queueTimer = null; return; }
  if (voiceBusy()) return;
  const q = voiceQueue.shift();
  speakLine(q.text, q.rate, q.caption);
}
function stopVoice() {
  if (voiceEl) { try { voiceEl.pause(); voiceEl.src = ""; } catch {} voiceEl = null; }
}
function plainText(text) {
  return String(text || "").replace(/\s*\[(\w+)\]\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function speakLine(text, rate = 0.9, caption = true, onend = null, coach = null) {
  const raw = String(text || "").replace(/\s{2,}/g, " ").trim();
  text = plainText(raw);
  const who = coach || A11Y.coach;
  const cv = COACH_VOICE[who] || COACH_VOICE.lumi;
  // onend (optional) fires once when the line has been spoken, or after a
  // reading-paced fallback when speech is unavailable or silent, so a caller
  // chaining several lines (the intro) never stalls on a browser with no voice
  let done = false;
  const finish = () => { if (done || !onend) return; done = true; clearTimeout(guard); onend(); };
  const words = text.split(/\s+/).length;
  const guard = onend ? setTimeout(finish, Math.max(3000, words * 430 / rate) + 1500) : null;
  const seq = ++voiceSeq;
  busy = text ? seq : 0;
  busyCap = performance.now() + 6000 + Math.max(3000, words * 600 / rate);   // fetch budget + reading time
  const ended = () => { if (busy === seq) busy = 0; finish(); };
  try { speechSynthesis.cancel(); } catch {}
  stopVoice();
  if (caption) showCaption(text);
  if (!text) { finish(); return; }

  const browser = () => {
    if (seq !== voiceSeq) return;                  // a newer line has taken over
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate * cv.rate;
      u.pitch = cv.pitch;
      const voice = coachVoice(who);
      if (voice) u.voice = voice;
      u.volume = A11Y.volVoice;
      u.onend = ended;
      u.onerror = ended;
      speechSynthesis.speak(u);
    } catch { /* voice optional: the guard timer finishes the line */ }
  };

  if (!ttsReady() || A11Y.volVoice <= 0) { browser(); return; }
  fetchVoice(who, raw).then(url => {
    if (seq !== voiceSeq) return;
    if (!url) { browser(); return; }
    try {
      const a = new Audio(url);
      a.preservesPitch = true;
      a.playbackRate = Math.min(1.2, Math.max(0.6, rate * cv.rate));
      a.volume = Math.min(1, Math.max(0, A11Y.volVoice));
      a.onended = () => { if (voiceEl === a) voiceEl = null; ended(); };
      a.onerror = () => { if (voiceEl === a) voiceEl = null; browser(); };
      voiceEl = a;
      a.play().catch(() => { if (voiceEl === a) voiceEl = null; browser(); });
    } catch { browser(); }
  });
}

// stop whatever is being said now (both engines)
export function hushVoice() {
  voiceSeq++;
  busy = 0;
  voiceQueue.length = 0;
  try { speechSynthesis.cancel(); } catch {}
  stopVoice();
}

let capTimer = null;
export function showCaption(text) {
  if (!A11Y.captions || !text) return;
  const el = document.getElementById("caption");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(capTimer);
  // slow fade, paced for older readers: ~430 ms per word, min 2.6 s
  const ms = Math.max(2600, text.split(/\s+/).length * 430);
  capTimer = setTimeout(() => el.classList.add("hidden"), ms);
}

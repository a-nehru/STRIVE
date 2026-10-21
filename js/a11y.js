// Shared accessibility state + helpers (GAG/WCAG/stroke-specific pass).
// A11Y mirrors the active patient's saved settings (storage.js getSettings);
// main.js calls applySettings on login and whenever staff change a control.
// Kept in its own module so engine.js, coach.js, audio.js and main.js can all
// read it without import cycles.

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
export const COACHES = {
  rook:  { name: "Rook",  title: "Rook the cat pilot",       style: "Fun and upbeat",
           sample: "Smooth flying, co-pilot! Two more!" },
  lumi:  { name: "Lumi",  title: "Lumi the lantern firefly", style: "Calm and gentle",
           sample: "Nice and slow. Take your time." },
  maple: { name: "Maple", title: "Coach Maple the bear",     style: "Pushes you to do more",
           sample: "Up six from last week. Now beat it." },
};
export const COACH_VOICE = {
  rook:  { pitch: 1.15, rate: 1.05, prefer: ["Google UK English Female", "Microsoft Libby", "Microsoft Zira", "Samantha", "Karen"] },
  lumi:  { pitch: 1.0,  rate: 0.95, prefer: ["Microsoft Aria", "Google US English", "Microsoft Jenny", "Moira", "Samantha"] },
  maple: { pitch: 0.85, rate: 1.0,  prefer: ["Microsoft Guy", "Google UK English Male", "Microsoft Ryan", "Daniel", "Microsoft David"] },
};
export function coachInfo(id = A11Y.coach) { return COACHES[id] || COACHES.lumi; }

// A voice for the coach: the first preferred name the browser has, else an
// English voice, else the default (null). getVoices() is empty until the
// engine has listed them, so the answer is cached per list length and asked
// again whenever that changes.
let _voiceCache = { key: "", voice: null };
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
  if (!pick) pick = voices.find(x => /^en[-_]/i.test(x.lang) && x.default) || voices.find(x => /^en[-_]/i.test(x.lang)) || null;
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
// chooser's "Hear it" buttons. The voice tags the coach prompt allows
// ("[chuckle]", "[laugh]") are for a voice engine that renders them; the
// browser's would read the brackets out, so they are stripped here, in the
// one place every line passes through.
export function speakLine(text, rate = 0.9, caption = true, onend = null, coach = null) {
  text = String(text || "").replace(/\s*\[(chuckle|laugh|cough)\]\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
  const cv = COACH_VOICE[coach || A11Y.coach] || COACH_VOICE.lumi;
  // onend (optional) fires once when the line has been spoken, or after a
  // reading-paced fallback when speech is unavailable or silent, so a caller
  // chaining several lines (the intro) never stalls on a browser with no voice
  let done = false;
  const finish = () => { if (done || !onend) return; done = true; clearTimeout(guard); onend(); };
  const words = text.split(/\s+/).length;
  const guard = onend ? setTimeout(finish, Math.max(3000, words * 430 / rate) + 1500) : null;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate * cv.rate;
    u.pitch = cv.pitch;
    const voice = coachVoice(coach || A11Y.coach);
    if (voice) u.voice = voice;
    u.volume = A11Y.volVoice;
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  } catch { /* voice optional: the guard timer finishes the line */ }
  if (caption) showCaption(text);
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

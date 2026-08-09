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
};

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
export function speakLine(text, rate = 0.9, caption = true) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.volume = A11Y.volVoice;
    speechSynthesis.speak(u);
  } catch { /* voice optional */ }
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

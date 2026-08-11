import { Tracker } from "./tracker.js";
import { Assessment } from "./assessment.js";
import { GAMES } from "./games.js";
import { SONGS } from "./songs.js";
import { initialParams, adjust } from "./dda.js";
import { drawBody } from "./engine.js";
import { store } from "./storage.js";
import { audio } from "./audio.js";
import { A11Y, applySettings, speakLine } from "./a11y.js";

const $ = id => document.getElementById(id);
const SCREENS = ["screen-login", "screen-welcome", "screen-select", "stage", "screen-between", "screen-collections", "screen-profile"];

const state = {
  tracker: null,
  side: "right",
  sideChosen: false,   // true once the patient (welcome lift) or staff (drawer) picked a hand — asked once, never re-asked
  patient: "guest",
  coachSens: "gentle",
  pongMode: "solo",
  pongSkills: "auto",
  oarsMode: "together",
  ferryMode: "solo",
  song: "mary",
  tilesMode: "one",
  current: null,
  roundNumber: 0,
  sessionStars: 0,
  screen: "screen-login",
};

function show(id) {
  for (const s of SCREENS) $(s).classList.add("hidden");
  $(id).classList.remove("hidden");
  state.screen = id;
}

function resize() { const c = $("canvas"); c.width = innerWidth; c.height = innerHeight; }
addEventListener("resize", resize); resize();

// spoken guidance outside game/assessment classes (welcome, menus) — the
// suite speaks everything important (RGS auto audio instructions), with an
// on-screen caption for patients who can't hear it
const speak = text => speakLine(text, 0.9, true);

// per-patient accessibility settings → live A11Y state + audio buses
function loadSettings(name) {
  const s = store.getSettings(name);
  applySettings(s);
  audio.setVolumes({ music: s.volMusic, fx: s.volFx });
  syncComfortControls();
}
function saveSetting(patch) {
  store.saveSettings(state.patient, patch);
  loadSettings(state.patient);
}

/* ================= tracker boot ================= */
async function boot() {
  $("loading").classList.remove("hidden");
  try {
    const t = new Tracker();
    // device-level setting (not per-patient): "auto" probes the local ZED
    // bridge (tools/zed_bridge.py) and falls back to the webcam
    await t.init($("video"), localStorage.getItem("strive-cam-source") || "auto");
    t.start();
    state.tracker = t;
    $("camstate").textContent = t.source === "zed"
      ? "Camera: ZED 2 (SDK body tracking via bridge)"
      : "Camera: tracking";
    $("camstate").className = "ok";
  } catch (e) {
    $("camstate").textContent = "Camera: unavailable. " + e.message;
    $("camstate").className = "bad";
  } finally {
    $("loading").classList.add("hidden");
  }
}

/* ================= login (P0) ================= */
// First screen: pick an existing participant or create one. Every choice is
// stored under rehabsuite-v1 immediately, so stars, profiles and history come
// back next visit. The camera keeps warming up in the background meanwhile.
function loginStep(step) {
  for (const s of ["login-choice", "login-list", "login-create"])
    $(s).classList.toggle("hidden", s !== step);
  if (step === "login-create") setTimeout(() => $("login-name").focus(), 50);
}

function renderLoginPeople() {
  const people = store.listPatients().filter(p => p.name !== "guest");
  $("login-people").innerHTML = "";
  for (const p of people) {
    const seen = new Date(p.lastLogin).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const b = document.createElement("button");
    b.className = "login-person";
    b.dataset.name = p.name;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = p.name;
    const meta = document.createElement("span"); meta.className = "meta";
    meta.textContent = p.sessions ? `${p.sessions} rounds · last visit ${seen}` : `joined ${seen}`;
    b.append(nm, meta);
    $("login-people").appendChild(b);
  }
  return people.length;
}

function loginAs(name, isNew) {
  state.patient = name;
  store.login(name);
  loadSettings(name);                      // this patient's comfort settings take effect
  $("in-patient").value = name;            // keep the staff drawer in sync
  $("in-shoulder").value = store.getPatient(name).shoulderCm ?? "";
  show("screen-welcome");
  if (name !== "guest") speak(isNew ? `Nice to meet you, ${name}.` : `Welcome back, ${name}.`);
}

$("btn-login-existing").addEventListener("click", () => {
  if (renderLoginPeople()) loginStep("login-list");
  else loginStep("login-create");           // nobody saved yet: go straight to create
});
$("btn-login-new").addEventListener("click", () => loginStep("login-create"));
$("btn-login-guest").addEventListener("click", () => loginAs("guest", false));
$("btn-login-back1").addEventListener("click", () => loginStep("login-choice"));
$("btn-login-back2").addEventListener("click", () => loginStep("login-choice"));
$("login-people").addEventListener("click", e => {
  const b = e.target.closest(".login-person");
  if (b) loginAs(b.dataset.name, false);
});
function createLogin() {
  const name = $("login-name").value.trim();
  if (!name) { $("login-name").focus(); return; }
  loginAs(name, !store.hasPatient(name));   // existing name just logs in
}
$("btn-login-create").addEventListener("click", createLogin);
$("login-name").addEventListener("keydown", e => { if (e.key === "Enter") createLogin(); });

/* ================= welcome (P1) ================= */
// Setup gate: guide the patient until their whole upper body is in frame,
// centered and at a good distance, settled for a moment. Only then offer
// the raise-hand start. A click anywhere is the staff override.
function framingMessage(t) {
  if (!t.trackingOk) return "Take a seat facing the camera";
  if (t.shoulderWFast > 0.42) return "Sit back a little, so we can see your whole upper body";
  if (t.shoulderWFast < 0.09) return "Come a little closer to the camera";
  if (!t.rawVis?.hips) return "Sit back a little, we want to see down to your hips";
  if (t.anchorFast.x < 0.28 || t.anchorFast.x > 0.72) return "Scoot toward the middle of the picture";
  if (t.anchorFast.y < 0.15 || t.anchorFast.y > 0.65) return "Adjust the camera so your shoulders sit near the middle";
  return null;
}

const TAU2 = Math.PI * 2;
// (the live-mirror body drawing moved to engine.js drawBody — shared with the
// assessment's camera view)

function watchWelcome() {
  const raisedSince = { left: null, right: null }, closedSince = { left: null, right: null };
  let framedSince = null, squeezeSeen = false;
  let lastSpoken = "", lastSpokenAt = 0, inviteSaid = false;
  const resetGesture = () => { raisedSince.left = raisedSince.right = null; closedSince.left = closedSince.right = null; };
  // spoken framing guidance, throttled so it never nags
  const guide = (text, now) => {
    if (text === lastSpoken || now - lastSpokenAt < 7000) return;
    lastSpoken = text; lastSpokenAt = now;
    speak(text);
  };
  const head = document.querySelector("#screen-welcome .headline");
  const sub = document.querySelector("#screen-welcome .subline");
  const trackEl = $("welcome-track");
  const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

  function loop() {
    requestAnimationFrame(loop);
    if (state.screen !== "screen-welcome") return;
    const c = $("welcome-canvas");
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const t = state.tracker;
    if (!t) return;
    const now = performance.now();

    // tracking + feature status (so staff can see the whole chain is alive)
    if (t.handClosed("left") || t.handClosed("right")) squeezeSeen = true;
    const handFresh = t._handPts("left") != null || t._handPts("right") != null;
    setText(trackEl, t.trackingOk
      ? `Tracking: body ✓ · hand ${handFresh ? "✓" : "…"} · squeeze ${squeezeSeen ? "✓" : "… try closing your fist"}`
      : "Tracking: looking for you …");

    const msg = framingMessage(t);
    const framed = !msg;
    if (t.trackingOk) drawBody(ctx, c, t, { framed });

    if (msg) {
      framedSince = null; resetGesture();
      setText(head, "Let's get you settled");
      setText(sub, msg);
      guide(msg, now);
      return;
    }
    framedSince ??= now;
    if (now - framedSince < 1400) {
      setText(head, "That's it");
      setText(sub, "Sit comfortably, just like that");
      return;
    }
    setText(head, "Ready when you are");
    setText(sub, "Lift the hand you want to train, and squeeze to begin");
    if (!inviteSaid) {
      inviteSaid = true;
      speak("Ready when you are. Lift the hand you want to train, and give it a squeeze.");
    }

    // start gesture doubles as the LEFT/RIGHT choice: whichever hand is
    // lifted + squeezed (fast) or just held up (fallback) becomes the
    // session side — its label shows by the progress ring
    for (const s of ["left", "right"]) {
      const rel = t.handRel(s);
      if (rel && rel.y > 0.15) {
        raisedSince[s] ??= now;
        if (t.handClosed(s)) closedSince[s] ??= now; else closedSince[s] = null;
        const prog = Math.max((now - raisedSince[s]) / 3500, closedSince[s] ? (now - closedSince[s]) / 700 : 0);
        const hp = t.palmPx(s, c);
        if (hp) {
          ctx.strokeStyle = "#fff2c2"; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(hp.x, hp.y, 32, -Math.PI / 2, -Math.PI / 2 + TAU2 * Math.min(1, prog)); ctx.stroke();
          ctx.fillStyle = "rgba(244,236,221,0.9)";
          ctx.font = `800 ${Math.round(c.height * 0.026)}px Nunito, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(s === "left" ? "Left hand" : "Right hand", hp.x, hp.y - 48);
        }
        if (prog >= 1) {
          resetGesture();
          state.side = s;                 // the lifted hand is the trained hand
          state.sideChosen = true;        // asked once — the assessment won't re-ask
          $("in-arm").value = s;          // keep the staff drawer in sync
          enterSelect();
          return;
        }
      } else { raisedSince[s] = null; closedSince[s] = null; }
    }
  }
  loop();
  $("screen-welcome").addEventListener("click", enterSelect);
  $("btn-welcome-start").addEventListener("click", e => { e.stopPropagation(); enterSelect(); });
}

function enterSelect() {
  if (state.screen !== "screen-welcome" && state.screen !== "screen-profile") return;
  const fromWelcome = state.screen === "screen-welcome";
  renderSelect();
  show("screen-select");
  if (fromWelcome) {
    const prof = store.getProfile(state.patient, state.side);
    speak(prof ? "What shall we play today?" : "Let's draw your circle first, so the games fit you.");
  }
}

/* ================= game select (P3, cards 1g) ================= */
const CARD_ART = {
  constellations: `<div class="art" style="background:linear-gradient(180deg,#1b1b3a,#3a3168)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <g stroke="rgba(244,236,221,.5)" stroke-width="1.5" fill="none"><path d="M70 140 L140 180 L210 150 L230 220 L140 180"/></g>
      <g fill="#fff2c2"><circle cx="70" cy="140" r="4"/><circle cx="140" cy="180" r="4"/><circle cx="210" cy="150" r="4"/><circle cx="230" cy="220" r="4"/></g>
      <circle cx="50" cy="70" r="2.5" fill="#fff" opacity=".7"/><circle cx="240" cy="90" r="2" fill="#fff" opacity=".5"/>
    </svg></div>`,
  drift: `<div class="art" style="background:linear-gradient(180deg,#e6c9a0,#c99e8c 40%,#5a7f88 78%,#2f5560)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="110" cy="120" r="22" fill="#fff6e6" opacity=".9"/><circle cx="200" cy="200" r="17" fill="#dba0b0" opacity=".85"/>
      <line x1="0" y1="330" x2="300" y2="330" stroke="rgba(244,236,221,.4)" stroke-width="2"/>
      <rect x="0" y="330" width="300" height="70" fill="rgba(20,45,52,.35)"/>
    </svg></div>`,
  ember: `<div class="art" style="background:linear-gradient(180deg,#3a2c4a,#4a3550 45%,#2a2038)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="150" cy="130" r="10" fill="#e8703a"/><circle cx="150" cy="130" r="5" fill="#fff2c2"/>
      <rect x="20" y="320" width="70" height="80" fill="#16121f"/><rect x="100" y="290" width="55" height="110" fill="#16121f"/>
      <rect x="165" y="330" width="85" height="70" fill="#16121f"/><rect x="260" y="310" width="40" height="90" fill="#16121f"/>
      <rect x="38" y="342" width="11" height="13" fill="#e8a86a"/><rect x="118" y="315" width="10" height="12" fill="#e8a86a"/><rect x="196" y="350" width="11" height="13" fill="#e8a86a"/>
    </svg></div>`,
  lantern: `<div class="art" style="background:linear-gradient(180deg,#1b1b3a,#2f2a5a 60%,#4a3f78)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <ellipse cx="150" cy="200" rx="24" ry="30" fill="#e8a86a"/><ellipse cx="150" cy="192" rx="12" ry="14" fill="#fff6d8"/>
      <ellipse cx="90" cy="90" rx="12" ry="15" fill="#e8a86a" opacity=".5"/><ellipse cx="220" cy="120" rx="10" ry="13" fill="#e8a86a" opacity=".38"/>
    </svg></div>`,
  pong: `<div class="art" style="background:radial-gradient(circle at 50% 50%,#3a4f6a,#1c2740)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <rect x="36" y="130" width="13" height="90" rx="7" fill="#8f76b0"/><rect x="252" y="180" width="13" height="90" rx="7" fill="#e8b98a"/>
      <circle cx="150" cy="200" r="13" fill="#fff6d8"/><circle cx="150" cy="200" r="42" fill="rgba(159,192,138,.18)"/>
    </svg></div>`,
  assess: `<div class="art" style="background:radial-gradient(circle at 50% 42%,#3a3168,#20204a 60%,#161636)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="150" cy="190" r="85" fill="none" stroke="rgba(244,236,221,.3)" stroke-width="3" stroke-dasharray="8 9"/>
      <circle cx="150" cy="190" r="85" fill="none" stroke="rgba(232,168,106,.65)" stroke-width="6" stroke-dasharray="360 180"/>
      <circle cx="235" cy="180" r="9" fill="#fff6d8"/>
    </svg></div>`,
  rhythm: `<div class="art" style="background:linear-gradient(180deg,#241b3f,#33255c 60%,#1b1433)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <rect x="60" y="0" width="34" height="240" fill="rgba(232,168,106,.1)"/><rect x="133" y="0" width="34" height="240" fill="rgba(232,168,106,.1)"/><rect x="206" y="0" width="34" height="240" fill="rgba(232,168,106,.1)"/>
      <polygon points="77,90 80,98 88,99 82,104 84,112 77,108 70,112 72,104 66,99 74,98" fill="#fff2c2"/>
      <polygon points="223,150 226,158 234,159 228,164 230,172 223,168 216,172 218,164 212,159 220,158" fill="#fff2c2"/>
      <circle cx="150" cy="240" r="26" fill="none" stroke="#9fc08a" stroke-width="4"/>
      <circle cx="77" cy="240" r="26" fill="none" stroke="rgba(244,236,221,.4)" stroke-width="3"/>
      <circle cx="223" cy="240" r="26" fill="none" stroke="rgba(244,236,221,.4)" stroke-width="3"/>
    </svg></div>`,
  boxes: `<div class="art" style="background:linear-gradient(180deg,#26324e,#1d2740 65%,#141b30)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <line x1="150" y1="40" x2="150" y2="360" stroke="rgba(244,236,221,.35)" stroke-width="4" stroke-dasharray="12 12"/>
      <rect x="200" y="150" width="52" height="52" rx="6" fill="#c77f4a"/>
      <rect x="52" y="300" width="42" height="42" rx="5" fill="#7a5c3e"/><rect x="52" y="254" width="42" height="42" rx="5" fill="#7a5c3e"/>
      <path d="M185 90 L120 90 M120 90 L136 78 M120 90 L136 102" stroke="#9fc08a" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg></div>`,
  compass: `<div class="art" style="background:radial-gradient(circle at 50% 50%,#2c3a54,#141d30)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <g stroke="rgba(244,236,221,.2)" stroke-width="2">
        <line x1="150" y1="200" x2="150" y2="90"/><line x1="150" y1="200" x2="228" y2="122"/><line x1="150" y1="200" x2="260" y2="200"/><line x1="150" y1="200" x2="72" y2="122"/><line x1="150" y1="200" x2="40" y2="200"/>
      </g>
      <circle cx="150" cy="200" r="34" fill="none" stroke="#9fc08a" stroke-width="3" stroke-dasharray="7 7"/>
      <circle cx="150" cy="90" r="8" fill="#e8a86a"/><circle cx="228" cy="122" r="8" fill="#e8a86a"/><circle cx="260" cy="200" r="6" fill="rgba(244,236,221,.4)"/><circle cx="72" cy="122" r="6" fill="rgba(244,236,221,.4)"/>
    </svg></div>`,
  echo: `<div class="art" style="background:radial-gradient(circle at 50% 35%,#1f2547,#0f1229)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <polygon points="190,120 194,131 205,132 197,139 199,150 190,145 181,150 183,139 175,132 186,131" fill="#fff2c2"/>
      <circle cx="150" cy="180" r="20" fill="none" stroke="#8fd0c8" stroke-width="4"/>
      <line x1="163" y1="167" x2="183" y2="140" stroke="rgba(244,236,221,.5)" stroke-width="3" stroke-dasharray="5 6"/>
      <circle cx="120" cy="290" r="30" fill="none" stroke="rgba(159,192,138,.6)" stroke-width="3" stroke-dasharray="8 8"/>
    </svg></div>`,
  lens: `<div class="art" style="background:radial-gradient(circle at 50% 45%,#3d3a68,#171736)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="150" cy="190" r="70" fill="rgba(255,246,216,.85)"/>
      <circle cx="150" cy="190" r="70" fill="none" stroke="#e8a86a" stroke-width="5"/>
      <rect x="90" y="120" width="60" height="60" rx="14" fill="#9aa6c0" opacity=".85"/>
      <rect x="160" y="200" width="52" height="52" rx="12" fill="#9aa6c0" opacity=".6"/>
      <path d="M60 320 Q150 300 240 320" stroke="rgba(244,236,221,.3)" stroke-width="3" fill="none"/>
    </svg></div>`,
  crane: `<div class="art" style="background:linear-gradient(180deg,#1c2440,#25314e 62%,#101a2e)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <line x1="150" y1="60" x2="150" y2="180" stroke="#e8b98a" stroke-width="5"/>
      <path d="M138 180 Q150 196 162 180" stroke="#e8a86a" stroke-width="5" fill="none"/>
      <rect x="122" y="210" width="56" height="56" rx="8" fill="#5ed455" stroke="rgba(15,40,20,.85)" stroke-width="3"/>
      <rect x="0" y="330" width="300" height="70" fill="rgba(18,40,52,.55)"/>
      <path d="M40 120 A85 85 0 0 1 110 62" stroke="rgba(159,192,138,.5)" stroke-width="9" fill="none" stroke-linecap="round"/>
    </svg></div>`,
  feather: `<div class="art" style="background:linear-gradient(180deg,#241f45,#131228)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M150 70 a12 12 0 1 1 12 -12" stroke="#e8a86a" stroke-width="5" fill="none"/>
      <ellipse cx="150" cy="180" rx="22" ry="28" fill="#e8a86a"/><ellipse cx="150" cy="172" rx="11" ry="13" fill="#fff6d8"/>
      <line x1="150" y1="90" x2="150" y2="150" stroke="rgba(244,236,221,.4)" stroke-width="3" stroke-dasharray="4 8"/>
      <line x1="110" y1="320" x2="190" y2="320" stroke="#9fc08a" stroke-width="6" stroke-linecap="round"/>
      <rect x="216" y="120" width="16" height="180" rx="8" fill="rgba(159,192,138,.4)"/>
    </svg></div>`,
  buoys: `<div class="art" style="background:linear-gradient(180deg,#1a2140,#182a42 70%,#0e1830)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <polygon points="80,240 110,240 103,206 87,206" fill="#e8a86a"/>
      <polygon points="195,260 225,260 218,226 202,226" fill="#787ea0"/>
      <circle cx="95" cy="190" r="12" fill="#fff6d8"/><circle cx="210" cy="212" r="8" fill="rgba(244,236,221,.5)"/>
      <path d="M110 200 Q150 170 195 216" stroke="rgba(255,242,194,.5)" stroke-width="3" stroke-dasharray="6 7" fill="none"/>
    </svg></div>`,
  oars: `<div class="art" style="background:linear-gradient(180deg,#1b2342,#203550 55%,#0d1a30)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M90 250 L210 250 L190 285 L110 285 Z" fill="#3a3552"/>
      <ellipse cx="150" cy="232" rx="12" ry="15" fill="#e8a86a"/>
      <line x1="105" y1="255" x2="52" y2="215" stroke="#e8b98a" stroke-width="6" stroke-linecap="round"/>
      <line x1="195" y1="255" x2="248" y2="215" stroke="#e8b98a" stroke-width="6" stroke-linecap="round"/>
      <path d="M30 320 Q150 306 270 320" stroke="rgba(143,208,200,.4)" stroke-width="3" fill="none"/>
    </svg></div>`,
  ferry: `<div class="art" style="background:linear-gradient(180deg,#151d3a,#1c2f4a 45%,#0a1526)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M60 220 L150 220 L172 236 L150 252 L60 252 Z" fill="#4a4468"/>
      <ellipse cx="92" cy="204" rx="9" ry="11" fill="#e8a86a"/>
      <polygon points="225,140 245,140 240,118 230,118" fill="#c77f4a"/>
      <polygon points="225,320 245,320 240,298 230,298" fill="#c77f4a"/>
      <line x1="235" y1="150" x2="235" y2="290" stroke="rgba(159,192,138,.4)" stroke-width="3" stroke-dasharray="7 9"/>
    </svg></div>`,
  stars: `<div class="art" style="background:radial-gradient(circle at 50% 25%,#232a52,#0d1027)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <line x1="110" y1="60" x2="110" y2="150" stroke="rgba(255,242,194,.8)" stroke-width="6" stroke-linecap="round"/>
      <polygon points="110,165 114,176 125,177 117,184 119,195 110,190 101,195 103,184 95,177 106,176" fill="#fff2c2"/>
      <line x1="205" y1="120" x2="205" y2="190" stroke="rgba(143,208,200,.7)" stroke-width="5" stroke-linecap="round"/>
      <path d="M60 300 Q150 240 250 280" stroke="rgba(232,168,106,.6)" stroke-width="4" fill="none" stroke-dasharray="3 8"/>
    </svg></div>`,
  flare: `<div class="art" style="background:linear-gradient(180deg,#101433,#232a52 60%,#181d38)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <line x1="150" y1="330" x2="150" y2="270" stroke="#e8b98a" stroke-width="7" stroke-linecap="round"/>
      <line x1="150" y1="272" x2="98" y2="316" stroke="rgba(255,242,194,.8)" stroke-width="4"/>
      <circle cx="150" cy="266" r="10" fill="#fff6d8"/>
      <ellipse cx="210" cy="110" rx="18" ry="23" fill="#6a5f8a"/>
      <circle cx="210" cy="110" r="34" fill="none" stroke="rgba(255,246,216,.45)" stroke-width="3" stroke-dasharray="6 7"/>
      <path d="M155 258 Q185 190 205 130" stroke="rgba(232,168,106,.5)" stroke-width="3" stroke-dasharray="2 9" fill="none"/>
    </svg></div>`,
  shelf: `<div class="art" style="background:linear-gradient(180deg,#2a2344,#161226)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <line x1="170" y1="120" x2="260" y2="120" stroke="#e8a86a" stroke-width="6" stroke-linecap="round"/>
      <line x1="170" y1="195" x2="260" y2="195" stroke="rgba(244,236,221,.35)" stroke-width="5" stroke-linecap="round"/>
      <line x1="170" y1="270" x2="260" y2="270" stroke="rgba(244,236,221,.35)" stroke-width="5" stroke-linecap="round"/>
      <rect x="196" y="158" width="26" height="34" rx="7" fill="#d8b98a"/>
      <rect x="60" y="290" width="30" height="40" rx="8" fill="#d8b98a" stroke="rgba(30,20,10,.6)" stroke-width="2"/>
      <path d="M85 270 Q130 190 190 130" stroke="rgba(255,242,194,.4)" stroke-width="3" stroke-dasharray="3 8" fill="none"/>
    </svg></div>`,
  windows: `<div class="art" style="background:linear-gradient(180deg,#191d3d,#232042 70%,#141126)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <rect x="30" y="250" width="70" height="120" fill="#100d1e"/><rect x="120" y="220" width="60" height="150" fill="#100d1e"/><rect x="200" y="260" width="72" height="110" fill="#100d1e"/>
      <rect x="50" y="275" width="16" height="20" fill="#e8a86a"/>
      <rect x="140" y="245" width="15" height="19" fill="#e8a86a"/>
      <rect x="222" y="285" width="15" height="19" fill="rgba(150,160,200,.35)" stroke="rgba(255,246,216,.5)" stroke-width="2"/>
      <rect x="248" y="285" width="15" height="19" fill="rgba(150,160,200,.35)" stroke="rgba(255,246,216,.5)" stroke-width="2"/>
    </svg></div>`,
  sorting: `<div class="art" style="background:linear-gradient(180deg,#1d1f42,#101228)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <line x1="150" y1="60" x2="150" y2="130" stroke="rgba(244,236,221,.5)" stroke-width="3"/>
      <circle cx="150" cy="95" r="16" fill="#e8a86a"/>
      <circle cx="90" cy="220" r="18" fill="#e8a86a"/><circle cx="90" cy="220" r="7" fill="#fff6d8"/>
      <rect x="192" y="196" width="22" height="52" rx="10" fill="#8fd0c8"/><circle cx="203" cy="214" r="6" fill="#fff6d8"/>
    </svg></div>`,
  teapot: `<div class="art" style="background:linear-gradient(180deg,#2b2244,#191430)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M110 200 a40 40 0 0 0 80 0 Z" fill="#9fc0c8"/>
      <path d="M190 205 Q215 215 210 240" stroke="rgba(143,208,200,.85)" stroke-width="5" fill="none"/>
      <path d="M95 130 A45 45 0 0 1 160 90" stroke="rgba(255,246,216,.6)" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="164" cy="88" r="7" fill="#fff6d8"/>
      <path d="M110 300 a30 30 0 0 0 60 0 Z" fill="none" stroke="#e8b98a" stroke-width="4"/>
      <circle cx="140" cy="296" r="5" fill="#e8a86a"/>
    </svg></div>`,
  glide: `<div class="art" style="background:linear-gradient(180deg,#15243c,#0b1524)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="120" cy="180" r="12" fill="#fff6d8"/>
      <circle cx="120" cy="180" r="26" fill="rgba(207,224,138,.25)"/>
      <path d="M104 172 Q92 160 84 172 M136 172 Q148 160 156 172" stroke="rgba(255,246,216,.6)" stroke-width="3" fill="none"/>
      <line x1="220" y1="40" x2="220" y2="130" stroke="#b8c89a" stroke-width="9" stroke-linecap="round"/>
      <line x1="220" y1="240" x2="220" y2="360" stroke="#b8c89a" stroke-width="9" stroke-linecap="round"/>
      <ellipse cx="220" cy="132" rx="7" ry="13" fill="#b8c89a"/><ellipse cx="220" cy="238" rx="7" ry="13" fill="#b8c89a"/>
    </svg></div>`,
  bloom: `<div class="art" style="background:linear-gradient(180deg,#1e1b3f,#121022)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <g transform="translate(105,160)">
        <ellipse rx="34" ry="16" fill="rgba(219,160,176,.85)" transform="rotate(0)"/><ellipse rx="34" ry="16" fill="rgba(219,160,176,.85)" transform="rotate(45)"/><ellipse rx="34" ry="16" fill="rgba(219,160,176,.85)" transform="rotate(90)"/><ellipse rx="34" ry="16" fill="rgba(219,160,176,.85)" transform="rotate(135)"/>
        <circle r="13" fill="#fff6d8"/>
      </g>
      <g transform="translate(210,270)">
        <ellipse rx="17" ry="8" fill="rgba(207,224,138,.85)" transform="rotate(0)"/><ellipse rx="17" ry="8" fill="rgba(207,224,138,.85)" transform="rotate(72)"/><ellipse rx="17" ry="8" fill="rgba(207,224,138,.85)" transform="rotate(144)"/>
        <circle r="7" fill="#fff6d8"/>
      </g>
    </svg></div>`,
  pinch: `<div class="art" style="background:linear-gradient(180deg,#14202c,#0a121c)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="150" cy="150" r="10" fill="#fff6d8"/>
      <circle cx="150" cy="150" r="24" fill="rgba(207,224,138,.3)"/>
      <path d="M96 260 Q120 210 142 172" stroke="rgba(232,185,138,.8)" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M204 260 Q180 210 158 172" stroke="rgba(232,185,138,.8)" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="0" y="352" width="300" height="48" fill="rgba(20,40,30,.5)"/>
    </svg></div>`,
  rainbow: `<div class="art" style="background:linear-gradient(180deg,#f4eede,#ebe0c8)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <g fill="none" stroke-linecap="round">
        <path d="M50 370 C130 340 150 250 150 200 C150 150 180 90 255 55" stroke="#1b1b3a" stroke-width="66"/>
        <path d="M50 370 C130 340 150 250 150 200 C150 150 180 90 255 55" stroke="#e8837a" stroke-width="58"/>
        <path d="M50 370 C130 340 150 250 150 200 C150 150 180 90 255 55" stroke="#e8a86a" stroke-width="46"/>
        <path d="M50 370 C130 340 150 250 150 200 C150 150 180 90 255 55" stroke="#ecd06f" stroke-width="34"/>
        <path d="M50 370 C130 340 150 250 150 200 C150 150 180 90 255 55" stroke="#9fc08a" stroke-width="22"/>
        <path d="M50 370 C130 340 150 250 150 200 C150 150 180 90 255 55" stroke="#a4b6e0" stroke-width="10"/>
      </g>
      <circle cx="52" cy="66" r="20" fill="#ecd06f"/>
      <g fill="#23234a"><circle cx="100" cy="180" r="18"/><circle cx="122" cy="170" r="21"/><circle cx="144" cy="182" r="17"/><circle cx="122" cy="190" r="18"/></g>
      <circle cx="112" cy="172" r="4" fill="#f2ecdc"/><circle cx="132" cy="172" r="4" fill="#f2ecdc"/>
      <rect x="222" y="30" width="56" height="34" rx="5" fill="#fdfaf2" stroke="#1b1b3a" stroke-width="4"/>
      <rect x="218" y="16" width="64" height="17" rx="5" fill="#23234a" stroke="#1b1b3a" stroke-width="4"/>
      <rect x="176" y="286" width="34" height="34" rx="7" fill="#ecc94b" stroke="#1b1b3a" stroke-width="4"/>
      <circle cx="193" cy="281" r="7" fill="#ecc94b" stroke="#1b1b3a" stroke-width="4"/>
      <circle cx="187" cy="299" r="2.6" fill="#1b1b3a"/><circle cx="199" cy="299" r="2.6" fill="#1b1b3a"/>
    </svg></div>`,
};

function renderSelect() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  document.querySelector("#screen-select h1").textContent = "What shall we play today?";
  const prof = store.getProfile(state.patient, state.side);

  const mk = (id, name, locked, onClick, trains) => {
    const b = document.createElement("button");
    b.className = "gcard";
    b.dataset.dwell = "1";
    b.innerHTML = CARD_ART[id] + `<div class="dwell-fill"></div>` +
      (trains ? `<div class="trains">${trains}</div>` : "") +
      `<div class="title">${name}</div>` +
      (locked ? `<div class="lock">🔒<span>Draw your circle first</span></div>` : "");
    if (!locked) b.addEventListener("click", onClick);
    wrap.appendChild(b);
    return b;
  };

  const assessBtn = mk("assess", prof ? "Your circle" : "Draw your circle", false, startAssessment);
  const gameBtns = {};
  for (const g of GAMES) {
    if (g.disabled) continue;
    gameBtns[g.id] = mk(g.id, g.name, !prof, g.id === "pong" ? renderPongModes : () => startGame(g.id, true), g.trains);
  }
  // default-first: one clearly recommended card, pre-focused so a single
  // Enter continues the flow (no assessment yet → assess; else last played
  // game; else the first game)
  const suggested = !prof ? assessBtn : (gameBtns[state.lastGameId] || Object.values(gameBtns)[0]);
  if (suggested) {
    suggested.classList.add("kbd-focus");
    suggested.insertAdjacentHTML("beforeend", `<div class="suggest">Start here</div>`);
  }
}

// Pong mode picker: shown as tiles after choosing Arc Pong
const PONG_MODES = [
  ["solo", "Solo", "You vs a gentle star"],
  ["bimanual", "Arm vs arm", "Left paddle vs right paddle"],
  ["coupled", "Both arms", "Two arms steer one paddle"],
  ["companion", "With a friend", "They play the arrow keys"],
  ["team-arms", "Team: both arms", "Both your arms vs the AI"],
  ["team-keys", "Team: with a friend", "Defend together vs the AI"],
];
function renderPongModes() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  document.querySelector("#screen-select h1").textContent = "How shall we play Pong?";
  const mk = (label, sub, onClick) => {
    const b = document.createElement("button");
    b.className = "gcard";
    b.dataset.dwell = "1";
    b.innerHTML = CARD_ART.pong + `<div class="dwell-fill"></div><div class="title">${label}<small>${sub}</small></div>`;
    b.addEventListener("click", onClick);
    wrap.appendChild(b);
    return b;
  };
  let focusBtn = null;
  for (const [id, label, sub] of PONG_MODES) {
    const b = mk(label, sub, () => {
      state.pongMode = id;
      $("in-pong").value = id;
      startGame("pong", true);
    });
    if (id === state.pongMode || (!focusBtn && id === "solo")) focusBtn = b;
  }
  mk("↩ Back", "All games", renderSelect);
  focusBtn?.classList.add("kbd-focus");   // current mode pre-focused: Enter just plays
}

/* ================= assessment ================= */
// One decision, once: if the hand was already chosen (welcome lift or staff
// drawer) the assessment starts straight at "hold still" — its own two-light
// chooser only appears when no choice has been made yet.
function startAssessment() {
  if (!state.tracker) return;
  show("stage");
  audio.startBgm("assessment");
  const a = new Assessment(state.tracker, $("canvas"), state.side, state.coachSens, { chooseHand: !state.sideChosen });
  state.current = a;
  a.start(profile => {
    audio.stopBgm();
    profile.params = initialParams(profile);
    state.side = profile.arm;               // the assessed arm drives the session
    state.sideChosen = true;
    $("in-arm").value = profile.arm;        // keep the staff drawer in sync
    store.saveProfile(state.patient, profile.arm, profile);
    audio.fanfare();
    renderSelect();
    show("screen-select");
  });
}

/* ================= game rounds ================= */
// Pong skills: therapist choice, or "auto" = level-based unlock (1 rally →
// 2 +grip → 3 +spin), levelling up on strong rounds (Zhang's choice element)
function pongSkills() {
  if (state.pongSkills === "none") return { grip: false, spin: false };
  if (state.pongSkills === "grip") return { grip: true, spin: false };
  if (state.pongSkills === "spin") return { grip: false, spin: true };
  if (state.pongSkills === "both") return { grip: true, spin: true };
  const lvl = store.getPongLevel(state.patient);
  return { grip: lvl >= 2, spin: lvl >= 3 };
}

function startGame(id, fresh) {
  const prof = store.getProfile(state.patient, state.side);
  if (!prof || !state.tracker) return;
  if (fresh) { state.roundNumber = 0; state.sessionStars = 0; state.driftStage = 1; }
  state.roundNumber++;
  state.lastGameId = id;

  const def = GAMES.find(g => g.id === id);
  const p = store.getPatient(state.patient);
  // capture-radius accessibility boost applies to play only — DDA keeps
  // adjusting the stored, unscaled radius
  const params = { ...prof.params, radius: prof.params.radius * A11Y.radiusScale };
  const game = new def.cls(state.tracker, $("canvas"), state.side, prof, params, {
    coachSens: state.coachSens, cursor: p.equippedCursor,
    tellStory: state.roundNumber === 1,
    stage: id === "drift" ? (state.driftStage || 1) : undefined,
    mode: id === "pong" ? state.pongMode
      : id === "oars" ? state.oarsMode
      : id === "ferry" ? state.ferryMode
      : undefined,
    skills: id === "pong" ? pongSkills() : undefined,
    song: id === "rhythm" ? state.song : undefined,
    tilesMode: id === "rhythm" ? state.tilesMode : undefined,
    bothArms: (id === "pong" && ["bimanual", "coupled", "team-arms"].includes(state.pongMode))
      || (id === "rhythm" && state.tilesMode === "bimanual"),
    profiles: { left: store.getProfile(state.patient, "left"), right: store.getProfile(state.patient, "right") },
  });
  state.current = game;
  show("stage");
  // Melody Tiles owns its song clock (audio.startSong inside the game);
  // everything else gets the per-game lo-fi mood (or assets/music/<id>.mp3)
  if (id !== "rhythm") audio.startBgm(id);
  game.start(onRoundEnd);
}

function onRoundEnd(round) {
  audio.stopBgm();
  round.round = state.roundNumber;

  // practice mode: free play — nothing logged, difficulty untouched
  if (A11Y.practice) {
    renderBetween(round, "Practice round. Nothing counts, just enjoy the movement.");
    show("screen-between");
    document.querySelectorAll("#screen-between .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
    $("btn-next-round").classList.add("kbd-focus");
    return;
  }

  store.logRound(state.patient, round);
  state.sessionStars += round.stars;

  const prof = store.getProfile(state.patient, state.side);
  // compensation-caused misses shouldn't raise difficulty: if many coach
  // events this round, hold instead of increasing
  let result = adjust(prof.params, round);
  if (round.compEvents.length >= 3 && result.params.rangeScale > prof.params.rangeScale) {
    result = { params: prof.params, note: "Let's keep it steady while we work on posture." };
  }
  // Pong tutorial warm-up: the measured paddle speed becomes the ball's
  // crossing time going forward (the DDA adjusts from this calibrated start)
  if (round.game === "pong" && round.pongCrossTime) result.params.lifetime = round.pongCrossTime;
  store.saveParams(state.patient, state.side, result.params);

  // rest pacing: every 4th round, or a compensation spike (fatigue proxy),
  // earns a gentle spoken + captioned break suggestion — never an auto-stop
  if (state.roundNumber % 4 === 0 || round.compEvents.length >= 4) {
    result.note += " This is a lovely moment for a short rest.";
    setTimeout(() => speak("This is a lovely moment for a short rest. Continue whenever you are ready."), 1200);
  }

  // Pong level progression (auto mode): a strong round unlocks the next skill
  if (round.game === "pong" && state.pongSkills === "auto") {
    const lvl = store.getPongLevel(state.patient);
    if (lvl < 3 && round.hitRate > 0.7 && (round.bestRally ?? 0) >= 4) {
      store.setPongLevel(state.patient, lvl + 1);
      result.note += lvl === 1
        ? " ⭐ New skill unlocked: the Grip Shot! Squeeze to catch the star, open your hand to fire it back!"
        : " ⭐ New skill unlocked: the Spin Shot! Turn your palm as you hit for topspin or backspin!";
    }
  }

  // Drift stage progression (RGS graded complexity: touch → hold → carry)
  if (round.game === "drift") {
    const st = state.driftStage || 1;
    if (round.hitRate > 0.7 && st < 3) {
      state.driftStage = st + 1;
      result.note += st === 1 ? " Next: hold your hand on the orbs to catch them!"
                              : " Next: carry each orb to its matching pool!";
    } else if (round.hitRate < 0.4 && st > 1) {
      state.driftStage = st - 1;
    }
  }

  renderBetween(round, result.note);
  show("screen-between");
  // default-first: Enter continues the session without hunting for a button
  document.querySelectorAll("#screen-between .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
  $("btn-next-round").classList.add("kbd-focus");
}

/* ================= P5 between rounds ================= */
function renderBetween(round, note) {
  const starN = round.hitRate >= 0.65 ? 3 : round.hitRate >= 0.4 ? 2 : 1;
  $("rc-stars").innerHTML = [0, 1, 2].map(i => {
    const size = i === 1 ? 64 : 52;
    const fill = i < starN ? "#e8a86a" : "rgba(27,27,58,.16)";
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><polygon points="12,2 14.9,8.6 22,9.3 16.5,14 18.3,21 12,17.3 5.7,21 7.5,14 2,9.3 9.1,8.6" fill="${fill}"/></svg>`;
  }).join("");

  const pct = Math.round(round.hitRate * 100);
  const dash = 314, off = dash * (1 - round.hitRate);
  const justRight = pct >= 50 && pct <= 78;
  $("rc-ring").innerHTML = `
    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(27,27,58,.1)" stroke-width="12"/>
    <circle cx="60" cy="60" r="50" fill="none" stroke="${justRight ? "#e8a86a" : "#c8b39a"}" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="30" fill="#c77f4a">${pct}%</text>
    <text x="60" y="78" text-anchor="middle" font-family="Nunito" font-weight="700" font-size="12" fill="rgba(27,27,58,.5)">${justRight ? "just right" : pct > 78 ? "so strong!" : "warming up"}</text>`;

  const gname = GAMES.find(g => g.id === round.game)?.name ?? "";
  const lines = [];
  if (round.game === "pong") {
    lines.push(`Longest rally: <b>${round.bestRally ?? round.hits} returns</b>.`);
    if (round.points != null && (round.points > 0 || round.aiPoints > 0))
      lines.push(`Score: <b>you ${round.points} : ${round.aiPoints} AI</b>${round.points > round.aiPoints ? ", you won! 🌟" : round.points === round.aiPoints ? ", a draw!" : ""}`);
    if (round.gripShots || round.spinShots)
      lines.push(`Trick shots: <b>${round.gripShots ? `${round.gripShots} grip ✊` : ""}${round.gripShots && round.spinShots ? " · " : ""}${round.spinShots ? `${round.spinShots} spin ↻` : ""}</b>`);
  }
  else if (round.game === "boxes") lines.push(`You carried <b>${round.boxes} crates</b> across, a fine ferry load!`);
  else if (round.game === "rainbow") {
    lines.push(`You whooshed <b>${round.cloudsPushed} clouds</b> off the rainbow and saved <b>${round.friendsSaved} friend${round.friendsSaved === 1 ? "" : "s"}</b>!`);
    if (round.jackpots) lines.push(`Jackpots reached: <b>${round.jackpots}</b> ✦ Strivealon's sky is getting brighter.`);
  }
  else if (round.game === "rhythm") lines.push(`You played <b>${round.notesHitPct}%</b> of "${round.song}", best streak <b>${round.bestCombo} notes</b>.`);
  else if (round.game === "compass") lines.push(`You lit <b>${round.hits} compass points</b> and always found your way home.`);
  else if (round.game === "echo") lines.push(`You found <b>${round.hits} echoes</b>${round.meanEchoErrSW != null ? `, on average <b>${round.meanEchoErrSW}</b> shoulder-widths from the star` : ""}.`);
  else if (round.game === "lens") lines.push(`You cleared <b>${Math.round((round.coverage ?? 0) * 100)}%</b> of the fog${round.panes > 1 ? ` across <b>${round.panes} panes</b>` : ""}.`);
  else if (round.game === "crane") lines.push(`You delivered <b>${round.delivered} crates</b>, holding the crane up <b>${Math.round((round.holdFrac ?? 0) * 100)}%</b> of the time.`);
  else if (round.game === "feather") lines.push(`<b>${round.cycles} gentle landings</b>, smooth for <b>${Math.round((round.descentSmooth ?? 0) * 100)}%</b> of the way down.`);
  else if (round.game === "buoys") lines.push(`<b>${round.hits} taps</b> between the lights, steady as a metronome.`);
  else if (round.game === "oars") lines.push(`<b>${round.crossings} crossings</b>, rowing <b>${Math.round((round.symmetry ?? 0) * 100)}%</b> in step.`);
  else if (round.game === "ferry") lines.push(`You steered through <b>${round.gates} gates</b>${round.bumps ? `, with ${round.bumps} soft bumps` : ", without a single bump"}.`);
  else if (round.game === "stars") lines.push(`You swept <b>${round.swept} falling stars</b>${round.midlineCrossed ? `, <b>${round.midlineCrossed}</b> from across the midline` : ""}.`);
  else if (round.game === "flare") lines.push(`<b>${round.lit} lanterns lit</b> from ${round.launches} launches.`);
  else if (round.game === "shelf") lines.push(`<b>${round.jarsPlaced} jars</b> up on the shelves tonight.`);
  else if (round.game === "windows") lines.push(`You lit <b>${round.windowsLit} windows</b> before dawn.`);
  else if (round.game === "sorting") lines.push(`<b>${round.correctCatches} right lanterns</b> caught${round.wrongCatches ? `, ${round.wrongCatches} slipped in` : ", not one wrong"}.`);
  else if (round.game === "teapot") lines.push(`<b>${round.turns} palm turns</b>, honey and tea in balance.`);
  else if (round.game === "glide") lines.push(`The firefly slipped through <b>${round.gatesThrough} reed gates</b>.`);
  else if (round.game === "bloom") lines.push(`You gathered <b>${round.bloomsGathered} night blooms</b>, hand shaped just right.`);
  else if (round.game === "pinch") lines.push(`<b>${round.pinched} fireflies</b> caught with two fingertips.`);
  else lines.push(`You caught <b>${round.hits} of ${round.hits + round.misses}</b> in ${gname}.`);
  lines.push(`⭐ <b>${round.stars}</b> this round · <b>${state.sessionStars}</b> today`);
  $("rc-text").innerHTML = lines.join("<br>");

  const rest = state.roundNumber % 4 === 0
    ? " You've earned a longer break. Have some water."
    : "";
  $("rc-note").textContent = note + rest;

  for (const f of document.querySelectorAll(".face")) f.classList.remove("selected");
}

document.querySelectorAll(".face").forEach(f => {
  f.dataset.dwell = "1";
  f.addEventListener("click", () => {
    document.querySelectorAll(".face").forEach(x => x.classList.remove("selected"));
    f.classList.add("selected");
    store.logFeel(state.patient, f.dataset.feel);
    if (f.dataset.feel === "hurts")
      $("rc-note").textContent = "Thank you for telling us. Let's stop here for today and rest that arm.";
    if (f.dataset.feel === "tired")
      $("rc-note").textContent = "A little tired is okay. One gentler round, or finish for today?";
  });
});

$("btn-next-round").dataset.dwell = "1";
$("btn-finish").dataset.dwell = "1";
$("btn-next-round").addEventListener("click", () => startGame(state.lastGameId, false));
$("btn-finish").addEventListener("click", () => { renderCollections(); show("screen-collections"); });

/* ================= P7 collections ================= */
const DECOR = [
  { id: "windmill", name: "Windmill", price: 40 },
  { id: "bridge", name: "Footbridge", price: 60 },
  { id: "gardens", name: "Night gardens", price: 90 },
];

function renderCollections() {
  const p = store.getPatient(state.patient);
  $("coll-stars").textContent = p.stars;
  const grid = $("coll-grid");
  grid.innerHTML = "";

  const add = (artHtml, name, stateHtml, onClick) => {
    const b = document.createElement("button");
    b.className = "citem";
    b.innerHTML = `<div class="cart">${artHtml}</div><div class="crow"><span class="cname">${name}</span>${stateHtml}</div>`;
    if (onClick) b.addEventListener("click", onClick);
    grid.appendChild(b);
  };

  // constellation creatures earned by play
  for (const c of p.unlocks.creatures) {
    add(`<svg viewBox="0 0 120 120" style="position:absolute;inset:0;width:100%;height:100%;background:radial-gradient(circle at 50% 45%,#4a3f78,#20204a)">
      <g stroke="#fff6d8" stroke-width="2" fill="none"><path d="M30 40 L55 65 L85 45 L95 80 L55 65 L60 95"/></g>
      <g fill="#fff6d8"><circle cx="30" cy="40" r="4"/><circle cx="55" cy="65" r="4"/><circle cx="85" cy="45" r="4"/><circle cx="95" cy="80" r="4"/><circle cx="60" cy="95" r="4"/></g></svg>`,
      c, `<span class="cstate">Owned</span>`);
  }
  if (!p.unlocks.creatures.length)
    add(`<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,#4a3f78,#20204a);display:flex;align-items:center;justify-content:center;font-size:34px;opacity:.5">✦</div>`,
      "Constellation creatures", `<span class="cstate" style="color:rgba(244,236,221,.5)">Play to find them</span>`);

  // lantern sky
  add(`<div style="position:absolute;inset:0;background:linear-gradient(180deg,#1b1b3a,#3a3168)">
    ${[24, 60, 96].map((x, i) => `<div style="position:absolute;left:${x}px;top:${[30, 52, 24][i]}px;width:${16 - i * 2}px;height:${20 - i * 2}px;border-radius:40% 40% 50% 50%;background:radial-gradient(circle,#ffd98a,#e8a86a);box-shadow:0 0 12px rgba(232,168,106,.6)"></div>`).join("")}
    </div>`,
    "Lantern sky", `<span class="cstate">${p.lanterns} released</span>`);

  // village decor (spend stars)
  for (const d of DECOR) {
    const owned = p.unlocks.decor.includes(d.id);
    add(`<div style="position:absolute;inset:0;background:linear-gradient(180deg,#4a3550,#2a2038);display:flex;align-items:flex-end;gap:5px;padding:0 18px 14px">
       <div style="width:26px;height:44px;background:#16121f"></div><div style="width:20px;height:60px;background:#16121f"></div><div style="width:30px;height:38px;background:#16121f"></div></div>`,
      d.name,
      owned ? `<span class="cstate">Owned</span>` : `<span class="cprice">⭐ ${d.price}</span>`,
      owned ? null : () => { if (store.buy(state.patient, "decor", d.id, d.price)) audio.hit(); renderCollections(); });
  }

  // comet cursor
  const cometOwned = p.unlocks.cursor.includes("comet");
  const equipped = p.equippedCursor === "comet";
  add(`<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#2f5560,#14243f)">
     <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,#fff,#9fc0c8);box-shadow:0 0 22px 7px rgba(200,230,235,.7)"></div></div>`,
    "Comet cursor",
    cometOwned ? `<span class="cstate">${equipped ? "In use" : "Use"}</span>` : `<span class="cprice">⭐ 25</span>`,
    () => {
      if (cometOwned) store.equipCursor(state.patient, equipped ? "firefly" : "comet");
      else if (store.buy(state.patient, "cursor", "comet", 25)) audio.hit();
      renderCollections();
    });
}

$("btn-coll-back").addEventListener("click", () => { renderSelect(); show("screen-select"); });

/* ================= S3 staff profile ================= */
function arcPath(cx, cy, r, a0, a1) {
  // a in degrees, 0 = left horizon, 90 = up, 180 = right horizon
  const pt = a => [cx - r * Math.cos(a * Math.PI / 180), cy - r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function renderProfile() {
  const p = store.getPatient(state.patient);
  const arms = ["left", "right"];
  const prof = p.profiles[state.side];

  $("prof-who").textContent = "Patient " + state.patient;
  const days = Math.max(1, Math.round((Date.now() - new Date(p.created)) / 86400000));
  $("prof-sub").textContent = `Training arm: ${state.side} · Day ${days}`;
  $("prof-armchips").innerHTML = arms.map(a =>
    `<span class="chip ${a === state.side ? "amber" : "faint"}" style="margin-right:8px">${a[0].toUpperCase()}${p.profiles[a] ? " ✓" : " —"}</span>`).join("");

  if (prof) {
    const d = new Date(prof.date);
    $("prof-lastass").textContent = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const stale = (Date.now() - d.getTime()) / 86400000 > 7;
    $("prof-assstate").textContent = stale ? "Re-assess due" : "Up to date";
    $("prof-assstate").className = "chip " + (stale ? "warn" : "ok");
  } else {
    $("prof-lastass").textContent = "—";
    $("prof-assstate").textContent = "Not assessed";
    $("prof-assstate").className = "chip warn";
  }

  // --- ROM protractor (1d) ---
  let svg = `<g stroke="rgba(27,27,58,.12)" stroke-width="1">
    <line x1="200" y1="212" x2="200" y2="44"/><line x1="200" y1="212" x2="40" y2="212"/><line x1="200" y1="212" x2="360" y2="212"/>
    <line x1="200" y1="212" x2="85.7" y2="97.4"/><line x1="200" y1="212" x2="314.3" y2="97.4"/></g>
    <path d="${arcPath(200, 212, 160, 0, 180)}" fill="none" stroke="rgba(27,27,58,.1)" stroke-width="3"/>`;
  const hist = p.history[state.side].slice(-2);
  hist.forEach((h, i) => {
    svg += `<path d="${arcPath(200, 212, 140 + i * 6, h.arcMinDeg, h.arcMaxDeg)}" fill="none" stroke="rgba(232,168,106,${0.18 + i * 0.1})" stroke-width="9" stroke-linecap="round"/>`;
  });
  const other = state.side === "left" ? "right" : "left";
  const oProf = p.profiles[other];
  if (oProf) svg += `<path d="${arcPath(200, 212, 155, oProf.arcMinDeg, oProf.arcMaxDeg)}" fill="none" stroke="rgba(27,27,58,.35)" stroke-width="11" stroke-linecap="round"/>`;
  if (prof) svg += `<path d="${arcPath(200, 212, 150, prof.arcMinDeg, prof.arcMaxDeg)}" fill="none" stroke="#e8a86a" stroke-width="13" stroke-linecap="round"/>`;
  svg += `<circle cx="200" cy="212" r="6" fill="#1b1b3a"/>
    <text x="30" y="226" font-size="12" font-weight="700" fill="rgba(27,27,58,.55)" font-family="Nunito">0°</text>
    <text x="182" y="34" font-size="12" font-weight="700" fill="rgba(27,27,58,.55)" font-family="Nunito">90°</text>
    <text x="350" y="226" font-size="12" font-weight="700" fill="rgba(27,27,58,.55)" font-family="Nunito">180°</text>`;
  $("prof-arc").innerHTML = svg;

  // real-world reach: SW × therapist-measured shoulder width (staff drawer)
  const maxEnv = prof ? Math.max(...prof.envelope) : null;
  const reachLg = maxEnv
    ? `<div class="lg"><span class="dot" style="background:#9fc08a"></span>Longest reach
         <span class="val" style="color:#4a7a3a;margin-left:6px">${p.shoulderCm
           ? Math.round(maxEnv * p.shoulderCm) + " cm"
           : maxEnv.toFixed(2) + " SW <small style='font-weight:600;opacity:.7'>(set shoulder cm in Staff for cm)</small>"}</span></div>`
    : "";
  $("prof-arc-legend").innerHTML =
    `<div class="lg"><span class="dot" style="background:#e8a86a"></span>Trained (${state.side[0].toUpperCase()})
       <span class="val" style="color:#c77f4a;margin-left:6px">${prof ? prof.arcMinDeg + "°–" + prof.arcMaxDeg + "°" : "—"}</span></div>
     <div class="lg"><span class="dot" style="background:rgba(27,27,58,.35)"></span>Other (${other[0].toUpperCase()})
       <span class="val" style="color:rgba(27,27,58,.6);margin-left:6px">${oProf ? oProf.arcMinDeg + "°–" + oProf.arcMaxDeg + "°" : "—"}</span></div>` + reachLg;

  // --- grasp map ---
  let gsvg = `<path d="${arcPath(200, 212, 150, prof ? prof.arcMinDeg : 20, prof ? prof.arcMaxDeg : 160)}" fill="none" stroke="rgba(232,168,106,.5)" stroke-width="4"/>`;
  if (prof) {
    for (const g of prof.grasp) {
      const a = g.deg === 150 ? 150 : g.deg === 90 ? 90 : 30;   // y-up degrees ≈ protractor degrees
      const x = 200 - 150 * Math.cos(a * Math.PI / 180), y = 212 - 150 * Math.sin(a * Math.PI / 180);
      if (g.ok) gsvg += `<circle cx="${x}" cy="${y}" r="22" fill="rgba(159,192,138,.25)" stroke="#9fc08a" stroke-width="3"/>
        <path d="M${x - 8} ${y} l6 7 l12 -14" stroke="#4a7a3a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <text x="${x - 18}" y="${y + 44}" font-size="11" font-weight="700" fill="rgba(27,27,58,.6)" font-family="Nunito">${Math.round(g.stability * 100)}% steady</text>
        <text x="${x - 18}" y="${y + 58}" font-size="11" font-weight="700" fill="${g.squeeze ? "#4a7a3a" : "#b8892a"}" font-family="Nunito">${g.squeeze ? "✊ grasped" : "hold only"}</text>`;
      else gsvg += `<circle cx="${x}" cy="${y}" r="22" fill="rgba(181,80,58,.18)" stroke="#b5503a" stroke-width="3"/>
        <g stroke="#b5503a" stroke-width="3.5" stroke-linecap="round"><line x1="${x - 7}" y1="${y - 7}" x2="${x + 7}" y2="${y + 7}"/><line x1="${x + 7}" y1="${y - 7}" x2="${x - 7}" y2="${y + 7}"/></g>
        <text x="${x - 16}" y="${y + 44}" font-size="11" font-weight="700" fill="#b5503a" font-family="Nunito">missed</text>`;
    }
  }
  $("prof-grasp").innerHTML = gsvg;

  // --- KPIs with sparklines ---
  const sessions = p.sessions.filter(s => s.arm === state.side);
  const last = sessions.slice(-8);
  const spark = vals => {
    if (!vals.length) return "";
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const pts = vals.map((v, i) => `${2 + i * (66 / Math.max(1, vals.length - 1))},${20 - ((v - min) / span) * 14}`).join(" ");
    return `<svg viewBox="0 0 70 24" width="70" height="24"><polyline points="${pts}" fill="none" stroke="#9fc08a" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  };
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const kpis = [
    ["Success rate", Math.round(mean(last.map(s => s.hitRate)) * 100) + "%", spark(last.map(s => s.hitRate))],
    ["Arc coverage", Math.round(mean(last.map(s => s.meanReachFrac)) * 100) + "%", spark(last.map(s => s.meanReachFrac))],
    ["Rounds played", sessions.length, spark(last.map((_, i) => i))],
    ["Stars lifetime", p.starsLifetime, ""],
  ];
  $("prof-kpis").innerHTML = kpis.map(([t, v, s]) =>
    `<div class="pcard"><div class="psub">${t}</div><div class="kpi"><span class="v">${v}</span>${s}</div></div>`).join("");

  // --- compensation summary ---
  const evs = sessions.slice(-6).flatMap(s => s.compEvents || []);
  const prevEvs = sessions.slice(-12, -6).flatMap(s => s.compEvents || []);
  const NAMES = { lean: "Trunk lean", hike: "Shoulder hike", rotation: "Trunk rotation", tilt: "Trunk tilt" };
  $("prof-comp").innerHTML = Object.entries(NAMES).map(([k, label]) => {
    const n = evs.filter(e => e.type === k);
    const pn = prevEvs.filter(e => e.type === k);
    const mins = (n.reduce((s, e) => s + e.durationMs, 0) / 60000).toFixed(1);
    const trend = n.length < pn.length ? `<span class="trend-down">↓</span>` : n.length > pn.length ? `<span class="trend-up">↑</span>` : "";
    return `<div class="comp-row"><span>${label}</span><span class="cv">${n.length} · ${mins} min ${trend}</span></div>`;
  }).join("");

  // --- session log ---
  const rows = sessions.slice(-12).reverse().map(s =>
    `<tr><td>${new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
     <td>${GAMES.find(g => g.id === s.game)?.name ?? s.game}</td>
     <td>${s.round ?? "—"}</td>
     <td style="color:${s.hitRate >= 0.5 && s.hitRate <= 0.78 ? "#4a7a3a" : "#b8892a"}">${Math.round(s.hitRate * 100)}%</td>
     <td>${Math.round(s.meanReachFrac * 100)}%</td></tr>`).join("");
  $("prof-log").innerHTML = `<thead><tr><th>Date</th><th>Game</th><th>Round</th><th>Success</th><th>Arc cov.</th></tr></thead><tbody>${rows || "<tr><td colspan=5>No rounds yet</td></tr>"}</tbody>`;
}

$("btn-prof-back").addEventListener("click", () => { renderSelect(); show("screen-select"); });
$("btn-prof-session").addEventListener("click", () => { renderSelect(); show("screen-select"); });
$("btn-prof-assess").addEventListener("click", startAssessment);
$("btn-prof-export").addEventListener("click", () => {
  const blob = new Blob([store.exportPatient(state.patient)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rehabsuite-${state.patient}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ================= staff drawer ================= */
// game-specific settings only show while that game is on stage; on the menus,
// all groups are visible so staff can configure a game before starting it
function updateDrawer() {
  const active = state.screen === "stage" ? state.current?.id : null;
  document.querySelectorAll(".dwr-game").forEach(d => {
    const disabled = GAMES.find(g => g.id === d.dataset.for)?.disabled;
    d.classList.toggle("hidden", disabled || (!!active && d.dataset.for !== active));
  });
  $("in-shoulder").value = store.getPatient(state.patient).shoulderCm ?? "";
}
$("btn-staff").addEventListener("click", () => { updateDrawer(); $("drawer").classList.toggle("hidden"); });

// live tracking + grasp readout while the drawer is open (tuning aid)
setInterval(() => {
  const t = state.tracker;
  if (!t || $("drawer").classList.contains("hidden")) return;
  if (!t.trackingOk) { $("camstate").textContent = "Camera: no one in view"; $("camstate").className = "bad"; return; }
  const curl = t.handCurl(state.side);
  const g = curl ?? t.grip(state.side);
  let src;
  if (curl != null) src = "hand model";
  else {
    const cal = t.gripCal?.[state.side];
    src = "pose fallback" + (cal && cal.hi - cal.lo > 0.10 ? "" : ", open & close to calibrate");
  }
  $("camstate").textContent = `Camera: tracking · ${state.side} hand ${t.handClosed(state.side) ? "CLOSED ✊" : "open ✋"}`
    + (g != null ? ` · ${g.toFixed(2)} (${src})` : " · fingers not visible");
  $("camstate").className = "ok";
}, 250);
$("btn-drawer-close").addEventListener("click", () => $("drawer").classList.add("hidden"));
$("in-patient").addEventListener("input", e => {
  state.patient = (e.target.value || "guest").trim();
  $("in-shoulder").value = store.getPatient(state.patient).shoulderCm ?? "";
  loadSettings(state.patient);
});
$("in-shoulder").addEventListener("change", e => store.setShoulderCm(state.patient, parseFloat(e.target.value)));
$("in-arm").addEventListener("change", e => { state.side = e.target.value; state.sideChosen = true; });
// camera source is picked once at boot (webcam + MediaPipe vs ZED bridge),
// so changing it reloads the app
$("in-camera").value = localStorage.getItem("strive-cam-source") || "auto";
$("in-camera").addEventListener("change", e => {
  localStorage.setItem("strive-cam-source", e.target.value);
  location.reload();
});

// ---- Comfort (accessibility) controls: per-patient, persisted ----
function syncComfortControls() {
  const s = store.getSettings(state.patient);
  $("in-captions").value = s.captions ? "on" : "off";
  $("in-dwell").value = String(s.dwellMs);
  $("in-radius").value = String(s.radiusScale);
  $("in-squeeze").value = s.squeezeEase;
  $("in-contrast").value = s.contrast ? "on" : "off";
  $("in-calm").value = s.calm ? "on" : "off";
  $("in-tscale").value = String(s.textScale);
  $("in-practice").value = s.practice ? "on" : "off";
  $("in-field").value = s.field;
  $("in-fieldmode").value = s.fieldMode;
  $("in-volvoice").value = s.volVoice;
  $("in-volmusic").value = s.volMusic;
  $("in-volfx").value = s.volFx;
  state.tracker?.setSqueezeEase?.(s.squeezeEase);
}
$("in-captions").addEventListener("change", e => saveSetting({ captions: e.target.value === "on" }));
$("in-dwell").addEventListener("change", e => saveSetting({ dwellMs: +e.target.value }));
$("in-radius").addEventListener("change", e => saveSetting({ radiusScale: +e.target.value }));
$("in-squeeze").addEventListener("change", e => saveSetting({ squeezeEase: e.target.value }));
$("in-contrast").addEventListener("change", e => saveSetting({ contrast: e.target.value === "on" }));
$("in-calm").addEventListener("change", e => saveSetting({ calm: e.target.value === "on" }));
$("in-tscale").addEventListener("change", e => saveSetting({ textScale: +e.target.value }));
$("in-practice").addEventListener("change", e => saveSetting({ practice: e.target.value === "on" }));
$("in-field").addEventListener("change", e => saveSetting({ field: e.target.value }));
$("in-fieldmode").addEventListener("change", e => saveSetting({ fieldMode: e.target.value }));
$("in-volvoice").addEventListener("change", e => saveSetting({ volVoice: +e.target.value }));
$("in-volmusic").addEventListener("change", e => saveSetting({ volMusic: +e.target.value }));
$("in-volfx").addEventListener("change", e => saveSetting({ volFx: +e.target.value }));
$("in-coach").addEventListener("change", e => { state.coachSens = e.target.value; });
$("in-pong").addEventListener("change", e => { state.pongMode = e.target.value; });
$("in-oars").addEventListener("change", e => { state.oarsMode = e.target.value; });
$("in-ferry").addEventListener("change", e => { state.ferryMode = e.target.value; });
$("in-pongskills").addEventListener("change", e => { state.pongSkills = e.target.value; });
$("in-song").addEventListener("change", e => { state.song = e.target.value; });
$("in-tiles").addEventListener("change", e => { state.tilesMode = e.target.value; });

// song picker, sorted easy → hard with difficulty stars
$("in-song").innerHTML = [...SONGS]
  .sort((a, b) => a.difficulty - b.difficulty)
  .map(s => `<option value="${s.id}">${"★".repeat(s.difficulty)} ${s.name}</option>`)
  .join("");
$("btn-drawer-assess").addEventListener("click", () => { $("drawer").classList.add("hidden"); startAssessment(); });
$("btn-drawer-profile").addEventListener("click", () => { $("drawer").classList.add("hidden"); renderProfile(); show("screen-profile"); });
$("btn-drawer-collections").addEventListener("click", () => { $("drawer").classList.add("hidden"); renderCollections(); show("screen-collections"); });

$("btn-quit").addEventListener("click", () => {
  state.current?.stop();
  audio.stopBgm();
  document.getElementById("cue").classList.add("hidden");
  document.getElementById("paused").classList.add("hidden");
  renderSelect();
  show("screen-select");
});

/* ================= menu keyboard navigation ================= */
// Menus are mouse + keyboard driven (hand-cursor dwell selection removed by
// request): arrow keys move the highlight through the [data-dwell] elements
// of the current menu screen, Enter or Space selects, mouse clicks work as
// always. Right/Down = next, Left/Up = previous, wrapping around.
function kbdTargets() {
  return [...$(state.screen).querySelectorAll("[data-dwell]")]
    .filter(el => el.offsetParent !== null);   // visible only
}
addEventListener("keydown", e => {
  if (!["screen-select", "screen-between", "screen-collections"].includes(state.screen)) return;
  const els = kbdTargets();
  if (!els.length) return;
  const cur = els.findIndex(el => el.classList.contains("kbd-focus"));
  let nx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") nx = (cur + 1) % els.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nx = cur <= 0 ? els.length - 1 : cur - 1;
  else if ((e.key === "Enter" || e.key === " ") && cur >= 0) { e.preventDefault(); els[cur].click(); return; }
  else return;
  e.preventDefault();
  els.forEach(el => el.classList.remove("kbd-focus"));
  els[nx].classList.add("kbd-focus");
  els[nx].scrollIntoView?.({ block: "nearest" });
});

/* ================= boot ================= */
show("screen-login");
loadSettings(state.patient);
boot().then(() => { state.tracker?.setSqueezeEase?.(A11Y.squeezeEase); watchWelcome(); });

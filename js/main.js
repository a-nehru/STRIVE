import { Tracker } from "./tracker.js";
import { Assessment } from "./assessment.js";
import { GAMES } from "./games.js";
import { SONGS } from "./songs.js";
import { initialParams, adjust } from "./dda.js";
import { drawBody } from "./engine.js";
import { store } from "./storage.js";
import { audio } from "./audio.js";
import { A11Y, applySettings, speakLine } from "./a11y.js";
import { probeMail, sendMail, mailTarget, mailReady, diagnostics, progressReport } from "./mail.js";

const $ = id => document.getElementById(id);
const SCREENS = ["screen-login", "screen-welcome", "screen-select", "stage", "screen-between", "screen-romcompare", "screen-collections", "screen-profile"];

const state = {
  tracker: null,
  side: "right",
  sideChosen: false,   // true once the patient (welcome lift) or staff (drawer) picked a hand — asked once, never re-asked
  patient: "guest",
  coachSens: "gentle",
  pongMode: "solo",
  // "auto" follows the level unlock (1 rally -> 2 +grip -> 3 +spin). It used
  // to default to "both", which handed a brand-new patient the Grip Shot in
  // round 1: squeezing as the ball arrives CATCHES it and pins it to the
  // paddle until the hand opens, which without warning just reads as the ball
  // sticking to your hand. Staff can still force any combination.
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
  // a new person at the camera: forget whoever the tracker was following, so
  // the body lock re-acquires instead of holding on to the last participant
  state.tracker?.relock();
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

  // Fixed-size mini mirror: the skeleton is drawn into a small frame in the
  // lower-right corner at a constant scale (shoulders span a fixed fraction
  // of the frame), so sitting closer or farther never changes its drawn size.
  let mirK = null;
  const mirrorBox = c => {
    const h = Math.round(c.height * 0.28), w = Math.round(h * 0.92);
    return { x: c.width - w - 24, y: c.height - h - 24, w, h };
  };
  const mirrorMap = (t, c, box) => {
    const p = t.pts;
    const A = t._videoToPx(p.shL.x, p.shL.y, c), B = t._videoToPx(p.shR.x, p.shR.y, c);
    const shw = Math.max(1, Math.hypot(A.x - B.x, A.y - B.y));
    const kNow = (box.w * 0.42) / shw;
    mirK = mirK == null ? kNow : mirK + (kNow - mirK) * 0.15;   // gentle, no size jumps
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const ax = box.x + box.w / 2, ay = box.y + box.h * 0.34;
    const k = mirK;
    return { k, map: px => ({ x: ax + (px.x - mid.x) * k, y: ay + (px.y - mid.y) * k }) };
  };
  const frameMirror = (ctx, box, framed) => {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 18);
    ctx.fillStyle = "rgba(16,16,40,0.5)"; ctx.fill();
    ctx.strokeStyle = framed ? "rgba(159,192,138,0.6)" : "rgba(232,168,106,0.55)";
    ctx.lineWidth = 3;
    if (!framed) ctx.setLineDash([10, 8]);   // dash mirrors the skeleton's state
    ctx.stroke();
    ctx.restore();
  };
  const clipMirror = (ctx, box) => {
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 18);
    ctx.clip();
  };

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
    const box = mirrorBox(c);
    frameMirror(ctx, box, framed);
    let mm = null;
    if (t.trackingOk) {
      mm = mirrorMap(t, c, box);
      ctx.save();
      clipMirror(ctx, box);
      drawBody(ctx, c, t, { framed, map: mm.map, scale: mm.k });
      ctx.restore();
    }

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
        let hp = t.palmPx(s, c);
        if (hp && mm) hp = mm.map(hp);
        if (hp) {
          ctx.save();
          clipMirror(ctx, box);
          ctx.strokeStyle = "#fff2c2"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(hp.x, hp.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU2 * Math.min(1, prog)); ctx.stroke();
          ctx.fillStyle = "rgba(244,236,221,0.9)";
          ctx.font = "800 15px Nunito, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(s === "left" ? "Left hand" : "Right hand", hp.x, hp.y - 30);
          ctx.restore();
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
  sling: `<div class="art" style="background:linear-gradient(180deg,#2a2b55,#161636)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <rect x="0" y="318" width="300" height="82" fill="rgba(90,110,90,.35)"/>
      <line x1="0" y1="318" x2="300" y2="318" stroke="#9fc08a" stroke-width="4"/>
      <rect x="60" y="270" width="34" height="48" rx="5" fill="#c9a06a"/>
      <rect x="60" y="222" width="34" height="48" rx="5" fill="#b8905c"/>
      <g fill="#6a5f86"><circle cx="66" cy="200" r="15"/><circle cx="90" cy="202" r="13"/><circle cx="78" cy="188" r="17"/></g>
      <circle cx="72" cy="185" r="3.5" fill="#1b1b3a"/><circle cx="86" cy="185" r="3.5" fill="#1b1b3a"/>
      <path d="M232 318 L232 250" stroke="#8a6a44" stroke-width="9" stroke-linecap="round"/>
      <path d="M222 250 L268 288 L242 250" fill="none" stroke="#e8a86a" stroke-width="6" stroke-linecap="round"/>
      <circle cx="268" cy="288" r="12" fill="#fff6d8"/>
      <path d="M232 246 Q160 150 96 196" fill="none" stroke="rgba(255,246,216,.4)"
        stroke-width="3" stroke-dasharray="4 8"/>
    </svg></div>`,
  rgs: `<div class="art" style="background:linear-gradient(180deg,#2b2c56,#15152f)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <g stroke="rgba(244,236,221,.18)" stroke-width="2">
        <line x1="150" y1="70" x2="40" y2="300"/><line x1="150" y1="70" x2="110" y2="300"/>
        <line x1="150" y1="70" x2="190" y2="300"/><line x1="150" y1="70" x2="260" y2="300"/>
      </g>
      <circle cx="150" cy="120" r="7" fill="#c8b3d9"/>
      <circle cx="196" cy="196" r="13" fill="#9fc08a"/>
      <circle cx="150" cy="286" r="26" fill="#e8a86a"/>
      <path d="M104 300 q46 40 92 0" fill="none" stroke="#9fc08a" stroke-width="7" stroke-linecap="round"/>
      <text x="150" y="368" text-anchor="middle" font-family="Nunito" font-size="26" font-weight="800"
        fill="rgba(244,236,221,.55)">both hands</text>
    </svg></div>`,
  dots: `<div class="art" style="background:radial-gradient(circle at 50% 45%,#2f2c58,#15152f)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M150 96 L196 226 L86 146 L214 146 L104 226 Z" fill="none" stroke="#e8a86a" stroke-width="5"
        stroke-linejoin="round" opacity=".75"/>
      <circle cx="150" cy="96" r="11" fill="#fff6d8"/>
      <circle cx="196" cy="226" r="8" fill="rgba(159,192,138,.9)"/>
      <circle cx="86" cy="146" r="8" fill="rgba(159,192,138,.9)"/>
      <circle cx="214" cy="146" r="8" fill="rgba(244,236,221,.45)"/>
      <circle cx="104" cy="226" r="8" fill="rgba(244,236,221,.45)"/>
      <text x="150" y="316" text-anchor="middle" font-family="Nunito" font-size="30" font-weight="800"
        fill="rgba(244,236,221,.55)">1 . 2 . 3</text>
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
      (locked ? `<div class="lock">🔒<span>Measure your reach first</span></div>` : "");
    if (!locked) b.addEventListener("click", onClick);
    wrap.appendChild(b);
    return b;
  };

  // a saved ROM stands: this card only measures what is missing, and says
  // "Re-measure" when the press would deliberately replace stored values
  const measured = store.getProfile(state.patient, "left") && store.getProfile(state.patient, "right");
  const assessBtn = mk("assess", measured ? "Re-measure" : "Measure your reach", false,
    () => startAssessment({ force: !!measured }));
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
  ["duo", "Two players", "Both of you tracked by the camera"],
];

// Two-player Pong needs a ZED bridge streaming two seats: one webcam pose
// model only ever reports a single body, so the mode is offered but explains
// itself rather than failing silently mid-round.
function duoAvailable() {
  return state.tracker?.source === "zed";
}
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
    const b = mk(label, id === "duo" && !duoAvailable() ? "Needs the ZED camera" : sub, () => {
      state.pongMode = id;
      $("in-pong").value = id;
      if (id === "duo") { renderDuoSetup(); return; }   // ask who, and which arms
      startGame("pong", true);
    });
    if (id === "duo" && !duoAvailable()) b.classList.add("locked");
    if (id === state.pongMode || (!focusBtn && id === "solo")) focusBtn = b;
  }
  mk("↩ Back", "All games", renderSelect);
  focusBtn?.classList.add("kbd-focus");   // current mode pre-focused: Enter just plays
}

// Two-player setup: who is player 2, and the arm each of them plays with.
// Both sides are chosen here and fixed for the round — the paddle follows the
// seat, never "whichever arm is currently up", so nothing swaps mid-rally.
function renderDuoSetup() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  const h1 = document.querySelector("#screen-select h1");
  h1.textContent = "Who is playing together?";

  if (!duoAvailable()) {
    wrap.innerHTML = `<p class="hint">Two-player Pong needs the ZED camera running
      with two seats: start it with <code>python tools/zed_bridge.py --bodies 2</code>,
      then reload. A single webcam can only see one person at a time.</p>`;
    const back = document.createElement("button");
    back.className = "gcard"; back.dataset.dwell = "1";
    back.innerHTML = CARD_ART.pong + `<div class="dwell-fill"></div><div class="title">↩ Back<small>Pong modes</small></div>`;
    back.addEventListener("click", renderPongModes);
    wrap.appendChild(back);
    back.classList.add("kbd-focus");
    return;
  }

  const others = store.listPatients()
    .map(p => p.name).filter(n => n !== state.patient && n !== "guest");
  state.duo = state.duo || { p2: others[0] || null, p1Side: state.side, p2Side: state.side };
  state.duo.p1Side = state.side;

  const row = (label, html) => `<div class="duo-row"><span>${label}</span>${html}</div>`;
  const sideSel = (id, val) => `<select id="${id}" data-dwell="1">
      <option value="left"${val === "left" ? " selected" : ""}>Left arm</option>
      <option value="right"${val === "right" ? " selected" : ""}>Right arm</option>
    </select>`;
  wrap.innerHTML = `<div class="duo-setup">
    ${row(`${state.patient} plays with`, sideSel("duo-p1side", state.duo.p1Side))}
    ${row("Player 2", `<select id="duo-p2" data-dwell="1">
        ${others.map(n => `<option value="${n}"${n === state.duo.p2 ? " selected" : ""}>${n}</option>`).join("")}
        <option value="">Guest (full range)</option>
      </select>`)}
    ${row("Player 2 plays with", sideSel("duo-p2side", state.duo.p2Side))}
    <p class="hint">Stand side by side, facing the camera. The camera keeps each
      of you on your own paddle for the whole round. If someone steps out, their
      paddle waits for them.</p>
  </div>`;

  const play = document.createElement("button");
  play.className = "gcard"; play.dataset.dwell = "1";
  play.innerHTML = CARD_ART.pong + `<div class="dwell-fill"></div><div class="title">Play<small>Start the rally</small></div>`;
  play.addEventListener("click", () => {
    state.side = $("duo-p1side").value;
    $("in-arm").value = state.side;
    state.duo.p1Side = state.side;
    state.duo.p2 = $("duo-p2").value || null;
    state.duo.p2Side = $("duo-p2side").value;
    startGame("pong", true);
  });
  wrap.appendChild(play);

  const back = document.createElement("button");
  back.className = "gcard"; back.dataset.dwell = "1";
  back.innerHTML = CARD_ART.pong + `<div class="dwell-fill"></div><div class="title">↩ Back<small>Pong modes</small></div>`;
  back.addEventListener("click", renderPongModes);
  wrap.appendChild(back);

  play.classList.add("kbd-focus");
}

/* ================= assessment ================= */
// BOTH arms, left then right, with nothing to choose. Asking a patient which
// arm to measure is a decision they should not have to make and a value the
// suite needs for both sides anyway — the unaffected arm is the comparison
// the therapist reads the affected one against.
//
// A stored ROM is REUSED, never redone: an arm that already has a profile is
// skipped and its saved measurements stand, so nobody re-measures at the
// start of every session. "Re-measure" (staff drawer / profile screen) is the
// deliberate way to replace them, and it is the only thing that discards a
// stored ROM — the old one is kept in history either way.
const ASSESS_ORDER = ["left", "right"];

// opts.arms  — which arms to consider (defaults to both, in order)
// opts.force — redo them even when a profile is already on file
//
// Redoing ONE arm is the common case, not both: range changes on the affected
// side while the other stays put, and making a therapist sit a patient
// through six minutes to refresh three of them is how a re-measure stops
// happening at all. Each arm is stored separately, so redoing one leaves the
// other exactly as it was (and the replaced one still goes to history).
function startAssessment(opts = {}) {
  if (!state.tracker) return;
  const force = !!opts.force;
  const arms = opts.arms?.length ? opts.arms : ASSESS_ORDER;
  const todo = arms.filter(arm => force || !store.getProfile(state.patient, arm));
  if (!todo.length) {
    // everything asked for is already on file: say so plainly rather than
    // silently doing nothing, and go where the patient wanted to go
    speak("Those measurements are already saved. Nothing to redo.");
    renderSelect();
    show("screen-select");
    return;
  }
  show("stage");
  audio.startBgm("assessment");
  runAssessmentArm(todo, 0);
}

function runAssessmentArm(todo, i) {
  const arm = todo[i];
  const a = new Assessment(state.tracker, $("canvas"), arm, state.coachSens, {
    chooseHand: false,                     // never asked: the order is fixed
    label: `${arm === "left" ? "Left" : "Right"} arm — ${i + 1} of ${todo.length}`,
  });
  state.current = a;
  a.start(profile => {
    profile.params = initialParams(profile);
    store.saveProfile(state.patient, profile.arm, profile);
    if (i + 1 < todo.length) {
      audio.note(5);
      runAssessmentArm(todo, i + 1);
      return;
    }
    audio.stopBgm();
    // the trained side is the one the staff drawer says; measuring both no
    // longer picks it, so an existing choice is left exactly as it was
    state.sideChosen = true;
    $("in-arm").value = state.side;
    audio.fanfare();
    // what actually changed, before anyone goes back to playing: a
    // re-measure that never shows you the difference is just a delay
    renderRomCompare(todo);
    show("screen-romcompare");
    $("btn-rom-done").classList.add("kbd-focus");
  });
}

/* ---------- assessment result: previous vs current ---------- */
// The point of a re-measure is the comparison, so it is shown before anything
// else happens. First time round there is nothing to compare against and the
// card simply reads as "this is your baseline" — never as a missing value.

// the measured shape, drawn from the 16-bin envelope. Previous and current
// share one scale, or a shape that grew would look identical to one that did
// not.
const TAU_UI = Math.PI * 2;
function envPath(env, scale, cx, cy) {
  if (!env?.length) return "";
  return env.map((r, i) => {
    const th = (i + 0.5) / env.length * TAU_UI;
    const x = cx + Math.cos(th) * r * scale;
    const y = cy - Math.sin(th) * r * scale;
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";
}

// one comparison line. `better` says which direction is good — for most of
// these it is "up", and nothing is coloured when there is no previous value.
function romRow(label, prev, now, fmt, better = "up") {
  const has = prev != null && Number.isFinite(prev);
  const d = has ? now - prev : 0;
  const same = !has || Math.abs(d) < 1e-9;
  const good = better === "up" ? d > 0 : d < 0;
  const cls = same ? "sm" : good ? "up" : "dn";
  const sign = d > 0 ? "+" : "";
  return `<div class="rom-row"><span class="lab">${label}</span>
    <span>${has ? `<span class="was">${fmt(prev)}</span> → ` : ""}<span class="now">${fmt(now)}</span>
    ${has && !same ? `<span class="dlt ${cls}">${sign}${fmt(d)}</span>`
                   : `<span class="dlt sm">${has ? "same" : "baseline"}</span>`}</span></div>`;
}

function renderRomCompare(arms) {
  const p = store.getPatient(state.patient);
  const cm = p.shoulderCm;
  $("rom-sub").textContent = arms.length > 1
    ? "Both arms measured. Here is what changed."
    : `${arms[0] === "left" ? "Left" : "Right"} arm measured. Here is what changed.`;

  $("rom-cards").innerHTML = arms.map(arm => {
    const cur = p.profiles[arm];
    if (!cur) return "";
    const prev = (p.history[arm] || []).slice(-1)[0] || null;

    // one scale for both shapes, so "bigger" reads as bigger
    const maxR = Math.max(...(cur.envelope || [1]), ...((prev?.envelope) || [0]), 0.6);
    const S = 74 / maxR, CX = 100, CY = 92;
    const shape = `<svg class="rom-shape" viewBox="0 0 200 184">
      <circle cx="${CX}" cy="${CY}" r="3" fill="rgba(244,236,221,.5)"/>
      ${prev ? `<path d="${envPath(prev.envelope, S, CX, CY)}" fill="rgba(244,236,221,.07)"
        stroke="rgba(244,236,221,.45)" stroke-width="2.5" stroke-dasharray="6 6"/>` : ""}
      <path d="${envPath(cur.envelope, S, CX, CY)}" fill="rgba(232,168,106,.16)"
        stroke="#e8a86a" stroke-width="3.5" stroke-linejoin="round"/>
    </svg>`;

    const area = v => cm ? `${Math.round(v * cm * cm)} cm²` : `${v.toFixed(2)} SW²`;
    const reach = v => cm ? `${Math.round(v * cm)} cm` : `${v.toFixed(2)} SW`;
    const deg = v => `${Math.round(v)}°`;
    const pctf = v => `${Math.round(v * 100)}%`;
    const cnt = v => `${Math.round(v)}`;

    const curArc = (cur.arcMaxDeg ?? 0) - (cur.arcMinDeg ?? 0);
    const prevArc = prev ? (prev.arcMaxDeg ?? 0) - (prev.arcMinDeg ?? 0) : null;
    const curEdges = (cur.extremes || []).filter(e => e.reached).length;
    const prevEdges = prev?.extremes ? prev.extremes.filter(e => e.reached).length : null;
    const curGrasp = (cur.extremes || []).filter(e => e.graspOk).length;
    const prevGrasp = prev?.extremes ? prev.extremes.filter(e => e.graspOk).length : null;

    let rows = romRow("Arm elevation arc", prevArc, curArc, deg);
    if (cur.areaSW2 != null) rows += romRow("Workspace area", prev?.areaSW2, cur.areaSW2, area);
    if (cur.coverage != null) rows += romRow("Reach coverage", prev?.coverage, cur.coverage, pctf);
    if (cur.volumeM3 != null) rows += romRow("Workspace volume", prev?.volumeM3,
      cur.volumeM3, v => `${(v * 1000).toFixed(1)} L`);
    if (cur.envelope?.length) rows += romRow("Longest reach",
      prev?.envelope ? Math.max(...prev.envelope) : null, Math.max(...cur.envelope), reach);
    if (cur.extremes?.length) rows += romRow("Edges reached", prevEdges, curEdges, cnt);
    if (cur.extremes?.length) rows += romRow("Grasped there", prevGrasp, curGrasp, cnt);

    const when = prev
      ? `Compared with ${new Date(prev.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "First measurement — this is the baseline";
    return `<div class="rom-card">
      <h3>${arm === "left" ? "Left" : "Right"} arm</h3>
      <div class="when">${when}</div>
      ${shape}
      ${prev ? `<div class="rom-legend">Dashed = last time · Amber = now</div>` : ""}
      ${rows}
    </div>`;
  }).join("");
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
  // this game's OWN difficulty, remembered per patient and per arm. A game
  // never played inherits the assessment-seeded params — the assessment is
  // the seed for all of them, it is just no longer the only memory.
  const base = store.getGameParams(state.patient, state.side, id) || prof.params;
  state.roundParams = { rangeScale: base.rangeScale, radius: base.radius, lifetime: base.lifetime };
  // capture-radius accessibility boost applies to play only — DDA keeps
  // adjusting the stored, unscaled radius
  const params = { ...state.roundParams, radius: state.roundParams.radius * A11Y.radiusScale };
  const game = new def.cls(state.tracker, $("canvas"), state.side, prof, params, {
    coachSens: state.coachSens, cursor: p.equippedCursor,
    tellStory: state.roundNumber === 1,
    stage: id === "drift" ? (state.driftStage || 1)
      : id === "rgs" ? (state.rgsStage || 1) : undefined,
    // Scratch Cards resumes its own ladder: the level a patient reached last
    // session is where the next one starts, or the ladder means nothing
    level: id === "lens" ? store.getLevel(state.patient, "scratchLevel")
      : id === "dots" ? store.getLevel(state.patient, "dotsLevel") : undefined,
    mode: id === "pong" ? state.pongMode
      : id === "oars" ? state.oarsMode
      : id === "ferry" ? state.ferryMode
      : undefined,
    skills: id === "pong" ? pongSkills() : undefined,
    song: id === "rhythm" ? state.song : undefined,
    tilesMode: id === "rhythm" ? state.tilesMode : undefined,
    bothArms: (id === "pong" && ["bimanual", "coupled", "team-arms"].includes(state.pongMode))
      || (id === "rhythm" && state.tilesMode === "bimanual")
      || id === "rgs",     // the RGS catch needs both hands by definition
    profiles: { left: store.getProfile(state.patient, "left"), right: store.getProfile(state.patient, "right") },
    // two-player Pong: player 2's own assessed arc drives their paddle, so a
    // limited range still covers the lane (a guest gets the default arc)
    ...(id === "pong" && state.pongMode === "duo" ? {
      p2Side: state.duo?.p2Side || "right",
      p2Name: state.duo?.p2 || null,
      p2Profile: state.duo?.p2 ? store.getProfile(state.duo.p2, state.duo.p2Side) : null,
    } : {}),
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
  // Scratch Cards: bank the level the round ended on
  if (round.game === "lens" && round.scratchLevel) {
    store.setLevel(state.patient, "scratchLevel", round.scratchLevel, 6);
  }
  if (round.game === "dots" && round.dotsLevel) {
    store.setLevel(state.patient, "dotsLevel", round.dotsLevel, 6);
  }

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
  // adjust from what this round actually ran at, not from the profile: with
  // per-game difficulty those are different numbers as soon as a second game
  // is played
  const used = state.roundParams || prof.params;
  // compensation-caused misses shouldn't raise difficulty: if many coach
  // events this round, hold instead of increasing
  let result = adjust(used, round);
  if (round.compEvents.length >= 3 && result.params.rangeScale > used.rangeScale) {
    result = { params: used, note: "Let's keep it steady while we work on posture." };
  }
  // Pong tutorial warm-up: the measured paddle speed becomes the ball's
  // crossing time going forward (the DDA adjusts from this calibrated start)
  if (round.game === "pong" && round.pongCrossTime) result.params.lifetime = round.pongCrossTime;
  store.saveGameParams(state.patient, state.side, round.game, result.params);
  // profile.params is deliberately NOT written here: it stays the
  // assessment-seeded starting difficulty, so a game played for the first
  // time starts from what the patient was measured at rather than inheriting
  // whatever the last game happened to drift to.

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

  // Catch Together stages (the RGS conditions, graded): catch → carry → sort
  if (round.game === "rgs") {
    const st = state.rgsStage || 1;
    if (round.hitRate > 0.7 && st < 3) {
      state.rgsStage = st + 1;
      result.note += st === 1 ? " Next: carry each light to a basket!"
                              : " Next: match each light to its own colour!";
    } else if (round.hitRate < 0.4 && st > 1) {
      state.rgsStage = st - 1;
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
  // workspace: the area the sweep painted, how much of the arm's full reach
  // that is, and — with the ZED's depth only — the volume it swept. A webcam
  // cannot measure depth, so the volume line is simply absent rather than
  // estimated.
  const wsLg = (() => {
    if (!prof || prof.areaSW2 == null) return "";
    const area = p.shoulderCm
      ? Math.round(prof.areaSW2 * p.shoulderCm * p.shoulderCm) + " cm²"
      : prof.areaSW2.toFixed(2) + " SW²";
    let s = `<div class="lg"><span class="dot" style="background:#e8a86a"></span>Workspace area
       <span class="val" style="color:#c77f4a;margin-left:6px">${area}${
         prof.coverage != null ? ` · ${Math.round(prof.coverage * 100)}% of full reach` : ""}</span></div>`;
    if (prof.volumeM3 != null) {
      s += `<div class="lg"><span class="dot" style="background:#9fc08a"></span>Workspace volume
         <span class="val" style="color:#4a7a3a;margin-left:6px">${(prof.volumeM3 * 1000).toFixed(1)} L${
           prof.depthRangeM != null ? ` · ${Math.round(prof.depthRangeM * 100)} cm forward` : ""}</span></div>`;
    }
    if (prof.extremes?.length) {
      const got = prof.extremes.filter(e => e.reached).length;
      const short = prof.extremes.filter(e => !e.reached)
        .sort((a, b) => a.frac - b.frac).slice(0, 2).map(e => e.key).join(", ");
      s += `<div class="lg"><span class="dot" style="background:${got === prof.extremes.length ? "#9fc08a" : "#b5503a"}"></span>Edges reached
         <span class="val" style="margin-left:6px">${got}/${prof.extremes.length}${
           short ? ` <small style='font-weight:600;opacity:.75'>(short: ${short})</small>` : ""}</span></div>`;
    }
    return s;
  })();
  $("prof-arc-legend").innerHTML =
    `<div class="lg"><span class="dot" style="background:#e8a86a"></span>Trained (${state.side[0].toUpperCase()})
       <span class="val" style="color:#c77f4a;margin-left:6px">${prof ? prof.arcMinDeg + "°–" + prof.arcMaxDeg + "°" : "—"}</span></div>
     <div class="lg"><span class="dot" style="background:rgba(27,27,58,.35)"></span>Other (${other[0].toUpperCase()})
       <span class="val" style="color:rgba(27,27,58,.6);margin-left:6px">${oProf ? oProf.arcMinDeg + "°–" + oProf.arcMaxDeg + "°" : "—"}</span></div>` + reachLg + wsLg;

  // --- reach & grasp map: the six held positions ---
  // Laid out where they actually are relative to the patient (0deg = out to
  // the assessed side, mirrored for a left arm), not on a half protractor:
  // the down-and-out position lives below the shoulder line and a map that
  // cannot draw it would quietly drop the one position most patients lose.
  const GX = 200, GY = 130, GR = 88;
  let gsvg = `<circle cx="${GX}" cy="${GY}" r="${GR}" fill="none" stroke="rgba(27,27,58,.10)" stroke-width="2" stroke-dasharray="6 8"/>
    <circle cx="${GX}" cy="${GY}" r="4" fill="rgba(27,27,58,.45)"/>`;
  const held = prof?.extremes || [];
  if (!held.length) {
    gsvg += `<text x="${GX}" y="${GY + 5}" text-anchor="middle" font-size="13" font-weight="700"
      fill="rgba(27,27,58,.45)" font-family="Nunito">No held positions recorded yet</text>`;
  }
  for (const e of held) {
    // arm-relative degrees -> screen: a left arm mirrors, exactly as the
    // assessment did when it asked for the movement
    const scr = (state.side === "right" ? e.deg : 180 - e.deg) * Math.PI / 180;
    const x = GX + Math.cos(scr) * GR, y = GY - Math.sin(scr) * GR;
    const frac = Math.max(0, Math.min(1, e.frac ?? 0));
    // spoke length = how far along that direction they actually got
    gsvg += `<line x1="${GX}" y1="${GY}" x2="${(GX + Math.cos(scr) * GR * frac).toFixed(1)}"
      y2="${(GY - Math.sin(scr) * GR * frac).toFixed(1)}" stroke="${e.reached ? "#9fc08a" : "#e8a86a"}"
      stroke-width="5" stroke-linecap="round"/>`;
    if (e.reached) {
      gsvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="rgba(159,192,138,.25)" stroke="#9fc08a" stroke-width="3"/>
        <path d="M${(x - 6).toFixed(1)} ${y.toFixed(1)} l4.5 5 l9 -10.5" stroke="#4a7a3a" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      if (e.graspOk) gsvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="21" fill="none" stroke="#4a7a3a" stroke-width="2.5"/>`;
    } else {
      gsvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="rgba(181,80,58,.15)" stroke="#b5503a" stroke-width="2.5" stroke-dasharray="4 4"/>
        <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800"
          fill="#b5503a" font-family="Nunito">${Math.round(frac * 100)}%</text>`;
    }
    // label outside the ring, nudged so nothing overlaps the circle
    const lx = GX + Math.cos(scr) * (GR + 40), ly = GY - Math.sin(scr) * (GR + 40);
    gsvg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700"
      fill="rgba(27,27,58,.6)" font-family="Nunito">${e.key}</text>`;
    if (e.reached) gsvg += `<text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700"
      fill="${e.graspOk ? "#4a7a3a" : "#b8892a"}" font-family="Nunito">${e.graspOk ? "✊ grasp" : "hold only"} · ${Math.round((e.stability ?? 0) * 100)}%</text>`;
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

  // --- difficulty, per game ---
  // Each game keeps its own DDA params (they make different demands), and the
  // ladder games keep a level. A therapist looking at "why is Pong harder
  // than it was" needs to see the number that actually drove the round.
  const LEVELS = { lens: ["scratchLevel", 6], dots: ["dotsLevel", 6] };
  const rows = store.listGameParams(state.patient, state.side);
  $("prof-diff").innerHTML = rows.length
    ? rows.map(r => {
        const g = GAMES.find(x => x.id === r.game);
        const lv = LEVELS[r.game] ? store.getLevel(state.patient, LEVELS[r.game][0]) : null;
        return `<div class="comp-row"><span>${g?.name || r.game}${
          lv ? ` <span class="chip amber" style="margin-left:6px">Level ${lv}/${LEVELS[r.game][1]}</span>` : ""}</span>
          <span class="cv">range ${Math.round(r.rangeScale * 100)}% · target ${r.radius.toFixed(2)} SW · ${r.lifetime.toFixed(1)}s</span></div>`;
      }).join("")
    : `<div class="comp-row"><span style="opacity:.6">Not played yet on this arm — every game starts from the assessment</span></div>`;
$("btn-prof-session").addEventListener("click", () => { renderSelect(); show("screen-select"); });
$("btn-prof-assess").addEventListener("click", () => startAssessment({ force: true, arms: [state.side] }));
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
$("btn-rom-done").addEventListener("click", () => {
  $("btn-rom-done").classList.remove("kbd-focus");
  renderSelect();
  show("screen-select");
});
$("btn-drawer-close").addEventListener("click", () => $("drawer").classList.add("hidden"));

/* ---------- therapist contact (staff drawer) ----------
   Three buttons, no automatic mail. A test proves the link works before it is
   needed, a problem report carries the diagnostics that would otherwise take
   a phone call, and a progress summary goes only when a staff member asks for
   it — patient data leaving the machine is always a deliberate act. Without
   tools/mail_bridge.py running, each falls back to the machine's mail client.
*/
function mailState(text, cls) { $("mailstate").textContent = text; $("mailstate").className = cls || ""; }

probeMail().then(() => mailState(
  mailReady() ? `Mail: ready · sends to ${mailTarget()}`
              : `Mail: relay offline · buttons open your mail app (${mailTarget()})`,
  mailReady() ? "ok" : ""));

async function doMail(kind, subject, body, label) {
  mailState(`Mail: sending ${label}…`);
  const r = await sendMail(kind, subject, body);
  if (!r.ok) mailState(`Mail: ${label} failed — ${r.error}`, "bad");
  else if (r.via === "mailto") mailState(`Mail: ${label} opened in your mail app — press Send there`);
  else mailState(`Mail: ${label} sent to ${mailTarget()}`, "ok");
}

$("btn-mail-test").addEventListener("click", () => doMail(
  "test", "Test from STRIVE",
  `This is a test message from STRIVE, sent by a staff member to check the therapist link.\n\n${diagnostics(state, state.tracker)}\n`,
  "test"));

$("btn-mail-help").addEventListener("click", () => {
  const what = prompt("What went wrong? (this is sent with the camera and tracking diagnostics)");
  if (what == null) return;
  doMail("help", "Problem report",
    `Reported by staff:\n${what || "(no description given)"}\n\n${diagnostics(state, state.tracker)}\n`,
    "problem report");
});

$("btn-mail-progress").addEventListener("click", () => {
  const p = store.getPatient(state.patient);
  doMail("progress", `Progress — participant ${state.patient} (${state.side})`,
    progressReport(state.patient, p, state.side), "progress summary");
});

$("in-patient").addEventListener("input", e => {
  state.patient = (e.target.value || "guest").trim();
  $("in-shoulder").value = store.getPatient(state.patient).shoulderCm ?? "";
  loadSettings(state.patient);
});
$("in-shoulder").addEventListener("change", e => store.setShoulderCm(state.patient, parseFloat(e.target.value)));
// ZED real-world scale: the bridge measures true shoulder width in meters
// from depth, so the SW→cm conversion fills itself in for the logged-in
// patient — no tape measure needed. A therapist-typed value always wins
// (storage refuses auto overwrites of manual entries).
setInterval(() => {
  const m = state.tracker?.shoulderM;
  if (!m || !state.patient) return;
  const cm = Math.round(m * 100);
  const p = store.getPatient(state.patient);
  if (p.shoulderCm === cm || (p.shoulderCm && !p.shoulderCmAuto)) return;
  store.setShoulderCm(state.patient, cm, true);
  if ($("drawer").classList.contains("hidden")) return;
  $("in-shoulder").value = cm;   // live-update the drawer if staff are looking
}, 5000);
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
$("btn-drawer-assess").addEventListener("click", () => { $("drawer").classList.add("hidden"); startAssessment({ force: true }); });
$("btn-drawer-assess-one").addEventListener("click", () => {
  $("drawer").classList.add("hidden");
  startAssessment({ force: true, arms: [state.side] });
});
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

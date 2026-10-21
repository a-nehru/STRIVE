import { Tracker } from "./tracker.js?v=67";
import { Assessment } from "./assessment.js";
import { GAMES, STAR_RANKS, CANDLE_MAX, LUMEN_STAGES } from "./games.js";
import { Warmup } from "./warmup.js";
import { SONGS } from "./songs.js";
import { initialParams, adjust, LIMITS } from "./dda.js";
import { drawBody, drawVideoMirror } from "./engine.js";
import { store } from "./storage.js";
import { drawVillage, villageLine, villageCounts } from "./village.js";
import { audio } from "./audio.js";
import { A11Y, applySettings, speakLine, showCaption, COACHES } from "./a11y.js";
import { coachLine } from "./coachlines.js";
import { probeCoach, coachRelayReady, coachRelayInfo } from "./coachline.js";
import { probeMail, sendMail, mailTarget, mailReady, diagnostics, progressReport, setReminder, pushSnapshot } from "./mail.js";

// "12 min" / "1 h 05 min"
const fmtDur = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const $ = id => document.getElementById(id);

// Menu pre-selection is OFF (Sep 2026, by request): no card is highlighted
// in advance and Enter/Space select nothing, so a menu only ever advances on
// a click. Flip this back on to restore the "default-first" flow (one
// recommended card pre-focused, arrow keys to move, Enter to go).
const MENU_KEYS = false;
const focusHint = el => { if (MENU_KEYS && el) el.classList.add("kbd-focus"); };
const SCREENS = ["screen-login", "screen-welcome", "screen-intro", "screen-select", "stage", "screen-between", "screen-romcompare", "screen-collections", "screen-profile", "screen-schedule"];

const state = {
  tracker: null,
  side: "right",
  sideChosen: false,   // true once the arm was chosen at login (or by the staff drawer) — asked once, never re-asked
  patient: "guest",
  coachSens: "gentle",
  pongMode: "solo",
  pongAxis: "fe",      // "fe" Pong FE (up and down) | "abd" Pong Abd-Add (side to side), picked on the select screen
  oarsMode: "together",
  candlesMode: "solo",   // Lantern: "solo" | "together" (other hand keeps the candle) | "hold" (trained arm keeps it)
  candlesLevelPick: null, // Lantern: a level chosen on the level map or in the drawer for the NEXT round only (testing); else the ladder
  pongSpeed: "normal",   // Pong ball-speed dial: chill | normal | frantic (both the single and the two-player game)
  pongPowerups: true,    // Pong: the orbs and their power-ups
  ferryMode: "solo",
  song: "mary",
  tilesMode: "one",
  current: null,
  roundNumber: 0,
  sessionStars: 0,
  starCarrySec: 0,          // play seconds not yet turned into a star (one star a minute)
  screen: "screen-login",
  plan: null,          // the session plan being played: { blocks, idx, startedAt } (null when playing freely)
};

function show(id) {
  for (const s of SCREENS) $(s).classList.add("hidden");
  $(id).classList.remove("hidden");
  state.screen = id;
  if (id === "screen-welcome") state.warmedUp = false;   // a fresh session may stretch again
  // the floating Help follows the stage and the result screens; the welcome
  // and the menu carry their own inline buttons instead
  $("btn-help").classList.toggle("hidden", ["screen-login", "screen-welcome", "screen-intro", "screen-select", "screen-schedule"].includes(id));
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
    $("loading-text").textContent = "Waking up the camera…";
    $("loading-error").classList.add("hidden");
    await t.init($("video"), localStorage.getItem("strive-cam-source") || "auto",
      s => { $("loading-text").textContent = s; });
    t.start();
    state.tracker = t;
    $("camstate").textContent = t.source === "zed"
      ? "Camera: ZED 2 (SDK body tracking via bridge)"
      : `Camera: tracking (webcam, models ${t.mpLocal ? "from this site" : "from the CDN"})`;
    $("camstate").className = "ok";
    $("loading").classList.add("hidden");
  } catch (e) {
    // say what went wrong where the patient and staff can see it (the staff
    // drawer's camstate line is not visible on the login screen), and offer a
    // reload; "continue" lets staff reach the drawer to change the source
    console.error("Camera boot failed", e);
    $("camstate").textContent = "Camera: unavailable. " + e.message;
    $("camstate").className = "bad";
    $("loading-text").textContent = "The camera could not start: " + e.message;
    $("loading-error").classList.remove("hidden");
  }
}
// FPS readout at the top (Oct 2026, by request): the camera and its picture
// size, how many pose samples a second the tracker ingests (the bridge's rate
// on the ZED, MediaPipe's on a webcam) and the screen's own frame rate
let _fpsScreen = 0, _fpsSeen = 0;
(function _fpsRaf() { _fpsScreen++; requestAnimationFrame(_fpsRaf); })();
setInterval(() => {
  const t = state.tracker, box = $("fpsbox");
  if (!t) return;
  const n = t.frames - _fpsSeen; _fpsSeen = t.frames;
  const cam = t.source === "zed" ? `ZED ${t.zedInfo?.w}×${t.zedInfo?.h}`
    : `webcam ${t.srcW || t.video?.videoWidth || "?"}×${t.srcH || t.video?.videoHeight || "?"}`;
  box.textContent = `${cam}  ·  ${n} fps tracking  ·  ${_fpsScreen} fps screen`;
  box.classList.toggle("stale", n === 0);
  box.classList.remove("hidden");
  _fpsScreen = 0;
}, 1000);
$("btn-loading-retry").addEventListener("click", () => location.reload());
$("btn-loading-continue").addEventListener("click", () => $("loading").classList.add("hidden"));

/* ================= login (P0) ================= */
// First screen: pick an existing participant or create one. Every choice is
// stored under rehabsuite-v1 immediately, so stars, profiles and history come
// back next visit. The camera keeps warming up in the background meanwhile.
function loginStep(step) {
  for (const s of ["login-choice", "login-list", "login-create", "login-coach", "login-arm"])
    $(s).classList.toggle("hidden", s !== step);
  if (step === "login-create") {
    setTimeout(() => $("login-name").focus(), 50);
    preloadIntro();          // a new participant hears the intro next: have it buffered
  }
  if (step === "login-coach") setTimeout(() => document.querySelector("#login-coach .coach[aria-checked=\"true\"]")?.focus(), 50);
}

// The AI coach (Oct 2026, by request, from the choose-your-coach mockup): a
// new participant picks Rook, Lumi or Maple right after their name, before
// the arm. The choice is a per-patient setting (store.getSettings().coach),
// so everything the app says from then on is in that coach's words and
// voice (coachlines.js, a11y.js); the staff drawer's Coach select changes it
// later. Lumi is pre-selected and is what anyone who never chose gets.
let coachPick = "lumi";
let pendingCreate = null;                    // the name waiting on a coach
function renderCoachPick() {
  for (const card of document.querySelectorAll("#login-coach .coach")) {
    const on = card.dataset.coach === coachPick;
    card.setAttribute("aria-checked", String(on));
    card.tabIndex = on ? 0 : -1;
  }
  const c = COACHES[coachPick];
  $("btn-login-coach").textContent = `Start with ${c.name}`;
  $("btn-login-coach").dataset.coach = coachPick;
}
function selectCoach(id, focus) {
  if (!COACHES[id]) return;
  coachPick = id;
  renderCoachPick();
  if (focus) document.querySelector(`#login-coach .coach[data-coach="${id}"]`)?.focus();
}
{
  const cards = [...document.querySelectorAll("#login-coach .coach")];
  cards.forEach((card, i) => {
    card.addEventListener("click", e => {
      if (e.target.closest(".coach-hear")) return;       // "Hear it" is its own button
      selectCoach(card.dataset.coach, false);
    });
    card.addEventListener("keydown", e => {
      const k = e.key;
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(k)) {
        e.preventDefault();
        const step = k === "ArrowRight" || k === "ArrowDown" ? 1 : -1;
        selectCoach(cards[(i + step + cards.length) % cards.length].dataset.coach, true);
      } else if ((k === "Enter" || k === " ") && coachPick === card.dataset.coach) {
        e.preventDefault(); $("btn-login-coach").click();
      }
    });
  });
  // "Hear it": the coach's sample line in that coach's own voice, nothing saved
  for (const b of document.querySelectorAll("#login-coach .coach-hear")) {
    b.addEventListener("click", e => {
      e.stopPropagation();
      const id = b.closest(".coach").dataset.coach;
      speakLine(COACHES[id].sample, 0.9, false, null, id);
    });
  }
  $("btn-login-coach").addEventListener("click", () => {
    if (!pendingCreate) return;
    const name = pendingCreate; pendingCreate = null;
    store.saveSettings(name, { coach: coachPick });
    loginAs(name, true);
  });
  $("btn-login-back-coach").addEventListener("click", () => { pendingCreate = null; loginStep("login-create"); });
  renderCoachPick();
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

// The trained arm is chosen ONCE, at setup, and everything downstream — the
// assessment, every game, the profile — is for that arm alone. A record
// without one (brand new, or saved before this existed) is asked before
// going any further; after that it is never re-asked. The staff drawer's arm
// select is the therapist's override and writes the same field.
let pendingLogin = null;
function loginAs(name, isNew) {
  const p = store.login(name);
  if (!p.arm) {
    pendingLogin = { name, isNew };
    $("login-arm-who").textContent = name === "guest"
      ? "Which arm are we training?" : `Which arm are we training, ${name}?`;
    loginStep("login-arm");
    return;
  }
  finishLogin(name, isNew, p.arm);
}
for (const arm of ["left", "right"]) {
  $(`btn-login-arm-${arm}`).addEventListener("click", () => {
    if (!pendingLogin) return;
    const { name, isNew } = pendingLogin; pendingLogin = null;
    store.setArm(name, arm);
    finishLogin(name, isNew, arm);
  });
}
$("btn-login-back3").addEventListener("click", () => { pendingLogin = null; loginStep("login-choice"); });

function finishLogin(name, isNew, arm) {
  state.patient = name;
  state.side = arm;
  state.sideChosen = true;
  $("in-arm").value = arm;                 // keep the staff drawer in sync
  // a new person at the camera: forget whoever the tracker was following, so
  // the body lock re-acquires instead of holding on to the last participant
  state.tracker?.relock();
  loadSettings(name);                      // this patient's comfort settings take effect
  $("in-patient").value = name;            // keep the staff drawer in sync
  $("in-shoulder").value = store.getPatient(name).shoulderCm ?? "";
  // the staff drawer shows this participant's contact and reminder
  const c = store.getPatient(name).contact || {};
  $("in-email").value = c.email || "";
  $("in-remind-time").value = c.remindAt || "";
  $("in-remind-days").value = c.remindDays || "off";
  // a participant made just now sees the intro first (Oct 2026, by
  // request), then the welcome screen and the greeting
  Warmup.preload(arm);                    // the stretch recording for this arm, fetched now
  if (isNew && name !== "guest") {
    playIntro(() => { show("screen-welcome"); speak(`Nice to meet you, ${name}. ` + coachLine("session_start")); });
  } else {
    show("screen-welcome");
    if (name !== "guest") speak(`Welcome back, ${name}. ` + coachLine("session_start"));
  }
  notifyLogin(name, arm);
  syncReminder(name);
  snapshot(name);
}

// A login notice to the therapist's address (Sep 2026, by request). Only
// through the local relay: with no relay there is no pop-up mail window on
// a patient's login, just nothing.
async function notifyLogin(name, arm) {
  if (name === "guest") return;
  if (!mailReady()) await probeMail();
  if (!mailReady()) return;
  const p = store.getPatient(name);
  const r = await sendMail("login", `Login — participant ${name}`,
    `Participant ${name} logged in at ${new Date().toLocaleString()}.\nTraining arm: ${arm}\n` +
    `Rounds on record: ${p.sessions.length}\n\n${diagnostics(state, state.tracker)}\n`);
  mailState(r.ok ? `Mail: login notice sent to ${mailTarget()}` : `Mail: login notice failed — ${r.error}`, r.ok ? "ok" : "bad");
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
  // optional contact and reminder, asked once here; the staff drawer can change it
  const email = $("login-email").value.trim();
  const remindAt = $("login-remind-time").value, remindDays = $("login-remind-days").value;
  if (email || remindDays !== "off") store.setContact(name, { email, remindAt, remindDays });
  if (store.hasPatient(name)) { loginAs(name, false); return; }   // existing name just logs in
  // a new participant: the coach comes next, then the arm
  pendingCreate = name;
  selectCoach("lumi", false);
  loginStep("login-coach");
}

// the progress snapshot the relay answers update-by-email from: pushed at
// login, after every round and after an assessment, so an emailed request
// is answered from the last time this participant used STRIVE
function snapshot(name) {
  if (!name || name === "guest") return;
  const p = store.getPatient(name);
  pushSnapshot(name, progressReport(name, p, p.arm || state.side), store.exportPatient(name));
}

// push this participant's reminder to the relay (which sends it when due)
async function syncReminder(name) {
  const p = store.getPatient(name);
  const c = p.contact;
  if (!c) return;
  const r = await setReminder({ name, email: c.email, time: c.remindAt, days: c.email && c.remindAt ? c.remindDays : "off", arm: p.arm });
  if (r.ok) mailState(c.email && c.remindDays !== "off"
    ? `Mail: reminder set for ${name} at ${c.remindAt} (${c.remindDays})` : `Mail: no reminder for ${name}`, "ok");
}
$("btn-login-create").addEventListener("click", createLogin);
$("login-name").addEventListener("keydown", e => { if (e.key === "Enter") createLogin(); });

/* ================= welcome (P1) ================= */
// Setup gate: guide the patient until their whole upper body is in frame,
// centered and at a good distance, settled for a moment. Only then offer
// the raise-hand start. A click anywhere is the staff override.
// Lenient on distance on purpose: patients are in an inpatient ward, in a
// bed or chair anywhere from 5 to 15 ft from the camera, and cannot simply
// scoot up to it. Everything downstream is in shoulder-width units, so far
// away only costs pixels, not correctness. The one thing that matters is
// that the tracker can see them at all: only a shoulder width too small for
// any landmark to be trusted (about 0.03 of the frame, roughly 5 m on the
// ZED's wide lens) asks them to come closer, and gently.
function framingMessage(t) {
  if (!t.trackingOk) return "Take a seat facing the camera";
  if (t.shoulderWFast > 0.42) return "Sit back a little, so we can see your whole upper body";
  if (t.shoulderWFast < 0.03) return "If you can, come a little closer to the camera";
  if (!t.rawVis?.hips) return "Sit back a little, we want to see down to your hips";
  if (t.anchorFast.x < 0.15 || t.anchorFast.x > 0.85) return "Scoot toward the middle of the picture";
  if (t.anchorFast.y < 0.08 || t.anchorFast.y > 0.75) return "Adjust the camera so your shoulders sit near the middle";
  return null;
}

// ZED path with more than one person in view: a ring on each person's
// shoulders, sage on the one being followed, amber on the rest, so staff can
// click the patient once and the bridge follows them from then on. Returns
// the hit boxes for the click handler. Mirrored like everything else drawn
// over the camera picture.
function drawPeopleMarkers(ctx, c, t) {
  const people = t.people || [];
  if (t.source !== "zed" || people.length < 2) return [];
  const boxes = [];
  for (const p of people) {
    const px = t._videoToPx(1 - p.x, p.y, c);
    const r = Math.max(36, Math.min(160, p.sw * c.width * 0.8));
    const followed = p.seat === 0;
    ctx.save();
    ctx.beginPath(); ctx.arc(px.x, px.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = followed ? "rgba(159,192,138,0.95)" : "rgba(232,168,106,0.9)";
    ctx.lineWidth = followed ? 5 : 3;
    if (!followed) ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    const label = followed ? "Following" : "Click to follow";
    const tw = ctx.measureText(label).width + 22;
    ctx.fillStyle = "rgba(16,16,40,0.75)";
    ctx.beginPath(); ctx.roundRect(px.x - tw / 2, px.y - r - 34, tw, 28, 8); ctx.fill();
    ctx.fillStyle = followed ? "#9fc08a" : "#e8a86a";
    ctx.fillText(label, px.x, px.y - r - 14);
    ctx.restore();
    boxes.push({ id: p.id, x: px.x, y: px.y, r });
  }
  return boxes;
}

const TAU2 = Math.PI * 2;
// (the live-mirror body drawing moved to engine.js drawBody — shared with the
// assessment's camera view)

function watchWelcome() {
  let framedSince = null, squeezeSeen = false;
  let lastSpoken = "", lastSpokenAt = 0, inviteSaid = false;
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
  // person markers drawn this frame (ZED, 2+ people): a click on one tells
  // the bridge to follow that person. The canvas itself takes no pointer
  // events (buttons sit above it), so the screen listens and hit-tests.
  let personBoxes = [], pickedAt = 0;
  $("screen-welcome").addEventListener("click", e => {
    if (e.target.closest("button, a, select, input")) return;
    const hit = personBoxes.find(b => Math.hypot(e.clientX - b.x, e.clientY - b.y) <= b.r + 12);
    if (!hit) return;
    pickedAt = performance.now();
    state.tracker?.selectPerson(hit.id);
  });

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
    const crowd = t.source === "zed" && (t.people?.length ?? 0) > 1;
    setText(trackEl, crowd && now - pickedAt < 4000
      ? "Following the person you clicked"
      : crowd
        ? `${t.people.length} people in view. Staff: click the patient to follow them`
      : t.trackingOk
        ? `Tracking: body ✓ · hand ${handFresh ? "✓" : "…"} · squeeze ${squeezeSeen ? "✓" : "… try closing your fist"}`
        : "Tracking: looking for you …");

    const msg = framingMessage(t);
    const framed = !msg;
    // the real mirror, full screen: the camera picture with the tracked
    // skeleton over the patient's own body (amber until framed, then sage),
    // so "sit a little to the left" can be checked against the picture
    // rather than against a small abstract figure in a corner
    drawVideoMirror(ctx, c, t, 0.30);
    if (t.trackingOk) drawBody(ctx, c, t, { framed });
    personBoxes = drawPeopleMarkers(ctx, c, t);

    if (msg) {
      framedSince = null;
      setText(head, "Let's get you settled");
      setText(sub, msg);
      guide(msg, now);
      return;
    }
    framedSince ??= now;
    // an unhurried moment of "that's it" before the invitation — this used
    // to flip to "press Start" after 1.4 s, which read as being rushed
    if (now - framedSince < 4500) {
      setText(head, "That's it");
      setText(sub, "Sit comfortably, just like that");
      return;
    }
    setText(head, "Ready when you are");
    setText(sub, "Press Start when you're settled");
    if (!inviteSaid) {
      inviteSaid = true;
      speak("Ready when you are. Press Start when you're settled.");
    }

    // No gesture entry. The welcome screen's job is to get the patient framed
    // and settled; it says so and then waits. Entering is the Start button
    // (or Enter), never a hand that happened to rise into view — that used to
    // fire before the patient had finished sitting down.
  }
  loop();
  $("btn-welcome-start").addEventListener("click", enterSelect);
  $("btn-welcome-warmup").addEventListener("click", () => startWarmup());
}

// The opening stretch (Oct 2026, by request): optional, brief, led by the
// short range-of-motion demonstration video (warmup.js). Nothing is
// measured; the play time is logged as "warmup" and the hub follows.
// `then` is what follows the stretch: the hub by default, or the
// assessment when the stretch opens it (the ✕ skips straight to it).
function startWarmup(then = null) {
  if (!state.tracker) return;
  const next = then || (() => { renderSelect(); show("screen-select"); speak("What shall we play today?"); });
  show("stage");
  const w = new Warmup(state.tracker, $("canvas"), { side: state.side, endLine: then ? "Lovely. Nice and loose. Now let's measure your reach." : null });
  state.current = w;
  state.warmedUp = true;
  state.warmupThen = next;
  w.start(res => {
    state.current = null; state.warmupThen = null;
    if (res?.seconds) store.logPlaytime(state.patient, res.seconds * 1000, "warmup");
    next();
  });
}

/* ================= the intro (Oct 2026, by request) ================= */
// The STRIVE Intro recording (55 s, silent, its own big captions) with the
// coach's voice reading the script over it: each paragraph is cued where
// the recording's caption for it begins, and the lines are QUEUED, never
// cut mid-sentence, so a long paragraph simply finishes before the next
// starts. The recording holds its last frame until the voice is done.
// Played right after a new participant is created, before the welcome
// screen, and from the staff drawer; Skip (or Enter / Space / Escape) goes
// straight on. With no recording (missing file, slow network) the voice
// still reads the whole script on the dark screen.
const INTRO_SRC = "assets/music/STRIVE Intro.mp4";
const INTRO_LINES = [
  "Congratulations! You are about to use the STRIVE system. Let me explain how STRIVE can help you reach your therapy goals.",
  "Your brain has the power to heal itself. This is called neuroplasticity.",
  "Movement drives that healing, and more is better. The more you practice moving your arm, the more your brain can heal. 1,000 repetitions causes far more changes in the brain than 100.",
  "STRIVE helps you get more reps, even when you are not in a therapy session.",
  "STRIVE will continuously adjust to make sure the games are customized to provide you the best level of challenge and movement.",
  "With STRIVE, your next rep is always one game away. Let's play.",
];
// seconds into the recording where each line's caption section begins
const INTRO_CUES = [0.5, 10, 17.7, 33.2, 39.2, 48.2];
const INTRO_GAP_MS = 350;        // breath between queued lines
const INTRO_STALL_MS = 8000;     // a recording that never starts: read the script without it
const INTRO_TAIL_MS = 800;       // after the last line, before what comes next
// the written form is as scripted; the spoken form reads as words
const introSpoken = s => s.replace(/STRIVE/g, "Strive").replace("1,000", "a thousand").replace("than 100", "than a hundred");

let introVid = null;
function preloadIntro() {
  if (introVid) return introVid;
  const v = $("intro-video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  v.src = INTRO_SRC;
  try { v.load(); } catch {}
  introVid = v;
  return v;
}

let introRun = 0;
function playIntro(then = null) {
  const run = ++introRun;
  const v = preloadIntro();
  show("screen-intro");
  const startedAt = performance.now();
  let next = 0, queue = [], speaking = false, done = false, raf = 0;
  const finish = () => {
    if (done || run !== introRun) return;
    done = true; introRun++;
    cancelAnimationFrame(raf);
    try { speechSynthesis.cancel(); } catch {}
    try { v.pause(); } catch {}
    removeEventListener("keydown", onKey, true);
    $("btn-intro-skip").onclick = null;
    then?.();
  };
  const onKey = e => {
    if (["Enter", " ", "Escape"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); finish(); }
  };
  addEventListener("keydown", onKey, true);
  $("btn-intro-skip").onclick = finish;
  // one line at a time, the next only when this one has been said
  const pump = () => {
    if (done || speaking || !queue.length) return;
    const i = queue.shift(); speaking = true;
    showCaption(INTRO_LINES[i]);
    speakLine(introSpoken(INTRO_LINES[i]), 0.9, false, () => {
      speaking = false;
      setTimeout(pump, INTRO_GAP_MS);
    });
  };
  const tick = now => {
    if (done) return;
    const t = v.currentTime || 0;
    // a recording that failed or never started: the voice carries the script
    const failed = !!v.error || (t === 0 && now - startedAt > INTRO_STALL_MS);
    const over = v.ended || failed;
    while (next < INTRO_CUES.length && (over || t >= INTRO_CUES[next])) queue.push(next++);
    pump();
    if (over && next >= INTRO_CUES.length && !queue.length && !speaking) { setTimeout(finish, INTRO_TAIL_MS); return; }
    raf = requestAnimationFrame(tick);
  };
  try { v.currentTime = 0; } catch {}
  v.play().catch(() => {});       // muted: autoplay is never refused
  raf = requestAnimationFrame(tick);
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
  pairs: `<div class="art" style="background:radial-gradient(circle at 50% 45%,#2c3556,#141830)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <g fill="#2f3358" stroke="rgba(244,236,221,.35)" stroke-width="3">
        <rect x="52" y="96" width="88" height="104" rx="12"/>
        <rect x="160" y="216" width="88" height="104" rx="12"/>
        <rect x="52" y="216" width="88" height="104" rx="12"/>
      </g>
      <circle cx="96" cy="148" r="7" fill="rgba(232,168,106,.55)"/>
      <circle cx="204" cy="268" r="7" fill="rgba(232,168,106,.55)"/>
      <circle cx="96" cy="268" r="7" fill="rgba(232,168,106,.55)"/>
      <rect x="160" y="96" width="88" height="104" rx="12" fill="#fdf6e3"/>
      <path d="M204 118 L213 140 L237 142 L218 157 L224 181 L204 168 L184 181 L190 157 L171 142 L195 140 Z" fill="#c77f4a"/>
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
  candles: `<div class="art" style="background:linear-gradient(180deg,#12122c,#1e1c42 70%,#2a2448)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M70 330 L110 150 L200 210 L240 90" fill="none" stroke="#ffd98a" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 12" opacity=".85"/>
      <ellipse cx="110" cy="150" rx="18" ry="23" fill="#ffd98a"/><ellipse cx="110" cy="146" rx="8" ry="10" fill="#fff6d8"/>
      <ellipse cx="200" cy="210" rx="18" ry="23" fill="#ffd98a"/><ellipse cx="200" cy="206" rx="8" ry="10" fill="#fff6d8"/>
      <ellipse cx="240" cy="90" rx="18" ry="23" fill="rgba(45,42,80,.95)" stroke="rgba(232,168,106,.7)" stroke-width="2"/>
      <rect x="40" y="320" width="60" height="38" rx="6" fill="#3b2a2a" stroke="rgba(244,236,221,.35)" stroke-width="2"/>
      <rect x="52" y="298" width="7" height="24" rx="2" fill="#f4ecdd"/><rect x="66" y="298" width="7" height="24" rx="2" fill="#f4ecdd"/><rect x="80" y="298" width="7" height="24" rx="2" fill="#f4ecdd"/>
      <path d="M69 286 Q76 276 69 266 Q62 276 69 286 Z" fill="#ffd98a"/>
      <rect x="200" y="320" width="60" height="38" rx="6" fill="#3b2a2a" stroke="rgba(244,236,221,.2)" stroke-width="2"/>
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

// The lantern street at the top of the hub (village.js): drawn from the
// patient's counts, with one line saying what has happened since they were
// last here. The "seen" snapshot is taken after the line is built, so the
// next visit compares against this one.
let villageAnim = 0;
function renderVillage() {
  const v = store.getVillage(state.patient);
  const today = dayKey(new Date());
  $("village-line").textContent = villageLine(v, v.seen, today);
  const c = villageCounts(v);
  store.markVillageSeen(state.patient, { villagers: c.villagers, clouds: c.clouds, days: Object.keys(v.days || {}) });
  const cv = $("village-canvas");
  cancelAnimationFrame(villageAnim);
  const frame = () => {
    if ($("screen-select").classList.contains("hidden")) return;
    drawVillage(cv, v);
    if (!A11Y.calm) villageAnim = requestAnimationFrame(frame);
  };
  frame();
}

function renderSelect() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  renderVillage();
  document.querySelector("#screen-select h1").textContent = "What shall we play today?";
  const prof = store.getProfile(state.patient, state.side);

  const mk = (id, name, locked, onClick, trains, lockText = "Measure your reach first") => {
    const b = document.createElement("button");
    b.className = "gcard";
    b.dataset.dwell = "1";
    b.innerHTML = CARD_ART[id] + `<div class="dwell-fill"></div>` +
      (trains ? `<div class="trains">${trains}</div>` : "") +
      `<div class="title">${name}</div>` +
      (locked ? `<div class="lock">🔒<span>${lockText}</span></div>` : "");
    if (!locked) b.addEventListener("click", onClick);
    wrap.appendChild(b);
    return b;
  };

  // ONE ASSESSMENT A DAY (Sep 2026, by request): the day's session opens
  // with the measurement and the games wait for it; once it is done the
  // card locks until tomorrow. The staff drawer and the profile screen can
  // still re-measure (an override, for the therapist).
  const today = measuredToday(prof);
  const assessBtn = mk("assess", today ? "Measured today" : prof ? "Today's measurement" : "Measure your reach", today,
    () => startAssessment({ force: !!prof }), null, "Done for today");
  const gameBtns = {};
  const gameLock = !prof ? "Measure your reach first" : !today ? "Today's measurement first" : null;
  for (const g of GAMES) {
    if (g.disabled) continue;
    if (g.id === "pong") {
      // two Pongs, one card each (Sep 2026, by request): FE, the arm up and
      // down; Abd-Add, the hand out to the side and across, on the lane the
      // assessment measured
      const go = axis => () => { state.pongMode = "solo"; state.pongAxis = axis; $("in-pong").value = "solo"; startGame("pong", true); };
      gameBtns.pong = mk("pong", "Pong FE", !!gameLock, go("fe"), "Up and down", gameLock);
      gameBtns["pong-abd"] = mk("pong", "Pong Abd-Add", !!gameLock, go("abd"), "Side to side", gameLock);
      // and the same game for two (Oct 2026, by request): a tile of its own
      gameBtns["pong-duo"] = mk("pong", "Pong: two players", !!gameLock,
        () => { state.pongMode = "duo"; state.pongAxis = "fe"; $("in-pong").value = "duo"; renderDuoSetup(); }, "Play together", gameLock);
      continue;
    }
    // the Lantern opens on its level map (Oct 2026, by request: any level
    // can be tried), with the Guild board beside it
    if (g.id === "candles") { gameBtns.candles = mk(g.id, g.name, !!gameLock, renderLanternLevels, g.trains, gameLock); continue; }
    gameBtns[g.id] = mk(g.id, g.name, !!gameLock, () => startGame(g.id, true), g.trains, gameLock);
  }
  // the session plan, if the therapist made one: a strip above the cards
  // with its start button, which is the recommended action once the arm is
  // measured today (the plan's games wait for the measurement like the cards)
  const planBtn = renderPlanStrip(gameLock);
  // default-first: one clearly recommended card, pre-focused so a single
  // Enter continues the flow (no measurement today → assess; else the plan;
  // else last played game; else the first game)
  const suggested = gameLock ? assessBtn : planBtn || (gameBtns[state.lastGameId] || Object.values(gameBtns)[0]);
  if (suggested) {
    focusHint(suggested);
    if (MENU_KEYS) {
      if (suggested === planBtn) planBtn.classList.add("suggest-btn");
      else suggested.insertAdjacentHTML("beforeend", `<div class="suggest">Start here</div>`);
    }
  }
}

/* ================= the session plan (Oct 2026, by request) ================= */
// The therapist's plan for the session: blocks of PLAN_BLOCK_MIN minutes, a
// game each, chosen on #screen-schedule after the arm's FIRST assessment and
// editable any time from the staff drawer or the profile screen. Stored per
// patient (store.getSchedule / setSchedule). Playing it: "Start the plan" on
// the hub runs block 1's game; between rounds the same game continues until
// the block's minutes (wall clock since the block began) are up, then "Next
// round" becomes "Next: <game>" and starts the next block fresh; after the
// last block "Finish for today" is the way on. Finishing early loses
// nothing: every round is logged as usual.
const PLAN_BLOCK_MIN = 15, PLAN_MAX_BLOCKS = 6;
let planDraft = [], planReturn = null;

// the games a block can hold: the enabled cards, Pong as its two games
function planChoices() {
  const out = [];
  for (const g of GAMES) {
    if (g.disabled) continue;
    if (g.id === "pong") {
      out.push({ key: "pong", game: "pong", axis: "fe", name: "Pong FE" });
      out.push({ key: "pong-abd", game: "pong", axis: "abd", name: "Pong Abd-Add" });
      continue;
    }
    out.push({ key: g.id, game: g.id, name: g.name });
  }
  return out;
}
const planKey = b => b.game === "pong" ? (b.axis === "abd" ? "pong-abd" : "pong") : b.game;
function planName(b) { return planChoices().find(c => c.key === planKey(b))?.name || GAMES.find(g => g.id === b.game)?.name || b.game; }
function planMinutes(blocks) { return blocks.reduce((s, b) => s + (b.minutes || PLAN_BLOCK_MIN), 0); }

// open the plan screen; `then` is where Save or Skip goes afterwards
function renderSchedule(then) {
  planReturn = then;
  const saved = store.getSchedule(state.patient);
  const choices = planChoices();
  planDraft = saved?.blocks?.length
    ? saved.blocks.map(b => ({ game: b.game, axis: b.axis, minutes: b.minutes || PLAN_BLOCK_MIN }))
    : [{ game: choices[0].game, axis: choices[0].axis, minutes: PLAN_BLOCK_MIN }];
  drawPlan();
  show("screen-schedule");
  document.querySelectorAll("#screen-schedule .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
  focusHint($("btn-plan-save"));
}
function drawPlan() {
  const choices = planChoices();
  const wrap = $("plan-blocks");
  wrap.innerHTML = "";
  planDraft.forEach((b, i) => {
    const row = document.createElement("div");
    row.className = "plan-block";
    const head = document.createElement("div");
    head.className = "plan-block-head";
    head.innerHTML = `<div><b>Block ${i + 1} · ${b.minutes} min</b><span class="pick">${planName(b)}</span></div>`;
    if (planDraft.length > 1) {
      const rm = document.createElement("button");
      rm.className = "plan-remove"; rm.textContent = "Remove"; rm.dataset.dwell = "1";
      rm.addEventListener("click", () => { planDraft.splice(i, 1); drawPlan(); });
      head.appendChild(rm);
    }
    row.appendChild(head);
    const tiles = document.createElement("div");
    tiles.className = "plan-tiles";
    for (const c of choices) {
      const t = document.createElement("button");
      t.className = "plan-tile" + (c.key === planKey(b) ? " on" : "");
      t.dataset.dwell = "1";
      t.innerHTML = (CARD_ART[c.game] || "") + `<div class="name">${c.name}</div>`;
      t.addEventListener("click", () => { b.game = c.game; b.axis = c.axis; drawPlan(); });
      tiles.appendChild(t);
    }
    row.appendChild(tiles);
    wrap.appendChild(row);
  });
  const total = planMinutes(planDraft);
  $("plan-total").textContent = `${planDraft.length} block${planDraft.length === 1 ? "" : "s"} · ${total} minutes`;
  $("btn-plan-add").disabled = planDraft.length >= PLAN_MAX_BLOCKS;
}
$("btn-plan-add").addEventListener("click", () => {
  if (planDraft.length >= PLAN_MAX_BLOCKS) return;
  const last = planDraft[planDraft.length - 1] || planChoices()[0];
  planDraft.push({ game: last.game, axis: last.axis, minutes: PLAN_BLOCK_MIN });
  drawPlan();
});
$("btn-plan-save").addEventListener("click", () => {
  store.setSchedule(state.patient, planDraft.map(b => ({ game: b.game, axis: b.axis, minutes: b.minutes })));
  speak(`Plan saved. ${planDraft.length} block${planDraft.length === 1 ? "" : "s"}, ${planMinutes(planDraft)} minutes.`);
  const then = planReturn; planReturn = null;
  (then || (() => { renderSelect(); show("screen-select"); }))();
});
$("btn-plan-skip").addEventListener("click", () => {
  const then = planReturn; planReturn = null;
  (then || (() => { renderSelect(); show("screen-select"); }))();
});

// the hub strip; returns its start button (or null when there is no plan)
function renderPlanStrip(gameLock) {
  const strip = $("plan-strip");
  const plan = store.getSchedule(state.patient);
  if (!plan?.blocks?.length) { strip.classList.add("hidden"); strip.innerHTML = ""; return null; }
  strip.classList.remove("hidden");
  const text = plan.blocks.map(b => `${planName(b)} ${b.minutes || PLAN_BLOCK_MIN} min`).join(" · ");
  strip.innerHTML = `<div>Today's plan: ${text}</div>`;
  const btn = document.createElement("button");
  btn.className = "btn"; btn.dataset.dwell = "1";
  btn.textContent = gameLock ? gameLock : "Start the plan";
  btn.disabled = !!gameLock;
  if (!gameLock) btn.addEventListener("click", startPlan);
  strip.appendChild(btn);
  return gameLock ? null : btn;
}
function startPlan() {
  const plan = store.getSchedule(state.patient);
  if (!plan?.blocks?.length) return;
  state.plan = { blocks: plan.blocks.map(b => ({ ...b, minutes: b.minutes || PLAN_BLOCK_MIN })), idx: 0, startedAt: 0 };
  startPlanBlock(0);
}
function startPlanBlock(i) {
  const p = state.plan;
  if (!p || i >= p.blocks.length) return;
  const b = p.blocks[i];
  p.idx = i; p.startedAt = Date.now();
  if (b.game === "pong") { state.pongMode = "solo"; state.pongAxis = b.axis || "fe"; $("in-pong").value = "solo"; }
  startGame(b.game, true);
}
// minutes left in the current block (0 when it is over)
function planLeftMin() {
  const p = state.plan;
  if (!p) return 0;
  const b = p.blocks[p.idx];
  return Math.max(0, Math.ceil((b.minutes * 60000 - (Date.now() - p.startedAt)) / 60000));
}
// the between-rounds card's plan line and the label of "Next round"
function renderPlanBetween() {
  const p = state.plan, line = $("rc-plan"), next = $("btn-next-round");
  next.textContent = "Next round";
  if (!p) { line.classList.add("hidden"); line.textContent = ""; return; }
  line.classList.remove("hidden");
  const left = planLeftMin();
  const last = p.idx >= p.blocks.length - 1;
  if (left > 0) {
    line.textContent = `Block ${p.idx + 1} of ${p.blocks.length} · ${left} min left`;
  } else if (!last) {
    const nm = planName(p.blocks[p.idx + 1]);
    line.textContent = `Block ${p.idx + 1} of ${p.blocks.length} done · next: ${nm}`;
    next.textContent = `Next: ${nm}`;
  } else {
    line.textContent = "That's the whole plan. Well done.";
    next.textContent = "One more round";
  }
}
// "Next round": the same game while the block runs, the next block's game
// once its minutes are up, and free play when there is no plan
function nextRound() {
  const p = state.plan;
  if (p && planLeftMin() === 0 && p.idx < p.blocks.length - 1) {
    const nm = planName(p.blocks[p.idx + 1]);
    speak(`Time for ${nm}.`);
    startPlanBlock(p.idx + 1);
    return;
  }
  startGame(state.lastGameId, false);
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

// Two-player Pong runs on either camera (Oct 2026): the ZED bridge streams
// two seats, and on the webcam the tracker follows a second body itself
// (`tracker.setSecond`). It only needs a tracker at all.
function duoAvailable() {
  return !!state.tracker;
}
// a Pong-art card for the setup screens
function pongCard(label, sub, onClick, art = CARD_ART.pong) {
  const b = document.createElement("button");
  b.className = "gcard"; b.dataset.dwell = "1";
  b.innerHTML = art + `<div class="dwell-fill"></div><div class="title">${label}<small>${sub}</small></div>`;
  b.addEventListener("click", onClick);
  return b;
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
  focusHint(focusBtn);   // current mode pre-focused: Enter just plays
}

// TWO-PLAYER SETUP (Oct 2026, by request: a tile of its own, the webcam
// tracking both people, the partner measured briefly here). Player 1 is the
// patient on their assessed arm. Player 2 is a PARTNER (a caregiver, a
// friend): not a patient and never on the login screen. Their arm gets a
// QUICK MEASURE (renderPartnerMeasure: three raises, about twenty seconds)
// that sets their paddle's lane, kept under this patient
// (store.savePartner); a patient already in the system can also be picked
// by name, on their own assessed arm. Both arms are chosen here and fixed
// for the game: the paddle follows the seat, never "whichever arm is up".
// The head-to-head record lives here too, with its reset.
function renderDuoSetup() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  const h1 = document.querySelector("#screen-select h1");
  h1.textContent = "Who is playing together?";
  const partners = store.getPartners(state.patient);
  const patients = store.listPatients().map(p => p.name).filter(n => n !== state.patient && n !== "guest" && !partners[n]);
  const names = [...Object.keys(partners), ...patients];
  state.duo = state.duo || { p2: names[0] || null, p2New: "", p1Side: state.side, p2Side: "right" };
  const d = state.duo;
  d.p1Side = state.side;
  if (d.p2 && !names.includes(d.p2)) d.p2 = null;
  const meas = d.p2 ? (partners[d.p2]?.[d.p2Side] || store.getProfile(d.p2, d.p2Side)) : null;
  const riv = d.p2 ? store.getRivalry(state.patient, d.p2) : null;

  const row = (label, html) => `<div class="duo-row"><span>${label}</span>${html}</div>`;
  const sideSel = (id, val) => `<select id="${id}" data-dwell="1">
      <option value="left"${val === "left" ? " selected" : ""}>Left arm</option>
      <option value="right"${val === "right" ? " selected" : ""}>Right arm</option>
    </select>`;
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  wrap.innerHTML = `<div class="duo-setup">
    ${row(`${state.patient} plays with`, sideSel("duo-p1side", d.p1Side))}
    ${row("Player 2", `<span class="duo-ctl"><select id="duo-p2" data-dwell="1">
        ${names.map(n => opt(n, n, d.p2)).join("")}
        <option value="__new"${!d.p2 ? " selected" : ""}>New partner…</option>
      </select><input id="duo-p2name" class="${d.p2 ? "hidden" : ""}" placeholder="Their name" maxlength="24" value="${(d.p2New || "").replace(/"/g, "")}"></span>`)}
    ${row("Player 2 plays with", sideSel("duo-p2side", d.p2Side))}
    ${row("Player 2's arm", meas
      ? `<span class="duo-meas">Measured: <b>${Math.round(meas.arcMinDeg)}°–${Math.round(meas.arcMaxDeg)}°</b> <button class="btn ghost-light" id="duo-measure" data-dwell="1">Measure again</button></span>`
      : `<span class="duo-meas">Not measured yet <button class="btn" id="duo-measure" data-dwell="1">Quick measure (20 s)</button></span>`)}
    ${row("Ball speed", `<select id="duo-speed" data-dwell="1">${opt("chill", "Chill", state.pongSpeed)}${opt("normal", "Normal", state.pongSpeed)}${opt("frantic", "Frantic", state.pongSpeed)}</select>`)}
    ${row("Power-ups", `<select id="duo-power" data-dwell="1">${opt("on", "On: orbs and power-ups", state.pongPowerups ? "on" : "off")}${opt("off", "Off", state.pongPowerups ? "on" : "off")}</select>`)}
    ${riv && riv.games ? row("Head to head", `<span class="duo-meas">You <b>${riv.wins}</b> – <b>${riv.losses}</b> ${d.p2}${riv.draws ? ` · ${riv.draws} drawn` : ""} · best rally ever <b>${riv.bestRally}</b>
        <button class="btn ghost-light" id="duo-reset" data-dwell="1">Reset record</button>
        <span id="duo-reset-confirm" class="hidden">Really reset it? <button class="btn" id="duo-reset-yes">Yes, reset</button> <button class="btn ghost-light" id="duo-reset-no">Keep</button></span></span>`) : ""}
    <p class="hint">Stand side by side, facing the camera, with ${state.patient} in view first. The camera keeps each
      of you on your own paddle for the whole game; if someone steps out, their paddle waits for them.
      Without a measure, player 2 gets a full-range lane.</p>
  </div>`;

  const p2Sel = $("duo-p2"), nameIn = $("duo-p2name");
  const readP2 = () => p2Sel.value === "__new" ? (nameIn.value || "").trim() : p2Sel.value;
  const sync = () => { d.p1Side = $("duo-p1side").value; d.p2Side = $("duo-p2side").value; if (p2Sel.value === "__new") { d.p2 = null; d.p2New = nameIn.value; } else d.p2 = p2Sel.value; };
  p2Sel.addEventListener("change", () => { sync(); renderDuoSetup(); });
  $("duo-p2side").addEventListener("change", () => { sync(); renderDuoSetup(); });
  nameIn.addEventListener("input", () => { d.p2New = nameIn.value; });
  $("duo-speed").addEventListener("change", e => { state.pongSpeed = e.target.value; $("in-pong-speed").value = state.pongSpeed; });
  $("duo-power").addEventListener("change", e => { state.pongPowerups = e.target.value === "on"; $("in-pong-power").value = e.target.value; });
  // the partner must have a name before anything is kept about them
  const commitP2 = () => {
    sync();
    const n = readP2();
    if (!n) { nameIn.classList.remove("hidden"); nameIn.placeholder = "Type their name first"; nameIn.focus(); return null; }
    if (!partners[n] && !store.hasPatient(n)) store.savePartner(state.patient, n, {});
    d.p2 = n; d.p2New = "";
    state.side = d.p1Side; $("in-arm").value = state.side;
    return n;
  };
  $("duo-measure").addEventListener("click", () => { if (commitP2()) renderPartnerMeasure(); });
  if ($("duo-reset")) {
    $("duo-reset").addEventListener("click", () => { $("duo-reset").classList.add("hidden"); $("duo-reset-confirm").classList.remove("hidden"); });
    $("duo-reset-yes").addEventListener("click", () => { store.resetRivalry(state.patient, d.p2); renderDuoSetup(); });
    $("duo-reset-no").addEventListener("click", () => { $("duo-reset").classList.remove("hidden"); $("duo-reset-confirm").classList.add("hidden"); });
  }

  const play = pongCard("Play", "Start the game", () => { if (commitP2()) startGame("pong", true); });
  wrap.appendChild(play);
  wrap.appendChild(pongCard("↩ Back", "All games", renderSelect));
  focusHint(play);
}

// THE PARTNER'S QUICK MEASURE: about twenty seconds, three raises of the arm
// they will play with, while the patient stays in view. The lowest and
// highest arm elevation seen (tracker.armAngle2, the same convention as the
// patient's assessment) become their paddle's lane. Brief on purpose: the
// partner is not the one being treated.
function renderPartnerMeasure() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  const d = state.duo, side = d.p2Side;
  document.querySelector("#screen-select h1").textContent = `${d.p2}, let's measure your arm`;
  wrap.innerHTML = `<div class="duo-setup">
    <p class="duo-big">Stand beside ${state.patient}, facing the camera. Raise your <b>${side}</b> arm out and up as high as is
      comfortable, then lower it again. <b>Three times.</b></p>
    <div class="meas-bar"><div class="meas-fill" id="meas-fill"></div><div class="meas-mark" id="meas-now"></div></div>
    <div class="duo-row"><span id="meas-state">Looking for you…</span><span id="meas-dots">○ ○ ○</span><span id="meas-time">25 s</span></div>
  </div>`;
  const t = state.tracker;
  t.setSecond?.(true); t.relockSecond?.();
  let lo = null, hi = null, cycles = 0, up = false, seen = false, t0 = performance.now(), timer = null, done = false;
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const finish = () => {
    if (done) return; done = true; stop();
    if (lo != null && hi != null && hi - lo >= 15) {
      store.savePartner(state.patient, d.p2, { [side]: { arcMinDeg: Math.round(lo), arcMaxDeg: Math.round(hi) } });
      speakLine(`Lovely, ${d.p2}. Your range is measured.`);
    } else speakLine("I could not see the arm clearly. We can try again, or play with a full-range lane.");
    renderDuoSetup();
  };
  wrap.appendChild(pongCard("↩ Back", "Without measuring", () => { stop(); done = true; renderDuoSetup(); }));
  speakLine(`${d.p2}, raise your ${side} arm as high as is comfortable, then lower it. Three times.`);
  timer = setInterval(() => {
    if (state.screen !== "screen-select") { stop(); return; }
    const a = t.armAngle2?.(side);
    const left = Math.max(0, 25 - (performance.now() - t0) / 1000);
    $("meas-time").textContent = `${Math.ceil(left)} s`;
    if (a == null) {
      $("meas-state").textContent = seen ? "Lost you for a moment…" : `Looking for you… stand beside ${state.patient}`;
      if (seen && left <= 0) finish();
      else if (!seen && performance.now() - t0 > 40000) finish();
      return;
    }
    if (!seen) { seen = true; t0 = performance.now(); }   // the clock starts once they are seen
    lo = lo == null ? a : Math.min(lo, a); hi = hi == null ? a : Math.max(hi, a);
    const span = hi - lo;
    if (span > 30) {
      if (!up && a > lo + span * 0.7) up = true;
      else if (up && a < lo + span * 0.3) { up = false; cycles++; audio.note(Math.min(7, cycles * 2)); }
    }
    $("meas-fill").style.left = `${Math.max(0, lo) / 180 * 100}%`;
    $("meas-fill").style.width = `${Math.max(0, span) / 180 * 100}%`;
    $("meas-now").style.left = `${Math.max(0, Math.min(180, a)) / 180 * 100}%`;
    $("meas-state").textContent = up ? "Lovely, now lower it" : "Raise your arm";
    $("meas-dots").textContent = [0, 1, 2].map(i => i < cycles ? "●" : "○").join(" ");
    if (cycles >= 3 || left <= 0) finish();
  }, 50);
}

// THE LANTERN'S LEVEL MAP (Oct 2026, by request: keep the level choice and
// the leaderboard, so every stage can be tried). Six stages, every level a
// button, the ladder's own level marked; the Guild board beside it.
function renderLanternLevels() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  document.querySelector("#screen-select h1").textContent = "The Lantern: where shall we start?";
  const cur = store.getLevel(state.patient, "candlesLevel");
  const prog = store.getProgress(state.patient, "candlesLumen") || {};
  const stars = prog.stars || {}, best = prog.best || {};
  let html = `<div class="duo-setup lvl-map">`;
  LUMEN_STAGES.forEach((st, k) => {
    html += `<div class="lvl-stage"><div class="lvl-name">Stage ${k + 1} · ${st.name}</div><div class="lvl-row">`;
    for (let L = st.from; L <= st.to; L++)
      html += `<button class="lvl-btn${L === cur ? " cur" : ""}${best[L] ? " played" : ""}" data-level="${L}" data-dwell="1" title="${best[L] ? `best ${best[L]}` : "not played"}">${L}<small>${"★".repeat(stars[L] || 0)}</small></button>`;
    html += `</div></div>`;
  });
  html += `<p class="hint">The ladder stands at level <b>${cur}</b>. Any level can be played (to try a stage out); the ladder carries on from the level played.</p>`;
  html += lanternBoardHTML(prog);
  html += `</div>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll(".lvl-btn").forEach(b => b.addEventListener("click", () => {
    state.candlesLevelPick = +b.dataset.level;
    startGame("candles", true);
  }));
  const stName = LUMEN_STAGES.find(st => cur >= st.from && cur <= st.to)?.name || "";
  const play = pongCard(`Continue · Level ${cur}`, stName, () => { state.candlesLevelPick = null; startGame("candles", true); }, CARD_ART.candles);
  wrap.appendChild(play);
  wrap.appendChild(pongCard("↩ Back", "All games", renderSelect, CARD_ART.candles));
  focusHint(play);
}

// THE LAMPLIGHTERS' GUILD (from the Lantern mockup, by request): a board of
// villagers whose scores are anchored to the patient's very first level,
// against the patient's best single level today, so improving over the days
// moves them up the board. The villagers are fictional and fixed; nothing
// here compares one patient with another.
const GUILD = [["Grandma Sela", 2.6], ["Captain Ravi", 2.2], ["Ferryman Jo", 1.9], ["Nila the Baker", 1.65], ["Kofi the Smith", 1.45],
  ["Elder Moss", 1.28], ["Ada of the Mill", 1.12], ["Little Wren", 0.95], ["Bram the Shepherd", 0.8], ["Pip the Owl", 0.62]];
function lanternBoardHTML(prog) {
  const days = prog.days || [];
  const first = days.find(x => x.scores?.length)?.scores?.[0] || 0;
  if (!first) return `<div class="board"><h3>🏆 Lamplighters' Guild</h3><p class="hint">Light your first level and the Guild's board opens.</p></div>`;
  const today = days.find(x => x.date === dayKey());
  const mine = today?.scores?.length ? Math.max(...today.scores) : 0;
  const ref = Math.max(400, first);
  const seed = i => (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const rows = GUILD.map(([name, f], i) => ({ name, score: Math.round(ref * f * (0.96 + 0.08 * Math.abs(seed(i + 7))) / 10) * 10 }));
  rows.push({ name: `${state.patient} (today's best)`, score: mine, me: true });
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const me = rows.find(r => r.me), rank = me.rank;
  const keep = rows.filter(r => r.rank <= 5 || Math.abs(r.rank - rank) <= 1);
  let html = "", last = 0;
  for (const r of keep) {
    if (r.rank - last > 1) html += `<tr><td colspan="3" class="dots">⋯</td></tr>`;
    last = r.rank;
    html += `<tr class="${r.me ? "me" : ""}"><td>${r.rank === 1 ? "👑" : r.rank}</td><td class="nm">${r.me ? "⭐ " : ""}${r.name}</td><td>${r.score.toLocaleString()}</td></tr>`;
  }
  const next = rows[rank - 2];
  const chase = !mine ? "Light a level today to take your place."
    : next ? `${(next.score - me.score + 10).toLocaleString()} more points to pass ${next.name}.` : "Top of the Guild!";
  const dayN = days.filter(x => x.scores?.length).length;
  return `<div class="board"><h3>🏆 Lamplighters' Guild · best single level</h3>
    <p>You are <b>#${rank}</b> of ${rows.length}${dayN > 1 ? ` · day ${dayN}` : ""}. ${chase}</p>
    <table><tr><th>#</th><th class="nm">Lamplighter</th><th>Score</th></tr>${html}</table></div>`;
}

/* ================= assessment ================= */
// ONE arm: the one chosen at setup. Two steps (two circles and a lift, then
// five targets), about four minutes.
//
// ONE A DAY (Sep 2026, by request): the day's first visit measures, and
// that measurement stands for the day. Within the day a stored ROM is
// reused, never redone; "Re-measure" from the staff drawer or the profile
// screen is the therapist's override, and the replaced profile goes to
// history so the compare screen has a "before".
// was this arm measured today (local day)? The once-a-day rule reads this.
function measuredToday(prof) {
  return !!prof?.date && new Date(prof.date).toDateString() === new Date().toDateString();
}
function noCamera() {
  if (state.tracker) return false;
  speak("The camera is not running. Press Try again, or ask a staff member.");
  $("loading").classList.remove("hidden");
  return true;
}
function startAssessment(opts = {}) {
  if (noCamera()) return;
  const arm = state.side;
  const prof = store.getProfile(state.patient, arm);
  const firstEver = !prof;    // the arm's first measurement: the therapist's plan screen follows it
  if (prof && measuredToday(prof) && !opts.override) {
    speak("Your reach is already measured today. Once a day is plenty.");
    renderSelect();
    show("screen-select");
    return;
  }
  if (!opts.force && prof) {
    // already on file: say so plainly rather than silently doing nothing
    speak("That measurement is already saved. Nothing to redo.");
    renderSelect();
    show("screen-select");
    return;
  }
  // warm up first (Oct 2026, by request): the day's measurement opens with
  // the short stretch, once a session, skippable with the ✕; a staff
  // re-measure (override) goes straight in
  if (!opts.override && !state.warmedUp) {
    startWarmup(() => startAssessment(opts));
    return;
  }
  show("stage");
  audio.startBgm("assessment");
  const a = new Assessment(state.tracker, $("canvas"), arm, state.coachSens, {
    label: `${arm === "left" ? "Left" : "Right"} arm`,
    // device-level A/B switch (staff drawer): the drawn figure with two
    // circles and a lift, or the instruction video
    style: localStorage.getItem("strive-assess-style") || "video",
  });
  state.current = a;
  const t0 = performance.now();
  a.start(profile => {
    profile.params = initialParams(profile);
    store.saveProfile(state.patient, profile.arm, profile);
    store.logPlaytime(state.patient, performance.now() - t0, "assessment");
    snapshot(state.patient);
    audio.stopBgm();
    audio.fanfare();
    // what actually changed, before anyone goes back to playing: a
    // re-measure that never shows you the difference is just a delay
    const showResult = () => {
      renderRomCompare([arm]);
      show("screen-romcompare");
      romLiveLoop();
      focusHint($("btn-rom-done"));
    };
    // the arm's first measurement: the therapist chooses the session plan
    // (15-minute blocks, a game each) before the result and the hub
    if (firstEver) renderSchedule(showResult);
    else showResult();
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
// The outcome drawn on the person: the live mirror with the skeleton, the
// measured shape anchored to the body exactly as the assessment drew it
// (same envelope, same body centre, same relToPx), last time's shape dashed
// under it, and a dotted circle of the arm's own length around the assessed
// shoulder as the "what would full reach look like" reference.
function romLiveLoop() {
  if (state.screen !== "screen-romcompare") return;
  requestAnimationFrame(romLiveLoop);
  const c = $("rom-live"), t = state.tracker;
  if (!c || !t) return;
  const box = c.getBoundingClientRect();
  const W = Math.max(2, Math.round(box.width)), H = Math.max(2, Math.round(box.height));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext("2d");
  // No camera picture here (Sep 2026, by request): the room behind the
  // patient said nothing about their reach. A plain dark stage, and a
  // schematic figure at the body centre so it is clear WHERE the shape is
  // measured from: the middle of the shoulders, the assessed arm's own
  // shoulder marked.
  ctx.fillStyle = "#161636"; ctx.fillRect(0, 0, W, H);
  const arm = state.side;
  const prof = store.getProfile(state.patient, arm);
  if (!prof?.envelope) return;
  if (!t.frame) t.setBaseline?.();
  if (!t.frame) return;
  romFigure(ctx, c, t, arm, prof);
  const prev = (store.getPatient(state.patient).history[arm] || []).slice(-1)[0] || null;
  const TAU = Math.PI * 2;
  const cen = prof.center || { x: 0, y: 0 };
  // through the real corner points when the profile has them (Sep 2026 on),
  // else through the wedge radii at their centres (older profiles)
  const shape = (env, pts, style) => {
    const n = env.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = i % n, p = pts?.[k];
      const th = (k + 0.5) / n * TAU, r = env[k];
      const rel = p ? { x: cen.x + p.x, y: cen.y + p.y } : { x: cen.x + Math.cos(th) * r, y: cen.y + Math.sin(th) * r };
      const q = t.relToPx(rel, c);
      i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    }
    ctx.closePath(); style();
  };
  ctx.save();
  // full arm length around the assessed shoulder: the reference, the
  // "ideal" the big number is a percentage of. Drawn from the schematic
  // shoulder (half a shoulder width from the centre), not the live one, so
  // it stays put whether or not anyone is in front of the camera.
  if (prof.armLenSW) {
    const sr = { x: cen.x + (arm === "right" ? 0.5 : -0.5), y: cen.y };
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const th = i / 48 * TAU;
      const q = t.relToPx({ x: sr.x + Math.cos(th) * prof.armLenSW, y: sr.y + Math.sin(th) * prof.armLenSW }, c);
      i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    }
    ctx.strokeStyle = "rgba(244,236,221,0.6)"; ctx.lineWidth = 2.5; ctx.setLineDash([3, 8]); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (prev?.envelope) shape(prev.envelope, prev.envPts, () => {
    ctx.strokeStyle = "rgba(244,236,221,0.5)"; ctx.lineWidth = 2.5; ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]);
  });
  shape(prof.envelope, prof.envPts, () => {
    ctx.fillStyle = "rgba(232,168,106,0.16)"; ctx.fill();
    ctx.strokeStyle = "rgba(232,168,106,0.85)"; ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(232,168,106,0.35)"; ctx.shadowBlur = 10; ctx.stroke();
  });
  // the body centre everything is measured from
  const o = t.relToPx(cen, c);
  ctx.shadowBlur = 0; ctx.fillStyle = "rgba(244,236,221,0.7)";
  ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

// The schematic figure under the workspace shape: head, shoulders, trunk
// and hips in shoulder-width units about the body centre, the assessed
// arm's shoulder marked. It is a drawing, not the patient; its job is to
// say where the shape is measured from.
function romFigure(ctx, c, t, arm, prof) {
  const TAU = Math.PI * 2;
  const cen = prof.center || { x: 0, y: 0 };
  const P = (x, y) => t.relToPx({ x: cen.x + x, y: cen.y + y }, c);
  const torso = prof.torsoSW || 1.05;
  ctx.save();
  ctx.strokeStyle = "rgba(244,236,221,0.28)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const shL = P(-0.5, 0), shR = P(0.5, 0), hipL = P(-0.32, -torso), hipR = P(0.32, -torso);
  ctx.beginPath(); ctx.moveTo(shL.x, shL.y); ctx.lineTo(shR.x, shR.y); ctx.lineTo(hipR.x, hipR.y); ctx.lineTo(hipL.x, hipL.y); ctx.closePath(); ctx.stroke();
  const neck = P(0, 0.12), head = P(0, 0.42);
  ctx.beginPath(); ctx.moveTo(P(0, 0).x, P(0, 0).y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
  const hr = Math.abs(P(0.22, 0).x - P(0, 0).x);
  ctx.beginPath(); ctx.arc(head.x, head.y, hr, 0, TAU); ctx.stroke();
  // the other arm, resting; the assessed shoulder gets a marker and a label
  const other = arm === "right" ? shL : shR, ox = arm === "right" ? -1 : 1;
  const el = P(ox * 0.62, -0.55), wr = P(ox * 0.6, -1.05);
  ctx.beginPath(); ctx.moveTo(other.x, other.y); ctx.lineTo(el.x, el.y); ctx.lineTo(wr.x, wr.y); ctx.stroke();
  const mine = arm === "right" ? shR : shL;
  ctx.fillStyle = "#e8a86a";
  ctx.beginPath(); ctx.arc(mine.x, mine.y, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(244,236,221,0.75)"; ctx.font = "700 14px Nunito, sans-serif";
  ctx.textAlign = arm === "right" ? "left" : "right";
  ctx.fillText(`${arm} shoulder`, mine.x + (arm === "right" ? 12 : -12), mine.y - 12);
  ctx.restore();
}

// After the assessment (Sep 2026 rework, by request): no table. One big
// number — how much of the full circle the wrist covered — with a plain
// sentence and a "vs last time" chip, three tiles (lift, targets, longest
// reach) each with one sentence, and a plot of that percentage over the
// assessment days. The full circle is the ideal: every point the arm could
// reach if it swung all the way round its own length, which is exactly what
// `coverage` is measured against (area / π·armLen²).
const fmtDay = d => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function renderRomCompare(arms) {
  const arm = arms[0];
  const p = store.getPatient(state.patient);
  const cm = p.shoulderCm;
  const cur = p.profiles[arm];
  const hist = p.history[arm] || [];
  const prev = hist.slice(-1)[0] || null;
  $("rom-sub").textContent = `${arm === "left" ? "Left" : "Right"} arm${
    cur?.style === "video" ? ", measured with the video" : ""}${prev ? `. Last time was ${fmtDay(prev.date)}.` : ". This is your first measurement, the one we compare to from now on."}`;
  if (!cur) { $("rom-big").innerHTML = ""; $("rom-tiles").innerHTML = ""; $("rom-plot").innerHTML = ""; return; }

  const pct = v => v == null ? null : Math.round(v * 100);
  const nowPct = pct(cur.coverage) ?? 0, wasPct = pct(prev?.coverage);
  const dPct = wasPct == null ? null : nowPct - wasPct;
  const chip = dPct == null ? `<span class="chip sm">first measurement</span>`
    : Math.abs(dPct) < 3 ? `<span class="chip sm">about the same as last time</span>`
    : dPct > 0 ? `<span class="chip up">▲ ${dPct} points more than last time</span>`
    : `<span class="chip dn">▼ ${-dPct} points less than last time</span>`;
  const word = nowPct >= 80 ? "Nearly the whole circle. Wonderful."
    : nowPct >= 55 ? "More than half of the circle. Good going."
    : nowPct >= 30 ? "About a third of the circle. Every session can grow it."
    : "A small part of the circle for now. We will build it up together.";
  $("rom-big").innerHTML = `
    <div class="pct">${nowPct}%</div>
    <div class="of">of the full circle your arm could reach</div>
    ${chip}
    <div class="say">${word}</div>`;

  // three tiles, one sentence each
  const tile = (lab, val, unit, was, now, fmt, say) => {
    let d = "";
    if (was != null && now != null) {
      const diff = now - was;
      d = Math.abs(diff) < 1e-9 ? `<span class="dlt sm">same as last time</span>`
        : `<span class="dlt ${diff > 0 ? "up" : "dn"}">${diff > 0 ? "▲" : "▼"} ${fmt(Math.abs(diff))} vs last time</span>`;
    } else d = `<span class="dlt sm">baseline</span>`;
    return `<div class="rom-tile"><div class="lab">${lab}</div>
      <div class="val">${now == null ? "–" : fmt(now)}${unit ? ` <small>${unit}</small>` : ""}</div>
      ${d}<div class="say">${say}</div></div>`;
  };
  const tiles = [];
  const liftNow = cur.lift?.peakDeg ?? cur.arcMaxDeg, liftWas = prev?.lift?.peakDeg ?? prev?.arcMaxDeg;
  if (liftNow != null) tiles.push(tile("How high the arm lifted", null, "of 180°", liftWas, liftNow,
    v => `${Math.round(v)}°`, "Straight up is 180 degrees. Out to the side is 90."));
  if (cur.extremes?.length) {
    const n = cur.extremes.filter(e => e.reached).length, w = prev?.extremes ? prev.extremes.filter(e => e.reached).length : null;
    tiles.push(tile("Targets reached", null, `of ${cur.extremes.length}`, w, n, v => `${Math.round(v)}`,
      "Five spots inside your own shape, each held for a moment."));
  }
  if (cur.envelope?.length) {
    const n = Math.max(...cur.envelope), w = prev?.envelope ? Math.max(...prev.envelope) : null;
    const fmt = v => cm ? `${Math.round(v * cm)} cm` : `${v.toFixed(2)} SW`;
    tiles.push(tile("Longest reach", null, "", w, n, fmt,
      cm ? "Measured from the middle of your shoulders." : "In shoulder widths, from the middle of your shoulders."));
  }
  $("rom-tiles").innerHTML = tiles.join("");

  // the plot: coverage per assessment day, 0..100%, one series, amber
  const pts = [...hist.map(h => ({ d: h.date, v: pct(h.coverage) })), { d: cur.date, v: nowPct }]
    .filter(q => q.d && q.v != null);
  $("rom-plot").innerHTML = romPlot(pts);
}

// A single-series line: days across, percent up, 0/50/100 guides only, the
// latest point bigger and labelled, the first labelled too, dates under the
// points (thinned when they crowd). One point: a lone dot and a sentence.
function romPlot(pts) {
  const W = 900, H = 260, L = 56, R = 28, T = 26, B = 46;
  if (!pts.length) return "";
  const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts[pts.length - 1].d).getTime();
  const span = Math.max(1, t1 - t0);
  const x = q => pts.length === 1 ? (L + W - R) / 2 : L + (new Date(q.d).getTime() - t0) / span * (W - L - R);
  const y = v => T + (1 - v / 100) * (H - T - B);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reach over time">`;
  for (const g of [0, 50, 100]) {
    out += `<line class="ax" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/>`;
    out += `<text class="lbl" x="${L - 10}" y="${y(g) + 4}" text-anchor="end">${g}%</text>`;
  }
  if (pts.length > 1) {
    out += `<polyline class="ln" points="${pts.map(q => `${x(q).toFixed(1)},${y(q.v).toFixed(1)}`).join(" ")}"/>`;
  }
  const every = Math.max(1, Math.ceil(pts.length / 7));
  pts.forEach((q, i) => {
    const last = i === pts.length - 1;
    out += `<circle class="dot${last ? " now" : ""}" cx="${x(q)}" cy="${y(q.v)}" r="${last ? 8 : 6}"><title>${fmtDay(q.d)}: ${q.v}%</title></circle>`;
    if (last || i === 0) out += `<text class="val" x="${x(q)}" y="${y(q.v) - 14}" text-anchor="middle">${q.v}%</text>`;
    if (last || i % every === 0) out += `<text class="lbl" x="${x(q)}" y="${H - B + 24}" text-anchor="middle">${fmtDay(q.d)}</text>`;
  });
  if (pts.length === 1) out += `<text class="one" x="${(L + W - R) / 2}" y="${H - B + 24 + 18}" text-anchor="middle">Your first point. The line starts next time.</text>`;
  return out + `</svg>`;
}

/* ================= game rounds ================= */
// (The Pong grip and spin skill shots, and the staff select that switched
// them, were removed Sep 2026 by request: Pong asks nothing of the hand or
// the wrist. The trick shots that replaced them come on the point's clock,
// see TRICKS in games.js.)
// the two Pongs keep their own difficulty: a sideways paddle is a different
// pace from an up-and-down one, so the tutorial's speed measurement and the
// DDA are stored under their own key
function paramKey(id, axis) { return id === "pong" && axis === "abd" ? "pong-abd" : id; }

function startGame(id, fresh) {
  const prof = store.getProfile(state.patient, state.side);
  if (noCamera() || !prof) return;
  if (fresh) { state.roundNumber = 0; state.sessionStars = 0; state.driftStage = 1; }
  state.roundNumber++;
  state.lastGameId = id;

  const def = GAMES.find(g => g.id === id);
  const p = store.getPatient(state.patient);
  // this game's OWN difficulty, remembered per patient and per arm. A game
  // never played inherits the assessment-seeded params — the assessment is
  // the seed for all of them, it is just no longer the only memory.
  const stored = store.getGameParams(state.patient, state.side, paramKey(id, state.pongAxis));
  const base = stored || prof.params;
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
      : id === "dots" ? store.getLevel(state.patient, "dotsLevel")
      : id === "pairs" ? store.getLevel(state.patient, "pairsLevel")
      : id === "candles" ? (state.candlesLevelPick || store.getLevel(state.patient, "candlesLevel")) : undefined,
    mode: id === "pong" ? state.pongMode
      : id === "candles" ? state.candlesMode
      : id === "oars" ? state.oarsMode
      : id === "ferry" ? state.ferryMode
      : undefined,
    axis: id === "pong" ? state.pongAxis : undefined,
    // the Lantern's per-level bests and Star Atlas (Pip's flag is set from them)
    lumen: id === "candles" ? store.getProgress(state.patient, "candlesLumen") : undefined,
    starRank: id === "pong" ? store.getLevel(state.patient, "starRank") : undefined,
    // Pong's round-1 tutorial SETS the ball's pace only on the first game
    // ever on this arm (no stored Pong difficulty yet); after that it is a
    // warm-up and the pace is the level the patient has reached
    calibrate: id === "pong" && !stored,
    // the Pong dials, the same for the single and the two-player game
    pongSpeed: id === "pong" ? state.pongSpeed : undefined,
    powerups: id === "pong" ? state.pongPowerups : undefined,
    song: id === "rhythm" ? state.song : undefined,
    tilesMode: id === "rhythm" ? state.tilesMode : undefined,
    bothArms: (id === "pong" && ["bimanual", "coupled", "team-arms"].includes(state.pongMode))
      || (id === "rhythm" && state.tilesMode === "bimanual")
      || id === "rgs"      // the RGS catch needs both hands by definition
      || (id === "candles" && state.candlesMode !== "solo"),   // one hand keeps the candle, the other lights
    profiles: { left: store.getProfile(state.patient, "left"), right: store.getProfile(state.patient, "right") },
    // two-player Pong: player 2's own assessed arc drives their paddle, so a
    // limited range still covers the lane (a guest gets the default arc)
    ...(id === "pong" && state.pongMode === "duo" ? {
      p2Side: state.duo?.p2Side || "right",
      p2Name: state.duo?.p2 || null,
      p2Profile: duoProfile(),
    } : {}),
  });
  state.current = game;
  state.candlesLevelPick = null; $("in-candles-level").value = "";   // a picked level is for one round
  // the webcam follows a second body only while two are playing
  state.tracker.setSecond?.(id === "pong" && state.pongMode === "duo");
  show("stage");
  // Melody Tiles owns its song clock (audio.startSong inside the game);
  // everything else gets the per-game lo-fi mood (or assets/music/<id>.mp3)
  if (id !== "rhythm") audio.startBgm(id);
  game.start(onRoundEnd);
}

// player 2's lane: the partner's quick measure for the arm they play with,
// else a patient's own assessed profile, else a full-range lane
function duoProfile() {
  const d = state.duo;
  if (!d?.p2) return { arcMinDeg: 30, arcMaxDeg: 150 };
  const m = store.getPartners(state.patient)[d.p2]?.[d.p2Side];
  if (m) return { arcMinDeg: m.arcMinDeg, arcMaxDeg: m.arcMaxDeg };
  return store.getProfile(d.p2, d.p2Side) || { arcMinDeg: 30, arcMaxDeg: 150 };
}

function onRoundEnd(round) {
  audio.stopBgm();
  round.round = state.roundNumber;
  store.logPlaytime(state.patient, (round.seconds || 0) * 1000, "round");
  // Stars are minutes of play (Oct 2026, by request): one star for every
  // whole minute, with the odd seconds carried into the next round so two
  // 45-second rounds give one star between them and no time is ever lost.
  // The game's own score stays on the record as `gamePoints` for the therapist.
  round.gamePoints = round.stars || 0;
  if (A11Y.practice) round.stars = 0;          // nothing counts in practice
  else {
    const sec = (round.seconds || 0) + (state.starCarrySec || 0);
    round.stars = Math.floor(sec / 60);
    state.starCarrySec = sec - round.stars * 60;
  }
  // Scratch Cards: bank the level the round ended on
  if (round.game === "lens" && round.scratchLevel) {
    store.setLevel(state.patient, "scratchLevel", round.scratchLevel, 6);
  }
  if (round.game === "pairs" && round.pairsLevel) {
    store.setLevel(state.patient, "pairsLevel", round.pairsLevel, 6);
  }
  if (round.game === "dots" && round.dotsLevel) {
    store.setLevel(state.patient, "dotsLevel", round.dotsLevel, 6);
  }
  if (round.game === "candles") {
    if (round.candlesLevel) store.setLevel(state.patient, "candlesLevel", round.candlesLevel, CANDLE_MAX);
    if (round.candlesProgress) {
      // the day history behind the Guild board: every level's score, per day
      const pr = round.candlesProgress;
      pr.days = [...(store.getProgress(state.patient, "candlesLumen")?.days || [])];
      const key = dayKey();
      let d = pr.days.find(x => x.date === key);
      if (!d) pr.days.push(d = { date: key, scores: [] });
      d.scores.push(round.score || 0);
      pr.days = pr.days.slice(-90);
      store.setProgress(state.patient, "candlesLumen", pr);
    }
  }

  // practice mode: free play — nothing logged, difficulty untouched
  if (A11Y.practice) {
    renderBetween(round, "Practice round. Nothing counts, just enjoy the movement.");
    show("screen-between");
    document.querySelectorAll("#screen-between .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
    focusHint($("btn-next-round"));
    return;
  }

  store.logRound(state.patient, round);
  if (round.game === "pong" && round.pongMode === "duo") store.logRivalry(state.patient, round.p2Name || "guest", round.matchWon, round.bestRally);
  state.sessionStars += round.stars;
  // the lantern street only ever gains (village.js)
  if (round.game === "candles") store.addLanterns(state.patient, round.lanternsLit);
  snapshot(state.patient);

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
  // Pong tutorial warm-up: on the FIRST game ever on this arm the measured
  // paddle speed becomes the ball's crossing time (the level starts from
  // what was measured). Later tutorials are warm-ups only (Oct 2026, by
  // request): re-seeding every session threw away the level the patient
  // had played their way to.
  if (round.game === "pong" && round.pongCrossTime && round.calibrated) result.params.lifetime = round.pongCrossTime;
  // Pong: the ball's pace follows the GAME, not the hit rate (Sep 2026, by
  // request). A won game (more points than the star over the 90 s) makes
  // the next game's ball quicker (a shorter crossing time), a lost game
  // makes it slower, both within the DDA's limits; and the star climbs or
  // drops a rank with it (STAR_RANKS in games.js: colours, glow, sparkle
  // and sharper reactions), stored per patient as "starRank". A draw, or a
  // game with no points, changes nothing.
  if (round.game === "pong" && round.matchWon != null) {
    const [lo, hi] = LIMITS.lifetime;
    result.params.lifetime = Math.max(lo, Math.min(hi, result.params.lifetime * (round.matchWon ? 0.88 : 1.15)));
    if (round.pongMode === "duo") {
      // two players: the ball follows the result, the star's rank is not in it
      result.note = round.matchWon ? "You won! A quicker ball next game." : "A slower ball next game.";
    } else {
      const rank = store.getLevel(state.patient, "starRank");
      const next = Math.max(1, Math.min(STAR_RANKS.length, rank + (round.matchWon ? 1 : -1)));
      store.setLevel(state.patient, "starRank", next, STAR_RANKS.length);
      const name = STAR_RANKS[next - 1].name;
      result.note = round.matchWon
        ? `You won! A quicker ball next game${next > rank ? `, against a ${name}` : ""}.`
        : `A slower ball next game${next < rank ? `, against a ${name}` : ""}.`;
    }
  } else if (round.game === "pong" && round.pointsPlayed > 0) {
    result.note = "A draw! The same ball next game.";
  }
  store.saveGameParams(state.patient, state.side, paramKey(round.game, round.axis), result.params);
  // profile.params is deliberately NOT written here: it stays the
  // assessment-seeded starting difficulty, so a game played for the first
  // time starts from what the patient was measured at rather than inheriting
  // whatever the last game happened to drift to.

  // rest pacing: every 4th round, or a compensation spike (fatigue proxy),
  // earns a gentle spoken + captioned break suggestion — never an auto-stop
  if (state.roundNumber % 4 === 0 || round.compEvents.length >= 4) {
    const rest = coachLine("fatigue_detected");       // the coach's own words for a break
    result.note += " " + rest;
    setTimeout(() => speak(rest + " Continue whenever you are ready."), 1200);
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
  // default-first: Enter continues the session without hunting for a button;
  // once the plan's last block is over, finishing is the way on
  document.querySelectorAll("#screen-between .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
  const planDone = state.plan && planLeftMin() === 0 && state.plan.idx >= state.plan.blocks.length - 1;
  focusHint($(planDone ? "btn-finish" : "btn-next-round"));
}

/* ================= P5 between rounds ================= */
// The round card (Oct 2026, by request, after the user's mockup), the same
// for every game: the stars pill (+n this round, lifetime saved), one big
// headline, one plain sentence of fact, a row of glyphs for the count the
// sentence names, the three faces, Play again. The number is the sentence;
// nothing else is scored on screen.
const RC_GLYPHS = {
  star: `<svg viewBox="0 0 24 24" width="40" height="40"><polygon points="12,2 14.9,8.6 22,9.3 16.5,14 18.3,21 12,17.3 5.7,21 7.5,14 2,9.3 9.1,8.6" fill="#e8a86a"/></svg>`,
  lantern: `<svg viewBox="0 0 30 44" width="42" height="60"><rect x="3" y="3" width="24" height="38" rx="9" fill="#e8a86a"/><ellipse cx="15" cy="22" rx="5" ry="7" fill="#fff3c9"/></svg>`,
  ball: `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="17" fill="#e8a86a"/><circle cx="14" cy="14" r="5" fill="#fff3c9" opacity=".8"/></svg>`,
  card: `<svg viewBox="0 0 32 44" width="36" height="50"><rect x="2" y="2" width="28" height="40" rx="5" fill="#e8a86a"/><rect x="9" y="12" width="14" height="20" rx="3" fill="#fff3c9"/></svg>`,
  jet: `<svg viewBox="0 0 56 32" width="56" height="32"><path d="M4 18 L30 8 L52 14 L50 20 L30 24 L12 24 Z" fill="#e8a86a"/><path d="M26 10 L34 2 L40 4 L34 11 Z" fill="#c77f4a"/><circle cx="40" cy="15" r="3" fill="#fff3c9"/></svg>`,
  crate: `<svg viewBox="0 0 40 40" width="40" height="40"><rect x="3" y="3" width="34" height="34" rx="5" fill="#e8a86a"/><path d="M3 20 H37 M20 3 V37" stroke="#fff3c9" stroke-width="3"/></svg>`,
  cloud: `<svg viewBox="0 0 48 32" width="48" height="32"><path d="M12 28 a8 8 0 0 1 -1 -16 a10 10 0 0 1 19 -4 a8 8 0 0 1 8 12 a7 7 0 0 1 -2 8 Z" fill="#e8a86a"/></svg>`,
  dot: `<svg viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="9" fill="#e8a86a"/></svg>`,
};
const RC_MAX_GLYPHS = 12;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// headline, sentence, glyph and count for one round record
function roundSummary(round) {
  const r = round, g = r.game;
  const gname = GAMES.find(x => x.id === g)?.name ?? "";
  const minutes = Math.max(1, Math.round((r.seconds || 0) / 60));
  const played = `You played ${gname || "the game"} for ${plural(minutes, "minute")}.`;
  let head = "Good work!", text = played, glyph = "star", count = 0;
  switch (g) {
    case "candles": {
      const lit = r.lanternsLit || 0, c = r.candles || 0;
      head = lit > 0 && lit >= c ? "Every lantern lit!" : lit > 0 ? "Lanterns lit!" : "A gentle start.";
      text = c ? `You lit ${plural(lit, "lantern")} from ${plural(c, "candle")}.` : `You lit ${plural(lit, "lantern")}.`;
      if (r.endReason === "target") text += " Pip reached the flag!";
      glyph = "lantern"; count = lit; break;
    }
    case "pong": {
      const duo = r.pongMode === "duo", them = duo ? (r.p2Name || "player two") : "the star";
      head = r.matchWon === true ? "You won the game!" : r.matchWon === false ? "A good game!"
        : r.pointsPlayed > 0 ? "A draw!" : "Great rally!";
      const rally = r.bestRally ?? r.hits ?? 0;
      text = r.points != null && (r.points > 0 || r.aiPoints > 0)
        ? `You scored ${r.points} to ${r.aiPoints} against ${them} and your longest rally was ${rally}.`
        : `Your longest rally was ${plural(rally, "return")}.`;
      if (r.smashEnded) text += " You finished it with the smash.";
      glyph = "ball"; count = rally; break;
    }
    case "pairs": {
      const n = r.pairsFound || 0;
      head = r.boardsCleared ? "All pairs found!" : n > 0 ? "Pairs found!" : "A good look around.";
      text = `You found ${plural(n, "pair")} in ${plural(r.turns || 0, "turn")}${r.boardsCleared ? ` and cleared ${plural(r.boardsCleared, "board")}` : ""}.`;
      glyph = "card"; count = n; break;
    }
    case "windy": {
      const n = r.gapsPassed || 0;
      head = r.completed ? "Nice flying!" : n > 0 ? "A windy ride!" : "A bumpy start.";
      text = `You flew through ${plural(n, "gap")}${r.feathers ? ` and caught ${plural(r.feathers, "feather")}` : ""}.`;
      glyph = "jet"; count = n; break;
    }
    case "lens": {
      const pc = Math.round((r.coverage ?? 0) * 100);
      head = pc >= 99 ? "Card cleared!" : pc >= 50 ? "Nice scratching!" : "A good start.";
      text = `You cleared ${pc}% of the card${r.panes > 1 ? ` across ${plural(r.panes, "pane")}` : ""}.`;
      glyph = "card"; count = Math.round(pc / 10); break;
    }
    case "dots": {
      const n = r.hits || 0;
      head = r.pictures ? "Picture finished!" : n > 0 ? "Dots connected!" : "A good start.";
      text = `You joined ${plural(n, "dot")}${r.pictures ? ` and finished ${plural(r.pictures, "picture")}` : ""}.`;
      glyph = "dot"; count = n; break;
    }
    case "sling": {
      const n = r.hits || 0;
      head = n > 0 ? "Clouds cleared!" : "A good stretch.";
      text = `You knocked down ${plural(n, "cloud")}${r.bestPullFrac ? `, pulling to ${Math.round(r.bestPullFrac * 100)}% of your reach` : ""}.`;
      glyph = "cloud"; count = n; break;
    }
    case "boxes": {
      const n = r.boxes || 0;
      head = n > 0 ? "Crates delivered!" : "A good try.";
      text = `You carried ${plural(n, "crate")} across.`;
      glyph = "crate"; count = n; break;
    }
    case "rainbow": {
      const n = r.cloudsPushed || 0;
      head = n > 0 ? "Rainbow saved!" : "A good try.";
      text = `You whooshed ${plural(n, "cloud")} off the rainbow and saved ${plural(r.friendsSaved || 0, "friend")}.`;
      glyph = "cloud"; count = n; break;
    }
    case "rgs": {
      head = r.hits > 0 ? "Caught together!" : "A good try.";
      text = `You caught ${plural(r.hits || 0, "light")} with both hands.`;
      glyph = "star"; count = r.hits || 0; break;
    }
    case "rhythm": {
      head = (r.notesHitPct || 0) >= 70 ? "In the groove!" : "A good tune.";
      text = `You played ${r.notesHitPct || 0}% of the notes, best streak ${plural(r.bestCombo || 0, "note")}.`;
      glyph = "star"; count = r.bestCombo || 0; break;
    }
    default: {
      const total = (r.hits || 0) + (r.misses || 0);
      if (total > 0) {
        head = r.hitRate >= 0.7 ? "Well caught!" : r.hits > 0 ? "Good work!" : "A good try.";
        text = `You caught ${r.hits} of ${total} in ${gname || "the game"}.`;
        glyph = "star"; count = r.hits || 0;
      }
    }
  }
  return { head, text, glyph, count };
}

function renderBetween(round, note) {
  // the pill: stars this round (minutes of play) and the lifetime total,
  // which only ever grows (starsLifetime; `stars` is the spendable balance)
  const p = store.getPatient(state.patient);
  const saved = Math.max(p?.starsLifetime || 0, p?.stars || 0);
  const n = round.stars || 0;
  $("rc-stars").innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><polygon points="12,2 14.9,8.6 22,9.3 16.5,14 18.3,21 12,17.3 5.7,21 7.5,14 2,9.3 9.1,8.6" fill="#e8a86a"/></svg>`
    + `<span>+${plural(n, "star")}</span><span class="saved">${plural(saved, "star")} saved</span>`;

  const sum = roundSummary(round);
  $("rc-head").textContent = sum.head;
  $("rc-text").textContent = sum.text;
  const shown = Math.min(sum.count, RC_MAX_GLYPHS);
  $("rc-glyphs").innerHTML = (RC_GLYPHS[sum.glyph] || RC_GLYPHS.star).repeat(shown)
    + (sum.count > shown ? `<span class="more">+${sum.count - shown}</span>` : "");
  $("rc-how").textContent = "";

  // the board under the sentence: the Lantern's Guild, or the two-player record
  $("rc-board").innerHTML = round.game === "candles" ? lanternBoardHTML(store.getProgress(state.patient, "candlesLumen") || {})
    : round.game === "pong" && round.pongMode === "duo" ? (() => {
        const r = store.getRivalry(state.patient, round.p2Name || "guest");
        return `<div class="board"><p>Head to head: <b>${r.wins}</b> to <b>${r.losses}</b> ${round.p2Name || "player two"}${r.draws ? ` · ${r.draws} drawn` : ""} · best rally ever <b>${r.bestRally}</b></p></div>`;
      })()
    : "";

  const rest = state.roundNumber % 4 === 0
    ? " You've earned a longer break. Have some water."
    : "";
  $("rc-note").textContent = (note || "") + rest;
  renderPlanBetween();

  for (const f of document.querySelectorAll(".face")) f.classList.remove("selected");
}

const REST_LINE = "This is a lovely moment for a short rest. Continue whenever you are ready.";
document.querySelectorAll(".face").forEach(f => {
  f.dataset.dwell = "1";
  f.addEventListener("click", () => {
    document.querySelectorAll(".face").forEach(x => x.classList.remove("selected"));
    f.classList.add("selected");
    store.logFeel(state.patient, f.dataset.feel);
    if (f.dataset.feel === "hurts") {
      $("rc-note").textContent = "Thank you for telling us. Let's stop here for today and rest that arm.";
      speak("Thank you for telling us. " + REST_LINE);
      // rest is the gentle default now: Finish for today takes the focus
      document.querySelectorAll("#screen-between .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
      focusHint($("btn-finish"));
    }
    if (f.dataset.feel === "tired")
      $("rc-note").textContent = "A little tired is okay. One gentler round, or finish for today?";
    if (f.dataset.feel === "fine")
      $("rc-note").textContent = "Lovely. Play again whenever you are ready.";
  });
});

$("btn-next-round").dataset.dwell = "1";
$("btn-finish").dataset.dwell = "1";
$("btn-next-round").addEventListener("click", nextRound);
$("btn-finish").addEventListener("click", () => { state.plan = null; renderCollections(); show("screen-collections"); });

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
  const pt = store.playtime(state.patient);
  const today = pt[dayKey(new Date())]?.ms || 0;
  const cutoff = Date.now() - 7 * 86400000;
  const week = Object.keys(pt).filter(d => new Date(d).getTime() >= cutoff).reduce((a, d) => a + pt[d].ms, 0);
  $("prof-sub").textContent = `Training arm: ${state.side} · Day ${days} · Played today ${fmtDur(today)} · last 7 days ${fmtDur(week)}`;
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
        .sort((a, b) => (a.fracAnat ?? a.frac) - (b.fracAnat ?? b.frac)).slice(0, 2).map(e => e.key).join(", ");
      s += `<div class="lg"><span class="dot" style="background:${got === prof.extremes.length ? "#9fc08a" : "#b5503a"}"></span>Targets reached
         <span class="val" style="margin-left:6px">${got}/${prof.extremes.length}${
           short ? ` <small style='font-weight:600;opacity:.75'>(short: ${short})</small>` : ""}</span></div>`;
    }
    // the lift: shoulder flexion asked for directly, peak elevation vs trunk
    if (prof.lift?.peakDeg != null) {
      s += `<div class="lg"><span class="dot" style="background:#7d6fb0"></span>Arm lift
         <span class="val" style="color:#5b4f8a;margin-left:6px">${prof.lift.peakDeg}°${
           prof.lift.rangeDeg != null ? ` <small style='font-weight:600;opacity:.75'>(${prof.lift.rangeDeg}° up from rest${
             prof.lift.returned ? "" : ", did not come back down"})</small>` : ""}</span></div>`;
    }
    // the two circles: one each way, and whether each closed
    if (prof.laps?.length) {
      const done = prof.laps.filter(l => l.complete).length;
      s += `<div class="lg"><span class="dot" style="background:${done === prof.laps.length ? "#9fc08a" : "#e8a86a"}"></span>Circles
         <span class="val" style="margin-left:6px">${done}/${prof.laps.length} complete <small style='font-weight:600;opacity:.75'>(${
           prof.laps.map(l => `${l.dir} ${l.seconds}s`).join(", ")})</small></span></div>`;
    }
    // RSA on the Kinetigram device's scale, so this workspace can be read
    // beside a report from a device the clinic already uses. Q5 (behind the
    // trunk) is absent by construction: one camera in front of a patient
    // cannot see backward reach, and zero would read as "none".
    if (prof.rsa) {
      const r = prof.rsa, f2 = v => (v ?? 0).toFixed(2);
      s += `<div class="lg"><span class="dot" style="background:#b0a0d0"></span>RSA (planar Q1-Q4)
         <span class="val" style="color:#5b4f8a;margin-left:6px">${f2(r.total14)} of 1.00</span>
         <small style='font-weight:600;opacity:.75;margin-left:6px'>Q1 ${f2(r.q1)} · Q2 ${f2(r.q2)} · Q3 ${f2(r.q3)} · Q4 ${f2(r.q4)}${
           prof.rsaElbow ? ` · elbow ${f2(prof.rsaElbow.total14)}` : ""} · frontal projection</small></div>`;
    }
    return s;
  })();
  $("prof-arc-legend").innerHTML =
    `<div class="lg"><span class="dot" style="background:#e8a86a"></span>Trained (${state.side[0].toUpperCase()})
       <span class="val" style="color:#c77f4a;margin-left:6px">${prof ? prof.arcMinDeg + "°–" + prof.arcMaxDeg + "°" : "—"}</span></div>
     <div class="lg"><span class="dot" style="background:rgba(27,27,58,.35)"></span>Other (${other[0].toUpperCase()})
       <span class="val" style="color:rgba(27,27,58,.6);margin-left:6px">${oProf ? oProf.arcMinDeg + "°–" + oProf.arcMaxDeg + "°" : "—"}</span></div>` + reachLg + wsLg;

  // --- reach & grasp map: the five targets ---
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
      fill="rgba(27,27,58,.45)" font-family="Nunito">No targets recorded yet</text>`;
  }
  for (const e of held) {
    // arm-relative degrees -> screen: a left arm mirrors, exactly as the
    // assessment did when it asked for the movement
    const scr = (state.side === "right" ? e.deg : 180 - e.deg) * Math.PI / 180;
    const x = GX + Math.cos(scr) * GR, y = GY - Math.sin(scr) * GR;
    // The ring is the arm's own anatomical boundary, so the spoke has to be a
    // fraction of THAT — e.frac is a fraction of the target as asked, and the
    // assessment brings that target in when the boundary is out of reach, so
    // drawing it here would make a scaled-down ask look like a full reach.
    const frac = Math.max(0, Math.min(1, e.fracAnat ?? e.frac ?? 0));
    const ask = e.askFrac != null ? Math.max(0, Math.min(1, e.askFrac)) : null;
    // spoke length = how far along that direction they actually got
    gsvg += `<line x1="${GX}" y1="${GY}" x2="${(GX + Math.cos(scr) * GR * frac).toFixed(1)}"
      y2="${(GY - Math.sin(scr) * GR * frac).toFixed(1)}" stroke="${e.reached ? "#9fc08a" : "#e8a86a"}"
      stroke-width="5" stroke-linecap="round"/>`;
    // a tick where the target actually sat, when it was brought in
    if (ask != null && ask < 0.97) {
      gsvg += `<circle cx="${(GX + Math.cos(scr) * GR * ask).toFixed(1)}" cy="${(GY - Math.sin(scr) * GR * ask).toFixed(1)}"
        r="3.5" fill="none" stroke="rgba(27,27,58,.45)" stroke-width="2"/>`;
    }
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
      fill="${e.graspOk ? "#4a7a3a" : "#b8892a"}" font-family="Nunito">${e.graspOk ? "✊ grasp" : "no squeeze"} · ${Math.round((e.stability ?? 0) * 100)}%</text>`;
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
  const LEVELS = { lens: ["scratchLevel", 6], dots: ["dotsLevel", 6], pairs: ["pairsLevel", 6], candles: ["candlesLevel", CANDLE_MAX] };
  const rows = store.listGameParams(state.patient, state.side);
  $("prof-diff").innerHTML = rows.length
    ? rows.map(r => {
        const g = GAMES.find(x => x.id === r.game);
        const lv = LEVELS[r.game] ? store.getLevel(state.patient, LEVELS[r.game][0]) : null;
        const gname = r.game === "pong" ? "Pong FE" : r.game === "pong-abd" ? "Pong Abd-Add" : g?.name || r.game;
        return `<div class="comp-row"><span>${gname}${
          lv ? ` <span class="chip amber" style="margin-left:6px">Level ${lv}/${LEVELS[r.game][1]}</span>` : ""}</span>
          <span class="cv">range ${Math.round(r.rangeScale * 100)}% · target ${r.radius.toFixed(2)} SW · ${r.lifetime.toFixed(1)}s</span></div>`;
      }).join("")
    : `<div class="comp-row"><span style="opacity:.6">Not played yet on this arm — every game starts from the assessment</span></div>`;
$("btn-prof-session").addEventListener("click", () => { renderSelect(); show("screen-select"); });
$("btn-prof-assess").addEventListener("click", () => startAssessment({ force: true, override: true }));
$("btn-prof-plan").addEventListener("click", () => renderSchedule(() => { renderProfile(); show("screen-profile"); }));
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
  renderPeople(t);
}, 250);

// ZED path: everyone the bridge can see, one button each, the followed
// person marked. Clicking pins the bridge's seat to that person. Left and
// right are the patient's own, as in the mirror.
function renderPeople(t) {
  const el = $("campeople");
  const people = t.source === "zed" ? (t.people || []) : [];
  if (!people.length) { if (el.innerHTML) el.innerHTML = ""; return; }
  const sorted = [...people].sort((a, b) => b.x - a.x);   // mirrored: image right = viewer's left
  const key = sorted.map(p => `${p.id}:${p.seat ?? "-"}:${p.play ? 1 : 0}`).join(",");
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = "";
  const lab = document.createElement("div");
  lab.textContent = people.length > 1 ? "People in view (click the patient to follow):" : "People in view:";
  el.appendChild(lab);
  sorted.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "btn ghost-light" + (p.seat === 0 ? " people-followed" : "");
    const where = sorted.length === 1 ? "" : i === 0 ? "left, " : i === sorted.length - 1 ? "right, " : "middle, ";
    const dist = p.z != null ? `${p.z.toFixed(1)} m` : "";
    b.textContent = `Person ${p.id} (${where}${dist})${p.seat === 0 ? " · following" : p.play ? "" : " · outside play area"}`;
    b.addEventListener("click", () => t.selectPerson(p.id));
    el.appendChild(b);
  });
}
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

// the coach relay (tools/coach_bridge.py): Claude writes the between-rep
// lines when it is up; the phrasebook speaks otherwise, so this is a status
// line and never a dependency
probeCoach().then(() => {
  const el = $("coachstate");
  const info = coachRelayInfo();
  el.textContent = coachRelayReady() ? `Coach lines: Claude via relay (${info.model})` : "Coach lines: local phrasebook";
  el.className = coachRelayReady() ? "ok" : "";
});

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

// Patient-facing HELP: one press tells the therapist, with the diagnostics.
// Spoken and captioned so the patient knows it went, and rate-limited so a
// second press in a minute does not send a second mail.
let helpAt = 0;
function requestHelp() {
  const now = Date.now();
  if (now - helpAt < 60000) { speak("Help is already on the way."); return; }
  helpAt = now;
  speak("Help is on the way. Your therapist has been told.");
  doMail("help", `Help requested — participant ${state.patient}`,
    `Participant ${state.patient} pressed Help at ${new Date().toLocaleString()}.\nScreen: ${state.screen}\n\n` +
    `${diagnostics(state, state.tracker)}\n`, "help request");
}
for (const id of ["btn-help", "btn-welcome-help", "btn-select-help"]) $(id).addEventListener("click", requestHelp);
// the patient's own "email my progress": the same report the staff button
// sends, with a spoken confirmation so they know it went
$("btn-select-mail").addEventListener("click", async () => {
  const p = store.getPatient(state.patient);
  speak("Sending your progress to your therapist.");
  await doMail("progress", `Progress — participant ${state.patient} (${state.side})`,
    progressReport(state.patient, p, state.side), "progress summary");
  speak(mailReady() ? "Sent." : "Your mail app has opened. Press Send there.");
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
for (const id of ["in-email", "in-remind-time", "in-remind-days"]) {
  $(id).addEventListener("change", () => {
    store.setContact(state.patient, { email: $("in-email").value, remindAt: $("in-remind-time").value, remindDays: $("in-remind-days").value });
    syncReminder(state.patient);
  });
}
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
$("in-arm").addEventListener("change", e => {
  state.side = e.target.value; state.sideChosen = true;
  if (state.patient) store.setArm(state.patient, state.side);   // the therapist's override is remembered
});
// camera source is picked once at boot (webcam + MediaPipe vs ZED bridge),
// so changing it reloads the app
$("in-assess-style").value = localStorage.getItem("strive-assess-style") || "video";
$("in-assess-style").addEventListener("change", e => localStorage.setItem("strive-assess-style", e.target.value));
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
  $("in-coach").value = COACHES[s.coach] ? s.coach : "lumi";
  state.tracker?.setSqueezeEase?.(s.squeezeEase);
}
$("in-coach").addEventListener("change", e => {
  saveSetting({ coach: e.target.value });
  speakLine(COACHES[A11Y.coach].sample, 0.9, false);   // hear the change at once
});
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
$("in-candles").addEventListener("change", e => { state.candlesMode = e.target.value; });
// the Lantern's level for the NEXT round (testing: any stage, at once); the ladder otherwise
for (let L = 1; L <= CANDLE_MAX; L++) {
  const st = LUMEN_STAGES.find(x => L >= x.from && L <= x.to);
  $("in-candles-level").add(new Option(`Level ${L} · ${st?.name || ""}`, String(L)));
}
$("in-candles-level").addEventListener("change", e => { state.candlesLevelPick = +e.target.value || null; });
$("in-pong-speed").addEventListener("change", e => { state.pongSpeed = e.target.value; });
$("in-pong-power").addEventListener("change", e => { state.pongPowerups = e.target.value === "on"; });
$("in-song").addEventListener("change", e => { state.song = e.target.value; });
$("in-tiles").addEventListener("change", e => { state.tilesMode = e.target.value; });

// song picker, sorted easy → hard with difficulty stars
$("in-song").innerHTML = [...SONGS]
  .sort((a, b) => a.difficulty - b.difficulty)
  .map(s => `<option value="${s.id}">${"★".repeat(s.difficulty)} ${s.name}</option>`)
  .join("");
$("btn-drawer-assess").addEventListener("click", () => { $("drawer").classList.add("hidden"); startAssessment({ force: true, override: true }); });
$("btn-drawer-profile").addEventListener("click", () => { $("drawer").classList.add("hidden"); renderProfile(); show("screen-profile"); });
// the intro again, for this participant, back to the screen it was on after;
// never over a round (the stage), where a game is drawing and speaking
$("btn-drawer-intro").addEventListener("click", () => {
  $("drawer").classList.add("hidden");
  if (state.screen === "stage" || state.screen === "screen-intro") return;
  const back = state.screen;
  playIntro(() => show(back));
});
$("btn-drawer-plan").addEventListener("click", () => {
  $("drawer").classList.add("hidden");
  // back to the menu screen it was opened from (never into a running game)
  const back = ["screen-select", "screen-profile", "screen-collections", "screen-between"].includes(state.screen) ? state.screen : "screen-select";
  renderSchedule(() => { if (back === "screen-select") renderSelect(); show(back); });
});
$("btn-drawer-collections").addEventListener("click", () => { $("drawer").classList.add("hidden"); renderCollections(); show("screen-collections"); });

$("btn-quit").addEventListener("click", () => {
  const skipTo = state.warmupThen;   // a warm-up on the way to the assessment: ✕ skips the stretch, not the measurement
  state.warmupThen = null;
  state.current?.stop();
  state.current = null;
  audio.stopBgm();
  document.getElementById("cue").classList.add("hidden");
  document.getElementById("paused").classList.add("hidden");
  if (skipTo) { skipTo(); return; }
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
  if (!MENU_KEYS) return;
  if (!["screen-select", "screen-between", "screen-collections", "screen-schedule"].includes(state.screen)) return;
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
// ?preview=pongscore renders the between-rounds card with a sample Pong
// round and skips the camera: for screenshots and design review of that
// screen without playing a game (Sep 2026). Nothing is stored.
const previewOf = new URLSearchParams(location.search).get("preview");
if (previewOf === "pongscore") {
  state.patient = "guest"; state.side = "right"; state.roundNumber = 2; state.sessionStars = 420;
  const sample = { game: "pong", hits: 19, misses: 3, hitRate: 19 / 22, stars: 2, gamePoints: 200, seconds: 96, bestRally: 9,
    points: 3, aiPoints: 1, matchWon: true, trickPoints: 1, trickShots: { curve: 1 }, compEvents: [] };
  renderBetween(sample, "You won, so the ball comes a little quicker next game, and the star grows into a Bright star.");
  show("screen-between");
} else if (previewOf === "reach") {
  // ?preview=reach: the after-assessment screen with four sample
  // measurements three weeks apart. A stub tracker supplies only the stable
  // frame and the SW→pixel mapping the screen needs; the sample patient is
  // removed from storage again right after rendering.
  state.patient = "preview"; state.side = "right";
  state.tracker = {
    frame: { x: 0.5, y: 0.36, sw: 0.17 }, srcW: 1280, srcH: 720, trackingOk: true,
    relToPx(rel, canvas) {
      const vx = this.frame.x + rel.x * this.frame.sw, vy = this.frame.y - rel.y * this.frame.sw;
      const scale = Math.max(canvas.width / this.srcW, canvas.height / this.srcH);
      const dw = this.srcW * scale, dh = this.srcH * scale;
      return { x: (canvas.width - dw) / 2 + vx * dw, y: (canvas.height - dh) / 2 + vy * dh };
    },
  };
  const env = n => Array.from({ length: 32 }, (_, i) => n * (1 + 0.35 * Math.cos((i + 0.5) / 32 * Math.PI * 2 - 0.6)));
  const mk = (date, k, cov, peak, reached) => ({
    date, envelope: env(k), envPts: null, armLenSW: 1.45, coverage: cov, arcMinDeg: 12, arcMaxDeg: peak,
    lift: { peakDeg: peak }, center: { x: 0, y: 0 }, areaSW2: 2,
    extremes: Array.from({ length: 5 }, (_, i) => ({ reached: i < reached, graspOk: i < 2 })),
  });
  const days = d => new Date(Date.now() - d * 864e5).toISOString();
  for (const [d, k, cov, peak, r] of [[21, 0.55, 0.22, 95, 2], [14, 0.7, 0.31, 108, 3], [7, 0.8, 0.38, 121, 3], [0, 0.95, 0.47, 132, 4]])
    store.saveProfile("preview", "right", mk(days(d), k, cov, peak, r));
  renderRomCompare(["right"]); show("screen-romcompare"); romLiveLoop();
  try {
    const raw = JSON.parse(localStorage.getItem("rehabsuite-v1"));
    if (raw?.patients?.preview) { delete raw.patients.preview; localStorage.setItem("rehabsuite-v1", JSON.stringify(raw)); }
  } catch {}
} else {
  boot().then(() => { state.tracker?.setSqueezeEase?.(A11Y.squeezeEase); watchWelcome(); });
}

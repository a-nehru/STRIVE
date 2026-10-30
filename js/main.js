import { Tracker } from "./tracker.js?v=72";
import { Assessment } from "./assessment.js";
import { GAMES, STAR_RANKS, PONG_LEVEL_MAX, CANDLE_MAX, LUMEN_STAGES, WINDY_MAX, PAIR_MAX, windyLabel, windyStageOf, windySubOf, windyPips } from "./games.js";
import { Warmup } from "./warmup.js";
import { probeLauncher, launcherInfo, backupNow, listBackups, restoreBackup, backupState, startAutoBackup } from "./backup.js";
import { SONGS } from "./songs.js";
import { initialParams, adjust, LIMITS } from "./dda.js";
import { drawBody, drawVideoMirror } from "./engine.js";
import { store } from "./storage.js";
import { drawVillage, villageCounts } from "./village.js";
import { audio } from "./audio.js";
import { A11Y, applySettings, speakLine, showCaption, hushVoice, COACHES } from "./a11y.js";
import { coachLine, phrasebookLines } from "./coachlines.js";
import { probeCoach, coachRelayReady, coachRelayInfo } from "./coachline.js";
import { probeTts, ttsReady, ttsInfo, prerenderVoice } from "./tts.js";
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
const SCREENS = ["screen-login", "screen-welcome", "screen-intro", "screen-select", "stage", "screen-between", "screen-romcompare", "screen-profile", "screen-schedule"];

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
  windyLevelPick: null,   // Windy City Flap: the same, from the drawer
  pairsLevelPick: null,   // Memory Pairs: the same, from the session plan
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
  updateTodayPill();
}

function resize() { const c = $("canvas"); c.width = innerWidth; c.height = innerHeight; }
addEventListener("resize", resize); resize();
addEventListener("resize", () => { if (state.screen === "screen-romcompare") romLiveLoop(); });

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
  warmVoice();
}

// The voice bridge (tools/tts_bridge.py): Chatterbox renders every line in
// the chosen coach's own voice when it is up; the browser's voice otherwise,
// so like the other relays this is a status line and never a dependency.
// warmVoice hands it the coach's phrasebook (and the three chooser samples)
// to render in the background, so the cues are on disk before one is needed.
let voiceWarmed = "";
function warmVoice() {
  if (!ttsReady()) return;
  const coach = A11Y.coach;
  if (voiceWarmed === coach) return;
  voiceWarmed = coach;
  prerenderVoice(coach, phrasebookLines(coach)).then(() => voiceState());
  for (const id of Object.keys(COACHES)) if (id !== coach) prerenderVoice(id, [COACHES[id].sample, COACHES[id].intro]);
}
function voiceState() {
  const el = $("voicestate");
  if (!el) return;
  const info = ttsInfo();
  if (ttsReady()) {
    const v = info.voices?.[A11Y.coach] || "built-in";
    el.textContent = `Voice: Chatterbox on the ${info.device} (${COACHES[A11Y.coach]?.name || A11Y.coach}: ${v.replace(/^sample_|\.wav$/g, "")}, ${info.cached} lines on disk)`;
    el.className = "ok";
  } else if (info && info.loading) {
    el.textContent = "Voice: Chatterbox loading, browser voice meanwhile";
    el.className = "";
  } else {
    el.textContent = "Voice: browser speech engine (voice bridge offline)";
    el.className = "";
  }
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
    // THE PICTURE FIRST (29 Oct 2026, by request: the login's camera
    // picture came up seconds late): the loading screen goes as soon as the
    // camera gives a picture, and the login mirror shows it while the pose
    // and hand models finish loading behind it (state.camPreview); only
    // then is the tracker handed over as state.tracker.
    await t.init($("video"), localStorage.getItem("strive-cam-source") || "auto",
      s => { $("loading-text").textContent = s; },
      () => { state.camPreview = t; $("loading").classList.add("hidden"); });
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
    state.camPreview = null;
    $("loading").classList.remove("hidden");
    $("camstate").textContent = "Camera: unavailable. " + e.message;
    $("camstate").className = "bad";
    $("loading-text").textContent = "The camera could not start: " + e.message;
    $("loading-error").classList.remove("hidden");
  }
}
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
let pendingCreateNew = true;                 // ...and whether it is a brand-new participant (the intro follows)
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
// `say`: the coach introduces themselves in their own voice (COACHES.intro)
// when a card is chosen by click or arrow key; the step's opening render
// passes false so the screen does not start talking on its own
function selectCoach(id, focus, say = true) {
  if (!COACHES[id]) return;
  coachPick = id;
  renderCoachPick();
  if (focus) document.querySelector(`#login-coach .coach[data-coach="${id}"]`)?.focus();
  if (say) speakLine(COACHES[id].intro, 0.9, true, null, id);
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
    loginAs(name, pendingCreateNew);
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

// The state and the staff drawer for a participant who just logged in; the
// welcome, the greeting and the mail are finishLogin's. The test shortcut
// (?go=, below the boot) uses this alone.
function applyLogin(name, arm) {
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
  backupNow("login");
}

function finishLogin(name, isNew, arm) {
  applyLogin(name, arm);
  // a participant made just now sees the intro first (Oct 2026, by
  // request), then the welcome screen and the greeting
  Warmup.preload(arm);                    // the stretch recording for this arm, fetched now
  if ((localStorage.getItem("strive-assess-style") || "video") === "video") Assessment.preload(arm);   // and the assessment's
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
  if (b) loginOrPickCoach(b.dataset.name, false);
});
// There is one coach (27 Oct 2026, by request: the choice of three is
// gone, a11y.js THE_COACH), so nobody is asked to pick one: every login goes
// straight on. The login-coach step is left in the page, never shown.
function loginOrPickCoach(name, isNew) {
  loginAs(name, isNew);
}
function createLogin() {
  const name = $("login-name").value.trim();
  if (!name) { $("login-name").focus(); return; }
  // optional contact and reminder, asked once here; the staff drawer can change it
  const email = $("login-email").value.trim();
  const remindAt = $("login-remind-time").value, remindDays = $("login-remind-days").value;
  if (email || remindDays !== "off") store.setContact(name, { email, remindAt, remindDays });
  // an existing name logs in (choosing a coach first if it never did); a
  // new participant chooses the coach, then the arm, then sees the intro
  loginOrPickCoach(name, !store.hasPatient(name));
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
// What the picture needs, in one line, or null when the whole person is in
// it (Oct 2026, by request: the only asks are to be seen whole, so "move
// back" when any of them is cut off, never how to sit)
function framingMessage(t) {
  if (!t.trackingOk) return "Take a seat facing the camera";
  if (!t.rawVis?.waist) return "Move back a little, so we can see you down to your waist";
  const cut = t.shoulderWFast > 0.42 || t.anchorFast.y < 0.08 || t.anchorFast.y > 0.75;
  if (cut) return "Move back a little, so we can see all of you";
  if (t.shoulderWFast < 0.03) return "If you can, come a little closer to the camera";
  if (t.anchorFast.x < 0.15 || t.anchorFast.x > 0.85) return "Move toward the middle of the picture";
  return null;
}

// ZED path with more than one person in view: a ring on each person's
// shoulders, sage on the one being followed, amber on the rest, so staff can
// click the patient once and the bridge follows them from then on. Returns
// the hit boxes for the click handler. Mirrored like everything else drawn
// over the camera picture.
function drawPeopleMarkers(ctx, c, t) {
  const people = t.people || [];
  if (people.length < 2) return [];
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
    boxes.push({ id: p.id, x: px.x, y: px.y, r, at: { x: p.x, y: p.y } });
  }
  return boxes;
}

const TAU2 = Math.PI * 2;
// (the live-mirror body drawing moved to engine.js drawBody — shared with the
// assessment's camera view)

// The camera screens (Oct 2026, by request: the camera is on and SHOWN from
// the first screen, not from the welcome screen after the name). One loop
// draws whichever of the two is up: the live mirror full screen, the tracked
// skeleton on the person being followed, a ring on everyone else to click,
// and one line about the picture. The login screen says it under the card;
// the welcome screen carries it in its headline and waits to be settled.
const CAMERA_SCREENS = { "screen-login": "login-canvas", "screen-welcome": "welcome-canvas" };
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
  const loginEl = $("login-track");
  const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  // person markers drawn this frame (2+ people): a click on one makes the
  // tracker follow that person, on the ZED through the bridge's seat pin, on
  // a webcam through the tracker's own lock; either way they stay followed
  // through the login and the whole session. The canvases take no pointer
  // events (buttons sit above them), so the screens listen and hit-test.
  let personBoxes = [], pickedAt = 0;
  for (const id of Object.keys(CAMERA_SCREENS)) {
    $(id).addEventListener("click", e => {
      if (e.target.closest("button, a, select, input, .login-card")) return;
      const hit = personBoxes.find(b => Math.hypot(e.clientX - b.x, e.clientY - b.y) <= b.r + 12);
      if (!hit) return;
      pickedAt = performance.now();
      state.tracker?.selectPerson(hit.id, 0, hit.at);
    });
  }

  function loop() {
    requestAnimationFrame(loop);
    const canvasId = CAMERA_SCREENS[state.screen];
    if (!canvasId) return;
    const onLogin = state.screen === "screen-login";
    const c = $(canvasId);
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const t = state.tracker;
    if (!t) {
      // the camera is live but the models are still loading: the picture
      // alone, so the screen is never an empty frame
      if (state.camPreview && drawVideoMirror(ctx, c, state.camPreview, onLogin ? 0.42 : 0.30)) {
        setText(onLogin ? loginEl : trackEl, "Starting the tracking…");
      }
      return;
    }
    const now = performance.now();

    // tracking + feature status (so staff can see the whole chain is alive)
    if (t.handClosed("left") || t.handClosed("right")) squeezeSeen = true;
    const handFresh = t._handPts("left") != null || t._handPts("right") != null;
    const crowd = (t.people?.length ?? 0) > 1;
    const crowdLine = crowd && now - pickedAt < 4000
      ? "Following the person you clicked"
      : crowd ? `${t.people.length} people in view. Staff: click the patient to follow them` : "";
    setText(trackEl, crowdLine
      || (t.trackingOk
        ? `Tracking: body ✓ · hand ${handFresh ? "✓" : "…"} · squeeze ${squeezeSeen ? "✓" : "… try closing your fist"}`
        : "Tracking: looking for you …"));

    const msg = framingMessage(t);
    const framed = !msg;
    // the real mirror, full screen: the camera picture with the tracked
    // skeleton over the patient's own body (amber until framed, then sage),
    // so "move back a little" can be checked against the picture
    drawVideoMirror(ctx, c, t, onLogin ? 0.42 : 0.30);
    if (t.trackingOk) drawBody(ctx, c, t, { framed });
    personBoxes = drawPeopleMarkers(ctx, c, t);

    if (onLogin) {
      // under the card: who we see and what the picture needs; spoken only
      // when somebody is there and part of them is missing
      setText(loginEl, crowdLine || msg || "We can see all of you");
      if (msg && t.trackingOk) guide(msg, now);
      return;
    }

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
      setText(sub, "We can see all of you");
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
const INTRO_HOLD_LEAD = 0.3;     // s before a section: the recording holds there while the voice is still behind
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
    hushVoice();
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
    // the voice sets the pace (26 Oct 2026, by request: the narrator fell
    // behind the captions): just before the next section the recording
    // holds its frame until the line before it has been said
    const behind = speaking || queue.length > 0;
    if (!over && next < INTRO_CUES.length && t >= INTRO_CUES[next] - INTRO_HOLD_LEAD && behind) {
      if (!v.paused) v.pause();
    } else {
      if (v.paused && !over && t > 0) v.play().catch(() => {});
      while (next < INTRO_CUES.length && (over || t >= INTRO_CUES[next])) queue.push(next++);
    }
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
  windy: `<div class="art" style="background:linear-gradient(180deg,#4f8ccc,#8fc1e6 55%,#f8ebcf)">
    <svg viewBox="0 0 300 400" style="position:absolute;inset:0;width:100%;height:100%">
      <ellipse cx="90" cy="110" rx="60" ry="22" fill="#fff" opacity=".85"/><ellipse cx="220" cy="170" rx="50" ry="18" fill="#fff" opacity=".7"/>
      <rect x="20" y="300" width="50" height="100" fill="#ecd3b2"/><rect x="90" y="250" width="60" height="150" fill="#dcb59a"/><rect x="175" y="280" width="45" height="120" fill="#d4c6ae"/><rect x="240" y="320" width="55" height="80" fill="#e8dcc0"/>
      <rect x="0" y="380" width="300" height="20" fill="#82b862"/>
      <path d="M95 225 L205 225 Q222 228 222 236 Q222 244 205 246 L95 246 Z" fill="#2b3550"/>
      <rect x="100" y="230" width="100" height="4" fill="#d9483b"/>
      <circle cx="150" cy="208" r="13" fill="#2f3340"/><path d="M137 208 A13 13 0 0 1 163 208 Z" fill="#d9483b"/>
      <circle cx="146" cy="211" r="2" fill="#fbf4e4"/><circle cx="154" cy="211" r="2" fill="#fbf4e4"/>
      <path d="M85 236 L62 231 L62 241 Z" fill="#ff8a4c"/>
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
  // (the line under the street, "Your street is dark tonight...", went
  // 26 Oct 2026, by request: it read as an instruction before any game)
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
  renderToday();
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

  // The day's session opens with the measurement and the games wait for it
  // (Sep 2026, by request). Once it is done the card stays open as "Measure
  // again" (28 Oct 2026, by request: redo it as needed; it used to lock
  // until tomorrow), and the games, not it, are the recommended next step.
  const today = measuredToday(prof);
  const assessBtn = mk("assess", today ? "Measure again" : prof ? "Today's measurement" : "Measure your reach", false,
    () => startAssessment({ force: true, override: true }));
  const gameBtns = {};
  const gameLock = !prof ? "Measure your reach first" : !today ? "Today's measurement first" : null;
  for (const g of GAMES) {
    if (g.disabled) continue;
    if (g.id === "pong") {
      // two Pongs, one card each (Sep 2026, by request): FE, the arm up and
      // down; Abd-Add, the hand out to the side and across, on the lane the
      // assessment measured
      const go = axis => () => { state.pongMode = "solo"; state.pongAxis = axis; $("in-pong").value = "solo"; renderLevelMap("pong"); };
      gameBtns.pong = mk("pong", "Pong FE", !!gameLock, go("fe"), "Up and down", gameLock);
      gameBtns["pong-abd"] = mk("pong", "Pong Abd-Add", !!gameLock, go("abd"), "Side to side", gameLock);
      // and the same game for two (Oct 2026, by request): a tile of its own
      gameBtns["pong-duo"] = mk("pong", "Pong: two players", !!gameLock,
        () => { state.pongMode = "duo"; state.pongAxis = "fe"; $("in-pong").value = "duo"; renderDuoSetup(); }, "Play together", gameLock);
      continue;
    }
    // the Lantern opens on its level map (Oct 2026, by request: any level
    // can be tried), with the Guild board beside it
    if (MAP_DEFS[g.id]) { gameBtns[g.id] = mk(g.id, g.name, !!gameLock, () => renderLevelMap(g.id), g.trains, gameLock); continue; }
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
const PLAN_MINUTES = [5, 10, 15, 20, 30];
// TODAY (23 Oct 2026, by request): what the day has held so far, for the hub
// strip and the round card: minutes trained (store.playtime), rounds and
// stars (the day's round records), rounds per game, and the goal the bar
// fills towards: the plan's minutes, else DAILY_GOAL_MIN
const DAILY_GOAL_MIN = 30;
function localDayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todayStats(name = state.patient) {
  const key = localDayKey();
  const p = store.getPatient(name) || {};
  const pt = (p.playtime || {})[key] || { ms: 0, rounds: 0, assessments: 0 };
  const rounds = (p.sessions || []).filter(r => r.day === key || (typeof r.date === "string" && r.date.startsWith(key)));
  const perGame = {};
  for (const r of rounds) perGame[r.game] = (perGame[r.game] || 0) + 1;
  const stars = rounds.reduce((a, r) => a + (r.stars || 0), 0);
  const plan = store.getSchedule(name);
  const goal = plan?.blocks?.length ? planMinutes(plan.blocks) : DAILY_GOAL_MIN;
  return { minutes: Math.round(pt.ms / 60000), seconds: Math.round(pt.ms / 1000), rounds: rounds.length, assessments: pt.assessments || 0, stars, perGame, goal, planned: !!plan?.blocks?.length };
}
// the hub's strip (26 Oct 2026, by request): no other text, just the
// minutes against the goal, and a flag at the end of the bar saying the
// goal is there
const TODAY_FLAG = `<svg class="today-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V3" stroke="#f4ecdd" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h12l-3 4 3 4H6z" fill="#e8a86a"/></svg>`;
function todayHubHTML(t) {
  const f = Math.min(1, t.goal ? t.minutes / t.goal : 0);
  return `<div class="today-line"><b>Today:</b> ${t.minutes} of ${t.goal} min</div>`
    + `<div class="today-track"><div class="today-bar"><div style="width:${Math.round(f * 100)}%"></div></div>${TODAY_FLAG}</div>`;
}
function todayHTML(t, compact = false) {
  const gameName = id => GAMES.find(g => g.id === id)?.name || id;
  const games = Object.entries(t.perGame).map(([id, n]) => `${gameName(id)} ${n}`).join(" · ");
  const f = Math.min(1, t.goal ? t.minutes / t.goal : 0);
  return `<div class="today-line"><b>Today:</b> ${plural(t.minutes, "minute")} trained · ${plural(t.stars, "star")} · ${plural(t.rounds, "round")}${t.assessments ? " · measured" : ""}</div>`
    + `<div class="today-bar"><div style="width:${Math.round(f * 100)}%"></div></div>`
    + `<div class="today-goal">${t.minutes} of ${t.goal} min${t.planned ? " in the plan" : ""}${games && !compact ? ` · ${games}` : ""}</div>`;
}
function renderToday() {
  const el = $("today-strip");
  if (!el || !state.patient || state.patient === "guest") { el?.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = todayHubHTML(todayStats());
}
// TODAY ON EVERY SCREEN (28 Oct 2026, by request: easier to see): a small
// pill at the top centre, the minutes against the goal and a thin bar. It
// counts live while a game, the assessment or the warm-up is on the stage
// (the day's logged time plus the time on the stage so far; the round's
// own time is logged when it ends), and it stays off the screens that show
// the bigger version (the hub strip, the round card) and before a login.
const TODAY_PILL_HIDE = ["screen-login", "screen-intro", "screen-select", "screen-between"];
let _todayStageSince = null;
function updateTodayPill() {
  const el = $("today-pill");
  if (!el) return;
  if (state.screen === "stage") _todayStageSince ??= Date.now(); else _todayStageSince = null;
  const on = !!state.patient && state.patient !== "guest" && !TODAY_PILL_HIDE.includes(state.screen);
  el.classList.toggle("hidden", !on);
  if (!on) return;
  // always the TOTAL (28 Oct 2026, by request): the same number in every
  // game, top right across from Help, so the session has one clock
  const t = todayStats();
  const min = Math.floor((t.seconds * 1000 + (_todayStageSince ? Date.now() - _todayStageSince : 0)) / 60000);
  const f = Math.min(1, t.goal ? min / t.goal : 0);
  el.innerHTML = `<b>Today</b> ${min} of ${t.goal} min<span class="tp-bar"><span style="width:${Math.round(f * 100)}%"></span></span>`;
}
setInterval(updateTodayPill, 5000);
let planDraft = [], planReturn = null;
// the levels a block can start a game at (23 Oct 2026, by request): the
// game's own ladder, or "where they are" (null) to carry on from the banked level
function planLevels(game) {
  if (game === "windy") return Array.from({ length: WINDY_MAX }, (_, i) => ({ v: i + 1, name: `Level ${windyStageOf(i + 1)} · part ${windySubOf(i + 1)} of 3${windyStageOf(i + 1) > 12 ? " · endless" : ""}` }));
  if (game === "candles") return Array.from({ length: CANDLE_MAX }, (_, i) => { const st = LUMEN_STAGES.find(s => i + 1 >= s.from && i + 1 <= s.to); return { v: i + 1, name: `Level ${i + 1}${st ? ` · ${st.name}` : ""}` }; });
  if (game === "pairs") return Array.from({ length: PAIR_MAX }, (_, i) => ({ v: i + 1, name: `Level ${i + 1}` }));
  return [];
}

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
// the patient-facing name: the game's own name, without the therapist's
// axis tag ("Pong", not "Pong FE")
function planGameName(b) { return GAMES.find(g => g.id === b.game)?.name || planName(b); }
function planMinutes(blocks) { return blocks.reduce((s, b) => s + (b.minutes || PLAN_BLOCK_MIN), 0); }

// open the plan screen; `then` is where Save or Skip goes afterwards.
// (24 Oct 2026, by request: every game is one 15-minute block. The therapist
// clicks a game tile to add it, the session line grows by 15 minutes, ✕ on
// a block drops it and the line shrinks. No minutes to pick.)
function renderSchedule(then) {
  planReturn = then;
  const saved = store.getSchedule(state.patient);
  planDraft = saved?.blocks?.length
    ? saved.blocks.map(b => ({ game: b.game, axis: b.axis, level: b.level ?? null, minutes: PLAN_BLOCK_MIN }))
    : [];
  drawPlan();
  show("screen-schedule");
  document.querySelectorAll("#screen-schedule .kbd-focus").forEach(el => el.classList.remove("kbd-focus"));
  focusHint(planDraft.length ? $("btn-plan-save") : document.querySelector("#plan-picks .gcard"));
}
function drawPlan() {
  const choices = planChoices();
  // THE SESSION LINE: one segment per block, 15 minutes each, in order
  const line = $("plan-blocks");
  line.innerHTML = "";
  planDraft.forEach((b, i) => {
    const seg = document.createElement("div");
    seg.className = "plan-seg";
    seg.style.setProperty("--art", "none");
    const head = document.createElement("div"); head.className = "plan-seg-head";
    const name = document.createElement("b"); name.textContent = planName(b); head.appendChild(name);
    const mins = document.createElement("span"); mins.className = "plan-seg-min"; mins.textContent = `${PLAN_BLOCK_MIN} min`; head.appendChild(mins);
    const rm = document.createElement("button");
    rm.className = "plan-remove"; rm.textContent = "✕"; rm.title = "Drop this block"; rm.setAttribute("aria-label", `Drop ${planName(b)}`); rm.dataset.dwell = "1";
    rm.addEventListener("click", () => { planDraft.splice(i, 1); drawPlan(); });
    head.appendChild(rm);
    seg.appendChild(head);
    const levels = planLevels(b.game);
    if (levels.length) {
      const el = document.createElement("select");
      el.setAttribute("aria-label", "Level to start at"); el.dataset.dwell = "1";
      el.add(new Option("Where they are", ""));
      for (const o of levels) el.add(new Option(o.name, String(o.v)));
      el.value = b.level == null ? "" : String(b.level);
      el.addEventListener("change", () => { b.level = el.value ? +el.value : null; });
      seg.appendChild(el);
    } else {
      const note = document.createElement("span"); note.className = "plan-note"; note.textContent = "pace follows their last game"; seg.appendChild(note);
    }
    line.appendChild(seg);
  });
  // the rest of the bar as empty slots, so there is something plainly to
  // fill (26 Oct 2026, by request: "add 15 min" on the tiles was unclear)
  for (let i = planDraft.length; i < PLAN_MAX_BLOCKS; i++) {
    const slot = document.createElement("div"); slot.className = "plan-seg plan-slot";
    slot.innerHTML = `<span>${i + 1}</span><small>${PLAN_BLOCK_MIN} min</small>`;
    line.appendChild(slot);
  }
  const total = planMinutes(planDraft);
  $("plan-total").innerHTML = planDraft.length
    ? `<b>${total} minutes</b> · ${planDraft.length} block${planDraft.length === 1 ? "" : "s"} of ${PLAN_BLOCK_MIN}${planDraft.length >= PLAN_MAX_BLOCKS ? " · that is the most for one session" : ""}`
    : "";
  // THE GAME TILES: click one to add a block of it (again for another 15 minutes)
  const picks = $("plan-picks");
  picks.innerHTML = "";
  for (const c of choices) {
    const n = planDraft.filter(b => planKey(b) === c.key).length;
    const card = pongCard(c.name, n ? `(${PLAN_BLOCK_MIN} min) · ${n} in the plan` : `(${PLAN_BLOCK_MIN} min)`, () => {
      if (planDraft.length >= PLAN_MAX_BLOCKS) { speak(`${PLAN_MAX_BLOCKS * PLAN_BLOCK_MIN} minutes is the most for one session.`); return; }
      planDraft.push({ game: c.game, axis: c.axis, level: null, minutes: PLAN_BLOCK_MIN });
      drawPlan();
    }, CARD_ART[c.game] || CARD_ART.pong);
    card.classList.add("plan-pick");
    if (n) card.classList.add("on");
    if (planDraft.length >= PLAN_MAX_BLOCKS) card.classList.add("full");
    picks.appendChild(card);
  }
  $("btn-plan-save").disabled = !planDraft.length;
}
$("btn-plan-save").addEventListener("click", () => {
  store.setSchedule(state.patient, planDraft.map(b => ({ game: b.game, axis: b.axis, level: b.level ?? null, minutes: b.minutes })));
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
  const text = plan.blocks.map(b => `${planName(b)}${b.level ? ` level ${b.game === "windy" ? windyStageOf(b.level) : b.level}` : ""} ${b.minutes || PLAN_BLOCK_MIN} min`).join(" · ");
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
  // the block's chosen level starts its first round; the ladder carries on from there
  if (b.level) {
    if (b.game === "windy") state.windyLevelPick = b.level;
    else if (b.game === "candles") state.candlesLevelPick = b.level;
    else if (b.game === "pairs") state.pairsLevelPick = b.level;
  }
  startGame(b.game, true);
}
// minutes left in the current block (0 when it is over)
function planLeftMin() {
  const p = state.plan;
  if (!p) return 0;
  const b = p.blocks[p.idx];
  return Math.max(0, Math.ceil((b.minutes * 60000 - (Date.now() - p.startedAt)) / 60000));
}
// the round card's buttons and its time box: within a plan block, the
// minutes of this game left over "Play again"; once the block is up, the
// next block's game; after the last block, "One more round" and "Finish
// for today". Without a plan, the day's minutes against the goal.
function renderPlanBetween() {
  const p = state.plan;
  let again = "Play again", left = "", finish = "Change game", time;
  // (the block's minutes left go over Play again)
  if (p) {
    const b = p.blocks[p.idx], nm = planGameName(b), min = planLeftMin();
    const last = p.idx >= p.blocks.length - 1;
    if (min > 0) left = `${plural(min, "minute")} of ${nm} left`;
    else if (!last) { again = `Next: ${planGameName(p.blocks[p.idx + 1])}`; left = `${nm} is done`; }
    else { again = "One more round"; left = "That's the whole plan"; finish = "Finish for today"; }
  }
  // the time bar is the TOTAL (28 Oct 2026, by request): today's minutes
  // against the plan's whole length, or the daily goal without a plan; the
  // block's own minutes are on the Play again button
  const t = todayStats();
  time = { label: "Today", done: t.minutes, of: t.goal };
  $("rc-again").textContent = again;
  $("rc-left").textContent = left;
  $("rc-left").classList.toggle("hidden", !left);
  $("btn-finish").textContent = finish;
  const f = Math.max(0, Math.min(1, time.of ? time.done / time.of : 0));
  $("rc-time").innerHTML = `<div class="rc-time-line"><b>${time.label}</b> ${Math.min(time.done, time.of)} of ${time.of} min</div>`
    + `<div class="rc-time-bar"><div style="width:${Math.round(f * 100)}%"></div></div>`;
  $("rc-time").classList.toggle("hidden", !state.patient || state.patient === "guest");
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
// THE LEVEL MAPS (23 Oct 2026, by request: "like Candy Crush, to show
// progress"): one winding path per ladder game, a node per level, the stars
// earned on each, the current level lit, the levels ahead drawn dim but
// playable (any level can be tried; the ladder carries on from the level
// played). Chapters (stages) are named along the path. Deliberately without
// the parts of those maps that exist to keep people playing past when they
// meant to stop: no lives, no gates, no boosters. One map for Windy City
// Flap, the Lantern and Memory Pairs (MAP_DEFS); the Lantern keeps its Guild
// board under it. Per-level stars and bests live in a progress bag per game
// (store.getProgress: the Lantern's own candlesLumen; windyMap and pairsMap
// written by onRoundEnd).
const MAP_DEFS = {
  windy: {
    title: "Windy City Flap: where shall we fly?", bag: "windyMap", levelKey: "windyLevel", pick: "windyLevelPick",
    count: () => WINDY_MAX,
    chapters: () => { const out = []; for (let st = 1; st <= WINDY_MAX / 3; st++) out.push({ from: (st - 1) * 3 + 1, to: st * 3, name: `Level ${st}`, note: st > 12 ? "A little faster and tighter" : windyNoteOf(st) }); return out; },
    label: n => `${windySubOf(n)}`,            // on the node: the part within the stage
  },
  candles: {
    title: "The Lantern: where shall we start?", bag: "candlesLumen", levelKey: "candlesLevel", pick: "candlesLevelPick",
    count: () => CANDLE_MAX,
    chapters: () => LUMEN_STAGES.map((st, k) => ({ from: st.from, to: st.to, name: `Stage ${k + 1} · ${st.name}`, note: "" })),
    label: n => `${n}`,
  },
  // Pong's ladder is the star's five ranks (24 Oct 2026, by request): the
  // opponents in a row, the beaten ones lit, the next one named
  pong: {
    title: () => `Pong ${state.pongAxis === "abd" ? "Abd-Add" : "FE"}: who shall we play?`, bag: "pongMap", levelKey: "starRank", pick: "starRankPick",
    count: () => STAR_RANKS.length,
    chapters: () => STAR_RANKS.map((r, i) => ({ from: i + 1, to: i + 1, name: r.name, note: "" })),
    label: n => `${n}`,
  },
  pairs: {
    title: "Memory Pairs: which board?", bag: "pairsMap", levelKey: "pairsLevel", pick: "pairsLevelPick",
    count: () => PAIR_MAX,
    chapters: () => [{ from: 1, to: PAIR_MAX, name: "Boards", note: "More cards, closer together, further out" }],
    label: n => `${n}`,
  },
};
const WINDY_NOTES = ["Learn to fly", "Rook slides", "Faster", "Drones", "Moving bridges", "Narrower gaps", "Faster", "Crosswind", "More drones", "Bridges move further", "Stronger wind", "The finale"];
function windyNoteOf(st) { return WINDY_NOTES[st - 1] || ""; }

// the SVG: nodes along a serpentine path, `per` to a row; `around` draws only
// a window of levels about the current one (the round card's strip)
function levelMapSVG(def, cur, prog, around = null) {
  const total = def.count(), chapters = def.chapters();
  const stars = prog.stars || {}, best = prog.best || {};
  let from = 1, to = total;
  if (around) { from = Math.max(1, cur - around); to = Math.min(total, cur + around); }
  const n = to - from + 1, per = around ? n : Math.min(8, Math.max(4, Math.round(Math.sqrt(total * 1.6))));
  const rows = Math.ceil(n / per), W = 960, colW = W / (per + 1), rowH = around ? 120 : 118, top = around ? 54 : 70;
  const H = top + rows * rowH + (around ? 10 : 20);
  const pos = i => { const r = Math.floor(i / per), c = i % per, cc = r % 2 ? per - 1 - c : c; return { x: colW * (cc + 1), y: top + r * rowH + rowH / 2 }; };
  const nodes = []; for (let L = from; L <= to; L++) nodes.push({ L, ...pos(L - from) });
  let d = "";
  nodes.forEach((p, i) => {
    if (!i) { d += `M${p.x} ${p.y}`; return; }
    const q = nodes[i - 1]; const mx = (p.x + q.x) / 2;
    d += p.y === q.y ? ` L${p.x} ${p.y}` : ` C${q.x} ${q.y + rowH * 0.55} ${p.x} ${p.y - rowH * 0.55} ${p.x} ${p.y}`;
    void mx;
  });
  let svg = `<svg class="lvl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Level map">`;
  svg += `<path d="${d}" class="trail"/>`;
  const doneTo = nodes.filter(p => p.L < cur);
  if (doneTo.length) {
    let d2 = ""; const seg = nodes.filter(p => p.L <= cur);
    seg.forEach((p, i) => { if (!i) { d2 += `M${p.x} ${p.y}`; return; } const q = seg[i - 1]; d2 += p.y === q.y ? ` L${p.x} ${p.y}` : ` C${q.x} ${q.y + rowH * 0.55} ${p.x} ${p.y - rowH * 0.55} ${p.x} ${p.y}`; });
    svg += `<path d="${d2}" class="trail done"/>`;
  }
  for (const ch of chapters) {
    const p = nodes.find(q => q.L === ch.from); if (!p) continue;
    svg += `<text class="chap" x="${p.x}" y="${p.y - 44}" text-anchor="middle">${ch.name}</text>`;
    if (ch.note && !around) svg += `<text class="chapnote" x="${p.x}" y="${p.y - 28}" text-anchor="middle">${ch.note}</text>`;
  }
  for (const p of nodes) {
    const st = stars[p.L] || 0, played = !!best[p.L] || st > 0, isCur = p.L === cur, ahead = p.L > cur && !played;
    const r = isCur ? 26 : 20;
    svg += `<g class="node${isCur ? " cur" : played ? " played" : ahead ? " ahead" : ""}" data-level="${p.L}" tabindex="0" role="button" aria-label="Level ${p.L}">`;
    if (isCur) svg += `<circle cx="${p.x}" cy="${p.y}" r="${r + 9}" class="halo"/>`;
    svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}"/>`;
    svg += `<text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="middle" class="num">${def.label(p.L)}</text>`;
    if (st) svg += `<text x="${p.x}" y="${p.y + r + 16}" text-anchor="middle" class="stars">${"★".repeat(st)}${"☆".repeat(Math.max(0, 3 - st))}</text>`;
    else if (played) svg += `<text x="${p.x}" y="${p.y + r + 16}" text-anchor="middle" class="stars dim">☆☆☆</text>`;
    svg += `</g>`;
  }
  return svg + `</svg>`;
}
function renderLevelMap(gameId) {
  const def = MAP_DEFS[gameId]; if (!def) return;
  const wrap = $("cards");
  wrap.innerHTML = "";
  document.querySelector("#screen-select h1").textContent = typeof def.title === "function" ? def.title() : def.title;
  const cur = store.getLevel(state.patient, def.levelKey);
  const prog = store.getProgress(state.patient, def.bag) || {};
  const played = Object.keys(prog.best || {}).length, starSum = Object.values(prog.stars || {}).reduce((a, b) => a + (b || 0), 0);
  let html = `<div class="duo-setup lvl-map">`;
  html += levelMapSVG(def, cur, prog);
  html += gameId === "pong"
    ? `<p class="hint">Next opponent: <b>${STAR_RANKS[cur - 1]?.name || "Little star"}</b>${prog.rally ? ` · your longest rally ever: <b>${prog.rally}</b>` : ""}. Win a match to move up the ladder; click any star to play it.</p>`
    : `<p class="hint">You are at level <b>${gameId === "windy" ? windyStageOf(cur) : cur}</b>${played ? ` · ${plural(played, "level")} played · ${plural(starSum, "star")} on the map` : ""}. Click any level to play it; the path carries on from there.</p>`;
  if (gameId === "candles") html += lanternBoardHTML(prog);
  html += `</div>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll(".node").forEach(g => {
    const go = () => { state[def.pick] = +g.dataset.level; startGame(gameId, true); };
    g.addEventListener("click", go);
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  const sub = gameId === "candles" ? (LUMEN_STAGES.find(st => cur >= st.from && cur <= st.to)?.name || "")
    : gameId === "windy" ? windyNoteOf(windyStageOf(cur)) : "";
  const play = pongCard(gameId === "pong" ? `Play · vs the ${STAR_RANKS[cur - 1]?.name || "Little star"}` : `Continue · Level ${gameId === "windy" ? windyStageOf(cur) : cur}`, sub, () => { state[def.pick] = null; startGame(gameId, true); }, CARD_ART[gameId]);
  wrap.appendChild(play);
  wrap.appendChild(pongCard("↩ Back", "All games", renderSelect, CARD_ART[gameId]));
  focusHint(play);
}
function renderLanternLevels() { renderLevelMap("candles"); }
// stars and bests on a ladder game's map, from the round that just ended
function noteMapProgress(round) {
  const g = round.game;
  if (g !== "windy" && g !== "pairs" && g !== "pong") return;
  const bag = store.getProgress(state.patient, MAP_DEFS[g].bag) || { stars: {}, best: {}, plays: {} };
  bag.stars ??= {}; bag.best ??= {}; bag.plays ??= {};
  let L, stars, best;
  if (g === "pong") {
    // the star rank played: a match won is 3 stars, drawn 2, played 1; the
    // best is the longest rally against that star, and bag.rally the longest ever
    if (round.pongMode === "duo" || !round.starRank) return;
    L = round.starRank; stars = round.matchWon === true ? 3 : round.matchWon == null ? 2 : 1; best = round.bestRally || 0;
    bag.rally = Math.max(bag.rally || 0, round.bestRally || 0);
  }
  else if (g === "windy") { L = round.level; stars = round.levelStars || 0; best = round.gapsPassed || 0; }
  else { L = round.pairsLevel; const cleared = (round.boardsCleared || 0) > 0; stars = cleared ? ((round.wrongTurns || 0) <= 2 ? 3 : 2) : (round.pairsFound || 0) > 0 ? 1 : 0; best = round.pairsFound || 0; }
  if (!L) return;
  bag.stars[L] = Math.max(bag.stars[L] || 0, stars);
  bag.best[L] = Math.max(bag.best[L] || 0, best);
  bag.plays[L] = (bag.plays[L] || 0) + 1;
  bag.last = { level: L, date: new Date().toISOString() };
  store.setProgress(state.patient, MAP_DEFS[g].bag, bag);
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
    html += `<tr class="${r.me ? "me" : ""}"><td>${r.rank}</td><td class="nm">${r.me ? "<b>" + r.name + "</b>" : r.name}</td><td>${r.score.toLocaleString()}</td></tr>`;
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
  // The warm-up no longer opens the measurement (Oct 2026, by request: "no
  // need warm up before ROM"); it stays optional from the welcome screen's
  // "Warm up first" button.
  show("stage");
  audio.startBgm("assessment");
  const a = new Assessment(state.tracker, $("canvas"), arm, state.coachSens, {
    label: `${arm === "left" ? "Left" : "Right"} arm`,
    // device-level A/B switch (staff drawer): the drawn figure with two
    // circles and a lift, or the instruction video
    style: localStorage.getItem("strive-assess-style") || "video",
    // moved to a new spot partway: the shape so far is about the old spot,
    // so the measurement starts again from the beginning (26 Oct 2026)
    onMoved: () => {
      audio.stopBgm();
      $("prompt").innerHTML = "You moved to a new spot<small>Let's start again from the beginning</small>";
      speak("You moved to a new spot, so let's start the measurement again from the beginning.");
      setTimeout(() => { if (state.current === a) startAssessment({ ...opts, override: true, force: true }); }, 3500);
    },
  });
  state.current = a;
  const t0 = performance.now();
  a.start(profile => {
    profile.params = initialParams(profile);
    setTimeout(() => backupNow("assessment", true), 2000);
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
      requestAnimationFrame(romLiveLoop);   // once the layout has settled
      focusHint($("btn-rom-done"));
    };
    // the result straight away (26 Oct 2026, by request: it used to wait
    // behind the plan); on the arm's first measurement the therapist's
    // session plan follows it, on Continue
    state.romThen = firstEver ? "plan" : null;
    showResult();
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
// FIXED since Oct 2026 (by request: it used to go through the tracker's live
// frame, so the picture slid and rescaled as the patient moved or stood up):
// the shape is drawn in its own frame, the body centre in the middle of the
// canvas and the scale chosen so the full circle of the arm's length fits,
// whoever is or is not in front of the camera. The schematic figure says
// where the shape is measured from.
function romLiveLoop() {
  if (state.screen !== "screen-romcompare") return;
  const c = $("rom-live");
  if (!c) return;
  const box = c.getBoundingClientRect();
  const W = Math.max(2, Math.round(box.width)), H = Math.max(2, Math.round(box.height));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#161636"; ctx.fillRect(0, 0, W, H);
  const arm = state.side;
  const prof = store.getProfile(state.patient, arm);
  if (!prof?.envelope) return;
  const prev = (store.getPatient(state.patient).history[arm] || []).slice(-1)[0] || null;
  const TAU = Math.PI * 2;
  const cen = prof.center || { x: 0, y: 0 };
  // the frame: px per shoulder width so the widest reach, today's or last
  // time's, sits inside the canvas with a margin
  const reach = Math.max(...prof.envelope, ...(prev?.envelope || []), 1) * 1.15;
  const k = Math.min(W, H) * 0.46 / reach;
  const cx = W / 2, cy = H * 0.52;
  const P = rel => ({ x: cx + (rel.x - cen.x) * k, y: cy - (rel.y - cen.y) * k });
  romFigure(ctx, P, arm, prof);
  const shape = (env, pts, style) => {
    const n = env.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const kk = i % n, p = pts?.[kk];
      const th = (kk + 0.5) / n * TAU, r = env[kk];
      const rel = p ? { x: cen.x + p.x, y: cen.y + p.y } : { x: cen.x + Math.cos(th) * r, y: cen.y + Math.sin(th) * r };
      const q = P(rel);
      i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    }
    ctx.closePath(); style();
  };
  ctx.save();
  // (the dotted "ideal" circle of the arm's length went 26 Oct 2026, by
  // request: nobody moves in a perfect circle and staying inside one is not
  // the goal)
  if (prev?.envelope) shape(prev.envelope, prev.envPts, () => {
    ctx.strokeStyle = "rgba(244,236,221,0.45)"; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]);
  });
  shape(prof.envelope, prof.envPts, () => {
    ctx.fillStyle = "rgba(232,168,106,0.16)"; ctx.fill();
    ctx.strokeStyle = "rgba(232,168,106,0.85)"; ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(232,168,106,0.35)"; ctx.shadowBlur = 10; ctx.stroke();
  });
  const o = P(cen);
  ctx.shadowBlur = 0; ctx.fillStyle = "rgba(244,236,221,0.7)";
  ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

// The schematic figure under the shape: head, shoulders and trunk in
// shoulder-width units about the body centre, the assessed shoulder marked
// in amber. A drawing, not the patient; its job is to say where the shape
// is measured from. (The resting other arm and the shoulder label went in
// Oct 2026: fewer things on the screen.)
function romFigure(ctx, P0, arm, prof) {
  const TAU = Math.PI * 2;
  const cen = prof.center || { x: 0, y: 0 };
  const P = (x, y) => P0({ x: cen.x + x, y: cen.y + y });
  const torso = prof.torsoSW || 1.05;
  ctx.save();
  ctx.strokeStyle = "rgba(244,236,221,0.28)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const shL = P(-0.5, 0), shR = P(0.5, 0), hipL = P(-0.32, -torso), hipR = P(0.32, -torso);
  ctx.beginPath(); ctx.moveTo(shL.x, shL.y); ctx.lineTo(shR.x, shR.y); ctx.lineTo(hipR.x, hipR.y); ctx.lineTo(hipL.x, hipL.y); ctx.closePath(); ctx.stroke();
  const neck = P(0, 0.12), head = P(0, 0.42);
  ctx.beginPath(); ctx.moveTo(P(0, 0).x, P(0, 0).y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
  const hr = Math.abs(P(0.22, 0).x - P(0, 0).x);
  ctx.beginPath(); ctx.arc(head.x, head.y, hr, 0, TAU); ctx.stroke();
  const mine = arm === "right" ? shR : shL;
  ctx.fillStyle = "#e8a86a";
  ctx.beginPath(); ctx.arc(mine.x, mine.y, 7, 0, TAU); ctx.fill();
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
  $("rom-sub").textContent = `${arm === "left" ? "Left" : "Right"} arm${prev ? ` · last time ${fmtDay(prev.date)}` : " · your first measurement"}`;
  if (!cur) { $("rom-big").innerHTML = ""; $("rom-plot").innerHTML = ""; return; }

  const pct = v => v == null ? null : Math.round(v * 100);
  const nowPct = pct(cur.coverage) ?? 0, wasPct = pct(prev?.coverage);
  const dPct = wasPct == null ? null : nowPct - wasPct;
  const chip = dPct == null ? `<span class="chip sm">first measurement</span>`
    : Math.abs(dPct) < 3 ? `<span class="chip sm">about the same as last time</span>`
    : dPct > 0 ? `<span class="chip up">▲ ${dPct} points more than last time</span>`
    : `<span class="chip dn">▼ ${-dPct} points less than last time</span>`;
  $("rom-big").innerHTML = `
    <div class="pct">${nowPct}%</div>
    <div class="of">of the space your arm could reach</div>
    ${chip}`;

  // (the three tiles, lift / targets / longest reach, went 26 Oct 2026, by
  // request: the graph stands for itself; they stay on the therapist profile)

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
      : id === "pairs" ? (state.pairsLevelPick || store.getLevel(state.patient, "pairsLevel"))
      : id === "candles" ? (state.candlesLevelPick || store.getLevel(state.patient, "candlesLevel"))
      : id === "windy" ? (state.windyLevelPick || store.getLevel(state.patient, "windyLevel")) : undefined,
    mode: id === "pong" ? state.pongMode
      : id === "candles" ? state.candlesMode
      : id === "oars" ? state.oarsMode
      : id === "ferry" ? state.ferryMode
      : undefined,
    axis: id === "pong" ? state.pongAxis : undefined,
    // the Lantern's per-level bests and Star Atlas (Pip's flag is set from them)
    lumen: id === "candles" ? store.getProgress(state.patient, "candlesLumen") : undefined,
    starRank: id === "pong" ? (state.starRankPick || store.getLevel(state.patient, "starRank")) : undefined,
    bestRallyEver: id === "pong" ? (store.getProgress(state.patient, "pongMap")?.rally || 0) : undefined,
    // Pong's round-1 tutorial SETS the ball's pace only on the first game
    // ever on this arm (no stored Pong difficulty yet); after that it is a
    // warm-up and the pace is the level the patient has reached
    // (Oct 2026: the sweep no longer sets it; the speed level does)
    calibrate: false,
    pongLevel: id === "pong" ? store.getLevel(state.patient, pongLevelKey(state.pongAxis, state.side)) : undefined,
    // the Pong dials, the same for the single and the two-player game
    pongSpeed: id === "pong" ? state.pongSpeed : undefined,
    powerups: id === "pong" ? state.pongPowerups : undefined,
    song: id === "rhythm" ? state.song : undefined,
    tilesMode: id === "rhythm" ? state.tilesMode : undefined,
    bothArms: (id === "pong" && ["bimanual", "coupled", "team-arms"].includes(state.pongMode))
      || (id === "rhythm" && state.tilesMode === "bimanual")
      || id === "rgs"      // the RGS catch needs both hands by definition
      || id === "windy"    // two arms fly one jet: height from their mean, tilt from their difference
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
  state.windyLevelPick = null; $("in-windy-level").value = "";
  state.pairsLevelPick = null;
  state.starRankPick = null;
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

// Pong's speed level, per arm and per Pong (FE / Abd-Add): starts at 1
const pongLevelKey = (axis, side) => `pongLevel-${axis === "abd" ? "abd" : "fe"}-${side}`;

function onRoundEnd(round) {
  setTimeout(() => backupNow("round"), 1500);     // after the record is written
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
  // the ladder level before this round is banked, so the card can say
  // whether the next one is a level up, the same, or a little easier
  const LADDER = { windy: "windyLevel", candles: "candlesLevel", pairs: "pairsLevel", lens: "scratchLevel", dots: "dotsLevel" };
  const ladderKey = LADDER[round.game];
  const ladderPlayed = ladderKey ? (round.game === "windy" ? round.level : round.game === "candles" ? round.levelPlayed : null) ?? store.getLevel(state.patient, ladderKey) : null;
  // Scratch Cards: bank the level the round ended on
  if (round.game === "lens" && round.scratchLevel) {
    store.setLevel(state.patient, "scratchLevel", round.scratchLevel, 6);
  }
  if (round.game === "pairs" && round.pairsLevel) {
    store.setLevel(state.patient, "pairsLevel", round.pairsLevel, 6);
  }
  noteMapProgress(round);
  // Windy City Flap: up a level on a finished flight, down one at most when the hearts ran out
  if (round.game === "windy" && round.windyLevel) {
    store.setLevel(state.patient, "windyLevel", round.windyLevel, WINDY_MAX);
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

  round.date ??= new Date().toISOString();
  round.day = localDayKey();
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
  // Pong: the ball's pace follows the GAMES, not the hit rate. Since Oct 2026
  // the game itself moves it (games.js: the sweep sets it on the first game
  // on an arm, then every won game quickens it and every lost game slows
  // it) and the pace the match ended on is what is saved, with the speed
  // data logged per participant and arm (store.logPongSpeed) for the
  // export. The star climbs or drops a rank on the match (STAR_RANKS in
  // games.js), stored per patient as "starRank". A draw changes nothing.
  if (round.game === "pong" && round.pace) {
    const [lo, hi] = LIMITS.lifetime;
    result.params.lifetime = Math.max(lo, Math.min(hi, round.pace));
    store.logPongSpeed(state.patient, state.side, {
      axis: round.axis || "fe", mode: round.pongMode || "solo", calibrated: !!round.calibrated, sweepT: round.sweepT ?? null,
      paceStart: round.paceStart ?? null, pace: round.pace, games: round.paceByGame || [], matchWon: round.matchWon ?? null,
      gamesWon: round.gamesWon ?? null, gamesLost: round.gamesLost ?? null, bestRally: round.bestRally ?? null,
    });
  }
  // Pong: the level is the ball's speed (28 Oct 2026, by request). A match
  // won moves up one level, a match lost down one, a draw stays; the star's
  // rank no longer moves on its own (staff can still pick it on the map)
  if (round.game === "pong" && round.pongLevel) {
    const key = pongLevelKey(round.axis, state.side);
    const next = round.matchWon === true ? round.pongLevel + 1 : round.matchWon === false ? round.pongLevel - 1 : round.pongLevel;
    store.setLevel(state.patient, key, next, PONG_LEVEL_MAX);
    round.lvl = { from: round.pongLevel, to: Math.max(1, Math.min(PONG_LEVEL_MAX, next)), of: PONG_LEVEL_MAX, key };
    for (const ch of round.levelChanges || [])
      store.logPongLevel(state.patient, state.side, { axis: round.axis || "fe", kind: "manual-court", from: ch.from, to: ch.to, atS: ch.atS });
    store.logPongLevel(state.patient, state.side, {
      axis: round.axis || "fe", kind: "match", from: round.pongLevel, to: round.lvl.to, matchWon: round.matchWon ?? null,
      gamesWon: round.gamesWon ?? null, gamesLost: round.gamesLost ?? null, startedAt: round.pongLevelStart ?? null,
    });
  }
  store.saveGameParams(state.patient, state.side, paramKey(round.game, round.axis), result.params);
  // up / same / down for the round card: the ladder for the ladder games,
  // the match for Pong, the difficulty change for the rest
  {
    const dir = d => d > 0 ? "up" : d < 0 ? "down" : "same";
    if (ladderKey && round[ladderKey] != null && ladderPlayed != null) {
      round.next = dir(round[ladderKey] - ladderPlayed);
      // Windy City's steps show as their stage (the patient never sees "2.1")
      const show = n => round.game === "windy" ? windyStageOf(n) : n;
      const of = { windy: windyStageOf(WINDY_MAX), candles: CANDLE_MAX, pairs: PAIR_MAX, lens: 6, dots: 6 }[round.game];
      round.lvl ??= { from: show(ladderPlayed), to: show(round[ladderKey]), of,
        pips: round.game === "windy" ? windyPips(round[ladderKey]) : null };
    }
    else if (round.game === "pong") round.next = round.matchWon === true ? "up" : round.matchWon === false ? "down" : "same";
    else {
      const a = used, b = result.params;
      const harder = b.rangeScale > a.rangeScale || b.radius < a.radius || b.lifetime < a.lifetime;
      const easier = b.rangeScale < a.rangeScale || b.radius > a.radius || b.lifetime > a.lifetime;
      round.next = harder && !easier ? "up" : easier && !harder ? "down" : "same";
    }
  }
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
      const match = (r.games?.length || 0) > 1 || r.gamesWon != null;
      head = r.matchWon === true ? (match ? "You won the match!" : "You won the game!") : r.matchWon === false ? (match ? "A good match!" : "A good game!")
        : r.pointsPlayed > 0 ? "A draw!" : "Great rally!";
      const rally = r.bestRally ?? r.hits ?? 0;
      text = match && r.games?.length
        ? `${r.gamesWon} games to ${r.gamesLost} against ${them}, ${r.points} points to ${r.aiPoints}. Your longest rally was ${rally}.`
        : r.points != null && (r.points > 0 || r.aiPoints > 0)
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

// what the next round brings, in one line under the headline
const RC_NEXT = { up: "Level up next game!", same: "Same level next game", down: "A little easier next game" };
const RC_STAR = `<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><polygon points="12,2 14.9,8.6 22,9.3 16.5,14 18.3,21 12,17.3 5.7,21 7.5,14 2,9.3 9.1,8.6" fill="#e8a86a"/></svg>`;
let _rcStarTimer = null;
function renderBetween(round, note) {
  // stars, top right: the total, counting up from before this round, with
  // the round's own stars rising off it
  const p = store.getPatient(state.patient);
  const total = Math.max(p?.starsLifetime || 0, p?.stars || 0);
  const n = round.stars || 0;
  $("rc-stars").innerHTML = `${RC_STAR}<span class="rc-star-n" id="rc-star-n">${Math.max(0, total - n)}</span>`
    + (n > 0 ? `<span class="rc-star-plus">+${n}</span>` : "");
  clearInterval(_rcStarTimer);
  if (n > 0) {
    let v = Math.max(0, total - n);
    const step = () => { v++; const el = $("rc-star-n"); if (el) el.textContent = v; if (v >= total) clearInterval(_rcStarTimer); };
    if (A11Y.calm) $("rc-star-n").textContent = total;
    else setTimeout(() => { _rcStarTimer = setInterval(step, Math.max(120, 900 / n)); }, 500);
  }
  $("rc-head").textContent = roundSummary(round).head;
  // the level, top centre: the level just played, and only that ("Level up
  // next game!" under the headline says where the next one goes; the
  // "2 → 3" arrow was removed 28 Oct 2026, by request). Windy City shows
  // its stage with the three parts as pips.
  {
    const L = round.lvl, el = $("rc-level");
    // Pong: the NEXT match's speed level, with arrows to change it by hand
    // (28 Oct 2026, by request); every change is stored and logged
    if (L && L.key && round.game === "pong" && state.patient) {
      const show = () => {
        const n = store.getLevel(state.patient, L.key);
        el.innerHTML = `<button class="rc-step" data-d="-1" aria-label="Slower" ${n <= 1 ? "disabled" : ""}>◀</button>`
          + `Speed ${n}<small> of ${L.of}</small>`
          + `<button class="rc-step" data-d="1" aria-label="Faster" ${n >= L.of ? "disabled" : ""}>▶</button>`;
        for (const b of el.querySelectorAll(".rc-step")) b.onclick = () => {
          const from = store.getLevel(state.patient, L.key), to = Math.max(1, Math.min(L.of, from + +b.dataset.d));
          if (to === from) return;
          store.setLevel(state.patient, L.key, to, L.of);
          store.logPongLevel(state.patient, state.side, { axis: round.axis || "fe", kind: "manual-card", from, to });
          $("rc-next").textContent = to > L.from ? "Faster next game" : to < L.from ? "Slower next game" : RC_NEXT.same;
          show();
        };
      };
      show(); el.classList.remove("hidden");
    } else if (L && L.from) {
      el.innerHTML = `Level ${L.from}${L.pips ? ` <span class="rc-pips">${L.pips}</span>` : `<small> of ${L.of}</small>`}`;
      el.classList.remove("hidden");
    } else el.classList.add("hidden");
  }
  $("rc-next").textContent = A11Y.practice ? "Practice round. Nothing counts." : RC_NEXT[round.next] || "";
  // only the rest reminder stays on the card (every 4th round or a run of
  // posture slips; onRoundEnd also says it)
  $("rc-note").textContent = /rest|break/i.test(note || "") ? coachLine("fatigue_detected") : "";
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
      $("btn-finish").textContent = "Finish for today";
      focusHint($("btn-finish"));
    }
    if (f.dataset.feel === "tired")
      $("rc-note").textContent = "A little tired is okay. Rest whenever you like.";
    if (f.dataset.feel === "fine")
      $("rc-note").textContent = "Lovely. Play again whenever you are ready.";
  });
});

$("btn-next-round").dataset.dwell = "1";
$("btn-finish").dataset.dwell = "1";
$("btn-next-round").addEventListener("click", nextRound);
// straight back to the game selection (27 Oct 2026, by request: the
// collection screen is gone)
$("btn-finish").addEventListener("click", () => { state.plan = null; renderSelect(); show("screen-select"); });

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
  const LEVELS = { lens: ["scratchLevel", 6], dots: ["dotsLevel", 6], pairs: ["pairsLevel", 6], candles: ["candlesLevel", CANDLE_MAX], windy: ["windyLevel", WINDY_MAX] };
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
  if (state.romThen === "plan") { state.romThen = null; renderSchedule(() => { renderSelect(); show("screen-select"); }); return; }
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
probeTts().then(async info => {
  voiceState();
  // the model takes a few seconds to load after the bridge starts: ask again
  // until it is ready, then the drawer says so and the phrasebook is warmed
  for (let i = 0; i < 30 && info && info.loading && !ttsReady(); i++) {
    await new Promise(r => setTimeout(r, 2000));
    info = await probeTts();
    voiceState();
  }
  warmVoice();
});
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
$("in-posture-debug").value = localStorage.getItem("strive-posture-debug") === "1" ? "1" : "0";
$("in-posture-debug").addEventListener("change", e => localStorage.setItem("strive-posture-debug", e.target.value));
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
$("in-candles").addEventListener("change", e => { state.candlesMode = e.target.value; });
// the Lantern's level for the NEXT round (testing: any stage, at once); the ladder otherwise
for (let L = 1; L <= CANDLE_MAX; L++) {
  const st = LUMEN_STAGES.find(x => L >= x.from && L <= x.to);
  $("in-candles-level").add(new Option(`Level ${L} · ${st?.name || ""}`, String(L)));
}
$("in-candles-level").addEventListener("change", e => { state.candlesLevelPick = +e.target.value || null; });
// Windy City Flap's level for the NEXT round (testing: any level at once); the ladder otherwise
for (let L = 1; L <= WINDY_MAX; L++) $("in-windy-level").add(new Option(`Level ${windyStageOf(L)} · part ${windySubOf(L)} of 3${windyStageOf(L) > 12 ? " · endless" : ""}`, String(L)));
$("in-windy-level").addEventListener("change", e => { state.windyLevelPick = +e.target.value || null; });
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
  const back = ["screen-select", "screen-profile", "screen-between"].includes(state.screen) ? state.screen : "screen-select";
  renderSchedule(() => { if (back === "screen-select") renderSelect(); show(back); });
});

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
  if (!["screen-select", "screen-between", "screen-schedule"].includes(state.screen)) return;
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
    points: 3, aiPoints: 1, matchWon: true, trickPoints: 1, trickShots: { curve: 1 }, compEvents: [], next: "up", lvl: { from: 2, to: 3, of: 10 } };
  state.plan = { blocks: [{ game: "pong", axis: "fe", minutes: 15 }], idx: 0, startedAt: Date.now() - 5 * 60000 };
  renderBetween(sample, "You won, so the ball comes a little quicker next game, and the star grows into a Bright star.");
  // a guest has no day to total: sample numbers for the time bar
  $("rc-time").classList.remove("hidden");
  $("rc-time").innerHTML = `<div class="rc-time-line"><b>Today</b> 23 of 45 min</div><div class="rc-time-bar"><div style="width:51%"></div></div>`;
  show("screen-between");
} else if (previewOf === "score") {
  // ?preview=score&game=windy|candles|pairs: the same card for another game
  const g = new URLSearchParams(location.search).get("game") || "windy";
  state.patient = "guest"; state.side = "right"; state.roundNumber = 2;
  const S = {
    windy: { game: "windy", seconds: 90, stars: 1, completed: true, gapsPassed: 14, level: 4, windyLevel: 5, next: "up", lvl: { from: 2, to: 2, of: 16, pips: "● ● ○" } },
    candles: { game: "candles", seconds: 90, stars: 1, lanternsLit: 9, candles: 11, next: "same", lvl: { from: 6, to: 6, of: 23 } },
    pairs: { game: "pairs", seconds: 75, stars: 1, pairsFound: 3, turns: 9, boardsCleared: 0, next: "down", lvl: { from: 3, to: 2, of: 8 } },
  }[g];
  renderBetween({ compEvents: [], ...S }, "");
  $("rc-time").classList.remove("hidden");
  $("rc-time").innerHTML = `<div class="rc-time-line"><b>Today</b> 23 of 45 min</div><div class="rc-time-bar"><div style="width:51%"></div></div>`;
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
  // &n=10: that many assessments, two or three days apart, with the
  // ups and downs a real patient has (what the graph looks like later on)
  const n = Math.max(1, Math.min(24, +new URLSearchParams(location.search).get("n") || 4));
  const wob = i => [0, 0.03, -0.02, 0.04, -0.03, 0.02, 0.01, -0.04, 0.03, 0][i % 10];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 1 : i / (n - 1);
    store.saveProfile("preview", "right", mk(days(Math.round((n - 1 - i) * 2.5)), 0.55 + 0.4 * f + wob(i),
      Math.max(0.05, 0.22 + 0.25 * f + wob(i)), Math.round(95 + 37 * f), Math.min(5, 2 + Math.round(2 * f))));
  }
  renderRomCompare(["right"]); show("screen-romcompare"); romLiveLoop(); requestAnimationFrame(romLiveLoop);
  // the sample patient leaves storage with the page (romLiveLoop reads it
  // every frame, so it cannot go straight after the first draw)
  addEventListener("pagehide", () => {
    try {
      const raw = JSON.parse(localStorage.getItem("rehabsuite-v1"));
      if (raw?.patients?.preview) { delete raw.patients.preview; localStorage.setItem("rehabsuite-v1", JSON.stringify(raw)); }
    } catch {}
  });
} else if (previewOf === "plan" || previewOf === "hub") {
  // ?preview=plan / ?preview=hub (26 Oct 2026): those two screens with no
  // camera, for a screenshot; a throwaway "preview" participant with the
  // test profile, gone from storage with the page
  state.patient = "preview"; state.side = "right";
  store.saveProfile("preview", "right", testProfile("right"));
  store.setSchedule("preview", [{ game: "windy", level: null, minutes: 15 }, { game: "pong", axis: "fe", level: null, minutes: 15 },
    { game: "candles", level: null, minutes: 15 }, { game: "pairs", level: null, minutes: 15 }].slice(0, previewOf === "plan" ? 2 : 4));
  if (previewOf === "plan") renderSchedule(null);
  else { renderSelect(); show("screen-select"); }
  addEventListener("pagehide", () => {
    try {
      const raw = JSON.parse(localStorage.getItem("rehabsuite-v1"));
      if (raw?.patients?.preview) { delete raw.patients.preview; localStorage.setItem("rehabsuite-v1", JSON.stringify(raw)); }
    } catch {}
  });
} else if (new URLSearchParams(location.search).get("go")) {
  // ?go=<target>: straight to one game or screen (see testJump)
  boot().then(() => { state.tracker?.setSqueezeEase?.(A11Y.squeezeEase); watchWelcome(); testJump(new URLSearchParams(location.search)); });
} else {
  boot().then(() => { state.tracker?.setSqueezeEase?.(A11Y.squeezeEase); watchWelcome(); });
}

/* ================= test shortcuts (Oct 2026, by request) ================= */
// ?go=<target> jumps straight to one game or screen once the camera is up,
// so a game can be tested without the login, the welcome lift and the
// assessment in front of it. It logs in a throwaway participant ("tester"
// unless &name= says otherwise) and, when that arm has no reach profile yet,
// writes a synthetic one (a round 0.95 SW envelope, a 15-140 degree lift,
// all five targets reached, flagged test: true and reference
// "test-synthetic" so it can never pass for a measurement) with the DDA's
// seed parameters, so the games have a workspace to lay targets in. A real
// participant named with &name= keeps their own profile. Targets: a game id
// (pong, candles, pairs, windy, and any disabled game by its id), assess,
// select, welcome, warmup, rom, schedule, levels (&game=), duo, profile.
// Options: &arm=left|right (right), &level=N for the ladder
// games, &axis=fe|abd and &mode=solo|bimanual|... for Pong, &fresh=1 to
// rewrite the synthetic profile. The staff drawer lists these as links.
const TEST_TARGETS = {
  select: "the hub", welcome: "the welcome screen", warmup: "the warm-up", assess: "the assessment",
  rom: "the after-assessment screen", schedule: "the session plan", levels: "a level map (&game=)",
  duo: "Pong two-player setup", profile: "the therapist profile", board: "this week's board",
};
function testProfile(arm) {
  const envelope = Array.from({ length: 32 }, (_, i) =>
    Math.round((0.95 + 0.12 * Math.cos((i + 0.5) / 32 * Math.PI * 2 - 0.6)) * 1000) / 1000);
  const keys = ["down-out", "out", "up-out", "up-across", "across"], degs = [-45, 10, 65, 125, 180];
  const extremes = keys.map((key, i) => ({
    key, deg: degs[i], reached: true, frac: 0.85, reachSW: 0.81, askSW: 0.81, anatSW: 1.45, askFrac: 0.85, fracAnat: 0.56,
    timeMs: 2500, holdMs: 400, stability: 0.02, squeeze: i < 4, release: i < 4, preClosed: false, graspOk: i < 4,
  }));
  const profile = {
    arm, date: new Date().toISOString(), center: { x: 0, y: 0 }, reference: "test-synthetic", test: true,
    curlCal: null, envelope, envPts: null, covered: 1, armLenSW: 1.45, areaSW2: 2.6, coverage: 0.42,
    quadrants: { upOut: 0.28, upAcross: 0.24, downAcross: 0.22, downOut: 0.26 }, shoulderM: 0.38,
    style: "test", video: null, laps: [],
    lift: { startDeg: 15, peakDeg: 140, rangeDeg: 125, returned: true, seconds: 4 },
    extremes, arcMinDeg: 15, arcMaxDeg: 140, arcMeasured: true, jitter: 0.05, loopSeconds: 10,
    grasp: extremes.map(e => ({ deg: e.deg, key: e.key, ok: true, stability: e.stability, squeeze: e.graspOk })),
    reachablePositions: keys, graspPositions: keys.slice(0, 4), compEvents: [],
  };
  profile.params = initialParams(profile);
  return profile;
}
function testJump(q) {
  const go = q.get("go");
  const arm = q.get("arm") === "left" ? "left" : "right";
  const name = (q.get("name") || "tester").trim().slice(0, 24) || "tester";
  store.login(name);
  store.setArm(name, arm);
  if (!store.getProfile(name, arm) || q.get("fresh")) store.saveProfile(name, arm, testProfile(arm));
  applyLogin(name, arm);
  const level = q.get("level") ? Math.max(1, +q.get("level")) : null;
  const toHub = () => { renderSelect(); show("screen-select"); };
  const game = GAMES.find(g => g.id === go);
  if (game) {
    if (go === "pong") {
      state.pongMode = q.get("mode") || "solo"; $("in-pong").value = state.pongMode;
      state.pongAxis = q.get("axis") === "abd" ? "abd" : "fe";
      if (state.pongMode === "duo") { renderDuoSetup(); return; }
    }
    if (level) {
      if (go === "candles") state.candlesLevelPick = level;
      if (go === "windy") state.windyLevelPick = level;
      if (go === "pairs") state.pairsLevelPick = level;
    }
    startGame(go, true);
    return;
  }
  switch (go) {
    case "select": toHub(); break;
    case "welcome": show("screen-welcome"); break;
    case "warmup": startWarmup(toHub); break;
    case "assess": startAssessment({ override: true, force: true }); break;
    case "rom": renderRomCompare([arm]); show("screen-romcompare"); romLiveLoop(); break;
    case "schedule": renderSchedule(toHub); break;
    case "levels": renderLevelMap(MAP_DEFS[q.get("game")] ? q.get("game") : "windy"); break;
    case "duo": state.pongMode = "duo"; state.pongAxis = "fe"; $("in-pong").value = "duo"; renderDuoSetup(); break;
    case "profile": renderProfile(); show("screen-profile"); break;
    case "board": renderLeaderboard(); show("screen-select"); break;
    default: toHub(); speak(`No test target called ${go}.`);
  }
}
// the drawer's list of shortcuts: every enabled game, Pong's two axes, the screens
function renderTestLinks() {
  const box = $("testlinks");
  if (!box) return;
  const arm = state.side || "right";
  const link = (label, qs) => `<a href="?go=${qs}&arm=${arm}">${label}</a>`;
  const games = GAMES.filter(g => !g.disabled).flatMap(g => g.id === "pong"
    ? [link("Pong FE", "pong&axis=fe"), link("Pong Abd-Add", "pong&axis=abd"), link("Pong two players", "duo")]
    : [link(g.name, g.id)]);
  const screens = Object.entries(TEST_TARGETS).filter(([k]) => k !== "duo" && k !== "levels")
    .map(([k, v]) => link(v, k));
  const maps = Object.keys(MAP_DEFS).map(g => link(`${GAMES.find(x => x.id === g)?.name || g} levels`, `levels&game=${g}`));
  box.innerHTML = `<div>${games.join(" · ")}</div><div>${maps.join(" · ")}</div><div>${screens.join(" · ")}</div>` +
    `<div class="hint">Each link reloads straight into that game or screen as "tester" (${arm} arm, synthetic reach). Add <code>&name=</code> for a real participant, <code>&level=N</code>, <code>&mode=bimanual</code>.</div>`;
}
renderTestLinks();
$("in-arm").addEventListener("change", renderTestLinks);

/* ================= the launcher: services and backups (Oct 2026) ================= */
// tools/launcher.py serves the site and takes backups of the store; the staff
// drawer shows what is running and lets staff back up now or restore a copy
async function renderBackupUI() {
  const info = launcherInfo();
  const el = $("launcherstate");
  if (!info) { el.textContent = "Services: start the game with start_strive.bat to see them"; el.className = ""; }
  else {
    const parts = Object.values(info.services || {}).map(x => `${x.name.replace(" relay", "").replace(" bridge", "")} ${x.up ? "up" : "off"}`);
    el.textContent = `Services: ${parts.join(" · ")}${info.zed_present ? " · ZED plugged in" : ""}`;
    el.className = "ok";
  }
  $("backupstate").textContent = backupState();
  const sel = $("sel-backup");
  sel.innerHTML = "";
  if (info) {
    const list = await listBackups();
    for (const b of list) sel.add(new Option(`${b.at.replace("T", " ")} · ${Math.round(b.bytes / 1024)} KB`, b.file));
    if (!list.length) sel.add(new Option("none yet", ""));
  } else sel.add(new Option("launcher not running", ""));
  $("btn-backup-now").disabled = !info; $("btn-restore").disabled = !info;
}
$("btn-backup-now").addEventListener("click", async () => {
  const r = await backupNow("manual", true);
  $("backupstate").textContent = r?.ok ? (r.unchanged ? "Backups: nothing changed since the last one" : `Backups: saved ${r.file}`) : "Backups: could not save (is the launcher running?)";
  await probeLauncher(); renderBackupUI();
});
let restoreArmed = null;
$("btn-restore").addEventListener("click", async () => {
  const file = $("sel-backup").value;
  if (!file) return;
  if (restoreArmed !== file) {
    restoreArmed = file;
    $("btn-restore").textContent = "Click again to replace ALL data with this backup";
    setTimeout(() => { restoreArmed = null; $("btn-restore").textContent = "Restore…"; }, 8000);
    return;
  }
  try { await backupNow("before-restore", true); await restoreBackup(file); }
  catch (e) { $("backupstate").textContent = "Restore failed: " + e.message; restoreArmed = null; $("btn-restore").textContent = "Restore…"; }
});
probeLauncher().then(renderBackupUI);
startAutoBackup();

/* ================= this week's board (Oct 2026, by request: a leaderboard, with practice names for now) ================= */
// Ten fictional players whose stars for the week are anchored to the
// patient's own count on the first day they played this week, so a week of
// play climbs the board; it never compares one patient with another.
const BOARD_NAMES = [["Harbor Jo", 2.4], ["Mira of the Mill", 2.0], ["Old Tom", 1.7], ["Ana Lightkeeper", 1.45], ["Sam the Rower", 1.25],
  ["Lena Fisher", 1.08], ["Pip's cousin", 0.92], ["Benny the Baker", 0.78], ["Rosa Bell", 0.62], ["Wren", 0.48]];
function weekKey(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return dayKey(x); }   // the local Monday
function weekStars(name) {
  const p = store.getPatient(name), since = weekKey();
  return (p.sessions || []).filter(r => (r.day || (r.date || "").slice(0, 10)) >= since).reduce((a, r) => a + (r.stars || 0), 0);
}
function renderLeaderboard() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  document.querySelector("#screen-select h1").textContent = "This week's board";
  const mine = weekStars(state.patient);
  let anchor = store.getProgress(state.patient, "board") || {};
  if (anchor.week !== weekKey()) { anchor = { week: weekKey(), ref: Math.max(12, mine || 12) }; store.setProgress(state.patient, "board", anchor); }
  const seed = i => Math.abs((Math.sin(i * 12.9898 + anchor.ref) * 43758.5453) % 1);
  const rows = BOARD_NAMES.map(([name, f], i) => ({ name, score: Math.round(anchor.ref * f * (0.94 + 0.12 * seed(i))) }));
  rows.push({ name: state.patient === "guest" ? "You" : state.patient, score: mine, me: true });
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const me = rows.find(r => r.me), next = rows[me.rank - 2];
  const chase = !mine ? "Play a round this week to take your place." : next ? `${next.score - mine + 1} more star${next.score - mine + 1 === 1 ? "" : "s"} to pass ${next.name}.` : "Top of the board this week!";
  const html = rows.map(r => `<tr class="${r.me ? "me" : ""}"><td>${r.rank}</td><td class="nm">${r.me ? "<b>" + r.name + "</b>" : r.name}</td><td>${r.score}</td></tr>`).join("");
  wrap.innerHTML = `<div class="duo-setup"><div class="board"><h3>Stars this week</h3>
    <p>You are <b>#${me.rank}</b> of ${rows.length} with <b>${mine}</b> star${mine === 1 ? "" : "s"}. ${chase}</p>
    <table><tr><th>#</th><th class="nm">Player</th><th>Stars</th></tr>${html}</table>
    <p class="hint">A star is a minute of play. The other players are practice names for now.</p></div></div>`;
  const back = pongCard("↩ Back", "All games", renderSelect, CARD_ART.pong);
  wrap.appendChild(back);
  focusHint(back);
}
$("btn-select-board").addEventListener("click", renderLeaderboard);

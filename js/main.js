import { Tracker } from "./tracker.js";
import { Assessment } from "./assessment.js";
import { GAMES } from "./games.js";
import { SONGS } from "./songs.js";
import { initialParams, adjust } from "./dda.js";
import { store } from "./storage.js";
import { audio } from "./audio.js";

const $ = id => document.getElementById(id);
const SCREENS = ["screen-welcome", "screen-select", "stage", "screen-between", "screen-collections", "screen-profile"];

const state = {
  tracker: null,
  side: "right",
  patient: "guest",
  coachSens: "gentle",
  pongMode: "solo",
  pongSkills: "auto",
  song: "mary",
  tilesMode: "one",
  current: null,
  roundNumber: 0,
  sessionStars: 0,
  screen: "screen-welcome",
};

function show(id) {
  for (const s of SCREENS) $(s).classList.add("hidden");
  $(id).classList.remove("hidden");
  state.screen = id;
}

function resize() { const c = $("canvas"); c.width = innerWidth; c.height = innerHeight; }
addEventListener("resize", resize); resize();

/* ================= tracker boot ================= */
async function boot() {
  $("loading").classList.remove("hidden");
  try {
    const t = new Tracker();
    await t.init($("video"));
    t.start();
    state.tracker = t;
    $("camstate").textContent = "Camera: tracking";
    $("camstate").className = "ok";
  } catch (e) {
    $("camstate").textContent = "Camera: unavailable. " + e.message;
    $("camstate").className = "bad";
  } finally {
    $("loading").classList.add("hidden");
  }
}

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

// live mirror: draw the tracked upper body + both hands so the patient SEES
// what the camera sees (sage when framed well, amber while adjusting)
function drawWelcomeBody(ctx, c, t, framed) {
  const p = t.pts;
  if (!p?.shL || !p?.shR) return;
  const P = pt => t._videoToPx(pt.x, pt.y, c);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = framed ? "rgba(159,192,138,0.55)" : "rgba(232,168,106,0.5)";
  ctx.lineWidth = 6;
  const seg = (a, b) => { const A = P(a), B = P(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); };
  seg(p.shL, p.shR);
  const shMid = { x: (p.shL.x + p.shR.x) / 2, y: (p.shL.y + p.shR.y) / 2 };
  if (p.hipL && p.hipR) {
    seg(p.hipL, p.hipR);
    seg(shMid, { x: (p.hipL.x + p.hipR.x) / 2, y: (p.hipL.y + p.hipR.y) / 2 });
  }
  for (const s of ["left", "right"]) {
    const sh = t.shoulder(s), el = t.elbow(s), wr = t.wrist(s);
    if (sh && el?.ok) {
      seg(sh, el);
      if (wr?.ok) {
        seg(el, wr);
        const pm = t.palm(s);
        if (pm) seg(wr, pm);
      }
    }
  }
  const ear = p.earL && p.earR ? { x: (p.earL.x + p.earR.x) / 2, y: (p.earL.y + p.earR.y) / 2 } : (p.earL || p.earR);
  if (ear) {
    const E = P(ear);
    ctx.beginPath(); ctx.arc(E.x, E.y, 0.34 * t.pxPerSW(c), 0, TAU2); ctx.stroke();
  }
  // hands: glowing dots, ring tightens and turns sage on a squeeze
  for (const s of ["left", "right"]) {
    const hp = t.handPx(s, c);
    if (!hp) continue;
    const closed = t.handClosed(s);
    ctx.shadowColor = closed ? "rgba(159,192,138,0.9)" : "rgba(232,168,106,0.8)";
    ctx.shadowBlur = closed ? 26 : 18;
    ctx.fillStyle = closed ? "#9fc08a" : "#e8a86a";
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 11, 0, TAU2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = closed ? "#9fc08a" : "rgba(244,236,221,0.55)";
    ctx.lineWidth = closed ? 4 : 2.5;
    if (!closed) ctx.setLineDash([6, 7]);
    ctx.beginPath(); ctx.arc(hp.x, hp.y, closed ? 16 : 24, 0, TAU2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function watchWelcome() {
  let raisedSince = null, closedSince = null, framedSince = null, squeezeSeen = false;
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
    if (t.handClosed(state.side)) squeezeSeen = true;
    const handFresh = t._handPts(state.side) != null;
    setText(trackEl, t.trackingOk
      ? `Tracking: body ✓ · hand ${handFresh ? "✓" : "…"} · squeeze ${squeezeSeen ? "✓" : "… try closing your fist"}`
      : "Tracking: looking for you …");

    const msg = framingMessage(t);
    const framed = !msg;
    if (t.trackingOk) drawWelcomeBody(ctx, c, t, framed);

    if (msg) {
      framedSince = null; raisedSince = null; closedSince = null;
      setText(head, "Let's get you settled");
      setText(sub, msg);
      return;
    }
    framedSince ??= now;
    if (now - framedSince < 1400) {
      setText(head, "That's it");
      setText(sub, "Sit comfortably, just like that");
      return;
    }
    setText(head, "Ready when you are");
    setText(sub, "Lift your hand and squeeze to begin");

    // start gesture: lift + squeeze (fast), or just hold the hand up (fallback)
    const rel = t.handRel(state.side);
    let prog = 0;
    if (rel && rel.y > 0.15) {
      raisedSince ??= now;
      if (t.handClosed(state.side)) closedSince ??= now; else closedSince = null;
      prog = Math.max((now - raisedSince) / 3500, closedSince ? (now - closedSince) / 700 : 0);
      const hp = t.handPx(state.side, c);
      if (hp) {
        ctx.strokeStyle = "#fff2c2"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 32, -Math.PI / 2, -Math.PI / 2 + TAU2 * Math.min(1, prog)); ctx.stroke();
      }
      if (prog >= 1) { raisedSince = null; closedSince = null; enterSelect(); }
    } else { raisedSince = null; closedSince = null; }
  }
  loop();
  $("screen-welcome").addEventListener("click", enterSelect);
  $("btn-welcome-start").addEventListener("click", e => { e.stopPropagation(); enterSelect(); });
}

function enterSelect() {
  if (state.screen !== "screen-welcome" && state.screen !== "screen-profile") return;
  renderSelect();
  show("screen-select");
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
};

function renderSelect() {
  const wrap = $("cards");
  wrap.innerHTML = "";
  const prof = store.getProfile(state.patient, state.side);

  const mk = (id, name, locked, onClick) => {
    const b = document.createElement("button");
    b.className = "gcard";
    b.dataset.dwell = "1";
    b.innerHTML = CARD_ART[id] + `<div class="dwell-fill"></div><div class="title">${name}</div>` +
      (locked ? `<div class="lock">🔒<span>Draw your circle first</span></div>` : "");
    if (!locked) b.addEventListener("click", onClick);
    wrap.appendChild(b);
  };

  mk("assess", prof ? "Your circle" : "Draw your circle", false, startAssessment);
  for (const g of GAMES) { if (g.disabled) continue; mk(g.id, g.name, !prof, () => startGame(g.id, true)); }
}

/* ================= assessment ================= */
function startAssessment() {
  if (!state.tracker) return;
  show("stage");
  audio.startBgm("assessment");
  const a = new Assessment(state.tracker, $("canvas"), state.side, state.coachSens);
  state.current = a;
  a.start(profile => {
    audio.stopBgm();
    profile.params = initialParams(profile);
    store.saveProfile(state.patient, state.side, profile);
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
  const game = new def.cls(state.tracker, $("canvas"), state.side, prof, { ...prof.params }, {
    coachSens: state.coachSens, cursor: p.equippedCursor,
    tellStory: state.roundNumber === 1,
    stage: id === "drift" ? (state.driftStage || 1) : undefined,
    mode: id === "pong" ? state.pongMode : undefined,
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
  store.logRound(state.patient, round);
  state.sessionStars += round.stars;

  const prof = store.getProfile(state.patient, state.side);
  // compensation-caused misses shouldn't raise difficulty: if many coach
  // events this round, hold instead of increasing
  let result = adjust(prof.params, round);
  if (round.compEvents.length >= 3 && result.params.rangeScale > prof.params.rangeScale) {
    result = { params: prof.params, note: "Let's keep it steady while we work on posture." };
  }
  store.saveParams(state.patient, state.side, result.params);

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
  else if (round.game === "rhythm") lines.push(`You played <b>${round.notesHitPct}%</b> of "${round.song}", best streak <b>${round.bestCombo} notes</b>.`);
  else if (round.game === "compass") lines.push(`You lit <b>${round.hits} compass points</b> and always found your way home.`);
  else if (round.game === "echo") lines.push(`You found <b>${round.hits} echoes</b>${round.meanEchoErrSW != null ? `, on average <b>${round.meanEchoErrSW}</b> shoulder-widths from the star` : ""}.`);
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

  $("prof-arc-legend").innerHTML =
    `<div class="lg"><span class="dot" style="background:#e8a86a"></span>Trained (${state.side[0].toUpperCase()})
       <span class="val" style="color:#c77f4a;margin-left:6px">${prof ? prof.arcMinDeg + "°–" + prof.arcMaxDeg + "°" : "—"}</span></div>
     <div class="lg"><span class="dot" style="background:rgba(27,27,58,.35)"></span>Other (${other[0].toUpperCase()})
       <span class="val" style="color:rgba(27,27,58,.6);margin-left:6px">${oProf ? oProf.arcMinDeg + "°–" + oProf.arcMaxDeg + "°" : "—"}</span></div>`;

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
$("in-patient").addEventListener("input", e => { state.patient = (e.target.value || "guest").trim(); });
$("in-arm").addEventListener("change", e => { state.side = e.target.value; });
$("in-coach").addEventListener("change", e => { state.coachSens = e.target.value; });
$("in-pong").addEventListener("change", e => { state.pongMode = e.target.value; });
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

/* ================= hand-cursor dwell for menus ================= */
const DWELL_MS = 1400;
let dwellEl = null, dwellSince = 0;
function dwellLoop() {
  requestAnimationFrame(dwellLoop);
  const cursor = $("handcursor");
  const menuScreen = ["screen-select", "screen-between", "screen-collections"].includes(state.screen);
  if (!menuScreen || !state.tracker?.trackingOk) { cursor.classList.add("hidden"); dwellEl = null; return; }

  const p = store.getPatient(state.patient);
  cursor.classList.toggle("comet", p.equippedCursor === "comet");
  const pos = state.tracker.handPx(state.side, { width: innerWidth, height: innerHeight });
  if (!pos) { cursor.classList.add("hidden"); return; }
  cursor.classList.remove("hidden");
  cursor.style.left = pos.x + "px";
  cursor.style.top = pos.y + "px";

  const el = document.elementFromPoint(pos.x, pos.y)?.closest("[data-dwell]");
  if (el !== dwellEl) {
    dwellEl?.classList.remove("dwelling");
    dwellEl?.querySelector?.(".dwell-fill")?.style.setProperty("transform", "scaleY(0)");
    dwellEl = el;
    dwellSince = performance.now();
  }
  if (dwellEl) {
    const f = Math.min(1, (performance.now() - dwellSince) / DWELL_MS);
    dwellEl.classList.add("dwelling");
    const fill = dwellEl.querySelector(".dwell-fill");
    if (fill) { fill.style.transition = "none"; fill.style.transform = `scaleY(${f})`; }
    if (f >= 1) {
      const target = dwellEl;
      dwellEl = null;
      target.classList.remove("dwelling");
      target.click();
    }
  }
}

/* ================= boot ================= */
show("screen-welcome");
boot().then(watchWelcome);
dwellLoop();

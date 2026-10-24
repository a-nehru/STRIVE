// ARM PONG ONLINE (24 Oct 2026, by request): a standalone page, outside
// STRIVE, to play a friend over the internet. Each player's arm drives a
// paddle (the tracker's armAngle: arm down = paddle at the bottom, overhead
// = the top, over a lane that widens to whatever the arm reaches), the two
// browsers talk WebRTC directly (voice always on, video small, the game on
// a data channel) and the only thing that passes between them beforehand is
// a connection code, copied through any chat, or a room code through
// tools/pong_relay.py on one network. The HOST runs the physics; the guest
// sends its paddle and draws the host's state. The ball gains speed on every
// hit and with time and never slows until a point is lost; first to WIN_AT
// points takes the game.
import { Tracker } from "./tracker.js";

const $ = id => document.getElementById(id);
const WIN_AT = 7, PAD_H = 0.2, PAD_X = 0.04, BALL_R = 0.012;
const SPEED0 = 0.42, SPEED_HIT = 1.045, SPEED_PER_S = 1.012, SPEED_MAX = 2.4, SPEED_POINT = 1.06;
const ARM_LO = 25, ARM_HI = 155;        // degrees of arm elevation that span the lane to begin with
const STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

const G = {
  role: null, name: "", arm: "right", tracker: null, pc: null, dc: null, relay: null, room: null,
  peer: { name: "Friend", arm: "right" }, connected: false, solo: false,
  // the host's game
  ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 }, speed: SPEED0, pads: [0.5, 0.5], score: [0, 0], state: "wait", winner: null,
  serveAt: 0, serveDir: 1, ev: [], seq: 0, lastSend: 0, hits: 0,
  // the guest's copy
  remote: null, remoteAt: 0, myY: 0.5, lane: { lo: ARM_LO, hi: ARM_HI }, yFilt: 0.5,
  audio: null,
};

// ---------- sounds: three beeps, no files ----------
function beep(f, ms = 60, type = "square", gain = 0.06) {
  try {
    G.audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const a = G.audio, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = gain;
    o.connect(g); g.connect(a.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000); o.stop(a.currentTime + ms / 1000);
  } catch {}
}
const sfx = { hit: () => beep(520, 50), wall: () => beep(300, 40, "triangle"), point: () => { beep(660, 90); setTimeout(() => beep(880, 140), 90); }, lost: () => beep(180, 220, "sawtooth", 0.05) };

// ---------- the arm → paddle ----------
function myPaddle(dt) {
  const t = G.tracker;
  const a = t?.trackingOk ? t.armAngle(G.arm) : null;
  if (a == null) return G.yFilt;
  // the lane widens to any angle the arm reaches past it, so a small arm still spans it
  if (a < G.lane.lo) G.lane.lo = a; if (a > G.lane.hi) G.lane.hi = a;
  const f = Math.max(0, Math.min(1, (a - G.lane.lo) / Math.max(20, G.lane.hi - G.lane.lo)));
  const y = 1 - f;                                   // 0 = top of the court
  const k = Math.min(1, dt / 90);                    // a light smoothing: calm when held, quick when moving
  G.yFilt += (y - G.yFilt) * (Math.abs(y - G.yFilt) > 0.08 ? Math.min(1, k * 3) : k);
  return G.yFilt;
}

// ---------- the host's physics ----------
function serve(dir) {
  G.ball = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
  G.state = "serve"; G.serveAt = performance.now(); G.serveDir = dir;
}
function launch() {
  const ang = (Math.random() - 0.5) * 0.9;
  G.ball.vx = Math.cos(ang) * G.speed * G.serveDir; G.ball.vy = Math.sin(ang) * G.speed;
  G.state = "play";
}
function step(dt) {
  const s = dt / 1000, b = G.ball;
  if (G.state === "serve" && performance.now() - G.serveAt > 1300) launch();
  if (G.state !== "play") return;
  G.speed = Math.min(SPEED_MAX, G.speed * Math.pow(SPEED_PER_S, s));   // time alone makes it quicker
  const sp = Math.hypot(b.vx, b.vy) || G.speed, k = G.speed / sp; b.vx *= k; b.vy *= k;
  b.x += b.vx * s; b.y += b.vy * s;
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); G.ev.push("wall"); }
  if (b.y > 1 - BALL_R) { b.y = 1 - BALL_R; b.vy = -Math.abs(b.vy); G.ev.push("wall"); }
  const hit = (px, py, dir) => {
    if (Math.abs(b.x - px) > BALL_R + 0.012 || (dir > 0 ? b.vx > 0 : b.vx < 0)) return false;
    if (b.y < py - PAD_H / 2 - BALL_R || b.y > py + PAD_H / 2 + BALL_R) return false;
    const off = (b.y - py) / (PAD_H / 2);           // -1 top of the paddle .. 1 bottom
    G.speed = Math.min(SPEED_MAX, G.speed * SPEED_HIT); G.hits++;
    const ang = off * 0.95;
    b.vx = Math.cos(ang) * G.speed * dir; b.vy = Math.sin(ang) * G.speed;
    b.x = px + (BALL_R + 0.013) * dir;
    G.ev.push("hit");
    return true;
  };
  hit(PAD_X, G.pads[0], 1) || hit(1 - PAD_X, G.pads[1], -1);
  if (b.x < -0.05 || b.x > 1.05) {
    const who = b.x < 0 ? 1 : 0;                     // the side that did not reach it loses the point
    G.score[who]++;
    G.ev.push("point:" + who);
    // the point lost does not slow the ball back down: it starts a little
    // quicker than this game began, and keeps climbing
    G.speed = Math.min(SPEED_MAX, SPEED0 * Math.pow(SPEED_POINT, G.score[0] + G.score[1]));
    if (G.score[who] >= WIN_AT) { G.state = "over"; G.winner = who; G.ball = null; }
    else serve(who === 0 ? -1 : 1);
  }
}
function hostTick(now, dt) {
  G.pads[0] = myPaddle(dt);
  if (G.solo) {
    // practice: the other paddle follows the ball, a little late
    const target = G.ball ? G.ball.y : 0.5;
    G.pads[1] += (target - G.pads[1]) * Math.min(1, dt / 260);
  } else if (G.remote && now - G.remoteAt < 1500) G.pads[1] = G.remote.y;
  if (G.state === "wait" && (G.solo || G.connected)) serve(1);
  step(dt);
  if (G.dc?.readyState === "open" && now - G.lastSend > 33) {
    G.lastSend = now;
    G.dc.send(JSON.stringify({ t: "s", b: G.ball ? [G.ball.x, G.ball.y] : null, p: G.pads, sc: G.score, sp: G.speed, st: G.state, w: G.winner, ev: G.ev.splice(0), n: ++G.seq }));
  }
  for (const e of G.ev.splice(0)) playEvent(e, 0);
}
function guestTick(now, dt) {
  G.myY = myPaddle(dt);
  if (G.dc?.readyState === "open" && now - G.lastSend > 33) { G.lastSend = now; G.dc.send(JSON.stringify({ t: "p", y: G.myY })); }
  const r = G.remote;
  if (!r) return;
  G.pads = [r.p[0], G.myY]; G.ball = r.b ? { x: r.b[0], y: r.b[1] } : null; G.score = r.sc; G.speed = r.sp; G.state = r.st; G.winner = r.w;
  for (const e of r.ev || []) playEvent(e, 1);
  r.ev = [];
}
function playEvent(e, meIdx) {
  if (e === "hit") sfx.hit(); else if (e === "wall") sfx.wall();
  else if (e.startsWith("point:")) { (+e.slice(6) === meIdx ? sfx.point : sfx.lost)(); }
}

// ---------- drawing ----------
const cv = $("court"), ctx = cv.getContext("2d");
function resize() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener("resize", resize); resize();
function draw(now) {
  const W = cv.width, H = cv.height, me = G.role === "guest" ? 1 : 0;
  ctx.fillStyle = "#1b1b3a"; ctx.fillRect(0, 0, W, H);
  // the court: a dashed centre line, the two names, the score, the speed
  ctx.strokeStyle = "rgba(244,236,221,.18)"; ctx.lineWidth = 3; ctx.setLineDash([14, 14]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(244,236,221,.9)";
  ctx.font = `900 ${Math.round(H * 0.11)}px Nunito, sans-serif`;
  ctx.fillText(String(G.score[0]), W * 0.25, H * 0.14); ctx.fillText(String(G.score[1]), W * 0.75, H * 0.14);
  ctx.font = `800 ${Math.round(H * 0.028)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.7)";
  const names = [G.role === "guest" ? G.peer.name : (G.name || "You"), G.role === "guest" ? (G.name || "You") : (G.solo ? "The wall" : G.peer.name)];
  ctx.fillText(names[0] + (me === 0 ? " (you)" : ""), W * 0.25, H * 0.25); ctx.fillText(names[1] + (me === 1 ? " (you)" : ""), W * 0.75, H * 0.25);
  // the speed: a bar at the top that fills as the ball quickens, red near the top
  const f = (G.speed - SPEED0) / (SPEED_MAX - SPEED0), bw = W * 0.36;
  ctx.fillStyle = "rgba(244,236,221,.15)"; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, 18, bw, 12, 6); ctx.fill();
  ctx.fillStyle = f > 0.7 ? "#d97b6c" : f > 0.4 ? "#e8a86a" : "#9fc08a"; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, 18, Math.max(12, bw * Math.min(1, f)), 12, 6); ctx.fill();
  ctx.font = `800 ${Math.round(H * 0.02)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.6)";
  ctx.fillText(`speed ${(G.speed / SPEED0).toFixed(1)}×`, W / 2, 46);
  // paddles: you amber, them teal
  const padW = Math.max(10, W * 0.012);
  [0, 1].forEach(i => {
    const x = (i === 0 ? PAD_X : 1 - PAD_X) * W, y = G.pads[i] * H;
    ctx.fillStyle = i === me ? "#e8a86a" : "#5fb8b0";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.roundRect(x - padW / 2, y - PAD_H * H / 2, padW, PAD_H * H, padW / 2); ctx.fill();
    ctx.shadowBlur = 0;
  });
  if (G.ball) {
    const b = G.ball, r = BALL_R * H;
    ctx.fillStyle = "#fff6d8"; ctx.shadowColor = "#ffd98a"; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(b.x * W, b.y * H, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  if (G.state === "serve") {
    ctx.font = `800 ${Math.round(H * 0.035)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.8)";
    ctx.fillText("Ready…", W / 2, H * 0.5 - H * 0.07);
  }
  if (G.state === "wait") {
    ctx.font = `800 ${Math.round(H * 0.035)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.8)";
    ctx.fillText(G.connected ? "Here we go" : "Waiting for your friend…", W / 2, H * 0.5);
  }
  if (!G.tracker?.trackingOk) {
    ctx.font = `800 ${Math.round(H * 0.024)}px Nunito, sans-serif`; ctx.fillStyle = "#e8a86a";
    ctx.fillText("Step back so the camera sees your shoulders and arm", W / 2, H * 0.92);
  }
}
let last = 0;
function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (G.role === "host") hostTick(now, dt); else if (G.role === "guest") guestTick(now, dt);
  draw(now);
  if (G.state === "over" && !$("over").classList.contains("on")) {
    const me = G.role === "guest" ? 1 : 0, won = G.winner === me;
    $("over-title").textContent = won ? "You won!" : (G.solo ? "The wall won" : `${G.peer.name} won`);
    $("over-sub").textContent = `${G.score[0]} – ${G.score[1]} · the ball got to ${(G.speed / SPEED0).toFixed(1)}× speed`;
    $("btn-again").style.display = G.role === "host" ? "" : "none";
    if (G.role === "guest") $("over-sub").textContent += " · waiting for the host to play again";
    $("over").classList.add("on");
  }
  if (G.state !== "over") $("over").classList.remove("on");
  requestAnimationFrame(loop);
}

// ---------- the camera, the tracker, the mic ----------
let media = null;
async function startCamera() {
  status("Starting the camera…");
  const t = new Tracker();
  await t.init($("me"), "webcam", s => status(s));
  t.start();
  G.tracker = t;
  // the mic, always on; the video for the friend is the tracker's own camera stream
  try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
  catch (e) { status("No microphone: " + e.message + " (the game still works)"); }
  $("hud").classList.add("on");
}
function status(s) { $("status").textContent = s; }

// ---------- WebRTC: voice, video and the game channel ----------
function makePeer() {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  G.pc = pc;
  if (media) for (const tr of media.getAudioTracks()) pc.addTrack(tr, media);
  const camStream = $("me").srcObject;
  if (camStream) for (const tr of camStream.getVideoTracks()) pc.addTrack(tr, camStream);
  const remote = new MediaStream();
  pc.ontrack = ev => { remote.addTrack(ev.track); $("friend").srcObject = remote; };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    $("chip-link").textContent = st === "connected" ? "● connected" : st === "failed" ? "● failed" : "● " + st;
    if (st === "connected") { G.connected = true; $("lobby").style.display = "none"; }
    if (st === "failed" || st === "disconnected") { G.connected = false; status("The connection dropped."); }
  };
  return pc;
}
function wireChannel(dc) {
  G.dc = dc;
  dc.onopen = () => { dc.send(JSON.stringify({ t: "hi", name: G.name, arm: G.arm })); G.connected = true; $("lobby").style.display = "none"; };
  dc.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === "hi") { G.peer = { name: m.name || "Friend", arm: m.arm }; $("friendtag").textContent = G.peer.name; }
    else if (m.t === "s") { G.remote = m; G.remoteAt = performance.now(); }
    else if (m.t === "p") { G.remote = { y: m.y }; G.remoteAt = performance.now(); }
  };
}
const gathered = pc => new Promise(res => {
  if (pc.iceGatheringState === "complete") return res();
  const t = setTimeout(res, 4000);                   // whatever candidates we have by then
  pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } };
});
const enc = d => btoa(unescape(encodeURIComponent(JSON.stringify({ type: d.type, sdp: d.sdp }))));
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));

async function hostOffer() {
  const pc = makePeer();
  wireChannel(pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 }));
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  return enc(pc.localDescription);
}
async function hostAccept(answerCode) { await G.pc.setRemoteDescription(dec(answerCode)); }
async function guestAnswer(offerCode) {
  const pc = makePeer();
  pc.ondatachannel = ev => wireChannel(ev.channel);
  await pc.setRemoteDescription(dec(offerCode));
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return enc(pc.localDescription);
}

// ---------- the relay path: the same codes, carried by tools/pong_relay.py ----------
async function relaySignal(relay, room) {
  const post = (path, body) => fetch(`${relay}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const j = await post("/join", { room, name: G.name });
  if (!j.ok) throw new Error(j.error);
  G.role = j.role;
  status(`In room ${room} as the ${G.role}. Waiting for the other player…`);
  const poll = async () => (await (await fetch(`${relay}/sig?room=${room}&role=${G.role}`, { cache: "no-store" })).json()).msgs || [];
  if (G.role === "host") {
    const code = await hostOffer();
    await post("/sig", { room, role: G.role, msg: { offer: code } });
    for (;;) { const ms = await poll(); const a = ms.find(m => m.answer); if (a) { await hostAccept(a.answer); return; } await new Promise(r => setTimeout(r, 700)); }
  } else {
    for (;;) {
      const ms = await poll(); const o = ms.find(m => m.offer);
      if (o) { const code = await guestAnswer(o.offer); await post("/sig", { room, role: G.role, msg: { answer: code } }); return; }
      await new Promise(r => setTimeout(r, 700));
    }
  }
}

// ---------- the lobby ----------
function readForm() {
  G.name = $("name").value.trim().slice(0, 20) || "You"; G.arm = $("arm").value; G.relay = $("relay").value.trim().replace(/\/$/, "");
  localStorage.setItem("armpong", JSON.stringify({ name: G.name, arm: G.arm, relay: G.relay }));
  $("metag").textContent = G.name + " · " + G.arm + " arm";
}
try { const s = JSON.parse(localStorage.getItem("armpong") || "{}"); if (s.name) $("name").value = s.name; if (s.arm) $("arm").value = s.arm; if (s.relay) $("relay").value = s.relay; } catch {}
const show = id => { for (const s of document.querySelectorAll(".step")) s.classList.toggle("on", s.id === id); };
$("btn-host").onclick = async () => {
  readForm();
  if (G.relay) { show("step-relay"); G.pendingRole = "host"; return; }
  G.role = "host";
  try { await startCamera(); $("offer").value = await hostOffer(); show("step-host"); status("Send your code, then paste the reply."); } catch (e) { status("Could not start: " + e.message); }
};
$("btn-join").onclick = async () => {
  readForm();
  if (G.relay) { show("step-relay"); G.pendingRole = "guest"; return; }
  G.role = "guest";
  try { await startCamera(); show("step-join"); status("Paste your friend's code."); } catch (e) { status("Could not start: " + e.message); }
};
$("btn-solo").onclick = async () => {
  readForm(); G.role = "host"; G.solo = true;
  try { await startCamera(); $("lobby").style.display = "none"; $("friendtag").textContent = "The wall"; $("chip-link").textContent = "● practice"; } catch (e) { status("Could not start: " + e.message); }
};
$("btn-relay-go").onclick = async () => {
  const room = $("room").value.trim().toUpperCase(); if (!room) { status("Type a room code."); return; }
  try { await startCamera(); await relaySignal(G.relay, room); } catch (e) { status("Relay: " + e.message); }
};
$("btn-copy-offer").onclick = () => navigator.clipboard?.writeText($("offer").value).then(() => status("Code copied."));
$("btn-copy-answer").onclick = () => navigator.clipboard?.writeText($("answer").value).then(() => status("Reply copied."));
$("btn-connect").onclick = async () => { try { await hostAccept($("answer-in").value); status("Connecting…"); } catch (e) { status("That reply did not work: " + e.message); } };
$("btn-reply").onclick = async () => { try { $("answer").value = await guestAnswer($("offer-in").value); status("Send your reply to your friend. The game starts when they connect."); } catch (e) { status("That code did not work: " + e.message); } };
$("btn-again").onclick = () => { if (G.role !== "host") return; G.score = [0, 0]; G.speed = SPEED0; G.winner = null; G.hits = 0; serve(1); $("over").classList.remove("on"); };
$("chip-mic").onclick = () => { const on = $("chip-mic").classList.toggle("off"); media?.getAudioTracks().forEach(t => t.enabled = !on); $("chip-mic").textContent = on ? "🎙 mic off" : "🎙 mic on"; };
$("chip-cam").onclick = () => { const on = $("chip-cam").classList.toggle("off"); $("me").srcObject?.getVideoTracks().forEach(t => t.enabled = !on); $("chip-cam").textContent = on ? "📷 cam off" : "📷 cam on"; };
// ?relay=&room=&role= skips the form
{
  const q = new URLSearchParams(location.search);
  if (q.get("room")) { $("room").value = q.get("room"); if (q.get("relay")) $("relay").value = q.get("relay"); }
}
requestAnimationFrame(loop);

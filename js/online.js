// ARM PONG ONLINE (24 Oct 2026, by request): a standalone page, outside
// STRIVE, to play a friend over the internet. Each player's arm drives a
// paddle (the tracker's armAngle: arm down = paddle at the bottom, overhead
// = the top, over a lane that widens to whatever the arm reaches), the two
// browsers talk WebRTC directly (voice always on, video small, the game on
// a data channel) and the only thing that passes between them beforehand is
// a four-letter room code: PeerJS (the public PeerServer, cdnjs) carries
// the WebRTC signalling, so the host shows a code and the friend types it,
// nothing longer to copy. The HOST runs the physics; the guest
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
  audio: null, trail: [], fx: [], shake: 0, flash: null,
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
  const b = G.ball || { x: 0.5, y: 0.5 }, speedF = (G.speed - SPEED0) / (SPEED_MAX - SPEED0);
  if (e === "hit") { sfx.hit(); burst(b.x, b.y, "#ffd98a", 10, 0.8 + speedF); G.shake = 4 + 10 * speedF; }
  else if (e === "wall") { sfx.wall(); burst(b.x, b.y, "rgba(244,236,221,.8)", 5, 0.5); }
  else if (e.startsWith("point:")) {
    const who = +e.slice(6), mine = who === meIdx;
    (mine ? sfx.point : sfx.lost)();
    burst(b.x, b.y, mine ? "#e8a86a" : "#5fb8b0", 24, 1.4); G.shake = 10;
    G.flash = { text: mine ? "Point!" : (G.solo ? "The wall scores" : `${G.peer.name} scores`), col: mine ? "#ffd98a" : "#5fb8b0", until: performance.now() + 1100 };
  }
}

// ---------- drawing ----------
const cv = $("court"), ctx = cv.getContext("2d");
function resize() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener("resize", resize); resize();
function burst(x, y, col, n = 14, sp = 1) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (0.15 + Math.random() * 0.35) * sp; G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 1, col }); }
}
function draw(now, dt) {
  const W = cv.width, H = cv.height, me = G.role === "guest" ? 1 : 0;
  const s = dt / 1000;
  const speedF = Math.max(0, Math.min(1, (G.speed - SPEED0) / (SPEED_MAX - SPEED0)));
  // the court: a deep gradient, a soft glow that warms as the ball quickens
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1a1a3c"); g.addColorStop(1, "#101024");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.9);
  rg.addColorStop(0, `rgba(${232},${168 - 60 * speedF},${106 - 60 * speedF},${0.05 + 0.1 * speedF})`); rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (G.shake > 0) { ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake); G.shake = Math.max(0, G.shake - 60 * s); }
  // the rails, top and bottom, lit
  ctx.strokeStyle = `rgba(244,236,221,${0.25 + 0.3 * speedF})`; ctx.lineWidth = 4; ctx.shadowColor = "#e8a86a"; ctx.shadowBlur = 12 * speedF;
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(W, 2); ctx.moveTo(0, H - 2); ctx.lineTo(W, H - 2); ctx.stroke(); ctx.shadowBlur = 0;
  // the centre line
  ctx.strokeStyle = "rgba(244,236,221,.14)"; ctx.lineWidth = 2; ctx.setLineDash([10, 16]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
  // scores and names
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const names = [G.role === "guest" ? G.peer.name : (G.name || "You"), G.role === "guest" ? (G.name || "You") : (G.solo ? "The wall" : G.peer.name)];
  [0, 1].forEach(i => {
    const x = W * (i ? 0.75 : 0.25), mine = i === me;
    ctx.fillStyle = mine ? "rgba(232,168,106,.9)" : "rgba(95,184,176,.9)";
    ctx.font = `900 ${Math.round(H * 0.13)}px Nunito, sans-serif`;
    ctx.fillText(String(G.score[i]), x, H * 0.15);
    ctx.font = `800 ${Math.round(H * 0.026)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.55)";
    ctx.fillText(names[i] + (mine ? "  ·  you" : ""), x, H * 0.255);
  });
  // the speed bar
  const bw = W * 0.3, bx = W / 2 - bw / 2, by = 22;
  ctx.fillStyle = "rgba(244,236,221,.12)"; ctx.beginPath(); ctx.roundRect(bx, by, bw, 10, 5); ctx.fill();
  ctx.fillStyle = speedF > 0.7 ? "#d97b6c" : speedF > 0.4 ? "#e8a86a" : "#9fc08a";
  ctx.beginPath(); ctx.roundRect(bx, by, Math.max(10, bw * speedF), 10, 5); ctx.fill();
  ctx.font = `800 ${Math.round(H * 0.019)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.55)";
  ctx.fillText(`${(G.speed / SPEED0).toFixed(1)}× speed`, W / 2, by + 26);
  // the ball's trail
  if (G.ball) { G.trail.push({ x: G.ball.x, y: G.ball.y, t: now }); } else G.trail.length = 0;
  G.trail = G.trail.filter(p => now - p.t < 260);
  for (const p of G.trail) {
    const a = 1 - (now - p.t) / 260;
    ctx.fillStyle = `rgba(255,217,138,${a * 0.35})`; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, BALL_R * H * (0.4 + 0.6 * a), 0, Math.PI * 2); ctx.fill();
  }
  // paddles: yours amber, theirs teal, rounded, lit
  const padW = Math.max(12, W * 0.013);
  [0, 1].forEach(i => {
    const x = (i === 0 ? PAD_X : 1 - PAD_X) * W, y = G.pads[i] * H, col = i === me ? "#e8a86a" : "#5fb8b0";
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.roundRect(x - padW / 2, y - PAD_H * H / 2, padW, PAD_H * H, padW / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.roundRect(x - padW / 2 + 3, y - PAD_H * H / 2 + 6, padW / 3, PAD_H * H - 12, padW / 6); ctx.fill();
  });
  // the ball
  if (G.ball) {
    const b = G.ball, r = BALL_R * H;
    ctx.fillStyle = "#fff6d8"; ctx.shadowColor = "#ffd98a"; ctx.shadowBlur = 26 + 20 * speedF;
    ctx.beginPath(); ctx.arc(b.x * W, b.y * H, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  // sparks
  for (const f of G.fx) { f.x += f.vx * s; f.y += f.vy * s; f.vy += 0.5 * s; f.t -= s * 1.6; }
  G.fx = G.fx.filter(f => f.t > 0);
  for (const f of G.fx) { ctx.globalAlpha = Math.max(0, f.t); ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x * W, f.y * H, 3 + 3 * f.t, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.restore();
  // words: the serve, the wait, a point
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (G.state === "serve") {
    const k = Math.min(1, (performance.now() - G.serveAt) / 1300);
    ctx.strokeStyle = "rgba(244,236,221,.35)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, H * 0.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
  if (G.state === "wait") {
    ctx.font = `800 ${Math.round(H * 0.034)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(244,236,221,.75)";
    ctx.fillText(G.connected ? "Here we go" : "Waiting for your friend…", W / 2, H * 0.5);
  }
  if (G.flash && now < G.flash.until) {
    const a = Math.min(1, (G.flash.until - now) / 400);
    ctx.globalAlpha = a; ctx.font = `900 ${Math.round(H * 0.07)}px Nunito, sans-serif`; ctx.fillStyle = G.flash.col;
    ctx.shadowColor = G.flash.col; ctx.shadowBlur = 20;
    ctx.fillText(G.flash.text, W / 2, H * 0.42); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  $("track").classList.toggle("on", !!G.tracker && !G.tracker.trackingOk && G.state !== "over");
}
// THE SKELETON on your own picture: just the playing arm (shoulder, elbow,
// wrist) and the hand's 21 points, in the same mirrored frame as the video
function drawSkeleton() {
  const t = G.tracker, cvs = $("meskel"), vid = $("me");
  if (!t || !cvs) return;
  const box = cvs.getBoundingClientRect();
  if (cvs.width !== Math.round(box.width) || cvs.height !== Math.round(box.height)) { cvs.width = Math.round(box.width); cvs.height = Math.round(box.height); }
  const c2 = cvs.getContext("2d"), W = cvs.width, H = cvs.height;
  c2.clearRect(0, 0, W, H);
  const vw = t.srcW || vid.videoWidth || 640, vh = t.srcH || vid.videoHeight || 480;
  const sc = Math.max(W / vw, H / vh), dw = vw * sc, dh = vh * sc, ox = (W - dw) / 2, oy = (H - dh) / 2;
  const P = p => ({ x: ox + p.x * dw, y: oy + p.y * dh });
  const side = G.arm === "left" ? "L" : "R", pts = t.pts || {};
  const sh = pts["sh" + side], el = pts["el" + side], wr = pts["wr" + side];
  const ok = t.trackingOk && sh && el && wr;
  const col = ok ? "#e8a86a" : "rgba(244,236,221,.35)";
  c2.lineCap = "round"; c2.lineJoin = "round";
  if (sh && el && wr) {
    const a = P(sh), b = P(el), w = P(wr);
    c2.strokeStyle = col; c2.lineWidth = 4; c2.shadowColor = col; c2.shadowBlur = 8;
    c2.beginPath(); c2.moveTo(a.x, a.y); c2.lineTo(b.x, b.y); c2.lineTo(w.x, w.y); c2.stroke(); c2.shadowBlur = 0;
    for (const q of [a, b]) { c2.fillStyle = col; c2.beginPath(); c2.arc(q.x, q.y, 5, 0, Math.PI * 2); c2.fill(); }
    c2.fillStyle = "#fff6d8"; c2.beginPath(); c2.arc(w.x, w.y, 6, 0, Math.PI * 2); c2.fill();
  }
  const hp = t._handPts?.(G.arm);
  if (hp && hp.length >= 21) {
    const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    c2.strokeStyle = "rgba(255,246,216,.9)"; c2.lineWidth = 2;
    for (const [i, j] of bones) { const a = P(hp[i]), b = P(hp[j]); c2.beginPath(); c2.moveTo(a.x, a.y); c2.lineTo(b.x, b.y); c2.stroke(); }
    for (const q of hp) { const r = P(q); c2.fillStyle = "#ffd98a"; c2.beginPath(); c2.arc(r.x, r.y, 2.2, 0, Math.PI * 2); c2.fill(); }
  }
}
let last = 0;
function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (G.role === "host") hostTick(now, dt); else if (G.role === "guest") guestTick(now, dt);
  draw(now, dt);
  drawSkeleton();
  if (G.state === "over" && !$("over").classList.contains("on")) {
    const me = G.role === "guest" ? 1 : 0, won = G.winner === me;
    $("over-title").textContent = won ? "You won!" : (G.solo ? "The wall won" : `${G.peer.name} won`);
    $("over-sub").textContent = `${G.score[0]} – ${G.score[1]}  ·  the ball reached ${(G.speed / SPEED0).toFixed(1)}× speed`;
    $("btn-again").style.display = G.role === "host" ? "" : "none";
    if (G.role === "guest") $("over-sub").textContent += "  ·  waiting for the host to play again";
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

// ---------- PeerJS: a room code, then voice, video and the game channel ----------
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const peerId = code => "strive-armpong-" + code.toUpperCase();
function localStream() {
  const cam = $("me").srcObject;
  return new MediaStream([...(media ? media.getAudioTracks() : []), ...(cam ? cam.getVideoTracks() : [])]);
}
function makePeer(id) {
  const peer = new Peer(id, { config: { iceServers: STUN }, debug: 0 });
  G.peer_ = peer;
  peer.on("error", e => {
    if (e.type === "unavailable-id") status("That code is in use. Try Create again.");
    else if (e.type === "peer-unavailable") status("No game with that code. Check it with your friend.");
    else status("Connection problem: " + (e.type || e.message));
  });
  peer.on("call", call => { call.answer(localStream()); call.on("stream", st => { $("friend").srcObject = st; }); });
  return peer;
}
function wireChannel(conn) {
  G.dc = { send: s => { if (conn.open) conn.send(s); }, get readyState() { return conn.open ? "open" : "closed"; } };
  const hello = () => { conn.send(JSON.stringify({ t: "hi", name: G.name, arm: G.arm })); G.connected = true; $("lobby").style.display = "none"; $("chip-link").textContent = "● connected"; };
  if (conn.open) hello(); else conn.on("open", hello);
  conn.on("data", d => {
    const m = typeof d === "string" ? JSON.parse(d) : d;
    if (m.t === "hi") { G.peer = { name: m.name || "Friend", arm: m.arm }; $("friendtag").textContent = G.peer.name; }
    else if (m.t === "s") { G.remote = m; G.remoteAt = performance.now(); }
    else if (m.t === "p") { G.remote = { y: m.y }; G.remoteAt = performance.now(); }
  });
  conn.on("close", () => { G.connected = false; $("chip-link").textContent = "● friend left"; status("Your friend left."); });
}
async function hostGame() {
  const code = roomCode();
  $("mycode").textContent = code;
  const peer = makePeer(peerId(code));
  await new Promise((res, rej) => { peer.on("open", res); peer.on("error", rej); });
  status("Waiting for your friend to join with " + code + "…");
  peer.on("connection", conn => { wireChannel(conn); status(""); });
}
async function joinGame(code) {
  const peer = makePeer();
  await new Promise((res, rej) => { peer.on("open", res); peer.on("error", rej); });
  status("Connecting to " + code + "…");
  const conn = peer.connect(peerId(code), { reliable: false, serialization: "json" });
  wireChannel(conn);
  const call = peer.call(peerId(code), localStream());
  call?.on("stream", st => { $("friend").srcObject = st; });
}

// ---------- the lobby ----------
function readForm() {
  G.name = $("name").value.trim().slice(0, 20) || "You"; G.arm = $("arm").value;
  localStorage.setItem("armpong", JSON.stringify({ name: G.name, arm: G.arm }));
  $("metag").textContent = G.name + " · " + G.arm + " arm";
}
try { const s = JSON.parse(localStorage.getItem("armpong") || "{}"); if (s.name) $("name").value = s.name; if (s.arm) $("arm").value = s.arm; } catch {}
const show = id => { for (const s of document.querySelectorAll(".step")) s.classList.toggle("on", s.id === id); };
$("btn-host").onclick = async () => {
  readForm(); G.role = "host";
  try { await startCamera(); show("step-host"); await hostGame(); } catch (e) { status("Could not start: " + (e.message || e.type || e)); }
};
$("btn-join").onclick = async () => {
  readForm(); G.role = "guest";
  try { await startCamera(); show("step-join"); status("Type the code."); setTimeout(() => $("code-in").focus(), 50); } catch (e) { status("Could not start: " + (e.message || e)); }
};
$("btn-join-go").onclick = async () => {
  const code = $("code-in").value.trim().toUpperCase();
  if (code.length < 4) { status("The code is four letters."); return; }
  try { await joinGame(code); } catch (e) { status("Could not join: " + (e.message || e.type || e)); }
};
$("code-in").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-join-go").click(); });
$("btn-copy-link").onclick = () => { const url = `${location.origin}${location.pathname}?code=${$("mycode").textContent}`; navigator.clipboard?.writeText(url).then(() => status("Invite link copied. Send it to your friend.")); };
$("btn-solo").onclick = async () => {
  readForm(); G.role = "host"; G.solo = true;
  try { await startCamera(); $("lobby").style.display = "none"; $("friendtag").textContent = "The wall"; $("chip-link").textContent = "● practice"; } catch (e) { status("Could not start: " + e.message); }
};
$("btn-again").onclick = () => { if (G.role !== "host") return; G.score = [0, 0]; G.speed = SPEED0; G.winner = null; G.hits = 0; serve(1); $("over").classList.remove("on"); };
$("chip-mic").onclick = () => { const on = $("chip-mic").classList.toggle("off"); media?.getAudioTracks().forEach(t => t.enabled = !on); $("chip-mic").textContent = on ? "🎙 muted" : "🎙 mic"; };
$("chip-cam").onclick = () => { const on = $("chip-cam").classList.toggle("off"); $("me").srcObject?.getVideoTracks().forEach(t => t.enabled = !on); $("chip-cam").textContent = on ? "📷 off" : "📷 cam"; };
// ?code=ABCD joins straight away once the camera is up
{
  const q = new URLSearchParams(location.search);
  if (q.get("code")) { $("code-in").value = q.get("code").toUpperCase(); $("btn-join").click(); }
}
requestAnimationFrame(loop);

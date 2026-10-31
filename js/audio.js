// Audio v2 — calm lo-fi music + musical feedback, all WebAudio.
//
// The generative engine is proper lo-fi: 68–84 BPM, swung hats, soft kick,
// brushed rim, jazzy maj9/m9 Rhodes chords, warm master low-pass, vinyl
// crackle, and chimes that echo through a tape-style delay. Recorded tracks
// (js/tracks.js, 31 Oct 2026) play in its place where a game has them, and
// the music always steps back while someone is talking (ducking, below).

import { voiceBusy } from "./a11y.js";
import { TRACKS } from "./tracks.js";

const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88].map(midi);   // C major pentatonic, C5 up

// lo-fi progressions (picked per round for variety)
const PROGS = [
  [[41, 45, 48, 52, 55], [40, 43, 47, 50], [38, 41, 45, 48, 52], [36, 40, 43, 47, 50]], // Fmaj9 Em7 Dm9 Cmaj9
  [[45, 48, 52, 55], [41, 45, 48, 52], [36, 40, 43, 47], [43, 47, 50, 52]],             // Am7 Fmaj7 Cmaj7 G6
  [[38, 41, 45, 48], [43, 47, 50, 53], [36, 40, 43, 47], [41, 45, 48, 52]],             // Dm7 G7 Cmaj7 Fmaj7
  [[45, 52, 55, 59], [41, 48, 52, 57], [43, 50, 55, 59], [36, 43, 52, 55]],             // Am7 Fmaj7 Gadd9 C5(9)
  [[38, 45, 48, 55], [43, 47, 53, 57], [36, 40, 47, 52], [41, 45, 52, 55]],             // Dm7 G13 Cmaj7 F69
  [[40, 47, 50, 55], [45, 48, 52, 57], [41, 45, 50, 53], [43, 47, 50, 55]],             // Em7 Am9 F6 G6
].map(prog => prog.map(ch => ch.map(midi)));

const MOODS = {
  assessment:     { bpm: 70, kick: [0, 10], snare: [], padGain: 0.05, bassGain: 0.035, hatGain: 0.015 },
  constellations: { bpm: 72, kick: [0, 10], snare: [4, 12], padGain: 0.05, bassGain: 0.04, hatGain: 0.02 },
  drift:          { bpm: 76, kick: [0, 7, 10], snare: [4, 12], padGain: 0.045, bassGain: 0.045, hatGain: 0.022 },
  ember:          { bpm: 78, kick: [0, 10], snare: [4, 12], padGain: 0.045, bassGain: 0.05, hatGain: 0.022 },
  lantern:        { bpm: 68, kick: [0, 10], snare: [], padGain: 0.055, bassGain: 0.04, hatGain: 0.016 },
  pong:           { bpm: 84, kick: [0, 7, 10], snare: [4, 12], padGain: 0.04, bassGain: 0.05, hatGain: 0.025 },
  boxes:          { bpm: 74, kick: [0, 7, 10], snare: [4, 12], padGain: 0.045, bassGain: 0.05, hatGain: 0.022 },
  compass:        { bpm: 70, kick: [0, 10], snare: [4], padGain: 0.05, bassGain: 0.04, hatGain: 0.018 },
  echo:           { bpm: 64, kick: [0, 10], snare: [], padGain: 0.055, bassGain: 0.035, hatGain: 0.014 },
  rainbow:        { bpm: 80, kick: [0, 7, 10], snare: [4, 12], padGain: 0.045, bassGain: 0.05, hatGain: 0.024 },
  windy:          { bpm: 76, kick: [0, 7, 10], snare: [4, 12], padGain: 0.045, bassGain: 0.045, hatGain: 0.022 },
  // the Lantern's id is "candles" (it fell back to constellations before)
  candles:        { bpm: 68, kick: [0, 10], snare: [], padGain: 0.055, bassGain: 0.04, hatGain: 0.016 },
  fruit:          { bpm: 76, kick: [0, 7, 10], snare: [4, 12], padGain: 0.045, bassGain: 0.045, hatGain: 0.02 },
};

// DUCKING (31 Oct 2026, by request): the music steps back while anyone is
// talking. Older listeners, and anyone with hearing loss or aphasia, lose
// speech under background music far sooner than younger ones, so every line
// the app speaks (both voice engines: voiceBusy in a11y.js) and every
// recording playing with its sound on (watchMedia: the assessment and the
// warm-up) pulls the music down, quickly, and lets it back up slowly once
// it has been quiet for DUCK_HOLD_MS.
const DUCK_SPEECH = 0.22;     // ≈ -13 dB under a spoken line
const DUCK_MEDIA = 0.1;       // ≈ -20 dB under a recording with its own voice
const DUCK_HOLD_MS = 450;
const DUCK_DOWN_S = 0.08;     // time constant going down
const DUCK_UP_S = 0.45;       // and coming back up
// recorded tracks: the level they play at (they are normalised to -20 LUFS),
// times the patient's music volume; the crossfade when a track takes over
// from the generated music that covered its loading
const TRACK_GAIN = 0.55;
const TRACK_WAIT_MS = 700;    // the generated music starts if a track is not playable by then
const TRACK_XFADE_S = 0.9;
const SWING = 0.16;   // fraction of a 16th added to off-beat hats
// THE SHARED SOUND SET (30 Oct 2026, by request: one look and one sound for
// every game). Kenney's Interface Sounds and Music Jingles (CC0) under
// assets/kenney/sounds/; one name per event, so a different pick from the
// mood board's candidates is a one-line change here. Hits stay the in-key
// chime (note), a miss the soft low tone: never a buzzer.
const SFX = {
  celebrate: "jingles-pizzicato_04",   // a win, a level up, a best: the fanfare
  levelUp: "maximize_006",
  tick: "tick_002",
  click: "click_002",
  select: "select_003",
};

class GameAudio {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.track = null;            // the recorded track playing now: { el, src, fade, url }
    this.buffers = {};
    this.media = new Set();       // recordings whose sound ducks the music (watchMedia)
    this.rotation = {};           // per game: { order: [urls], pos }
    this.preloaded = new Map();   // url -> <audio> warming the cache
    this.trackSeq = 0;
  }

  // a Kenney sample through the feedback bus; false until it has loaded
  // (the caller falls back to a generated sound)
  sfx(name, vol = 0.8) {
    this._ensure();
    const file = SFX[name] || name;
    const buf = this.buffers[file];
    if (buf === undefined) { this._load(file); return false; }
    if (!buf) return false;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = vol;
    src.connect(g).connect(this.fxBus); src.start();
    return true;
  }
  _load(file) {
    if (this.buffers[file] !== undefined) return;
    this.buffers[file] = null;
    fetch(`assets/kenney/sounds/${file}.ogg`).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => this.ctx.decodeAudioData(b)).then(buf => { this.buffers[file] = buf; })
      .catch(() => { this.buffers[file] = null; });
  }

  _ensure() {
    if (!this.ctx) {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // master chain: gain -> warm low-pass -> destination
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.lp = ctx.createBiquadFilter();
      this.lp.type = "lowpass"; this.lp.frequency.value = 2800; this.lp.Q.value = 0.4;
      this.master.connect(this.lp).connect(ctx.destination);
      // per-bus volume (accessibility): music and feedback sounds separately
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this._volMusic ?? 1;
      this.fxBus = ctx.createGain(); this.fxBus.gain.value = this._volFx ?? 1;
      // the generated music: musicBus -> its crossfade -> its duck -> master
      // (and the warm low-pass); a recorded track: its own fade -> trackBus
      // -> its duck -> straight out, since the master's 2.8 kHz low-pass would
      // muffle a mixed recording. Both ducks move together.
      this.genFade = ctx.createGain();
      this.genDuck = ctx.createGain();
      this.musicBus.connect(this.genFade).connect(this.genDuck).connect(this.master);
      this.trackBus = ctx.createGain(); this.trackBus.gain.value = TRACK_GAIN * (this._volMusic ?? 1);
      this.trackDuck = ctx.createGain();
      this.trackBus.connect(this.trackDuck).connect(ctx.destination);
      this.duckLevel = 1; this.quietSince = 0;
      this._duckTimer = setInterval(() => this._duckTick(), 90);
      this.fxBus.connect(this.master);
      // tape-style delay bus for chimes
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.29;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const dLp = ctx.createBiquadFilter(); dLp.type = "lowpass"; dLp.frequency.value = 1800;
      this.delay.connect(dLp).connect(fb).connect(this.delay);
      const dOut = ctx.createGain(); dOut.gain.value = 0.5;
      this.delay.connect(dOut).connect(this.master);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (!this._preloaded) { this._preloaded = true; for (const f of Object.values(SFX)) this._load(f); }
  }

  /* ================= music ================= */
  // a game's music: its next recorded track (js/tracks.js), or the old
  // single file assets/music/<gameId>.mp3, else the generated lo-fi. The
  // generated music covers a track still loading after TRACK_WAIT_MS, and
  // the track crossfades in over it when it arrives.
  startBgm(gameId = "constellations") {
    this._ensure();
    this.stopBgm();
    this.playing = true;
    this._playTrack(gameId, true);
  }

  stopBgm() {
    this.playing = false;
    this.song = null;
    clearTimeout(this._fileTimer);
    clearInterval(this._songTimer);
    this._stopGenerative();
    this.trackSeq++;
    if (this.track) { this._retire(this.track, 0.12); this.track = null; }
    if (this.ctx) {
      // the generated bed may have been faded out under a track: back to full
      // for whatever plays next (the song mode uses the same bus)
      const g = this.genFade.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(1, t);
    }
  }

  // the rotation: a game's tracks shuffled once, played in turn, reshuffled
  // when they run out, never the same track twice running across the seam
  _urls(gameId) {
    const list = TRACKS[gameId];
    return list?.length ? list.map(t => "assets/music/" + t.file) : [`assets/music/${gameId}.mp3`];
  }
  _rot(gameId) {
    let r = this.rotation[gameId];
    if (!r || r.pos >= r.order.length) {
      const last = r ? r.order[r.order.length - 1] : null;
      const order = [...this._urls(gameId)];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
      r = this.rotation[gameId] = { order, pos: 0 };
    }
    return r;
  }
  // warm the cache with each game's next track (the hub calls this), so a
  // round starts on its track rather than on the generated cover
  preloadMusic(gameIds) {
    for (const id of gameIds) if (TRACKS[id]?.length) { const r = this._rot(id); this._preload(r.order[r.pos]); }
  }
  _preload(url) {
    if (!url || this.preloaded.has(url)) return;
    const a = new Audio(); a.preload = "auto"; a.src = url;
    this.preloaded.set(url, a);
  }
  _playTrack(gameId, first = false, tries = 0) {
    const r = this._rot(gameId), url = r.order[r.pos++];
    const seq = ++this.trackSeq;
    // a preloaded element has its data already; one never played is used once
    const el = this.preloaded.get(url) || new Audio(url);
    this.preloaded.delete(url);
    let began = false;
    const fail = () => {
      if (seq !== this.trackSeq || !this.playing) return;
      // a file that will not load or play: the next one, and the generated
      // music once every file has failed
      if (tries + 1 < this._urls(gameId).length) this._playTrack(gameId, first, tries + 1);
      else if (!this.generativeOn) this._startGenerative(gameId);
    };
    const begin = () => {
      if (began || seq !== this.trackSeq || !this.playing) return;
      began = true;
      let src;
      try { src = this.ctx.createMediaElementSource(el); } catch { fail(); return; }
      const fade = this.ctx.createGain(); fade.gain.value = 0;
      src.connect(fade).connect(this.trackBus);
      const t = { el, src, fade, url };
      el.play().then(() => {
        if (seq !== this.trackSeq || !this.playing) { this._retire(t); return; }
        const prev = this.track;
        this.track = t;
        const xf = this.generativeOn ? TRACK_XFADE_S : 0.25;
        fade.gain.setTargetAtTime(1, this.ctx.currentTime, xf / 3);
        if (this.generativeOn) this._fadeOutGenerative(xf);
        if (prev) this._retire(prev);
        const nx = this.rotation[gameId];
        if (nx && nx.pos < nx.order.length) this._preload(nx.order[nx.pos]);
      }).catch(() => { this._retire(t); fail(); });
    };
    el.addEventListener("error", fail, { once: true });
    // one track ends, the next one in the rotation starts
    el.addEventListener("ended", () => { if (seq === this.trackSeq && this.playing) this._playTrack(gameId); }, { once: true });
    if (el.readyState >= 3) begin();
    else el.addEventListener("canplay", begin, { once: true });
    if (first) this._fileTimer = setTimeout(() => {
      if (this.playing && !this.track && !this.generativeOn) this._startGenerative(gameId);
    }, TRACK_WAIT_MS);
  }
  // fade a track out and let it go
  _retire(t, s = 0.15) {
    if (!t) return;
    try { t.fade.gain.setTargetAtTime(0, this.ctx.currentTime, s); } catch {}
    setTimeout(() => {
      try { t.el.pause(); t.el.removeAttribute("src"); t.el.load(); } catch {}
      try { t.src.disconnect(); t.fade.disconnect(); } catch {}
    }, s * 5000);
  }
  _fadeOutGenerative(s) {
    this.genFade.gain.setTargetAtTime(0, this.ctx.currentTime, s / 3);
    const id = this._genId = (this._genId || 0) + 1;
    setTimeout(() => { if (id === this._genId && this.track) this._stopGenerative(); }, s * 1000 + 1200);
  }
  _stopGenerative() {
    this.generativeOn = false;
    clearInterval(this._schedTimer);
    if (this.vinylSrc) { try { this.vinylSrc.stop(); } catch {} this.vinylSrc = null; }
  }

  // ---- ducking ----
  // a recording whose own sound should duck the music while it plays (the
  // assessment's and the warm-up's videos)
  watchMedia(el) { if (el) this.media.add(el); }
  _duckTick() {
    let want = 1;
    for (const el of this.media) {
      if (!el.src && !el.currentSrc) { this.media.delete(el); continue; }
      if (!el.paused && !el.ended && !el.muted && el.volume > 0) want = DUCK_MEDIA;
    }
    if (want === 1 && voiceBusy()) want = DUCK_SPEECH;
    // back up only after a breath of quiet, so a pause between two lines
    // does not pump the music up and down
    const now = performance.now();
    if (want < 1) this.quietSince = 0;
    else if (this.duckLevel < 1) {
      this.quietSince ||= now;
      if (now - this.quietSince < DUCK_HOLD_MS) return;
    }
    if (want === this.duckLevel) return;
    const t = this.ctx.currentTime, tc = want < this.duckLevel ? DUCK_DOWN_S : DUCK_UP_S;
    this.duckLevel = want;
    for (const g of [this.genDuck.gain, this.trackDuck.gain]) {
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(want, t, tc);
    }
  }

  _startGenerative(gameId) {
    this._genId = (this._genId || 0) + 1;           // a pending fade-out no longer stops it
    const g = this.genFade.gain, t0 = this.ctx.currentTime;
    g.cancelScheduledValues(t0); g.setValueAtTime(1, t0);
    clearInterval(this._schedTimer);
    if (this.vinylSrc) { try { this.vinylSrc.stop(); } catch {} this.vinylSrc = null; }
    this.generativeOn = true;
    this.mood = MOODS[gameId] || MOODS.constellations;
    this.prog = PROGS[Math.floor(Math.random() * PROGS.length)];
    this.step = 0;
    this.bar = 0;
    this.nextT = this.ctx.currentTime + 0.06;
    this._startVinyl();
    this._schedTimer = setInterval(() => this._schedule(), 80);
  }

  /* ---- song mode (Melody Tiles): the engine plays drums/bass/chords from
     the chart on a shared beat clock; the GAME plays the melody when tiles
     are hit. ---- */
  startSong(chart) {
    this._ensure();
    this.stopBgm();
    this.playing = true;
    this.song = chart;
    this.songStartT = this.ctx.currentTime + 0.1;
    this.songBeatNext = 0;                 // next accompaniment beat to schedule (absolute)
    this._startVinyl();
    this._songTimer = setInterval(() => this._scheduleSong(), 80);
  }
  // current absolute beat position of the song clock (float, keeps counting across loops)
  songBeat() {
    if (!this.song) return 0;
    return (this.ctx.currentTime - this.songStartT) * this.song.bpm / 60;
  }
  _scheduleSong() {
    if (!this.song) return;
    const spb = 60 / this.song.bpm;
    const horizon = this.songBeat() + 0.35;                    // schedule slightly ahead
    while (this.songBeatNext < horizon) {
      const beat = this.songBeatNext;
      const t = this.songStartT + beat * spb;
      const local = ((beat % this.song.length) + this.song.length) % this.song.length;
      // lo-fi drums on the shared clock
      if (local % 4 === 0) this._kick(t);
      if (local % 4 === 2) this._rim(t);
      this._hat(t + (local % 2 === 1 ? SWING * spb : 0), local % 4 === 2 ? 0.028 : 0.02);
      // chords/bass from the chart
      for (const [cb, notesArr] of this.song.chords) {
        if (Math.abs(cb - local) < 0.01) {
          this._tone(midi(notesArr[0]) / 1, t, spb * 3.5, "sine", 0.045, 0.03, false, this.musicBus);   // bass root
          notesArr.forEach((m, i) => this._rhodes(midi(m) * 2, t + i * 0.03, spb * 7, 0.035));
        }
      }
      this.songBeatNext += 1;
    }
  }
  // the game calls this when a tile is hit — the patient PLAYS the melody
  playMelodyNote(m, dur = 0.5) {
    this._ensure();
    const t = this.ctx.currentTime;
    const f = midi(m);
    this._tone(f, t, Math.max(0.35, dur), "sine", 0.17, 0.01, true);
    this._tone(f * 2, t + 0.015, 0.3, "sine", 0.05, 0.01, true);
  }

  _startVinyl() {
    // continuous soft crackle bed
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.25;
      if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 2.2;  // pops
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3200;
    const g = ctx.createGain(); g.gain.value = 0.016;
    src.connect(f).connect(g).connect(this.musicBus);
    src.start();
    this.vinylSrc = src;
  }

  _schedule() {
    if (!this.generativeOn) return;
    const spb = 60 / this.mood.bpm / 4;
    while (this.nextT < this.ctx.currentTime + 0.18) {
      this._playStep(this.step, this.nextT, spb);
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
      this.nextT += spb;
    }
  }

  _playStep(s, t, spb) {
    const m = this.mood;
    if (m.kick.includes(s)) this._kick(t);
    if (m.snare.includes(s)) this._rim(t);
    // swung hats on the 8ths
    if (s % 2 === 0) {
      const swing = (s % 4 === 2) ? SWING * spb * 2 : 0;
      this._hat(t + swing, s % 8 === 4 ? m.hatGain * 1.4 : m.hatGain);
    }
    // bass: root, soft, on 0 and the and-of-2
    if (s === 0 || s === 7) this._tone(this.prog[this.bar][0] / 2, t, spb * 6, "sine", m.bassGain, 0.03, false, this.musicBus);
    // Rhodes chord: bar start, gentle roll
    if (s === 0) this.prog[this.bar].forEach((f, i) => this._rhodes(f, t + i * 0.035, spb * 14, m.padGain));
    // occasional soft melody sparkle on the and-of-3
    if (s === 11 && this.bar % 2 === 1) this._tone(PENTA[(this.bar + 1) % 5] / 2, t, 0.7, "sine", 0.018, 0.05, false, this.musicBus);
  }

  _rhodes(freq, t, dur, gain) {
    // two detuned voices ≈ electric piano
    for (const det of [0, 2.5]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = det ? "triangle" : "sine";
      o.frequency.value = freq;
      o.detune.value = det;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * (det ? 0.5 : 1), t + 0.02);
      g.gain.setTargetAtTime(0.0001, t + 0.1, dur / 4);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + dur);
    }
  }

  _kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.3);
  }
  _noise(t, dur, freq, q, gain, dest = null) {
    const src = this.ctx.createBufferSource();
    const buf = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(dest || this.master);
    src.start(t);
  }
  _hat(t, gain) { this._noise(t, 0.04, 9000, 1.4, gain, this.musicBus); }
  _rim(t) { this._noise(t, 0.08, 1700, 2.5, 0.045, this.musicBus); this._noise(t, 0.05, 4200, 1, 0.02, this.musicBus); }

  // music scheduling routes through musicBus; one-shot feedback through fxBus
  _tone(freq, t, dur, type = "sine", gain = 0.1, attack = 0.015, echo = false, dest = null) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.fxBus);
    if (echo && this.delay) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // per-bus volume from the patient's saved settings
  setVolumes({ music, fx } = {}) {
    if (music != null) { this._volMusic = music; if (this.musicBus) this.musicBus.gain.value = music; if (this.trackBus) this.trackBus.gain.value = TRACK_GAIN * music; }
    if (fx != null) { this._volFx = fx; if (this.fxBus) this.fxBus.gain.value = fx; }
  }

  /* ================= feedback ================= */
  // musical note in key with tape echo — pass a combo step to climb the scale
  note(step = 0) {
    this._ensure();
    const t = this.ctx.currentTime;
    const f = PENTA[Math.max(0, step) % PENTA.length];
    this._tone(f, t, 0.4, "sine", 0.15, 0.012, true);
    this._tone(f * 2, t + 0.02, 0.28, "sine", 0.04, 0.012, true);
  }
  hit() { this.note(2); }
  miss() {
    this._ensure();
    this._tone(174.61, this.ctx.currentTime, 0.3, "triangle", 0.05);   // soft low F — stays in key
  }
  whoosh() {
    this._ensure();
    this._noise(this.ctx.currentTime, 0.4, 600, 1, 0.09);
  }
  // the fanfare: only for a win, a level up or a best (roundEnd decides)
  fanfare() {
    this._ensure();
    if (this.sfx("celebrate", 0.75)) return;
    const t = this.ctx.currentTime;
    [0, 2, 4, 5, 7].forEach((p, i) => this._tone(PENTA[p % PENTA.length], t + i * 0.13, 0.5, "sine", 0.12, 0.015, true));
  }
  // the end of a round: the fanfare when it went well, else a calm two-note
  // close (it used to be the fanfare after a lost match too)
  roundEnd(good) {
    if (good) { this.fanfare(); return; }
    this._ensure();
    const t = this.ctx.currentTime;
    this._tone(PENTA[2], t, 0.5, "sine", 0.08, 0.02, true);
    this._tone(PENTA[0], t + 0.22, 0.7, "sine", 0.07, 0.02, true);
  }
  levelUp() { if (!this.sfx("levelUp", 0.7)) this.fanfare(); }
  click() { this.sfx("click", 0.6); }
  bounce() {   // soft wall tick for pong
    this._ensure();
    this._tone(392, this.ctx.currentTime, 0.08, "sine", 0.05, 0.005);
  }
  paddle(mine = true, rally = 0) {   // the "pock" of a paddle return: a click of contact and a
    this._ensure();       // woody tone, a fifth brighter for the patient's own returns, and
    const t = this.ctx.currentTime;   // rising a semitone a hit through a rally (an octave at most)
    const k = Math.pow(2, Math.min(12, Math.max(0, rally | 0)) / 12);
    this._noise(t, 0.03, 2400, 1.2, 0.09, this.fxBus);
    this._tone((mine ? 659.25 : 523.25) * k, t, 0.09, "triangle", 0.2, 0.003);
    this._tone((mine ? 329.63 : 261.63) * k, t, 0.14, "sine", 0.14, 0.003);
  }
  smash() {    // the smash: a rising whoosh into a low thump and a bright ring
    this._ensure();
    const t = this.ctx.currentTime;
    this._noise(t, 0.35, 900, 0.8, 0.16, this.fxBus);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.fxBus);
    o.start(t); o.stop(t + 0.4);
    this._tone(110, t + 0.02, 0.3, "sine", 0.2, 0.005);
    [7, 9].forEach((p, i) => this._tone(PENTA[p % PENTA.length] * 2, t + 0.12 + i * 0.07, 0.5, "sine", 0.12, 0.01, true));
  }
  // THE TRICK SHOTS (Sep 2026): each has its own short voice, so the ear
  // knows which one just fired. The smash keeps its whoosh and thump.
  trick(kind = "smash") {
    if (kind === "smash") return this.smash();
    this._ensure();
    const t = this.ctx.currentTime;
    if (kind === "curve") {          // a tone that bends up and away
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(660, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(495, t + 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(this.fxBus);
      o.start(t); o.stop(t + 0.6);
    } else if (kind === "ghost") {   // an airy hush that thins away
      this._noise(t, 0.6, 1600, 0.7, 0.07, this.fxBus);
      this._tone(PENTA[4] * 2, t + 0.05, 0.7, "sine", 0.05, 0.2, true);
    } else if (kind === "zigzag") {  // four quick bright ticks, climbing
      [0, 1, 2, 3].forEach(i => this._tone(PENTA[(i + 3) % PENTA.length] * 2, t + i * 0.06, 0.12, "triangle", 0.1, 0.003));
      this._noise(t, 0.12, 5000, 1.5, 0.05, this.fxBus);
    } else if (kind === "feather") { // a soft settling note, then a lift
      this._tone(PENTA[2], t, 0.5, "sine", 0.09, 0.08, true);
      this._tone(PENTA[5 % PENTA.length] * 2, t + 0.3, 0.4, "sine", 0.07, 0.02, true);
    }
  }
  point() {    // the patient's point: a rising three-note ring
    this._ensure();
    const t = this.ctx.currentTime;
    [4, 6, 7].forEach((p, i) => this._tone(PENTA[p % PENTA.length], t + i * 0.09, 0.4, "sine", 0.13, 0.012, true));
  }
  pointLost() {   // the star's point: two soft falling notes, in key, never a buzzer
    this._ensure();
    const t = this.ctx.currentTime;
    this._tone(PENTA[3], t, 0.35, "sine", 0.09, 0.015, true);
    this._tone(PENTA[1], t + 0.18, 0.5, "sine", 0.08, 0.015, true);
  }
  // Lantern (the Lamplighter of Lumen, Oct 2026): the mockup's synthesized
  // sounds rebuilt on the fx bus. kind: pickup | light (a = combo, b =
  // golden) | wrong | puff | moth | hold (a = 0..1) | hoot | constellation |
  // target | slip | levelEnd (a = went up)
  lumen(kind, a = 0, b = false) {
    this._ensure();
    const t = this.ctx.currentTime;
    const semi = (f, s) => f * Math.pow(2, s / 12);
    switch (kind) {
      case "pickup":
        this._tone(660, t, 0.12, "triangle", 0.1, 0.01);
        this._tone(990, t + 0.06, 0.16, "triangle", 0.08, 0.01);
        this._noise(t, 0.18, 3500, 0.8, 0.03, this.fxBus);
        break;
      case "light": {   // a bell whose pitch climbs with the combo
        const base = semi(523.25, Math.min(a, 8) * 2);
        [1, 2, 3].forEach((m, i) => this._tone(base * m, t + i * 0.01, 0.7 - i * 0.15, "sine", 0.14 / (i + 1), 0.01, true));
        if (b) [0, 4, 7, 12].forEach((s, i) => this._tone(semi(base * 2, s), t + 0.1 + i * 0.07, 0.3, "triangle", 0.06, 0.01));
        break;
      }
      case "wrong":       // the wrong lantern: the soft miss, never a buzzer (30 Oct 2026)
        this._tone(196, t, 0.25, "triangle", 0.05, 0.02);
        this._tone(174.61, t + 0.1, 0.3, "triangle", 0.045, 0.02);
        break;
      case "puff": this._noise(t, 0.45, 500, 0.6, 0.18, this.fxBus); break;
      case "moth":
        this._noise(t, 0.25, 220, 2, 0.1, this.fxBus);
        this._noise(t + 0.08, 0.25, 260, 2, 0.1, this.fxBus);
        this._noise(t + 0.15, 0.4, 500, 0.8, 0.16, this.fxBus);
        break;
      case "hold": this._tone(440 + a * 660, t, 0.07, "sine", 0.04, 0.005); break;
      case "hoot":
        this._tone(440, t, 0.16, "sine", 0.06, 0.03);
        this._tone(392, t + 0.2, 0.28, "sine", 0.06, 0.03);
        break;
      case "constellation":
        [0, 4, 7, 12, 16, 19].forEach((s, i) => this._tone(semi(523.25, s), t + i * 0.08, 0.6, "sine", 0.1, 0.01, true));
        break;
      case "target":
        [0, 4, 7].forEach((s, i) => this._tone(semi(392, s), t + i * 0.12, 0.18, "triangle", 0.12, 0.01));
        [0, 4, 7, 12].forEach(s => this._tone(semi(523.25, s), t + 0.4, 0.9, "triangle", 0.08, 0.01, true));
        break;
      case "slip": this._tone(520, t, 0.16, "triangle", 0.04, 0.01); break;
      case "levelEnd":
        if (a) [0, 4, 7, 12].forEach((s, i) => this._tone(semi(523.25, s), t + i * 0.1, 0.35, "triangle", 0.1, 0.01, true));
        else [0, 7].forEach((s, i) => this._tone(semi(440, s), t + i * 0.15, 0.4, "sine", 0.07, 0.01));
        break;
    }
  }
  // Windy City Flap (Oct 2026): the mockup's synthesized sounds on the fx
  // bus. kind: start | feather | hit (a bump) | fall | combo | tick | star
  // (a = 0..2) | win | lose
  windy(kind, a = 0) {
    this._ensure();
    const ctx = this.ctx, t = ctx.currentTime;
    // a tone that may glide to a second pitch, the mockup's `tone(f, d, type, v, f2)`
    const sweep = (f, d, type, v, f2 = null, delay = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + delay;
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(this.fxBus); o.start(t0); o.stop(t0 + d + 0.02);
    };
    switch (kind) {
      case "start": this._noise(t, 0.4, 900, 0.7, 0.06, this.fxBus); sweep(300, 0.4, "sine", 0.08, 900); break;
      case "feather": sweep(1320, 0.12, "sine", 0.12); sweep(1760, 0.16, "sine", 0.1, null, 0.06); break;
      case "hit": sweep(220, 0.3, "triangle", 0.1, 90); this._noise(t, 0.16, 500, 0.8, 0.06, this.fxBus); break;
      case "fall": sweep(660, 0.5, "triangle", 0.12, 110); break;
      case "combo": sweep(784, 0.1, "triangle", 0.1); sweep(1175, 0.14, "triangle", 0.1, null, 0.08); break;
      case "tick": sweep(1000, 0.05, "sine", 0.05); break;
      case "star": sweep([784, 988, 1319][Math.max(0, Math.min(2, a))], 0.3, "triangle", 0.16); break;
      case "win": [523, 659, 784, 1047, 1319].forEach((f, i) => sweep(f, 0.22, "triangle", 0.13, null, i * 0.1)); break;
      case "lose": [392, 330, 262].forEach((f, i) => sweep(f, 0.3, "triangle", 0.1, null, i * 0.18)); break;
    }
  }
  // Cozy Fruit Merge (31 Oct 2026): the mockup's own synthesized sounds, on
  // the fx bus. kind: drop | pop (a = the fruit made, 1..7) | harvest | combo
  // (a = the chain) | charge (a shake earned) | shake | wiggle (a = count) |
  // swap | relief (the full box let go: soft, never a buzzer) | win
  fruit(kind, a = 0) {
    this._ensure();
    const ctx = this.ctx, t0 = ctx.currentTime;
    // the mockup's tone(f, dur, type, vol, slide, delay)
    const tone = (f, dur, type = "sine", vol = .18, slide = 1, delay = 0) => {
      const t = t0 + delay, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + dur + .03);
    };
    switch (kind) {
      case "drop": tone(260, .09, "sine", .12, .55); break;
      case "pop": { const f = 900 - a * 70; tone(f, .16, "sine", .2, 1.7); tone(f * 1.5, .1, "triangle", .06, 1.3, .02); break; }
      case "harvest": case "win": [523, 659, 784, 1047].forEach((f, k) => tone(f, .22, "triangle", .12, 1, k * .09)); break;
      case "combo": tone(500 + a * 90, .12, "triangle", .07, 1.4, .05); break;
      case "charge": tone(880, .15, "sine", .1, 1.5); tone(1320, .2, "sine", .08, 1.2, .1); break;
      case "shake": tone(140, .25, "triangle", .08, 1.4); break;
      case "wiggle": tone(170 + (a % 4) * 25, .07, "triangle", .05, .7); break;
      case "swap": tone(620, .1, "sine", .1, 1.5); break;
      case "relief": [523, 440].forEach((f, k) => tone(f, .28, "sine", .08, .98, k * .14)); break;
    }
  }
  serveTick(final = false) {
    this._ensure();
    this._tone(final ? PENTA[4] : PENTA[1], this.ctx.currentTime, final ? 0.35 : 0.14, "sine", final ? 0.11 : 0.06, 0.01, final);
  }
}

export const audio = new GameAudio();

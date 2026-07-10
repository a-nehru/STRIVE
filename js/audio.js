// Audio v2 — calm lo-fi music + musical feedback, all WebAudio.
//
// The generative engine is proper lo-fi: 68–84 BPM, swung hats, soft kick,
// brushed rim, jazzy maj9/m9 Rhodes chords, warm master low-pass, vinyl
// crackle, and chimes that echo through a tape-style delay. If a file exists
// at assets/music/<gameId>.mp3 it is used instead.

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
};
const SWING = 0.16;   // fraction of a 16th added to off-beat hats

class GameAudio {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.fileEl = null;
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
  }

  /* ================= music ================= */
  startBgm(gameId = "constellations") {
    this._ensure();
    this.stopBgm();
    this.playing = true;
    const el = new Audio(`assets/music/${gameId}.mp3`);
    el.loop = true; el.volume = 0.45;
    el.addEventListener("canplaythrough", () => {
      if (this.playing && !this.generativeOn) { this.fileEl = el; el.play().catch(() => this._startGenerative(gameId)); }
    }, { once: true });
    el.addEventListener("error", () => { if (this.playing) this._startGenerative(gameId); }, { once: true });
    el.load();
    this._fileTimer = setTimeout(() => { if (this.playing && !this.fileEl && !this.generativeOn) this._startGenerative(gameId); }, 700);
  }

  stopBgm() {
    this.playing = false;
    this.generativeOn = false;
    this.song = null;
    clearTimeout(this._fileTimer);
    clearInterval(this._schedTimer);
    clearInterval(this._songTimer);
    if (this.vinylSrc) { try { this.vinylSrc.stop(); } catch {} this.vinylSrc = null; }
    if (this.fileEl) { this.fileEl.pause(); this.fileEl = null; }
  }

  _startGenerative(gameId) {
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
          this._tone(midi(notesArr[0]) / 1, t, spb * 3.5, "sine", 0.045, 0.03);          // bass root
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
    src.connect(f).connect(g).connect(this.master);
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
    if (s === 0 || s === 7) this._tone(this.prog[this.bar][0] / 2, t, spb * 6, "sine", m.bassGain, 0.03);
    // Rhodes chord: bar start, gentle roll
    if (s === 0) this.prog[this.bar].forEach((f, i) => this._rhodes(f, t + i * 0.035, spb * 14, m.padGain));
    // occasional soft melody sparkle on the and-of-3
    if (s === 11 && this.bar % 2 === 1) this._tone(PENTA[(this.bar + 1) % 5] / 2, t, 0.7, "sine", 0.018, 0.05);
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
      o.connect(g).connect(this.master);
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
    o.connect(g).connect(this.master);
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
  _hat(t, gain) { this._noise(t, 0.04, 9000, 1.4, gain); }
  _rim(t) { this._noise(t, 0.08, 1700, 2.5, 0.045); this._noise(t, 0.05, 4200, 1, 0.02); }

  _tone(freq, t, dur, type = "sine", gain = 0.1, attack = 0.015, echo = false) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    if (echo && this.delay) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
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
  fanfare() {
    this._ensure();
    const t = this.ctx.currentTime;
    [0, 2, 4, 5, 7].forEach((p, i) => this._tone(PENTA[p % PENTA.length], t + i * 0.13, 0.5, "sine", 0.12, 0.015, true));
  }
  bounce() {   // soft wall tick for pong
    this._ensure();
    this._tone(392, this.ctx.currentTime, 0.08, "sine", 0.05, 0.005);
  }
  point() {    // scored a point vs the AI
    this._ensure();
    const t = this.ctx.currentTime;
    [4, 6, 7].forEach((p, i) => this._tone(PENTA[p % PENTA.length], t + i * 0.09, 0.4, "sine", 0.13, 0.012, true));
  }
  serveTick(final = false) {
    this._ensure();
    this._tone(final ? PENTA[4] : PENTA[1], this.ctx.currentTime, final ? 0.35 : 0.14, "sine", final ? 0.11 : 0.06, 0.01, final);
  }
}

export const audio = new GameAudio();

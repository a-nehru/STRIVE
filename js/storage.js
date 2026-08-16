// Local persistence (localStorage): per-patient profiles (per arm), session
// rounds, stars, collections, fatigue answers, compensation events.

const KEY = "rehabsuite-v1";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }

function patient(db, name) {
  if (!db.patients) db.patients = {};
  if (!db.patients[name]) {
    db.patients[name] = {
      created: new Date().toISOString(),
      profiles: {},            // per arm: assessment + current params (history kept)
      history: { left: [], right: [] },   // past assessments (for ghost arcs)
      sessions: [],            // per round
      feel: [],                // fatigue answers
      stars: 0, starsLifetime: 0,
      lanterns: 0,
      unlocks: { cursor: ["firefly"], decor: [], creatures: [] },
      equippedCursor: "firefly",
      shoulderCm: null,        // tape-measured biacromial width; converts SW units to cm
    };
  }
  return db.patients[name];
}

export const store = {
  getPatient(name) { return patient(load(), name); },

  // Login screen: existing participants, most recently seen first.
  listPatients() {
    const db = load();
    return Object.entries(db.patients || {})
      .map(([name, p]) => ({
        name,
        created: p.created,
        lastLogin: p.lastLogin || p.created,
        sessions: (p.sessions || []).length,
      }))
      .sort((a, b) => b.lastLogin.localeCompare(a.lastLogin));
  },

  hasPatient(name) { return !!load().patients?.[name]; },

  // Create (if needed) and stamp a login; the record persists immediately so
  // the participant appears on the login screen next time.
  login(name) {
    const db = load();
    const p = patient(db, name);
    p.lastLogin = new Date().toISOString();
    save(db);
    return p;
  },

  getProfile(name, arm) { return patient(load(), name).profiles[arm] || null; },

  saveProfile(name, arm, profile) {
    const db = load(); const p = patient(db, name);
    // The replaced profile is kept, and kept WHOLE enough to compare against:
    // an arc and an envelope alone cannot answer "is their workspace bigger
    // than last time", which is the question a re-measure exists to ask.
    const old = p.profiles[arm];
    if (old) p.history[arm].push({
      date: old.date,
      arcMinDeg: old.arcMinDeg, arcMaxDeg: old.arcMaxDeg,
      envelope: old.envelope, covered: old.covered,
      armLenSW: old.armLenSW, areaSW2: old.areaSW2, coverage: old.coverage,
      volumeM3: old.volumeM3, quadrants: old.quadrants,
      extremes: old.extremes, grasp: old.grasp,
    });
    p.history[arm] = p.history[arm].slice(-6);
    p.profiles[arm] = profile;
    save(db);
  },

  saveParams(name, arm, params) {
    const db = load(); const p = patient(db, name);
    if (p.profiles[arm]) { p.profiles[arm].params = params; save(db); }
  },

  logRound(name, round) {
    const db = load(); const p = patient(db, name);
    p.sessions.push(round);
    p.sessions = p.sessions.slice(-400);
    p.stars += round.stars;
    p.starsLifetime += round.stars;
    if (round.lanterns) p.lanterns += round.lanterns;
    if (round.creatures) for (const c of round.creatures)
      if (!p.unlocks.creatures.includes(c)) p.unlocks.creatures.push(c);
    save(db);
  },

  logFeel(name, feel) {
    const db = load(); const p = patient(db, name);
    p.feel.push({ at: new Date().toISOString(), feel });
    p.feel = p.feel.slice(-200);
    save(db);
  },

  buy(name, category, id, price) {
    const db = load(); const p = patient(db, name);
    if (p.stars < price || p.unlocks[category].includes(id)) return false;
    p.stars -= price;
    p.unlocks[category].push(id);
    if (category === "cursor") p.equippedCursor = id;
    save(db);
    return true;
  },

  equipCursor(name, id) {
    const db = load(); const p = patient(db, name);
    if (p.unlocks.cursor.includes(id)) { p.equippedCursor = id; save(db); }
  },

  // Real-world scale: shoulder width in cm, tape-measured by the therapist
  // OR auto-measured by the ZED's depth (auto = true). Everything internal
  // stays in SW units; this only converts for display and export
  // (SW × shoulderCm = cm). A manual tape measurement always wins: auto
  // writes never overwrite it (shoulderCmAuto records which kind is stored).
  setShoulderCm(name, cm, auto = false) {
    const db = load(); const p = patient(db, name);
    if (auto && p.shoulderCm && !p.shoulderCmAuto) return;
    p.shoulderCm = (cm && cm > 0) ? cm : null;
    p.shoulderCmAuto = !!p.shoulderCm && auto;
    save(db);
  },

  // Difficulty, PER GAME and per arm. One shared set of params across every
  // game meant Pong's long rallies dragged Scratch Cards' targets around and
  // vice versa: the games make different demands, so a patient who is doing
  // well at one is not necessarily ready for a harder version of another.
  // A game never played keeps returning null, and the caller falls back to
  // the assessment-seeded profile params — the assessment is still the seed
  // for every game, it just stops being the only memory.
  getGameParams(name, arm, gameId) {
    return patient(load(), name).gameParams?.[arm]?.[gameId] || null;
  },
  saveGameParams(name, arm, gameId, params) {
    const db = load(); const p = patient(db, name);
    p.gameParams = p.gameParams || {};
    p.gameParams[arm] = p.gameParams[arm] || {};
    p.gameParams[arm][gameId] = { ...params, at: new Date().toISOString() };
    save(db);
  },
  // everything a therapist would want to see at once: which games this
  // patient has a difficulty on, and where each one sits
  listGameParams(name, arm) {
    const g = patient(load(), name).gameParams?.[arm] || {};
    return Object.entries(g).map(([game, params]) => ({ game, ...params }));
  },

  // Per-game level, kept per patient so a ladder resumes where it stopped
  // instead of restarting every session (the point of a ladder is that it
  // remembers). `max` is the game's own cap.
  getLevel(name, key) { return patient(load(), name).progress?.[key] || 1; },
  setLevel(name, key, lvl, max = 9) {
    const db = load(); const p = patient(db, name);
    p.progress = p.progress || {};
    p.progress[key] = Math.max(1, Math.min(max, lvl));
    save(db);
  },

  // Pong skill progression: 1 = basic rally, 2 = +grip shot, 3 = +spin shot
  getPongLevel(name) { return patient(load(), name).progress?.pongLevel || 1; },
  setPongLevel(name, lvl) {
    const db = load(); const p = patient(db, name);
    p.progress = p.progress || {};
    p.progress.pongLevel = Math.max(1, Math.min(3, lvl));
    save(db);
  },

  exportPatient(name) { return JSON.stringify(patient(load(), name), null, 2); },

  // Per-patient accessibility & comfort settings (GAG/WCAG pass, Aug 2026).
  // Everything the staff tunes for one patient persists with that patient.
  getSettings(name) {
    return {
      captions: true,        // on-screen captions for every spoken line
      dwellMs: 1400,         // in-game dwell time (sticky dwell tolerates exits)
      radiusScale: 1,        // capture-radius multiplier (bigger = more forgiving)
      squeezeEase: "normal", // easy | normal | firm — hand-close threshold bias
      contrast: false,       // high-contrast target outlines + dimmer scenery
      calm: false,           // reduced motion: soft glows instead of bursts
      textScale: 1,          // 1 / 1.25 / 1.5 on patient-facing text
      practice: false,       // no-miss free play: nothing logged, DDA held
      field: "none",         // visual field cut: none | left | right
      fieldMode: "comfort",  // comfort = bias spawns to intact side | scan = train the cut side
      volVoice: 1, volMusic: 1, volFx: 1,
      ...patient(load(), name).settings,
    };
  },
  saveSettings(name, patch) {
    const db = load(); const p = patient(db, name);
    p.settings = { ...p.settings, ...patch };
    save(db);
  },
};

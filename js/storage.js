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

  getProfile(name, arm) { return patient(load(), name).profiles[arm] || null; },

  saveProfile(name, arm, profile) {
    const db = load(); const p = patient(db, name);
    if (p.profiles[arm]) p.history[arm].push({
      date: p.profiles[arm].date, arcMinDeg: p.profiles[arm].arcMinDeg,
      arcMaxDeg: p.profiles[arm].arcMaxDeg, envelope: p.profiles[arm].envelope,
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

  // One-time real-world scale: therapist-measured shoulder width in cm.
  // Everything internal stays in SW units; this only converts for display
  // and export (SW × shoulderCm = cm).
  setShoulderCm(name, cm) {
    const db = load(); const p = patient(db, name);
    p.shoulderCm = (cm && cm > 0) ? cm : null;
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
};

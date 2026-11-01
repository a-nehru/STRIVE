// REPS TODAY (1 Nov 2026, by request): one count of repetitions for the day,
// shown beside the minutes in the Today pill. A rep is a movement out of
// rest that reaches at least HIT of the patient's own range and comes back;
// the detector is the user's, unchanged: value is a smoothed, calibrated
// signal, 0 = rest and 1 = the patient's full range.
//
// The signal is the trained arm's ELEVATION (tracker.armAngle: 0 = down,
// 180 = overhead, plane-free, so a lift forward, out to the side or across
// all count) placed on the arm's own measured arc, from the assessment's
// resting elevation (lift.startDeg / arcMinDeg) to the highest it reached
// (lift.peakDeg / arcMaxDeg). The same rep therefore means the same share of
// THIS patient's range whatever the game and whatever the camera distance.

export const REP_START = 0.15, REP_HIT = 0.6, REP_MIN_MS = 250;

export class RepDetector {
  constructor() { this.state = "ready"; this.t0 = 0; this.peak = 0; this.reps = 0; this.attempts = []; }
  // value: smoothed, calibrated signal (0 = rest, 1 = patient's full range)
  update(value, now) {
    if (this.state === "ready" && value >= REP_START) { this.state = "move"; this.t0 = now; this.peak = value; }
    else if (this.state === "move") {
      this.peak = Math.max(this.peak, value);
      if (value < REP_START) {
        this.state = "ready";
        if (now - this.t0 >= REP_MIN_MS) {
          const hit = this.peak >= REP_HIT;
          this.attempts.push({ t0: this.t0, ms: now - this.t0, peak: this.peak, hit });
          if (hit) this.reps++;
          return hit ? "rep" : "attempt";
        }
      }
    }
    return null;
  }
}

// the arm's arc from its profile: rest (low) and the highest it reached (high), degrees
export function repArc(profile) {
  const lo = profile?.lift?.startDeg ?? profile?.arcMinDeg ?? 15;
  const hi = Math.max(profile?.lift?.peakDeg ?? 0, profile?.arcMaxDeg ?? 0) || 140;
  return { lo, hi: Math.max(hi, lo + 20) };     // never a sliver of an arc: 20 degrees at least
}

// The live counter: fed every frame while something is on the stage; it
// smooths the elevation (a median of the last five tracker samples, then a
// short exponential), maps it onto the arc and runs the detector. Counts
// since the last flush are kept in `pending` for the store to bank.
export class RepCounter {
  constructor() { this.reset(null); this.pending = { reps: 0, attempts: 0 }; }
  reset(profile) {
    this.det = new RepDetector();
    this.arc = repArc(profile);
    this.buf = []; this.smooth = null; this.lastSeen = -1; this.lastT = 0;
    this.round = { reps: 0, attempts: 0 };      // the count for the stage visit, i.e. the round
  }
  tick(tracker, side, now) {
    if (!tracker?.trackingOk || tracker.lastSeen === this.lastSeen) return null;
    this.lastSeen = tracker.lastSeen;
    const deg = tracker.armAngle(side);
    if (deg == null || !Number.isFinite(deg)) return null;
    this.buf.push(deg); if (this.buf.length > 5) this.buf.shift();
    const med = [...this.buf].sort((a, b) => a - b)[this.buf.length >> 1];
    const dt = this.lastT ? Math.min(200, now - this.lastT) : 33; this.lastT = now;
    const k = 1 - Math.exp(-dt / 90);                 // ~90 ms time constant
    this.smooth = this.smooth == null ? med : this.smooth + (med - this.smooth) * k;
    const value = Math.max(0, Math.min(1.5, (this.smooth - this.arc.lo) / (this.arc.hi - this.arc.lo)));
    const r = this.det.update(value, now);
    if (r) {
      this.pending.attempts++; this.round.attempts++;
      if (r === "rep") { this.pending.reps++; this.round.reps++; }
    }
    return r;
  }
  take() { const p = this.pending; this.pending = { reps: 0, attempts: 0 }; return p; }
}

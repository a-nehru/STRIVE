// Difficulty model and dynamic difficulty adjustment (DDA).
//
// Three difficulty parameters (analogous to the CFI case study's target
// appearance range / size / speed, and the RGS sphere speed / interval /
// dispersion):
//   rangeScale   [0.50 .. 1.00]  fraction of the assessed reach envelope
//                                targets may spawn in  → range-of-motion demand
//   radius       [0.15 .. 0.40]  target radius in shoulder-width units
//                                → precision / strength demand
//   lifetime     [2.5 .. 7.0] s  time before an unpopped target counts as a
//                                miss → movement-speed demand
//
// Adjustment rule (Cameirão / Yerkes-Dodson model as used by Zhang et al.):
//   hit rate > 70%  → harder;  hit rate < 50% → easier;  else hold.
// When easing, the parameter to ease is chosen from WHERE the misses were:
// if most misses were beyond 70% of the current range demand, range-of-motion
// was the limiter → reduce rangeScale; otherwise precision/speed was the
// limiter → grow radius and lifetime. The step size scales smoothly with how
// far the hit rate sits outside the 50–70% band (a piecewise-linear stand-in
// for the paper's fuzzy inference surface).

export const LIMITS = {
  rangeScale: [0.5, 1.0],
  radius: [0.15, 0.4],
  lifetime: [1.6, 5.5],
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

// Initial parameters from the circle assessment (CFI "Clinical" → initial
// difficulty). jitter = hand-path noise during the trace (SW units);
// traceTime = seconds one full loop took (speed proxy).
export function initialParams(assessment) {
  return {
    rangeScale: 0.7,
    radius: clamp(0.16 + (assessment.jitter ?? 0.1) * 1.6, LIMITS.radius),
    lifetime: clamp(1.9 + (assessment.loopSeconds ?? 10) * 0.11, LIMITS.lifetime),
  };
}

// stats: { hits, misses, missFar }  (missFar = misses that appeared beyond
// 70% of the current range demand)
export function adjust(params, stats) {
  const total = stats.hits + stats.misses;
  if (total < 4) return { params, note: "Not enough targets to adjust difficulty." };

  const hitRate = stats.hits / total;
  const p = { ...params };
  let note;

  if (hitRate > 0.7) {
    const k = Math.min((hitRate - 0.7) / 0.3, 1);        // 0..1
    if (p.rangeScale < LIMITS.rangeScale[1] - 0.01) {
      p.rangeScale = clamp(p.rangeScale + 0.08 * k + 0.02, LIMITS.rangeScale);
      note = "Great accuracy! Targets will reach a little further.";
    } else if (p.radius > LIMITS.radius[0] + 0.01) {
      p.radius = clamp(p.radius - 0.04 * k - 0.01, LIMITS.radius);
      note = "Great accuracy! Targets get a little smaller.";
    } else {
      p.lifetime = clamp(p.lifetime - 0.5 * k - 0.1, LIMITS.lifetime);
      note = "Great accuracy! Targets disappear a little faster.";
    }
  } else if (hitRate < 0.5) {
    const k = Math.min((0.5 - hitRate) / 0.5, 1);
    const farFrac = stats.misses ? stats.missFar / stats.misses : 0;
    if (farFrac >= 0.7) {
      p.rangeScale = clamp(p.rangeScale - 0.08 * k - 0.02, LIMITS.rangeScale);
      note = "Targets will appear a little closer to you.";
    } else {
      p.radius = clamp(p.radius + 0.05 * k + 0.01, LIMITS.radius);
      p.lifetime = clamp(p.lifetime + 0.6 * k + 0.1, LIMITS.lifetime);
      note = "Targets get a little bigger and stay a little longer.";
    }
  } else {
    note = "Difficulty is just right. No change.";
  }

  return { params: p, note };
}

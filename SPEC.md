# Upper-Limb Rehab Game Suite — Design Specification (v0.1 draft)

Camera-tracked upper-limb rehabilitation for inpatient rooms: patient seated on
bed/at desk, TV ~10–12 ft away, webcam (MediaPipe) or ZED 2 for tracking.
Design grounded in Zhang et al. 2024 (CFI framework) and Cameirão et al. (RGS).

---

## 1. Goals

1. Measure each patient's **active range of motion in one plane** and store it
   as a profile that **every game reads** — all targets appear inside it.
2. Deliver short, adaptive game rounds that hold performance near ~70%
   success (Yerkes-Dodson / RGS difficulty model).
3. Detect and record **grasp capability** at positions along the ROM.
4. Look and feel **minimal, seamless, hand-drawn** — no intrusive UI during
   play; big soft shapes readable from 12 ft; calm palette for a 50+ stroke
   population. Reference: *Melatonin* (pastel gradients, negative space,
   music-linked feedback).
5. Log everything per round for therapist review and export.

## 2. Room & hardware

- Patient seated on bed edge or at over-bed desk, facing the TV (10–12 ft).
- Camera at/near the TV, facing the patient (MediaPipe webcam mode), or ZED 2
  for true depth. A staff member positions the system; app must include a
  **setup view** (camera preview + "whole upper body visible" check) that is
  never shown during patient play.
- All geometry is **body-relative** (origin = shoulder midpoint, unit =
  shoulder width), so camera distance/height changes between sessions don't
  invalidate the profile.
- Plane decision (v1): **frontal plane** (what a single RGB camera sees well).
  Shoulder flexion toward the TV is depth motion → out of scope for MediaPipe;
  revisit when ZED 2 is in the loop.

## 3. Tracking

| | MediaPipe (v1) | ZED 2 (v2) |
|---|---|---|
| Arm joints | Pose Landmarker (shoulder/elbow/wrist), 2D + rough z | Full 3D skeleton, real depth |
| Grasp | Hand Landmarker on a **zoomed crop around the tracked wrist** (full-frame hands at 12 ft are unreliable) | No fingers — still needs the crop trick or a near camera |
| Risk | Grasp detection at distance is the main R&D risk. Fallback if unreliable: **dwell-and-hold** (hold position 1–2 s) replaces grasp in any game that asks for it. | Integration effort |

Grasp signal (v1 target): binary open/closed from hand-landmark finger
curl, smoothed over ~300 ms. Recorded per event with position along the arc.

### 3.1 Coordinate system, calibration & re-baselining

- **No pixel calibration.** Nothing clinical is stored in pixels. Units:
  - **Degrees** for the arc: shoulder angle = upper-arm segment
    (shoulder→elbow) vs. the **trunk axis** (shoulder-mid→hip-mid). Matches
    goniometry and is immune to camera distance and trunk lean (a lean does
    not inflate measured shoulder ROM).
  - **Shoulder-widths** for distances/sizes (hand offset, target radius),
    measured live each frame → scale-invariant across sessions.
  - Pixels are used only at render time (body units → screen) and for
    "in-frame" checks.
- **Anchor:** all world geometry hangs off the shoulder midpoint, smoothed
  with a slow filter (~1–2 s time constant).
- **Two-time-scale rule for body movement:**
  - *Slow drift* (settling, scooting): the slow anchor follows; targets glide
    with the body; no recalibration, reach demand stays honest.
  - *Fast deviation* from the slow baseline (>threshold, sustained >0.5 s):
    that IS compensation → Posture Coach fires. Because targets are
    body-anchored, leaning moves the target too — compensation can't win.
  - *Relocation* (large anchor displacement, shoulder-width scale change
    >~15%, or tracking loss): **graceful pause** — timer freezes, no misses
    counted, scene dims to a waiting state; auto **re-baseline** after ~2 s
    of stability, then resume. No staff action needed.
- Compensation references (trunk position/rotation, shoulder-ear distance)
  are relative to the patient's own recent baseline, re-baselined at round
  start and after any pause — never to a fixed spot in the room.

## 4. Assessment (the shared "Clinical" step)

> **v1.1 (per the approved design exploration, option 2a):** the multi-step
> Dawn Painter flow was replaced by a **single-screen circle trace** — "Draw
> the biggest circle you can." The traced circle IS the ROM readout
> (horizontal + vertical in one ~30 s motion, 16-direction envelope +
> arm-elevation min/max in degrees), followed by 3 "squeeze to grab the
> light" points on the traced circle for grasp + hold-stability. Path jitter
> feeds target size; loop time feeds target lifetime. The original Dawn
> Painter protocol below is retained for reference.

Run per arm, first session and re-run any session (doubles as monitoring, per
RGS daily calibration). **Gamified as "Dawn Painter"** — the patient's sweeps
paint a sunrise, so assessment feels like play, not testing.

Protocol (one plane, ~3 min):
1. **Setup check** (staff view): body visible, tracking stable.
2. **Rest capture**: hand still 1.5 s → home position.
3. **Arc sweep ×3**: "paint the sky" — sweep the arm up/down through maximal
   comfortable range. Record min/max angle at the shoulder (flexion/extension
   in the frontal plane v1; wrist radial/ulnar as a second profile type for
   desk configuration).
4. **Hold test**: at 3 positions (25% / 60% / 90% of arc), hold 2 s inside a
   soft circle → stability score per position.
5. **Grasp test**: at the same 3 positions, close the hand on a glowing orb →
   grasp yes/no per position + close time.
6. **Speed/precision**: 5 quick reaches to points on the arc → reaction time,
   movement time, endpoint error.

### Profile schema (per patient, per arm, per plane)
```json
{
  "arm": "right", "plane": "frontal-shoulder", "date": "...",
  "arcMinDeg": -20, "arcMaxDeg": 95,
  "holdStability": [0.9, 0.7, 0.3],
  "grasp": { "available": true, "byPosition": [true, true, false], "closeTimeMs": 640 },
  "meanRT": 0.62, "meanMT": 1.1, "endpointErr": 0.14,
  "params": { "rangeScale": 0.7, "radius": 0.30, "lifetime": 4.2 }
}
```

## 5. Difficulty (shared across all games)

- **Initial** params from assessment: target zone = `rangeScale ×` measured
  arc; target size from endpoint error; target lifetime from RT + MT.
- **DDA between rounds** (Zhang/Cameirão rule): success >70% → harder,
  <50% → easier, else hold. When easing, use miss locations: mostly misses
  near arc extremes → shrink `rangeScale`; otherwise → bigger/slower targets.
- Rounds ≤ 45 s. Rest prompt between rounds; longer-break suggestion every 4
  rounds; optional 1-tap pain/fatigue check between rounds (CFI "state
  assessment") — a face-scale, no text entry.

## 6. Design language ("minimal & seamless")

- **No HUD during play.** Score/time appear only between rounds. Progress is
  diegetic: the world itself fills in (sky paints, constellation grows,
  village lights up).
- Soft two-tone gradient backgrounds per game; ≤3 hues on screen; large
  soft-edged hand-drawn shapes (wobbly-line texture, paper grain).
- Patient representation: a single elegant cursor (comet / brush tip /
  firefly) — **no camera feed, no skeleton** in patient view. Skeleton overlay
  lives in the staff setup view only.
- Feedback is motion + sound: successes bloom and chime in key; misses simply
  fade (never harsh); gentle BGM; world pulses subtly with the music.
- Compensatory-movement feedback: the **Posture Coach** — a small hand-drawn
  skeletal mini-figure docked in every activity; faint when posture is good,
  glows amber on the offending segment (trunk lean, shoulder hike, trunk
  rotation) with a ghost overlay of the correct posture and one short spoken
  cue; green bloom on correction; events logged and fed to DDA. Full spec in
  `DESIGN_BRIEF.md` §6.
- Typography: big rounded type, between rounds only. All prompts also spoken
  (auto audio instructions, per RGS).

## 7. The four games

All games read the same profile; targets always inside the measured arc.

### G1 — "Constellations" (connect the dots)
- **Mechanic:** stars appear one at a time along the arc; the patient drags a
  thread of light from star to star. Completing the figure reveals a
  hand-drawn animal that animates once, then joins the night-sky collection.
- **Trains:** guided reaching, path smoothness, sustained attention.
- **Difficulty knobs:** dot spacing (arc coverage), dot size, required path
  corridor width, dots per figure.
- **Metrics:** path efficiency (actual/ideal length), smoothness (jerk),
  time per segment, arc coverage.
- **Reward:** collected constellation creatures (persistent gallery = Zhang's
  consumption loop).

### G2 — "Drift" (the RGS game, reskinned)
- **Mechanic:** soft orbs drift slowly toward the patient's side of the
  screen along lanes spanning the arc; intercept before they cross the shore
  line. Three graded stages, unlocked in order (RGS Hitting → Grasping →
  Placing):
  1. **Touch** the orb (10 pts).
  2. Touch **and grasp** it (20 pts).
  3. Grasp, **carry to the matching-colored tide pool, release** (30 pts).
- **Difficulty knobs (the RGS trio):** orb speed, spawn interval, dispersion
  across the arc.
- **Metrics:** hit rate, interception point, grasp success/latency, carry
  path error.

### G3 — "Ember Watch" (the Zhang game, reskinned)
- **Mechanic:** night village below; glowing embers drift down toward the
  rooftops at positions sampled inside the arc. Move the hand to an ember and
  hold briefly to turn it into a harmless firefly. Round = 30 s (Zhang).
- **Aim-and-commit** = Zhang's shoot mechanic without violence; grasp (if
  available) can replace hold as the "catch" action.
- **Difficulty knobs (Zhang's):** appearance range (= rangeScale), ember size
  (strength/precision analog), fall speed.
- **Reward cycle:** points buy lantern styles and village decorations; the
  village visibly grows/lights over sessions (Zhang's unlock-and-spend loop).

### G4 — "Lantern Release" (dedicated reach-and-grasp)
- **Mechanic:** a lantern rests at a spawn point on the arc; reach, grasp,
  carry along the arc to the release ring near the arc's far extreme, open
  the hand → lantern floats up and joins a persistent sky of past lanterns.
- **Trains:** transport + timed release (the hardest RGS stage, isolated),
  grasp-at-extremes (the user's hold/grasp assessment idea as gameplay).
- **Difficulty knobs:** carry distance along arc, release-ring size, lantern
  "weight" (max carry speed before it slips).
- **Metrics:** grasp position (how far along arc), carry time, drop count,
  release accuracy.

### G5 — "Arc Pong" (pong)
- **Mechanic:** classic pong, minimal: a soft glowing ball floats slowly
  across a gradient field; the patient's paddle rides **along their measured
  arc** (shoulder flexion/extension moves it up/down in the frontal plane, or
  wrist radial/ulnar in the desk plane).
- **Control signal = joint angle, not palm position** (default): paddle
  position maps 1:1 from the shoulder→elbow angle vs. trunk axis onto the
  assessed arc (arcMinDeg → bottom of track, arcMaxDeg → top). Guarantees
  every return is a true shoulder excursion — elbow wiggles, wrist flicks,
  and trunk lean cannot move the paddle. `rangeScale` directly sets the
  degrees a rally demands. Therapist-selectable **"free hand" mode** (paddle
  follows palm height, SW units) for functional/multi-joint goals and for
  unassessed companions in multiplayer. Desk plane: wrist deviation angle.
  Signal conditioning: ~100 ms smoothing + ~2° deadband, per-patient
  adjustable (tremor).
  Suite-wide rule: **discrete reach games (G1–G4) = hand position;
  continuous joint-training games (G5) = joint angle.** Opponent is a gentle AI paddle — or
  the **therapist/family member on a keyboard or second tracked arm**
  (two-player = the social element from Zhang's reward-cycle list).
- **Rally-based, not score-punishing:** the sound and background bloom a bit
  more with every consecutive return; a lost ball just fades and re-serves.
  Between-round summary shows longest rally.
- **Difficulty knobs:** ball speed, paddle length, serve dispersion across
  the arc (AI returns are aimed inside `rangeScale ×` arc — the DDA decides
  how much of the arc each rally demands).
- **Metrics:** return rate, rally length, interception point distribution
  across the arc (how much of the arc is actually being used), paddle
  smoothness.
- **Why it earns a slot:** continuous tracking (paddle never leaves the arc)
  trains sustained control rather than discrete reaches — none of G1–G4
  covers that; it's also instantly familiar to older patients.
- **Extra skills** (advanced shots layered on top of basic paddle play;
  therapist-toggled, each its own DDA knob, unlocked as the patient
  progresses — basic interception is never gated on them):
  - **Grip shot (grasp + release):** closing the hand at ball contact
    catches the ball (brief slow-motion hold); opening it releases a faster,
    spinning return. Trains timed grasp → hold → timed release under game
    pressure. Fallback without hand tracking: dwell (hold paddle on the ball
    for a beat).
  - **Spin shot (forearm rotation):** palm orientation at contact sets the
    spin type — supinated (palm rotating up/front) = topspin, ball dips;
    pronated (palm rotating down/back) = backspin, ball floats. Adds
    pronation/supination — a Fugl-Meyer movement no other game in the suite
    trains. Fallback: coarse palm estimate from pose-model
    thumb/index/pinky landmarks.
  - Skills are also **choice** (Zhang's element): a skilled patient picks
    which shot to play, not just whether to reach the ball.
- **Bimanual modes:**
  - **Split-arc:** one paddle per arm, each covering half the field; AI
    alternates sides so both arms stay engaged.
  - **Coupled (bilateral):** both arms drive one paddle positioned at their
    average — the affected arm must match the healthy arm's movement.
  - **Self-rally:** affected arm vs healthy arm on opposite sides; built-in
    same-session inter-arm comparison for the data log.
  - Requires a per-arm profile for both arms; each arm's returns stay inside
    its own measured arc.
- **Multiplayer modes:**
  - **Vs therapist/family (same camera):** MediaPipe tracks 2 people
    (numPoses: 2); the second person's arm drives the opposing paddle. The
    companion needs no assessment — their paddle uses a default arc; only the
    patient's side is ROM-bounded and DDA-controlled.
  - **Vs companion (keyboard/remote):** simplest fallback — opponent paddle
    on arrow keys or a phone browser page acting as a controller.
  - **Patient vs patient (stretch goal):** two beds/rooms over local network;
    each patient plays inside their own assessed arc — asymmetric arcs are
    fine because each side's returns are aimed within the receiver's range.
    High motivational value (Zhang's social element), but network + privacy
    review needed → later milestone.

### G6 — "Star Cascade" (rhythm lanes, guitar-hero style)
Falling stars descend light-columns into 4 rings placed across the arc
(mirrored to the trained arm); be in the ring when the star arrives. Timed
reaching to a beat (84 BPM, synced to the lo-fi engine). Metric: best streak.

### G7 — "Harbor Crates" (virtual Box & Block Test)
One crate at a time on the trained-arm side: dwell-grab, carry ACROSS the
midline, hold to drop on the far deck. 60 s; the growing stack is the score
(classic BBT count). Metric: boxes/min.

### G8 — "Compass Rose" (center-out reaches)
Home circle near the trained shoulder; 8 targets at 45° spokes at 75% of the
envelope. Reach → hold 0.6 s → return home → next. Completing all 8 lights
the compass. Metrics: points lit, RT/MT per spoke (future).

### G9 — "Echo Reach" (proprioception trainer)
A star appears → reach & hold → it vanishes → return home → reach back to
where it WAS (no target visible) and hold steady → the true position is
revealed with the error drawn as a line (kind, visible feedback = learning).
Scoring by error (<0.25 SW perfect / <0.5 good). Metric: mean echo error.

### Implemented Pong modes (v1)
solo (vs gentle AI) · bimanual (left arm vs right arm — the suite's bimanual
game) · coupled (both arms average into one paddle) · companion (arrow keys).
Patient paddle sits on the trained-arm side; per-arm arcs used in bimanual.

### Orientation rule (all games)
Layouts mirror by trained arm: Pong paddle side, Lantern carries cross the
midline from the trained side, Harbor Crates source side, Compass/Echo home
position, Star Cascade lane order.

Session flow: pick arm → (Dawn Painter if due) → therapist or patient picks a
game → rounds with DDA until stop rule (fatigue check / time / patient exit).

## 8. Data & therapist view

- Per round: game, params, hit rate, kinematic metrics above, grasp events.
- Trends screen: arc range over sessions, % arc used, smoothness, grasp map.
- Export JSON (v1); CSV later. All local; no PHI beyond a chosen ID string.

## 9. Milestones

1. **M1 — Platform + plane:** one-plane arc assessment (Dawn Painter),
   profile storage, staff setup view, design-language shell. ✅ partially
   built (v0 prototype exists; needs arc-angle model + new aesthetic).
2. **M2 — Constellations + Arc Pong** (no grasp dependency; safest first
   games — one discrete-reach, one continuous-control).
3. **M3 — Grasp R&D:** wrist-crop hand tracking at distance; fallback dwell.
4. **M4 — Drift + Lantern Release** (grasp-dependent stages gated on M3).
5. **M5 — Ember Watch + reward economy across games.**
6. **M6 — ZED 2 backend; second plane (toward-TV flexion).**

Open questions: exact joint-angle definition per plane (goniometry-matched?),
pain-scale wording per clinical team, patient ID scheme, bilateral/mirror
modes later? Since Pong's spin shot uses pronation/supination, should the
assessment add a "rotate palm up/down" step at the grasp-test positions to
record available rotation range?

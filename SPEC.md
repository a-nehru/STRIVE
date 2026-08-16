# Upper-Limb Rehab Game Suite — Design Specification (v2, Aug 2026)

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

| | MediaPipe (v1) | ZED 2 (implemented via bridge) |
|---|---|---|
| Arm joints | Pose Landmarker (shoulder/elbow/wrist), 2D + rough z | SDK BODY_38 depth-based skeleton, streamed to the browser |
| Grasp | Hand Landmarker on a **zoomed crop around the tracked wrist** (full-frame hands at 12 ft are unreliable) | BODY_38's four coarse hand points feed the pose-fingertip grip fallback; the 21-point hand model is unavailable |
| Risk | Grasp detection at distance is the main R&D risk. Fallback if unreliable: **dwell-and-hold** (hold position 1–2 s) replaces grasp in any game that asks for it. | Hand-model games (Firefly Pinch, Night Blooms, Teapot Turn) degrade in ZED mode |

**ZED integration (shipped):** the game is a static web app, so `tools/zed_bridge.py`
is the adapter — it runs the ZED SDK body tracking natively and serves
`localhost:8322` (`/status` probe, `/stream` SSE skeletons re-mapped to the
MediaPipe 33-landmark layout, `/video.mjpg` mirror preview). `tracker.js`
probes it at boot: bridge up → ZED drives the identical `_ingest` pipeline;
bridge absent → webcam + MediaPipe, unchanged. Staff drawer setting "Camera
source" (Auto / Webcam only, device-level). Depth is not yet consumed in-game;
a depth-aware envelope is the natural v3.

**Depth is now consumed (Aug 2026).** The bridge streams `lm3` beside `lm` —
the same joints in metres, camera frame — which `tracker._ingest3` /
`hand3(side)` / `has3D` expose. The assessment turns it into a real workspace
**volume**; a webcam has no depth, so the volume is simply absent there rather
than estimated.

**Who the tracker follows (Aug 2026).** Asking MediaPipe for a single pose
means the model silently hands over whoever it scored highest *that frame*, so
a therapist or a second patient in the room can become "the" body mid-round.
It now runs at `numPoses: 3` and we pick the patient ourselves: cost = per-frame
shoulder-midpoint displacement + shoulder-width mismatch + build ratio
(torso/shoulder-width) mismatch, gated; no acceptable match means **pause,
never swap**, and only after a grace window is a new (most central) person
accepted. On the ZED the bridge does the same job better, because it has real
positions: only bodies inside the **play volume** (`--play-near/--play-far`
depth, `--play-width` about the camera axis) are candidates at all, so a
bystander is excluded by *where they are* before any tracking reasoning gets a
chance to prefer them; and each seat remembers a **build signature**
(biacromial width, torso length, height, in metres, EMA-smoothed) so a patient
who leaves and returns reclaims their own seat, which tracking ids cannot do.

This is deliberately **not face recognition**. That would mean shipping an
embedding model and storing patient biometrics — an IRB question, not a code
change — for no gain in a room containing two or three people. Position and
build separate them at zero cost.

Grasp signal (v1 target): binary open/closed from hand-landmark finger
curl, smoothed over ~300 ms. Recorded per event with position along the arc.

### 3.1 Coordinate system, calibration & re-baselining

- **No pixel calibration.** Nothing clinical is stored in pixels. Units:
  - **Degrees** for the arc: shoulder angle = upper-arm segment
    (shoulder→elbow) vs. the **trunk axis** (shoulder-mid→hip-mid). Matches
    goniometry and is immune to camera distance and trunk lean (a lean does
    not inflate measured shoulder ROM).
  - **Shoulder-widths (SW)** for distances/sizes (hand offset, target radius),
    measured live each frame → scale-invariant across sessions.
  - **Arm lengths for reach demand (Aug 2026).** SW normalises camera
    distance, but the arm-length/SW ratio varies ~1.2–1.7 between people and SW
    is a *projected* width that shrinks a few percent when the trunk turns —
    so "0.9 SW" is a different fraction of reach for different patients and
    different postures. `tracker.armLenSW(side)` keeps arm length
    (shoulder→elbow→wrist summed, bend-invariant) as a decaying session max;
    the assessment stores it as `armLenSW` and each game start computes
    `armScale = clamp(live/stored, 0.8..1.25)`, which the envelope lookup
    applies. `rangeScale` therefore means the same fraction of *this* reach
    every session.
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
  - *Distance change below that threshold (Aug 2026):* the render frame's
    **origin** stays locked for the round (a reach must never drag the world
    with it) but its **scale** re-snaps after ~1.5 s of >10% change — otherwise
    rolling the chair back quietly makes every target a larger fraction of the
    patient's reach. A re-snap requires the **torso length** to have moved the
    same way: biacromial width shortens on trunk yaw without the patient
    moving, torso length barely does, so a turn can never be mistaken for a
    distance change.
- Compensation references (trunk position/rotation, shoulder-ear distance)
  are relative to the patient's own recent baseline, re-baselined at round
  start and after any pause — never to a fixed spot in the room.

## 4. Assessment (the shared "Clinical" step)

> **v2 (Aug 2026) — the AROM protocol as built.** One screen, **both arms
> back to back, left then right, with nothing to choose.** Asking a patient
> which arm to measure is a decision they should not have to make, and the
> suite needs both anyway: the unaffected arm is the comparison the therapist
> reads the affected one against.
>
> 1. **Hold still** → the resting hand position becomes the work centre
>    (`profile.center`). The rest position IS zero; limited-motion patients
>    never travel to a preset spot.
> 2. **Squeeze calibration** — "open wide… now squeeze" captures this hand's
>    own curl range (`tracker.setCurlCal` + `profile.curlCal`), so a hand that
>    can only partially close still registers a squeeze. Skipped gracefully
>    without hand-model detection.
> 3. **Demo** — a figure on screen sweeps the full circle before the patient
>    is asked for it, at the pace to copy. Words alone make an older patient
>    translate "the biggest circle you can" into a movement; showing it
>    removes that step. Nothing is measured while they watch.
> 4. **Sweep — 90 s of free reach**, and the patient is told plainly why:
>    *"wherever you reach is where your targets will appear."* It ends early
>    only when there is genuinely nothing left to find (14 of 16 directions
>    covered **and** no new ground for 20 s), so nobody is rushed off the
>    measurement everything else is scaled from, nor made to flail at a
>    finished one. Not 16 of 16: the directions straight below the work centre
>    sit inside the minimum recording radius and can never register.
> 5. **Six held positions** — `out`, `up-out`, `overhead`, `up-across`,
>    `across`, `down-out`, mirrored per arm so both arms are asked for the same
>    *movements* rather than the same screen spots. Each is a reach to 95% of
>    the true arm-length boundary, **held 5 s**, with an **open-and-close of
>    the hand** cued partway into the hold. Progress is scored on the
>    *projection* onto the direction, so drifting off-axis can never look like
>    a longer reach. The sweep records where the patient *went*; only this
>    records whether they *can* get to the edge and work there.
>
> **Reaching is the pass/fail and grasping never is** — a patient with no hand
> function completes every position — and a short reach is a measurement, not
> a failure on screen. Nobody is cut off mid-reach: the per-position clock only
> starts biting once the reach has stopped growing.
>
> This replaced the separate 3-orb grasp phase entirely. `profile.grasp` is now
> a *view* of the held positions (one source of truth), plus
> `reachablePositions` / `graspPositions` — knowing **where** a patient can
> grasp, not just whether, is what game allocation needs.
>
> **Workspace readouts.** All computed from the *unfloored* envelope: the
> stored envelope is floored so games always have somewhere to put a target,
> and area must not inherit that or every limited patient would be credited
> with the floor.
> - `areaSW2` — shoelace over the 16 bin triangles; × shoulder-cm² for cm².
> - `coverage` — area ÷ π·armLen², the fraction of the arm's full reachable
>   disc. A full-reach circle reads 97%; the 2.6% is the inscribed 16-gon,
>   which is honest rather than a rounding error.
> - `quadrants` — `{upOut, upAcross, downAcross, downOut}`, named for the
>   assessed arm. Which quadrant is lost is the reading that matters in
>   hemiparesis; raw screen quadrants would compare the two arms wrongly.
> - `volumeM3` + `depthRangeM` — **ZED only.** A per-sector prism sum: each
>   wedge of the painted area extruded by how far the hand actually travelled
>   forward and back *in that sector*, rather than one global depth stretched
>   over the whole shape.
>
> **A stored ROM is reused, never redone.** An arm that already has a profile
> is skipped and its saved measurements stand; only an explicit re-measure
> replaces it, and the replaced profile still goes to history. Re-measuring
> **one arm** is the common case — range changes on the affected side while the
> other stays put, and making a therapist sit a patient through six minutes to
> refresh three numbers is how a re-measure stops happening at all. Staff drawer
> offers *Measure both arms* and *Re-measure this arm*; the profile screen's
> button redoes the arm it is showing.
>
> **Finishing lands on a comparison, not the menu.** Per arm: the previous
> envelope drawn dashed under the current one *at a shared scale* (scaling each
> to its own box would make a workspace that grew look identical to one that
> did not), then arc / area / coverage / volume / longest reach / edges reached
> / grasped-there as `was → now` with a signed delta. With no previous
> measurement every row reads *baseline*, never a blank — a first assessment
> should not look like missing data. A re-measure that never shows the
> difference is just a delay.
>
> **Cost:** ~3 min per arm, ~6 min for both. That is a lot for this population;
> the knobs are the sweep duration and the hold duration.
>
> **On-screen restraint.** The sweep screen carries a start dot, small
> direction dots (the only "what have I not covered yet" signal), the painted
> envelope drawn thin, a short pacer firefly that fades once the patient is
> clearly going round on their own, and the hand cursor. It deliberately does
> *not* draw the arm-length boundary: the demo step, the pacer and the hold
> targets already imply it, and drawing it as a dashed circle plus a framing
> square meant one idea appeared three times over a live camera feed.
>
> The original Dawn Painter protocol below is retained for reference.

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
As built (v2, Aug 2026):
```json
{
  "arm": "right", "date": "...",
  "center": { "x": 0.02, "y": 0.21 },
  "envelope": [16 radii, SW],
  "covered": 0.81,
  "armLenSW": 1.42,
  "areaSW2": 2.35, "coverage": 0.37,
  "quadrants": { "upOut": 0.62, "upAcross": 0.21, "downAcross": 0.11, "downOut": 0.48 },
  "volumeM3": 0.0413, "depthRangeM": 0.32, "shoulderM": 0.38,
  "arcMinDeg": 22, "arcMaxDeg": 118, "arcMeasured": true,
  "extremes": [
    { "key": "out", "deg": 0, "reached": true, "frac": 1.0, "reachSW": 1.31,
      "holdMs": 5010, "stability": 0.82,
      "squeeze": true, "release": true, "graspOk": true }
  ],
  "reachablePositions": ["out", "up-out", "down-out"],
  "graspPositions": ["out", "up-out"],
  "grasp": [ { "deg": 0, "key": "out", "ok": true, "stability": 0.82, "squeeze": true } ],
  "curlCal": { "lo": 1.08, "hi": 1.91 },
  "jitter": 0.11, "loopSeconds": 11.4,
  "params": { "rangeScale": 0.7, "radius": 0.30, "lifetime": 4.2 }
}
```
`params` here is the **assessment-seeded starting difficulty** and is
deliberately never overwritten by the DDA — see §5.

## 5. Difficulty (per game, per arm)

- **Initial** params from assessment: target zone = `rangeScale ×` measured
  arc; target size from endpoint error; target lifetime from RT + MT.
- **Stored per game and per arm (Aug 2026).** One shared set across every game
  meant Pong's long rallies dragged Scratch Cards' targets around and vice
  versa: the games make different demands, and a patient doing well at one is
  not necessarily ready for a harder version of another. A game never played
  falls back to the profile's params, and **`profile.params` is deliberately
  never overwritten by the DDA** — it stays the assessment-seeded value, so a
  first play starts from what the patient was measured at rather than
  inheriting wherever the last game drifted to. The therapist profile screen
  shows a *Difficulty by game* panel, so "why is Pong harder than it was" has
  an answer on screen.
- **Ladder levels are separate from the DDA.** Scratch Cards and Connect the
  Dots progress on levels (stored per patient, resumed between sessions);
  Pong stores a skill-unlock level. Where a game has a ladder, the ladder is
  the difficulty progression and the DDA is not fighting it.
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
game) · coupled (both arms average into one paddle) · companion (arrow keys) ·
team-arms · team-keys. Patient paddle sits on the trained-arm side; per-arm
arcs used in bimanual.

### Pong refinements (Aug 2026, implemented)
- **Walled lane sized to the arc:** hard rebound walls pulled inside the court
  to match `rangeScale ×` the assessed arc, so a small arc still gets a fully
  playable lane; walls widen as the DDA grows range demand.
- **Diegetic control explanation — the rope rig:** each paddle hangs from a
  rope over a pulley, hauled by a character (the puzzle-piece hero for the
  patient, the dark cloud for the AI, friends for teammate/companion paddles).
  The helper rides the rope as the arm moves, so the arm→paddle mapping is
  visible instead of abstract.
- **Constant rally speed:** the ball crosses the court in a fixed number of
  seconds; no per-return or per-rally acceleration. Difficulty moves only
  between rounds via the DDA. Skill shots keep a momentary punch that resets
  at the next paddle contact.
- **Flat flight:** vertical speed capped at 38% of horizontal; AI aims near
  the lane middle. Rallies cross in shallow diagonals rather than ricocheting.
- **Smoothed paddle (Aug 2026):** the paddle was driven raw from the arm
  angle, so a degree or two of landmark noise showed as chatter — amplified by
  the arc mapping, since a narrow assessed arc stretches a small angular error
  across the whole lane. It now runs through an adaptive (One-Euro) filter:
  heavy when the arm is held still, opening up with arm speed, because a fixed
  filter has to choose between holding steady and rallying. A frame with no
  angle **holds position** instead of snapping to mid-lane.
- **No arm drawn, a hand on the paddle instead (Aug 2026):** the translated
  arm skeleton was a second moving shape competing with the ball. Pong now
  draws only a small, translucent hand sitting on the paddle it drives, still
  curling and closing live, nudged outward so it hugs the back of the paddle
  rather than spilling into the court. Each paddle gets the hand that actually
  drives it — in bimanual the left paddle shows the left hand.
- **Grip Shot is level-gated again (Aug 2026):** the staff default was "grip +
  spin from round 1", which handed a brand-new patient a mechanic where
  squeezing as the ball arrives *catches* it and pins it to the paddle until
  the hand opens. Unexplained, that reads as the ball sticking to your hand.
  Default is now "auto" (1 rally → 2 +grip → 3 +spin); staff can still force
  any combination.
- **Match to 5 points (Aug 2026):** reaching five ends the round on a
  scoreline instead of on a clock — a match that finishes on a scoreline
  finishes, one that finishes on a clock just stops. The AI can win; an
  opponent that cannot win is not an opponent. Losing is never framed as the
  patient's failure ("Good rallies — go again?").
- **Serve from the middle, travelling to the opponent (Aug 2026):** the point
  opens with the patient's ball on its way out rather than one arriving at
  them.
- **Long-rally resolution — the misread (Aug 2026, replaces "the sleepy
  star"):** the old behaviour faded the AI's reactions and then drifted it to
  the lane middle, which reads as being *handed* the point rather than winning
  it. Instead the star now loses the way a person does — it misreads one shot.
  From 80 s (backstop 85 s) the next ball heading its way is steered to the
  corner *away* from it, and it holds the side the ball came from, anticipating
  a return to where the ball just was: the error people actually make. Then it
  breaks late and lunges at full speed. Full speed matters — a natural miss is
  a fast, confident, *wrong* commitment, not a sluggish one.
  The lunge is released on **time, not on a fixed fraction of the flight**: it
  goes when there is just barely enough left to get back, targeting a spot 0.3
  of a paddle past the ball (with a rail-folding arrival predictor). A fixed
  fraction leaves the paddle still travelling when the ball arrives and stops
  it ~1.5 paddle-heights away, which reads as "wasn't close" rather than "so
  nearly got it". Simulated over 480 configurations: **0 accidental saves,
  median miss 0.29 paddle-heights**, 99% within one paddle.
  It fires once per round; a misread that did not pay off (the patient missed
  first) is dropped at the serve rather than banked. Tiredness survives as
  capped flavour and the sleep marks are **suppressed during a misread** — a
  sleepy cue over a lunge would say the point was given rather than won.
  *Interaction to watch:* a 5-point game usually finishes well before 80 s, so
  the misread only fires in genuinely long matches. Lower the trigger if it
  should be the normal ending. No AI in bimanual/companion, so none there.
- **Round-1 tutorial doubling as a speed assessment:** replaces the story.
  Step 1: touch a pulsing star at the lane top, then bottom, five times —
  teaches the mapping AND measures paddle speed (median top↔bottom traversal,
  first transition dropped as reaction). Ball crossing time = `1.4 × T +
  0.45 s`, clamped to the DDA lifetime limits, used from the very first serve
  and persisted into `params.lifetime` (the DDA adjusts from the calibrated
  start). Step 2: meet one easy serve (misses give the AI no points during the
  tutorial). Skippable via a hand-hover pill; skipping falls back to the
  assessment-seeded speed. `paddleTraversalS` is logged per round — the
  suite's only direct arm-speed trend.

### G25 — "Rainbow Crossing" (external rotation + grasp discrimination)
The suite's first game in the **Strivealon story world**: dark clouds are
covering the stars over the village; games earn stars back for its sky.
Co-designed with Tavi; cast = "The Quirky Crew" (yellow puzzle-piece hero,
red scribble-ball, stacked one-eye, sad dark-cloud enemies).
- **Mechanic:** the hero walks a rainbow road (an arc built point-by-point
  inside `rangeScale ×` the assessed envelope, low on the opposite side and
  arching to high on the trained side; the hand traces it to walk). Dark
  clouds block the road: **whoosh them off with an outward forearm sweep**
  (shoulder external rotation — the elbow must stay planted or the sweep
  resets; ~32° of sweep, easing to 15° after timeouts so it never becomes
  impossible). Quirky Crew friends are also stuck on the road: **save them
  with a gentle squeeze** (arrive open, then close; a steady 1.5 s hold works
  for hands that can't close). Sweeping at a friend gets a kind spoken
  correction, no penalty — a discrimination/inhibition element. Reaching the
  chest = jackpot (stars, +bonus per rescued friend, stars return to the
  sky); the crossing then reverses.
- **Trains:** shoulder external rotation (a Fugl-Meyer movement nothing else
  in the suite touches), guided reach along a path, grasp, response
  inhibition.
- **Difficulty knobs:** envelope-scaled path radius (rangeScale), sweep
  degrees required, save-hold duration, blocker timeout (lifetime-scaled).
- **Metrics:** `cloudsPushed`, `friendsSaved`, `jackpots` per round.
- **Tutorial:** round 1 is a skippable learn-by-doing crossing (walk → whoosh
  a demo cloud → save a friend), voice-guided, skip via hand-hover pill.
- **Art direction (deliberate departure):** flat daylight cartoon — ink
  outlines on warm cream, high contrast, no glow-dependent cues — chosen for
  visual-impairment accessibility. The arm skeleton/cursor rendering is
  overridden in ink for this game. See DESIGN_BRIEF §9.

### Aug 2026 additions (G10–G24)
Fifteen further games from the research pass (wipe coverage, bilateral rowing,
steering, ballistic swipes, pronation/supination, pinch, cognitive sorting…)
are specified in `GAME_IDEAS.md` and implemented in `games.js` with a
`trains:` label per card so therapists can prescribe by movement.

### Enabled set (Aug 2026, by request)
Only **the assessment, Arc Pong, Scratch Cards and Connect the Dots** are
enabled. Every other game carries a `disabled` flag — the code is all still
there, so re-enabling one is deleting that flag.

### G10 — "Scratch Cards" (levelled coverage, was Lighthouse Lens)
The open hand scrapes foil off a hidden picture. Sweeping beats point-visiting
for coverage work, and a card that has to be *cleared* makes the sweep
self-directing: the patient can see exactly what they have missed.
- **The level is the difficulty ladder, not the DDA.** Six levels widen the
  card across more of the patient's own measured envelope *and* shrink the
  scratcher together (0.30 → 0.11 SW), so demand moves from big sweeps close in
  to accurate sweeps at full stretch — literally "the eraser gets smaller with
  levels".
- Every flake sits inside the measured envelope and on screen, so "clear the
  card" is never quietly impossible.
- One picture per level, drawn into the card's own box so it fits whatever
  shape that patient's reach turns out to be. Level stored per patient and
  resumed.
- **What it borrows from commercial scratch cards, and what it refuses.**
  Anticipation and reveal are genuinely good mechanics and are the whole of
  what is taken. The rest of that playbook — variable-ratio rewards, near-miss
  teasing, prize framing — exists to keep somebody playing past the point they
  meant to stop. In a clinical tool for older stroke patients that is a harm,
  not a mechanic. The reward is the picture, it is certain, and it arrives when
  the work is done.

### G26 — "Connect the Dots" (sequenced point-to-point reach)
Hold on dot 1, then 2, then 3, and a line follows the hand until the picture
closes. The opposite of the coverage games: every movement is a discrete reach
to a *known* target, which is what makes it useful for accuracy and for
patients who need a next step they can see rather than a field to sweep.
- **Levels 10 → 44 dots with a shrinking capture radius** — the same drawing
  asked for more precisely, like the paper puzzles that go 1-10 / 1-30 / 1-150.
- **Every outline vertex is a dot**, and spare dots go to the longest edges.
  Even arc-length spacing walks straight past corners, and a star resampled to
  8 evenly spaced points stops looking like a star; corners are what make a
  picture recognisable.
- Dots are laid in the patient's own envelope and each is pulled radially in to
  `spread × envelope` if the picture's box would push it past their reach — the
  corners of any box sit further out than its axes — so a picture is never
  partly unreachable.
- **Only the next dot is lit and numbered.** Lighting them all is what makes a
  paper puzzle confusing; here there is always exactly one thing to go to.
  Squeeze is a shortcut over the dwell, never a requirement.

### Orientation rule (all games)
Layouts mirror by trained arm: Pong paddle side, Lantern carries cross the
midline from the trained side, Harbor Crates source side, Compass/Echo home
position, Star Cascade lane order.

Session flow: login → welcome/framing → (AROM assessment if an arm is
unmeasured, or an explicit re-measure) → previous-vs-current comparison →
therapist or patient picks a game → rounds with per-game DDA until stop rule
(fatigue check / time / patient exit).

## 8. Data & therapist view

- Per round: game, params, hit rate, kinematic metrics above, grasp events.
- Trends screen: arc range over sessions, % arc used, smoothness, reach & grasp
  map over the six held positions, workspace area/coverage/volume, and
  difficulty by game.
- Export JSON (v1); CSV later. All local; no PHI beyond a chosen ID string.
- **Therapist contact (Aug 2026).** A static page cannot send email, and the
  two alternatives both fail this project: a third-party email API needs its
  key embedded in a public page and routes patient data through somebody else's
  server, and a `mailto:` link only opens a client and waits for a human. So
  mail goes the way body tracking does — through a small local service
  (`tools/mail_bridge.py`) that the clinic machine runs beside the game. The
  SMTP credential lives in a gitignored config read only by that process and
  never reaches the browser. Staff drawer gets *Send test email* (connectivity
  + diagnostics), *Report a problem* (typed description + camera/tracking/
  browser diagnostics, no PHI), and *Email progress* (the arm's assessment,
  workspace metrics, edges reached, grasp, recent rounds, compensation). With
  the relay down every button falls back to a prefilled `mailto:` so nothing
  dead-ends.
- **Nothing sends automatically** — not on login, not at round end. Patient
  data leaving the machine is always a deliberate press, which is a consent
  question and not a feature to optimise away.

## 9. Milestones

1. **M1 — Platform + plane:** one-plane arc assessment (Dawn Painter),
   profile storage, staff setup view, design-language shell. ✅ partially
   built (v0 prototype exists; needs arc-angle model + new aesthetic).
2. **M2 — Constellations + Arc Pong** (no grasp dependency; safest first
   games — one discrete-reach, one continuous-control).
3. **M3 — Grasp R&D:** wrist-crop hand tracking at distance; fallback dwell.
4. **M4 — Drift + Lantern Release** (grasp-dependent stages gated on M3).
5. **M5 — Ember Watch + reward economy across games.**
6. **M6 — ZED 2 backend** ✅ shipped as the localhost bridge (see §3).
   Depth is now consumed: the bridge streams metric `lm3` and the assessment
   reports a real workspace volume. Depth-plane *games* (toward-TV flexion)
   remain the open work.
7. **M7 — AROM v2** ✅ both arms, demo, 90 s free reach, six held positions
   with grasp, workspace area/volume/coverage/quadrants, stored-and-reused ROM
   with a previous-vs-current comparison (see §4).
8. **M8 — Identity & scale robustness** ✅ multi-body lock on the webcam path,
   play-volume gate + build signature on the ZED, arm-length reach
   normalisation, distance-aware frame rescaling (see §3, §3.1).
9. **M9 — Per-game difficulty + ladders** ✅ difficulty stored per game and per
   arm; Scratch Cards and Connect the Dots progress on levels (see §5).

Open questions: exact joint-angle definition per plane (goniometry-matched?),
pain-scale wording per clinical team, patient ID scheme, bilateral/mirror
modes later? Since Pong's spin shot uses pronation/supination, should the
assessment add a "rotate palm up/down" step at the held positions to record
available rotation range?

New open questions (Aug 2026):
- **Assessment length.** ~6 min for both arms is a lot for this population.
  Needs a real session before the sweep and hold durations are fixed.
- **Game allocation.** `reachablePositions` / `graspPositions` are recorded
  but nothing consumes them yet. What is the rule — hide games that need a
  position the patient cannot reach, or offer them at reduced range?
- **Consent for the progress email.** Button-only and staff-initiated today.
  If it ever becomes automatic, that is an IRB conversation first.
- **`numPoses: 3` GPU cost.** Tracking three bodies is real work on a modest
  clinic machine; needs an fps check on the target hardware.

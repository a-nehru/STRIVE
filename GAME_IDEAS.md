# Game Ideas & Accessibility Research (Aug 2026)

Synthesis of a four-track research pass: (1) clinical evidence for upper-limb
rehab game mechanics, (2) open-source MediaPipe/webcam game repos, (3) the
game catalogs of 14 commercial rehab systems (Jintronix, MIRA, Neofect,
MindMotion, Tyromotion, Armeo, BITS, IREX, VirtualRehab, RehaCom, H'ability,
Wii-therapy, Ring Fit, Kemtai), and (4) accessibility guidelines (GAG, XAG,
WCAG 2.2, stroke-specific literature). Source links at the bottom of each
section.

## Where the current nine games leave gaps

The suite covers discrete reach (dwell), moving-target catch, sustained hold,
paddle interception, grasp-carry-release, center-out reach, and memory reach.
Cross-referencing the FMA-UE item-difficulty literature and the mechanics that
recur across commercial systems, the genuine gaps are:

1. **Bilateral/bimanual play** — zero two-arm games (Pong's bimanual modes
   excepted). Bilateral tasks appear in 7 of 14 commercial systems; asymmetric
   interlimb coordination is the discriminating post-stroke deficit.
2. **Pronation/supination** — the moderate-to-hardest FMA-UE items, absent
   from nearly all camera-based suites (Pong's spin shot gestures at it).
   Now proven feasible from 2D MediaPipe hand landmarks (MAE ~5°).
3. **Ballistic/velocity movement** — every current game is slow dwell or
   grasp; no game trains movement *speed* or swipe initiation.
4. **Continuous steering** — the most repeated commercial verb after reach
   (8 of 14 systems); trains sustained control and yields smoothness metrics.
5. **Area coverage (wiping)** — signature exercise in 5+ systems; forces
   sweeps across the whole envelope rather than point visits.
6. **Explicit midline crossing** — contralateral-hemispace reaching with
   trunk-compensation gating (our coach already enforces the honest version).
7. **Movement-quality scoring** — eccentric lowering control and smoothness
   (jerk) are invisible to the current hit/miss economy.
8. **Cognitive-motor dual task** — rule-based sorting under motor load;
   validated per-dimension DDA precedent (ROBiGAME).

## Top candidates (ranked by clinical value ÷ build effort)

Each entry: mechanic → clinical rationale → tracker signals → effort.

### Tier 1 — zero new tracker code

1. **Lighthouse Lens (wipe-to-reveal).** Fog covers a warm picture (the
   lighthouse lens, a porthole); the open hand is the cloth; sweeping clears
   it; the picture is the reward. Coverage of envelope bins is the natural
   metric. Wiping is a signature exercise in Jintronix, Armeo, VirtualRehab.
   Uses `handRel` only. *The single cheapest high-value add.*

2. **Ferry Oars (bilateral rowing, two modes).** Both hands cycle to row a
   dinghy across the night harbor; boat speed rewards amplitude × symmetry
   (Jintronix "Row the Boat" design — bonus, not requirement). Mode 2 is
   anti-phase ("bail out the water"), the harder interlimb pattern (BATRAC).
   Uses both `handRel` + peak detection; `songBeat()` for the rhythm cue.
   *Fills the bilateral gap with the most clinically cited bilateral design.*

3. **Crane Keeper (proximal hold + distal squeeze).** Hold the arm inside an
   elevation band (from `arcMaxDeg`) to keep the harbor crane raised; squeeze
   to close the claw on passing crates, open to drop on the barge. Gamifies
   progressive abduction loading (RCT-supported attack on flexion synergy).
   Uses `armAngle` + `handClosed`. *Best effort-to-value in the clinical list.*

4. **The Night Ferry (steering / berthing).** Steer the ferry between buoys
   and ease it into its berth. Solo mode: hand height = rudder. Bimanual
   mode: both hands grip an invisible wheel, wheel angle = atan2 between
   palms (Drivable repo pattern). Soft bumps, no fail. Gate spacing from
   `loopSeconds`, channel width from jitter. *The steering verb from 8
   commercial systems; also the legal answer to "Parking Master."*

5. **Falling Stars (ballistic swipe).** Sweep the hand *through* drifting
   star-streaks to scatter them into sparks — success by velocity threshold,
   not dwell. Targets spawn contralaterally at higher levels = midline
   crossing. MindMotion Fruitchamp / Wii-swing analog. Differentiate `handRel`.
   *Adds the missing speed axis; a swing-through variant can layer onto Pong.*

6. **Signal Flare (slingshot aim-hold-release).** Grab the flare line near
   the shoulder, pull back along the envelope (further pull = more power),
   hold the aim steady, open the hand to launch a lantern-flare at drifting
   sky targets. Two-phase aim-then-commit pairs stability (jitter) with timed
   release — the hardest RGS stage under playful pressure. Uses `handRel` +
   `handClosed`. *The legal, harbor-native Angry Birds.*

7. **Shelf of Stars (lift-to-shelf, ARAT paradigm).** Grasp jars low in the
   envelope, place them on shelves at rising `armAngle` bands; top shelf
   bounded by `arcMaxDeg`. The canonical ARAT grasp item (lift to 37 cm
   shelf) as gameplay; vertical variant of Harbor Crates verbs.

8. **Light Every Window (scan-and-cancel, neglect-aware).** Dim windows
   across the full field must each be lit once before dawn; spawn weighting
   into the neglected hemifield (therapist toggle), per-hemifield latency as
   the `extra()` metric. BITS Bell Cancellation / scanning-training analog.

9. **Harbor Lights Sorting (cognitive-motor dual task).** Catch only lanterns
   matching tonight's rule (color/shape); the rule flips mid-round on a
   chime. Cognitive difficulty (rule complexity, distractor rate) becomes a
   second DDA axis, separate from motor difficulty (ROBiGAME precedent).

10. **Two Lights (Fitts ladder).** Tap two buoys alternately; blocks sweep
    target size × separation (= `radius` × `rangeScale`, formalized as Fitts
    index of difficulty). Yields throughput (bits/s) per arm — a repeatable
    hidden assessment for the therapist log.

11. **Feather Lantern (eccentric control).** Squeeze to lift the lantern fast
    to the hook, then lower it slowly inside a gentle speed band — descend
    too fast and the flame gutters. Scores smoothness of the *lowering*,
    training the deceleration control the hit/miss economy can't see.

### Tier 2 — needs one new tracker capability each

12. **Teapot Turn (pronation/supination).** Palm-up to catch honey drops,
    palm-down to pour tea, on cue. Needs `palmFacing(side)`: palm-normal via
    cross product of (wrist→index_mcp) × (wrist→pinky_mcp), 3 states with
    hysteresis, self-calibrating like `grip()`. Published feasibility: ~5°
    MAE from 2D hand landmarks. *Highest-value new tracker capability — also
    upgrades Pong's spin shot.*

13. **Firefly Glide (graded grasp as analog axis).** Squeeze slowly to make a
    firefly rise, relax to sink, thread it between reeds. Uses continuous
    `handCurl` (already computed, currently only thresholded) — trains
    open/close range control, an entry point for patients below the current
    easiest difficulty. (Pattern from flappy-mediapipe repo.)

14. **Open Hands Bloom (aperture pre-shaping).** Flowers in two sizes; the
    hand must *arrive* pre-shaped (wide open vs half open), then close at
    contact. Trains reach-to-grasp transport-aperture coupling, which stroke
    specifically de-couples. Needs 2–3 calibrated `handCurl` bands.

15. **Firefly Pinch (pincer vs mass grasp).** Pinch thumb-index to catch
    fireflies; a whole-fist squeeze scares them off. Needs normalized
    thumb-tip–index-tip distance with big hysteresis. ARAT pinch subscale;
    noisy at laptop distance — prototype last.

### Reframes of existing games (cheap wins)

- **Pong swing-through**: reward moving through the ball (velocity bonus) —
  the ballistic axis inside an existing game.
- **Melody Tiles → Harbor Drums**: if rhythm returns, 2–4 *fixed* spatial
  zones hit on beat (IREX Drums / BITS Metronome pattern) — fixed positions,
  variable timing — rather than falling tiles.
- **Free-path Follow**: extend the trace code to spline paths (figure-8s,
  waves) with a moving firefly guide (MIRA Follow / Fish Frenzy); distance-
  to-guide = smoothness metric.
- **Drift stage 4**: lateralized spawning with per-side stats (RGS Spheroids).

### Patterns worth copying regardless of game choice

- **Name the trained movement on each game card** (MindMotion's one-activity-
  one-movement labeling) — therapists prescribe by movement.
- **Decouple archetype from driving movement** (MIRA): one game accepting
  "reach" / "lift" / "lateral" input mappings multiplies the library.
- **Symmetry bonuses, never requirements**, in bilateral games (Jintronix).
- **Keep speeds far below entertainment norms** — every camera system that
  survived clinically did.
- **Every round doubles as silent re-assessment** (npj Digital Medicine
  exergame): update envelope estimates from in-game kinematics continuously.

## Accessibility: rules and features to adopt

Three headline gaps (all verified against the current design):

1. **Captions for the therapist voice.** `say()`/`speak()` are audio-only;
   hearing loss is near-universal in the target demographic. Route every
   spoken line to an optional large-print caption (cream on ink ≥4.5:1,
   ≤8 words/line, slow fade), on by default, persisted per patient.
2. **The amber/sage colorblind collision.** #e8a86a vs #9fc08a have a 1.01:1
   luminance ratio — indistinguishable under red-green colorblindness (~8%
   of males) everywhere the pair carries state (welcome framing amber→sage,
   compensation skeleton). Fix with a redundant channel: brightness shift,
   outline/shape change, or text. Also: amber/sage on cream is ~1.7:1 —
   fails WCAG 1.4.11; always add a dark outline on cream backgrounds.
3. **Hemianopia ≠ hemiparesis.** The reach envelope handles the arm; a visual
   field cut is independent — a patient can reach where they cannot see. Add
   a per-patient visual-field flag: *comfort* mode biases spawns to the
   intact side; *scanning-training* mode (therapist-enabled) deliberately
   spawns on the affected side with an audio ping + spoken cue.

High-value features, in order:

4. **Sticky dwell**: dwell progress decays over 300–500 ms on brief cursor
   exits instead of resetting; keep-radius > acquire-radius. The tremor
   literature endorses sticky/magnetic over longer dwell times (which add
   fatigue).
5. **Therapist-adjustable dwell time (1.0–3.0 s), capture-radius scale, and
   squeeze threshold** — persisted per patient.
6. **Hit-box ≥ 1.3× visual radius guaranteed in every game** + optional
   magnetic cursor attraction within ~1.5× radius.
7. **Rest prompts**: after ~20–30 min, N rounds, or a compensation-event
   spike (existing signal = fatigue proxy), speak+caption "Time for a short
   rest?" — no auto-timeout.
8. **Objective restated during play** after ~10 s idle, via the existing
   rate-limited `_feedbackTick`.
9. **Per-bus volume** (voice/music/effects gain nodes; voice ducks music).
10. **High-contrast / reduced-motion toggle** (dark outlines, dimmed scenery,
    bursts → slow glows; honor `prefers-reduced-motion`; keep all flashing
    under 3/s — post-stroke seizure risk).
11. **Text-scale setting + aphasia pass** on all patient copy: ≤8 words per
    sentence, one idea each, no idioms, icon beside every menu label.
12. **Practice mode flag** (no miss accounting) per game.
13. **All accessibility settings persisted per patient** in `rehabsuite-v1`
    and listed on a staff-facing panel.

Already satisfied by the existing design (verified): envelope-bounded spawns,
DDA, dwell+squeeze dual input with debounce, soft misses/no fail states, calm
palette, per-arm mirroring, keyboard+mouse menu fallback, graceful pause.

## Reference repos (license-checked)

Safe to adapt (MIT/Apache):
- `collidingScopes/manual-brick-breaker` — palm-paddle brick breaker, same
  stack as STRIVE (vanilla JS + canvas + MediaPipe, no build).
- `collidingScopes/arpeggiator` — arm position drives music; pattern for a
  no-fail sonification game on top of `audio.js`.
- `pmmathias/VogelSimulator` — wrist-vs-shoulder altitude control + rhythmic
  flap detection (endurance mechanic).
- `5of12/MediaPipe-Playground` (Apache-2.0) — long-range pinch pointer with
  smoothing/deadzone; two-hand pan/zoom; wake-gesture to pick the active
  person (solves therapist-in-frame ambiguity).
- `midiblocks/handsfree` (Apache-2.0, archived) — head-pointer fallback and
  accessible input-mapping catalog.

Concept-only (no license — do not copy code):
- `limgm/flappy-mediapipe` — finger-curl as continuous altitude axis.
- `HoangDavid/Drivable` — two-hand invisible steering wheel.
- `HKyang07/Unity-simple-RGS-game` — RGS Spheroids lateralized interception.
- `ManyaSondhi/AirSlice`, `AmitDas4321/Bubble-Shooter`, `yad-qasim/Air-canvaser`
  (stability-gated drawing pipeline — good tremor-tolerant design reference).

Rejected: `Parking-Master/Parking-Master-5.0` (MIT but keyboard-driven 3D,
wrong stack/clinical shape — concept adopted as The Night Ferry);
`Gamesforgirls/Gamesforgirls.github.io` (unlicensed portal wrapping Famobi's
commercial games); `jooapa/Angry_Birds_Decompilation` (decompilation toolkit
for Rovio's proprietary games — mechanic adopted legally as Signal Flare).

## Key sources

Clinical: RGS methodology (jneuroengrehab 1743-0003-7-48) · FMA-UE item
difficulty (Front. Neurol. 2020.577855) · ARAT structure (strokengine.ca) ·
abduction loading RCT (PMC5825888) · bimanual deficits (jneuroengrehab
s12984-019-0570-4) · BATRAC (PubMed 11022069) · reach-to-grasp coupling
(PMC6598288) · ROBiGAME dual-task DDA (PMC11756148) · pron/sup from 2D hand
landmarks, MAE ~5° (DOAJ 94c05cb2b0a9478caed8915193056b21) · Kleim & Jones
plasticity principles (physio-pedia) · MediaPipe stroke proof-of-principle
(PMC12752325).

Commercial: MindMotion GO leaflet (vbrrii.it PDF) · Jintronix game set
(rehab.jmir.org/2022/2/e33745) · MIRA archetypes (rehab.jmir.org/2020/2/e17289)
· Neofect Smart Board (neofect.com/us/smart-board) · IREX (gesturetekhealth.com)
· Tyromotion tyroS (tyromotion.com) · Armeo (hocoma.com) · BITS
(brooksrehab.org/technology/bits) · Wii-therapy RCT (games.jmir.org/2022/2/e29830).

Accessibility: gameaccessibilityguidelines.com/full-list · Xbox Accessibility
Guidelines (learn.microsoft.com/en-us/xbox/accessibility/guidelines) · WCAG 2.2
(w3.org/TR/WCAG22) · Stroke Association aphasia guidelines (stroke.org.uk) ·
hemianopia scanning RCT (BMC Neurology 1471-2377-11-87) · magnetic/sticky
freehand selection (LMU maekelae2014perdis).

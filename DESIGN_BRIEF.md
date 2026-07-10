# Upper-Limb Rehab Game Suite — UI Design Brief & Mockup Spec (v1.0)

A camera-tracked rehabilitation game suite for inpatient rooms. This document
is the complete hand-off for UI/front-end design and mockups. Companion doc:
`SPEC.md` (clinical/technical spec).

---

# 1. Context the designer must know

## 1.1 The room
- Patient sits on the edge of a hospital bed or at an over-bed desk.
- The display is a **TV mounted 10–12 feet (3–3.6 m) away**.
- A camera at the TV tracks the patient's arm movements (MediaPipe pose
  tracking; no controller, no wearables).
- A staff member sets up the system; the patient never touches a mouse or
  keyboard. **Patient input = arm movement only.** Menu choices are made by
  the therapist (tablet/laptop/keyboard) or by patient hover-dwell with the
  tracked hand.

## 1.2 The users
- **Patients**: stroke survivors, mostly 50+, one impaired arm. May have low
  vision, visual field loss (one side of the screen may be invisible to
  them), attention deficits, fatigue. Calm > exciting.
- **Therapists**: need fast setup, a live clinical read on the patient, and
  post-session data. Their views can be information-dense.

## 1.3 The 12-foot rule (hard constraints for every patient-facing screen)
- Minimum body text ≈ **60 px at 1080p** (≈1° visual angle); prefer 80–120 px.
  Menu labels bigger. During gameplay: **no text at all**.
- Targets and interactive shapes: **≥ 120 px**.
- High figure-ground contrast; never rely on color alone (pair color with
  shape/motion).
- Center-weighted composition: patients with field loss may not see screen
  edges — nothing critical lives only in a corner.

# 2. Visual design language — "minimal, seamless, hand-drawn"

Reference feel: the game *Melatonin* — pastel gradients, generous negative
space, soft hand-drawn shapes, music-linked feedback. Also acceptable
references: Alto's Odyssey, Journey, Monument Valley (calm palettes only).

Rules:
1. **No HUD during play.** No score counters, timers, or bars on screen while
   the patient is moving. Progress is *diegetic* — the world itself changes
   (sky fills with paint, constellation grows, village lights up, lantern sky
   accumulates).
2. **≤ 3 hues on screen** at once. Soft two-tone gradient background per
   game, slowly shifting. Suggested master palette: warm paper cream,
   dusk lavender, deep night blue, ember amber, firefly green — designer to
   develop final palette (must pass WCAG AA contrast for key elements at
   distance).
3. Shapes are **large, soft-edged, hand-drawn** (wobbly line, paper-grain
   texture). No hard vectors, no gloss, no 3D chrome.
4. The patient is represented by a **single elegant cursor** per game (comet,
   brush tip, firefly, paddle) — never a raw camera feed in patient view.
5. Feedback is **motion + sound**: success blooms and chimes in key; a miss
   simply fades and the next target arrives (never buzzers, never red X).
6. Typography: large, rounded, humanist (e.g., a warm rounded sans). Appears
   only between rounds and in menus. All patient-facing text is also spoken
   (auto voice instructions).
7. Every animation ≤ 400 ms for feedback, slow ambient drift for everything
   else. Nothing flashes (photosensitivity).

# 3. Screen map (information architecture)

```
Staff side (dense, tablet/laptop or TV with keyboard):
  S1 Setup & camera check
  S2 Patient select / new patient
  S3 Patient PROFILE (assessment results, trends, settings)   ← key screen
  S4 Session builder (choose arm, games, layers/modes)
  S5 Live therapist monitor (optional second-screen view during play)

Patient side (TV, minimal):
  P1 Welcome / arm ready check
  P2 Assessment — "Dawn Painter" flow
  P3 Game select (large cards, hover-dwell or therapist-driven)
  P4 In-game (per game G1–G5)
  P5 Between-rounds card (score moment + fatigue check)
  P6 Session end / rewards
  P7 Star Shop / collections (constellation gallery, lantern sky, village)
```

# 4. Screen-by-screen requirements

## S1 — Setup & camera check (staff only)
- Live camera preview WITH skeleton overlay (the only place raw video shows).
- Auto checks with clear pass/fail chips: whole upper body in frame · lighting
  ok · distance ok · tracking stable.
- One-tap "patient is seated on left/right of frame" flip.

## S2 — Patient select
- Large list/cards by patient ID (no names required — ID scheme TBD).
- Per patient: last session date, assessed arms (L/R chips), streak dots.

## S3 — Patient PROFILE (the screen the user specifically asked for)
Design as a clinical dashboard, one patient per screen:
- **Header**: patient ID, affected side, days in program, last assessment date,
  "re-assess due" flag if > N days old.
- **ROM arc widget** (hero element): a drawn arc showing the measured range
  for each arm (both arms overlaid, affected = amber, other = gray). Shows
  min/max angle values, and a faint history of previous arcs (progress ghost
  trails). This is the signature visualization — make it beautiful.
- **Grasp map**: the same arc with 3 position markers showing grasp
  (✓/✗) and hold-stability at each of the 3 tested positions.
- **Key numbers row**: reaction time · movement time · precision ·
  smoothness — each with a small sparkline trend over sessions.
- **Compensation summary**: per-session count/minutes of trunk lean, shoulder
  hike, trunk rotation (see §6) with trend arrows.
- **Session log table**: date, game, rounds, success %, arc coverage %,
  difficulty parameters reached.
- Buttons: Start session · Re-run assessment · Export data (JSON/CSV) ·
  Settings (audio, cues, difficulty overrides).

## P2 — Assessment "Dawn Painter" (patient-facing, gamified)
Sequence to mock up (each step is one screen state, voice-guided):
1. "Hold your hand still" — soft pulsing circle where the hand is.
2. Arc sweep ×3 — each sweep **paints a band of sunrise** across a dark sky;
   fuller sweep = fuller sunrise. The painted sky IS the ROM readout.
3. Hold test — 3 soft circles appear along the painted arc, one at a time;
   the sky brightens while held.
4. Grasp test — a glowing orb at each position; closing the hand "picks" it.
5. Quick reaches — 5 stars pop in sequence along the arc.
6. Finale: the completed sunrise + a simple spoken/visual summary
   ("Your sky is bigger than last time").
Also mock the **staff variant**: same flow but with numbers/skeleton overlay
visible in a side rail.

## P3 — Game select
- 5 large hand-drawn cards (artwork per game below), horizontal, center-
  weighted. Hover-dwell with the tracked hand (a radial dwell fill on the
  card) or therapist click.

## P4 — In-game (see §5 per game, §6 for Posture Coach which appears in ALL)

## P5 — Between-rounds card
- One centered card: stars earned (drawn as actual stars), success ring
  (~70% is presented as "just right" — the ring glows warmest near 70%, it is
  NOT a "get 100%" meter), longest rally / arc coverage as one friendly line.
- **Fatigue/pain check**: 3 large faces (fine / tired / hurts) — hover-dwell.
- Difficulty-change note in plain words ("The stars will drift a little
  farther next round").
- Rest timer suggestion every 4th round (a stretching sky animation).

## P6 — Session end
- The session's "world" state (sunrise painted, lanterns released, village
  lit) + total stars + gentle "see you tomorrow".

## P7 — Collections / Star Shop
- Spend stars: constellation creature gallery, lantern sky (every lantern
  ever released persists), village decorations, cursor & theme skins.
- Mock as a calm gallery, not a store: big artwork, one price chip per item.

# 5. The five games — visual concepts to mock

Every game: same cursor logic (patient's hand → one drawn object), targets
only ever appear inside the patient's assessed arc, Posture Coach docked
bottom-corner (§6).

- **G1 Constellations** (connect-the-dots): deep night-blue sky, stars appear
  one at a time; a luminous thread follows the hand from star to star;
  completing the figure reveals a hand-drawn animal that animates once and
  joins the gallery. Mock: mid-thread moment + reveal moment.
- **G2 Drift** (RGS-style interception): dawn sea, soft orbs drift toward a
  shore line; touching one makes it bloom. Stage 2 adds grasp (hand closes =
  orb caught), stage 3 carry-to-matching tide pool. Mock: stage 1 and stage 3.
- **G3 Ember Watch** (Zhang-style, Missile-Command structure): dusk village
  silhouette below, embers drift down; reaching one and holding turns it into
  a firefly that drifts up. Village windows light with progress. Mock: mid-
  round + village-growing-over-sessions strip.
- **G4 Lantern Release** (reach-and-grasp): grasp a lantern at one end of the
  arc, carry along it, open hand in the release ring → lantern floats into a
  persistent starfield of all past lanterns. Mock: carry moment + release.
- **G5 Arc Pong**: two soft paddles, floating ball, background blooms with
  rally length. Skills: grip shot (catch/throw with grasp) and spin shot
  (forearm rotation = topspin/backspin — show as ball trail curl). Modes:
  solo vs gentle AI, bimanual (split-arc / coupled / self-rally), multiplayer
  (second person same camera, keyboard companion). Mock: solo rally +
  bimanual split-arc + one "skill shot" moment with spin trail.

# 6. Posture Coach — compensatory-movement feedback (ALL activities)

**Clinical need:** stroke patients "cheat" reaches with their trunk and
shoulder instead of the arm. The system detects this live and must (a) make
the patient aware, (b) show them what to correct, (c) never shame them.

## 6.1 Detected compensations (v1, from pose landmarks)
1. **Trunk lean** (lateral/forward): shoulder-midpoint displacement from the
   round-start baseline.
2. **Shoulder hike** (scapular elevation/shrug): shoulder-to-ear distance
   shrinking on the reaching side.
3. **Trunk rotation**: shoulder-line angle / apparent shoulder-width change.

## 6.2 The component: a small skeletal mini-figure ("the Coach")
- A **hand-drawn skeletal figure ~180–220 px tall**, docked bottom-center-left
  (mirrors patient side), present in every game and the assessment.
- **Idle state** (good posture): barely there — a faint, calm outline at
  ~25% opacity, breathing subtly. It must not draw attention.
- **Alert state** (compensation detected > 0.5 s):
  1. The Coach fades to full opacity and **the offending segment glows amber**
     (leaning spine segment / hiked shoulder joint / rotated shoulder line).
  2. A **ghost overlay** on the Coach shows the correct posture (soft white
     dashed outline) with a gentle animated arrow from wrong → right
     (e.g., spine straightening, shoulder settling down).
  3. The game world **dims ~15%** and slows slightly — the round continues,
     nothing is lost, but the scene "waits" for them.
  4. Audio: soft whoosh + one short spoken cue, rotated to avoid nagging:
     "Sit tall", "Let your shoulder relax", "Reach with your arm".
- **Recovery**: posture corrected → segment glows green for 1 s, a small
  bloom, world brightens back. Positive close to the loop.
- **Escalation**: 3rd alert in a round → between-rounds card includes a
  friendly posture tip with the Coach demonstrating the correct movement as
  a 2 s looping animation; DDA also eases range demand (misses caused by
  compensation shouldn't push difficulty up).
- **Therapist control**: sensitivity slider (off / gentle / strict) per
  patient in profile settings; all events logged with timestamps for S3/S5.

## 6.3 Where the skeleton appears (summary)
- Patient view: ONLY as the small Coach figure (never full-screen skeleton,
  never camera feed).
- Staff setup view (S1) and live monitor (S5): full skeleton overlay on video.
- Between-rounds/profile: Coach used as illustration for posture tips and
  compensation stats.

# 7. Mockup deliverables checklist

Patient-facing (TV, 1920×1080, design at distance):
1. P1 welcome, P3 game select
2. Dawn Painter: sweep-painting moment + finale summary
3. One in-game frame per game (G1–G5) with Posture Coach idle
4. Posture Coach alert state (same frame as #3, one game, amber + ghost)
5. P5 between-rounds card with fatigue faces
6. P7 collections gallery
7. Bimanual + multiplayer Pong variants

Staff-facing (tablet/laptop density):
8. S1 setup & camera check
9. S3 patient profile (hero: ROM arc widget + grasp map + trends)
10. S5 live monitor (skeleton video + live metrics + compensation ticker)

System pieces:
11. Palette, type scale (with 12-ft minimums), component sheet (buttons,
    cards, chips, dwell-hover states, face scale, arc widget, Coach states)

# 8. Out of scope for mockups (but design nothing that blocks them)
- ZED 2 depth plane, patient-vs-patient networked pong, localization,
  EMR integration.

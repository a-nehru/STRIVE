# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

STRIVE (formerly Star Harbor / "Rehab Suite") — a webcam-based upper-limb rehabilitation game suite for stroke patients, developed by Synapse Lab, Shirley Ryan AbilityLab. UI copy convention: no em dashes in patient-facing text. Plain static site: vanilla JS ES modules, no build step, no dependencies to install, no tests or linter. MediaPipe Pose is loaded from CDN at runtime (internet required on first load). Design decisions are grounded in two rehab papers (CFI framework, Rehabilitation Gaming System) — README.md has a table mapping paper concepts to code; SPEC.md and DESIGN_BRIEF.md hold the full spec and visual design language.

## Run

```
python -m http.server 8321
```

then open `http://localhost:8321` (or double-click `start_game.bat`). A server is required — camera access is blocked on `file://` pages. Testing requires a webcam and allowing camera access; data persists in the browser's localStorage under the key `rehabsuite-v1` (do not rename the key — it would orphan patient data).

## Deploy

Live site: **https://a-nehru.github.io/STRIVE/** — GitHub Pages, deployed automatically from `main` of https://github.com/a-nehru/STRIVE (legacy branch build, repo root). To publish: commit, push, wait ~1–2 min. **Always bump the `?v=N` query on the `style.css` and `main.js` references in `index.html` in the same commit** — Pages caches assets for 10 min and browsers hold them longer; the version bump is what makes deploys show up immediately. Verify a deploy by curling the live file for a string unique to the new commit, not just HTTP 200.

## Architecture

Data flow: webcam → MediaPipe Pose (`tracker.js`) → body-relative coordinates → assessment (`assessment.js`) → per-arm profile → games (`games.js` on `engine.js`) → round stats → DDA (`dda.js`) → updated params → localStorage (`storage.js`). `main.js` is the app shell that wires screens, rounds, and the staff/therapist UI together.

### The coordinate system (everything depends on this)

All game/assessment positions are in **shoulder-width units (SW) relative to the shoulder midpoint, y-up** — camera-distance independent and comparable across sessions. `tracker.js` owns the conversions: `handRel(side)` (hand in SW), `relToPx`/`pxToRel` (SW ↔ canvas pixels), `pxPerSW(canvas)`, `armAngle(side)` (arm elevation in degrees vs the trunk axis, 0 = down, 180 = overhead), plus `palm(side)` and `handClosed(side)` (grasp detection — used by Harbor Crates grab/release, Pong skill shots, the assessment squeeze, and the palm disc on the skeleton). Grasp runs two-tier: a dedicated **Hand Landmarker** (21 pts/hand, every 2nd frame, matched to pose wrists by proximity) gives finger-curl via `handCurl(side)`; if it has no fresh detection, a self-calibrating pose-fingertip heuristic (`grip(side)`) is the fallback. Video coordinates are mirrored (`x = 1 - lm.x`) so the game acts like a mirror.

Envelope-based targets and the assessment circle are centered on `CENTER` (exported from `engine.js`, currently 0.25 SW above the shoulder midpoint) — the assessment measures its envelope around this point and `samplePos`/`fromCenter` place targets around it, so change it in one place only.

Rendering and hit-testing go through the tracker's **stable frame** (`tracker.frame`): a snapshot of the body anchor that stays fully locked for the whole round (so reaches/sway/jitter never move the world) and re-snaps only at `setBaseline()` (round start, after a relocation pause). The live anchors are for compensation/relocation signals only.

The tracker keeps the body anchor on two time scales: a slow filter (targets follow legitimate repositioning) and a fast filter. Fast-vs-slow divergence is the **compensation signal** consumed by `coach.js` (trunk lean / shoulder hike / rotation → amber skeleton, world dim, spoken cue, logged event). Large sustained change triggers `relocated()` → graceful pause + re-baseline in the game loop.

### Assessment → profile → difficulty

`assessment.js` (one screen: choose hand → hold still → 3-2-1 countdown → trace the biggest circle → 3 grasp orbs) opens with a **hand-choice step** (two lights over the mirror; the hand held on its light — squeeze or 1.2 s hold — is the one assessed, and `main.js#startAssessment` adopts `profile.arm` as the session side) over a **live mirrored camera feed + skeleton** backdrop (`drawVideoMirror`/`drawBody`, exported from `engine.js` and shared with the welcome screen and Harbor Crates). Each run produces a per-arm profile: `envelope[16]` (max radial reach per 16 angular bins, SW; unreached bins floored at 0.45 with `covered` recording the measured fraction), `arcMinDeg`/`arcMaxDeg` (+`arcMeasured`), `jitter`, `loopSeconds` (from total swept angle, wrap-safe), `grasp[]` (each orb: `ok` = hold succeeded, `stability` = final successful hold only, `squeeze` = real hand-close observed — hold is the pass/fail so patients without grasp still complete). The trace ends early when reach stops growing (a partial circle is a complete measurement of a limited range), and tracking-loss pauses freeze every assessment timer. Games must not spawn targets outside `rangeScale × envelope` — that is a clinical constraint, not a style choice.

`dda.js` defines the three difficulty params (`rangeScale`, `radius`, `lifetime`) with hard `LIMITS`, seeds them from the assessment (`initialParams`), and adjusts between rounds: hit rate >70% harder, <50% easier; when easing, `missFar` (misses beyond 70% of range demand) decides whether to reduce range demand vs grow radius/lifetime. `main.js` additionally holds difficulty steady if ≥3 compensation events occurred in the round.

### Games

`engine.js` exports `GameBase`: round loop with pause handling, `samplePos()` (envelope-bounded AND clamped on-screen via margins, staying body-anchored), `hit()`/`miss()` accounting, particle bursts, the always-drawn arm skeleton + hand cursor with capture-radius ring, and the "therapist voice" (`say()`, `_feedbackTick()` — spoken praise/tips, rate-limited).

A game subclass supplies: `id` (class field, must match its entry in the `GAMES` array at the bottom of `games.js` and its `CARD_ART` key in `main.js`), `setup()`, `update(now, dt)`, `drawBg(ctx, c, now)`, `draw(ctx, c, now)`, and optional `extra()` for per-game round metrics (these flow into the round record, the between-rounds summary text in `main.js`, and the therapist log). Interaction is dwell-based in most games ("grab" = hold hand on target); Harbor Crates uses real hand-close detection (`tracker.handClosed`) — a grasp *event* (arrive open, then squeeze) to grab, open past the midline to release; it plays in **AR** (camera feed + skeleton via `drawVideoMirror`/`drawBody`) with a solid BBT **barrier partition**: crossing the midline below the barrier top (`barrierY`, scales with `rangeScale`) pins the crate against the wall until the patient lifts it over. Nine games exist; a `disabled: true` flag on a `GAMES` entry hides its card and its drawer settings (Melody Tiles is currently disabled this way). Modes: `pong` has 6 modes chosen via an in-flow tile picker (`renderPongModes` in `main.js`, kept in sync with the drawer select) plus grip/spin skill shots (level-based unlock in `store.getPongLevel`, or staff override); `drift` has 3 stages that progress on hit rate in `main.js`.

### Audio

`audio.js` is all WebAudio. `startBgm(gameId)` tries `assets/music/<gameId>.mp3` first, falls back to a generative lo-fi engine (per-game moods). Melody Tiles instead uses `startSong(chart)`: the engine plays drums/bass/chords on a beat clock (`songBeat()`), and the *game* plays each melody note on tile hit (`playMelodyNote`) — a miss is an audible gap, so misses are silent (`miss(target, true)`). Song charts live in `songs.js` (beats, midi pitch, duration; C-major-ish, difficulty 1–3).

### UI conventions

- Menus are operable without a mouse: elements with `data-dwell="1"` are clicked by **squeezing** (hand-close edge, instant) or by holding the hand cursor over them for 1.4 s (`dwellLoop` in `main.js`). The grasp click needs a fresh open→close, so a held fist can't chain-select across screens.
- The welcome screen is a setup gate (`watchWelcome` in `main.js`): it draws a live skeleton mirror on `#welcome-canvas` (amber → sage when framed), shows a tracking/feature status line, guides the patient to sit centered at the right distance (`framingMessage`), and starts on lift+squeeze (fast), lift-hold (fallback), the Start button, or a click.
- In-game UI is diegetic/no-HUD: no numbers except where the count IS the test (Harbor Crates). Feedback is glow, music, and spoken lines.
- Calm night-harbor visual language; palette anchors: cream `#f4ecdd`, amber `#e8a86a`, sage `#9fc08a`, ink `#1b1b3a` (see DESIGN_BRIEF.md).
- Patient-facing text is gentle and non-judgmental (misses are "soft"); it's aimed at an older stroke population.

### Persistence

`storage.js`: single localStorage key `rehabsuite-v1`, per-patient records (per-arm profiles + assessment history, session rounds capped at 400, stars/unlocks, fatigue answers). Round records are appended by `main.js#onRoundEnd`; the therapist profile screen and JSON export read from here. Bump/migrate carefully — clinician data lives only in the browser.

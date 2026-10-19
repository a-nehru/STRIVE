# Pong: game design and implementation plan

Working document for the one game that stays enabled while the app is rebuilt (Sep 2026). It applies the STRIVE Game Design Framework v4.1 (`GAME_DESIGN_FRAMEWORK.md`, R. Kalvakota) to Pong alone, states what the framework asks for, what the code already does, and what is left to build. Update the status column as work lands.

Scope decisions already made (21 Sep 2026):

- One arm only, chosen at login. The paddle is driven by that arm and nothing else.
- One mode only: the participant against the computer. The other five Pong modes (arm vs arm, both arms, companion keys, team, two players) stay in the code but are not offered.
- The assessment is the two-step version in `assessment.js` (two circles and a lift, then five targets), measured about the body centre. Its outputs are what seed this game.

---

## 1. The specification (framework Section 9, restated for Pong alone)

### 1.1 Identification

| Field | Content |
|---|---|
| Name and premise | Pong, reimagined. Keep the pong going with the Lakebird by reaching to meet the ball; every good pong returns stars to the Starlonia sky. |
| Version | Spec v4.1 (15 Sep 2026). This plan: 21 Sep 2026. |
| Implementation status | Prototyped as `ArcPong` in `js/games.js` (id `pong`). Solo mode is the one kept. |
| Shared systems consumed | Star economy, hub and sky, Starlonia, body view and coach, break checks, playlist. Of these only the star count, the coach and a rest suggestion exist today. |

### 1.2 Clinical layer

| Field | Content |
|---|---|
| Population and stage goal | Adults in inpatient stroke rehabilitation with moderate upper-extremity impairment, seated or semi-reclined. High-repetition, task-specific proximal practice during non-therapy hours. |
| Out-of-synergy recruitment | Targets low and to the affected side draw abduction and extension; far targets draw elbow extension; high-forward (flexion) targets never dominate the mix. |
| Motion features | Reach direction (weighted lateral and low), reach amplitude (within the measured envelope), transport speed. No hold demand. |
| Tracking basis | ZED body tracking, with the webcam and MediaPipe as the fallback the app already has. The affected arm from the profile drives the paddle; other-hand input is ignored, with escalating reminders. No fine-finger dependence. |
| Assessment use | Envelope (16 directions) bounds placement per direction with a 90% cap (G6); jitter sets initial paddle and ball size; loop time sets initial ball speed; elevation arc bounds vertical placement. Grasp outputs unused. |
| State assessment | Shared break checks: every fourth trial, sooner on fatigue signs. |
| Positioning | Standard seated setup; the framing check confirms the affected side's full reach is in view. |

### 1.3 Function layer

| Field | Content |
|---|---|
| Motion mapping | Hand position maps to paddle position. Reach zones are regions of the play space, weighted per the stage goal; every placement respects the assessment. |
| Goal and gameplay | One goal per trial: reach the trial's star goal by returning rallies with the Lakebird. Uncertainty: golden balls (about 1 in 6 to 8 returns) trigger a bonus (brief slow motion, double stars, confetti). |
| Duration and blocks | Trials of about 90 seconds. Check-in with a rest invitation every fourth trial. The game fills one 15-minute block, ending at the trial boundary nearest the mark. Pause anytime. |
| Feedback | Knowledge of performance: body view beside the play field, on the side opposite the affected arm, carrying hike and lean feedback. Knowledge of results: on the play field (returns, streak meter, near-miss framing, trial result with the compact leaderboard). Never mixed. |
| Grading | Rules G1 to G9. Near-miss margin about 1.5 times the paddle half-width. Grading up extends zones toward the cap and shows high-ROM zones more often; grading down slows the ball, then enlarges paddle and ball, and reduces zone demand last. Fast start for the first two trials (G3); a session opens one step below the previous close (G7); pacing may tighten under G9 (serve delay and the Lakebird's return leg, never ball speed). |
| Safety | Check-in every fourth trial with the 30-plus-60-second break structure; pausing mid-trial freezes the ball. |
| Data logged | Trial timestamps and durations; returns attempted and completed; zone kinematics and the session's assessment; compensation and wrong-arm events; scores and stars. Nothing else, and linked to a study ID only. |

### 1.4 Interesting layer

| Field | Content |
|---|---|
| Reward | Base star for the trial goal; bonuses for a high-zone reach and a pong streak; stars go to the shared locker and are spent at the hub at the end of the session. |
| Near miss | A ball inside the near-miss margin: "So close!" plus a brief paddle widening on the next return. No lost lives, stars or restarts; a lapsed streak returns the meter to zero without comment. |
| Encouragement | Personal-best cue (new high score, longest pong), the per-trial leaderboard, the affected-arm reminder. |
| Motor learning | External-focus phrasing only: "meet the ball", never "extend your elbow". |
| Narrative and style | Lakeside scene: flat fills, black outline, cream ground, one focal pong. Met star goals add stars to the hub sky; in-trial scenery constant. |
| Sound | Chime on return, warmer chime on golden ball, flourish at the star goal; everything readable with sound off. |

### 1.5 Traceability

| Mechanic | Clinical driver | Framework anchor | Study measure |
|---|---|---|---|
| Reach zones weighted lateral and low | Graded reach outside the flexor synergy | P2; CFI motion mapping | Logs: zone kinematics, attempts, completions |
| Circle-seeded difficulty and cap | Personalised entry; range inside comfort | Section 4; G6; P6 | Session completion; observational notes |
| ROM-first grading under G5 | Range extended first, surrendered last | Section 5 (G5) | Hit-rate trajectories; assessment trends |
| Affected-arm lock and reminders | Dose lands on the hemiparetic arm | P2; Section 7 | Wrong-arm events in logs |
| Per-trial leaderboard | Motivation to climb; enhanced expectancies | P9; Section 6 | IMI; PRPS; qualitative items |
| Near-miss assist | Urge preserved, frustration removed | Larche et al.; P4 | PRPS; observational notes |
| Golden-ball variable reward | Attention on the next repetition | Uncertainty element; salience | Reps per session; IMI interest |
| Star goal, locker and sky | Reps into a consumable resource; visible cumulative progress | 8.1, 8.2; P7 | Adherence and session counts; IMI |

---

## 2. What the code does today

`ArcPong` in `js/games.js` (about 880 lines), with `main.js` owning rounds, stars and difficulty. Solo mode, as it stands:

- **Paddle.** Driven by arm elevation angle (`tracker.armAngle`, 0 = arm down, 180 = overhead), not by hand position. The assessed arc (`arcMinDeg` to `arcMaxDeg`) is stretched across a walled lane whose height grows with `rangeScale`. The angle is smoothed with an adaptive One-Euro filter and holds position when tracking drops. A small translucent hand rides the paddle; no arm or body is drawn.
- **Ball.** Constant speed within a rally; the crossing time comes from the round-1 tutorial (five top-to-bottom star touches give a traversal time), then lives in `params.lifetime` for the difficulty rules to move between rounds. Vertical speed is capped so rallies stay flat.
- **Opponent.** An adversarial star with a reaction lag that can miss, a fade over time, and a scripted late "misread" that hands the participant a point in long matches. A round is a match to 5 points or about 105 seconds.
- **Skill shots.** Grip shot (squeeze to catch, open to fire) unlocked at level 2 and spin shot (palm turn) at level 3, on strong rounds.
- **Between rounds.** 1 to 3 stars from hit rate; a spoken difficulty note; every fourth round a spoken rest suggestion and a how-do-you-feel prompt; stars accumulate per patient and buy cursor, decor and creature unlocks on a collections screen.
- **Difficulty (`dda.js`).** Three dials (`rangeScale`, `radius`, `lifetime`). Hit rate above 70% harder, below 50% easier, symmetric, one round at a time; easing reduces range only when most misses were far, otherwise grows radius and lifetime. Stored per game and per arm; a session starts where the last one ended.
- **Coach.** Trunk lean, shoulder hike and rotation turn the (absent in Pong) skeleton amber, dim the world, speak a cue and log an event; three or more events hold difficulty steady.
- **Logging.** One record per round: hits, misses, hit rate, reach fraction, compensation events, best rally, points, skill shots, tutorial timing. Keyed by patient name.

---

## 3. Gap analysis

Status: **done** (matches the spec), **partial** (exists but differs), **missing**.

| Spec element | Status | What exists | What to build |
|---|---|---|---|
| Affected arm drives the paddle, other arm ignored | done | Solo reads only `state.side`; the arm is fixed at login | Nothing for the lock. Reminder below. |
| Paddle follows hand position; reach zones weighted lateral and low | missing | 1-D paddle from arm elevation on a vertical lane | Decision needed (Section 5, Q1). If zones are adopted: a 2-D paddle from `palmRel`, zone regions placed from the envelope, weighting toward low and lateral, a zone log per return. If the angle paddle stays: express zones as bands of the lane and weight serves toward the low band. |
| Placement capped at 90% of the envelope per direction (G6) | partial | Lane height is `rangeScale` (up to 100%) of the assessed arc | Cap at 0.9 and apply per direction once zones exist. |
| Initial speed from loop time, size from jitter | partial | `initialParams` seeds `lifetime` from `loopSeconds` and `radius` from `jitter`; the tutorial overrides speed on the first game only (Oct 2026), then the level moves from there | Make loop time the seed and the tutorial a refinement, or drop one. |
| 90-second trial with a star goal | partial (Oct 2026) | One 90 s game clock; the tally decides win, loss or draw; the patient's paddle burns at 90 s and the next return is the smash that ends the game; style points, bonuses, orbs and a challenge layer over it; the same game for two players | A star goal in returns set by grading; reframe win or lose if Q2 lands on the Lakebird. |
| Lakebird as a rally partner | missing | Adversarial opponent with a scripted slip | Reframe: the Lakebird keeps the ball in play and returns it into the current zone mix; misses are the participant's returns falling short, not points lost. Decision Q2. |
| Golden ball (1 in 6 to 8 returns) | missing | none | Random golden serve, brief slow-motion, double stars, confetti, warmer chime. |
| Near miss: 1.5w margin, "So close!", paddle widening that decays | missing | A miss is a point to the star | Detect contact within 1.5 paddle half-widths; play-field line; widen the paddle for the next return and decay it; no grading on assisted trials (G8). |
| Streak meter | partial | `rally` and `bestRally` counted, not drawn | A diegetic meter on the play field; a lapsed streak resets silently. |
| Personal-best cue | missing | `bestRally` logged per round | Compare against the patient's history at the moment it happens; one line on the play field. |
| Per-trial leaderboard, fake and adjusted | missing | none | Trial-result board: top three generated entries plus the participant's row, entries regenerated from their capacity so climbing is always possible. Entry generation is a tuning task. |
| Arm reminder with escalation | missing | Other-hand input is already ignored | Detect the other hand entering the play zone; body-view cue, spoken line on repeats that grows more insistent; log wrong-arm events. |
| Body view opposite the affected arm, with hike and lean feedback | partial | Coach cue exists (dim, spoken line, logged) but Pong draws no body | A body-view panel beside the play field on the side opposite `state.side`, using `drawBody`; the coach's amber segments and upright ghost live there. |
| Grading G1 to G9 | partial | 70/50 symmetric bands, one round, no near-miss ratio, ROM not last, no fast start, no session step-down, no pacing dial | Rewrite `dda.js` for Pong: success rate and near-miss ratio per trial (G1); 50 to 80 bands (G2); one-down, two-up asymmetry with fast start (G3); near-miss tiebreak (G4); ROM-first up, ROM-last down (G5); 90% cap (G6); open one step below the previous close (G7); skip assisted trials (G8); pacing dial on serve delay and return leg (G9). |
| Break check every fourth trial, 30 + 60 s structure, symptom path | partial | Spoken rest suggestion and a feel prompt every fourth round | A check-in screen with the trial result, the rest invitation, a default-first continue, a 30 s break that renews by 60 s, and a stop-for-the-day path that ends kindly. Sooner on rising compensation or a falling repetition rate. |
| 15-minute block, playlist bookend | missing | Rounds continue until the participant quits | A block clock; end at the trial boundary nearest 15 minutes; a minimal bookend screen (completion star, blocks toward four). The full playlist and hub can follow. |
| Star economy: base star plus bonuses, hub-only spending | partial | 1 to 3 stars from hit rate; a collections shop | Base star for the goal, bonus for a high-zone reach, bonus for a streak; spending moved to a session-end hub screen. |
| Hub, sky, trail, locker | missing | Collections screen only | Out of Pong's scope; needed before the star economy closes (P7). |
| Lakeside scene, flat outlined style, Lakebird | missing | Night-harbour palette, rope rigs, puzzle hero versus dark cloud | Art pass to framework 8.3: flat fills, black outline, cream ground, one focal pong; the Lakebird replaces the star. |
| Sound: return chime, golden chime, goal flourish | partial | Return and point sounds exist | Golden chime and goal flourish; confirm every cue has an on-screen twin. |
| Logging per P14 | partial | Round record with stats and compensation events, keyed by patient name | Zone kinematics per return, wrong-arm events, trial timestamps; key records by study ID rather than name. |
| Pause anytime, ball frozen | partial | Tracking loss pauses; quit button exists | An explicit pause that freezes the ball and resumes without cost. |
| Framing check | done | Welcome screen guides framing before play | Confirm the affected side's full reach is inside the frame, not just the trunk. |
| Skill shots (grip, spin) | out of spec | Level-gated grip and spin shots | Not in the specification; spin depends on palm orientation, which P3 discourages. Keep off by default (`state.pongSkills = "off"`) and list under deliberate exclusions until the clinical lead rules. |

---

## 4. Implementation plan

Ordered so each step is playable on its own and the clinical loop closes first.

1. **Trial and goal.** 90-second trials, a star goal in returns, end on the clock. Replace the 5-point match and the win-or-lose framing. Reframe the opponent as the Lakebird rally partner (pending Q2).
2. **Near miss and assist.** Margin, "So close!", paddle widening with decay, assist flag on the trial record.
3. **Golden ball and streak meter.** Random golden serves with the bonus; a diegetic streak meter; personal-best cue.
4. **Grading rewrite.** `dda.js` per G1 to G9 with Pong's dials; 90% cap; session opens one step down; pacing dial; skip assisted trials.
5. **Zones.** After Q1 is decided: zone regions from the envelope weighted low and lateral, zone kinematics in the log, high-ROM zones shown more often as grading rises.
6. **Knowledge of performance panel.** Body view beside the play field opposite the affected arm, coach cues moved there, arm reminder with escalation and logging.
7. **Trial result and leaderboard.** Result screen with stars, the compact adjusted leaderboard, and the check-in every fourth trial with the 30 + 60 s break structure and the stop path.
8. **Block clock and bookend.** 15-minute block, trial boundary rule, minimal playlist screen.
9. **Art and sound pass.** Lakeside scene in the flat outlined style, the Lakebird, chime set.
10. **Logging and identity.** Study ID as the record key, P14 field list, export.

Steps 1 to 4 make the game match the clinical rules with the current paddle. Step 5 is the largest change and depends on a decision. Steps 6 to 8 add the shared systems Pong consumes; the hub and sky are a separate piece of work.

---

## 5. Decisions needed before building

- **Q1. Paddle mapping.** The framework says the paddle follows 3-D hand position with reach zones weighted low and lateral. The current paddle is arm elevation on a vertical lane, which trains shoulder abduction and flexion cleanly and is tremor-tolerant. Options: keep the angle paddle and treat lane bands as zones; or move to a hand-position paddle on a 2-D field with true zones. The second matches the spec; the first keeps a mechanic that already works well for limited range.
- **Q2. Opponent or partner.** The spec's Lakebird keeps the pong going with the participant (cooperative, no points lost). The current star is an opponent. Cooperative is the framework's intent and removes the losing frame; the request "one arm game with the AI computer" is compatible with either.
- **Q3. Skill shots.** Keep the grip shot (binary hand close, allowed by P3) as an opt-in, drop the spin shot, or exclude both until reviewed.
- **Q4. Record key.** Move from patient name to a study ID (P14). This touches storage and the login screen.

## 6. Tuning values to bench-test (from the framework's engineering handoff)

Assist magnitude and decay; golden-ball rate; grading step sizes; near-miss multiplier; zone-mix weighting; leaderboard entry generation and adjustment; arm-reminder escalation thresholds; challenge-mode gating. Add: star goal per trial as a function of the current difficulty, and the pacing floor for G9.

## 7. Deliberate exclusions

- No lives, timers that punish, or lost progress (P4).
- No scenery that encodes performance inside a trial (P8).
- No joint-naming in gameplay text (Section 6).
- No fine-finger mechanics (P3); the spin shot stays off.
- The other five Pong modes stay unlisted until bilateral or two-player play is specified.

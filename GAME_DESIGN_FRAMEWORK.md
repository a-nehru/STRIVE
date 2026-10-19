<!-- Converted from assets/music/STRIVE_Game_Design_Framework_v4.1.docx (R. Kalvakota, v4.1 draft, 15 Sep 2026) on 21 Sep 2026. Text is verbatim; only Word formatting was dropped. The .docx stays the signed source; edit there and re-convert. -->

STRIVE Game Library

Design Framework and Game Specification Template

Self-directed upper extremity gaming for inpatient stroke rehabilitation

On participant-facing screens the system presents as STRIVE with the subtitle 'Your therapy, in play' (Section 8.4).

Version 4.1 draft

September 15, 2026

Clean copy: v4.0's tracked revisions accepted, then tightened throughout. No rules, thresholds, or fields changed. Yellow marks the two pending items.

# Contents

1.  Purpose and use

2.  Foundations

3.  Binding design principles (P1 to P14)

4.  Pre-play range-of-motion assessment

5.  Grading: when and how difficulty moves

6.  Motor learning principles across the library

7.  Encouragement during gameplay

8.  Shared library systems

9.  Worked specification: Pong

10. References

Appendix A.  Game specification template (annotated, ready to fill)

Document control and sign-off

# 1. Purpose and use

This is the design framework for the STRIVE game library. Every game is built from the same clinical rationale, graded by the same rules, and traceable from mechanic to clinical driver to outcome measurement. Games differ in theme and movement target, not in principle.

Section 3 states fourteen binding principles. Sections 4 through 8 specify the shared machinery: the assessment, the grading formula, motor learning and encouragement design, and shared systems. Section 9 applies the specification template to Pong; Appendix A is the annotated template for new titles. The reference implementation is the lead engineer's shared codebase.

# 2. Foundations

Structure. The library follows the Clinical-Function-Interesting (CFI) ordering of Zhang, Yu, and Ji (2024): clinical information first, then the mapping of movement into game rules, then the engagement layer.

Engagement. The library uses the engagement elements recurring across the rehabilitation game literature (Zhang et al.): feedback, difficulty, reward, goal, choice, uncertainty, guide, immersion. On the strongest of them it takes one fixed position: near misses drive the urge to keep playing but work through frustration (Larche, Musielak, and Dixon, 2017), so the library keeps the near miss's motivational framing and removes the punishment (P4).

Tracking. STRIVE uses the ZED stereo depth camera with the ZED body-tracking SDK, giving true 3D joint positions.

# 3. Binding design principles

Principles are the commitments every game is audited against (Appendix A.8 restates them as the review checklist); Sections 4 through 8 specify the shared systems that fulfill them. Each principle below ends with a pointer to its machinery, or states that it needs none.

P1. Clinical information leads. Design proceeds in CFI order. Interesting-layer elements sustain engagement with the Function layer, never replace it. (Rule only; no shared machinery.)

P2. Clinically relevant targets, outside the flexion synergy. Each game targets at least one clinically relevant UE movement family (reaching, shoulder abduction, grasping, object manipulation, bilateral coordination), implements adaptive difficulty and real-time feedback, and operates within the seated or semi-reclined, cord-free setup. Games preferentially recruit movement outside the flexor synergy: external rotation over internal, extension and abduction over flexion, elbow extension over flexion; a synergy-pattern movement is always paired with an out-of-synergy component (for example, targets low and to the side). In unilateral games only the affected arm plays: it is set in the participant profile, other-hand input is ignored, and reminders escalate. (Machinery: Section 7 arm reminder.)

P3. Design to the tracker. Mechanics use ZED body tracking: proximal joints, 3D hand position, at most a binary hand open or closed state, never fine finger tracking. Any hand action must have a version where holding still accomplishes the same thing. (Rule only; the assessment reads grasp capability, Section 4.)

P4. Preserve the urge, remove the punishment. Near misses get encouragement plus a brief self-decaying assist (for example, a wider paddle on the next attempt). No lives, punitive timers, lost progress, or state regression on failure, ever. (Machinery: Sections 5.0 and 7.)

P5. One channel per feedback type, and the body always in view. Every game shows the participant's tracked body beside the play field, on the side of the screen opposite the affected UE so it never overlaps the reaching arm's play space. Knowledge of performance (the movement, including hike and lean feedback) lives there; knowledge of results (the outcome) lives on the play field. The two never mix. (Machinery: Section 8.5.)

P6. Difficulty is assessed, capped, and diagnostic. Difficulty is seeded from the most recent assessment, spatial demand is capped below what was measured, and adjustment follows the grading formula. (Machinery: Sections 4 and 5.)

P7. Close the reward cycle. Trials earn stars, stars accumulate in the locker, stars are spent on unlocks that change what the hub shows (Zhang et al.'s earn-and-consume cycle). The first unlock is affordable at the end of the first session; the ladder spans multiple days. (Machinery: Section 8.1.)

P8. Restoration is strictly additive. World progress only accumulates. Nothing earned is ever lost; in-trial scenery never encodes performance; cumulative progress lives only in the hub. (Machinery: Sections 8.2 and 8.4.)

P9. Self-comparison, fake social comparison. Progress panels compare the participant with their own history; clinical gains are recognized as achievements (Section 7). High scores are posted on a leaderboard whose other entries are generated and continuously adjusted to the participant's capacity, so climbing is always possible; it is shown after each trial. An opt-in, therapist-gated challenge against a game character is the ceiling for competition. (Machinery: Section 7 leaderboard row; Section 8.2 progress panel.)

P10. Guard cognitive load. One clear objective at a time, consolidated diegetic interfaces, celebration at milestones only, scenes kept visually simple. Simplicity outranks information density in every tradeoff. (Machinery: Sections 7 and 8.3.)

P11. Audio suits a shared inpatient room. Everything is readable with sound off; feedback is chime-based; spoken lines duplicate on-screen text. The arm-reminder escalation is the sanctioned case where audio grows more insistent. (Machinery: Section 7 arm reminder; sound rows in 8.8.)

P12. Breaks, pauses, and stop rules live inside the loop. Check-ins with rest invitations ride the trial cadence, and each roughly 15-minute block ends with a substantial break at the hub. Symptom checks are surfaced at every check-in; pause, resume, and exit are always without negative repercussion. Each game is one 15-minute block (rest breaks included), with the longer break at the hub between blocks. (Machinery: Sections 8.6 and 8.7.)

P13. Every mechanic is traceable. Each specification maps every mechanic to its clinical driver, its framework anchor, and the outcome measurement that will show whether it is doing its job (for example, PRPS for an engagement mechanic, logged kinematics for a reach mechanic). A mechanic that cannot be traced is cut. (Machinery: the traceability table in every specification, A.5.)

P14. Log lean, log clean. Telemetry: timestamps, durations, attempts and completions, kinematics (including assessment, compensation, and wrong-arm events), and scores, linked to a study ID only. No video, audio, images, or identifiers, ever. (Rule only; each specification's data-logged field applies it.)

# 4. Pre-play range-of-motion assessment

Fulfills P6 (difficulty is assessed and capped); read with Section 5.

A 3-D range-of-motion assessment is completed once (or less) at the start of a session, before the playlist begins; its output is the session's grading baseline, and grading always seeds from the most recent assessment on record (P6). How often it is truly needed is an open decision [DECISION PENDING: assessment frequency]. The assessment is system-administered, with no clinician measurement: over the mirrored camera feed with the participant's own tracked skeleton, the participant traces the biggest circle they can comfortably reach with the chosen arm, guided by a firefly, then holds three brief reach points that record grasp capability and stability. The painted circle is the readout, and the whole sequence is presented as a warm-up ritual, not a test.

### 4.1 What it measures and what each output drives

| Output | What it is | What it drives in grading (Pong example) |
|---|---|---|
| Reach assessment (16 directions) | Maximum comfortable radial reach per direction, in shoulder-width units. Unreached directions keep a conservative floor; the measured fraction is recorded honestly. | The session's spatial bounds: no required target beyond 90% of the assessment in its direction (G6). |
| Elevation arc | Minimum and maximum arm elevation relative to the trunk during the trace. | Vertical target placement bounds. |
| Path jitter | Steadiness of the traced path. | Initial target and paddle size. |
| Loop time | Speed of the trace, from total swept angle so boundary wobble cannot inflate it. | Initial object speed. |
| Grasp/release and stability | Dwell-based holds at three positions; a true hand-close is recorded as a squeeze. | Whether grasp-flavored goals are offered this session; dwell fallback otherwise. |

### 4.2 Conduct rules

Prompts are neutral ('draw the biggest circle you can, big and slow') and stop rules apply exactly as in play. Tracking loss freezes the timer, and if the participant shifts or settles, the frame re-baselines rather than distorting the geometry.

Posture differs from gameplay. Before the trace, the participant is asked to sit tall with the trunk still, and the coach makes any deviation immediately obvious on the body view. In step 1 the participant completes the assessment free form, as practice; in step 2, where compensation is detected the participant is prompted to reattempt without it (these two steps may or may not be included in the final version of STRIVE). Where compensation is very pronounced through part of the arc, that part is excluded from the ROM calculation, so the assessment reflects arm movement, not trunk movement. During gameplay, by contrast, compensation is cued but repetitions still count (Section 7).

The ROM-improvement moment lives here: when a direction of today's circle exceeds the previous best, a gentle chime and one line ('You reached farther than ever today.') appear once on the assessment-complete screen, and the quiet reach-arc display in the hub updates.

Each assessment is stored as kinematic data with the session record; across sessions it doubles as the hub's reach-arc trend display.

# 5. Grading: when and how difficulty moves

Fulfills P6; the near-miss definition (5.0) serves P4.

The session's assessment sets the bounds; performance moves parameters within them. These rules are library-wide; each game adds only its own parameter translations. The priority: many repetitions at the right level of challenge. Grading holds success in band and does not waste repetition opportunities while the participant is fresh (G9); fatigue is answered with rest, not demand (Section 8.6).

### 5.0 Defining a near miss

A near miss is a failed attempt close enough to success that the participant perceives it as almost successful. Near misses are the strongest driver of the urge to continue (Larche et al.), so the library detects them and answers with encouragement plus assist (P4). Because the classification also feeds G4, the threshold is a tuning parameter, not a cosmetic one.

Library rule: a miss is near when it falls within a margin just outside the success tolerance, and the margin scales with current difficulty so the near-miss share stays stable as targets shrink. Each game states its margin and multiplier. Pong example: with paddle half-width w, contact within w is a hit, a miss between w and about 1.5w is near, beyond is a clear miss.

### 5.1 The rules

| Rule | Statement |
|---|---|
| G1 | Per trial, compute success rate S (successes / attempts) and near-miss ratio N (near misses / all misses; see 5.0). |
| G2 | Bands: S below 50%, grade down; 50 to 80%, hold; above 80%, grade up. (Lower threshold per Cameirao and colleagues via Zhang et al.; the 80% upper threshold follows [REFERENCE TO BE ADDED: source study for the 80% threshold].) |
| G3 | Asymmetry: grade down after one trial below band; grade up only after two consecutive trials above. Fast start: for a game's first two trials, both directions trigger on a single trial with doubled steps; normal asymmetry resumes once success first lands in band. |
| G4 | Near-miss tiebreaker: if S is below 50% but at least half the misses are near misses, hold one more trial; the participant is on the cusp. An over-wide margin would hold difficulty for someone who needs easing, so margins are set narrow (5.0). |
| G5 | ROM increase is always the clinical priority of the games, including achieving higher ROM more and more frequently. Grading up extends ROM demand first (target distance and height toward the G6 cap) and shows high-ROM targets more often; grading down eases speed and target size first and reduces ROM demand only last. |
| G6 | ROM cap: no required target beyond 90% of the session's measured assessment in its direction, at any difficulty. |
| G7 | Session start: one step below the previous session's ending difficulty for that game, within the most recent assessment's bounds. The first trial is a warm-up. |
| G8 | Grading is evaluated only on trials without an active near-miss assist, so the two systems never stack or fight. |
| G9 | Acceleration: when success is comfortable but repetition rate is low and stable, pacing tightens one step. Pacing is the dead time around each attempt (serve delay, the companion's return leg, pauses between trials), never the ball's speed, and it never tightens past the time needed to reset position. A falling rate is fatigue, not a cue to accelerate (Section 8.6), and repetition rate is never raised at the cost of leaving the success band. |

### 5.2 Gradable parameter families

| Family | Pong dials (example) | Grades down by | Grades up by |
|---|---|---|---|
| Spatial (ROM) | Reach-zone distance, height, lateral spread | Zones nearer and lower (last, per G5) | Zones toward the 90% cap (first, per G5); high-ROM zones more often |
| Temporal | Ball speed, return window | Slower ball, longer window (first, per G5) | Faster ball, tighter pacing |
| Precision | Paddle size, ball size | Larger paddle and ball | Smaller paddle and ball |
| Volume | Reps completed | Lower goal | Higher goal; tighter pacing under G9 |
| Assist | Paddle widening, snap tolerance | Not a difficulty dial: assists respond to near misses and decay on their own (G8) | n/a |

# 6. Motor learning principles across the library

The library's motor learning case rests on two spines: the plasticity principles of Kleim and Jones (2008) and the OPTIMAL theory (Wulf and Lewthwaite, 2016): autonomy support, enhanced expectancies, and an external focus of attention. The table makes the embedding explicit so reviewers can check that a new game does not break it.

| Principle | Source | Where it lives in every game |
|---|---|---|
| Repetition and intensity | Kleim and Jones | Short trials with high attempt density; the volume grading; sessions during otherwise unused hours. |
| Specificity | Kleim and Jones | Motion mapping mirrors the trained movement: reaching drives reaching mechanics. |
| Salience | Kleim and Jones | Narrative meaning (stars restored), awards the participant chose, and functional gains pointed out with the knowledge the primary OT will also be made aware. |
| Use it and improve it, progressively | Kleim and Jones | Practice stays at the edge without tipping over it. |
| Autonomy support | OPTIMAL | Choice of star spending, the challenge opt-in, exit or pause anytime without penalty. |
| Enhanced expectancies | OPTIMAL | Success-biased bands, encouragement after a near miss (P4), milestone celebration, personal-best cues, and a leaderboard the participant can always climb (P9). |
| External focus of attention | OPTIMAL | Participant-facing language names game objects ('meet the ball'), never joints ('extend your elbow' is banned in gameplay text). Exceptions: the posture coach's visual cues and the affected-arm reminders (Section 7), body-referenced by design. |
| Feedback structure | Zhang et al. | KP on the body view; KR (points, stars, records such as consecutive days, fewer breaks, more reps) on the play field (P5). Clinical gains are shown separately (Section 7). |

# 7. Encouragement during gameplay

Fulfills the participant-facing halves of P2 (arm reminder), P4 (near-miss response), P9 (leaderboard), P10 (celebration caps), and P11 (audio rules).

| Type | Trigger | Channel | Example | Cap |
|---|---|---|---|---|
| Positioning cue (corrective) | Shoulder hike or trunk lean over threshold (rotation and tilt handled the same way) | Body view: amber segment, upright ghost showing the correction | Sit tall, reach with your arm. | One cue |
| Arm reminder (unilateral games) | The unaffected hand enters the play zone or starts controlling | Body view cue; wrong-arm input is ignored and play never pauses; on repeats a spoken line joins and grows more insistent, duplicating on-screen text | Let's give your left arm this one. | Cue each occurrence; audio after repeats; events logged |
| Personal best | New high score, longest pong | Play field | New personal best! | At the moment it happens |
| Leaderboard | Each trial's result | Trial-result screen: compact board (top three plus the participant's row) ranking high scores; entries adjusted to capacity (P9) | You're climbing! | Every trial result; compact per P10 |
| Near-miss encouragement | A near miss | Play field | So close! (with the assist) | Every near miss; brief |
| ROM improvement in assessment | A direction of today's circle exceeds the previous best | Assessment-complete screen (4.2); quiet reach-arc display in the hub | You reached farther than ever today. | Chime once, after the ROM assessment |
| Session goal | All four blocks completed | Playlist screen | All four blocks. What a session! | Once per day |
| Clinical achievement | A measured gain: new ROM in a direction, more reps, better accuracy or smoothness, more consecutive days, fewer breaks | Hub achievement screen with bolder stars, a special star in the sky (8.2), and an email to the primary OT stating the gain | You reached farther today than any day so far. Your OT will hear about it. | When it happens; one screen per gain, never mid-trial |
| Rest affirmation | Choosing a break or stop | Break screen | Good call. Rest is part of training. | Every time; never met with disappointment |

The participant is told the OT will be informed of clinical achievements; knowing a gain is seen is part of its motivational value.

### Compensation policy

Compensation events are recorded with the session's kinematics for clinical review, and the coach responds as above. Points, stars, and records are never reduced because a repetition was compensated: a rep is a rep, and the record shows how it was done.

# 8. Shared library systems

## 8.1 Star economy and locker

Fulfills P7.

Trials earn stars (base star for the trial goal, bonuses for a streak or a high reach); stars accumulate in one locker across all games; stars are spent on unlocks that change what the hub shows (sky light-bringers and other hub items; unlocks do not change in-game content). The locker is a hub screen: the balance is visible anytime, but spending happens only at the end of the four blocks, as part of closing the session. The first unlock is affordable after the first session; the ladder spans multiple days.

## 8.2 Hub, trail, and the sky

Fulfills P8 and the self-comparison half of P9.

The hub holds the locker, the trail of session milestones, the self-comparison progress panel, the reach-arc display (Section 7), and the sky; the daily playlist (8.7) is the session-level view alongside it.

The sky is the hub's background and the participant's cumulative record across their whole time with STRIVE: a night sky that only ever gains more, and more beautiful, stars, never a number or a checklist. Every session adds stars; clinical achievements add special stars, distinct in brightness or shape. No session, gap, or hard day ever removes one.

## 8.3 Visual style

Simple, outlined cartoon: flat solid fills, confident black outline, warm off-white ground. Characters are simple silhouettes with expressive dot-and-line faces (reference set: the Quirky Crew lineup). Few scene elements, generous empty ground, one focal action at a time; whimsy from character shape, gentle humor, and hand-drawn motion effects (an outlined 'whoosh'), not clutter, gradients, or saturation. Warm and whimsical without being childish. The clinical lead's August 2026 reference images are the visual authority and supersede the earlier gouache direction.

## 8.4 Starlonia (narrative)

Fulfills P8 (additive restoration) and carries the guide element.

The stars over Starlonia give the village its small magics. A gang of dark clouds and their leader (the sleepy, grumpy raincloud characters of the Quirky Crew, gentle rather than villainous) have covered the night sky, and the village has dimmed. Play uncovers the stars, and star-spending buys light-bringers (lanterns, fireflies, the Lakebird's glow) that push the clouds back. The stars were covered, never lost: the sky is a fixed treasure being revealed, and a cleared patch stays clear (P8). The tone stays warm and slightly comic; the clouds are an obstacle, not a threat. Story wraps the trial goals and carries each game's how-to in-world.

Naming: the system presents as STRIVE with the persistent subtitle 'Your therapy, in play' on the title and playlist screens, so participants know the games are therapy; knowing the work counts is itself motivating. Starlonia remains the world name (under review), with 'strive' embedded rather than foregrounded.

## 8.5 Body view and posture coach

Fulfills P5.

Every game shows the participant's tracked figure beside the play field, on the side opposite the affected UE (P5). It is the KP channel and the home of the posture coach and the affected-arm reminders (cue design in Section 7), plus the session-start framing check. It carries no outcome feedback; coach sensitivity (gentle, strict, off) is set at setup.

## 8.6 Break checks

Fulfills P12, with Section 8.7.

Trials run about 90 seconds. Every fourth trial (about six minutes of play) there is a check-in with an explicit rest invitation, and it comes sooner if compensation increases noticeably or repetition rate falls while success stays in band; either reads as fatigue. The check-in shows the trial result, a warm invitation ('This is a lovely moment for a short rest.'), a default-first continue, and a symptom path that ends the session kindly ('Let's stop here for today and rest that arm.').

Break structure: after 30 seconds, the screen offers resume now or rest another 60 seconds, renewable as long as wanted; stopping for the day is on every break screen. Resuming is never rushed or framed as overdue.

Blocks: a game occupies one block, trials continuing (breaks included in the clock) until the trial boundary nearest the 15-minute mark, typically about eight trials across two check-in cycles. The block ends at the hub, where the substantial break is offered before the next game (8.7). Four blocks make the session; the last block may be cut short or extended so the session completes at the four-block mark.

Pause and resume: play can be paused at any moment, from anywhere, at no cost. Playlist state persists; reopening, even hours later, resumes at the next incomplete game with stars and time intact.

## 8.7 Daily playlist and the four-block session

Fulfills P12, with Section 8.6.

Each day's play is a playlist: four 15-minute blocks, one game per block, assembled at session start after the assessment. The playlist screen bookends every block; completed blocks carry a completion star, and a block hands off to the next through that screen after the hub break. The playlist carries a blocks-completed indicator toward the daily four, framed as a goal being filled, never a countdown; completing it is celebrated (Section 7). Completion marks and time are additive within the day (P8), and leaving early costs nothing. The playlist shows the star balance with a pointer to the locker; spending unlocks at the end of the fourth block (8.1). Structural reference: the clinical lead's playlist screenshot (August 2026) defines the structure; the visual treatment follows 8.3.

## 8.8 What the participant sees where: assessment, game, hub

Every on-screen element, by surface, so a reviewer can check that each surface shows only what it should. 'Not shown' is deliberate.

| Element | Assessment (Section 4) | Game (Sections 5 to 8) | Hub (Section 8.2) |
|---|---|---|---|
| Body view (P5, 8.5) | Mirrored camera feed with tracked skeleton, full screen | Tracked figure beside the play field, opposite the affected UE | Not shown |
| Posture feedback (Section 7, 4.2) | Correct posture requested; deviation made obvious; two-step reattempt flow under evaluation; very pronounced compensated arc excluded from ROM | Coach cue for hikes and leans; reps still count | Not shown |
| Arm reminder (Section 7) | Not shown | Unilateral games: wrong-arm input ignored; cue, audio on repeats | Not shown |
| Circle trace (4.1) | Firefly guide; painted circle as readout; three reach-and-hold points; ROM-improvement chime on completion | Not shown | Reach-arc trend display |
| Play field (Section 9 example) | Not shown | Targets, paddle, ball, golden events; scenery constant regardless of performance | Not shown |
| Trial goal and KR (P5, P10) | Not shown | One objective at a time (the star goal); returns, streak meter, trial result with stars | Not shown |
| Near-miss response (P4, 5.0) | Not shown | 'So close!' plus a brief self-decaying assist | Not shown |
| Leaderboard (P9, Section 7) | Not shown | Compact board on each trial result: top three plus the participant's row, entries adjusted to capacity | Not shown |
| Personal best (Section 7) | Not shown | Play field cue at the moment it happens | Self-comparison progress panel |
| Clinical achievement (Section 7) | Not shown | Not shown mid-game; recognized at the hub | Hub achievement screen with bolder stars; special star in the sky; OT notified |
| ROM improvement (Section 7, 4.2) | Detected here; chime and line once, on completion | Not shown | Reach-arc display; special star if it qualifies as a clinical achievement |
| Stars and locker (8.1) | Not shown | Stars earned shown in the trial result | Locker balance and unlocks; spending opens at the end of the fourth block |
| Sky (8.2, 8.4) | Not shown | Not shown in-trial; met star goals add stars to the hub sky | Persistent additive background; special stars for clinical achievements; never a number |
| Playlist screen (8.7) | Shown after the assessment as the day's lineup | Bookends every block: completion stars, next-up, blocks-completed indicator toward four | Session-level view alongside the hub |
| Break checks (8.6) | Stop rules apply; timers freeze on tracking loss | Check-in every fourth trial, sooner on fatigue; 30-plus-60-second break structure | The substantial between-block break lives here |
| Rest affirmation (Section 7) | Not shown | Break screen, every time rest or stop is chosen | Not shown |
| Session goal (Section 7) | Not shown | Playlist screen when the fourth block completes | Trail milestone |
| Pause and resume (P12, 8.7) | Interruptions re-baseline the frame | Pause anytime; resume at the next incomplete game | Resume entry point |
| Trail (8.2) | Not shown | Not shown | Shown |
| Story and how-to (8.4) | Framed as the warm-up circle | Trial goals wrapped in Starlonia; how-to in-world; subtitle 'Your therapy, in play' on title and playlist screens | Starlonia premise and world state |
| Sound (P11) | Neutral prompts; readable with sound off | Chimes; arm-reminder audio escalates on repeats, duplicating on-screen text | Ambient at most |

# 9. Worked specification: Pong

### 9.1 Identification

| Field | Content |
|---|---|
| Name and premise | Pong: a reimagined Pong. Keep the pong going with the Lakebird by reaching to meet the ball; every good pong returns stars to the Starlonia sky. |
| Version, date, authors | Spec v4.1, September 15, 2026. Aravind. |
| Implementation status | Specified against the shared codebase. |
| Shared systems consumed | Star economy, hub and sky, Starlonia, body view and coach, break checks, playlist. |

### 9.2 Clinical layer

| Field | Content |
|---|---|
| Population and stage goal | Adults in inpatient stroke rehabilitation with moderate UE impairment, stable for seated or semi-reclined activity. Stage goal: high-repetition, task-specific proximal practice during non-therapy hours. Out-of-synergy recruitment through zone placement: targets low and to the affected side draw abduction and extension, far targets draw elbow extension; high-forward (flexion) targets never dominate the mix. |
| Motion features | Reach direction (weighted lateral and low), reach amplitude (within the measured assessment), transport speed. No hold demand. |
| Tracking basis | ZED body tracking; the paddle follows 3D hand position. Unilateral: the affected arm (from the profile) drives the paddle; other-hand input is ignored, with escalating reminders per Section 7. |
| Assessment use | Assessment bounds zone placement per direction (G6 cap at 90%); jitter sets initial paddle and ball size; loop time sets initial ball speed. Grasp outputs unused. |
| State assessment | Shared break checks (8.6). |
| Positioning notes | Standard setup; the framing check confirms the affected side's full reach is in view. |

### 9.3 Function layer

| Field | Content |
|---|---|
| Motion mapping | Hand position maps to paddle position; reach zones are regions of the play space, weighted per the stage goal (exact weighting a tuning value). All placement respects the calibrated assessment. |
| Goal and gameplay | One goal per trial: reach the trial's star goal by returning rallies with the Lakebird. Uncertainty: golden balls (about 1 in 6 to 8 returns) trigger a bonus (brief slow motion, double stars, confetti). |
| Duration and blocks | Trials of about 90 seconds; check-in with rest invitation every fourth trial; the game fills one 15-minute block, ending at the trial boundary nearest the mark (8.6). Pong's card shows on the playlist bookend, earns its completion star, and hands off through the hub break. Pause anytime. |
| Feedback: KP and KR | KP: body view, opposite the affected UE, with hike and lean feedback. KR: play field (returns, streak meter, near-miss framing, trial result with the compact leaderboard). Never mixed. |
| Grading plan | Rules G1 to G9 apply. Near-miss margin: about 1.5 times the paddle half-width, multiplier to be tuned. Per G5, grading up extends zones toward the cap and shows high-ROM zones more often; grading down slows the ball, then enlarges paddle and ball, and reduces zone demand last. Fast start per G3; session opens one step below the previous close (G7); pacing may tighten under G9 (shorter serve delay and Lakebird return leg, ball speed untouched). |
| Safety integration | Check-in every fourth trial with the rest invitation and break structure (8.6); pausing mid-trial freezes the ball. |
| Data logged | Trial timestamps and durations; returns attempted and completed; zone kinematics and the session's assessment; compensation and wrong-arm events; scores and stars. Nothing else. |

### 9.4 Interesting layer

| Field | Content |
|---|---|
| Reward mechanism | Base star for the trial goal; bonuses for a high-zone reach and a pong streak; stars to the shared locker, spent in the hub on hub-visible unlocks at the end of the four blocks (8.1). |
| Near-miss design | A ball inside the near-miss margin (5.0): 'So close!' plus a brief paddle widening on the next return. No lost lives, stars, or restarts; a lapsed streak returns the meter to zero without comment. |
| Encouragement plan | Section 7 applies in full; Pong-specific: personal-best cue (new high score, longest pong), the per-trial leaderboard, and the affected-arm reminder. |
| Motor learning mapping | Section 6 holds; Pong-specific external-focus phrasing: 'meet the ball', never 'extend your elbow'. |
| Narrative and style | Lakeside scene in the shared style: flat fills, black outline, cream ground, one focal pong. Met star goals add stars to the hub sky; in-trial scenery constant. |
| Sound | Chime on return, warmer chime on golden ball, flourish at the star goal; readable with sound off. |

### 9.5 Traceability

| Mechanic | Clinical driver | Framework anchor | Study measure |
|---|---|---|---|
| Reach zones weighted lateral and low | Graded reach outside the flexor synergy | P2; CFI motion mapping | Logs: zone kinematics, attempts, completions |
| Circle-seeded difficulty and cap | Personalized entry; range inside comfort | Section 4; G6; P6 | Session completion; observational notes |
| ROM-first grading under G5 | Range extended first, surrendered last, as the dose | Section 5 (G5) | Hit-rate trajectories; assessment trends |
| Affected-arm lock and reminders | Training dose lands on the hemiparetic arm | P2; Section 7 | Wrong-arm events in logs |
| Per-trial leaderboard | Motivation to climb; enhanced expectancies | P9; Section 6 | IMI; PRPS; qualitative items |
| Near-miss assist | Urge preserved, frustration removed | Larche et al.; P4 | PRPS; observational notes; qualitative items |
| Golden-ball variable reward | Attention on the next repetition | Uncertainty element; salience | Reps per session; IMI interest |
| Star goal, locker, and sky | Reps into a consumable resource; visible cumulative progress | 8.1, 8.2; P7 | Adherence and session counts; IMI |

Engineering handoff (tuning): assist magnitude and decay, golden-ball rate, step sizes, near-miss multiplier, zone-mix weighting, leaderboard entry generation and adjustment, arm-reminder escalation thresholds, challenge-mode gating.

# 10. References

1. Zhang C, Yu S, Ji J. CFI: a VR motor rehabilitation serious game design framework integrating rehabilitation function and game design principles with an upper limb case. Journal of NeuroEngineering and Rehabilitation. 2024;21:113.

2. Larche CJ, Musielak N, Dixon MJ. The Candy Crush sweet tooth: how 'near-misses' in Candy Crush increase frustration, and the urge to continue gameplay. Journal of Gambling Studies. 2017;33(2):599-615.

3. Kleim JA, Jones TA. Principles of experience-dependent neural plasticity: implications for rehabilitation after brain damage. Journal of Speech, Language, and Hearing Research. 2008;51(1):S225-S239.

4. Wulf G, Lewthwaite R. Optimizing performance through intrinsic motivation and attention for learning: the OPTIMAL theory of motor learning. Psychonomic Bulletin and Review. 2016;23(5):1382-1414.

5. Cameirao MS, Bermudez i Badia S, Duarte Oller E, Verschure PFMJ. Neurorehabilitation using the virtual reality based rehabilitation gaming system. Journal of NeuroEngineering and Rehabilitation. 2010;7 (as cited in Zhang et al., 2024, for the lower difficulty band).

6. [REFERENCE TO BE ADDED: source study for the 80% upper grading threshold (G2)]

7. STRIVE Game Library GDD v0.2 and Design Framework v1.0 to v4.0 (internal design documents), STRIVE study team.

# Appendix A. Game specification template

Copy for each new title and write over the gray prompts. A specification is complete when every field is filled or marked not applicable with a reason. Section 9 shows a completed example.

### A.1 Identification

| Field | Content |
|---|---|
| Name and premise | Working title plus one sentence a participant could understand. |
| Version, date, authors | Specification version, not build version. |
| Implementation status | Concept, specified, prototyped, or deployed; target modules in the shared codebase. |
| Shared systems consumed | Which Section 8 systems the game uses. |

### A.2 Clinical layer

| Field | Content |
|---|---|
| Population and stage goal | Participant group; practice goal (movement families, dose pattern); out-of-synergy recruitment (P2); unilateral (arm lock applies) or bilateral. |
| Motion features | Trained movements as designable indicators: plane, direction, range band, hold or transport demand. |
| Tracking basis and fallback | ZED signals used; no fine-finger dependence; dwell fallback for any hand action (P3). |
| Assessment use | Which circle outputs seed this game and how (4.1). |
| State assessment | How break checks surface (8.6). |
| Positioning notes | Camera framing and reach needs beyond the standard setup. |

### A.3 Function layer

| Field | Content |
|---|---|
| Motion mapping | Which movements affect the game world and how; the reachable assessment stated explicitly. |
| Goal and gameplay | The trial objective (one goal at a time), the core loop, the uncertainty element. |
| Duration and blocks | Trial length (about 90 seconds), how the game fills its 15-minute block, playlist position, exit and pause anytime (8.6, 8.7). |
| Feedback: KP and KR | Body view always present, opposite the affected UE, with hike and lean feedback (8.5); game-specific overlays; what the play field shows. |
| Grading plan | Initial values from the assessment seed; parameter translations per family; near-miss margin and multiplier; the G6 cap; the G5 up and down order; G9 pacing dials. |
| Safety integration | Where break checks and stop rules interrupt the loop. |
| Data logged | Events written, within the P14 categories. |

### A.4 Interesting layer

| Field | Content |
|---|---|
| Reward mechanism | Earn rules, bonuses, and what the game adds to the hub unlock ladder (8.1). |
| Near-miss design | Detection, framing, the assist; what does not happen (P4, 5.0). |
| Encouragement plan | Game-specific instances of the Section 7 taxonomy, with caps. |
| Motor learning mapping | Confirmation the Section 6 table holds; external-focus phrasing. |
| Narrative and style | Role in Starlonia; scene notes in the shared style (8.3, 8.4). |
| Sound | Chime set; sound-off readability. |

### A.5 Traceability table

One row per game-specific mechanic: mechanic; clinical driver; framework anchor; study measure. Library-wide systems are traced once in Section 8.

| Mechanic | Clinical driver | Framework anchor | Study measure |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

### A.6 Deliberate exclusions

What the game intentionally does not contain, with the excluding principle.

### A.7 Open questions for engineering

Tuning values, thresholds, and behaviors needing bench testing.

### A.8 Conformance checklist

| No. | Principle | Pass / NA | Evidence or note |
|---|---|---|---|
| 1 | Clinical information leads |  |  |
| 2 | Clinically relevant targets, outside the flexion synergy; affected-arm lock in unilateral games |  |  |
| 3 | Design to the tracker (fallback named) |  |  |
| 4 | Preserve the urge, remove the punishment |  |  |
| 5 | One channel per feedback type; body view present, opposite the affected UE |  |  |
| 6 | Difficulty is assessed, capped, and diagnostic |  |  |
| 7 | Close the reward cycle |  |  |
| 8 | Restoration is strictly additive |  |  |
| 9 | Self-comparison, fake social comparison (adjustable leaderboard) |  |  |
| 10 | Guard cognitive load |  |  |
| 11 | Audio suits a shared inpatient room |  |  |
| 12 | Breaks, pauses, and stop rules live inside the loop |  |  |
| 13 | Every mechanic is traceable |  |  |
| 14 | Log lean, log clean |  |  |

Review: the clinical lead confirms clinical rows; the lead engineer confirms technical rows. A specification passes when every row is Pass or a justified NA.

# Document control and sign-off

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 to 3.2 | Aug 2026 | R. Kalvakota, OTD, OTR/L | Framework, template, worked specification, clinical review, redundancy pass |
| 4.0 draft | Sept 15, 2026 | R. Kalvakota; drafted with Claude | Clinical review accepted: 90-second trials, four 15-minute blocks, leaderboard, hub-only unlocks with end-of-session spending, affected-arm enforcement, grading G1 to G9 with ROM-first G5 and acceleration G9, assessment frequency pending, body view opposite the affected UE, subtitle adopted |
| 4.1 draft | Sept 15, 2026 | R. Kalvakota; drafted with Claude | v4.0 revisions accepted; tightened throughout at reviewer register; no rules, thresholds, or fields changed; two yellow placeholders remain (80% reference, assessment frequency) |

| Role | Name | Signature | Date |
|---|---|---|---|
| Scientific Lead | Milap Sandhu, PT, PhD |  |  |
| Clinical Lead (author) | Rachel Kalvakota, OTD, OTR/L |  |  |
| Lead Engineer | Aravind Nehrujee, PhD |  |  |
| Clinical Co-Investigator | Brenna Bigenwald, OTR/L |  |  |

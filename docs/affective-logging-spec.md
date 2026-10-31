# STRIVE affective logging spec (proposal)

Status: **proposal for discussion, not implemented.** Written 30 Oct 2026 from an audit of the current code (file:line references are to the tree at commit 3b2417b).

Purpose: log enough, with enough timing, that fatigue and engagement can later be *derived from gameplay data alone* (no extra sensors), in line with the gap named by Beristain-Colorado et al. 2026, "Affective Computing in Serious Games for Physical Rehabilitation: Scoping Review" (JMIR Rehabil Assist Technol 13:e81344, doi:10.2196/81344, published 2 July 2026): of 9 included studies, engagement, tiredness and pain were the most detected states (4 of 9 each), facial expression and gesture recognition the commonest methods, only 2 adapted gameplay to affect, and none showed that affective computing improves rehabilitation outcomes. Inferring state from gameplay behaviour alone is the under-explored route. Nothing here adapts the game; adaptation rules (section 6) are for later, behind a flag that defaults to OFF.

Binding rules this spec must keep (GAME_DESIGN_FRAMEWORK.md): **P14** log lean, log clean (timestamps, durations, attempts, kinematics, scores, linked to a study ID only; no video, audio, images or identifiers, ever), **P4** no punishment, **P12** breaks without repercussion, **P13** every logged field traceable to a question.

---

## 1. What is logged today (audit summary)

| Layer | Today | Where |
|---|---|---|
| Storage | One localStorage JSON blob `rehabsuite-v1`, keyed by the participant's **typed name**; whole store rewritten on every save; a quota error is swallowed with `console.warn` | storage.js:4-12 |
| Session | **No session object or id.** `lastLogin` overwritten each login; no logout/end event; plan block not tagged on rounds | storage.js:57, main.js:1278 |
| Round | One record per round (cap 400): `date` (ISO, end of round), `game`, `arm`, `seconds` (pauses excluded), `params{rangeScale, radius, lifetime}`, `hits`, `misses`, `missFar`, `hitRate`, `compEvents[]`, `day`, plus per-game `extra()` | engine.js:354-368, main.js:2079-2141 |
| Trial | **Lantern only**: `trials[]` with `rt`, `mt`, `eff` (path efficiency), `peak` speed, `holdBreaks`, `outcome`, `returnTime`, ... but **no timestamps** (the absolute `tPickup/tLeave/tEnter/tEnd` are computed and dropped) | games.js:5235-5243 |
| Events | Hit/miss are counters only, **never timestamped**, in every game. Pong keeps per-game totals; Windy keeps none | engine.js:417-440 |
| Kinematics | **Nothing per-frame is stored.** No smoothness/jerk anywhere. Pong `meanReachFrac` is a constant 0.7; Pong/Windy lanes are grow-only, not "range used" | games.js (Pong hit), tracker.js |
| Behaviour | Pauses (user, tracking-lost, relocation) are summed into `pausedMs` but **count and duration are not stored**; idle time not stored; **a round quit with ✕ is discarded entirely**; card actions (Play again / Change game / Finish) not recorded; rest prompts and spoken coach lines not stored | engine.js:249-319, main.js:2968 |
| Compensation | `{type, at, durationMs}` pushed **on recovery only**; no magnitude; an alert still open at round end is lost | coach.js:41-70 |
| Self-report | Round card "How does your arm feel?": `fine` / `tired` / `hurts`, optional, attached to the *last saved* round (misattributed after a practice round) | storage.js:148-157 |
| Assessment | Rich per-day profile (envelope, coverage, lift, 5 targets with time to reach and hold stability, video move peaks), history of 24 per arm (a subset of fields) | assessment.js:1327-1378 |
| Sampling | Webcam: pose on every `requestAnimationFrame` (about 60 Hz on a 30 fps camera, so duplicate frames), hand model every 2nd rAF. ZED: 15 fps, SSE messages carry **no capture timestamp** (stamped on arrival with `performance.now()`) | tracker.js:496-522, zed_bridge.py |
| Raw recordings | Only the standalone tools (`model_lab.py` log.jsonl, `zed_track.py --log` CSV), camera-exclusive, unsynchronised with play, no participant/session context | tools/ |
| Identity | Names in the store, in backup files, snapshot file names, and emails sent through the mail relay; contact emails and partner names in exports | storage.js:14, mail.js, mail_bridge.py |

Data-quality quirks to fix whatever else is decided: `params.radius` already includes the accessibility scale (main.js:2004); Pong `gameSeconds` is the last game only; Windy's "show both hands" freeze is counted as play time; `round.next` / `round.lvl` are set after `logRound` and so never saved; practice rounds add play time but no round.

---

## 2. Design

### 2.1 Three record levels plus an optional stream

1. **Session** (one per login-to-finish): who (study ID), when, device, camera, settings, self-report at start and end, how it ended.
2. **Trial** (one per discrete attempt, defined per game in 2.4): timing, outcome, kinematic summary, difficulty in force.
3. **Event** (append-only, timestamped): everything that happens between and around trials (pauses, idle, coach cues, compensation, difficulty changes, card actions, self-report, tracking quality).
4. **Kinematic stream** (optional, research mode only, default OFF): the hand and trunk landmarks at the camera's own rate, so indicators can be recomputed later with a different definition.

Levels 1 to 3 are always on once the feature ships (they are small). Level 4 is a per-device staff setting because of its size (about 1.5 to 2.5 MB per 15-minute block at 30 Hz).

### 2.2 Identifiers and time

| Field | Rule |
|---|---|
| `studyId` | Pseudonymous, staff-assigned (for example `MS-014`), entered once per participant. Never the typed name. The name-to-studyId key lives off the logging store (on paper or in the study's REDCap), not in the export. |
| `sessionId`, `blockId`, `roundId`, `trialId` | `crypto.randomUUID()`; `trialId` may be `roundId` + ordinal. Every record carries every parent id, so any file can be joined without the others. |
| `t` | **Milliseconds since session start**, from `performance.now()` (monotonic, immune to clock changes). Every event and every trial timing field uses it. |
| `wallStart` | ISO 8601 with the UTC offset, once, on the session record. Wall time of any event = `wallStart + t`. |
| `schema` | Integer schema version on every record (`1` to start). |
| Camera time | Each pose sample carries the **capture** time where the source gives one: the ZED bridge should add `body_ns` (already read at zed_bridge.py, not sent); the webcam path should move to `requestVideoFrameCallback`, which gives the frame's capture time and removes the duplicate-frame problem. |

### 2.3 Session record

```json
{
  "schema": 1, "kind": "session",
  "sessionId": "…", "studyId": "MS-014", "arm": "right",
  "wallStart": "2026-11-03T10:02:11-06:00", "tEnd": 2741000,
  "endReason": "finish | change_user | closed | timeout | crash",
  "device": {"camera": "zed | webcam", "cameraRes": "2208x1242", "fps": 15,
             "handModel": "mediapipe-stereo", "app": "v98", "screen": "1920x1080"},
  "settings": {"dwellMs": 1400, "radiusScale": 1.0, "calmMotion": false,
               "practice": false, "coachSens": "gentle", "adaptive": "off"},
  "plan": [{"blockId": "…", "game": "pong", "axis": "fe", "minutes": 15}],
  "selfReport": {"start": {"fatigue": 3, "pain": 1}, "end": {"fatigue": 6, "pain": 1, "enjoyment": 8}},
  "assessmentToday": "profile date or null"
}
```

### 2.4 Trial definitions per game

A trial has to be a repeatable unit of the same movement, or within-session trends mean nothing.

| Game | One trial is | Stimulus on (`tGo`) | Success |
|---|---|---|---|
| Assessment | one of the 5 targets; one video move | target shown; move's `t0` | reached within cap |
| Pong | **one ball approaching the patient's paddle** (a serve or return heading their way) | ball crosses mid-court towards the patient | returned |
| Lantern | one candle (basket → lantern), as today | lantern appears (candle taken) | lit |
| Windy City | **one gap** (tower) | gap enters the screen | passed without crash |
| Future games | declared in the game's spec (A.5 traceability table) | | |

### 2.5 Trial record

Common fields (every game):

```json
{
  "schema": 1, "kind": "trial", "sessionId": "…", "roundId": "…", "trialId": "…",
  "game": "lantern", "n": 17,
  "tGo": 812340, "tOnset": 812910, "tArrive": 814200, "tEnd": 814900,
  "rt": 0.57, "mt": 1.29, "outcome": "hit | miss | timeout | moth | crash",
  "difficulty": {"level": 7, "rangeScale": 0.85, "radius": 0.22, "lifetime": 3.0, "reachFrac": 0.62},
  "kin": {
    "peakSpeed": 1.84, "meanSpeed": 0.71, "tPeakFrac": 0.38,
    "pathEff": 0.86, "submovements": 2, "sparc": -1.9, "ldlj": null,
    "romReach": 0.66, "elevMin": 22, "elevMax": 104,
    "compPeak": 0.4, "compMs": 0,
    "trackedFrac": 0.98, "samples": 39, "rate": 15
  },
  "game_specific": {}
}
```

Definitions (all positions in shoulder-width units, SW, about the body centre, y-up, as the rest of STRIVE):

| Field | Definition |
|---|---|
| `rt` | `tOnset - tGo`, s. Movement onset = first sample where wrist speed exceeds max(0.15 SW/s, 10% of this trial's peak) and stays above it for 100 ms. |
| `mt` | `tArrive - tOnset`, s (arrive = entered the capture radius, or contact for Pong). |
| `peakSpeed`, `meanSpeed` | wrist speed, SW/s, from a 2nd-order Savitzky-Golay derivative of the raw (unsmoothed) samples, not the game's EMA cursor. |
| `tPeakFrac` | time of peak speed as a fraction of `mt` (bell-shaped reaches sit near 0.4 to 0.5; fatigue and impairment push it around). |
| `pathEff` | straight-line distance / travelled path, 0 to 1 (Lantern already computes this). |
| `submovements` | count of speed peaks above 20% of peak separated by a dip below 50% of the smaller peak (a robust smoothness proxy at 15 to 30 Hz). |
| `sparc` | spectral arc length of the speed profile (Balasubramanian et al. 2015). **Preferred smoothness metric**: far less noise-sensitive than jerk at these frame rates. |
| `ldlj` | log dimensionless jerk; logged only when the source rate is 60 Hz or more, else null (jerk from 15 fps pose is mostly landmark noise). |
| `romReach` | the furthest wrist distance from the body centre in the trial, as a fraction of the assessment envelope in that direction. |
| `elevMin`, `elevMax` | `tracker.armAngle` range in the trial, degrees. |
| `compPeak`, `compMs` | peak of the coach's compensation score and the ms above threshold in this trial. |
| `trackedFrac`, `samples`, `rate` | fraction of the trial with fresh tracking, sample count, mean sample rate. **Every indicator must be gated on this.** |

Game-specific additions:

- **Pong:** `approachS` (time the ball took to arrive), `interceptErr` (paddle centre to ball at contact, paddle lengths), `leadS` (how early the paddle got to the intercept; negative = late), `travelSW` (paddle travel this approach), `rally` (return count so far), `pace` (speed level), `spin`.
- **Lantern:** as today (`angle`, `basket`, `holdDur`, `holdBreaks`, `firstChoice`, `wrongTouches`, `minClear`, `onTargetPct`, `trackErr`, `returnTime`), now with `tGo/tOnset/tArrive/tEnd`.
- **Windy City:** `gapDeltaFrac` (required height change as a fraction of the lane), `heightErr` (jet to gap centre at entry), `tiltMeanDeg`, `tiltMaxDeg`, **`handAsymDeg`** (the hands' own tilt, without the crosswind, which today's `meanTiltDeg` mixes in), `inBandFrac` (time inside the gap's band on approach).
- **Assessment:** `askFrac`, `reached`, `holdMs`, `stability`, `graspOk`; per video move `peakSW`, `peakDeg`, `returned`.

### 2.6 Events

One JSON object per line, `{"schema":1,"kind":"event","sessionId":…,"t":…,"type":…,…}`.

| `type` | Fields | Why |
|---|---|---|
| `session_start` / `session_end` | `reason` | session length, early stops |
| `block_start` / `block_end` | `blockId`, `game`, `plannedMin`, `reason` (`time_up`, `skipped`, `finished_early`) | plan adherence |
| `round_start` / `round_end` | `roundId`, `game`, `level`, `params`, `reason` (`complete`, `target`, `hearts`, `quit`, `tracking`) | **quits are kept, not discarded** |
| `trial_start` / `trial_end` | `trialId` | joins the trial record |
| `pause_start` / `pause_end` | `cause` (`user`, `tracking_lost`, `relocated`, `hands_lost`, `help`) | pause count and length |
| `idle_start` / `idle_end` | wrist speed below 0.05 SW/s with no game event for 5 s | disengagement |
| `inter_round` | `gapS` from round end to next round start, `cardAction` (`play_again`, `change_game`, `finish`, `one_more`) | engagement between rounds |
| `comp_start` / `comp_end` | `type` (lean, hike, rotation, tilt), `peak`, `durationMs` | open alerts are closed at round end |
| `coach_cue` | `event` (phrasebook event), `lineId`, `channel` (`voice`, `caption`, `dock`), `source` (`phrasebook`, `relay`) | what the patient was told and when (a confound for every indicator) |
| `rest_prompt` | `trigger` (`every_4th`, `comp_spike`, `indicator`), `response` (`rested`, `continued`, `finished`), `restS` | |
| `difficulty_change` | `param`, `from`, `to`, `cause` (`dda`, `ladder`, `manual_court`, `manual_card`, `staff`) | indicators must be read against difficulty |
| `self_report` | `item` (`fatigue`, `pain`, `enjoyment`, `feel`), `value`, `scale` (`nrs10`, `faces3`), `prompted` | |
| `tracking_quality` | every 10 s: `fps`, `trackedFrac`, `handFreshFrac`, `peopleSeen` | rejects bad data windows |
| `help` | `screen` | |
| `indicator` | only when adaptation is in `observe` or `suggest` mode: `name`, `value`, `baseline`, `flag` | audit trail of what the system thought |

### 2.7 Kinematic stream (research mode)

`{t, tCap, src, wr:[x,y], el:[x,y], sh:[x,y], trunk:[lean, hike, rot], elev, curl, vis}` per sample at the source rate, trial and round ids attached, plus `lm3` wrist/elbow/shoulder in metres on the ZED. About 120 bytes per sample in JSONL, so about 1.6 MB per 15 minutes at 15 Hz and 3.2 MB at 30 Hz. No pixels, no faces, ever (P14).

### 2.8 Storage, format and export

- **Where:** a new IndexedDB database `strive-telemetry` (object stores `sessions`, `trials`, `events`, `stream`). IndexedDB is asynchronous, has a much larger quota than localStorage and suits append-only writes. `rehabsuite-v1` stays exactly as it is (renaming it would orphan patient data) and keeps running the app; round records gain `sessionId` and `roundId` so the two can be joined.
- **Offload:** at `session_end`, and every 5 minutes, unsent records go to the launcher (the same path `backupNow` uses today) and land as `tools/telemetry/<studyId>/<sessionId>/{session.json, trials.csv, events.jsonl, stream.jsonl}`. JSONL is append-friendly and survives a crash mid-session; CSV is what a statistician opens first. A browser-only fallback is a staff "Export session" button producing the same four files in a zip.
- **Retention:** sent records are pruned from IndexedDB after the launcher acknowledges them; the stream is never kept in the browser past offload.
- **Quota:** a failed write raises a visible staff-drawer warning instead of `console.warn`.

---

## 3. Self-report

Short, optional, large targets, and never in the middle of a trial (P10, P12).

| When | Item | Scale |
|---|---|---|
| Session start (after login, before the warm-up or assessment) | "How tired do you feel right now?" | 0 to 10 NRS, eleven big buttons, 0 "Not tired at all", 10 "Extremely tired" |
| Session start | "Any pain in your arm right now?" | 0 to 10 NRS |
| Each check-in (the existing every-4th-round rest prompt, about 6 minutes) | fatigue NRS (replaces nothing: the three faces stay on every round card) | 0 to 10 |
| Session end | fatigue, pain, and "How much did you enjoy today?" | 0 to 10 |
| Therapist, end of session (staff drawer) | Pittsburgh Rehabilitation Participation Scale (PRPS, 1 to 6) and "Fatigue observed" 0 to 10 | |

An NRS on buttons rather than a slider: a slider asks for a fine drag that many of these patients cannot make, and a mouse/keyboard-operated grid of 11 buttons works for both patient and staff. Later, for the study, validated instruments sit beside these (section 7).

---

## 4. Candidate indicators (within session, explainable, no ML)

All indicators are **ratios to the participant's own baseline in the same session**, so no population norm is assumed.

**Baseline window:** trials 4 to 15 of the first non-tutorial round of each game (skipping the first 3 for warm-up and the tutorial entirely), or the first 2 minutes of play if that is fewer. Fixed for the session. A baseline needs at least 8 valid trials (`trackedFrac` of 0.8 or more); otherwise indicators are "insufficient data" and nothing is flagged.

**Rolling window:** the last 10 valid trials (or 90 s). Indicators are computed per window and compared with the baseline using medians (robust to the odd wild trial).

| Indicator | Computation | Reads as | Default threshold for a "change" |
|---|---|---|---|
| Hit-rate decline | window hit rate minus baseline hit rate, **within the same difficulty** | performance fatigability | 20 points down |
| Slowing | median `peakSpeed` window / baseline | motor fatigability | 15% slower |
| Longer RT | median `rt` window / baseline | attention or fatigue | 25% longer |
| Smoothness loss | median `sparc` window minus baseline (more negative is worse); `submovements` up | motor control fatigue | SPARC 0.3 more negative, or 1 more submovement |
| ROM shrink | 90th percentile `romReach` (and `elevMax`) window / baseline | fatigue or pain avoidance | 10% less |
| Compensation rise | compensation ms per minute, window vs baseline | substitution under fatigue | doubled, and at least 3 events |
| Disengagement | idle fraction, pause count per 5 min, `inter_round` gap, objective reminders triggered | engagement | idle above 15% of the window; gap 2x baseline |
| Trend | Theil-Sen slope of `peakSpeed` and hit rate over trial index across the round | slow decline invisible window to window | slope significantly below 0 (bootstrap 90% CI) |

**Composite flags (explainable by construction):**

- **Fatigue flag** = at least 2 of {slowing, ROM shrink, smoothness loss, compensation rise}, **in 2 consecutive windows**, while difficulty was unchanged and `trackedFrac` stayed at 0.8 or more. The flag records *which* two.
- **Disengagement flag** = disengagement in 2 consecutive windows without a fatigue flag.
- Hit rate alone never sets a flag (a new level, a moving-lantern stage or a faster ball lowers it for reasons that are not fatigue).

**Confounds the computation must handle:** difficulty changes (compare only within one difficulty, or restart the window at a change), learning (early improvement makes a later plateau look like decline against a weak baseline), warm-up (first trials slower), game phase (tutorials, guided starts, celebrations), tracking quality, coach cues (a "sit tall" cue changes the movement that follows), and target placement (Lantern positions vary in distance; normalise speed by `reachFrac`).

---

## 5. How this fits the existing code (for the later implementation)

- `GameBase.hit()` / `miss()` / `_end()` (engine.js:347-440) are the one place to emit trial and event records for every game; `startT` and `pausedMs` already exist there.
- Lantern's `cur` / `trials` structure is the template: keep its absolute times instead of dropping them.
- Pong's `_rallyT0` / `rallyT()` / `gameT()` (games.js:1688-1690) give per-approach timing.
- `Coach.events` (coach.js) becomes `comp_start` / `comp_end` with the score's peak.
- `tracker.handVel`, `armAngle`, `compensation()`, `trackingOk`, `frames` are already live; the trial kinematics are computed from a per-trial buffer of raw samples, freed at `trial_end`.
- A new `js/telemetry.js` module owns IndexedDB, ids and offload; games call `telemetry.trial(…)` and `telemetry.event(…)`, nothing else.
- The launcher's `__strive/backup` handler (tools/launcher.py) gets a sibling `__strive/telemetry`.

---

## 6. Adaptation rules (for later; config flag, default OFF)

One device-level setting, `strive-adaptive`: `off` (default) | `observe` | `suggest`. There is deliberately **no `auto` mode**.

| Mode | What happens |
|---|---|
| `off` | indicators are not computed live; the data is logged for offline analysis only |
| `observe` | indicators and flags are computed live and logged as `indicator` events; nothing changes for the patient; the therapist summary shows them |
| `suggest` | as observe, plus the coach may offer a break (below) |

Rules in `suggest` mode:

1. **Difficulty goes up conservatively.** The existing DDA may raise difficulty only when hit rate is above 70% **and** no fatigue or disengagement flag was raised in the last 2 windows **and** compensation is not rising. Otherwise it holds.
2. **Never decrease abruptly.** At most one step down per round (today's DDA already eases on a hit rate below 50%; the flag never adds a second step). A fatigue flag holds difficulty; it does not lower it.
3. **Fatigue flag means a suggested break, nothing more.** The coach says one line at the next trial boundary ("Your arm has worked hard. A short rest would be good."), the rest screen is offered with Continue pre-focused, and the exercise is never ended, shortened or changed automatically. At most one suggestion per 10 minutes; a declined suggestion is respected (logged, not repeated for 10 minutes).
4. **Pain is never inferred.** Only self-report (`hurts`, pain NRS of 4 or more) leads to the existing "let's stop here for today" path.
5. **Therapist in the loop.** The session summary (staff screen and progress email) lists every flag with its time, which indicators fired and the self-report around it, so the therapist decides what changes next session. Open-loop by default.

---

## 7. Safety, ethics, privacy, IRB

**False positives.** Slowing can be deliberate care (a patient aiming more precisely), learning a new stage, a cue from the coach, a harder target position, or a tracking problem; effort can look like fatigue (more compensation on a hard reach is effort, not tiredness); motor fatigability and perceived fatigue are distinct constructs in MS and need not move together. Mitigations: within-difficulty comparison, quality gating, two-window persistence, flags only ever *suggest*, and every flag is shown to the therapist with its reasons.

**False negatives.** A patient may push through. Self-report at check-ins is the safety net, not the indicators.

**Population notes.** **MS:** fatigue is the most common and disabling symptom; heat sensitivity (Uhthoff's phenomenon) means a warm room worsens it within a session; day-to-day variability is large, so between-session comparisons need care, and any streak mechanic would penalise a bad-symptom day. **SCI:** trunk control is often impaired, so trunk lean is sometimes the only way to reach and the compensation coach could misread necessity as a fault (coach sensitivity per participant, and compensation indicators interpreted with the therapist); tetraplegia changes what "the trained arm" and grasp mean. STRIVE's current calibration, framework and copy were written for stroke; a move to MS/SCI should be reviewed by the clinical lead.

**Privacy and de-identification (needs action regardless of this spec).** Today the store, backup files, snapshot file names and emails all carry the participant's typed name, and the mail relay sends progress and login notices through Gmail. At a HIPAA-covered entity that is PHI leaving through a consumer service. For a study: pseudonymous `studyId` in all telemetry and exports; the name-to-ID key kept separately under the study's data plan; no names in file names or email subjects; the mail relay either off, or routed through the institution's approved mail; the Claude coach relay already sends numbers only, but its use (an external API receiving de-identified event data) should still be in the protocol.

**IRB-relevant points.** Consent covering gameplay telemetry and kinematics (and the optional raw stream), with the camera never recorded; the purpose of the indicators stated as research, not clinical decision-making; data retention and destruction plan; device security (shared clinic PC, unencrypted browser storage, launcher files on disk); who can see flags; what happens if a self-report of pain is high (the stop path, and whether staff are notified); adaptation stays OFF or `observe` until a validation study supports `suggest`.

---

## 8. Validating the indicators later

1. **Reliability first:** two baseline sessions a few days apart; ICC of the baseline kinematics (`peakSpeed`, `sparc`, `romReach`, `rt`) per participant. Indicators built on unreliable baselines are noise.
2. **Concurrent validity within session:** fatigue NRS at start, at every check-in (about every 6 minutes) and at end; relate each indicator to the NRS with **repeated-measures correlation** (rmcorr) or a linear mixed model (indicator ~ NRS + difficulty + time, random intercept and slope per participant).
3. **Against therapist ratings:** PRPS and observed fatigue per session; inter-rater agreement where two therapists are present.
4. **Known-groups / provocation:** a longer session (two blocks back to back without the hub break) vs a normal one, crossover, to see whether indicators move more in the fatiguing condition.
5. **Flag performance:** sensitivity and specificity of the fatigue flag against a self-reported rise of 2 or more NRS points; report the false-positive rate per hour of play, since that is what a patient would feel.
6. **Validated instruments beside the NRS:** MFIS or FSS for trait fatigue in MS at enrolment; a state measure (for example VAS-F) at session start and end; IMI interest/enjoyment subscale for engagement; Borg CR10 for exertion.
7. Pre-register the indicator definitions and thresholds (this document's section 4) before unblinding the data.

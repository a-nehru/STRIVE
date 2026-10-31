# STRIVE design system (proposal)

Status: **proposal for discussion, not implemented.** Written 30 Oct 2026 from an audit of the current code (commit 3b2417b). Nothing here changes code yet; numbers marked "to test" are decided by the prototype in the plan.

Goal: one look and one flow across the assessment, every game (today Pong FE, Pong Abd-Add, Lantern, Windy City) and the shell, in a clean, flat, "brain-games" style (the Lumosity family of layouts: one neutral base, one accent per game, big rounded type, a results screen that compares you with yourself), while keeping STRIVE's binding rules: P4 no punishment, P5 one channel per feedback type, P8 progress only accumulates, P10 guard cognitive load, P11 everything readable with sound off, and the gentle-pacing theme in CLAUDE.md.

---

## 0. Why: what the audit found

- **No shared theme.** The only tokens are 16 CSS custom properties (css/style.css:8-25), and no JS reads them. Canvas code, which draws every game and the assessment, hard-codes its colours: **788 distinct colour literals** on the enabled surface (456 distinct hex), cream alone at 31 alpha steps, about 15 different "dark overlay" bases, 10 near-identical ambers and 9 reds. `online.html` defines a second, conflicting `:root`.
- **Four visual worlds:** Pong is a slate-blue night court; Lantern an indigo storybook night; Windy City bright painted daylight; the assessment the camera under a navy veil with a blue target and a red cursor. The shell adds lavender-dusk gradients, a cream round card and a light-paper staff profile.
- **The same thing looks different everywhere:** clocks are drawn four ways (Pong bar, Lantern whisper line, Windy chip, assessment ring); countdowns three ways and none in Windy; celebrations four ways; the coach dock sits in four places; pause looks three ways; "target" is blue, an amber ring or a gap; "stars" means minutes played, 1-3 per level, or rally length.
- **Text sizes use five bases** (fraction of H in Pong, `H/640` in Windy, fixed px in Lantern, zoom-corrected in the assessment, `clamp()` in CSS); the text-size setting is CSS `zoom` and never reaches canvas; several canvas labels are 13-30 px at 1080p.
- **Five copies of the particle burst, four hex-to-rgba helpers, three hand-on-object fitters**, two inline ease-out curves, and calm-motion checks scattered by hand (Lantern 28, Pong 13, Windy 7, assessment 0), so coverage is uneven (Pong's 160 ms full-screen flash and Windy's 6 Hz blink are not gated).
- **Nunito** is loaded from Google Fonts by `@import` with no local copy and no load wait.
- **Docs disagree too:** DESIGN_BRIEF.md describes a night harbour; GAME_DESIGN_FRAMEWORK.md §8.3 says flat outlined cartoon on a warm off-white ground, with the clinical lead's August 2026 reference images as the visual authority. This proposal sides with §8.3 for the base and keeps a night surface for the games whose story needs light in the dark.

---

## 1. Principles

1. **One system, two surfaces.** Everything uses the same tokens. A screen is either on **Day** (warm paper, the default for all menus, cards, results and most games) or **Night** (deep ink, for camera and video views and for games whose objects are lights, such as the Lantern). Chrome (HUD, buttons, cards, results) looks identical on both.
2. **One accent per game, and only one.** The accent colours the game's card, its HUD clock, its hit pop and its results header. Success, attention and alert are system colours, never a game's accent.
3. **Calm by default.** Flat fills, soft shadows, few objects, one thing moving that matters. Celebrations at milestones only.
4. **The same flow in every game** (section 8), so a patient who has learned one game knows where to look in the next.
5. **Never by hue alone.** Every state that matters also differs in shape, icon, word or lightness (amber vs sage, today's posture pair, is a red-green confusion pair).

---

## 2. Colour

All contrast ratios below are computed (WCAG 2.x relative luminance); every text pair passes **AA (4.5:1)**, most pass AAA (7:1).

### 2.1 Neutrals

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `paper` | `#F6F2EA` | Day surface (warm off-white, §8.3) | |
| `card` | `#FFFFFF` | cards and panels on Day | |
| `line` | `#D8D2C4` | dividers only (decorative; 1.35:1, never the only edge of a control) | |
| `ink` | `#1E2235` | primary text, outlines | 14.1 on paper, 15.7 on card |
| `ink-2` | `#4B5068` | secondary text | 7.1 on paper |
| `ink-3` | `#5F6378` | hints, captions (smallest allowed contrast) | 5.3 on paper |
| `night` | `#14172A` | Night surface, camera veil base | paper text 15.9 |
| `night-card` | `#22263D` | panels on Night | paper text 13.3 |

### 2.2 Game accents (one each; `solid` for fills, `deep` for accent text on Day, `tint` for backgrounds)

| Game | solid | deep | tint | Text on solid | Checks |
|---|---|---|---|---|---|
| Pong (FE and Abd-Add) | `#2F6BD8` | `#1D4C9E` | `#E6EEFB` | white (5.0) | deep on paper 7.3; solid vs paper 4.5 |
| Lantern | `#E0952A` | `#8A5300` | `#FBF0DD` | **ink** (6.4) | deep on paper 5.7; solid on night 7.2 (a Night game) |
| Windy City | `#0E7F7F` | `#0A5E5E` | `#DFF2F1` | white (4.8) | deep on paper 6.8 |
| Assessment | `#6B4FC8` | `#4A3593` | `#ECE7F8` | white (5.9) | deep on paper 8.5 |
| Reserved for future games | plum `#B0418A`, coral `#D9573F` | `#7E2B62`, `#9C3523` | `#F6E3EF`, `#FBE6E1` | white (plum 5.3); coral large text only | |

Accents deliberately avoid the success green, so a game can never be confused with "that worked".

### 2.3 System colours

| Token | Hex | Meaning | Contrast | Always paired with |
|---|---|---|---|---|
| `success` | `#2E7D4F` | done, reached, new best | 4.5 on paper, white on it 5.1 | a check / star shape |
| `attention` | `#A65600` | posture cue, "look here" | 4.8 on paper, white on it 5.3 | dashed outline + the cue word |
| `alert` | `#B3261E` | safety only: pain stop, camera lost, staff warnings. **Never for a game miss** | 5.9 on paper | an icon + words |
| `soft` | `#666B82` | a miss, a lost point, "not yet" (P4: misses are soft) | 4.7 on paper | a fade, never a shake or buzz |

### 2.4 Rules

- Camera and video views sit on Night with the picture under a single veil token (`veil: rgba(20,23,42,0.38)`), replacing about 15 overlay bases.
- Game objects on a field need **3:1 non-text contrast** (WCAG 1.4.11) against the field, checked per game; an object that fails gets an `ink` outline (2 to 3 px at 1080p), in line with §8.3's "confident outline".
- One function builds alpha colours (`theme.alpha(token, a)`), with a fixed alpha scale (`.08 .16 .32 .56 .80`), replacing the 31 cream steps and the four hex-to-rgba helpers.

---

## 3. Typography

- **Family: Nunito** (SIL OFL 1.1, variable 200-1000), already used, rounded and friendly, capital I and lowercase l distinct. **Self-hosted** in `assets/fonts/` (no Google Fonts call), loaded with `document.fonts.load` before the first canvas frame so canvas text never starts in a fallback face. Weights used: 600, 700, 800, 900; 400 dropped.
- **To test:** Atkinson Hyperlegible Next (OFL, Braille Institute, slashed zero, built for low vision) for numbers and small text. Nunito's 0 and O differ only in width; for a clock or a score read from 3 m that matters. Baloo 2 is not recommended (its I and l are near-identical).
- **One size scale in one unit.** Patient sizes are defined at a 1080 px tall screen and scaled by `H / 1080 × textScale` for canvas and by `clamp()` for CSS, both from the same token, so the patient's text-size setting reaches canvas for the first time.

| Token | Size at 1080p | Weight | Use |
|---|---|---|---|
| `display` | 96 px | 900 | celebration word ("Level 3!", "Finish!") |
| `hero` | 140 px | 800 | the one number on a results screen, countdown digits |
| `title` | 64 px | 800 | screen titles, the round card headline |
| `body` | 40 px | 700 | instructions, prompts, coach lines |
| `label` | 32 px | 700 | HUD labels, chips, buttons (**patient minimum**) |
| `staff` | 16 px | 600 | staff drawer and therapist screens only (minimum 14) |

- No patient-facing text below 32 px at 1080p (today several canvas labels are 13-30 px). Line height 1.25 for body, 1.05 for display. Letter spacing 0 except `display` (-1 px).
- Numbers that change (clock, score) use tabular figures so they do not jitter.
- Copy rules unchanged: plain words, no em dashes, one instruction at a time, every on-screen sentence also spoken (P11) and every spoken sentence on screen.

---

## 4. Shape, elevation, layout

- **Radii:** `r-sm 12`, `r-md 20`, `r-lg 32`, `pill 999` (today 18 different values).
- **Fills:** flat. Gradients only for skies and light sources (a lantern's glow, the ball's glow), never on UI.
- **Outlines:** UI has none (cards are separated by elevation). Game characters and objects that need figure-ground get an `ink` outline at 3 px (§8.3).
- **Elevation:** two shadows only. `e1: 0 2px 6px rgba(30,34,53,.10)` for chips and buttons, `e2: 0 10px 28px rgba(30,34,53,.14)` for cards and the results sheet. Canvas uses the same two (`shadowBlur 6 / 28`, offset 2 / 10).
- **Targets:** the smallest interactive or reachable target is 0.25 SW and at least 96 px on screen; a hit radius is never smaller than the drawn object.
- **Safe areas (fixes today's overlaps):** the DOM chrome owns the corners (Help top-left, staff and quit top-right, Today pill top-right). Canvas HUD may use only the **top-centre band** (clock), the **bottom-centre band** (one game counter, if the count is the task) and the **coach dock** (bottom, on the side away from the trained arm, P5). `theme.layout(c)` returns these rectangles so no game hand-places around buttons again.

```
+------------------------------------------------------------+
| [Help]              [   clock / progress   ]   [Today] [x] |
|                                                            |
|                        play field                          |
|                                                            |
| [coach dock]           [ one counter ]                     |
+------------------------------------------------------------+
```

---

## 5. Motion

UI animation is done in code (CSS transitions in the DOM, a small time-based tween helper on canvas), never baked into art. All durations are in **milliseconds of wall time**, not frames (today's burst lasts longer at 30 fps than at 60 fps).

| Token | Value | Use |
|---|---|---|
| `t-quick` | 160 ms | hover, focus, a chip changing |
| `t-base` | 280 ms | screen fade, card in, button press |
| `t-slow` | 480 ms | a panel or sheet arriving |
| `t-pop` | 320 ms | a hit "pop" |
| `t-celebrate` | 1200 ms | the celebration moment, then it settles |
| `ease-out` | `cubic-bezier(.2,.7,.2,1)` | everything that arrives |
| `ease-in` | `cubic-bezier(.4,0,1,1)` | everything that leaves |
| `ease-pop` | back-out, overshoot 1.4 | pops and level chips only |

Named motions (one implementation each, in `js/ui/motion.js`):

- **Hit pop:** the target scales 1 → 1.18 → 0 with `ease-pop` over `t-pop`, 8 particles in the game accent travel 0.3 SW and fade. Under calm motion: a 200 ms fade, no scale, no particles.
- **Miss:** the object fades to `soft` over `t-base`. No shake, no buzzer, no red.
- **Countdown:** 3, 2, 1 in `hero`, each scaling 1.2 → 1 over 600 ms with a soft tick; "Go" is a word, not a sound burst.
- **Celebration** (milestones only: level done, best beaten, plan done): the `display` word pops in, 24 confetti pieces in the accent and `success` for `t-celebrate`, one chime. Once per milestone, never more than once a minute.
- **Screen transition:** cross-fade `t-base`.
- **Banned:** full-screen flashes (Pong's 160 ms cream flash), blinking faster than 1 Hz (Windy's 6 Hz invulnerability blink), shake larger than 4 px, any motion that repeats more than 3 times a second (WCAG 2.3.1).
- **Calm motion** is honoured *inside* these helpers, so a game cannot forget it: under calm, particles and scale become fades, shakes become nothing, idle loops stop.

---

## 6. Sound

One sound palette, the same in every game. Today each game has its own (`audio.paddle`, `audio.lumen`, `audio.windy`, `audio.trick`), the Lantern's wrong-lantern sound is a square-wave buzz, and the fanfare plays after a lost match.

| Event | Sound | Rule |
|---|---|---|
| hit | soft chime, pitch rising a step per streak (cap at 8) | every hit |
| miss | low soft tone (today's `audio.miss`) | never a buzzer |
| streak milestone | two-note rise | 3, 5, 10 |
| level up / best | short arpeggio | once |
| round end | a calm closing chord; the fanfare **only** for a win, a level up or a best | |
| countdown | soft tick | |
| UI | one click for buttons, one for selection | |

Games may keep one signature sound of their own (the Pong paddle knock, the lantern bell) on top of the shared set. Music stays generative per game (MOODS); the Lantern gets its own mood key (`candles` is missing today).

---

## 7. Feedback system: coach reactions mapped to events

One channel per feedback type (P5): **outcome** feedback on the play field, **movement** feedback (posture) in the body view / coach dock, **progress** on the results screen. The coach's voice can join any of them, rate-limited.

| Event | Play field | Coach (voice + dock face) | Sound | Rate limit |
|---|---|---|---|---|
| Good hit | hit pop in accent | silent (the sound is the praise) | hit chime | every hit |
| Near miss | brief self-decaying assist (P4) | "So close." | soft tone | once per 20 s |
| Miss | fade to soft | silent, or a tip after 3 misses in a row ("Take your time") | soft tone | tip once per 60 s |
| Streak 3 / 5 / 10 | small streak badge by the counter | one short line ("Five in a row") | two-note rise | once per milestone |
| Personal best | celebration | "That's your best ever." | arpeggio | once |
| Posture slip (KP channel) | nothing on the field | dock face turns `attention`, dashed outline, one cue ("Sit tall") | `whoosh` | one cue, cooldown 5 s (today's coach) |
| Level up | (on the results screen) | "Next time, level 4." | arpeggio | once |
| Round / session complete | celebration if a milestone | one line, the round summary | closing chord | once |
| Fatigue indicator (later, flag OFF by default) | nothing | "Your arm has worked hard. A short rest would be good." then the rest screen | none | once per 10 min, declinable |
| Pain self-report | (results screen) | "Let's stop here for today." | none | always |

The coach's face in the dock has five states drawn from the same asset: neutral, pleased, celebrating, attention (posture), resting (break). What the face *is* (a Noto animated emoji, a drawn blob, or the voice alone) is a decision for the prototype.

---

## 8. One flow for every game

```
 game card → intro card → (tutorial, first time only) → 3-2-1 → play → end moment → results → next
```

| Step | Shared rule |
|---|---|
| Game card (hub) | accent-coloured card, the game's name, the movement it trains as a chip, one line of what to do |
| Intro card | title + one sentence goal, spoken, 4 s or Enter; replaces each game's own story / prompt opener |
| Tutorial | first play on this arm only; skippable with Enter or Escape; same "Skip" control and placement in every game |
| Countdown | the shared one (section 5); today Windy has none and the others differ |
| Play | shared HUD: the clock in the top-centre band (one look, the accent colour, a bar that fills; seconds as a word under it only in the last 10 s); at most **one** counter, only where the count is the task; nothing else |
| Pause | one look for every cause (user, camera lost, hands not seen): Night veil + `title` word + the reason in `body` |
| End moment | "Time!" or "Finish!" for 1.2 s; the celebration only if a milestone was reached |
| Results | the shared results screen (section 9) |

---

## 9. Shared results screen

Builds on the round card that is already shared since 28 Oct 2026 (`#screen-between`); adds a trend and the coach.

```
+--------------------------------------------------------------+
|  Today 23 of 45 min [======----]   Level 3 > 4   * 41 (+3)   |
|                                                              |
|     (coach face)   Your longest rally yet!                   |
|                                                              |
|                    12          <- hero number, accent deep   |
|              lanterns lit                                    |
|                                                              |
|     best streak 5      reach 82% of your circle              |
|                                                              |
|     last 7 sessions:  . . o . o O  <- this one, labelled     |
|                                                              |
|     Level up next game!                                      |
|                                                              |
|     How does your arm feel? (optional)  (fine) (tired) (hurts)|
|                                                              |
|          [  Play again  ]          [ Change game ]           |
+--------------------------------------------------------------+
```

- **One hero number per game**, the thing the game trains (lanterns lit, gaps flown, returns), never a points total.
- **Streak** means the best run *within the round* (rally, combo), never consecutive days (a broken day streak is a lost-progress mechanic, against P4 and P8, and especially hard on MS's bad-symptom days). Days are shown as a count that only grows ("Days played this week: 3").
- **Trend:** a 7-point dot plot of the hero number over the last sessions of this game, the latest larger and labelled. Self-comparison only (P9).
- **Coach message:** one sentence, chosen from the round's biggest positive (best, level up, more than last time), else effort ("Good steady work").
- Text sizes from section 3, buttons `label` on accent `solid`, Play again pre-focused (flow rules).

---

## 10. Centralise it as code

```
js/theme.js           tokens: colour, alpha(), type, radius, elevation, motion, z, layout()
                      + applyThemeCSS(): writes every token to :root custom properties at boot,
                        so CSS and canvas read ONE source
js/ui/canvas.js       font(role), text(ctx, str, x, y, role, colour) with wrapping,
                      panel(), chip(), button(), clock(), counter(), countdown(),
                      pauseVeil(), coachDock() rectangles from theme.layout()
js/ui/motion.js       tween(), pop(), fade(), burst(), confetti(), celebrate()
                      time-based, calm-aware inside
js/ui/sound.js        the shared sound palette over audio.js
assets/fonts/         self-hosted Nunito (and Atkinson, if chosen)
```

- Every game declares `accent` and `surface` in its `GAMES` entry and draws chrome only through `js/ui/*`. Games keep their own world art (Windy's city, the Lantern's village) but take their colours from `theme` (a game palette may add up to 6 world colours of its own, declared in one table).
- CSS keeps working through the generated custom properties; the hard-coded literals in style.css are replaced by `var(--…)` in the same pass.
- Dead code found in the audit goes in the same pass: the bypassed coach chooser markup, `.lvl-btn`, `.rom-card`, `.rc-ring`, `.rc-text`, `.rc-how`, `ringglow`, `RC_GLYPHS`, Windy's disabled chips/toasts/gauge, Pong's racket clock, challenge and style tags.
- A lint-like check (a tiny script, no build step) flags any `#rrggbb` literal outside `js/theme.js` and the game world palettes, so the system does not erode again.

---

## 11. Open questions (for the plan, not decided here)

1. Day or Night for Pong's court (ball trackability is the deciding measure).
2. Nunito only, or Nunito plus Atkinson Hyperlegible Next for numbers.
3. The coach's face: Noto animated emoji, a drawn blob, or the voice alone.
4. Whether Pong keeps its score on screen (DESIGN_BRIEF §2.1 says no HUD; Lumosity-style games show a score).
5. Whether the clinical lead's August 2026 references (framework §8.3) remain the visual authority, with this system as their implementation.

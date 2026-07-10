# ⭐ Star Harbor — MediaPipe Upper-Limb Rehab Game

A webcam-based upper-limb rehabilitation serious game with a built-in motor
assessment. Design is grounded in two papers:

- **Zhang, Yu & Ji (2024)** — *CFI: a VR motor rehabilitation serious game
  design framework* (J NeuroEngineering Rehabil 21:113)
- **Cameirão, Bermúdez i Badia, Duarte Oller & Verschure** — *The
  Rehabilitation Gaming System: a Review*

No VR headset needed — MediaPipe Pose tracks the arms through an ordinary
webcam (same "inexpensive, out-of-the-box components" philosophy as the RGS).

## Run it

1. Double-click `start_game.bat` (needs Python installed), or run
   `python -m http.server 8321` in this folder.
2. The browser opens `http://localhost:8321`. Allow camera access.
3. Internet is required on first load (MediaPipe model downloads once).

Stand or sit 1–2 m from the camera with your whole upper body visible.

## Flow

1. **Assessment** (per arm — the RGS "calibration" / CFI "Clinical" step)
   - Hold-still capture of a comfortable home position.
   - 8-direction maximal reach → **reach envelope** (active ROM analog).
   - 5 precision touches at 60% of the envelope → **pointing error**.
   - Also measured: **reaction time**, **movement time**, **peak speed**.
   - All distances are in *shoulder-width units relative to the shoulder
     midpoint*, so results are camera-distance independent and comparable
     across sessions.
2. **Game** — pop drifting star-bubbles with your hand. 30-second rounds.
3. **Round summary → dynamic difficulty adjustment → next round.**

## How the papers map to the code

| Paper concept | Implementation |
|---|---|
| CFI *Clinical*: assess motor function first, seed initial difficulty | `assessment.js` → `dda.initialParams()` |
| RGS calibration each session (reach distance, speed, precision, RT) | Assessment can be re-run any session; results logged |
| Motion mapping (shoulder/elbow drive the game) | MediaPipe wrist landmark, body-relative coordinates (`tracker.js`) |
| Targets within patient's capability; range/size/speed parameters | Spawn radius = `rangeScale ×` envelope; `radius`; `lifetime` (`game.js`, `dda.js`) |
| DDA: hit rate <50% → easier, >70% → harder (Yerkes-Dodson / Cameirão model) | `dda.adjust()` between rounds |
| Which parameter to ease: misses beyond 70% of range → reduce ROM demand, else reduce precision/speed demand (Zhang's fuzzy module) | Miss-location analysis (`missFar`) in `dda.adjust()` |
| KP feedback (see your own movement) | Live arm skeleton + hand cursor overlay |
| Trunk-compensation warning (Subramanian: 'whoosh' at >5 cm trunk shift) | Shoulder-midpoint drift > 0.35 SW → warning + whoosh; targets are body-relative so leaning doesn't help anyway |
| KR feedback (chime on success, result summary) | Hit chime / miss thud, round success-rate screen |
| 10 points per hit (RGS 'Hitting') | `POINTS_PER_HIT = 10` |
| Short rounds + rest breaks (VR side-effect / fatigue guidance) | 30 s rounds, rest prompt each round, longer break every 4 rounds |
| Reward **cycle** with consumption (points must buy something) | Star Shop: catcher & bubble skins; village lanterns light with lifetime stars |
| Calm story for older stroke population | Night harbor / lantern-lighting theme, gentle generative BGM |
| BGM tempo +10% on miss (CFI case study) | `audio.pulseTempo()` |
| Monitoring + data for the therapist | Progress table + JSON export per patient |

## Notes / limits

- Targets the mild-to-moderate population (Brunnstrom IV–V-ish): requires
  some antigravity shoulder/elbow movement, no grasp tracking (pose model
  only — a hand-landmark "grasp" task would be the natural next step,
  mirroring RGS Hitting → Grasping → Placing progression).
- Data stays in the browser's localStorage; use **Export** for a JSON copy.
- Not a medical device; use under clinician guidance.

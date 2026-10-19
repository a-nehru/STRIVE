# ⭐ STRIVE

**Webcam-based upper-limb rehab game suite with a built-in motor assessment.**
Developed by Synapse Lab, Shirley Ryan AbilityLab. (Working title during
development: Star Harbor.)

**Play online:** https://a-nehru.github.io/STRIVE/ (Chrome/Edge, webcam
required; all data stays in your browser)

Design is grounded in two papers:

- **Zhang, Yu & Ji (2024)** — *CFI: a VR motor rehabilitation serious game
  design framework* (J NeuroEngineering Rehabil 21:113)
- **Cameirão, Bermúdez i Badia, Duarte Oller & Verschure** — *The
  Rehabilitation Gaming System: a Review*

No VR headset needed — MediaPipe Pose tracks the arms through an ordinary
webcam (same "inexpensive, out-of-the-box components" philosophy as the RGS).

## Run it locally

1. Double-click `start_game.bat` (needs Python installed), or run
   `python -m http.server 8321` in this folder.
2. The browser opens `http://localhost:8321`. Allow camera access.
3. Internet is required on first load (MediaPipe pose + hand models
   download once).

Stand or sit 1–2 m from the camera with your whole upper body visible.

## Flow

1. **Assessment** (the RGS "calibration" / CFI "Clinical" step) — **both
   arms, left then right, nothing to choose**: hold still (rest position
   becomes the work center) → squeeze calibration ("open wide… now
   squeeze") → **a figure demonstrates the movement** → **90 s of free
   reach**, with the patient told plainly why ("wherever you reach is where
   your targets will appear") → **six held positions**, each reached, held
   5 s, and with a squeeze and then an open of the hand.
   Out of it: a 16-direction reach envelope, arm length, workspace **area**
   and **coverage** (and a real **volume** on the ZED), which quadrant is
   lost, the arm-elevation arc, and per position whether they could reach
   there *and* grasp there. Reaching is the pass/fail and grasping never is,
   so a patient with no hand function completes every position.
   Distances are in *shoulder-width units relative to the shoulder midpoint*
   and reach demand is scaled by *arm length*, so results are
   camera-distance independent and comparable across sessions.
   **Your ROM is stored and reused** — you never redo it just to start a
   session. Re-measure one arm or both when you want to, and finishing shows
   **previous vs current** side by side.
2. **Games** — currently **Arc Pong**, **Scratch Cards** and **Connect the
   Dots** are enabled (about twenty more are written and one flag away).
   Each is labeled with the movement it trains so therapists prescribe by
   movement, and targets only ever appear inside the assessed envelope.
   Scratch Cards and Connect the Dots progress on levels that widen across
   your own measured reach while the scratcher / capture radius shrinks.
   Round-1 tutorials are learn-by-doing and skippable; Pong's doubles as a
   paddle-speed measurement that sets its ball speed.
3. **Round summary → dynamic difficulty adjustment → next round.**
   Difficulty is remembered **per game and per arm** — the games make
   different demands, so doing well at one does not make another harder.

Story world: the village of **Strivealon**, whose stars the evil dark clouds
are covering — play earns the stars back.

**ZED 2 (optional):** run `python tools/zed_bridge.py` and the game uses the
ZED SDK's depth-based skeleton instead of MediaPipe (staff-drawer "Camera
source" setting; falls back to the webcam automatically). With the ZED the
assessment also reports a real workspace **volume**, and bystanders are
excluded by a **play volume** — only people standing inside it can be
players, so a therapist behind the patient is never picked up.

**Therapist contact (optional):** run `python tools/mail_bridge.py` and the
staff drawer can send a test email, a problem report with camera/tracking
diagnostics, or a progress summary. The mail credential stays on the clinic
machine and never reaches the browser. Nothing sends automatically — a
person presses the button.

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
| Monitoring + data for the therapist | Progress table + JSON export per patient; optional emailed progress summary (`tools/mail_bridge.py`) |
| Re-calibration as monitoring | Stored ROM is reused, never auto-redone; a re-measure shows previous vs current side by side |

## Notes / limits

- Targets the mild-to-moderate population (Brunnstrom IV–V-ish): requires
  some antigravity shoulder/elbow movement.
- Grasp tracking is two-tier: a dedicated 21-point hand model gives real
  finger curl (with per-person squeeze calibration from the assessment), and
  a self-calibrating pose-fingertip heuristic is the fallback — so games that
  ask for a squeeze always accept a steady hold instead, and patients without
  grasp still complete everything.
- With more than one person in view the tracker locks onto the patient by
  position and build (not by face — that would mean an embedding model and
  storing patient biometrics) and pauses rather than swapping if it loses
  them.
- The full two-arm assessment takes about six minutes. It is stored and
  reused, so you do this rarely, not every session.
- Data stays in the browser's localStorage; use **Export** for a JSON copy.
- Not a medical device; use under clinician guidance.

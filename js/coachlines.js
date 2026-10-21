// The coaches' words (Oct 2026, by request): one phrasebook per coach for the
// events in the coach feedback prompt, so Rook, Lumi and Maple sound like
// themselves with no server at all. The rules are the prompt's: at most
// fourteen words, numbers spelled out, only facts the event carries, praise
// only for what happened, an adult spoken to as an adult, a miss is the game
// being tricky. Rook may chuckle now and then; the tag is stripped before the
// browser's voice reads it (a11y.js) and kept for a voice engine that can.
//
// coachLine(event, data)  -> a local line, at once
// coachSpeak(event, data) -> speaks the line: a Claude-written one through the
//                            local relay when it is up and the event is a
//                            between-rep one, the phrasebook otherwise

import { A11Y, speakLine, coachInfo } from "./a11y.js";
import { requestCoachLine, coachRelayReady } from "./coachline.js";

// events worth a round trip: the ones between reps and sets. Instant cues
// (compensation, a miss) never wait on a network.
export const RELAY_EVENTS = new Set(["rep_result", "personal_best", "set_summary", "progress", "session_end", "session_start"]);

// whole numbers as words, the way a voice should read them
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export function numWords(n) {
  n = Math.round(Math.abs(+n || 0));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numWords(n % 100) : "");
  return "many";
}
const has = (d, ...keys) => keys.every(k => d && d[k] != null && d[k] !== "" && !(typeof d[k] === "number" && !isFinite(d[k])));
const pct = d => numWords(d.hit_pct) + " percent";
const cm = v => numWords(v) + (Math.round(v) === 1 ? " centimeter" : " centimeters");

// Each entry: {needs: [data keys], text: d => line}. A variant that needs a
// number the event does not carry is never chosen, so no line invents one.
const BOOK = {
  rook: {
    session_start: [
      { text: () => "Engines on, co-pilot. Let's see what we can do today." },
      { text: () => "Welcome aboard. Nice and easy to start, then we climb." },
      { text: () => "Good to have you back in the cockpit. Let's fly." },
    ],
    rep_result: [
      { needs: ["streak"], text: d => `${cap(numWords(d.streak))} in a row! Smooth flying, co-pilot.` },
      { needs: ["streak"], text: d => `That's ${numWords(d.streak)} straight. Keep those wings level.` },
      { needs: ["reach_cm"], text: d => `Smooth flying! ${cap(cm(d.reach_cm))} that time.` },
      { text: () => "Smooth flying, co-pilot. Let's do that again." },
      { text: () => "Nice one. Keep that rhythm going [chuckle]." },
    ],
    personal_best: [
      { needs: ["reach_cm"], text: d => `New record! ${cap(cm(d.reach_cm))}, your best today.` },
      { text: () => "That's a new high. Log it in the flight book!" },
      { text: () => "Best one yet, co-pilot. Nicely done." },
    ],
    compensation: {
      lean: ["Easy, co-pilot. Sit tall and let the arm fly.", "Keep the fuselage still. The arm does the flying."],
      hike: ["Shoulder down, wings level.", "Let that shoulder rest, co-pilot."],
      rotation: ["Nose to the camera. Keep your chest facing me.", "Face forward, co-pilot. Chest to the camera."],
      tilt: ["Level up, nice and tall.", "Straighten up gently. Level flight."],
    },
    miss: [
      { text: () => "Whoa, sneaky wind [chuckle]. Let's take another run." },
      { text: () => "That one got away. Next one's ours." },
      { text: () => "Tricky gust. Line it up and go again." },
    ],
    set_summary: [
      { needs: ["hits"], text: d => `${cap(numWords(d.hits))} caught this round. Solid flying.` },
      { needs: ["hit_pct"], text: d => `${cap(pct(d))} landed. Good run, co-pilot.` },
      { text: () => "Round complete. Good flying out there." },
    ],
    fatigue_detected: [
      { text: () => "Pit stop time. Refuel for thirty seconds." },
      { text: () => "Let's land for a moment. Rest is part of the flight plan." },
    ],
    rest_over: [
      { text: () => "Refuelled? Back in the cockpit when you're ready." },
      { text: () => "Ready for take off whenever you are." },
    ],
    progress: [
      { needs: ["delta_cm"], text: d => `Up ${cm(d.delta_cm)} since last time. That's real climbing.` },
      { needs: ["delta_pct"], text: d => `${cap(numWords(d.delta_pct))} points up since last time. Nice climb.` },
      { text: () => "Further than last time. Keep climbing." },
    ],
    session_end: [
      { needs: ["hits"], text: d => `Landed safely. ${cap(numWords(d.hits))} catches today, co-pilot.` },
      { needs: ["longest_streak"], text: d => `Great flight. ${cap(numWords(d.longest_streak))} in a row was the highlight.` },
      { text: () => "Great flight today. See you next time, co-pilot." },
    ],
    reach_more: [
      { text: () => "Lovely. Now stretch the wings a little further out." },
      { text: () => "Good. Next one, reach a touch further." },
    ],
  },

  lumi: {
    session_start: [
      { text: () => "Hello. Let's begin gently, in your own time." },
      { text: () => "Good to see you. We'll start slow and easy." },
      { text: () => "Welcome back. Take a breath, and we'll begin." },
    ],
    rep_result: [
      { needs: ["streak"], text: d => `${cap(numWords(d.streak))} in a row. Lovely, steady work.` },
      { needs: ["streak"], text: d => `That's ${numWords(d.streak)} together. Beautiful control.` },
      { needs: ["reach_cm"], text: d => `Lovely. That light reached ${cm(d.reach_cm)}.` },
      { text: () => "Lovely. Nice and slow, just like that." },
      { text: () => "Good. Take your time with the next one." },
    ],
    personal_best: [
      { needs: ["reach_cm"], text: d => `${cap(cm(d.reach_cm))}. Your best reach today.` },
      { text: () => "That was your furthest yet. Quietly wonderful." },
      { text: () => "A new best. Well done." },
    ],
    compensation: {
      lean: ["Sit tall, reach with your arm", "Let the arm do the reaching. Sit tall."],
      hike: ["Let your shoulder relax", "Let your shoulder rest as you reach."],
      rotation: ["Keep your chest facing me", "Chest to the camera, gently."],
      tilt: ["Straighten up gently, nice and tall", "Gently upright. Nice and tall."],
    },
    miss: [
      { text: () => "No rush. Watch it come, and start your reach early." },
      { text: () => "That one was tricky. Another will come along." },
      { text: () => "Take your time. The next one is yours." },
    ],
    set_summary: [
      { needs: ["hits"], text: d => `${cap(numWords(d.hits))} this round. Steady, good work.` },
      { needs: ["hit_pct"], text: d => `${cap(pct(d))} this round. Lovely, even work.` },
      { text: () => "That round is done. Well done." },
    ],
    fatigue_detected: [
      { text: () => "This is a lovely moment for a short rest. Breathe." },
      { text: () => "Let's rest for a little while. Rest is part of the work." },
    ],
    rest_over: [
      { text: () => "Whenever you're ready, we'll carry on." },
      { text: () => "Back in your own time. No hurry." },
    ],
    progress: [
      { needs: ["delta_cm"], text: d => `${cap(cm(d.delta_cm))} further than last time. Lovely.` },
      { needs: ["delta_pct"], text: d => `${cap(numWords(d.delta_pct))} points more than last time. Well done.` },
      { text: () => "A little further than last time. That's how it grows." },
    ],
    session_end: [
      { needs: ["hits"], text: d => `Well done today. ${cap(numWords(d.hits))} good reaches.` },
      { needs: ["longest_streak"], text: d => `Well done today. ${cap(numWords(d.longest_streak))} in a row was lovely.` },
      { text: () => "Well done today. Rest well." },
    ],
    reach_more: [
      { text: () => "Lovely. Now try stretching a little farther out." },
      { text: () => "Good. See if the next one reaches a little further." },
    ],
  },

  maple: {
    session_start: [
      { text: () => "Right. Warm hands, clear target. Let's work." },
      { text: () => "Good to see you. Today we do a little more than yesterday." },
      { text: () => "Let's get to it. One rep at a time." },
    ],
    rep_result: [
      { needs: ["streak"], text: d => `${cap(numWords(d.streak))} in a row. Keep it up.` },
      { needs: ["streak"], text: d => `${cap(numWords(d.streak))} straight. That's control.` },
      { needs: ["reach_cm"], text: d => `${cap(cm(d.reach_cm))}. Good. Same again.` },
      { text: () => "Good rep. Same again." },
      { text: () => "That's the one. One more." },
    ],
    personal_best: [
      { needs: ["reach_cm"], text: d => `${cap(cm(d.reach_cm))}. Best today. Now hold that standard.` },
      { text: () => "New best. That's what work looks like." },
      { text: () => "Your best yet. Proud of that one." },
    ],
    compensation: {
      lean: ["Sit tall. Arm does the work.", "Trunk still. Reach from the shoulder."],
      hike: ["Drop that shoulder. Reach again.", "Shoulder down. Go again."],
      rotation: ["Chest to the camera. Square up.", "Face me. Square shoulders."],
      tilt: ["Straighten up. Tall and steady.", "Upright. Nice and tall."],
    },
    miss: [
      { text: () => "Reset. Same target, go again." },
      { text: () => "Missed. No matter. Line it up again." },
      { text: () => "Tricky one. Next rep is yours." },
    ],
    set_summary: [
      { needs: ["hits"], text: d => `${cap(numWords(d.hits))} this round. Solid.` },
      { needs: ["hit_pct"], text: d => `${cap(pct(d))}. Good work. We build on that.` },
      { text: () => "Round done. Good work." },
    ],
    fatigue_detected: [
      { text: () => "Thirty-second break. Shake it out." },
      { text: () => "Rest now. Rest is training too." },
    ],
    rest_over: [
      { text: () => "Break's over when you say so. Ready?" },
      { text: () => "Back to it when you're ready." },
    ],
    progress: [
      { needs: ["delta_cm"], text: d => `Up ${cm(d.delta_cm)} from last time. Now beat it.` },
      { needs: ["delta_pct"], text: d => `Up ${numWords(d.delta_pct)} points from last time. Keep pushing.` },
      { text: () => "Further than last time. Good. Keep pushing." },
    ],
    session_end: [
      { needs: ["hits"], text: d => `Done. ${cap(numWords(d.hits))} good reps today.` },
      { needs: ["longest_streak"], text: d => `Done. ${cap(numWords(d.longest_streak))} in a row was the best of it.` },
      { text: () => "Good session. Rest up. Same time next time." },
    ],
    reach_more: [
      { text: () => "Good. Now reach further. You have more." },
      { text: () => "Push it a little further next time." },
    ],
  },
};
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// the coach's last few lines, so nothing is said twice running and the relay
// can be told what to avoid
const recent = { rook: [], lumi: [], maple: [] };
function remember(coach, line) {
  const r = recent[coach] || (recent[coach] = []);
  r.push(line);
  if (r.length > 6) r.shift();
}
export function recentLines(coach = A11Y.coach) { return (recent[coach] || []).slice(-4); }

function pick(coach, list, data) {
  const last2 = (recent[coach] || []).slice(-2);
  const usable = list.filter(v => !v.needs || has(data, ...v.needs));
  const pool = usable.length ? usable : list.filter(v => !v.needs);
  const fresh = pool.filter(v => !last2.includes(v.text(data)));
  const from = fresh.length ? fresh : pool;
  if (!from.length) return "";
  return from[Math.floor(Math.random() * from.length)].text(data);
}

// A line in the active coach's style, at once, from the phrasebook.
// compensation: data.type is lean | hike | rotation | tilt.
export function coachLine(event, data = {}, coach = A11Y.coach) {
  const book = BOOK[coach] || BOOK.lumi;
  let line = "";
  if (event === "compensation") {
    const opts = book.compensation[data.type] || book.compensation.lean;
    const last2 = (recent[coach] || []).slice(-2);
    const fresh = opts.filter(o => !last2.includes(o));
    line = (fresh.length ? fresh : opts)[Math.floor(Math.random() * (fresh.length ? fresh : opts).length)];
  } else {
    line = pick(coach, book[event] || book.rep_result, data);
  }
  if (line) remember(coach, line);
  return line;
}

// Speak the line for an event. A between-rep event goes to the relay first
// when it is up (a Claude-written line within its budget); anything else,
// and anything the relay does not answer in time, is the phrasebook. opts:
// rate, caption (as speakLine), game (the id, for the relay), say (a function
// that speaks instead of speakLine: the engine's throttled say()).
export async function coachSpeak(event, data = {}, opts = {}) {
  const coach = A11Y.coach;
  let line = "";
  if (RELAY_EVENTS.has(event) && coachRelayReady()) {
    const r = await requestCoachLine({
      coach, event, feedback_type: feedbackType(event), game: opts.game || "strive",
      data: numbersOnly(data), recent_lines: recentLines(coach), language_level: "simple",
    });
    if (r) { line = r.say; remember(coach, line); }
  }
  if (!line) line = coachLine(event, data, coach);
  if (!line) return "";
  if (opts.say) opts.say(line);
  else speakLine(line, opts.rate ?? 0.9, opts.caption ?? true);
  return line;
}

function feedbackType(event) {
  return { compensation: "corrective", miss: "encourage", fatigue_detected: "rest", rest_over: "encourage",
    session_start: "greeting", session_end: "closing", progress: "progress" }[event] || "performance";
}
// only numbers and short flags cross to the relay: no names, no free text
function numbersOnly(d) {
  const out = {};
  for (const [k, v] of Object.entries(d || {})) {
    if (typeof v === "number" && isFinite(v)) out[k] = Math.round(v * 10) / 10;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= 16 && /^[a-z_]+$/.test(v)) out[k] = v;
  }
  return out;
}

export { coachInfo };

// THE MUSIC (31 Oct 2026, by request): recorded lo-fi for each game, in
// place of the generated bed. Every track is by HoliznaCC0 from the album
// "Public Domain Lofi" on the Free Music Archive, released under CC0 1.0
// (public domain: no attribution needed, credited anyway in
// assets/music/CREDITS.md), instrumental and marked not AI-generated on its
// page. Re-encoded to 96 kbps and loudness-normalised to -20 LUFS so every
// track sits at the same level under the coach's voice.
//
// A game's tracks are shuffled once per session and played in turn, one per
// round and the next when one ends, so a 15-minute block never hears the
// same track twice running. A game with no list here plays
// assets/music/<gameId>.mp3 if there is one, else the generated lo-fi
// (audio.js MOODS), which is also the fallback when a file cannot load.
// To change the music: add or remove a line, the file under assets/music/lofi/.
export const TRACKS = {
  // a little brighter, for the rallies
  pong: [
    { file: "lofi/holizna-bubbles.mp3", title: "Bubbles", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/bubbles-lofi-bright-relaxed/" },
    { file: "lofi/holizna-doodles.mp3", title: "Doodles", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/doodles-lofi-happy-mp3/" },
    { file: "lofi/holizna-walking-away.mp3", title: "Walking Away", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/walking-away-lofi-peaceful-motivating/" },
  ],
  // dreamy and easy, for flying
  windy: [
    { file: "lofi/holizna-lucid.mp3", title: "Lucid", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/lucid-lofi-dreamy-chill/" },
    { file: "lofi/holizna-shimmer.mp3", title: "Shimmer", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/shimmer-lofi-chill/" },
    { file: "lofi/holizna-birds.mp3", title: "Birds", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/birds-lofi-chill/" },
  ],
  // the calmest, for the Lantern's night village
  candles: [
    { file: "lofi/holizna-tokyo-sunset.mp3", title: "Tokyo Sunset", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tokyo-sunset-lofi-peaceful-soft/" },
    { file: "lofi/holizna-calm-currents.mp3", title: "Calm Currents", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/calm-currents-lofi-relax-calm/" },
    { file: "lofi/holizna-ease-into-night.mp3", title: "Ease into Night", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/ease-into-night-lofi-relax-chill/" },
  ],
  // quiet, under the measurement (ducked right down while a recording speaks)
  assessment: [
    { file: "lofi/holizna-peaceful-drift.mp3", title: "Peaceful Drift", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/peaceful-drift-lofi-nostalgic-calm/" },
    { file: "lofi/holizna-into-the-mist.mp3", title: "Into The Mist", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/into-the-mist-lofi-calm-relaxed/" },
  ],
  // warm and cheerful, for the fruit merge game
  fruit: [
    { file: "lofi/holizna-projector-screen.mp3", title: "Projector Screen", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/projector-screen-lofi-happy-mp3/" },
    { file: "lofi/holizna-tranquil-mindscape.mp3", title: "Tranquil Mindscape", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tranquil-mindscape-lofi-happy-reflection/" },
    { file: "lofi/holizna-warm-fuzz.mp3", title: "Warm Fuzz", page: "https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/warm-fuzz-lofi-retro/" },
  ],
};

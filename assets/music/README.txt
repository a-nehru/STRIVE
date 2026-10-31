Music for the games.

lofi/          recorded tracks, one list per game in js/tracks.js (credits: CREDITS.md).
               A round plays the game's next track; when one ends the next starts.
<gameId>.mp3   for a game with no list in js/tracks.js, a single file named after
               the game id (pong, candles, windy, fruit, assessment, ...) loops instead.

With neither, or when a file cannot load, the built-in generated lo-fi plays
(audio.js MOODS). The music always ducks while the coach or a recording talks.
Only add music whose licence allows it in a public repo (CC0 or CC BY).

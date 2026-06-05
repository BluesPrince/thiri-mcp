# THIRI Cookbook

Runnable examples for the [THIRI Chord Intelligence API](https://build.thiri.ai/developers).
Each is plain Node 18+ (built-in `fetch`) — no deps. Get a key, then:

```sh
export THIRI_API_KEY=sk_live_your_key
node examples/reharmonize-a-tune.mjs "Dm7 G7 Cmaj7" C
node examples/voice-leading-comp.mjs "Cmaj7 A7 Dm7 G7"
node examples/chord-quiz.mjs
```

| Recipe | Shows off |
|---|---|
| `reharmonize-a-tune.mjs` | every reharmonization technique applied to your changes |
| `voice-leading-comp.mjs` | smooth comping — THIRI scores each voicing transition |
| `chord-quiz.mjs` | a 10-second ear/theory quiz with a provably-correct answer key |

These call `https://chords.thiri.ai/v2/*` directly. The same four tools are also available over
[MCP](../README.md) inside Claude/Cursor.

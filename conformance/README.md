# Chord Intelligence Conformance Suite

A language-agnostic set of **correctness cases** for chord parsing, spelling, analysis, voicing,
and reharmonization — the things naive chord libraries (and LLMs) get wrong.

Most chord tools fail on: keeping a `sus`, spelling `Caug` as `C E G#` (not `C E Ab`), double-flats
in `Cdim7`, borrowed-chord roman numerals, and real reharmonization. [`cases.json`](./cases.json)
encodes the expected answers so you can grade any implementation.

## Run it against THIRI
```sh
export THIRI_API_KEY=sk_live_your_key   # build.thiri.ai/developers
node conformance/run.mjs                # tiny runner, ~30 lines, no deps
```
*(THIRI passes all cases — that's the point. Point the runner at your own library's endpoint to
compare.)*

## Why this exists
Correctness is THIRI's whole thesis: the engine is deterministic (computed, not generated), so these
cases pass on every call. If you're building anything that reasons about harmony — an app, an agent,
a teaching tool — this suite is a quick litmus test for whether a library actually understands chords
or just pattern-matches symbols.

PRs welcome: add a case your tool got wrong.

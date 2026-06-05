# THIRI MCP — Chat-Window Test Script

A human acceptance test for the THIRI MCP from the **chat window** (Claude Code / Claude Desktop).
Paste each prompt as-is, one at a time, and check the result against **Expect**. These use natural
language (no tool names) on purpose — they verify Claude *picks the right tool* and the answer is
musically correct. If all pass, the MCP is wired and the engine is healthy.

> Setup: the `thiri` MCP must be connected (`claude mcp list` → `thiri … ✓ Connected`).
> Each answer should end with a quota footer like `Quota: N / 50000 this period.`

---

## 0. Discovery — are the tools even there?
```
What THIRI chord tools do you have available?
```
**Expect:** lists four — analyze_chord, resolve_chord, generate_voicing, reharmonize.

## 1. analyze_chord — functional analysis
```
Analyze Dm7b5 in the key of C.
```
**Expect:** identifies it as **iiø7** (half-diminished), a borrowed/predominant chord, **not diatonic**, with scale suggestions (locrian / locrian ♮2). *Wrong engine tell: calling it just "chromatic" with no roman numeral.*

## 2. resolve_chord — the suspension must survive
```
What notes are in C7sus4?
```
**Expect:** **C, F, G, B♭** (the 4th replaces the 3rd). *Fail tell: returns C E G B♭ — that means it dropped the suspension.*

## 3. resolve_chord — correct enharmonic spelling
```
Spell a C augmented triad.
```
**Expect:** **C, E, G♯** (raised 5th). *Fail tell: C E A♭.*

## 4. generate_voicing — rootless
```
Give me a rootless jazz voicing for Cmaj7.
```
**Expect:** a 3–4 note voicing with **no C in the bass** (e.g. E–G–B), with MIDI numbers.

## 5. generate_voicing — voice leading between chords
```
I'm playing E3 G3 B3 D4, then moving to Dm7. Give me a rootless Dm7 voicing and the voice-leading score for that move.
```
**Expect:** a Dm7 voicing **and a numeric voiceLeadingScore** (0–1). *This is the param that used to 500 — it must return a number, not an error.*

## 6. reharmonize — a named technique
```
Reharmonize the progression Dm7 G7 Cmaj7 using Coltrane changes.
```
**Expect:** **Cmaj7 → A♭7 → A♭maj7 → E7** (Giant Steps major-thirds cycle), with a plain-English explanation.

## 7. reharmonize — auto (all options)
```
Give me reharmonization options for Dm7 G7 Cmaj7 in C.
```
**Expect:** several techniques (tritone sub, ii–V insertion, modal interchange, secondary/chain dominants, coltrane, backdoor) — each with the new progression.

## 8. Error handling — graceful, no crash
```
Analyze the chord Zx9.
```
**Expect:** a clean "could not parse / invalid chord" message — **not** a stack trace, hang, or raw error blob.

## 9. Real workflow — tool chaining
```
Take a ii-V-I in C, reharmonize it with a tritone sub, then give me rootless voicings for the reharmonized progression.
```
**Expect:** Claude calls reharmonize (→ Dm7 D♭7 Cmaj7) **then** generate_voicing on each chord — proving multi-tool chaining in one turn.

---

## Pass/fail checklist
- [ ] 0 — four tools discoverable
- [ ] 1 — Dm7b5 → iiø7, non-diatonic
- [ ] 2 — C7sus4 keeps the 4th (C F G B♭)
- [ ] 3 — Caug spelled C E G♯
- [ ] 4 — rootless Cmaj7, no root in bass
- [ ] 5 — voice-leading score returns a number
- [ ] 6 — Coltrane → Cmaj7 A♭7 A♭maj7 E7
- [ ] 7 — auto returns multiple techniques
- [ ] 8 — bad chord fails gracefully
- [ ] 9 — chains reharmonize → voicing in one turn
- [ ] every answer shows the quota footer

All ten green = MCP wired, engine correct, wrapper healthy. Re-run after any release.

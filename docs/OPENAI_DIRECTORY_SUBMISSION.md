# OpenAI MCP Directory — Submission Notes (THIRI Chord Intelligence)

Annotation values + justifications for the OpenAI directory tool-safety review.

## Where the annotations live

Two surfaces expose the same four tools; both are now annotated identically:

| Surface | File | Notes |
|---|---|---|
| **Remote MCP** — `mcp.thiri.ai` (the connector OpenAI scans) | `thiri-api-worker/mcp-worker/src/mcp.ts` | Cloudflare Worker, StreamableHTTP. Computes **in-process** (no outbound call). |
| **npm / stdio** — `@bluesprincemedia/thiri-mcp` | `thiri-mcp/src/index.ts` | Thin client that proxies to `chords.thiri.ai/v2`. |

## Annotation values (identical for all four tools)

| Annotation | Value | One-line reason |
|---|---|---|
| `readOnlyHint` | **true** | Pure computation; modifies no state the caller can observe. |
| `destructiveHint` | **false** | Never deletes or overwrites anything — returns computed results only. |
| `idempotentHint` | **true** | Deterministic — identical input always yields identical output. |
| `openWorldHint` | **false** | Closed, finite domain (a fixed music-theory engine); no internet, no unbounded external entities. |

## Why these are accurate

Every THIRI tool is a **stateless, side-effect-free call into a deterministic
music-theory engine** (pitch-class-set computation over static theory tables).
It takes a chord or progression string, computes the answer, and returns it. It
creates, mutates, and deletes nothing in the caller's world: no database write,
no file, no external resource acted on for the user.

> **Metering note (does not affect `readOnlyHint`):** the hosted worker increments
> an internal per-API-key usage counter for billing. That is an implementation
> detail invisible to the model and to the user's domain — exactly as a read-only
> web-search or `fetch` tool still logs its requests. It is not a modification of
> the tool's environment in the MCP sense.

### Per tool

- **`analyze_chord`** — parses a chord symbol into root, quality, intervals, and
  (with a key) Roman numeral + harmonic function. Read-only analysis; nothing is
  stored or changed (`readOnlyHint: true`, `destructiveHint: false`). "Dm7 in C"
  always returns the same analysis (`idempotentHint: true`). The domain is a
  closed chord-quality/scale table — no external world (`openWorldHint: false`).
- **`resolve_chord`** — spells a chord to note names, frequencies (Hz), MIDI
  numbers, and recommended scales. Same justification: read-only, non-destructive,
  deterministic, closed-domain.
- **`generate_voicing`** — computes an instrument-ready voicing (and an optional
  voice-leading score vs. `previousNotes`) for a chord in a given style. It
  *returns* a voicing; it does not play, save, or alter anything. Read-only,
  non-destructive, deterministic, closed-domain.
- **`reharmonize`** — computes alternative progressions from a source progression
  using named jazz techniques. Returns the alternatives; changes no state.
  Read-only, non-destructive, deterministic, closed-domain.

### `openWorldHint: false` — the honest nuance

The MCP spec defines `openWorldHint` by the tool's **domain of interaction**
(open/unbounded external world vs. closed domain) — its own examples are
"web search" (open) vs. "memory" (closed). THIRI's domain is a closed,
deterministic theory engine; results never depend on changing external state.

- On the **remote worker** (`mcp.thiri.ai`, the scanned server) the computation
  is **in-process** with no outbound call, so `false` is unambiguous.
- On the **npm client** the call is proxied over HTTPS to THIRI's own fixed
  engine. That hop is transport, not an open world, so `false` still best
  represents it. (A reviewer who reads "any network call = open world" literally
  would flip only the npm client to `true`; the worker stays `false`.)

## `outputSchema` (recommended, not a blocker)

OpenAI flags `outputSchema` as *recommended*. It is **not** required for the
three safety annotations above. Adding it is a follow-up: the worker's
`registerTool` (SDK 1.29) supports an `outputSchema`, but declaring one makes the
SDK validate `structuredContent` on every response, so the tools must also return
`structuredContent` matching the schema. Tracked as a separate change so it can be
conformance-tested before deploy.

## Deploy checklist (annotations only take effect once shipped)

- [ ] `mcp.thiri.ai` worker — `wrangler deploy` from `thiri-api-worker/mcp-worker/`
- [ ] npm package — version bump + `npm publish` (if the directory entry points at npm)
- [ ] Re-run the OpenAI directory scan

## Per-field justification text (OpenAI form, paste-ready)

The form asks, per tool, to "describe why" each value is set. Copy below.

### analyze_chord
- **Read Only = True:** Parses a chord symbol into its root, quality, intervals, and (with a key) Roman numeral and harmonic function. It only reads the input and returns the computed analysis — no data is created, updated, or stored.
- **Open World = False:** The analysis comes entirely from a fixed, built-in music-theory engine (a finite set of chord qualities and scales). It makes no network, search, or external calls, so the same chord always produces the same result.
- **Destructive = False:** It returns computed analysis only; it overwrites and deletes nothing, so there is nothing destructive to undo.

### resolve_chord
- **Read Only = True:** Resolves a chord symbol to its spelled notes, frequencies (Hz), MIDI numbers, and recommended scales. It reads the input and returns the computed spelling without modifying any state.
- **Open World = False:** Every value is derived from the same fixed, deterministic theory engine — no internet or external service is consulted, and identical input always yields identical output.
- **Destructive = False:** The response is purely computed information; nothing is written, overwritten, or removed.

### generate_voicing
- **Read Only = True:** Computes an instrument-ready voicing for a chord (optionally scoring voice-leading against a supplied previous voicing) and returns it. It plays nothing and persists nothing — no state changes.
- **Open World = False:** The voicing is calculated in-engine from fixed theory data; there are no external lookups or unbounded entities, and results are deterministic for given inputs.
- **Destructive = False:** It only returns the generated voicing; no existing data is altered or deleted.

### reharmonize
- **Read Only = True:** Takes a chord progression and returns reharmonized alternatives using named jazz techniques. It reads the input progression and returns computed alternatives without storing or changing anything.
- **Open World = False:** Alternatives are computed from a fixed set of techniques and theory tables inside the engine — no external/world interaction — and are deterministic for a given progression.
- **Destructive = False:** It returns suggested alternative progressions only; the original input is untouched and nothing is deleted or overwritten.

## Testing step (OpenAI form)

### Test credentials
THIRI's MCP authenticates by **API key**, not username/password. The OAuth
`/authorize` page ("Connect your API key") accepts a `sk_live_…` key and grants
access immediately — no account creation, no 2FA. Provide a dedicated **free-tier**
key (1,000 calls/mo — ample for testing) in the credentials box, e.g.:

```
THIRI uses an API key (no username/password). When the connector opens the
"Connect your API key" screen, paste this free-tier test key:
  sk_live_…   <-- dedicated OpenAI test key (do NOT commit the real value)
```

### 5 test cases (paste-ready)

1. **Analyze a chord's function in a key**
   - *User prompt:* "What's the roman numeral and harmonic function of G7 in the key of C?"
   - *Tool triggered:* `analyze_chord`
   - *Expected output:* G7 parsed as a dominant 7th (root G, quality "7", notes G B D F); identified as **V7** in C major — scale degree 5, dominant function, diatonic.

2. **Spell a chord and get improvisation scales**
   - *User prompt:* "Spell out Cmaj7 and tell me what scales I can solo with over it."
   - *Tool triggered:* `resolve_chord`
   - *Expected output:* Cmaj7 → notes **C E G B**, with MIDI numbers and frequencies (Hz), plus recommended scales (e.g. C Ionian, C Lydian).

3. **Generate a jazz voicing in a style**
   - *User prompt:* "Give me a rootless (Bill Evans) voicing for Dm7."
   - *Tool triggered:* `generate_voicing`
   - *Expected output:* An instrument-ready Dm7 voicing in the rootless/`bill_evans` style — note names + MIDI, root omitted, color tones included.

4. **Voice-lead smoothly between two chords**
   - *User prompt:* "I just played Dm7 voiced as F3 A3 C4 E4. Give me a G7 voicing that voice-leads smoothly from it."
   - *Tool triggered:* `generate_voicing` (with `previousNotes`)
   - *Expected output:* A G7 voicing with minimal movement from the supplied Dm7 voicing, plus a `voiceLeadingScore` for the transition.

5. **Reharmonize a progression**
   - *User prompt:* "Reharmonize the progression Dm7 G7 Cmaj7 in the key of C — show me the options."
   - *Tool triggered:* `reharmonize`
   - *Expected output:* One alternative per applicable technique (e.g. tritone_sub → Dm7 **Db7** Cmaj7; ii–V insertion; etc.), each with the new progression and a plain-English explanation.

### 3 negative test cases (THIRI should NOT trigger)

Music-adjacent prompts (so the model might reach for THIRI) that fall outside its
actual function — it computes harmony from text chord symbols; it does not make
audio, take audio input, or recommend music.

1. **Generate actual audio**
   - *User prompt:* "Produce a 30-second lo-fi jazz piano track I can download."
   - *Expected:* No THIRI tool fires. THIRI returns chords/notes/voicings as **data**, not rendered audio — this should route to an audio/music-generation capability, not THIRI.

2. **Identify chords from a recording (audio input)**
   - *User prompt:* "Listen to this song clip and tell me what chords are being played."
   - *Expected:* No THIRI tool fires. THIRI's tools take a chord **symbol/progression as text** (e.g. "Dm7"); they do not accept or analyze audio. Audio-to-chord transcription is out of scope.

3. **Recommend music to listen to**
   - *User prompt:* "Recommend a few relaxing jazz albums for a dinner party."
   - *Expected:* No THIRI tool fires. THIRI computes harmony for given chords; it is not a recommender, catalog, or streaming tool — this is a general-knowledge/recommendation task.

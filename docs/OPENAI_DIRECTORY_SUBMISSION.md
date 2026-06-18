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

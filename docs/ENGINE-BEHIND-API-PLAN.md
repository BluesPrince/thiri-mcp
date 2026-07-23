# Plan: Move the THIRI engine behind the API (red-team Finding 1)

**Goal:** stop shipping the composition + Csound engine source in the public npm
package. `@bluesprincemedia/thiri-mcp` becomes a **pure thin client** (like the
chord MCP already is); the engine runs server-side and is metered by API key.

**Interim state (done 2026-07-23):** `vendor/` relicensed MIT → PolyForm
Noncommercial 1.0.0, so resale is prohibited while this migration proceeds.

## Current exposure
`files: ["dist", "conductor-server.mjs", "composition-server.mjs", "vendor"]`
ships `vendor/thiri-composition-engine/*` and `vendor/thiri-csound-core/*` as
readable source. Two of the three MCP binaries import it locally:
- `thiri-composition-mcp` → `vendor/thiri-composition-engine` (pure JS)
- `thiri-conductor-mcp` → `vendor/thiri-csound-core` (native Csound render)

## Half A — Composition engine → API (straightforward)
Pure deterministic JS; move it next to the chord core.
1. Add endpoints to `thiri-api-worker` (`chords.thiri.ai`): `POST /v2/compose`,
   `POST /v2/conduct` wrapping `composition.mjs` / `conduct-nl.mjs` / `grid-core`.
2. Gate + meter with the existing `api_keys` D1 + `RPM_LIMITS` + monthly quota.
3. Rewrite `composition-server.mjs` to call those endpoints with the user's
   `THIRI_API_KEY` (mirror `src/index.ts`'s chord thin-client).
4. Delete `vendor/thiri-composition-engine` from the package `files`.

## Half B — Csound render → container service (decided: container)
Csound needs the native binary; a Worker can't run it. Stand up a render service.
1. **Runtime:** Cloudflare Containers (or Fly.io/Railway) image with Csound +
   `thiri-band.orc`, exposing `POST /v2/render` (score JSON → WAV/MIDI).
   Base the image on the existing `Dockerfile`.
2. **Auth/meter:** same `THIRI_API_KEY`; validate against the shared api_keys
   store; count renders against quota (renders are the expensive call).
3. Rewrite `conductor-server.mjs` to POST the score and stream back audio.
4. Delete `vendor/thiri-csound-core` (incl. `orchestras/thiri-band.orc`) from
   the package `files`.
5. *(Optional)* keep a `--local-csound` opt-in for offline/BYO-Csound users, but
   default to the hosted render.

## Cutover
- Bump to `0.4.0`; `files` becomes `["dist", "conductor-server.mjs", "composition-server.mjs"]` (no `vendor`).
- `vendor/` can then be removed from the public repo (or moved to a private repo).
- **Republish to npm is a separate, explicit step** — do not `npm publish`
  without Dennison's go-ahead. Note: `0.3.0` under the old MIT terms is already
  public and irrevocable for that version; this protects `0.4.0+`.

## Effort (rough)
- Half A: ~0.5–1 day (logic already written; wrap + thin-client + meter).
- Half B: ~1–2 days (container image, deploy, render endpoint, streaming, auth).
- Cutover + verify: ~0.5 day.

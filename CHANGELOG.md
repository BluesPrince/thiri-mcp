# Changelog

All notable changes to `@bluesprincemedia/thiri-mcp`. Versions map to npm releases.

## Unreleased (0.5.1)

- **Relicensed the repository to PolyForm Noncommercial 1.0.0** (was MIT for the
  client/glue + PolyForm for `vendor/`). Commercial licensing: dennison@bluesprincemedia.com.
  Versions published at or before 0.5.0 keep the terms they shipped with.
- Docs corrected to match the v0.5.0 thin-client architecture: conductor tool
  list (`render_audio` replaces the removed `build_csound_score` /
  `render_csound_wav` / `render_with_tension`), no local Csound requirement,
  hosted tool count, endpoint count, license section.
- `manifest.json` synced (was stuck at 0.2.0); added this changelog.

## 0.5.0 — 2026-07-23

**The engine-behind-API release.** The composition engine and the Csound render
chain no longer ship in this package — both now run server-side, and the Desktop
companion servers became thin clients over the hosted API.

- `thiri-conductor-mcp`: new `render_audio` tool calls `POST /v2/render`
  (server-side Csound) and optionally plays the WAV locally. **No Csound install
  required anymore.** Removed: `build_csound_score`, `render_csound_wav`,
  `render_with_tension` (their functionality is now inside `/v2/render`).
  Remaining tools: `conduct_band`, `render_audio`, `play_audio`,
  `search_csound_corpus`.
- `thiri-composition-mcp`: composition IR (validate → render → export) now runs
  behind `POST /v2/compose`; local process handles preview only
  (`play_composition`, fluidsynth — local only).
- `vendor/` engine source removed from the package; only the Csound corpus
  summary ships (PolyForm Noncommercial). Engine relicensed ahead of the move.
- Closes security Finding 1 (engine-behind-API), Half A (composition) and
  Half B (Csound container).

*(0.4.0 was never published — Half A and Half B shipped together as 0.5.0.)*

## 0.3.0 — 2026-06-19

- New `conduct_band` tool (natural-language band conduct → lanes + MIDI) on the
  hosted MCP and npm package.
- New companion bins: `thiri-conductor-mcp`, `thiri-composition-mcp`.
- Complete MCP tool annotations; GitHub Actions CI; musician quickstart;
  `glama.json`.

## 0.2.x — 2026-06

- 0.2.1–0.2.3: fixes and packaging polish.
- 0.2.0: four theory tools (`analyze_chord`, `resolve_chord`,
  `generate_voicing`, `reharmonize`) over the v2 grid engine; hosted connector
  at `mcp.thiri.ai/mcp`.

## 0.1.0 — 2026-05-31

- Initial release.

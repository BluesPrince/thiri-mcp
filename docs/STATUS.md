---
status: shipped
proof_url: /lab/conductor-mcp
mcp_tools: analyze_chord, resolve_chord, generate_voicing, reharmonize, conduct_band
deploy: npm @0.5.0 + mcp.thiri.ai
repo_path: thiri-mcp
started: 2026-06-19
tag: conductor-mcp-v0.1.0
---

# THIRI MCP

Chord intelligence MCP (hosted + npm) plus local Desktop companions:

- `thiri-mcp` — 4 theory tools + `conduct_band`
- `thiri-conductor-mcp` — thin client: `render_audio` via hosted `POST /v2/render` (server-side Csound), local playback
- `thiri-composition-mcp` — thin client: Composition IR via hosted `POST /v2/compose` (fluidsynth preview local only)

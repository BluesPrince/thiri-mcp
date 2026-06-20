# 🎷 THIRI Chord Intelligence — MCP Server

[![npm](https://img.shields.io/npm/v/@bluesprincemedia/thiri-mcp)](https://www.npmjs.com/package/@bluesprincemedia/thiri-mcp)
[![license](https://img.shields.io/npm/l/@bluesprincemedia/thiri-mcp)](./LICENSE)
![MCP](https://img.shields.io/badge/MCP-server-black)

**Give your AI real music theory.** THIRI is the deterministic **music theory MCP server + API** for AI builders — it lets Claude, Cursor, or any [MCP](https://modelcontextprotocol.io) agent **analyze chords, run roman-numeral analysis, generate voicings, and reharmonize progressions** with answers that are *computed, not guessed*.

LLMs hallucinate music theory: wrong notes, fake roman numerals, voicings that don't voice-lead. THIRI is a **deterministic** engine (pitch-class-set theory over ℤ/12) behind a hosted API — so `C7sus4` keeps its suspension, `Caug` spells `C E G#`, and "Coltrane changes on Dm7 G7 Cmaj7" returns `Cmaj7 Ab7 Abmaj7 E7`, every time.

**Downstream of Suno / Udio or any generator?** Wrap the output and get a correct chord chart your agent can trust. And unlike `tonal.js` or `music21`, THIRI is hosted and agent-native (no install, any language) — and it *reharmonizes* and *voice-leads*, not just looks chords up.

> ⭐ If this is useful, star the repo — it helps other musicians and agent builders find it.

## What you can ask
> *"Analyze Dm7b5 in C."* → `iiø7`, half-diminished, borrowed predominant, + scale options
> *"What notes are in C7sus4?"* → `C F G Bb` (the suspension survives)
> *"Give me a rootless Cmaj7 voicing, then voice-lead into Dm7."* → voicings + a voice-leading score
> *"Reharmonize Dm7 G7 Cmaj7 with Coltrane changes."* → `Cmaj7 Ab7 Abmaj7 E7`

## Tools
| Tool | What it does |
|------|-------------|
| `analyze_chord` | Chord → root, quality, intervals, roman numeral & harmonic function (secondary dominants, modal-interchange labels) |
| `resolve_chord` | Chord → spelled notes (enharmonically correct), frequencies, MIDI, scale recommendations |
| `generate_voicing` | Instrument-ready voicings (rootless/bill_evans, shell, triad, pad, guide-tones, drop-2/3); pass `previousNotes` for a **voice-leading score**; `colorPreferences` for explicit tensions |
| `reharmonize` | Progression reharmonization — 8 techniques: `tritone_sub`, `ii_v_insertion`, `modal_interchange`, `diminished_passing`, `secondary_dominant`, `chain_of_dominants`, `coltrane_changes`, `backdoor` (or `auto`) |
| `conduct_band` | Natural-language band conduct → lanes + MIDI (hosted MCP v0.3+) |

> Runs on the **v2 grid engine** — correct sus chords, real triads, enharmonic spelling, all altered dominants — with request timeouts, quota reporting, and structured errors.

### Local Csound MCP (Desktop only)

For **hear-it** agent loops (conduct → Csound score → WAV), add a second local server alongside hosted theory tools:

```json
{
  "mcpServers": {
    "thiri": {
      "command": "npx",
      "args": ["-y", "@bluesprincemedia/thiri-mcp"],
      "env": { "THIRI_API_KEY": "sk_live_your_key" }
    },
    "thiri-conductor": {
      "command": "npx",
      "args": ["-y", "@bluesprincemedia/thiri-mcp", "thiri-conductor-mcp"],
      "env": { "THIRI_API_KEY": "sk_live_your_key" }
    },
    "thiri-composition": {
      "command": "npx",
      "args": ["-y", "@bluesprincemedia/thiri-mcp", "thiri-composition-mcp"]
    }
  }
}
```

| Bin | Tools |
|-----|-------|
| `thiri-conductor-mcp` | `conduct_band`, `build_csound_score`, `render_csound_wav`, `play_audio`, `search_csound_corpus`, `render_with_tension` |
| `thiri-composition-mcp` | Composition IR tools + `play_composition` (fluidsynth preview) |

Requires **Csound CLI** on PATH for WAV render. Proof: `npm run test:conductor` · live docs: [build.thiri.ai/lab/conductor-mcp](https://build.thiri.ai/lab/conductor-mcp) · [agent recipes](https://build.thiri.ai/lab/agent-recipes).

### Conductor Agent (vibe compose)

End-to-end persona for local vibe composition — skill, CLI, and Band dashboard panel:

| Entry | Command / path |
|-------|----------------|
| **Cursor skill** | Copy `THIRI/lab/skills/thiri-conductor-agent/SKILL.md` → `~/.cursor/skills/thiri-conductor-agent/SKILL.md` |
| **CLI** | `cd thiri-mcp && npm run conductor:vibe -- "gospel ballad in F minor"` |
| **Dashboard** | `npm run dev:studio` → [localhost:5173/band](http://localhost:5173/band) → **Vibe Conduct** panel |
| **Lab proof** | [build.thiri.ai/lab/conductor-agent](https://build.thiri.ai/lab/conductor-agent) |

Dual MCP config above + `mapConductResultToStudioModules` after each `conduct_band`. Last CLI render writes `~/.thiri/conductor-last.json` (local only, not committed).

### Flagship agent recipe (analyze → conduct → render → critique)

Paste in order after dual MCP config above:

1. **Analyze** — *"Analyze Dm7 G7 Cmaj7 in key C with analyze_chord; summarize roman numerals and tension."*
2. **Conduct** — *"conduct_band: warm Rhodes pad, walking bass, brush drums, 8 bars medium swing in C."*
3. **Render** — *"build_csound_score from lanes, then render_csound_wav at tempo 120."*
4. **Critique** — *"play_audio; critique voice-leading and register balance; suggest one revision."*

Full prompts: [build.thiri.ai/lab/agent-recipes](https://build.thiri.ai/lab/agent-recipes)

### Hosted vs local boundary

| Surface | Csound WAV |
|---------|------------|
| `mcp.thiri.ai` / hosted connector | No — theory + `conduct_band` lanes only |
| Local `thiri-conductor-mcp` | Yes — requires Csound CLI on your machine |

## Install
Get a free key at **[build.thiri.ai/developers](https://build.thiri.ai/developers)**, then pick a path:

**Claude Desktop / web / mobile — hosted (one-click custom connector, nothing to install):**
Settings → Connectors → **Add custom connector** → URL `https://mcp.thiri.ai/mcp` → paste your `sk_live_` key on the consent page. Same 4 tools, same key, same quota — no config file, no `npx`.

**Claude Code (one line):**
```sh
claude mcp add thiri --env THIRI_API_KEY=sk_live_your_key -- npx -y @bluesprincemedia/thiri-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "thiri": {
      "command": "npx",
      "args": ["-y", "@bluesprincemedia/thiri-mcp"],
      "env": { "THIRI_API_KEY": "sk_live_your_key" }
    }
  }
}
```

## Prefer raw HTTP? (no MCP needed)
The same engine is a plain REST API:
```sh
curl -X POST https://chords.thiri.ai/v2/analyze \
  -H "Authorization: Bearer YOUR_KEY" -H "content-type: application/json" \
  -d '{"chord":"Dm7b5","key":"C"}'
```
Four endpoints: `/v2/analyze`, `/v2/resolve`, `/v2/voicing`, `/v2/reharmonize`, `/v2/conduct`. See [`openapi.yaml`](./openapi.yaml).

## Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `THIRI_API_KEY` | (none) | Bearer token (`sk_live_…`) — get one at build.thiri.ai/developers |
| `THIRI_API_URL` | `https://chords.thiri.ai` | API base (override only for local dev) |

## Development
```sh
npm install && npm run build && npm start
```

## License
MIT — © 2026 Blues Prince Media. The client is open; the engine is a hosted service.

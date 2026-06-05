# 🎷 THIRI Chord Intelligence — MCP Server

[![npm](https://img.shields.io/npm/v/@bluesprincemedia/thiri-mcp)](https://www.npmjs.com/package/@bluesprincemedia/thiri-mcp)
[![license](https://img.shields.io/npm/l/@bluesprincemedia/thiri-mcp)](./LICENSE)
![MCP](https://img.shields.io/badge/MCP-server-black)

**Give your AI real music theory.** An [MCP](https://modelcontextprotocol.io) server that lets Claude, Cursor, or any MCP client **analyze, resolve, voice, and reharmonize** any chord — with answers that are *computed, not guessed*.

LLMs hallucinate music theory: wrong notes, fake roman numerals, voicings that don't voice-lead. THIRI is a **deterministic** engine (pitch-class-set theory over ℤ/12) behind a hosted API — so `C7sus4` keeps its suspension, `Caug` spells `C E G#`, and "Coltrane changes on Dm7 G7 Cmaj7" returns `Cmaj7 Ab7 Abmaj7 E7`, every time.

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

> Runs on the **v2 grid engine** — correct sus chords, real triads, enharmonic spelling, all altered dominants — with request timeouts, quota reporting, and structured errors.

## Install
Get a free key at **[build.thiri.ai/developers](https://build.thiri.ai/developers)**, then:

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
Four endpoints: `/v2/analyze`, `/v2/resolve`, `/v2/voicing`, `/v2/reharmonize`. See [`openapi.yaml`](./openapi.yaml).

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

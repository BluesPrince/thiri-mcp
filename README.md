# @bluesprincemedia/thiri-mcp

MCP server for the **THIRI Chord Intelligence API** — analyze, resolve, voice, and reharmonize any chord symbol from Claude, Cursor, or any MCP client. A thin, local **stdio** adapter over the REST API at `https://chords.thiri.ai`.

## Tools

| Tool | What It Does |
|------|-------------|
| `analyze_chord` | Parse chord → root, quality, intervals, harmonic function (incl. secondary dominants & modal-interchange labels) |
| `resolve_chord` | Chord → spelled notes (enharmonically correct), frequencies, MIDI, scale recommendations |
| `generate_voicing` | Instrument-ready voicings (rootless/bill_evans, shell, triad, pad, guide-tones, drop-2, drop-3); pass `previousNotes` for a voice-leading score; `colorPreferences` for explicit tensions |
| `reharmonize` | Progression reharmonization — 8 techniques: tritone_sub, ii_v_insertion, modal_interchange, diminished_passing, secondary_dominant, chain_of_dominants, coltrane_changes, backdoor (or `auto`) |

> **v0.2.0** runs on the v2 grid engine: deterministic pitch-class-set theory (correct sus chords, real triads, enharmonic spelling, all altered dominants). Includes a request timeout, quota-header reporting, and structured error messages.

## Setup

Get a key from THIRI, then add the server to your MCP client.

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

Then ask your assistant things like *"analyze Dm7b5 in C"* or *"reharmonize Cmaj7 | A7 | Dm7 | G7."*

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `THIRI_API_KEY` | (none) | Bearer token for the THIRI API (`sk_live_…`) |
| `THIRI_API_URL` | `https://chords.thiri.ai` | API base URL (override only for local dev) |

> The key works against **`chords.thiri.ai`**, not `api.thiri.ai` (that's the separate licensing API and will reject it).

## Development

```sh
npm install
npm run build
npm start
```

## License

MIT — © 2026 Blues Prince Media

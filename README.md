# @bluesprince/thiri-mcp

MCP server for the **THIRI Chord Intelligence API** — analyze, resolve, voice, and reharmonize any chord symbol from Claude, Cursor, or any MCP client.

## Tools

| Tool | What It Does |
|------|-------------|
| `analyze_chord` | Parse chord → root, quality, intervals, harmonic function |
| `resolve_chord` | Chord → spelled notes, frequencies, MIDI, scale recommendations |
| `generate_voicing` | Instrument-ready voicings (rootless, shell, drop2, drop3, pad, triad) with voice leading |
| `reharmonize` | Progression reharmonization with substitutions and alternative versions |

## Setup (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thiri": {
      "command": "node",
      "args": ["/Users/admin/Blues Prince Media GitHub/thiri-mcp/dist/index.js"],
      "env": {
        "THIRI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `THIRI_API_KEY` | (none) | Bearer token for the THIRI API |
| `THIRI_API_URL` | `https://thiri.ai` | API base URL (override for local dev) |

## Development

```sh
npm install
npm run build
npm start
```

## License

MIT — © 2026 Blues Prince Media

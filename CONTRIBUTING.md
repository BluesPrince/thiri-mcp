# Contributing

Thin MCP adapter over the THIRI Chord Intelligence API. See [AGENTS.md](./AGENTS.md) for full agent context.

## Build & test

```bash
npm ci                  # install pinned deps
npm run build           # compile TypeScript (tsc) to dist/
npx tsc --noEmit        # typecheck
node wrapper-test.mjs   # unit-test the wrapper hardening logic (needs dist/)
node mcp-comp-test.mjs  # drive the composition server over stdio
```

> Tests are pure-node scripts run directly (there is no `npm test` script). `wrapper-test.mjs` reads `dist/index.js`, so build first.

## Configuration

- API base URL: `https://chords.thiri.ai` (env `THIRI_API_URL`). Do **not** use `api.thiri.ai` — that host is the paying-customer licensing backend and will 401 dev keys.
- Never commit an API key. Keys come from env only.

## Workflow

Make the requested change, run the build, then stop. This package is published as an npm / MCP server — **do not deploy from CI; open an MR only.**

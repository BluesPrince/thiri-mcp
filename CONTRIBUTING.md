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

## Release checklist

1. Bump `version` in `package.json`, run `npm install` (keeps the lockfile in sync — CI runs `npm ci` and fails on drift), build, and make sure CI is green.
2. `npm publish` (manual, from a trusted machine).
3. Tag and cut a GitHub Release: `git tag vX.Y.Z && git push origin vX.Y.Z && gh release create vX.Y.Z --generate-notes` — release notes are the raw material for the build-in-public post (draft it into the Notion Publishing Pipeline).
4. Update the official MCP registry entry (`ai.thiri/chord-intelligence`) so it doesn't drift from npm: `mcp-publisher login` then `mcp-publisher publish` (install: `brew install mcp-publisher`).

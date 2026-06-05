# THIRI MCP — Agent Context

Thin MCP adapter over the THIRI Chord Intelligence API.

## Build / test
- `npm ci` then `npm test`. Typecheck with `npx tsc --noEmit`.

## Deploy
- Published as an npm package / MCP server. Do NOT deploy from CI; open an MR only.

## Hard rules
- The dev API base URL is `https://chords.thiri.ai` (env `THIRI_API_URL`). Do NOT use
  `api.thiri.ai` — today that host is the paying-customer licensing backend and will 401 dev
  keys. (A migration to `api.thiri.ai/v1` is tracked separately; do not anticipate it here.)
- Never commit an API key. Keys come from env only.
- Make the requested change, run the build, then stop. Never deploy.

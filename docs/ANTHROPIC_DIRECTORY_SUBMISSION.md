# THIRI — Anthropic Connector Directory Submission Pack

> **STATUS: DRAFT / HOLD.** Do not submit before (1) the Monday provisional-patent + trademark
> filing lands, (2) the operator confirms the meter/public-access posture, and (3) the redeploys
> below ship. This file is the assembled, IP-scrubbed copy + reviewer pack so submission is a
> form-fill when the gate clears.
>
> Path: **Remote MCP server** → form `https://clau.de/mcp-directory-submission`
> (NOT the Desktop-Extension/MCPB form — MCPB packaging is optional and not pursued here.)

---

## 1. Listing fields (copy-paste)

| Field | Value |
|---|---|
| **Server name** | THIRI Chord Intelligence |
| **Connector URL** | `https://mcp.thiri.ai/mcp` |
| **Transport** | Streamable HTTP |
| **Authentication** | OAuth 2.0 (Dynamic Client Registration + PKCE S256) |
| **Capabilities** | Read-only (all tools `readOnlyHint: true`; no write/destructive ops) |
| **Tagline** | Give your AI real music theory. |
| **Category** | Developer tools / Creative |
| **Documentation** | `https://build.thiri.ai/developers` · README in the published `@bluesprincemedia/thiri-mcp` package |
| **Privacy policy** | `https://thiri.ai/privacy` |
| **Terms** | `https://thiri.ai/terms` |
| **Support** | ⚠️ PICK ONE (see §4) — recommend `enterprise@thiri.ai` (already on the legal pages) |

### Description (IP-safe — no method disclosure, no "patent pending")
> THIRI is a deterministic music-theory engine for chords and progressions. It parses any chord
> symbol, resolves it to spelled notes / frequencies / MIDI, generates instrument-ready voicings
> with voice-leading, and reharmonizes progressions — every answer computed (not generated),
> correct on every call, in milliseconds. It gives an AI assistant precise, reproducible harmonic
> reasoning instead of plausible-sounding guesses.

### Use cases (≥3 — scrubbed of proprietary technique names as public hooks)
1. **Analyze any chord in context** — "What is Cmaj7/E in the key of G?" → root, quality, intervals, Roman numeral, function.
2. **Voice a chord for an instrument** — "Give me a rootless voicing for Dm7 leading from these notes" → playable notes + a voice-leading score.
3. **Reharmonize a progression** — "Reharmonize Dm7 G7 Cmaj7" → alternative progressions, each with a plain-English explanation of the substitution.
4. **Resolve a chord to playable data** — spelled notes, Hz, MIDI numbers, and recommended improvisation scales.

### Tools (all read-only; `title` + `readOnlyHint: true` set as of the annotations commit)
| Tool | Title | Read-only |
|---|---|---|
| `analyze_chord` | Analyze Chord | ✅ |
| `resolve_chord` | Resolve Chord | ✅ |
| `generate_voicing` | Generate Voicing | ✅ |
| `reharmonize` | Reharmonize Progression | ✅ |

---

## 2. Reviewer test account + connect steps

**Provision (operator):** mint one fresh **builder-tier** key for Anthropic review:
`POST https://chords.thiri.ai/v1/keys` with the `X-Admin-Secret` header → returns `sk_live_…`
(builder tier = 50,000 calls/mo; there is no separate "comp" tier — a comped key is a free-issued builder key).

**Connect (give reviewers verbatim):**
1. Claude → Settings → Connectors → **Add custom connector**.
2. URL: `https://mcp.thiri.ai/mcp`
3. Complete the OAuth prompt; on the consent page paste the provided `sk_live_…` key.
4. Approve — the four THIRI tools appear.

**Sample prompts for reviewers:**
- "Analyze the chord G7#11 in the key of C."
- "Resolve F#dim7 to notes, frequencies, and MIDI."
- "Reharmonize the progression Cmaj7 Dm7 G7 Cmaj7."

(28-case tool battery in `MCP_TEST_BATTERY.md`; 10 NL prompts in `MCP_CHAT_TEST.md`.)

---

## 3. Pre-submission checklist

**Done (this session):**
- [x] Tool annotations (`title` + `readOnlyHint`) — remote worker (`feat/mcp-tool-annotations`) + stdio server.
- [x] LICENSE file added to `thiri-mcp` (backs the MIT claim).
- [x] Privacy + Terms links added to the build-site footer (→ apex URLs).

**Remaining — REQUIRES OPERATOR / DEPLOY (held):**
- [ ] **Redeploy the remote MCP worker** from `feat/mcp-tool-annotations` so the live `mcp.thiri.ai` tools carry the annotations. *(deploy-gated)*
- [ ] **Deploy the build-site** so the footer policy links go live. *(deploy-gated)*
- [ ] **Square PNG logo (e.g. 512×512) + favicon** — current only asset is a 1920×1080 JPEG (wrong format + aspect). *(needs design export)*
- [ ] **Reconcile to ONE support email** across privacy/terms/developers/npm (see §4).
- [ ] **Mint + package the reviewer key** per §2.
- [ ] **Rotate** the `sk_live_…` key currently hardcoded in `~/.claude.json` before reviewer exposure.
- [ ] **Decide** whether to scrub the `reharmonize` tool *description* of signature technique names (`coltrane_changes`, `backdoor`) — tension: they're also the functional `technique` values devs pass. Operator call, tied to IP timing.

---

## 4. Open decisions for the operator
- **Support email** — surfaces differ: `enterprise@thiri.ai` (privacy/terms), `dennison@bluesprincemedia.com` (developers page), `privacy@bluesprincemedia.com` (VST), `api@bluesprince.ai` (npm author). The directory wants one verified channel.
- **Meter posture** — a public listing + OAuth/DCR lets the public self-provision. Confirm whether the free tier flips on or stays comped before opening the funnel.
- **IP timing** — directory does not require *filed* IP (the ToS trade-secret/no-reverse-engineer posture is legally sufficient), so the Monday gate is a risk-appetite call, not a compliance blocker.

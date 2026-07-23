#!/usr/bin/env node
// THIRI Conductor MCP — thin client over the hosted arrange + render pipeline.
//
// The Csound render chain (score assembly, the thiri-band.orc orchestra, tension
// mapper) is the sonic IP. It used to ship in this package and run locally; now it
// runs server-side behind POST /v2/render, and this process just calls the API and
// handles the returned WAV. The only local bit is playback (afplay) — not IP.
//
// Requires a THIRI API key:  export THIRI_API_KEY=sk_live_...   (get one at
// https://build.thiri.ai/keys). Optional: THIRI_API_URL (default chords.thiri.ai).
//
// Run:  THIRI_API_KEY=sk_live_… node conductor-server.mjs   (stdio MCP)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeWavBytes, playWav, playbackEnv } from "./local-audio.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, "vendor", "csound-corpus-summary.json");

const API_URL = (process.env.THIRI_API_URL || "https://chords.thiri.ai").replace(/\/$/, "");
const API_KEY = process.env.THIRI_API_KEY || "";
const TIMEOUT_MS = Number(process.env.THIRI_TIMEOUT_MS) || 120000;

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }], isError: true });

function requireKey() {
  if (!API_KEY) throw new Error("THIRI_API_KEY is not set. Get a key at https://build.thiri.ai/keys and export THIRI_API_KEY.");
}

async function apiJson(path, body) {
  requireKey();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.message ? `${j.error ?? "error"}: ${j.message}` : msg; } catch {}
    throw new Error(`${path} failed: ${msg}`);
  }
  return res.json();
}

// POST /v2/render → raw WAV bytes (audio/wav). Accepts a prompt or a conduct response.
async function apiRender({ prompt, conduct, tension }) {
  requireKey();
  const res = await fetch(`${API_URL}/v2/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(prompt ? { prompt, tension } : { conduct, tension }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.message ? `${j.error ?? "error"}: ${j.message}` : msg; } catch {}
    throw new Error(`/v2/render failed: ${msg}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const server = new McpServer({ name: "thiri-conductor", version: "0.2.0" });

server.tool(
  "conduct_band",
  "Arrange a 4-piece band from a text prompt via POST /v2/conduct. Returns conductor metadata, lanes, leadSheet, and midiBase64.",
  { prompt: z.string().describe("Musical direction, e.g. 'gospel band in F minor, warm pad, swing'") },
  async ({ prompt }) => {
    try {
      const data = await apiJson("/v2/conduct", { prompt });
      return ok({
        conductor: data.conductor,
        leadSheet: data.leadSheet,
        laneCount: data.lanes?.length ?? 0,
        lanes: (data.lanes ?? []).map((l) => ({ role: l.role, noteCount: l.notes?.length ?? 0, summary: l.summary })),
        midiBase64: data.midiBase64 ? `${data.midiBase64.slice(0, 48)}… (${data.midiBase64.length} chars)` : null,
        _full: data,
      });
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "render_audio",
  "Render a band arrangement to a WAV file via POST /v2/render (server-side Csound). Pass a 'prompt' to arrange+render in one call, or a prior conduct response. Optionally play it locally.",
  {
    prompt: z.string().optional().describe("If set, arranges + renders from this prompt"),
    conductResponse: z.any().optional().describe("A prior /v2/conduct response (conductor + lanes) to render"),
    tension: z.number().min(0).max(1).optional().describe("0–1 harmonic tension → score brightness"),
    wavPath: z.string().optional(),
    play: z.boolean().optional().describe("Play through speakers after rendering (local afplay)"),
  },
  async ({ prompt, conductResponse, tension, wavPath, play }) => {
    try {
      if (!prompt && !conductResponse) return fail("Provide a 'prompt' or a 'conductResponse'.");
      const bytes = await apiRender({ prompt, conduct: conductResponse, tension });
      const out = writeWavBytes(bytes, wavPath || `/tmp/thiri-render-${Date.now()}.wav`);
      const result = { wavPath: out.path, bytes: out.bytes, tension: tension ?? null, played: false };
      if (play) {
        const env = playbackEnv();
        if (!env.canPlay) result.playError = "afplay not available on this machine";
        else { const p = playWav(out.path); result.played = p.ok; if (!p.ok) result.playError = p.reason; }
      }
      return ok(result);
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "play_audio",
  "Play a WAV file through speakers via afplay (macOS). LOCAL ONLY.",
  { wavPath: z.string() },
  async ({ wavPath }) => { const r = playWav(wavPath); return r.ok ? ok({ played: true, wavPath }) : fail(r.reason); },
);

server.tool(
  "search_csound_corpus",
  "Search the indexed Csound FLOSS corpus (public instrument index). Read-only; returns matching instrument summaries.",
  { query: z.string(), category: z.string().optional(), limit: z.number().optional() },
  async ({ query, category, limit }) => {
    try {
      const data = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
      const q = query.toLowerCase();
      const max = Math.min(limit ?? 20, 50);
      const hits = (data.instruments ?? []).filter((inst) => {
        if (category && inst.category !== category) return false;
        return `${inst.name} ${inst.category} ${inst.sourceRepo} ${(inst.opcodes || []).join(" ")}`.toLowerCase().includes(q);
      }).slice(0, max);
      return ok({ query, count: hits.length, stats: data.stats, instruments: hits });
    } catch (e) { return fail(e.message); }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const env = playbackEnv();
  console.error(`[thiri-conductor] thin client → ${API_URL} · key ${API_KEY ? "set ✓" : "MISSING ✗ (set THIRI_API_KEY)"} · playback: afplay ${env.afplay ? "✓" : "✗"}`);
}
main().catch((e) => { console.error("[thiri-conductor] fatal:", e); process.exit(1); });

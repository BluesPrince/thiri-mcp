#!/usr/bin/env node
// THIRI Conductor MCP — local Desktop companion for Csound render/play.
// Calls /v2/conduct (or uses vendored engine when THIRI_USE_LOCAL_ENGINE=1),
// converts lanes → Csound score via @thiri/csound-core, renders WAV via csound CLI.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lanesToScore, renderCsoundWav, playWav, csoundEnv, applyTensionToScore } from "./vendor/thiri-csound-core/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, "vendor", "csound-corpus-summary.json");

const API_URL = process.env.THIRI_API_URL || "https://chords.thiri.ai";
const API_KEY = process.env.THIRI_API_KEY || "";
const TIMEOUT_MS = Number(process.env.THIRI_TIMEOUT_MS) || 20000;

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }], isError: true });

async function fetchConduct(prompt) {
  if (!API_KEY) throw new Error("THIRI_API_KEY is not set.");
  const res = await fetch(`${API_URL}/v2/conduct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.message ? `${j.error ?? "error"}: ${j.message}` : msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

const server = new McpServer({ name: "thiri-conductor", version: "0.1.0" });

server.tool(
  "conduct_band",
  "Arrange a 4-piece band from a text prompt via POST /v2/conduct. Returns conductor metadata, lanes, leadSheet, and midiBase64.",
  { prompt: z.string().describe("Musical direction, e.g. 'gospel band in F minor, warm pad, swing'") },
  async ({ prompt }) => {
    try {
      const data = await fetchConduct(prompt);
      return ok({
        conductor: data.conductor,
        leadSheet: data.leadSheet,
        laneCount: data.lanes?.length ?? 0,
        lanes: (data.lanes ?? []).map((l) => ({
          role: l.role,
          noteCount: l.notes?.length ?? 0,
          summary: l.summary,
        })),
        midiBase64: data.midiBase64 ? `${data.midiBase64.slice(0, 48)}… (${data.midiBase64.length} chars)` : null,
        _full: data,
      });
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.tool(
  "build_csound_score",
  "Convert a /v2/conduct response (conductor + lanes) into Csound score i-statements for thiri-band.orc.",
  {
    conduct: z.any().describe("Full conduct response object, or use conductResponse field"),
    conductResponse: z.any().optional(),
  },
  async ({ conduct, conductResponse }) => {
    try {
      const data = conductResponse ?? conduct;
      const score = lanesToScore(data);
      return ok({ score, lineCount: score.split("\n").length, durationSec: data.conductor?.durationSec });
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.tool(
  "render_csound_wav",
  "Render conduct lanes to a WAV file using the Csound CLI and thiri-band.orc. LOCAL ONLY.",
  {
    conduct: z.any().optional(),
    conductResponse: z.any().optional(),
    prompt: z.string().optional().describe("If set, calls /v2/conduct first"),
    wavPath: z.string().optional().describe("Output path (default /tmp/thiri-conduct-<ts>.wav)"),
  },
  async ({ conduct, conductResponse, prompt, wavPath }) => {
    try {
      let data = conductResponse ?? conduct;
      if (prompt) data = await fetchConduct(prompt);
      if (!data?.conductor || !data?.lanes) return fail("Provide conduct response or prompt");
      const score = lanesToScore(data);
      const out = renderCsoundWav(score, { wavPath: wavPath ?? `/tmp/thiri-conduct-${Date.now()}.wav` });
      if (!out.ok) return fail(out.reason);
      return ok({
        wavPath: out.wavPath,
        csdPath: out.csdPath,
        durationSec: data.conductor.durationSec,
        leadSheet: data.leadSheet,
        csound: csoundEnv().csound,
      });
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.tool(
  "play_audio",
  "Play a WAV file through speakers via afplay (macOS). LOCAL ONLY.",
  { wavPath: z.string(), blocking: z.boolean().optional() },
  async ({ wavPath }) => {
    const r = playWav(wavPath);
    if (!r.ok) return fail(r.reason);
    return ok({ played: true, wavPath });
  },
);

server.tool(
  "csound_env",
  "Report local Csound CLI and afplay availability (for agent self-diagnosis).",
  {},
  async () => ok(csoundEnv()),
);

server.tool(
  "search_csound_corpus",
  "Search the indexed Csound FLOSS corpus (5316 instruments). Read-only; returns matching instrument summaries.",
  { query: z.string(), category: z.string().optional(), limit: z.number().optional() },
  async ({ query, category, limit }) => {
    try {
      const data = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
      const q = query.toLowerCase();
      const max = Math.min(limit ?? 20, 50);
      const hits = (data.instruments ?? [])
        .filter((inst) => {
          if (category && inst.category !== category) return false;
          const hay = `${inst.name} ${inst.category} ${inst.sourceRepo} ${(inst.opcodes || []).join(" ")}`.toLowerCase();
          return hay.includes(q);
        })
        .slice(0, max);
      return ok({ query, count: hits.length, stats: data.stats, instruments: hits });
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.tool(
  "render_with_tension",
  "Render conduct response to WAV with harmonic tension (0–1) mapped to score brightness.",
  { conductResponse: z.any(), tension: z.number().min(0).max(1), wavPath: z.string().optional() },
  async ({ conductResponse, tension, wavPath }) => {
    try {
      let score = lanesToScore(conductResponse);
      score = applyTensionToScore(score, tension);
      const out = renderCsoundWav(score, { wavPath: wavPath ?? `/tmp/thiri-tension-${Date.now()}.wav` });
      if (!out.ok) return fail(out.reason);
      return ok({ wavPath: out.wavPath, tension, durationSec: conductResponse.conductor?.durationSec });
    } catch (e) {
      return fail(e.message);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const env = csoundEnv();
  console.error(
    `[thiri-conductor] running · csound ${env.csound ? "✓" : "✗"} · afplay ${env.afplay ? "✓" : "✗"}`,
  );
}

main().catch((e) => {
  console.error("[thiri-conductor] fatal:", e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Smoke test for thiri-conductor-mcp (score builder + optional live conduct/render).
 * Usage:
 *   node mcp-conductor-test.mjs
 *   THIRI_KEY=sk_live_... node mcp-conductor-test.mjs --live
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lanesToScore, renderCsoundWav, csoundEnv } from "./vendor/thiri-csound-core/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVE = process.argv.includes("--live");
const KEY = process.env.THIRI_KEY || process.env.THIRI_API_KEY || "";

const MOCK_CONDUCT = {
  conductor: { tempo: 120, ppq: 480, durationSec: 4, groove: "swing", swing: 0.1, energy: { start: 0.5, peak: 0.8, end: 0.5 } },
  leadSheet: "| Cmaj7 | Dm7 | G7 | Cmaj7 |",
  lanes: [
    {
      role: "harmony",
      notes: [{ startTick: 0, durTicks: 1920, pitch: 60, velocity: 90 }],
    },
    {
      role: "bass",
      notes: [{ startTick: 0, durTicks: 1920, pitch: 48, velocity: 85 }],
    },
    {
      role: "drums",
      notes: [
        { startTick: 0, durTicks: 480, pitch: 36, velocity: 110 },
        { startTick: 480, durTicks: 480, pitch: 42, velocity: 70 },
      ],
    },
  ],
};

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("\n=== THIRI Conductor MCP smoke ===\n");

const score = lanesToScore(MOCK_CONDUCT);
ok("lanesToScore produces i-statements", score.includes("i 99") && score.includes("i 3"));
ok("score ends with e", score.trim().endsWith("e"));

const env = csoundEnv();
ok("csound CLI detect", env.canRender || !env.csound, env.csound ?? "not installed");

if (env.canRender) {
  const r = renderCsoundWav(score, { wavPath: `/tmp/thiri-conductor-smoke-${Date.now()}.wav` });
  ok("renderCsoundWav", r.ok, r.wavPath ?? r.reason);
}

if (LIVE && KEY) {
  console.log("\n--- live /v2/conduct ---");
  const res = await fetch("https://chords.thiri.ai/v2/conduct", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ prompt: "8-second gospel band in F minor" }),
  });
  ok("conduct HTTP 200", res.ok, String(res.status));
  if (res.ok) {
    const data = await res.json();
    const liveScore = lanesToScore(data);
    ok("live lanesToScore", liveScore.length > 20);
  }
}

console.log("\n--- MCP tool list (conductor-server) ---");
const proc = spawn("node", ["conductor-server.mjs"], {
  cwd: __dirname,
  stdio: ["pipe", "pipe", "inherit"],
});
let buf = "";
proc.stdout.on("data", (d) => { buf += d; });
proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } } }) + "\n");
await new Promise((r) => setTimeout(r, 500));
proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
await new Promise((r) => setTimeout(r, 500));
proc.kill();
ok("conductor MCP lists tools", /conduct_band|build_csound_score/.test(buf), buf.slice(0, 120));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

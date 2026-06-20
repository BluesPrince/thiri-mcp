#!/usr/bin/env node
/**
 * Conductor Agent CLI — vibe prompt → /v2/conduct → Csound score → WAV.
 *
 * Usage:
 *   node conductor-agent.mjs "gospel ballad in F minor"
 *   node conductor-agent.mjs "dark jazz swing" --play
 *   node conductor-agent.mjs "neo-soul in D" --no-render --json
 *
 * Env: THIRI_API_KEY (required), THIRI_API_URL (optional)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { lanesToScore, renderCsoundWav, playWav, csoundEnv } from "./vendor/thiri-csound-core/index.mjs";

const API_URL = process.env.THIRI_API_URL || "https://chords.thiri.ai";
const API_KEY = process.env.THIRI_API_KEY || "";
const TIMEOUT_MS = Number(process.env.THIRI_TIMEOUT_MS) || 20000;
const STUDIO_BAND_BASE = process.env.THIRI_STUDIO_BAND_URL || "http://localhost:5173/band";

const argv = process.argv.slice(2);
const flags = {
  play: argv.includes("--play"),
  render: !argv.includes("--no-render"),
  json: argv.includes("--json"),
  help: argv.includes("--help") || argv.includes("-h"),
};
const prompt = argv.filter((a) => !a.startsWith("--")).join(" ").trim();

if (flags.help || !prompt) {
  console.error(`Conductor Agent — vibe compose with Csound

Usage:
  node conductor-agent.mjs "<vibe prompt>" [--play] [--no-render] [--json]

Examples:
  node conductor-agent.mjs "gospel ballad in F minor"
  npm run conductor:vibe -- "dark jazz swing in C minor" --play

Requires THIRI_API_KEY and csound on PATH for render.`);
  process.exit(flags.help ? 0 : 1);
}

async function fetchConduct(text) {
  if (!API_KEY) throw new Error("THIRI_API_KEY is not set.");
  const res = await fetch(`${API_URL}/v2/conduct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ prompt: text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.message ? `${j.error ?? "error"}: ${j.message}` : msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

function progressionFromConduct(data) {
  const harmony = data.lanes?.find((l) => l.role === "harmony");
  if (harmony?.summary?.includes("|")) return harmony.summary.trim();

  const bars = data.conductor?.bars;
  if (Array.isArray(bars) && bars.length > 0) {
    const symbols = bars
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object" && "chord" in b) return String(b.chord);
        return null;
      })
      .filter(Boolean);
    if (symbols.length) return symbols.join(" | ");
  }
  return data.leadSheet?.trim() || null;
}

function buildBandUrl(data) {
  const params = new URLSearchParams();
  const progression = progressionFromConduct(data);
  if (progression) params.set("progression", progression.replace(/\s*\|\s*/g, "|"));
  const conductor = data.conductor ?? {};
  if (conductor.key) params.set("key", String(conductor.key));
  else if (conductor.tonic) params.set("key", String(conductor.tonic));
  const bpm = conductor.tempo ?? conductor.bpm;
  if (typeof bpm === "number") params.set("bpm", String(bpm));
  const pattern = data.lanes?.find((l) => l.role === "pattern");
  if (pattern?.summary) params.set("summary", pattern.summary);
  const qs = params.toString();
  return qs ? `${STUDIO_BAND_BASE}?${qs}` : STUDIO_BAND_BASE;
}

function writeLastArtifact(payload) {
  try {
    const dir = join(homedir(), ".thiri");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "conductor-last.json"), JSON.stringify(payload, null, 2));
  } catch {
    /* ignore */
  }
}

async function main() {
  if (!flags.json) console.error(`[conductor-agent] conducting: ${prompt}`);

  const data = await fetchConduct(prompt);
  const laneSummary = (data.lanes ?? []).map((l) => ({
    role: l.role,
    noteCount: l.notes?.length ?? 0,
    summary: l.summary ?? null,
  }));

  let wavPath = null;
  let csdPath = null;
  let renderError = null;

  if (flags.render) {
    const env = csoundEnv();
    if (!env.canRender) {
      renderError = env.csound ? "Csound render failed" : "csound CLI not on PATH";
      if (!flags.json) console.error(`[conductor-agent] render skipped: ${renderError}`);
    } else {
      const score = lanesToScore(data);
      const out = renderCsoundWav(score, { wavPath: `/tmp/thiri-conduct-${Date.now()}.wav` });
      if (out.ok) {
        wavPath = out.wavPath;
        csdPath = out.csdPath;
        if (!flags.json) console.error(`[conductor-agent] WAV → ${wavPath}`);
      } else {
        renderError = out.reason;
        if (!flags.json) console.error(`[conductor-agent] render failed: ${out.reason}`);
      }
    }
  }

  if (flags.play && wavPath) {
    const played = playWav(wavPath);
    if (!played.ok && !flags.json) console.error(`[conductor-agent] play failed: ${played.reason}`);
  }

  const bandUrl = buildBandUrl(data);
  const result = {
    prompt,
    conductor: data.conductor,
    leadSheet: data.leadSheet,
    lanes: laneSummary,
    bandUrl,
    wavPath,
    csdPath,
    renderError,
    at: new Date().toISOString(),
  };

  writeLastArtifact(result);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("\n── Conductor Agent ──");
    console.log(`Lead sheet: ${data.leadSheet ?? "—"}`);
    console.log(`Lanes: ${laneSummary.map((l) => l.role).join(", ") || "—"}`);
    console.log(`Band studio: ${bandUrl}`);
    if (wavPath) console.log(`WAV: ${wavPath}`);
    console.log(`Artifact: ~/.thiri/conductor-last.json`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(`[conductor-agent] fatal: ${e.message}`);
  process.exit(1);
});

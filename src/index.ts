#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPABILITY_MANIFEST_PATH = join(__dirname, "../../THIRI/lab/agent-capability.v1.json");

const API_URL = process.env.THIRI_API_URL || "https://chords.thiri.ai";
const API_KEY = process.env.THIRI_API_KEY || "";
const REQUEST_TIMEOUT_MS = Number(process.env.THIRI_TIMEOUT_MS) || 20000;

// ── API client ─────────────────────────────────────────────
// Targets the v2 grid engine (pitch-class-set theory; fixes the v1 parser/reharm
// bugs by construction). Hardens per the Chase/Jax report: request timeout (#15),
// structured error parsing (#17), and quota-header surfacing (#16).

async function thiriPost(endpoint: string, body: Record<string, unknown>): Promise<any> {
  // Fail fast with a clear message instead of a silent 401 (#17).
  if (!API_KEY) {
    throw new Error("THIRI_API_KEY is not set. Get a key from thiri.ai and set the THIRI_API_KEY environment variable.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v2${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // #15 — no infinite hang
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`THIRI API request timed out after ${REQUEST_TIMEOUT_MS}ms (${endpoint}).`);
    }
    throw new Error(`THIRI API request failed (${endpoint}): ${err?.message ?? String(err)}`);
  }

  if (!res.ok) {
    // Parse the structured {error, message} shape; never echo raw internal detail (#17).
    let code = "error", message = `HTTP ${res.status}`;
    try { const j: any = await res.json(); code = j?.error ?? code; message = j?.message ?? message; } catch { /* non-JSON */ }
    throw new Error(`THIRI API ${res.status} [${code}]: ${message}`);
  }

  const data: any = await res.json();
  // Surface quota headers so an agent can self-pace (#16).
  const limit = res.headers.get("x-quota-limit");
  const used = res.headers.get("x-quota-used");
  if (limit != null || used != null) {
    data.__quota = { limit: limit != null ? Number(limit) : null, used: used != null ? Number(used) : null };
  }
  return data;
}

// Pull the quota footer (if present) off a response and render it for the agent.
function quotaFooter(data: any): string {
  const q = data?.__quota;
  if (!q || (q.limit == null && q.used == null)) return "";
  return `\n\n_Quota: ${q.used ?? "?"} / ${q.limit ?? "?"} this period._`;
}

// ── Response formatters ────────────────────────────────────

function formatResolveResponse(data: any): string {
  const lines: string[] = [
    `## ${data.root}${data.quality}`,
    `**Notes:** ${(data.notes || []).join(" - ")}`,
    `**Intervals:** ${(data.intervals || []).join(" - ")}`,
    `**MIDI:** ${(data.midi || []).join(", ")}`,
    `**Frequencies:** ${(data.frequencies || []).map((f: number) => f + " Hz").join(", ")}`,
  ];

  if (data.scales?.length) {
    lines.push("", "### Recommended Scales");
    for (const s of data.scales) {
      if (typeof s === "string") {
        lines.push(`- ${s}`);
      } else {
        const role = s.role ? ` (${s.role})` : "";
        const char = s.character ? ` -- ${s.character}` : "";
        const deg = s.degrees ? ` [${s.degrees.join(" ")}]` : "";
        lines.push(`- **${s.name}**${role}${deg}${char}`);
      }
    }
  }

  return lines.join("\n");
}

function formatAnalyzeResponse(data: any): string {
  const lines: string[] = [
    `## ${data.symbol}`,
    `**Root:** ${data.root}  **Quality:** ${data.quality}`,
    `**Intervals:** ${(data.intervals || []).join(", ")}`,
  ];

  if (data.numeral) {
    lines.push(`**Roman numeral:** ${data.numeral} (degree ${data.degree})`);
    lines.push(`**Function:** ${data.function}${data.diatonic ? " (diatonic)" : " (chromatic)"}`);
  }

  if (data.scales?.length) {
    lines.push("", "### Scales");
    for (const s of data.scales) {
      lines.push(`- **${s.name}** (${s.role})`);
    }
  }

  lines.push("", "```json", JSON.stringify(data, null, 2), "```");
  return lines.join("\n");
}

function formatVoicingResponse(data: any): string {
  const lines: string[] = [
    `## Voicing: ${data.chord} (${data.style})`,
    `**Notes:** ${(data.notes || []).join(" - ")}`,
  ];

  if (data.midi) lines.push(`**MIDI:** ${data.midi.join(", ")}`);
  if (data.intervals) lines.push(`**Intervals:** ${data.intervals.join(" - ")}`);
  if (data.template) lines.push(`**Template:** ${data.template}`);
  if (data.guideTones?.length) {
    lines.push(`**Guide tones:** ${data.guideTones.map((g: any) => `${g.noteName} (${g.role}, line ${g.line})`).join("; ")}`);
  }
  if (data.voiceLeadingScore != null) lines.push(`**Voice leading score:** ${data.voiceLeadingScore}`);

  lines.push("", "```json", JSON.stringify(data, null, 2), "```");
  return lines.join("\n");
}

// #18 — markdown formatter for reharmonize (was raw JSON.stringify).
function formatReharmonizeResponse(data: any): string {
  const orig = (data?.original || []).join(" | ");
  const lines: string[] = [`## Reharmonize`, `**Original:** \`| ${orig} |\``];
  const alts = data?.alternatives || [];
  if (!alts.length) {
    lines.push("", "_No technique applied to this progression (none matched)._");
  } else {
    lines.push("", `### ${alts.length} alternative${alts.length === 1 ? "" : "s"}`);
    for (const a of alts) {
      lines.push("", `**${a.technique}** — \`| ${(a.progression || []).join(" | ")} |\``);
      if (a.explanation) lines.push(`> ${a.explanation}`);
    }
  }
  lines.push("", "```json", JSON.stringify(data, null, 2), "```");
  return lines.join("\n");
}

// ── Server ─────────────────────────────────────────────────

const server = new McpServer({
  name: "thiri",
  version: "0.3.0",
});

// ── Tool: analyze_chord ────────────────────────────────────

server.tool(
  "analyze_chord",
  "Parse a chord symbol into its root, quality, intervals, extensions, and harmonic function. " +
    "When a key is provided, returns the Roman numeral, scale degree, and whether the chord is diatonic.",
  {
    chord: z.string().describe("Chord symbol (e.g. 'Dm7', 'Cmaj7/E', 'G7#11')"),
    key: z.string().optional().describe("Key center for functional analysis (e.g. 'C', 'Bb')"),
  },
  { title: "Analyze Chord", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ chord, key }) => {
    const result = await thiriPost("/analyze", { chord, ...(key ? { key } : {}) });
    return { content: [{ type: "text" as const, text: formatAnalyzeResponse(result) + quotaFooter(result) }] };
  },
);

// ── Tool: resolve_chord ────────────────────────────────────

server.tool(
  "resolve_chord",
  "Resolve a chord symbol to spelled note names, frequencies in Hz, MIDI numbers, and recommended improvisation scales.",
  {
    chord: z.string().describe("Chord symbol (e.g. 'Cm7', 'F#dim7')"),
  },
  { title: "Resolve Chord", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ chord }) => {
    const result = await thiriPost("/resolve", { chord });
    return { content: [{ type: "text" as const, text: formatResolveResponse(result) + quotaFooter(result) }] };
  },
);

// ── Tool: generate_voicing ─────────────────────────────────

server.tool(
  "generate_voicing",
  "Generate instrument-ready voicings for a chord in a specified style. " +
    "Pass previousNotes (or a previousVoicing object) from an earlier result to get a voiceLeadingScore for the transition. " +
    "Styles: rootless, bill_evans, shell, triad, pad, guide-tones, guide-tone-1, guide-tone-2, both-guide-tones, drop-2, drop-3.",
  {
    chord: z.string().describe("Chord symbol (e.g. 'Dm7')"),
    style: z
      .enum(["rootless", "bill_evans", "shell", "triad", "pad", "guide-tones", "guide-tone-1", "guide-tone-2", "both-guide-tones", "drop-2", "drop-3"])
      .optional()
      .describe("Voicing style (default: 'pad'). bill_evans is an alias of rootless."),
    octave: z.number().optional().describe("Base octave (default: 3)"),
    density: z.number().optional().describe("Target voicing density / note count hint"),
    keyContext: z.string().optional().describe("Key context for diatonic color hooks (e.g. 'C major')"),
    colorPreferences: z
      .object({
        fifth: z.enum(["natural", "b5", "#5", "#11", "b13", "omit"]).optional(),
        ninth: z.enum(["natural", "b9", "#9", "omit"]).optional(),
        eleventh: z.enum(["natural", "#11", "omit"]).optional(),
        thirteenth: z.enum(["natural", "b13", "omit"]).optional(),
      })
      .optional()
      .describe("Explicit color-tone overrides"),
    previousVoicing: z.any().optional().describe("Prior generate_voicing JSON result for strict guide-tone line tracking"),
    previousNotes: z
      .array(z.string())
      .optional()
      .describe("Previous voicing notes for voice leading (e.g. ['E3', 'G3', 'Bb3', 'D4'])"),
  },
  { title: "Generate Voicing", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ chord, style, octave, density, keyContext, colorPreferences, previousVoicing, previousNotes }) => {
    const body: Record<string, unknown> = { chord };
    if (style) body.style = style;
    if (octave !== undefined) body.octave = octave;
    if (density !== undefined) body.density = density;
    if (keyContext) body.keyContext = keyContext;
    if (colorPreferences) body.colorPreferences = colorPreferences;
    // #6 shim: if a previousVoicing object is passed, extract .notes → previousNotes
    // (which the engine voice-leads on). previousVoicing object is also forwarded.
    if (previousNotes) body.previousNotes = previousNotes;
    if (previousVoicing) {
      body.previousVoicing = previousVoicing;
      if (!previousNotes && Array.isArray((previousVoicing as any)?.notes)) body.previousNotes = (previousVoicing as any).notes;
    }
    const result = await thiriPost("/voicing", body);
    return { content: [{ type: "text" as const, text: formatVoicingResponse(result) + quotaFooter(result) }] };
  },
);

// ── Tool: reharmonize ──────────────────────────────────────

server.tool(
  "reharmonize",
  "Reharmonize a chord progression using jazz techniques. " +
    "Returns one alternative per applicable technique, each with the new progression, the changes, and a plain-English explanation. " +
    "With technique 'auto' (default) it returns every technique that applies. " +
    "Techniques: tritone_sub, ii_v_insertion, modal_interchange, diminished_passing, " +
    "secondary_dominant, chain_of_dominants, coltrane_changes, backdoor. " +
    "(modal_interchange and backdoor require a key.)",
  {
    progression: z
      .array(z.string())
      .describe("Chord symbols, one per bar (e.g. ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'])"),
    key: z.string().optional().describe("Key center (e.g. 'C') — enables modal_interchange and backdoor"),
    technique: z
      .enum(["auto", "tritone_sub", "ii_v_insertion", "modal_interchange", "diminished_passing", "secondary_dominant", "chain_of_dominants", "coltrane_changes", "backdoor"])
      .optional()
      .describe("Reharmonization technique (default: 'auto' = all applicable)"),
  },
  { title: "Reharmonize Progression", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ progression, key, technique }) => {
    const body: Record<string, unknown> = { progression };
    if (key) body.key = key;
    if (technique) body.technique = technique;
    const result = await thiriPost("/reharmonize", body);
    return { content: [{ type: "text" as const, text: formatReharmonizeResponse(result) + quotaFooter(result) }] };
  },
);

// ── Tool: conduct_band ─────────────────────────────────────

function formatConductResponse(data: any): string {
  const c = data.conductor ?? {};
  const lines: string[] = [
    "## Conduct",
    `**Duration:** ${c.durationSec ?? "?"}s  **Tempo:** ${c.tempo ?? "?"} BPM  **Groove:** ${c.groove ?? "?"}`,
    "",
    `**Lead sheet:** \`${data.leadSheet ?? ""}\``,
    "",
    "### Lanes",
  ];
  for (const lane of data.lanes ?? []) {
    lines.push(`- **${lane.role}** — ${lane.notes?.length ?? 0} notes${lane.summary ? ` (${lane.summary})` : ""}`);
  }
  if (data.midiBase64) lines.push("", `_MIDI base64: ${data.midiBase64.length} chars (use conductor MCP to export)_`);
  lines.push("", "```json", JSON.stringify(data, null, 2), "```");
  return lines.join("\n");
}

server.tool(
  "conduct_band",
  "Arrange a 4-piece band from a natural-language prompt. Returns conductor tempo/groove, 4 lanes of note events, lead sheet, and base64 MIDI. Browser/client synthesizes audio via Csound; use thiri-conductor-mcp locally to render WAV.",
  {
    prompt: z.string().describe("Musical direction (e.g. '12-second neo-soul band in Eb, Rhodes + analog bass')"),
    durationSec: z.number().optional().describe("Optional target duration override"),
  },
  { title: "Conduct Band", readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async ({ prompt, durationSec }) => {
    const body: Record<string, unknown> = { prompt };
    if (durationSec !== undefined) body.durationSec = durationSec;
    const result = await thiriPost("/conduct", body);
    return { content: [{ type: "text" as const, text: formatConductResponse(result) + quotaFooter(result) }] };
  },
);

// ── Resource: chord-scale-map ────────────────────────────────
server.resource(
  "chord-scale-map",
  "thiri://theory/chord-scale-map",
  { description: "Complete chord-to-scale relationship map from the Music Theory Matrix. Maps 14 chord qualities to primary and secondary scale recommendations." },
  async () => {
    const CHORD_SCALE_MAP: Record<string, { primary: string[]; secondary: string[] }> = {
      maj7:     { primary: ["Ionian", "Lydian"], secondary: ["Major Pentatonic", "Bebop Major"] },
      "7":      { primary: ["Mixolydian", "Lydian Dominant"], secondary: ["Blues Scale", "Bebop Dominant", "Diminished (HW)"] },
      "7alt":   { primary: ["Superlocrian (Altered)"], secondary: ["Diminished (WH)", "Whole Tone"] },
      "7b9":    { primary: ["Diminished (HW)", "Phrygian Dominant"], secondary: ["Superlocrian (Altered)"] },
      "7#11":   { primary: ["Lydian Dominant"], secondary: ["Whole Tone"] },
      m7:       { primary: ["Dorian", "Aeolian"], secondary: ["Minor Pentatonic", "Bebop Dorian"] },
      m7b5:     { primary: ["Locrian", "Locrian #2"], secondary: ["Superlocrian (Altered)"] },
      mMaj7:    { primary: ["Melodic Minor"], secondary: ["Harmonic Minor"] },
      dim7:     { primary: ["Diminished (WH)"], secondary: ["Diminished (HW)"] },
      aug:      { primary: ["Whole Tone", "Lydian Augmented"], secondary: ["Ionian #5"] },
      "maj7#5": { primary: ["Lydian Augmented", "Ionian #5"], secondary: [] },
      sus4:     { primary: ["Mixolydian"], secondary: ["Dorian", "Pentatonic"] },
      "69":     { primary: ["Ionian", "Lydian"], secondary: ["Major Pentatonic"] },
      m9:       { primary: ["Dorian"], secondary: ["Aeolian", "Melodic Minor"] },
    };

    return {
      contents: [{
        uri: "thiri://theory/chord-scale-map",
        text: JSON.stringify(CHORD_SCALE_MAP, null, 2),
        mimeType: "application/json",
      }],
    };
  },
);

// ── Resource: studio capability manifest ───────────────────
server.resource(
  "studio-capability-manifest",
  "thiri://studio/capability-manifest",
  {
    description:
      "Unified THIRI studio agent manifest — instruments, MCP tools, Csound map, deterministic command grammar.",
  },
  async () => {
    let text: string;
    try {
      text = readFileSync(CAPABILITY_MANIFEST_PATH, "utf8");
    } catch {
      text = JSON.stringify(
        {
          error: "manifest_not_found",
          expectedPath: "THIRI/lab/agent-capability.v1.json",
          hint: "Run THIRI/lab/scripts/generate-agent-capability.mjs",
        },
        null,
        2,
      );
    }
    return {
      contents: [{
        uri: "thiri://studio/capability-manifest",
        text,
        mimeType: "application/json",
      }],
    };
  },
);

// ── Start ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[thiri-mcp] THIRI Chord Intelligence MCP server running");
}

main().catch((err) => {
  console.error("[thiri-mcp] Fatal:", err);
  process.exit(1);
});

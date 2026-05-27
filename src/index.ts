#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.THIRI_API_URL || "https://api.thiri.ai";
const API_KEY = process.env.THIRI_API_KEY || "";

// ── API client ─────────────────────────────────────────────

async function thiriPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_URL}/api/v1${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`THIRI API ${res.status}: ${text}`);
  }

  return res.json();
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
  if (data.voiceLeadingScore != null) lines.push(`**Voice leading score:** ${data.voiceLeadingScore}`);

  lines.push("", "```json", JSON.stringify(data, null, 2), "```");
  return lines.join("\n");
}

// ── Server ─────────────────────────────────────────────────

const server = new McpServer({
  name: "thiri",
  version: "0.1.0",
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
  async ({ chord, key }) => {
    const result = await thiriPost("/analyze", { chord, ...(key ? { key } : {}) });
    return { content: [{ type: "text" as const, text: formatAnalyzeResponse(result) }] };
  },
);

// ── Tool: resolve_chord ────────────────────────────────────

server.tool(
  "resolve_chord",
  "Resolve a chord symbol to spelled note names, frequencies in Hz, MIDI numbers, and recommended improvisation scales.",
  {
    chord: z.string().describe("Chord symbol (e.g. 'Cm7', 'F#dim7')"),
  },
  async ({ chord }) => {
    const result = await thiriPost("/resolve", { chord });
    return { content: [{ type: "text" as const, text: formatResolveResponse(result) }] };
  },
);

// ── Tool: generate_voicing ─────────────────────────────────

server.tool(
  "generate_voicing",
  "Generate instrument-ready voicings for a chord in a specified style. " +
    "Supports voice leading from a previous voicing for smooth transitions. " +
    "Styles: rootless, shell, drop2, drop3, pad, triad.",
  {
    chord: z.string().describe("Chord symbol (e.g. 'Dm7')"),
    style: z
      .enum(["rootless", "shell", "drop2", "drop3", "pad", "triad"])
      .optional()
      .describe("Voicing style (default: 'pad')"),
    octave: z.number().optional().describe("Base octave (default: 3)"),
    previousNotes: z
      .array(z.string())
      .optional()
      .describe("Previous voicing notes for voice leading (e.g. ['E3', 'G3', 'Bb3', 'D4'])"),
  },
  async ({ chord, style, octave, previousNotes }) => {
    const body: Record<string, unknown> = { chord };
    if (style) body.style = style;
    if (octave !== undefined) body.octave = octave;
    if (previousNotes) body.previousNotes = previousNotes;
    const result = await thiriPost("/voicing", body);
    return { content: [{ type: "text" as const, text: formatVoicingResponse(result) }] };
  },
);

// ── Tool: reharmonize ──────────────────────────────────────

server.tool(
  "reharmonize",
  "Reharmonize a chord progression using jazz techniques. " +
    "Returns the reharmonized progression with explanations and alternative versions. " +
    "Techniques: tritone_sub, backdoor, modal_interchange, secondary_dominant, " +
    "coltrane_changes, line_cliche, chain_of_dominants, passing_diminished, auto.",
  {
    bars: z
      .array(z.string())
      .describe("Chord symbols, one per bar (e.g. ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'])"),
    key: z.string().optional().describe("Key center for context (e.g. 'C')"),
    technique: z
      .enum(["auto", "tritone_sub", "backdoor", "modal_interchange", "secondary_dominant", "coltrane_changes", "line_cliche", "chain_of_dominants", "passing_diminished"])
      .optional()
      .describe("Reharmonization technique (default: 'auto')"),
    density: z
      .enum(["light", "medium", "heavy"])
      .optional()
      .describe("How many chords to reharmonize (default: 'medium')"),
  },
  async ({ bars, key, technique, density }) => {
    const body: Record<string, unknown> = { bars };
    if (key) body.key = key;
    if (technique) body.technique = technique;
    if (density) body.density = density;
    const result = await thiriPost("/reharmonize", body);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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

#!/usr/bin/env node
// THIRI Composition MCP — the agent loop over the Composition Lab spine.
//
// Exposes the editable Composition IR + its operations as MCP tools so an agent
// can drive the full loop:  create → compose → revoice → reharmonize → tweak →
// render → hear → export.  Composition state is held in-memory by id (the
// session the agent edits across calls).
//
// Engine is imported DIRECTLY from the canonical spine (no HTTP hop) so this is
// one process: theory + composition + local playback. Playback (fluidsynth) is
// local-only, which is exactly why this runs on the machine, not in the worker.
//
// This is a STANDALONE server (separate from src/index.ts, which is the chord-
// intelligence proxy) so it never collides with that file.
//
// Run:  node composition-server.mjs   (stdio MCP)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  defaultGrid, createComposition, composeProgression, revoiceProgression,
  renderComposition, reharmonizeSection, setChord,
  inspectComposition, TEMPLATE_IDS,
} from "../thiri-api-worker/src/composition.mjs";
import { writeMidiFile, playComposition, playbackEnv } from "../thiri-api-worker/src/playback.mjs";

const grid = defaultGrid();
const COMPS = new Map();        // id -> composition
let lastId = null;              // ops without id act on the most recent

function getComp(id) {
  const key = id || lastId;
  const c = key ? COMPS.get(key) : null;
  if (!c) throw new Error(id ? `No composition with id "${id}"` : "No composition yet — call create_composition or compose_progression first.");
  return c;
}
const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }], isError: true });

const server = new McpServer({ name: "thiri-composition", version: "0.1.0" });

server.tool(
  "create_composition",
  "Create a new, empty editable composition (key/tempo/meter). Returns its id. Other tools take this id; if omitted they act on the most recently touched composition.",
  { key: z.string().describe("Key, e.g. 'F minor', 'Bb', 'C major'"), title: z.string().optional(), tempo: z.number().optional(), meter: z.array(z.number()).optional() },
  async ({ key, title, tempo, meter }) => {
    const c = createComposition({ key, title, tempo, meter });
    COMPS.set(c.id, c); lastId = c.id;
    return ok({ id: c.id, title: c.title, key: c.key, tempo: c.tempo, meter: c.meter });
  },
);

server.tool(
  "compose_progression",
  "Generate a chord progression into a composition from a feel/mood + key. If 'id' is omitted, a new composition is created from 'key'. Returns lead sheet, roman numerals, chosen template. Deterministic (template-based).",
  { id: z.string().optional(), key: z.string().optional(), feel: z.string().optional(), template: z.enum(TEMPLATE_IDS).optional(), length: z.number().optional(), complexity: z.enum(["simple", "rich", "altered"]).optional() },
  async ({ id, key, feel, template, length, complexity }) => {
    try {
      let c = (id || lastId) ? COMPS.get(id || lastId) : null;
      if (!c) { if (!key) return fail("No composition id and no key — provide 'key' to start a new one."); c = createComposition({ key }); COMPS.set(c.id, c); lastId = c.id; }
      const r = composeProgression(grid, c, { feel, template, length, complexity });
      revoiceProgression(grid, c, { style: "rootless", register: "mid" });
      return ok({ id: c.id, template: r.template, leadSheet: r.leadSheet, roman: r.roman, explanation: r.explanation });
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "revoice_progression",
  "Re-voice every chord. Styles: rootless, shell, triad, pad, drop2, drop3, guide-tones. Register: low|mid|high. Voice-led for a smooth top line.",
  { id: z.string().optional(), style: z.enum(["rootless", "shell", "triad", "pad", "drop2", "drop3", "guide-tones"]).optional(), register: z.enum(["low", "mid", "high"]).optional() },
  async ({ id, style, register }) => {
    try {
      const c = getComp(id);
      revoiceProgression(grid, c, { style: style || "rootless", register: register || "mid" });
      return ok({ id: c.id, style: style || "rootless", register: register || "mid", bars: c.sections[0].bars.map((b) => b.chords.map((s) => ({ symbol: s.symbol, notes: s.voicing?.notes ?? null }))) });
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "reharmonize_section",
  "Suggest reharmonizations for the section. Techniques: tritone_sub, ii_v_insertion, modal_interchange, diminished_passing, auto. Returns alternatives (does not mutate; use set_chord to apply).",
  { id: z.string().optional(), technique: z.enum(["auto", "tritone_sub", "ii_v_insertion", "modal_interchange", "diminished_passing"]).optional() },
  async ({ id, technique }) => {
    try { const c = getComp(id); const reh = reharmonizeSection(grid, c, { technique }); return ok({ id: c.id, original: reh.original, alternatives: reh.alternatives }); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "set_chord",
  "Change one chord. bar is 1-based; slot is 0-based within a bar (split bars). Invalidates that chord's voicing — re-voiced automatically after.",
  { id: z.string().optional(), bar: z.number(), symbol: z.string(), slot: z.number().optional() },
  async ({ id, bar, symbol, slot }) => {
    try {
      const c = getComp(id);
      const res = setChord(grid, c, { bar, symbol, slot: slot ?? 0 });
      if (!res.ok) return fail(`set_chord failed: ${res.error}${res.symbol ? ` (${res.symbol})` : ""}`);
      revoiceProgression(grid, c, { style: "rootless", register: "mid" });
      return ok({ id: c.id, bar, from: res.from, to: res.to });
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "render_composition",
  "Render to timed MIDI events (the playable representation). Returns event count, duration, and the first events.",
  { id: z.string().optional() },
  async ({ id }) => {
    try {
      const c = getComp(id); const r = renderComposition(grid, c);
      return ok({ id: c.id, notes: r.notes.length, durationSec: r.durationSec, tempo: c.tempo, sample: r.notes.slice(0, 6).map((n) => ({ name: n.name, bar: n.bar, chord: n.chord, startSec: n.startSec, durSec: n.durSec })) });
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "export_midi",
  "Write the composition to a Standard MIDI File (.mid) on disk. Returns path + byte size. The composer owns this MIDI.",
  { id: z.string().optional(), path: z.string().optional() },
  async ({ id, path }) => {
    try { const c = getComp(id); const out = writeMidiFile(grid, c, path || `/tmp/thiri-${c.id}.mid`); return ok({ id: c.id, path: out.path, bytes: out.bytes }); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "play_composition",
  "Render to audio (fluidsynth + GM soundfont) and optionally play through speakers. LOCAL ONLY. Returns .mid + .wav paths. play=false renders without sounding.",
  { id: z.string().optional(), play: z.boolean().optional(), path: z.string().optional() },
  async ({ id, play, path }) => {
    try { const c = getComp(id); const out = playComposition(grid, c, { midiPath: path || `/tmp/thiri-${c.id}.mid`, wav: true, play: play !== false }); return ok({ id: c.id, midi: out.midi, audio: out.audio, played: out.played, env: out.env }); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "inspect_composition",
  "Full readout: lead sheet, every bar's chords + voiced notes + roman numerals, duration, and the operation history.",
  { id: z.string().optional() },
  async ({ id }) => { try { return ok(inspectComposition(getComp(id))); } catch (e) { return fail(e.message); } },
);

server.tool(
  "list_compositions",
  "List the compositions in this session (id, title, key, lead sheet).",
  {},
  async () => ok({ count: COMPS.size, lastId, compositions: [...COMPS.values()].map((c) => ({ id: c.id, title: c.title, key: c.key, leadSheet: c.sections[0] ? "| " + c.sections[0].bars.map((b) => b.chords.map((s) => s.symbol).join(" ")).join(" | ") + " |" : "(empty)" })) }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const env = playbackEnv();
  console.error(`[thiri-composition] running · playback: fluidsynth ${env.fluidsynth ? "✓" : "✗"} soundfont ${env.soundfont ? "✓" : "✗"} afplay ${env.afplay ? "✓" : "✗"}`);
}
main().catch((e) => { console.error("[thiri-composition] fatal:", e); process.exit(1); });

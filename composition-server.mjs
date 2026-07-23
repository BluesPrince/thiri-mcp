#!/usr/bin/env node
// THIRI Composition MCP — thin client over the hosted composition engine.
//
// The composition engine (create → compose → revoice → reharmonize → tweak →
// render → export) now runs SERVER-SIDE behind POST /v2/compose. This process no
// longer bundles it — it holds the editable composition JSON per id and round-
// trips it through the API each call. Only the "hear it" path (MIDI → fluidsynth
// → speakers) stays local, since fluidsynth can't run in the Worker.
//
// Requires a THIRI API key:  export THIRI_API_KEY=sk_live_...   (get one at
// https://build.thiri.ai/keys). Optional: THIRI_API_BASE (default chords.thiri.ai).
//
// Run:  THIRI_API_KEY=sk_live_… node composition-server.mjs   (stdio MCP)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeMidiBase64, renderWav, playWav, playbackEnv } from "./local-audio.mjs";

const API_BASE = (process.env.THIRI_API_BASE || "https://chords.thiri.ai").replace(/\/$/, "");
const API_KEY = process.env.THIRI_API_KEY || "";

const COMPS = new Map();        // id -> composition JSON (client-side session state)
let lastId = null;              // ops without id act on the most recent

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }], isError: true });

function getComp(id) {
  const key = id || lastId;
  const c = key ? COMPS.get(key) : null;
  if (!c) throw new Error(id ? `No composition with id "${id}"` : "No composition yet — call create_composition or compose_progression first.");
  return c;
}

// Single call to the hosted engine. Throws on transport/API error with a clean message.
async function apiCompose(op, composition, params = {}) {
  if (!API_KEY) throw new Error("THIRI_API_KEY is not set. Get a key at https://build.thiri.ai/keys and export THIRI_API_KEY.");
  let res;
  try {
    res = await fetch(`${API_BASE}/v2/compose`, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({ op, composition: composition ?? undefined, params }),
    });
  } catch (e) {
    throw new Error(`Could not reach THIRI API at ${API_BASE}: ${e.message}`);
  }
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`THIRI API ${op} failed (${res.status}): ${msg}`);
  }
  return body; // { composition, view }
}

// Store the composition the API returns; track it as the most-recent.
function remember(body) {
  const c = body.composition;
  if (c?.id) { COMPS.set(c.id, c); lastId = c.id; }
  return c;
}

const server = new McpServer({ name: "thiri-composition", version: "0.2.0" });

server.tool(
  "create_composition",
  "Create a new, empty editable composition (key/tempo/meter). Returns its id. Other tools take this id; if omitted they act on the most recently touched composition.",
  { key: z.string().describe("Key, e.g. 'F minor', 'Bb', 'C major'"), title: z.string().optional(), tempo: z.number().optional(), meter: z.array(z.number()).optional() },
  async ({ key, title, tempo, meter }) => {
    try { const b = await apiCompose("create", null, { key, title, tempo, meter }); remember(b); return ok(b.view); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "compose_progression",
  "Generate a chord progression into a composition from a feel/mood + key. If 'id' is omitted, a new composition is created from 'key'. Returns lead sheet, roman numerals, chosen template. Deterministic (template-based).",
  { id: z.string().optional(), key: z.string().optional(), feel: z.string().optional(), template: z.string().optional().describe("e.g. minor_ii_V_i, ii_V_I, blues, pop_axis, rhythm_changes"), length: z.number().optional(), complexity: z.enum(["simple", "rich", "altered"]).optional() },
  async ({ id, key, feel, template, length, complexity }) => {
    try {
      const existing = (id || lastId) ? COMPS.get(id || lastId) : null;
      if (!existing && !key) return fail("No composition id and no key — provide 'key' to start a new one.");
      const b = await apiCompose("compose", existing, { key, feel, template, length, complexity });
      remember(b);
      return ok(b.view);
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "revoice_progression",
  "Re-voice every chord. Styles: rootless, shell, triad, pad, drop2, drop3, guide-tones. Register: low|mid|high. Voice-led for a smooth top line.",
  { id: z.string().optional(), style: z.enum(["rootless", "shell", "triad", "pad", "drop2", "drop3", "guide-tones"]).optional(), register: z.enum(["low", "mid", "high"]).optional() },
  async ({ id, style, register }) => {
    try { const b = await apiCompose("revoice", getComp(id), { style, register }); remember(b); return ok(b.view); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "reharmonize_section",
  "Suggest reharmonizations for the section. Techniques: tritone_sub, ii_v_insertion, modal_interchange, diminished_passing, auto. Returns alternatives (does not mutate; use set_chord to apply).",
  { id: z.string().optional(), technique: z.enum(["auto", "tritone_sub", "ii_v_insertion", "modal_interchange", "diminished_passing"]).optional() },
  async ({ id, technique }) => {
    try { const b = await apiCompose("reharmonize", getComp(id), { technique }); remember(b); return ok(b.view); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "set_chord",
  "Change one chord. bar is 1-based; slot is 0-based within a bar (split bars). Invalidates that chord's voicing — re-voiced automatically after.",
  { id: z.string().optional(), bar: z.number(), symbol: z.string(), slot: z.number().optional() },
  async ({ id, bar, symbol, slot }) => {
    try { const b = await apiCompose("set_chord", getComp(id), { bar, symbol, slot }); remember(b); return ok(b.view); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "render_composition",
  "Render to timed MIDI events (the playable representation). Returns event count, duration, and the first events.",
  { id: z.string().optional() },
  async ({ id }) => {
    try { const b = await apiCompose("render", getComp(id), {}); remember(b); return ok(b.view); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "export_midi",
  "Write the composition to a Standard MIDI File (.mid) on disk. Returns path + byte size. The composer owns this MIDI.",
  { id: z.string().optional(), path: z.string().optional() },
  async ({ id, path }) => {
    try {
      const b = await apiCompose("export_midi", getComp(id), {});
      remember(b);
      const c = b.composition;
      const out = writeMidiBase64(b.view.midiBase64, path || `/tmp/thiri-${c.id}.mid`);
      return ok({ id: c.id, path: out.path, bytes: out.bytes });
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "play_composition",
  "Render to audio (fluidsynth + GM soundfont) and optionally play through speakers. LOCAL ONLY. Returns .mid + .wav paths. play=false renders without sounding.",
  { id: z.string().optional(), play: z.boolean().optional(), path: z.string().optional() },
  async ({ id, play, path }) => {
    try {
      const b = await apiCompose("export_midi", getComp(id), {});
      remember(b);
      const c = b.composition;
      const midiPath = path || `/tmp/thiri-${c.id}.mid`;
      const midi = writeMidiBase64(b.view.midiBase64, midiPath);
      const env = playbackEnv();
      const out = { id: c.id, midi, audio: null, played: false, env: { fluidsynth: !!env.fluidsynth, soundfont: env.soundfont, afplay: !!env.afplay } };
      if (env.canRenderAudio) {
        out.audio = renderWav(midiPath);
        if (out.audio.ok && play !== false && env.canPlay) {
          const p = playWav(out.audio.wavPath);
          out.played = p.ok;
          if (!p.ok) out.playError = p.reason;
        }
      } else {
        out.audio = { ok: false, reason: env.fluidsynth ? "no soundfont" : "fluidsynth not installed" };
      }
      return ok(out);
    } catch (e) { return fail(e.message); }
  },
);

server.tool(
  "inspect_composition",
  "Full readout: lead sheet, every bar's chords + voiced notes + roman numerals, duration, and the operation history.",
  { id: z.string().optional() },
  async ({ id }) => {
    try { const b = await apiCompose("inspect", getComp(id), {}); remember(b); return ok(b.view); }
    catch (e) { return fail(e.message); }
  },
);

server.tool(
  "list_compositions",
  "List the compositions in this session (id, title, key, lead sheet).",
  {},
  async () => ok({ count: COMPS.size, lastId, compositions: [...COMPS.values()].map((c) => ({ id: c.id, title: c.title, key: c.key, leadSheet: c.sections?.[0] ? "| " + c.sections[0].bars.map((b) => b.chords.map((s) => s.symbol).join(" ")).join(" | ") + " |" : "(empty)" })) }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const env = playbackEnv();
  console.error(`[thiri-composition] thin client → ${API_BASE} · key ${API_KEY ? "set ✓" : "MISSING ✗ (set THIRI_API_KEY)"} · playback: fluidsynth ${env.fluidsynth ? "✓" : "✗"} soundfont ${env.soundfont ? "✓" : "✗"} afplay ${env.afplay ? "✓" : "✗"}`);
}
main().catch((e) => { console.error("[thiri-composition] fatal:", e); process.exit(1); });

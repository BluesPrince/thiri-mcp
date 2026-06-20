// THIRI Composition Lab — the Composition IR and its operations.
//
// This is the keystone the MVP hangs from: a first-class, editable Composition
// object plus the operations that build, voice, reharmonize, render, and export
// it. Pure JS over the grid engine — runs in node (CLI/tests) and the Worker.
//
//   Composition
//     id, title, key, tempo, meter, sections[], operations[]
//   Section
//     id, name, tonic, mode, bars[]
//   Bar
//     index, chords[]            (1 or 2 chords per bar — a split bar)
//   ChordSlot
//     symbol, beats, roman, voicing{style,notes,midi}
//
// The loop the MVP proves:
//   natural language → composition (compose) → voicing/render (revoice/render)
//   → hear it (midiEvents/.mid) → tweak (set/reharmonize) → export (.mid).

import {
  buildGrid, resolve as gridResolve, analyze as gridAnalyze,
  voiceChord, reharmonize as gridReharm, parseChord, spell,
} from "./grid-core.mjs";
import { QUALITIES, SCALES } from "./grid-data.mjs";

// ─── tiny helpers ────────────────────────────────────────────────────────────
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PC_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const midiName = (m) => PC_FLAT[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

let _counter = 0;
const nextId = (prefix) => `${prefix}_${(++_counter).toString(36)}`;
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";

/** Build the default grid once (base data; D1 layer is a Worker concern). */
export function defaultGrid() { return buildGrid(QUALITIES, SCALES); }

// ─── key parsing: "F minor" | "Fm" | "Bb" | "C major" → {tonic, tonicPC, mode} ─
export function parseKey(key) {
  if (typeof key !== "string") return null;
  const m = /^([A-G])([#b]*)\s*(.*)$/.exec(key.trim());
  if (!m) return null;
  const letter = m[1];
  const accStr = m[2] || "";
  const acc = (accStr.match(/#/g)?.length || 0) - (accStr.match(/b/g)?.length || 0);
  const tonicPC = (((LETTER_PC[letter] + acc) % 12) + 12) % 12;
  const rest = m[3].toLowerCase();
  let mode = "major";
  if (/m(in(or)?)?$/.test(rest) || rest === "m" || rest === "min" || rest === "minor") mode = "minor";
  if (rest === "" && /m$/.test(accStr)) mode = "minor"; // (won't happen, accStr is #/b only)
  return { tonic: letter + accStr, tonicLetter: letter, tonicPC, mode };
}

// ─── degree tokens → interval label (so we can reuse the grid's speller) ──────
const TOKEN_LABEL = {
  "1": "P1", "b2": "m2", "2": "M2", "#2": "A2", "b3": "m3", "3": "M3",
  "4": "P4", "#4": "A4", "b5": "d5", "5": "P5", "#5": "A5", "b6": "m6",
  "6": "M6", "b7": "m7", "7": "M7",
};
const tokenDegreeNumber = (tok) => parseInt(tok.replace(/[#b]/g, ""), 10);

/** Spell the chord root for a degree token in a key (e.g. "b6" in F → "Db"). */
function spellRoot(tonicLetter, tonicPC, token) {
  const label = TOKEN_LABEL[token];
  if (!label) return null;
  return spell(tonicLetter, tonicPC, label);
}

// ─── chord QUALITY per harmonic function × complexity ────────────────────────
// fn names a role; complexity ∈ simple|rich|altered chooses the voicing colour.
const QUAL_BY_FN = {
  minor:   { simple: "m7",   rich: "m9",   altered: "m9"  },
  maj:     { simple: "maj7", rich: "maj9", altered: "maj9" },
  dom:     { simple: "7",    rich: "13",   altered: "7alt" },
  domb9:   { simple: "7",    rich: "7b9",  altered: "7b9" },
  halfdim: { simple: "m7b5", rich: "m7b5", altered: "m7b5" },
  dim:     { simple: "dim7", rich: "dim7", altered: "dim7" },
  sus:     { simple: "7sus4",rich: "7sus4",altered: "7sus4" },
  minmaj:  { simple: "mMaj7",rich: "mMaj7",altered: "mMaj7" },
};
const ROMAN_NUM = ["I", "II", "III", "IV", "V", "VI", "VII"];
const ROMAN_SUFFIX = { minor: "", maj: "maj7", dom: "7", domb9: "7♭9", halfdim: "ø7", dim: "°7", sus: "7sus", minmaj: "Δ7" };
const LOWER_FN = new Set(["minor", "halfdim", "dim", "minmaj"]);

function romanFor(token, fn) {
  const n = tokenDegreeNumber(token);
  let rn = ROMAN_NUM[n - 1] || "?";
  if (LOWER_FN.has(fn)) rn = rn.toLowerCase();
  const accent = token.startsWith("b") ? "♭" : token.startsWith("#") ? "♯" : "";
  return accent + rn + (ROMAN_SUFFIX[fn] ?? "");
}

// ─── PROGRESSION TEMPLATES (transpose to any key by construction) ────────────
// Each slot: {deg: degree-token, fn: harmonic-function}. A bar is an array of
// slots (2 slots = a split bar). Templates are deterministic, not improvised.
const TEMPLATES = {
  major_ii_V_I: {
    label: "ii–V–I (major)", mode: "major", cadence: "authentic", feel: ["jazz", "smooth", "bright"],
    bars: [[{ deg: "2", fn: "minor" }], [{ deg: "5", fn: "dom" }], [{ deg: "1", fn: "maj" }], [{ deg: "1", fn: "maj" }]],
  },
  minor_ii_V_i: {
    label: "minor ii–V–i", mode: "minor", cadence: "authentic", feel: ["moody", "dark", "jazz", "minor"],
    bars: [[{ deg: "2", fn: "halfdim" }], [{ deg: "5", fn: "dom" }], [{ deg: "1", fn: "minor" }], [{ deg: "1", fn: "minor" }]],
  },
  gospel_jazz_minor: {
    label: "gospel-jazz minor loop", mode: "minor", cadence: "plagal-authentic", feel: ["gospel", "jazz", "moody", "soul", "minor", "warm"],
    // F minor → Gm7b5 | C7b9 | Fm9 | Dbmaj7 C7sus4
    bars: [[{ deg: "2", fn: "halfdim" }], [{ deg: "5", fn: "domb9" }], [{ deg: "1", fn: "minor" }], [{ deg: "b6", fn: "maj" }, { deg: "5", fn: "sus" }]],
  },
  gospel_plagal: {
    label: "gospel plagal (IV–I)", mode: "major", cadence: "plagal", feel: ["gospel", "church", "warm", "bright"],
    bars: [[{ deg: "1", fn: "maj" }], [{ deg: "4", fn: "dom" }], [{ deg: "1", fn: "maj" }], [{ deg: "4", fn: "dom" }, { deg: "1", fn: "maj" }]],
  },
  rhythm_changes: {
    label: "rhythm changes fragment", mode: "major", cadence: "turnaround", feel: ["bebop", "jazz", "fast", "bright"],
    bars: [[{ deg: "1", fn: "maj" }], [{ deg: "6", fn: "dom" }], [{ deg: "2", fn: "minor" }], [{ deg: "5", fn: "dom" }]],
  },
  blues_turnaround: {
    label: "blues turnaround", mode: "major", cadence: "turnaround", feel: ["blues", "soul", "gritty"],
    bars: [[{ deg: "1", fn: "dom" }], [{ deg: "6", fn: "dom" }], [{ deg: "2", fn: "minor" }], [{ deg: "5", fn: "dom" }]],
  },
  backdoor: {
    label: "backdoor cadence", mode: "major", cadence: "backdoor", feel: ["jazz", "warm", "smooth"],
    bars: [[{ deg: "2", fn: "minor" }], [{ deg: "b7", fn: "dom" }], [{ deg: "1", fn: "maj" }], [{ deg: "1", fn: "maj" }]],
  },
  modal_vamp: {
    label: "modal vamp (Dorian)", mode: "minor", cadence: "vamp", feel: ["modal", "moody", "hypnotic", "cool"],
    bars: [[{ deg: "1", fn: "minor" }], [{ deg: "4", fn: "dom" }], [{ deg: "1", fn: "minor" }], [{ deg: "4", fn: "dom" }]],
  },
  neo_soul_loop: {
    label: "neo-soul loop", mode: "major", cadence: "loop", feel: ["neo-soul", "soul", "warm", "smooth", "lush"],
    bars: [[{ deg: "1", fn: "maj" }], [{ deg: "3", fn: "minor" }], [{ deg: "6", fn: "minor" }], [{ deg: "2", fn: "minor" }]],
  },
};

/** Choose a template from mode + feel keywords (+ explicit cadence/id). */
export function pickTemplate({ template, mode, feel, cadence } = {}) {
  if (template && TEMPLATES[template]) return template;
  const want = String(feel || "").toLowerCase();
  // Tokenize BOTH ways: keep hyphenated compounds (so "neo-soul" matches the
  // "neo-soul" tag) AND split them (so "gospel-jazz" also yields "gospel"+"jazz").
  // Without the split, a hyphenated input like "gospel-jazz" matched nothing.
  const hyphenated = want.split(/[^a-z-]+/).filter(Boolean);
  const split = want.split(/[^a-z]+/).filter(Boolean);
  const tags = [...new Set([...hyphenated, ...split])];
  const scored = Object.entries(TEMPLATES).map(([id, t]) => {
    let s = 0;
    for (const tag of tags) if (t.feel.includes(tag)) s += 2;
    if (mode && t.mode === mode) s += 1;
    if (cadence && t.cadence.includes(cadence)) s += 2;
    return { id, s };
  }).sort((a, b) => b.s - a.s);
  if (scored[0].s > 0) return scored[0].id;
  return mode === "minor" ? "minor_ii_V_i" : "major_ii_V_I"; // sensible defaults
}

// ─── op 0: create_composition ────────────────────────────────────────────────
export function createComposition({ title, key, tempo, meter, id } = {}) {
  const k = parseKey(key || "C") || parseKey("C");
  const comp = {
    id: id || nextId("comp"),
    title: title || "Untitled",
    key: k.tonic + (k.mode === "minor" ? "m" : ""),
    tonic: k.tonic, tonicPC: k.tonicPC, mode: k.mode,
    tempo: Number.isFinite(tempo) ? tempo : 80,
    meter: Array.isArray(meter) && meter.length === 2 ? meter : [4, 4],
    sections: [],
    operations: [],
  };
  logOp(comp, "create_composition", { title: comp.title, key: comp.key, tempo: comp.tempo, meter: comp.meter },
    `Created "${comp.title}" in ${comp.key} at ${comp.tempo} BPM, ${comp.meter.join("/")}.`);
  return comp;
}

function logOp(comp, op, args, summary) {
  comp.operations.push({ n: comp.operations.length + 1, op, args, summary });
  return comp;
}

// ─── op 1: compose_progression ───────────────────────────────────────────────
// Fills (or appends) a section with chords from a template, transposed to key.
export function composeProgression(grid, comp, opts = {}) {
  const tonicLetter = comp.tonic[0];
  const tonicPC = comp.tonicPC;
  const complexity = ["simple", "rich", "altered"].includes(opts.complexity) ? opts.complexity : "rich";
  const length = opts.length === 8 ? 8 : 4;

  const templateId = pickTemplate({ template: opts.template, mode: comp.mode, feel: opts.feel, cadence: opts.cadence });
  const tpl = TEMPLATES[templateId];
  const beatsPerBar = comp.meter[0];

  const buildBar = (slots, index) => {
    const n = slots.length;
    const chords = slots.map((slot) => {
      const root = spellRoot(tonicLetter, tonicPC, slot.deg);
      // a slot may pin its quality (slot.q) regardless of complexity (e.g. a signature ♭VImaj7)
      const qual = slot.q ?? QUAL_BY_FN[slot.fn]?.[complexity] ?? QUAL_BY_FN[slot.fn]?.simple ?? "7";
      const symbol = root + (qual === "maj" ? "" : qual);
      return { symbol, beats: beatsPerBar / n, roman: romanFor(slot.deg, slot.fn), voicing: null };
    });
    return { index, chords };
  };

  let barSlots = tpl.bars.slice();
  if (length === 8) barSlots = barSlots.concat(tpl.bars); // repeat the core for an 8-bar form
  const bars = barSlots.map((slots, i) => buildBar(slots, i));

  const section = { id: nextId("sec"), name: opts.sectionName || "A", tonic: comp.tonic, mode: comp.mode, bars };
  if (opts.replace !== false) comp.sections = [section]; else comp.sections.push(section);

  const leadSheet = leadSheetText(section);
  const roman = bars.map((b) => b.chords.map((c) => c.roman).join(" ")).join(" | ");
  const explanation = `${tpl.label} in ${comp.key} (${complexity}). ${cadenceNote(tpl.cadence)}`;
  logOp(comp, "compose_progression",
    { template: templateId, length, complexity, feel: opts.feel ?? null },
    `Composed ${length}-bar ${tpl.label}: ${leadSheet}`);

  return { composition: comp, section, template: templateId, leadSheet, roman, explanation,
    constraints: { length, complexity, mode: comp.mode } };
}

function cadenceNote(c) {
  return {
    authentic: "Resolves V→i for a strong cadence.",
    "plagal-authentic": "Plagal ♭VI colour then a sus→tonic release.",
    plagal: "IV→I plagal 'amen' motion.",
    turnaround: "A turnaround that cycles back to the top.",
    backdoor: "♭VII7→I backdoor resolution.",
    vamp: "A static modal vamp — no functional cadence.",
    loop: "A loop that never fully resolves — keeps it moving.",
  }[c] || "";
}

// ─── op 2: revoice_progression ───────────────────────────────────────────────
// Voices every chord in the chosen style, voice-led for a smooth top line.
const REGISTER_BASE = { low: 2, mid: 3, high: 4 };
export function revoiceProgression(grid, comp, opts = {}) {
  const style = opts.style || "rootless";
  const octave = REGISTER_BASE[opts.register] ?? 3;
  let prevTop = null;
  let count = 0;
  for (const section of comp.sections) {
    for (const bar of section.bars) {
      for (const slot of bar.chords) {
        const v = voiceChord(grid, slot.symbol, { style, octave });
        if (!v || !v.midi.length) { slot.voicing = null; continue; }
        const shift = voiceLeadShift(v.midi, prevTop);
        const midi = v.midi.map((m) => m + 12 * shift);
        const notes = v.notes.map((nm) => shiftNoteOctave(nm, shift));
        slot.voicing = { style, notes, midi };
        prevTop = Math.max(...midi);
        count++;
      }
    }
  }
  logOp(comp, "revoice_progression", { style, register: opts.register ?? "mid" },
    `Revoiced ${count} chord(s) as ${style}${opts.register ? " (" + opts.register + " register)" : ""}, voice-led.`);
  return comp;
}

// shift the whole stack by ±octaves so its top note is nearest the previous top
function voiceLeadShift(midi, prevTop) {
  if (prevTop == null) return 0;
  const top = Math.max(...midi);
  let best = 0, bestDist = Infinity;
  for (let s = -2; s <= 2; s++) {
    const lo = Math.min(...midi) + 12 * s;
    if (lo < 36 || lo > 84) continue; // keep it playable
    const d = Math.abs(top + 12 * s - prevTop);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}
// note name like "E3" → shift the trailing octave digit by `shift`
function shiftNoteOctave(name, shift) {
  const m = /^([A-G][#b]*)(-?\d+)$/.exec(name);
  if (!m) return name;
  return m[1] + (parseInt(m[2], 10) + shift);
}

// ─── op 3: render_composition → flat timed MIDI events ───────────────────────
export function renderComposition(grid, comp, opts = {}) {
  const ppq = opts.ppq || 480;
  const velocity = opts.velocity || 80;
  const beatTicks = ppq;                 // 1 beat = 1 quarter note (den assumed 4)
  const notes = [];
  let tick = 0;
  let barNo = 0;
  for (const section of comp.sections) {
    for (const bar of section.bars) {
      barNo++;
      for (const slot of bar.chords) {
        const durTicks = Math.round(slot.beats * beatTicks);
        const midi = slot.voicing?.midi?.length ? slot.voicing.midi : (gridResolve(grid, slot.symbol)?.midi || []);
        for (const pitch of midi) {
          notes.push({ pitch, name: midiName(pitch), startTick: tick, durTicks, bar: barNo, chord: slot.symbol, velocity });
        }
        tick += durTicks;
      }
    }
  }
  const totalTicks = tick;
  const secPerTick = (60 / comp.tempo) / ppq;
  for (const n of notes) { n.startSec = +(n.startTick * secPerTick).toFixed(4); n.durSec = +(n.durTicks * secPerTick).toFixed(4); }
  comp.render = { ppq, tempo: comp.tempo, meter: comp.meter, totalTicks, durationSec: +(totalTicks * secPerTick).toFixed(3), notes };
  logOp(comp, "render_composition", { ppq, velocity },
    `Rendered ${notes.length} note events across ${barNo} bar(s), ${comp.render.durationSec}s.`);
  return comp.render;
}

// ─── op: reharmonize_section (uses the grid's reharm engine on a section) ─────
export function reharmonizeSection(grid, comp, opts = {}) {
  const section = comp.sections[opts.sectionIndex || 0];
  if (!section) return { composition: comp, alternatives: [] };
  const flat = section.bars.flatMap((b) => b.chords.map((c) => c.symbol));
  const r = gridReharm(grid, flat, { key: comp.tonic, technique: opts.technique });
  logOp(comp, "reharmonize_section", { technique: opts.technique || "auto", section: section.name },
    `Found ${r?.alternatives?.length || 0} reharmonization(s) for section ${section.name}.`);
  return { composition: comp, original: flat, alternatives: r?.alternatives || [] };
}

// ─── op: set_chord (the manual tweak: "change bar 2 to C7b9") ─────────────────
export function setChord(grid, comp, { bar, slot = 0, symbol, sectionIndex = 0 }) {
  const section = comp.sections[sectionIndex];
  if (!section) return { ok: false, error: "no_section" };
  const target = section.bars.find((b) => b.index === bar - 1) || section.bars[bar - 1];
  if (!target || !target.chords[slot]) return { ok: false, error: "no_bar" };
  if (!parseChord(grid, symbol)) return { ok: false, error: "invalid_chord", symbol };
  const old = target.chords[slot].symbol;
  const a = gridAnalyze(grid, symbol, comp.tonic);
  target.chords[slot].symbol = symbol;
  target.chords[slot].roman = a && !a.__badKey ? (a.numeral ?? a.function ?? "?") : "?";
  target.chords[slot].voicing = null; // invalidate — needs a re-voice
  logOp(comp, "set_chord", { bar, slot, from: old, to: symbol }, `Bar ${bar}: ${old} → ${symbol}.`);
  return { ok: true, from: old, to: symbol };
}

// ─── op: export_midi → Standard MIDI File (format 0) bytes ────────────────────
export function exportMidi(comp, opts = {}) {
  if (!comp.render) throw new Error("export_midi: render the composition first");
  const { ppq, tempo, notes, meter } = comp.render;
  // absolute event list
  const evs = [];
  for (const n of notes) {
    evs.push({ tick: n.startTick, kind: 1, pitch: n.pitch, vel: n.velocity });           // on
    evs.push({ tick: n.startTick + n.durTicks, kind: 0, pitch: n.pitch, vel: 0 });        // off
  }
  evs.sort((a, b) => a.tick - b.tick || a.kind - b.kind); // off (0) before on (1) at same tick

  const track = [];
  // tempo meta
  const upq = Math.round(60000000 / tempo);
  track.push(0x00, 0xff, 0x51, 0x03, (upq >> 16) & 0xff, (upq >> 8) & 0xff, upq & 0xff);
  // time signature meta (den as power of two)
  const dd = Math.round(Math.log2(meter[1] || 4));
  track.push(0x00, 0xff, 0x58, 0x04, meter[0], dd, 24, 8);
  let last = 0;
  for (const e of evs) {
    track.push(...vlq(e.tick - last)); last = e.tick;
    track.push(e.kind ? 0x90 : 0x80, e.pitch & 0x7f, e.vel & 0x7f);
  }
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 0xff, ppq & 0xff];
  const tlen = track.length;
  const trkHdr = [0x4d, 0x54, 0x72, 0x6b, (tlen >> 24) & 0xff, (tlen >> 16) & 0xff, (tlen >> 8) & 0xff, tlen & 0xff];
  return Uint8Array.from([...header, ...trkHdr, ...track]);
}
export function vlq(value) {
  value = Math.max(0, Math.round(value));
  const bytes = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value > 0) { bytes.unshift((value & 0x7f) | 0x80); value = Math.floor(value / 128); }
  return bytes;
}

// ─── op: inspect_composition → human/agent readout ───────────────────────────
export function leadSheetText(section) {
  if (!section || !section.bars) return "| (empty) |";
  return "| " + section.bars.map((b) => b.chords.map((c) => c.symbol).join(" ")).join(" | ") + " |";
}
export function inspectComposition(comp) {
  const sections = comp.sections.map((s) => ({
    name: s.name,
    leadSheet: leadSheetText(s),
    bars: s.bars.map((b) => ({
      bar: b.index + 1,
      chords: b.chords.map((c) => ({ symbol: c.symbol, roman: c.roman, beats: c.beats, notes: c.voicing?.notes ?? null })),
    })),
  }));
  return {
    id: comp.id, title: comp.title, key: comp.key, tempo: comp.tempo, meter: comp.meter,
    sections,
    durationSec: comp.render?.durationSec ?? null,
    noteCount: comp.render?.notes.length ?? null,
    operations: comp.operations.map((o) => `${o.n}. ${o.summary}`),
  };
}

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

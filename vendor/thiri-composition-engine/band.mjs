// THIRI Conductor Lab — the virtual-band layer over the Composition IR.
//
// Turns a chord progression (already composed + voiced on `comp`) into a 4-lane
// arranged performance: harmony keys, pattern/arp keys, bass synth, drum step-
// sequencer. Everything hangs off `comp.band` so the single-track Composition Lab
// path (exportMidi) is untouched. Pure JS over the grid; the WAV render is local
// (fluidsynth) via playback.mjs — same as the Composition Lab.
//
//   compose+voice (composition.mjs) → buildBand → renderBand → exportBandMidi
//   → format-1 multi-track .mid → fluidsynth → mixed WAV (keys+bass+drums)
//
// Design notes:
//  - integer ticks only (ppq=480, STEP=120=16th); no float tick math.
//  - drums on channel 9 (= GM "channel 10"); program changes for the other lanes.
//  - exportBandMidi reuses the EXACT off-before-on comparator + vlq() from
//    composition.mjs, so SMF invariants match what comp-test asserts.

import { parseChord, resolve as gridResolve } from "./grid-core.mjs";
import { vlq } from "./composition.mjs";

export const PPQ = 480;
export const STEP = PPQ / 4; // 120 ticks = one sixteenth

// ── canonical lane / channel / program / drum maps ──
export const LANE_SPEC = {
  harmony: { channel: 0, program: 4 },   // E.Piano 1 (Rhodes)
  pattern: { channel: 1, program: 88 },  // pad ("new age")
  bass:    { channel: 2, program: 38 },  // Synth Bass 1
  drums:   { channel: 9, program: null },// GM percussion (channel 10), no program
};
export const DRUM_NOTES = { kick: 36, snare: 38, closedHat: 42, openHat: 46, ride: 51, ghostSnare: 38, rim: 37 };

// 16-step grooves (sparse step indices, 0..15; downbeats at 0/4/8/12).
export const GROOVES = {
  straight: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  funk:     { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], ghost: [7, 15] },
  gospel:   { kick: [0, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  neosoul:  { kick: [0, 3, 8], snare: [4, 12], hat: [2, 6, 10, 14], ghost: [7] },
  swing:    { kick: [0, 8], snare: [4, 12], ride: [0, 4, 8, 12], hat: [2, 6, 10, 14] },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function pickGroove(feel = "") {
  const f = String(feel).toLowerCase();
  if (/gospel/.test(f)) return "gospel";
  if (/neo|soul/.test(f)) return "neosoul";
  if (/funk/.test(f)) return "funk";
  if (/swing|shuffle/.test(f)) return "swing";
  return "straight";
}

// ── conductor: pick integer BPM so total duration lands in [8,15]s ──
export function makeConductor(comp, opts = {}) {
  const meter = comp.meter || [4, 4];
  const beatsPerBar = meter[0] || 4;
  const bars = comp.sections?.reduce((n, s) => n + s.bars.length, 0) || 4;
  const totalBeats = bars * beatsPerBar;

  // target seconds: explicit, else keep natural tempo if it already lands in range, else aim 11s
  let target = Number.isFinite(opts.durationSec) ? clamp(opts.durationSec, 8, 15) : null;
  if (target == null) {
    const natural = totalBeats * (60 / (opts.tempo || comp.tempo || 80));
    target = natural >= 8 && natural <= 15 ? natural : 11;
  }
  let tempo = clamp(Math.round((totalBeats * 60) / target), 50, 160);
  // recompute duration from the INTEGER tempo actually used (avoids WAV drift)
  let durationSec = +((totalBeats * 60) / tempo).toFixed(3);
  // if clamping pushed us out of range, nudge once more toward the nearest bound
  if (durationSec < 8) { tempo = clamp(Math.round((totalBeats * 60) / 8), 50, 160); durationSec = +((totalBeats * 60) / tempo).toFixed(3); }
  if (durationSec > 15) { tempo = clamp(Math.round((totalBeats * 60) / 15), 50, 160); durationSec = +((totalBeats * 60) / tempo).toFixed(3); }

  const energy = normalizeEnergy(opts.energy);
  const conductor = {
    durationSec, tempo, key: comp.key, mode: comp.mode, meter, bars, ppq: PPQ,
    swing: clamp(Number.isFinite(opts.swing) ? opts.swing : 0, 0, 0.66),
    energy, groove: opts.groove || pickGroove(opts.feel), loopable: true,
  };
  comp.tempo = tempo; // keep comp + render in agreement
  return conductor;
}

function normalizeEnergy(e) {
  if (e && Number.isFinite(e.start) && Number.isFinite(e.peak) && Number.isFinite(e.end)) {
    return { start: clamp(e.start, 0, 1), peak: clamp(e.peak, 0, 1), end: clamp(e.end, 0, 1) };
  }
  return { start: 0.5, peak: 0.72, end: 0.6 };
}

// per-bar energy scalar (0..1) following start→peak→end
function energyAt(barIdx, nBars, energy) {
  if (nBars <= 1) return energy.peak;
  const half = (nBars - 1) / 2;
  if (barIdx <= half) return lerp(energy.start, energy.peak, half === 0 ? 1 : barIdx / half);
  return lerp(energy.peak, energy.end, (barIdx - half) / (nBars - 1 - half));
}
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const velFromEnergy = (e, accent = 0) => clamp(Math.round(52 + 60 * e + accent), 1, 127);

// walk every chord slot with absolute tick anchors (mirrors renderComposition timing)
function slotWalk(comp) {
  const beatTicks = PPQ;
  const out = [];
  let tick = 0, barNo = 0;
  for (const section of comp.sections) {
    for (const bar of section.bars) {
      const barStart = tick;
      let st = tick;
      for (const slot of bar.chords) {
        const dur = Math.round(slot.beats * beatTicks);
        out.push({ barNo, barStart, slot, slotStart: st, slotDur: dur });
        st += dur;
      }
      tick = barStart + beatTicks * (comp.meter[0] || 4);
      barNo++;
    }
  }
  return out;
}

// resolve a chord to a midi pitch set (prefer the existing voicing, else grid)
function chordMidi(grid, slot) {
  if (slot.voicing?.midi?.length) return slot.voicing.midi.slice();
  const r = gridResolve(grid, slot.symbol);
  return r?.midi?.length ? r.midi.slice() : [];
}

// ── lane generators ──
export function laneHarmony(grid, comp, cond) {
  const walk = slotWalk(comp);
  const notes = [];
  for (const w of walk) {
    const e = energyAt(w.barNo, cond.bars, cond.energy);
    const midi = chordMidi(grid, w.slot);
    for (const pitch of midi) {
      notes.push({ pitch, startTick: w.slotStart, durTicks: w.slotDur, velocity: velFromEnergy(e, -6) });
    }
  }
  return lane("harmony", notes, `comp · ${cond.bars} bars`);
}

export function lanePattern(grid, comp, cond, opts = {}) {
  const dir = opts.arpDir || "up";
  const walk = slotWalk(comp);
  const notes = [];
  for (const w of walk) {
    const e = energyAt(w.barNo, cond.bars, cond.energy);
    const sub = e > 0.6 ? STEP : STEP * 2; // 16ths when busy, else 8ths
    const seq = arpSequence(chordMidi(grid, w.slot), dir);
    if (!seq.length) continue;
    let i = 0;
    for (let t = w.slotStart; t < w.slotStart + w.slotDur; t += sub) {
      const onBeat = (t % PPQ) === 0;
      notes.push({ pitch: seq[i % seq.length], startTick: t, durTicks: Math.max(1, sub - 10), velocity: velFromEnergy(e, onBeat ? 6 : -8) });
      i++;
    }
  }
  return lane("pattern", notes, `arp ${dir}`);
}

function arpSequence(midi, dir) {
  const asc = midi.slice().sort((a, b) => a - b);
  if (dir === "down") return asc.slice().reverse();
  if (dir === "updown" && asc.length > 2) return asc.concat(asc.slice(1, -1).reverse());
  return asc;
}

export function laneDrums(comp, cond) {
  const g = GROOVES[cond.groove] || GROOVES.straight;
  const swingOff = Math.round(cond.swing * STEP);
  const notes = [];
  for (let b = 0; b < cond.bars; b++) {
    const barStart = b * (comp.meter[0] || 4) * PPQ;
    const e = energyAt(b, cond.bars, cond.energy);
    const add = (steps, pitch, baseVel) => {
      for (const s of steps || []) {
        const off = (s % 4 === 2) ? swingOff : 0; // delay the off-eighths for swing
        notes.push({ pitch, startTick: barStart + s * STEP + off, durTicks: 60, velocity: clamp(baseVel + (s % 4 === 0 ? 8 : 0), 1, 127) });
      }
    };
    add(g.kick, DRUM_NOTES.kick, velFromEnergy(e, 12));
    add(g.snare, DRUM_NOTES.snare, velFromEnergy(e, 6));
    add(g.hat, DRUM_NOTES.closedHat, velFromEnergy(e, -14));
    add(g.ride, DRUM_NOTES.ride, velFromEnergy(e, -10));
    if (e > 0.55) add(g.ghost, DRUM_NOTES.ghostSnare, 30); // ghosts only when energetic
    if (e > 0.8) add([14], DRUM_NOTES.openHat, velFromEnergy(e, -8)); // open hat lift at peak
  }
  return lane("drums", notes, `${cond.groove} groove`);
}

export function laneBass(grid, comp, cond) {
  const g = GROOVES[cond.groove] || GROOVES.straight;
  const swingOff = Math.round(cond.swing * STEP);
  const walk = slotWalk(comp);
  // chord lookup by tick: which slot covers tick t
  const slotAt = (t) => {
    let found = walk[0];
    for (const w of walk) { if (t >= w.slotStart) found = w; else break; }
    return found;
  };
  const notes = [];
  for (let b = 0; b < cond.bars; b++) {
    const barStart = b * (comp.meter[0] || 4) * PPQ;
    const e = energyAt(b, cond.bars, cond.energy);
    // bass onsets = kick steps (so bass + kick lock together)
    const onsets = (g.kick || [0]).map((s) => barStart + s * STEP + ((s % 4 === 2) ? swingOff : 0)).sort((a, x) => a - x);
    for (let k = 0; k < onsets.length; k++) {
      const t = onsets[k];
      const w = slotAt(t);
      const pc = (parseChord(grid, w.slot.symbol)?.rootPC);
      if (pc == null) continue;
      const pitch = 36 + pc; // octave 2
      const next = k + 1 < onsets.length ? onsets[k + 1] : barStart + (comp.meter[0] || 4) * PPQ;
      const dur = clamp(next - t, STEP, 4 * STEP);
      notes.push({ pitch, startTick: t, durTicks: dur, velocity: velFromEnergy(e, 4) });
    }
  }
  return lane("bass", notes, "root motion · locked to kick");
}

function lane(role, notes, summary) {
  const spec = LANE_SPEC[role];
  return { role, channel: spec.channel, program: spec.program, notes, summary };
}

// ── assemble + render + export ──
export function buildBand(grid, comp, opts = {}) {
  const cond = makeConductor(comp, opts);
  const harmony = laneHarmony(grid, comp, cond);
  const pattern = lanePattern(grid, comp, cond, { arpDir: opts.arpDir });
  const bass = laneBass(grid, comp, cond);
  const drums = laneDrums(comp, cond);
  // optional per-lane program overrides from NL hints
  if (opts.programs) {
    if (Number.isFinite(opts.programs.harmony)) harmony.program = opts.programs.harmony;
    if (Number.isFinite(opts.programs.pattern)) pattern.program = opts.programs.pattern;
    if (Number.isFinite(opts.programs.bass)) bass.program = opts.programs.bass;
  }
  comp.band = { conductor: cond, lanes: [harmony, pattern, bass, drums] };
  return comp.band;
}

export function renderBand(comp) {
  if (!comp.band) throw new Error("renderBand: build the band first (buildBand)");
  const cond = comp.band.conductor;
  const totalTicks = cond.bars * (comp.meter[0] || 4) * PPQ; // clean loop length
  const secPerTick = (60 / cond.tempo) / cond.ppq;
  comp.band.render = { ppq: cond.ppq, tempo: cond.tempo, totalTicks, durationSec: +(totalTicks * secPerTick).toFixed(3) };
  return comp.band.render;
}

const trackName = (s) => [0x00, 0xff, 0x03, s.length & 0x7f, ...[...s].map((c) => c.charCodeAt(0) & 0x7f)];

export function exportBandMidi(comp) {
  if (!comp.band) throw new Error("exportBandMidi: build the band first");
  if (!comp.band.render) renderBand(comp);
  const { conductor, lanes } = comp.band;
  const ppq = conductor.ppq;
  const tracks = [];

  // Track 0 — conductor: tempo + time signature + name
  {
    const t = [...trackName("Conductor")];
    const upq = Math.round(60000000 / conductor.tempo);
    t.push(0x00, 0xff, 0x51, 0x03, (upq >> 16) & 0xff, (upq >> 8) & 0xff, upq & 0xff);
    const dd = Math.round(Math.log2(conductor.meter[1] || 4));
    t.push(0x00, 0xff, 0x58, 0x04, conductor.meter[0], dd, 24, 8);
    t.push(0x00, 0xff, 0x2f, 0x00);
    tracks.push(t);
  }

  // one track per lane (program-change + notes), same channel within the track
  for (const ln of lanes) {
    const t = [...trackName(ln.role)];
    const ch = ln.channel & 0x0f;
    if (ln.program != null) t.push(0x00, 0xc0 | ch, ln.program & 0x7f); // delta 0 program change
    const evs = [];
    for (const n of ln.notes) {
      evs.push({ tick: n.startTick, kind: 1, pitch: n.pitch, vel: n.velocity });          // on
      evs.push({ tick: n.startTick + n.durTicks, kind: 0, pitch: n.pitch, vel: 0 });       // off
    }
    evs.sort((a, b) => a.tick - b.tick || a.kind - b.kind); // off (0) before on (1) at same tick
    let last = 0;
    for (const e of evs) {
      t.push(...vlq(e.tick - last)); last = e.tick;
      t.push((e.kind ? 0x90 : 0x80) | ch, e.pitch & 0x7f, e.vel & 0x7f);
    }
    t.push(0x00, 0xff, 0x2f, 0x00);
    tracks.push(t);
  }

  const ntrks = tracks.length;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (ntrks >> 8) & 0xff, ntrks & 0xff, (ppq >> 8) & 0xff, ppq & 0xff];
  const out = [...header];
  for (const t of tracks) {
    const len = t.length;
    out.push(0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...t);
  }
  return Uint8Array.from(out);
}

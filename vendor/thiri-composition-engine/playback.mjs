// THIRI Composition Lab — local playback + .mid file writing.
//
// Pure node, no npm deps. Renders a Composition's MIDI to an actual .mid file,
// and (optionally) to audio via fluidsynth + a General MIDI soundfont, then plays
// it with afplay (macOS). This is the "hear it" path — local only (fluidsynth
// cannot run in a Cloudflare Worker), so it lives beside the engine, not in the API.
//
//   composition (with .render) --exportMidi--> bytes --writeMidiFile--> file.mid
//   file.mid --fluidsynth--> file.wav --afplay--> speakers
//
// Falls back gracefully: if fluidsynth/soundfont/afplay are missing, MIDI export
// still works and we report what's unavailable instead of throwing.

import { writeFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { exportMidi, renderComposition } from "./composition.mjs";
import { exportBandMidi, renderBand } from "./band.mjs";

// ── locate fluidsynth + a soundfont (best-effort, cached) ──
const SF2_CANDIDATES = [
  "/opt/homebrew/Cellar/csound/6.18.1_14/Frameworks/CsoundLib64.framework/Versions/6.0/samples/sf_GMbank.sf2",
  "/Library/Frameworks/CsoundLib64.framework/Versions/6.0/samples/sf_GMbank.sf2",
  "/opt/homebrew/share/fluid-synth/sf2/VintageDreamsWaves-v2.sf2",
  "/usr/share/sounds/sf2/FluidR3_GM.sf2",
  "/usr/share/soundfonts/FluidR3_GM.sf2",
];

function which(bin) {
  try {
    const out = execFileSync("/usr/bin/which", [bin], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out || null;
  } catch { return null; }
}

let _env = null;
export function playbackEnv() {
  if (_env) return _env;
  const fluidsynth = which("fluidsynth") || (existsSync("/opt/homebrew/bin/fluidsynth") ? "/opt/homebrew/bin/fluidsynth" : null);
  const afplay = which("afplay") || (existsSync("/usr/bin/afplay") ? "/usr/bin/afplay" : null);
  const soundfont = SF2_CANDIDATES.find((p) => existsSync(p)) || null;
  _env = { fluidsynth, afplay, soundfont, canRenderAudio: !!(fluidsynth && soundfont), canPlay: !!afplay };
  return _env;
}

// ── write the composition's MIDI to a .mid file (always works, no external bins) ──
export function writeMidiFile(grid, comp, path = "/tmp/thiri-composition.mid") {
  if (!comp.render) renderComposition(grid, comp);
  const bytes = exportMidi(comp);
  writeFileSync(path, Buffer.from(bytes));
  return { path, bytes: bytes.length };
}

// ── write a BAND composition's multi-track MIDI to a .mid file (Conductor Lab) ──
// Same shape as writeMidiFile, but uses the 4-lane format-1 export. fluidsynth
// renders it directly (keys + bass + drums-on-ch10 mixed in one pass).
export function writeBandMidiFile(grid, comp, path = "/tmp/thiri-band.mid") {
  if (!comp.band?.render) renderBand(comp);
  const bytes = exportBandMidi(comp);
  writeFileSync(path, Buffer.from(bytes));
  return { path, bytes: bytes.length };
}

// ── render the .mid to a .wav via fluidsynth (offline, fast-render) ──
export function renderWav(midiPath, wavPath = midiPath.replace(/\.mid$/i, ".wav")) {
  const env = playbackEnv();
  if (!env.canRenderAudio) {
    return { ok: false, reason: !env.fluidsynth ? "fluidsynth not found" : "no soundfont found", wavPath: null };
  }
  // fluidsynth -ni -F out.wav -r 44100 <soundfont> <midi>
  const r = spawnSync(env.fluidsynth, ["-ni", "-F", wavPath, "-r", "44100", env.soundfont, midiPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0 || !existsSync(wavPath)) {
    return { ok: false, reason: `fluidsynth exit ${r.status}: ${(r.stderr || "").slice(0, 200)}`, wavPath: null };
  }
  return { ok: true, wavPath };
}

// ── play a .wav (macOS afplay), blocking ──
export function playWav(wavPath) {
  const env = playbackEnv();
  if (!env.canPlay) return { ok: false, reason: "afplay not found" };
  const r = spawnSync(env.afplay, [wavPath], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  return r.status === 0 ? { ok: true } : { ok: false, reason: `afplay exit ${r.status}` };
}

// ── one-shot: composition -> .mid (+ optional .wav render + play) ──
// opts: { midiPath, wav (bool, default true), play (bool, default false) }
export function playComposition(grid, comp, opts = {}) {
  const midiPath = opts.midiPath || "/tmp/thiri-composition.mid";
  const out = { midi: writeMidiFile(grid, comp, midiPath), audio: null, played: false };
  const env = playbackEnv();
  out.env = { fluidsynth: !!env.fluidsynth, soundfont: env.soundfont, afplay: !!env.afplay };

  if (opts.wav !== false && env.canRenderAudio) {
    out.audio = renderWav(midiPath);
    if (out.audio.ok && opts.play && env.canPlay) {
      const p = playWav(out.audio.wavPath);
      out.played = p.ok;
      if (!p.ok) out.playError = p.reason;
    }
  } else if (opts.wav !== false) {
    out.audio = { ok: false, reason: env.fluidsynth ? "no soundfont" : "fluidsynth not installed" };
  }
  return out;
}

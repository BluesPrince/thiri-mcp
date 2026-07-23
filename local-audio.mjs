// THIRI Composition — local audio helper (engine-free).
//
// The composition engine now lives behind the API (POST /v2/compose), so this
// client no longer bundles it. What MUST stay local is turning the MIDI the API
// returns into sound: write bytes → .mid, fluidsynth → .wav, afplay → speakers.
// None of that is engine code — just subprocess wrappers — so it ships in the
// (MIT) client with no IP exposure.
//
//   midiBase64 (from API) --writeMidiBase64--> file.mid
//   file.mid --fluidsynth--> file.wav --afplay--> speakers

import { writeFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

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

// Decode base64 MIDI (from the API) to a .mid file. Always works, no external bins.
export function writeMidiBase64(midiBase64, path = "/tmp/thiri-composition.mid") {
  const buf = Buffer.from(midiBase64, "base64");
  writeFileSync(path, buf);
  return { path, bytes: buf.length };
}

export function renderWav(midiPath, wavPath = midiPath.replace(/\.mid$/i, ".wav")) {
  const env = playbackEnv();
  if (!env.canRenderAudio) {
    return { ok: false, reason: !env.fluidsynth ? "fluidsynth not found" : "no soundfont found", wavPath: null };
  }
  const r = spawnSync(env.fluidsynth, ["-ni", "-F", wavPath, "-r", "44100", env.soundfont, midiPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0 || !existsSync(wavPath)) {
    return { ok: false, reason: `fluidsynth exit ${r.status}: ${(r.stderr || "").slice(0, 200)}`, wavPath: null };
  }
  return { ok: true, wavPath };
}

export function playWav(wavPath) {
  const env = playbackEnv();
  if (!env.canPlay) return { ok: false, reason: "afplay not found" };
  const r = spawnSync(env.afplay, [wavPath], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  return r.status === 0 ? { ok: true } : { ok: false, reason: `afplay exit ${r.status}` };
}

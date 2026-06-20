// THIRI Conductor Lab — natural-language → band/conductor intent.
//
// Rule-based (deterministic, testable), mirroring comp-nl.mjs's key/length/feel
// parsing and adding band direction: duration, swing, energy arc, groove,
// arpeggio direction, and per-lane instrument hints → GM program numbers.

import { parseKey } from "./composition.mjs";
import { pickGroove } from "./band.mjs";

const KEY_IN_RE = /\bin\s+([A-G][#b]?)\s*(minor|major|min|maj|m)?\b/i;
const KEY_RE = /\b([A-G][#b]?)\s*(minor|major|min|maj|m)?\b/;

function findKey(text) {
  const m = KEY_IN_RE.exec(text) || KEY_RE.exec(text);
  if (!m) return null;
  const k = m[1][0].toUpperCase() + (m[1].slice(1) || "");
  const mode = /min|minor|\bm\b|m$/i.test(m[2] || "") ? " minor" : "";
  return parseKey(k + mode) ? k + mode : null;
}
const findLength = (text) => (/\b8[\s-]*bar|\beight[\s-]*bar/i.test(text) ? 8 : 4);

// instrument hint → GM program, per lane
const PROGRAM_HINTS = {
  harmony: [[/rhodes|e\.?\s?piano|electric piano/, 4], [/wurli/, 5], [/\bpiano\b/, 0], [/organ/, 17], [/clav/, 7]],
  pattern: [[/warm pad/, 89], [/\bpad\b/, 88], [/\blead\b/, 81], [/square/, 80], [/bell/, 11], [/synth keys|\barp\b/, 81]],
  bass:    [[/analog bass|moog/, 38], [/synth ?bass/, 39], [/finger bass|electric bass/, 33], [/sub ?bass|808/, 38]],
};
const hint = (text, lane) => { for (const [re, prog] of PROGRAM_HINTS[lane]) if (re.test(text)) return prog; return undefined; };

export function interpretConduct(text = "") {
  const t = String(text).trim();
  const lower = t.toLowerCase();

  const durM = /(\d{1,2})[-\s]*(?:seconds?|secs?|s)\b/.exec(lower);
  const durationSec = durM ? Math.max(8, Math.min(15, parseInt(durM[1], 10))) : undefined;

  const swing = /swing|shuffle|swung/.test(lower) ? 0.55 : (/straight/.test(lower) ? 0 : undefined);

  let energy;
  if (/build|rise|grow|climb|crescendo|lift/.test(lower)) {
    energy = { start: 0.32, peak: 0.92, end: /resolve|settle|calm|release|warm|soft/.test(lower) ? 0.55 : 0.82 };
  } else if (/calm|sparse|mellow|chill|quiet|gentle/.test(lower)) {
    energy = { start: 0.35, peak: 0.52, end: 0.4 };
  }

  const groove = pickGroove(lower);
  const arpDir = /\bdown\b/.test(lower) ? "down" : (/up\s*and\s*down|updown|back and forth/.test(lower) ? "updown" : "up");
  const harmonyStyle = /\bpad\b|warm|lush/.test(lower) ? "pad" : (/\bshell\b|sparse/.test(lower) ? "shell" : "rootless");
  const programs = { harmony: hint(lower, "harmony"), pattern: hint(lower, "pattern"), bass: hint(lower, "bass") };

  return {
    key: findKey(t) || "C",
    length: findLength(lower),
    complexity: /simple|basic/.test(lower) ? "simple" : "rich",
    feel: lower,
    durationSec, swing, energy, groove, arpDir, harmonyStyle, programs,
    title: t.slice(0, 48) || "Conductor",
  };
}

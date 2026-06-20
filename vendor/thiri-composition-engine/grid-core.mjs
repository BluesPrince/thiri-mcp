// THIRI grid — universal algorithms over the integer grid. Pure JS, no env,
// no special cases. Runs in node (local tests) and in the Worker.

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJREF = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

export function buildGrid(qualities, scales) {
  const aliasIndex = new Map();
  for (const q of qualities) for (const a of q.aliases) aliasIndex.set(a, q);
  return { aliasIndex, qualities, scales };
}

// label "M3" / "m7" / "A11" / "d5" -> semitones from root + diatonic letter-steps
function labelToTone(label) {
  const m = /^([PMmAd]+)(\d+)$/.exec(label);
  if (!m) return null;
  const q = m[1], degree = parseInt(m[2], 10);
  const sd = ((degree - 1) % 7) + 1, oct = Math.floor((degree - 1) / 7);
  const base = MAJREF[sd] + 12 * oct;
  const perfect = sd === 1 || sd === 4 || sd === 5;
  const adj = perfect ? { P: 0, A: 1, d: -1 }[q] : { M: 0, m: -1, A: 1, d: -2 }[q];
  if (adj === undefined) return null;
  return { semitones: base + adj, letterSteps: (degree - 1) % 7 };
}

export function spell(rootLetter, rootPC, label) {
  const t = labelToTone(label);
  if (!t) return null;
  const targetLetter = LETTERS[(LETTERS.indexOf(rootLetter) + t.letterSteps) % 7];
  const targetPC = (rootPC + t.semitones) % 12;
  // Map the letter→pitch gap into [-6, 5]. Positive-modulo first: JS '%' keeps the
  // sign of the dividend, so a bare `% 12` returns negative for B# (0 - 11 = -11),
  // which previously rendered as eleven flats. (report #1: C#maj7/G#maj7 → Bbbbb…)
  const acc = ((((targetPC - LETTER_PC[targetLetter] + 6) % 12) + 12) % 12) - 6;
  const sym = acc === 0 ? "" : acc > 0 ? "#".repeat(acc) : "b".repeat(-acc);
  return targetLetter + sym;
}

// Compose an altered dominant from a "7" base + stacked alteration tokens, so
// combinations we don't enumerate as QUALITIES (e.g. "7b9#11", "7#9b13") still
// parse and carry every alteration into the pitch set (report #10). A token that
// alters the fifth (b5/#5) replaces the natural P5; the rest are added as tensions.
const ALT_TOKENS = {
  b5:   { semi: 6,  label: "d5",  replaces: 7 },
  "#5": { semi: 8,  label: "A5",  replaces: 7 },
  b9:   { semi: 13, label: "m9" },
  "#9": { semi: 15, label: "A9" },
  "#11":{ semi: 18, label: "A11" },
  b13:  { semi: 20, label: "m13" },
};
function composeAlteredDominant(qstr) {
  const m = /^7((?:b5|#5|b9|#9|#11|b13){2,})$/.exec(qstr);
  if (!m) return null; // only fire for 2+ stacked alterations (singles are real QUALITIES)
  const tokens = m[1].match(/b5|#5|b9|#9|#11|b13/g) || [];
  let tones = [
    { semi: 0, label: "P1" }, { semi: 4, label: "M3" },
    { semi: 7, label: "P5" }, { semi: 10, label: "m7" },
  ];
  for (const tk of tokens) {
    const a = ALT_TOKENS[tk];
    if (!a) return null;
    if (a.replaces != null) tones = tones.filter((t) => t.semi !== a.replaces);
    if (!tones.some((t) => t.semi === a.semi)) tones.push({ semi: a.semi, label: a.label });
  }
  tones.sort((x, y) => x.semi - y.semi);
  return {
    id: "7" + tokens.join(""),
    display: "Altered Dominant (7" + tokens.join("") + ")",
    intervals: tones.map((t) => t.semi),
    labels: tones.map((t) => t.label),
    aliases: [],
  };
}

/** Parse "C", "Db7", "Cmaj7/E" -> {root, rootPC, bass, quality} or null (honest miss). */
export function parseChord(grid, input) {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().replace(/\s+/g, "");
  // Split a slash-bass ONLY when the part after "/" is a real note (C/G, Dm7/F).
  // "C6/9" is a 6/9 chord, not a slash — leave it attached to the symbol.
  let head = cleaned, bass = null;
  const sl = cleaned.indexOf("/");
  if (sl >= 0 && /^[A-G][#b]*$/.test(cleaned.slice(sl + 1))) {
    head = cleaned.slice(0, sl);
    bass = cleaned.slice(sl + 1);
  }
  const rm = /^([A-G])([#b]*)/.exec(head);
  if (!rm) return null;
  const rootLetter = rm[1], accStr = rm[2] || "";
  const rootAcc = (accStr.match(/#/g)?.length || 0) - (accStr.match(/b/g)?.length || 0);
  const rootPC = (((LETTER_PC[rootLetter] + rootAcc) % 12) + 12) % 12;
  let qstr = head.slice(rm[0].length).replace(/major/g, "maj").replace(/minor/g, "m");
  const quality = grid.aliasIndex.get(qstr) || composeAlteredDominant(qstr);
  if (!quality) return null;
  return { root: rootLetter + accStr, rootPC, bass: bass || null, quality };
}

const midiToFreq = (m) => Math.round(440 * Math.pow(2, (m - 69) / 12) * 100) / 100;
const SIZE_TIER = (n) => (n === 7 ? 0 : n === 8 ? 1 : n === 6 ? 2 : 3);

export function recommendScales(grid, chordIntervals) {
  const chordPCs = new Set(chordIntervals.map((i) => ((i % 12) + 12) % 12));
  const indexed = grid.scales.map((s, idx) => ({ s, idx, pcs: new Set(s.intervals.map((i) => i % 12)) }));
  const strict = (req) => indexed.filter(({ pcs }) => [...req].every((pc) => pcs.has(pc)));

  // Strict: a scale must contain every chord tone.
  let matches = strict(chordPCs);
  // Fallback (report #8): altered dominants (e.g. 7b13) hold both the P5 (7) and an
  // altered tension (b13 = 8) that no single scale contains, so strict match is empty.
  // The 5th is the most omittable chord tone — retry without it to land the
  // musically-right altered / whole-tone scales rather than an empty array.
  if (matches.length === 0 && chordPCs.has(7)) {
    matches = strict(new Set([...chordPCs].filter((pc) => pc !== 7)));
  }
  // Last resort: rank by best coverage so we never hand back an empty scales array.
  if (matches.length === 0) {
    const covered = (pcs) => [...chordPCs].filter((pc) => pcs.has(pc)).length;
    const best = Math.max(...indexed.map((x) => covered(x.pcs)));
    matches = indexed.filter((x) => covered(x.pcs) === best);
  }
  return matches
    .sort((a, b) => SIZE_TIER(a.s.intervals.length) - SIZE_TIER(b.s.intervals.length) || a.idx - b.idx)
    .slice(0, 5)
    .map(({ s }, i) => ({ name: s.id, role: i < 2 ? "primary" : "secondary", semitones: s.intervals, character: s.character }));
}

export function resolve(grid, input) {
  const p = parseChord(grid, input);
  if (!p) return null;
  const rootLetter = p.root[0];
  const rootMidi = 60 + p.rootPC;
  const midi = p.quality.intervals.map((s) => rootMidi + s);
  return {
    root: p.root, quality: p.quality.id, name: p.quality.display,
    notes: p.quality.labels.map((l) => spell(rootLetter, p.rootPC, l)),
    intervals: p.quality.labels, semitones: p.quality.intervals,
    midi, frequencies: midi.map(midiToFreq), bass: p.bass,
    scales: recommendScales(grid, p.quality.intervals),
  };
}

// Voice-leading score (ported verbatim from woodshed-engine voicer.ts:488).
// 0..1: common pitch classes (0.5 weight) + smallness of average motion (0.5).
export function computeVoiceLeadingScore(prev, next) {
  if (!prev?.length || !next?.length) return 0;
  const prevSet = new Set(prev.map((n) => ((n % 12) + 12) % 12));
  const nextSet = new Set(next.map((n) => ((n % 12) + 12) % 12));
  let common = 0;
  for (const n of nextSet) if (prevSet.has(n)) common++;
  const minSize = Math.min(prev.length, next.length);
  const ps = [...prev].sort((a, b) => a - b), ns = [...next].sort((a, b) => a - b);
  const avgMotion = ps.slice(0, minSize).reduce((s, p, i) => s + Math.abs(p - ns[i]), 0) / minSize;
  const commonScore = common / Math.max(prevSet.size, nextSet.size);
  const motionScore = Math.max(0, 1 - avgMotion / 12);
  return Math.round((commonScore * 0.5 + motionScore * 0.5) * 100) / 100;
}

// note name (e.g. "E3") → MIDI, for previousNotes scoring
function noteNameToMidiSafe(name) {
  const m = /^([A-G])([#b]*)(-?\d+)$/.exec(String(name).trim());
  if (!m) return null;
  const acc = (m[2].match(/#/g)?.length || 0) - (m[2].match(/b/g)?.length || 0);
  return 12 * (parseInt(m[3], 10) + 1) + (((LETTER_PC[m[1]] + acc) % 12) + 12) % 12;
}

// ─── voicings: numeric transforms on the chord-tone vector ──
export function voiceChord(grid, input, opts = {}) {
  const p = parseChord(grid, input);
  if (!p) return null;
  const style = opts.style || "pad";
  const octave = Number.isFinite(opts.octave) ? Math.min(8, Math.max(0, Math.trunc(opts.octave))) : 3;
  const rootLetter = p.root[0];
  const rootMidi = 12 * (octave + 1) + p.rootPC;
  const tones = p.quality.intervals.map((semi, i) => ({ semi, label: p.quality.labels[i], midi: rootMidi + semi }));

  // ── color preferences (ninth / eleventh) — added to pad & rootless only ──
  // keyContext upgrades a natural 11 to #11 over a major-3rd chord (avoids the clash).
  if (opts.colorPreferences && (style === "pad" || style === "rootless" || style === "bill_evans")) {
    const cp = opts.colorPreferences;
    const hasInterval = (set) => tones.some((t) => set.includes(((t.semi % 12) + 12) % 12));
    const addTone = (semi, label) => { if (!tones.some((t) => t.semi === semi)) tones.push({ semi, label, midi: rootMidi + semi }); };
    if (cp.ninth && cp.ninth !== "omit") {
      const map = { b9: [13, "m9"], "#9": [15, "A9"], natural: [14, "M9"] };
      const [semi, label] = map[cp.ninth] || map.natural; addTone(semi, label);
    }
    if (cp.eleventh && cp.eleventh !== "omit") {
      let pref = cp.eleventh;
      if (pref === "natural" && hasInterval([4]) && opts.keyContext) pref = "#11"; // avoid 11-vs-M3 clash
      const map = { natural: [17, "P11"], "#11": [18, "A11"] };
      const [semi, label] = map[pref] || map.natural; addTone(semi, label);
    }
    tones.sort((a, b) => a.midi - b.midi);
  }

  const pc = (t) => (((t.semi % 12) + 12) % 12);
  const has = (set) => tones.find((t) => set.includes(pc(t)));
  const root = tones[0], third = has([3, 4]), fifth = has([6, 7, 8]), seventh = has([10, 11]);
  let picked;
  switch (style) {
    case "rootless": case "bill_evans": picked = tones.slice(1); break;
    case "shell": picked = [root, third, seventh]; break;
    case "triad": picked = [root, third, fifth]; break;             // real 1-3-5 (audit #7)
    case "guide-tones": case "both-guide-tones": picked = [third, seventh]; break;
    case "guide-tone-1": picked = [third]; break;
    case "guide-tone-2": picked = [seventh]; break;
    case "drop2": case "drop-2": case "drop3": case "drop-3": {     // keep extensions (audit #6)
      const v = tones.slice(-4).map((t) => ({ ...t }));
      const fromTop = (style === "drop2" || style === "drop-2") ? 2 : 3;
      if (v.length >= fromTop) v[v.length - fromTop].midi -= 12;
      picked = v; break;
    }
    default: picked = tones;                                         // pad / close
  }
  picked = picked.filter(Boolean).sort((a, b) => a.midi - b.midi);
  if (p.bass) {                                                     // slash bass at the bottom (audit #5)
    const bpc = parseKeyPC(p.bass);
    if (bpc != null) picked.unshift({ midi: 12 * octave + bpc, bassName: p.bass });
  }
  const oct = (m) => Math.floor(m / 12) - 1;
  const spellTone = (t) => (t.bassName ? t.bassName : spell(rootLetter, p.rootPC, t.label)) + oct(t.midi);
  const midi = picked.map((t) => t.midi);
  const out = { chord: input, style, notes: picked.map(spellTone), midi, bass: p.bass };

  // voice-leading score vs a prior voicing (report #6): accept previousNotes (["E3",..])
  // or a previousVoicing object ({notes}|{midi}). Score the transition; caller decides.
  const prevNotes = opts.previousNotes
    || opts.previousVoicing?.notes
    || (Array.isArray(opts.previousVoicing?.midi) ? opts.previousVoicing.midi : null);
  if (prevNotes?.length) {
    const prevMidi = prevNotes.map((n) => (typeof n === "number" ? n : noteNameToMidiSafe(n))).filter((n) => n != null);
    if (prevMidi.length) out.voiceLeadingScore = computeVoiceLeadingScore(prevMidi, midi);
  }
  return out;
}

// ─── analyze: roman numerals, function, modal interchange, secondary dominants ──
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const DEGREE_FN = { 1: "tonic", 2: "predominant", 3: "tonic", 4: "subdominant", 5: "dominant", 6: "tonic", 7: "dominant" };
// the diatonic chord quality at each major-scale degree (for V7/x targets)
const DIATONIC_NUMERAL = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const CHROMATIC = { 1: "♭II", 3: "♭III", 6: "♯IV", 8: "♭VI", 10: "♭VII" };

function colorOf(q) {
  const iv = q.intervals, m3 = iv.includes(3), M3 = iv.includes(4), p5 = iv.includes(7);
  if (m3 && iv.includes(6) && !p5) return "dim";
  if (M3 && iv.includes(8) && !p5) return "aug";
  if (M3) return "maj";
  if (m3) return "min";
  return "none";
}
function suffixOf(q) {
  const id = q.id;
  if (id === "dim7") return "°7";
  if (id === "m7b5") return "ø7";
  if (/maj7|maj9|maj13/.test(id)) return "Δ7";
  if (id === "dim") return "°";
  if (id === "aug") return "+";
  if (id.includes("7") || id.includes("9") || id.includes("11") || id.includes("13")) return "7";
  return "";
}
const lowerIf = (rn, color) => (color === "min" || color === "dim" ? rn.toLowerCase() : rn);

function parseKeyPC(key) {
  const m = /^([A-G])([#b]*)$/.exec(key.trim());
  if (!m) return null;
  const acc = (m[2].match(/#/g)?.length || 0) - (m[2].match(/b/g)?.length || 0);
  return (((LETTER_PC[m[1]] + acc) % 12) + 12) % 12;
}

export function analyze(grid, input, key) {
  const p = parseChord(grid, input);
  if (!p) return null;
  const r = resolve(grid, input);
  const out = { symbol: input, root: p.root, quality: p.quality.id, name: p.quality.display,
    intervals: p.quality.semitones ?? p.quality.intervals, notes: r.notes, bassNote: p.bass, scales: r.scales };
  if (key === undefined || key === null || key === "") return out;

  const keyPC = parseKeyPC(key);
  if (keyPC === null) return { __badKey: true };

  const rootDeg = (((p.rootPC - keyPC) % 12) + 12) % 12;
  const color = colorOf(p.quality), suffix = suffixOf(p.quality);
  const tonePCs = p.quality.intervals.map((iv) => (((p.rootPC + iv - keyPC) % 12) + 12) % 12);
  const diatonicAll = tonePCs.every((pc) => MAJOR.includes(pc));
  const degIdx = MAJOR.indexOf(rootDeg);
  const isDom7 = p.quality.intervals.includes(4) && p.quality.intervals.includes(10) && !p.quality.intervals.includes(11);

  // 1. fully diatonic chord
  if (diatonicAll && degIdx >= 0) {
    out.diatonic = true;
    out.degree = degIdx + 1;
    out.numeral = lowerIf(ROMAN[degIdx], color) + suffix;
    out.function = DEGREE_FN[degIdx + 1];
    return out;
  }
  out.diatonic = false;

  // 2. secondary dominant: a dom7 that resolves down a fifth to a diatonic degree
  if (isDom7) {
    const targetDeg = (((p.rootPC + 5 - keyPC) % 12) + 12) % 12;
    const ti = MAJOR.indexOf(targetDeg);
    if (ti >= 0) {
      out.numeral = `V7/${DIATONIC_NUMERAL[ti]}`;
      out.degree = ti + 1; // the scale degree being tonicized (report #8: was undefined)
      out.function = "secondary dominant";
      return out;
    }
  }

  // 3. borrowed quality on a diatonic-degree root (e.g. Fm in C = iv)
  if (degIdx >= 0) {
    out.numeral = lowerIf(ROMAN[degIdx], color) + suffix;
    out.degree = degIdx + 1;
    out.function = DEGREE_FN[degIdx + 1] + " (borrowed)";
    out.borrowed = true;
    return out;
  }

  // 4. chromatic root (modal interchange / Neapolitan / tritone)
  if (CHROMATIC[rootDeg]) {
    out.numeral = lowerIf(CHROMATIC[rootDeg], color) + suffix;
    out.function = rootDeg === 1 ? "Neapolitan" : "borrowed";
    out.borrowed = true;
    return out;
  }

  out.function = "chromatic";
  return out;
}

// ─── reharmonize: substitution search over the grid ──
// Flat-preferring speller for generated symbols (jazz convention: Db7, not C#7).
const PC_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pcName = (pc) => PC_FLAT[(((pc % 12) + 12) % 12)];
const isDomFamily = (q) => q.intervals.includes(4) && q.intervals.includes(10) && !q.intervals.includes(11);
const parses = (grid, sym) => parseChord(grid, sym) != null;

/**
 * Reharmonize a progression. Returns real alternatives, one per applicable
 * technique. Every generated symbol is round-trip validated against the grid,
 * so an alternative is never an unparseable chord. Honest: returns __bad on a
 * progression with chords the grid can't parse; omits a technique that doesn't apply.
 */
export function reharmonize(grid, progression, opts = {}) {
  if (!Array.isArray(progression) || progression.length === 0) return null;
  const key = opts.key || null;
  const only = opts.technique && opts.technique !== "auto" ? String(opts.technique) : null;
  const want = (t) => !only || only === t;

  const parsed = progression.map((s) => ({ sym: s, p: parseChord(grid, s) }));
  const bad = parsed.filter((x) => !x.p).map((x) => x.sym);
  if (bad.length) return { __badProgression: true, bad };

  const alternatives = [];

  // 1. Tritone substitution — dom7-family chord → dom7 a tritone (root+6) away.
  if (want("tritone_sub")) {
    const prog = progression.slice(); const changes = [];
    parsed.forEach((x, i) => {
      if (isDomFamily(x.p.quality)) {
        const to = pcName(x.p.rootPC + 6) + "7";
        if (parses(grid, to)) { prog[i] = to; changes.push({ index: i, from: x.sym, to }); }
      }
    });
    if (changes.length) alternatives.push({ technique: "tritone_sub", progression: prog, changes,
      explanation: `Replaced ${changes.length} dominant chord(s) with the dominant a tritone away — shared guide tones (3rd/7th), chromatic root motion into the target.` });
  }

  // 2. ii–V insertion — set up the final target with its related ii–V.
  if (want("ii_v_insertion")) {
    const t = parsed[parsed.length - 1].p;
    const ii = pcName(t.rootPC + 2) + "m7";   // a fifth above the V
    const v = pcName(t.rootPC + 7) + "7";     // a fifth above the target
    const tgt = progression[progression.length - 1];
    if (parses(grid, ii) && parses(grid, v)) {
      alternatives.push({ technique: "ii_v_insertion",
        progression: [...progression.slice(0, -1), ii, v, tgt],
        changes: [{ index: progression.length - 1, insert: [ii, v], before: tgt }],
        explanation: `Inserted a ii–V (${ii} ${v}) to approach ${tgt} by the strongest functional cadence.` });
    }
  }

  // 3. Modal interchange — borrow diatonic chords from the parallel minor (needs key).
  if (want("modal_interchange") && key) {
    const keyPC = parseKeyPC(key);
    if (keyPC != null) {
      const BORROW = { 1: { off: 0, suf: "m" }, 2: { off: 2, suf: "m7b5" }, 4: { off: 5, suf: "m" },
        5: { off: 7, suf: "m" }, 6: { off: 8, suf: "" }, 7: { off: 10, suf: "" } };
      const prog = progression.slice(); const changes = [];
      parsed.forEach((x, i) => {
        const a = analyze(grid, x.sym, key);
        if (a && a.diatonic && a.degree && BORROW[a.degree]) {
          const b = BORROW[a.degree];
          const to = pcName(keyPC + b.off) + b.suf;
          if (to !== x.sym && parses(grid, to)) { prog[i] = to; changes.push({ index: i, from: x.sym, to, degree: a.degree }); }
        }
      });
      if (changes.length) alternatives.push({ technique: "modal_interchange", progression: prog, changes,
        explanation: `Borrowed ${changes.length} chord(s) from the parallel minor (e.g. iv, ♭VI, ♭VII) for darker color.` });
    }
  }

  // 4. Diminished passing — between roots a whole step apart, insert a chromatic dim7.
  if (want("diminished_passing") && parsed.length >= 2) {
    const out = []; const inserts = [];
    for (let i = 0; i < parsed.length; i++) {
      out.push(progression[i]);
      if (i < parsed.length - 1) {
        const up = ((parsed[i + 1].p.rootPC - parsed[i].p.rootPC) % 12 + 12) % 12;
        if (up === 2) {
          const dim = pcName(parsed[i].p.rootPC + 1) + "dim7";
          if (parses(grid, dim)) { out.push(dim); inserts.push({ after: i, chord: dim, between: [progression[i], progression[i + 1]] }); }
        }
      }
    }
    if (inserts.length) alternatives.push({ technique: "diminished_passing", progression: out, changes: inserts,
      explanation: `Inserted ${inserts.length} chromatic diminished passing chord(s) to connect chords a whole step apart by smooth voice-leading.` });
  }

  // 5. Secondary dominants — insert a V7/x (a fifth above) before each non-dominant target.
  if (want("secondary_dominant")) {
    const out = []; const inserts = [];
    for (let i = 0; i < parsed.length; i++) {
      const x = parsed[i];
      if (!isDomFamily(x.p.quality)) {
        const secDom = pcName(x.p.rootPC + 7) + "7"; // dom7 a perfect fifth above the target
        if (parses(grid, secDom) && secDom !== x.sym) {
          out.push(secDom);
          inserts.push({ before: i, chord: secDom, target: x.sym });
        }
      }
      out.push(progression[i]);
    }
    if (inserts.length) alternatives.push({ technique: "secondary_dominant", progression: out, changes: inserts,
      explanation: `Inserted ${inserts.length} secondary dominant(s) (V7/x) — each tonicizes the chord it precedes.` });
  }

  // 6. Chain of dominants — precede the final chord with a cycle-of-fifths run of dom7s.
  if (want("chain_of_dominants") && parsed.length >= 1) {
    const last = parsed[parsed.length - 1].p;
    const len = key === "__short" ? 2 : 3; // default chain length
    const chain = [];
    let cur = (last.rootPC + 7) % 12; // start at V of the final chord
    for (let n = 0; n < len; n++) { chain.unshift(pcName(cur) + "7"); cur = (cur + 7) % 12; }
    if (chain.every((c) => parses(grid, c))) {
      const tgt = progression[progression.length - 1];
      alternatives.push({ technique: "chain_of_dominants",
        progression: [...progression.slice(0, -1), ...chain, tgt],
        changes: [{ index: progression.length - 1, insert: chain, before: tgt }],
        explanation: `Chained ${chain.length} dominant(s) down the cycle of fifths into ${tgt}: ${chain.join(" → ")} → ${tgt}.` });
    }
  }

  // 7. Coltrane changes — replace a ii–V–I with the Giant Steps major-thirds cycle.
  if (want("coltrane_changes") && parsed.length >= 3) {
    const out = []; let i = 0; let applied = false;
    const isMinor = (q) => q.intervals.includes(3) && q.intervals.includes(7) && q.intervals.includes(10) && !q.intervals.includes(4);
    const isMaj = (q) => q.intervals.includes(4) && q.intervals.includes(7) && !q.intervals.includes(10);
    while (i < parsed.length) {
      const ii = parsed[i], V = parsed[i + 1], I = parsed[i + 2];
      if (ii && V && I && isMinor(ii.p.quality) && isDomFamily(V.p.quality) && isMaj(I.p.quality)) {
        // I → V7(of next) → bVI maj7 → ... major-3rd cycle, target spelled from original I root letter
        const r1 = I.p.rootPC;
        const ct = [
          I.p.root + "maj7",                     // keep the original chord's spelling (e.g. Cmaj7)
          pcName((r1 + 8) % 12) + "7",           // dom7 leading to the maj-3rd-up tonic
          pcName((r1 + 8) % 12) + "maj7",
          pcName((r1 + 4) % 12) + "7",           // dom7 back toward the home key
        ];
        if (ct.every((c) => parses(grid, c))) { out.push(...ct); i += 3; applied = true; continue; }
      }
      out.push(progression[i]); i++;
    }
    if (applied) alternatives.push({ technique: "coltrane_changes", progression: out,
      changes: [{ note: "ii–V–I replaced with Giant Steps major-thirds cycle" }],
      explanation: `Substituted a ii–V–I with Coltrane changes — three tonal centers a major third apart.` });
  }

  // 8. Backdoor — replace/insert a ♭VII7 → I (a whole step below the tonic target). Needs key.
  if (want("backdoor") && key) {
    const keyPC = parseKeyPC(key);
    if (keyPC != null) {
      const bVII = pcName((keyPC + 10) % 12) + "7"; // a whole step below the tonic
      const out = []; const changes = [];
      for (let i = 0; i < parsed.length; i++) {
        const x = parsed[i], nxt = parsed[i + 1];
        // before a tonic (I/i) chord, swap a resolving V7 for the backdoor ♭VII7
        const targetsTonic = nxt && (((nxt.p.rootPC - keyPC) % 12 + 12) % 12) === 0;
        if (isDomFamily(x.p.quality) && targetsTonic && parses(grid, bVII) && bVII !== x.sym) {
          out.push(bVII); changes.push({ index: i, from: x.sym, to: bVII });
        } else out.push(progression[i]);
      }
      if (changes.length) alternatives.push({ technique: "backdoor", progression: out, changes,
        explanation: `Backdoor cadence: ${bVII} → tonic (♭VII7 resolves up by whole step, borrowed from the parallel minor).` });
    }
  }

  return { original: progression, key, alternatives };
}

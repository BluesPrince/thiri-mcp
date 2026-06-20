/**
 * Csound score + CSD assembly (ported from woodshedai csoundScoreBuilder.ts).
 * Chord scoring accepts pre-resolved MIDI note arrays (from THIRI resolve/voicing).
 */

const NOTE_MAP = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function noteToFreq(note, octave) {
  const noteIndex = NOTE_MAP[note];
  if (noteIndex === undefined) return 440;
  const midi = (octave + 1) * 12 + noteIndex;
  return midiToHz(midi);
}

export function pitchToFreq(pitch) {
  const match = pitch.match(/^([A-G][b#]?)(\d)$/);
  if (!match) return 0;
  return noteToFreq(match[1], parseInt(match[2], 10));
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function beatsToSeconds(beats, tempo) {
  return (beats * 60) / tempo;
}

/** @param {{ symbol?: string, beats: number, midi?: number[], octave?: number }[]} chords */
export function buildChordScore(chords, instrNum, tempo, amp = 0.5) {
  const lines = [];
  let currentTime = 0;
  for (const chord of chords) {
    const duration = beatsToSeconds(chord.beats, tempo);
    const freqs = chord.midi?.length
      ? chord.midi.map(midiToHz)
      : [];
    for (const freq of freqs) {
      lines.push(`i ${instrNum} ${currentTime.toFixed(4)} ${duration.toFixed(4)} ${amp} ${freq.toFixed(4)}`);
    }
    currentTime += duration;
  }
  return lines.join("\n");
}

/** @param {{ pitch: string, beats: number }[]} notes */
export function buildMelodyScore(notes, instrNum, tempo, amp = 0.6) {
  const lines = [];
  let currentTime = 0;
  for (const note of notes) {
    const duration = beatsToSeconds(note.beats, tempo);
    if (note.pitch.toLowerCase() !== "rest") {
      const freq = pitchToFreq(note.pitch);
      if (freq > 0) {
        lines.push(`i ${instrNum} ${currentTime.toFixed(4)} ${duration.toFixed(4)} ${amp} ${freq.toFixed(4)}`);
      }
    }
    currentTime += duration;
  }
  return lines.join("\n");
}

export const DEFAULT_PAD_INSTRUMENT = `
instr 3
  iamp = p4
  ifreq = p5
  kenv linseg 0, p3 * 0.3, iamp, p3 * 0.4, iamp, p3 * 0.3, 0
  a1 vco2 kenv, ifreq, 10
  a2 vco2 kenv * 0.7, ifreq * 1.002, 10
  afilt moogladder a1 + a2, ifreq * 4, 0.3
  outs afilt * 0.5, afilt * 0.5
endin`.trim();

export function assembleCsd(options) {
  const h = options.header ?? { sr: 44100, ksmps: 32, nchnls: 2, zeroDbfs: 1 };
  const comment = options.comment ? `; ${options.comment}\n` : "";
  const ftableBlock = (options.ftables ?? []).join("\n");
  const csOptions = options.outputWav
    ? `-o ${options.outputWav} -W --limiter=0.95`
    : "-o dac -W --limiter=0.95";

  return `<CsoundSynthesizer>
<CsOptions>
${csOptions}
</CsOptions>
<CsInstruments>
${comment}sr = ${h.sr}
ksmps = ${h.ksmps}
nchnls = ${h.nchnls}
0dbfs = ${h.zeroDbfs ?? 1}

${options.instruments.join("\n\n")}

</CsInstruments>
<CsScore>
${ftableBlock}

${options.score}

e
</CsScore>
</CsoundSynthesizer>`;
}

export function assembleConductCsd(orcText, scoreText, outputWav = null) {
  const csOptions = outputWav
    ? `-o ${outputWav} -W -d --limiter=0.95`
    : "-o dac -W -d --limiter=0.95";
  return `<CsoundSynthesizer>
<CsOptions>
${csOptions}
</CsOptions>
<CsInstruments>
${orcText}
</CsInstruments>
<CsScore>
f 0 3600
${scoreText}
</CsScore>
</CsoundSynthesizer>`;
}

export function parseChordProgression(input, beatsPerChord = 4) {
  return input
    .split(/[\s,|]+/)
    .filter((s) => s.length > 0)
    .map((symbol) => ({ symbol, beats: beatsPerChord }));
}

export function parseMelodyString(input, beatsPerNote = 1) {
  return input
    .split(/[\s,]+/)
    .filter((s) => s.length > 0 && s !== "|")
    .map((pitch) => ({ pitch, beats: beatsPerNote }));
}

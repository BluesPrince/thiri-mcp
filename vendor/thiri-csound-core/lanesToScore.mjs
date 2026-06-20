/**
 * Convert /v2/conduct band response → Csound score lines for thiri-band.orc.
 * Extracted from build.thiri.ai/innovate/conductor (canonical).
 */

export const THIRI_BAND_PROFILE = {
  masterInstr: 99,
  masterTailSec: 2,
  melodic: {
    harmony: { instr: 1, pan: -0.15, p7: 1, p8: 0.5 },
    pattern: { instr: 1, pan: 0.25, p7: 1, p8: 0.72 },
    bass: { instr: 2, pan: 0.0, p7: 0, p8: 0.25 },
  },
  drums: {
    kick: { instr: 3, pitch: 36, minDur: 0.18, p4: 60, pan: 0 },
    snare: { instr: 4, pitch: 38, dur: 0.2, p4: 180, pan: -0.1 },
    hihatClosed: { instr: 5, pitch: 42, dur: 0.1, p4: 0, pan: 0.2 },
    hihatOpen: { instr: 5, pitch: 46, dur: 0.25, p4: 1, pan: 0.2 },
    ride: { instr: 6, pitch: 51, dur: 0.3, p4: 0, pan: 0.15 },
  },
};

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * @param {object} conductResponse — { conductor, lanes }
 * @param {object} [profile] — orchestra profile (default THIRI_BAND)
 * @returns {string} Csound score text (i-statements + e)
 */
export function lanesToScore(conductResponse, profile = THIRI_BAND_PROFILE) {
  const c = conductResponse.conductor;
  if (!c || !Array.isArray(conductResponse.lanes)) {
    throw new Error("lanesToScore: expected { conductor, lanes } from /v2/conduct");
  }
  const secPerTick = (60 / c.tempo) / c.ppq;
  const lines = [
    `i ${profile.masterInstr} 0 ${(c.durationSec + profile.masterTailSec).toFixed(3)}`,
  ];
  const MEL = profile.melodic;
  const DR = profile.drums;

  for (const lane of conductResponse.lanes) {
    for (const n of lane.notes) {
      const t = (n.startTick * secPerTick).toFixed(4);
      const dur = (n.durTicks * secPerTick).toFixed(4);
      const amp = n.velocity / 127;

      if (lane.role === "drums") {
        if (n.pitch === DR.kick.pitch) {
          lines.push(
            `i ${DR.kick.instr} ${t} ${Math.max(+dur, DR.kick.minDur).toFixed(3)} ${DR.kick.p4} ${amp.toFixed(3)} ${DR.kick.pan}`,
          );
        } else if (n.pitch === DR.snare.pitch) {
          lines.push(
            `i ${DR.snare.instr} ${t} ${DR.snare.dur} ${DR.snare.p4} ${amp.toFixed(3)} ${DR.snare.pan}`,
          );
        } else if (n.pitch === DR.hihatClosed.pitch) {
          lines.push(
            `i ${DR.hihatClosed.instr} ${t} ${DR.hihatClosed.dur} ${DR.hihatClosed.p4} ${amp.toFixed(3)} ${DR.hihatClosed.pan}`,
          );
        } else if (n.pitch === DR.hihatOpen.pitch) {
          lines.push(
            `i ${DR.hihatOpen.instr} ${t} ${DR.hihatOpen.dur} ${DR.hihatOpen.p4} ${amp.toFixed(3)} ${DR.hihatOpen.pan}`,
          );
        } else if (n.pitch === DR.ride.pitch) {
          lines.push(
            `i ${DR.ride.instr} ${t} ${DR.ride.dur} ${DR.ride.p4} ${amp.toFixed(3)} ${DR.ride.pan}`,
          );
        }
      } else {
        const m = MEL[lane.role];
        if (!m) continue;
        const hz = midiToHz(n.pitch).toFixed(3);
        lines.push(`i ${m.instr} ${t} ${dur} ${hz} ${(amp * 0.6).toFixed(3)} ${m.pan} ${m.p7} ${m.p8}`);
      }
    }
  }
  lines.push("e");
  return lines.join("\n");
}

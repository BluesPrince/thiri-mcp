#!/usr/bin/env node
// Comp a progression with smooth voice leading — THIRI scores each transition.
// Usage: THIRI_API_KEY=sk_live_… node voice-leading-comp.mjs "Cmaj7 A7 Dm7 G7"
const KEY = process.env.THIRI_API_KEY;
if (!KEY) { console.error("Set THIRI_API_KEY (get one at build.thiri.ai/developers)"); process.exit(1); }

const progression = (process.argv[2] || "Cmaj7 A7 Dm7 G7").split(/\s+/);

let previousNotes = null;
console.log("");
for (const chord of progression) {
  const res = await fetch("https://chords.thiri.ai/v2/voicing", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ chord, style: "rootless", previousNotes }),
  });
  if (!res.ok) { console.error(`API ${res.status}:`, await res.text()); process.exit(1); }
  const v = await res.json();
  const score = v.voiceLeadingScore != null ? `   voice-leading: ${v.voiceLeadingScore}` : "";
  console.log(`${chord.padEnd(8)} ${v.notes.join(" ").padEnd(20)}${score}`);
  previousNotes = v.notes; // chain into the next chord
}
console.log("\n(closer to 1.0 = smoother motion into the chord)");

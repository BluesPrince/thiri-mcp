#!/usr/bin/env node
// Reharmonize a progression — prints every technique THIRI can apply.
// Usage: THIRI_API_KEY=sk_live_… node reharmonize-a-tune.mjs "Dm7 G7 Cmaj7" C
const KEY = process.env.THIRI_API_KEY;
if (!KEY) { console.error("Set THIRI_API_KEY (get one at build.thiri.ai/developers)"); process.exit(1); }

const progression = (process.argv[2] || "Dm7 G7 Cmaj7").split(/\s+/);
const key = process.argv[3]; // optional — enables modal_interchange + backdoor

const res = await fetch("https://chords.thiri.ai/v2/reharmonize", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ progression, technique: "auto", key }),
});
if (!res.ok) { console.error(`API ${res.status}:`, await res.text()); process.exit(1); }

const data = await res.json();
console.log(`\nOriginal:  ${data.original.join("  ")}\n`);
for (const alt of data.alternatives ?? []) {
  console.log(`• ${alt.technique}`);
  console.log(`    ${alt.progression.join("  ")}`);
  console.log(`    ${alt.explanation}\n`);
}
console.log(`(${(data.alternatives ?? []).length} techniques applied)`);

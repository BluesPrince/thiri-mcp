#!/usr/bin/env node
// Run the conformance cases against THIRI (or any compatible API via THIRI_API_URL).
// Usage: THIRI_API_KEY=sk_live_… node conformance/run.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.THIRI_API_KEY;
if (!KEY) { console.error("Set THIRI_API_KEY (get one at build.thiri.ai/developers)"); process.exit(1); }
const BASE = process.env.THIRI_API_URL || "https://chords.thiri.ai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"));
const ENDPOINT = { resolve: "/v2/resolve", analyze: "/v2/analyze", voicing: "/v2/voicing", reharmonize: "/v2/reharmonize" };

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0, fail = 0;

for (const c of cases) {
  const res = await fetch(BASE + ENDPOINT[c.tool], {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(c.input),
  });
  const d = await res.json().catch(() => ({}));
  const e = c.expect;
  const reasons = [];

  if (e.error) {
    if (res.ok) reasons.push(`expected error, got ${res.status}`);
  } else {
    if (!res.ok) reasons.push(`HTTP ${res.status}`);
    const altProg = d.alternatives?.[0]?.progression || d.progression || [];
    for (const [k, v] of Object.entries(e)) {
      if (k === "notes" && !eq(d.notes, v)) reasons.push(`notes ${JSON.stringify(d.notes)} != ${JSON.stringify(v)}`);
      else if (k === "notesInclude" && !(d.notes || []).includes(Array.isArray(v) ? v[0] : v)) reasons.push(`notes missing ${v}`);
      else if (k === "progression" && !eq(altProg, v)) reasons.push(`progression ${JSON.stringify(altProg)} != ${JSON.stringify(v)}`);
      else if (k === "progressionIncludes" && !altProg.includes(v)) reasons.push(`progression missing ${v}`);
      else if (!["notes", "notesInclude", "progression", "progressionIncludes"].includes(k) && d[k] !== v) reasons.push(`${k}=${JSON.stringify(d[k])} != ${JSON.stringify(v)}`);
    }
  }

  const okCase = reasons.length === 0;
  okCase ? pass++ : fail++;
  console.log(`${okCase ? "✅" : "❌"} ${c.tool.padEnd(11)} ${JSON.stringify(c.input)}${reasons.length ? "  — " + reasons.join("; ") : ""}`);
}
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);

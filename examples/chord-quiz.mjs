#!/usr/bin/env node
// A 10-second ear/theory quiz — THIRI is the (provably correct) answer key.
// Usage: THIRI_API_KEY=sk_live_… node chord-quiz.mjs
import { createInterface } from "node:readline/promises";
const KEY = process.env.THIRI_API_KEY;
if (!KEY) { console.error("Set THIRI_API_KEY (get one at build.thiri.ai/developers)"); process.exit(1); }

const POOL = ["Cmaj7", "Dm7", "G7", "Am7", "Fmaj7", "Bm7b5", "E7", "A7", "Cdim7", "Caug", "C7sus4"];
const pick = POOL[Math.floor(Math.random() * POOL.length)];

const rl = createInterface({ input: process.stdin, output: process.stdout });
const guess = await rl.question(`\nSpell the notes in  ${pick}  (comma- or space-separated): `);
rl.close();

const res = await fetch("https://chords.thiri.ai/v2/resolve", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ chord: pick }),
});
if (!res.ok) { console.error(`API ${res.status}:`, await res.text()); process.exit(1); }
const { notes } = await res.json();

const norm = (s) => s.split(/[,\s]+/).filter(Boolean).map((n) => n.toUpperCase()).join(" ");
console.log(norm(guess) === notes.join(" ").toUpperCase()
  ? "✅ Correct!"
  : `❌ Not quite — ${pick} = ${notes.join(" ")}`);

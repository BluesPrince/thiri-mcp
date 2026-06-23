// THIRI Csound capability tools — the agent's eyes on Csound.
// VENDORED into the thiri-conductor MCP. Canonical source:
//   THIRI/production/thiri-studio-local/tools/csound-tools.mjs
// Only change from canonical: MANIFEST resolves to the canonical studio manifest
// (single source of truth — no manifest copy, to avoid drift). If the studio repo
// moves, update CANONICAL_MANIFEST below.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// thiri-mcp/vendor/csound-capability → ../../../ = mcp-servers/ → THIRI/production/...
const CANONICAL_MANIFEST = join(HERE, "../../../THIRI/production/thiri-studio-local/renders/capability-manifest.json");
const MANIFEST = JSON.parse(readFileSync(CANONICAL_MANIFEST, "utf8"));

const OPCODES = new Map(MANIFEST.engine.opcodes.map((o) => [o.name, o.signatures]));
const API = new Set(MANIFEST.api.methods.map((m) => m.name));

// Structural keywords that sit in opcode-position but aren't opcodes to validate.
const STRUCT = new Set([
  "instr","endin","opcode","endop","if","elseif","else","endif","fi",
  "while","until","do","od","then","return","rireturn",
]);

/**
 * validate_csound — does every opcode used actually exist in the engine?
 * v1 = name existence (catches typos, invented opcodes, wrong case — the common
 * hallucinations). Arg-rate signature matching is v2 (needs variable-rate inference).
 */
export function validateCsound(code) {
  // scope to the orchestra (don't validate <CsScore> i/f/e statements)
  const m = code.match(/<CsInstruments>([\s\S]*?)<\/CsInstruments>/i);
  const orc = m ? m[1] : code;
  // in-file UDOs are valid opcodes for this code
  const udos = new Set([...orc.matchAll(/^\s*opcode\s+([A-Za-z]\w*)/gm)].map((x) => x[1]));
  const known = (n) => OPCODES.has(n) || udos.has(n);
  const VAR = /^(g?[akiSf]\w*|p\d+)$/; // likely a variable / p-field (NOT w — too many opcodes start with w)

  const errors = [], used = new Set();
  orc.split("\n").forEach((raw, idx) => {
    let line = raw.replace(/;.*/, "").replace(/\/\/.*/, "").trim();
    if (!line) return;
    line = line.replace(/^[A-Za-z_]\w*:\s*/, ""); // strip label
    const first = (line.match(/^([A-Za-z_]\w*)/) || [])[1];
    if (first && STRUCT.has(first)) return;

    // function-style opcode calls: name(...)
    for (const fm of line.matchAll(/\b([a-zA-Z]\w*)\s*\(/g)) {
      const nm = fm[1];
      if (STRUCT.has(nm)) continue;
      if (known(nm)) used.add(nm);
      else errors.push({ line: idx + 1, opcode: nm, text: raw.trim(), hint: hintFor(nm) });
    }
    // assignment → the opcode (if any) was the function call above; LHS isn't an opcode
    if (/^[\w\s,.\[\]$]+?[^=<>!]=(?!=)/.test(line)) return;

    // statement form: [out, out, ...] OPCODE in, in, ...
    // the opcode is the first head token that is a known opcode
    const head = [];
    for (const tk of line.split(/[\s,()]+/)) {
      if (!tk) continue;
      if (/^["'\-0-9.]/.test(tk)) break;        // reached an arg literal
      head.push(tk);
    }
    const opc = head.find(known);
    if (opc) { used.add(opc); return; }
    if (!head.length) return;
    // no known opcode on a statement line → hallucination.
    // the opcode sits in opcode-position = the first head token that isn't a variable.
    const suspect = head.find((tk) => !VAR.test(tk)) || head[head.length - 1];
    const dym = closest(suspect);
    errors.push({ line: idx + 1, opcode: suspect, text: raw.trim(),
      hint: dym ? `unknown opcode — did you mean "${dym}"?` : "no known opcode found on this line" });
  });

  const seen = new Set();
  const uniq = errors.filter((e) => { const k = e.line + "|" + e.opcode; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ok: uniq.length === 0, opcodesUsed: [...used].filter(known).sort(), errors: uniq };
}
function hintFor(n) { const c = closest(n); return c ? `unknown opcode — did you mean "${c}"?` : "unknown opcode"; }

/** find_opcode — name/substring search over the manifest (semantic comes with RAG). */
export function findOpcode(query, limit = 12) {
  const q = String(query || "").toLowerCase();
  const hits = MANIFEST.engine.opcodes
    .filter((o) => o.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((o) => ({ name: o.name, signatures: o.signatures }));
  return { query, count: hits.length, opcodes: hits };
}

// tiny Levenshtein for "did you mean" on a typo
function closest(name) {
  let best = null, bd = 3;
  for (const o of OPCODES.keys()) {
    if (Math.abs(o.length - name.length) > 2) continue;
    const d = lev(name.toLowerCase(), o.toLowerCase());
    if (d < bd) { bd = d; best = o; }
  }
  return bd <= 2 ? best : null;
}
function lev(a, b) {
  const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[m][n];
}

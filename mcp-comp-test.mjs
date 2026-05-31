// Drives the composition MCP server over stdio (JSON-RPC) and runs the full
// agent loop as assertions. Pure node:  node mcp-comp-test.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const server = spawn("node", [join(__dirname, "composition-server.mjs")], { stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const pending = new Map();
server.stdout.on("data", (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
server.stderr.on("data", () => {});

let idc = 0;
function rpc(method, params) {
  const id = ++idc;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 8000);
  });
}
const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? "{}";
  return { raw: r, data: JSON.parse(text), isError: !!r.result?.isError };
};

let pass = 0, fail = 0; const fails = [];
const ok = (label, cond, detail = "") => { cond ? pass++ : (fail++, fails.push(`${label} — ${detail}`)); console.log(`  ${cond ? "✅" : "❌"} ${String(label).padEnd(36)} ${detail}`); };

try {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  console.log("\n── tools/list ──");
  const tools = await rpc("tools/list", {});
  const names = (tools.result?.tools || []).map((t) => t.name).sort();
  ok("composition tools registered", names.length >= 9, names.join(", "));
  for (const want of ["create_composition", "compose_progression", "revoice_progression", "reharmonize_section", "set_chord", "render_composition", "export_midi", "play_composition", "inspect_composition"])
    ok(`  has ${want}`, names.includes(want), "");

  console.log("\n── the agent loop ──");
  const comp = await call("compose_progression", { key: "F minor", feel: "moody gospel-jazz", complexity: "rich" });
  ok("compose returns lead sheet", typeof comp.data.leadSheet === "string" && comp.data.leadSheet.includes("|"), comp.data.leadSheet);
  ok("compose picked gospel template", comp.data.template === "gospel_jazz_minor", comp.data.template);
  const id = comp.data.id;
  ok("composition has an id", !!id, id);

  const rev = await call("revoice_progression", { id, style: "rootless" });
  ok("revoice returns voiced bars", Array.isArray(rev.data.bars) && rev.data.bars[0][0].notes?.length > 0, JSON.stringify(rev.data.bars?.[0]?.[0]));

  const sc = await call("set_chord", { id, bar: 2, symbol: "C7b9" });
  ok("set_chord bar 2 -> C7b9", sc.data.to === "C7b9", `${sc.data.from} -> ${sc.data.to}`);
  const scBad = await call("set_chord", { id, bar: 2, symbol: "Zx9" });
  ok("set_chord rejects bad chord", scBad.isError === true, "errored as expected");

  const reh = await call("reharmonize_section", { id, technique: "tritone_sub" });
  ok("reharmonize returns alternatives", (reh.data.alternatives || []).some((a) => a.technique === "tritone_sub"), `${reh.data.alternatives?.length} alts`);

  const rnd = await call("render_composition", { id });
  ok("render returns events + duration", rnd.data.notes > 0 && rnd.data.durationSec > 0, `${rnd.data.notes} notes, ${rnd.data.durationSec}s`);

  const exp = await call("export_midi", { id, path: "/tmp/thiri-mcp-test.mid" });
  ok("export writes a .mid", exp.data.bytes > 0 && exp.data.path === "/tmp/thiri-mcp-test.mid", `${exp.data.bytes} bytes`);

  const play = await call("play_composition", { id, play: false });
  ok("play renders (no sound)", play.data.midi?.bytes > 0, `audio ok=${play.data.audio?.ok}`);

  const insp = await call("inspect_composition", { id });
  ok("inspect returns ops history", Array.isArray(insp.data.operations) && insp.data.operations.length >= 5, `${insp.data.operations.length} ops`);

  const list = await call("list_compositions", {});
  ok("list shows the composition", list.data.count >= 1 && list.data.compositions.some((c) => c.id === id), `${list.data.count} comps`);

  const rev2 = await call("revoice_progression", { style: "pad" });
  ok("id-less op uses last composition", !rev2.isError && Array.isArray(rev2.data.bars), "ok");
} catch (e) {
  fail++; fails.push("HARNESS: " + e.message);
} finally {
  server.kill();
}

console.log(`\n${"═".repeat(46)}\n  ${pass} passed · ${fail} failed`);
if (fail) { console.log("\nFAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("  ALL GREEN ✅\n");

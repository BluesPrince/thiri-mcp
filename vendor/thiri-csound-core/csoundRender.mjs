import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleConductCsd } from "./scoreBuilder.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ORC = join(__dirname, "orchestras", "thiri-band.orc");

function which(bin) {
  try {
    return execFileSync("/usr/bin/which", [bin], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

export function csoundEnv() {
  const csound =
    which("csound") ||
    (existsSync("/opt/homebrew/bin/csound") ? "/opt/homebrew/bin/csound" : null);
  const afplay = which("afplay") || (existsSync("/usr/bin/afplay") ? "/usr/bin/afplay" : null);
  return {
    csound,
    afplay,
    canRender: !!csound,
    canPlay: !!afplay,
  };
}

export function loadOrchestra(path = DEFAULT_ORC) {
  return readFileSync(path, "utf8");
}

export function writeConductCsd(scoreText, options = {}) {
  const orcPath = options.orcPath ?? DEFAULT_ORC;
  const orcText = options.orcText ?? loadOrchestra(orcPath);
  const csdPath = options.csdPath ?? `/tmp/thiri-conduct-${Date.now()}.csd`;
  const wavPath = options.wavPath ?? csdPath.replace(/\.csd$/i, ".wav");
  const csd = assembleConductCsd(orcText, scoreText, options.renderWav ? wavPath : null);
  writeFileSync(csdPath, csd, "utf8");
  return { csdPath, wavPath, orcPath };
}

export function renderCsoundWav(scoreText, options = {}) {
  const env = csoundEnv();
  if (!env.csound) {
    return { ok: false, reason: "csound CLI not found (install via Homebrew: brew install csound)" };
  }
  const { csdPath, wavPath } = writeConductCsd(scoreText, { ...options, renderWav: true });
  try {
    const r = spawnSync(env.csound, ["-d", "-m0", csdPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
    if (r.status !== 0 || !existsSync(wavPath)) {
      return {
        ok: false,
        reason: `csound exit ${r.status}: ${(r.stderr || "").slice(0, 300)}`,
        csdPath,
      };
    }
    return { ok: true, wavPath, csdPath };
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e), csdPath };
  }
}

export function playWav(wavPath) {
  const env = csoundEnv();
  if (!env.afplay) return { ok: false, reason: "afplay not found" };
  if (!existsSync(wavPath)) return { ok: false, reason: "wav file missing" };
  spawnSync(env.afplay, [wavPath], { stdio: "inherit" });
  return { ok: true, wavPath };
}

export function cleanupTemp(...paths) {
  for (const p of paths) {
    try {
      if (p && existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

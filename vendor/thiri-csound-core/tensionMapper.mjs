/**
 * Map THIRI analyze tension (0–1) to Csound score modifiers for thiri-band.orc melodic lines.
 */
export function tensionToScoreModifiers(tension) {
  const t = Math.max(0, Math.min(1, Number(tension) || 0));
  return {
    ampScale: 0.5 + t * 0.25,
    brightness: 0.4 + t * 0.55,
    panSpread: t * 0.15,
  };
}

/** Apply tension modifiers to a conduct score string (adjusts p8 brightness on melodic lanes). */
export function applyTensionToScore(scoreText, tension) {
  const { brightness } = tensionToScoreModifiers(tension);
  return scoreText
    .split("\n")
    .map((line) => {
      if (!line.startsWith("i 1 ") && !line.startsWith("i 2 ")) return line;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) parts[8] = brightness.toFixed(3);
      return parts.join(" ");
    })
    .join("\n");
}

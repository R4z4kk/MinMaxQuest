function grayLevel(playerLevel: number): number {
  if (playerLevel <= 5) return 0;
  if (playerLevel <= 39) return playerLevel - 5 - Math.floor(playerLevel / 10);
  return playerLevel - 1 - Math.floor(playerLevel / 5);
}

const ZERO_DIFFERENCE: [number, number][] = [
  [8, 5], [10, 6], [12, 7], [16, 8], [20, 9], [30, 11], [40, 12], [45, 13], [50, 14], [55, 15], [60, 16],
];

function zeroDifference(playerLevel: number): number {
  for (const [below, zd] of ZERO_DIFFERENCE) if (playerLevel < below) return zd;
  return 17;
}

function levelFactor(playerLevel: number, mobLevel: number): number {
  if (mobLevel >= playerLevel) return Math.fround(1 + 0.05 * Math.min(mobLevel - playerLevel, 4));
  if (mobLevel <= grayLevel(playerLevel)) return 0;
  const zd = zeroDifference(playerLevel);
  return Math.fround((zd + mobLevel - playerLevel) / zd);
}

function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function assertLevel(name: string, level: number): void {
  if (!Number.isInteger(level) || level < 1) throw new Error(`${name} must be a positive integer, got ${level}`);
}

// Source: https://raw.githubusercontent.com/vmangos/core/development/src/game/Formulas.h (verified 2026-11-27)
// GetGrayLevel, GetZeroDifference, BaseGain (level*5+45) * factor, elite x2 outside instances, std::nearbyint (half-even).
export function mobXp(playerLevel: number, mobLevel: number, elite: boolean): number {
  assertLevel("playerLevel", playerLevel);
  assertLevel("mobLevel", mobLevel);
  const base = Math.fround((playerLevel * 5 + 45) * levelFactor(playerLevel, mobLevel));
  return roundHalfEven(elite ? base * 2 : base);
}

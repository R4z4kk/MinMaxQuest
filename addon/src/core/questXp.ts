// Mirrors Questie getAdjustedXP (Questie/Database/QuestXP/QuestieXP.lua:59-97), Forever branch, buff multiplier 1.
const MIN_MULTIPLIER = 5;
const MAX_MULTIPLIER = 10;

export function questXp(baseXp: number, questLevel: number, charLevel: number, maxLevel: number): number {
  if (charLevel === maxLevel) return 0;

  const multiplier = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, 2 * (questLevel - charLevel) + 20));
  const xp = (baseXp * multiplier) / 10;

  if (xp <= 100) return 5 * Math.floor((xp + 2) / 5);
  if (xp <= 500) return 10 * Math.floor((xp + 5) / 10);
  if (xp <= 1000) return 25 * Math.floor((xp + 12) / 25);
  return 50 * Math.floor((xp + 25) / 50);
}

import type { QuestInfo } from "../data/questRepository";

export interface PlayerQuestState {
  level: number;
  raceMask: number;
  classMask: number;
  completed: Set<number>;
  inLog: Set<number>;
}

// Lua 5.1 has no bitwise operators.
function masksIntersect(a: number, b: number): boolean {
  for (let bit = 1; bit <= a && bit <= b; bit *= 2) {
    if (Math.floor(a / bit) % 2 === 1 && Math.floor(b / bit) % 2 === 1) return true;
  }
  return false;
}

export function maskAllows(required: number, player: number): boolean {
  return required === 0 || masksIntersect(required, player);
}

export function isAvailable(q: QuestInfo, p: PlayerQuestState): boolean {
  if (q.hasUnsupportedRequirement || q.repeatable || q.seasonal) return false;
  if (p.level < q.requiredLevel) return false;
  if (q.requiredMaxLevel != null && p.level > q.requiredMaxLevel) return false;
  if (!maskAllows(q.races, p.raceMask) || !maskAllows(q.classes, p.classMask)) return false;
  if (p.completed.has(q.id) || p.inLog.has(q.id)) return false;
  if (!q.preGroup.every((id) => p.completed.has(id))) return false;
  if (q.preSingle.length > 0 && !q.preSingle.some((id) => p.completed.has(id))) return false;
  return !q.exclusiveTo.some((id) => p.completed.has(id) || p.inLog.has(id));
}

export function isTrivial(q: QuestInfo, p: PlayerQuestState, greenRange: number): boolean {
  return q.level + greenRange < p.level;
}

export function passesMaxLevelOption(q: QuestInfo, p: PlayerQuestState, minLevelGap: number | null): boolean {
  return minLevelGap == null || q.level <= p.level - minLevelGap;
}

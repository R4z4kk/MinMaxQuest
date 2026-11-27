import { XP_PER_LEVEL } from "../core/constants";
import { questXp } from "../core/questXp";
import type { QuestInfo } from "../data/questRepository";

type Getter = (id: number) => QuestInfo | null;

function successors(quest: QuestInfo): number[] {
  return quest.nextInChain != null ? [quest.nextInChain, ...quest.children] : quest.children;
}

function descendants(questId: number, get: Getter): Record<number, true> {
  const seen: Record<number, true> = { [questId]: true };
  const queue = [questId];
  for (let i = 0; i < queue.length; i++) {
    const quest = get(queue[i]);
    if (quest == null) continue;
    for (const id of successors(quest)) {
      if (seen[id] != null) continue;
      seen[id] = true;
      queue.push(id);
    }
  }
  return seen;
}

export function followUps(questId: number, get: Getter): QuestInfo[] {
  const reachable = descendants(questId, get);
  const seen: Record<number, true> = { [questId]: true };
  const queue = [questId];
  const result: QuestInfo[] = [];
  for (let i = 0; i < queue.length; i++) {
    const parent = get(queue[i]);
    if (parent == null) continue;
    for (const id of successors(parent)) {
      if (seen[id] != null) continue;
      seen[id] = true;
      const quest = get(id);
      if (quest == null || quest.preSingle.some((pre) => reachable[pre] == null)) continue;
      result.push(quest);
      queue.push(id);
    }
  }
  return result;
}

export function lostXp(chain: QuestInfo[], charLevel: number, maxLevel: number): { xp: number; levelFraction: number } {
  let xp = 0;
  for (const quest of chain) xp += questXp(quest.baseXp, quest.level, charLevel, maxLevel);
  const needed = charLevel >= maxLevel ? null : XP_PER_LEVEL.values[charLevel - 1];
  return { xp, levelFraction: needed != null && needed > 0 ? xp / needed : 0 };
}

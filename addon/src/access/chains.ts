import { ACCESS, type AccessEntry, type AccessStep } from "../data/generated/access";
import type { CharDb } from "../core/storage";
import type { QuestInfo } from "../data/questRepository";
import { maskAllows } from "../quests/availability";

export function findEntry(id: string): AccessEntry | null {
  return ACCESS.entries.find((entry) => entry.id === id) ?? null;
}

export function forFaction(entry: AccessEntry, faction: "A" | "H"): boolean {
  return entry.faction === "AH" || entry.faction === faction;
}

export function entriesFor(faction: "A" | "H"): AccessEntry[] {
  return ACCESS.entries.filter((entry) => forFaction(entry, faction));
}

export function visibleSteps(entry: AccessEntry, raceMask: number): AccessStep[] {
  return entry.steps.filter((step) => step.excludedRaces == null || step.excludedRaces <= 0 || !maskAllows(step.excludedRaces, raceMask));
}

export function entryQuests(entry: AccessEntry, raceMask: number): number[] {
  const ids: number[] = [];
  for (const step of visibleSteps(entry, raceMask)) {
    if ((step.kind === "pickUp" || step.kind === "turnIn" || step.kind === "quest") && !ids.includes(step.ref)) ids.push(step.ref);
  }
  return ids;
}

export function walkChain(startIds: number[], get: (id: number) => QuestInfo | null): number[] {
  const steps: number[] = [];
  const seen = new Set<number>();
  for (const startId of startIds) {
    let current: number | null = startId;
    while (current != null && !seen.has(current)) {
      const quest = get(current);
      if (quest == null) break;
      seen.add(current);
      steps.push(current);
      current = quest.nextInChain;
    }
  }
  return steps;
}

// Entry ids of the former hard-coded Dalaran Sewers chain, by faction.
const LEGACY_CHAINS: Record<string, { A: string; H: string }> = { "dalaran-sewers": { A: "154", H: "155" } };

// Drops tracked and expanded ids that are not access entries; an unknown faction cannot migrate legacy ids.
export function pruneAccessState(db: Pick<CharDb, "trackedChains" | "expandedChain">, faction: "A" | "H" | null): void {
  const kept: string[] = [];
  for (const raw of db.trackedChains) {
    const legacy = LEGACY_CHAINS[raw];
    const id = legacy == null || faction == null ? raw : legacy[faction];
    if (findEntry(id) != null && !kept.includes(id)) kept.push(id);
  }
  db.trackedChains = kept;
  if (db.expandedChain != null && findEntry(db.expandedChain) == null) db.expandedChain = null;
}

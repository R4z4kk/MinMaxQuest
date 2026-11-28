import type { AccessEntry } from "./types";

// Attune's Dungeons group lists the quests of each open dungeon. Only Upper Blackrock Spire (365 A, 366 H)
// hides a real unlock there, the Seal of Ascension, so it moves to the keys.
const DUNGEON_KEYS = new Set(["365", "366"]);

export function keepUnlocks(entries: AccessEntry[]): { entries: AccessEntry[]; dropped: AccessEntry[] } {
  const kept: AccessEntry[] = [];
  const dropped: AccessEntry[] = [];
  for (const entry of entries) {
    if (entry.group !== "dungeon") kept.push(entry);
    else if (DUNGEON_KEYS.has(entry.id)) kept.push({ ...entry, group: "key" });
    else dropped.push(entry);
  }
  return { entries: kept, dropped };
}

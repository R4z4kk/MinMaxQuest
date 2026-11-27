export type AccessGroup = "dungeon" | "raid" | "key" | "misc";
export type AccessStepKind = "pickUp" | "turnIn" | "quest" | "item" | "kill" | "level" | "interact" | "click" | "rep" | "prof" | "end";
// ref: quest, item or npc id; the level for "level"; the faction id for "rep"; 0 for "end".
// excludedRaces: race mask that does not see the step. optional: not counted in progress (Attune "inside" and follow-up steps).
// followsAny: any one of follows is enough.
export interface AccessStep {
  id: number;
  kind: AccessStepKind;
  ref: number;
  follows: number[];
  origin: "attune" | "questiedb";
  excludedRaces?: number;
  optional?: boolean;
  followsAny?: boolean;
}
export interface AccessEntry {
  id: string;
  group: AccessGroup;
  faction: "A" | "H" | "AH";
  levels: [number, number] | null;
  name: { enUS: string; frFR: string };
  steps: AccessStep[];
}
export interface AccessData {
  source: { name: "Attune"; version: string; questieDb: string; verifiedOn: string; expiresOn: string };
  entries: AccessEntry[];
}

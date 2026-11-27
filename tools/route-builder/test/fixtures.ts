import type { QuestieSnapshot } from "../ingest/snapshot";

export function snapshot(overrides: Partial<QuestieSnapshot> = {}): QuestieSnapshot {
  return {
    tag: "test",
    contract: 4,
    quests: {},
    npcs: {},
    objects: {},
    items: {},
    questXp: {},
    areaIdToUiMapId: {},
    objectiveFirst: {},
    dropRates: {},
    dungeons: {},
    npcFlagValues: { innkeeper: 0, flightMaster: 0 },
    raceMaskById: {},
    ...overrides,
  };
}

import type { TravelData } from "../../../addon/src/data/generated/travel";
import type { QuestieSnapshot } from "../ingest/snapshot";
import type { UiMapRect } from "../ingest/zones";
import type { World } from "../model/world";

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

// Rects copied from vendor/shortest-path-forever/Zones.lua.
export const ELWYNN: UiMapRect = { uiMapId: 1429, continent: 0, minX: -10254, minY: -1935, maxX: -7940, maxY: 1535, low: 1, high: 10 };
export const WESTFALL: UiMapRect = { uiMapId: 1436, continent: 0, minX: -11733, minY: -483, maxX: -9400, maxY: 3017, low: 10, high: 20 };

export function zones(): Map<number, UiMapRect> {
  return new Map([
    [ELWYNN.uiMapId, ELWYNN],
    [WESTFALL.uiMapId, WESTFALL],
  ]);
}

export function travel(overrides: Partial<TravelData> = {}): TravelData {
  return {
    source: { name: "Shortest Path Forever", version: "test", build: "test", verifiedOn: "2026-11-27", expiresOn: "2026-12-27" },
    taxiNodes: [],
    taxiEdges: [],
    transports: [],
    ...overrides,
  };
}

export function world(overrides: Partial<World> = {}): World {
  return {
    faction: "A",
    raceMask: 0,
    quests: new Map(),
    inns: [],
    dungeons: [],
    startZones: [],
    taxiZone: new Map(),
    capitalTaxiNode: 2,
    conversionOffsetYards: 0,
    excluded: new Map(),
    ...overrides,
  };
}

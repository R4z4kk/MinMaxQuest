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

export const DUN_MOROGH: UiMapRect = { uiMapId: 1426, continent: 0, minX: -7160, minY: -3123, maxX: -3877, maxY: 1802, low: 1, high: 10 };
export const TELDRASSIL: UiMapRect = { uiMapId: 1438, continent: 1, minX: 8438, minY: -1277, maxX: 11831, maxY: 3815, low: 1, high: 10 };
// From vendor/wago/UiMapAssignment-1.60.1.71139.csv.
export const ZEPHRAS_ISLE: UiMapRect = { uiMapId: 2521, continent: 2991, minX: 1247.917, minY: -1331.25, maxX: 4956.25, maxY: 4231.25, low: null, high: null };

export function zones(): Map<number, UiMapRect> {
  return new Map([ELWYNN, WESTFALL, DUN_MOROGH, TELDRASSIL, ZEPHRAS_ISLE].map((rect) => [rect.uiMapId, rect]));
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

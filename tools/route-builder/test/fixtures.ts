import type { TravelData } from "../../../addon/src/data/generated/travel";
import type { QuestInfo } from "../../../addon/src/data/questRepository";
import type { QuestieSnapshot } from "../ingest/snapshot";
import type { UiMapRect } from "../ingest/zones";
import type { Place, RouteQuest, Task, World } from "../model/world";

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
    source: { name: "Shortest Path Forever", version: "test", build: "test", cmangosCommit: "test", wagoBuild: "test", commit: "test", verifiedOn: "2026-11-27", expiresOn: "2026-12-27" },
    taxiNodes: [],
    taxiEdges: [],
    transports: [],
    portals: [],
    walkPlaces: [],
    walks: [],
    ...overrides,
  };
}

export function world(overrides: Partial<World> = {}): World {
  return {
    faction: "A",
    raceMask: 0,
    raceMasks: [],
    quests: new Map(),
    inns: [],
    dungeons: [],
    startZones: [],
    taxiZone: new Map(),
    taxiPlaces: new Map(),
    unlearnableTaxiNodes: [],
    areaUiMap: new Map(),
    capitalTaxiNode: 2,
    conversionOffsetYards: 0,
    excluded: new Map(),
    countStats: { fromText: 0, fromTextSingular: 0, fromCmangos: 0, bothSources: 0, disagreements: 0, noCount: 0, assumedDropRate: 0 },
    ...overrides,
  };
}

export function place(x: number, y = 0, uiMapId = 1429): Place {
  return { pos: { continent: 0, x, y }, uiMapId, x: 0, y: 0, npcId: null, objectId: null };
}

export function info(id: number, overrides: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id,
    name: `Quest ${id}`,
    level: 1,
    requiredLevel: 1,
    requiredMaxLevel: null,
    races: 0,
    classes: 0,
    preGroup: [],
    preSingle: [],
    exclusiveTo: [],
    nextInChain: null,
    children: [],
    starterNpcs: [1],
    starterObjects: [],
    finisherNpcs: [1],
    finisherObjects: [],
    objectives: [],
    baseXp: 100,
    hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false,
    isElite: false,
    zoneAreaId: null,
    sourceItemId: null,
    requiredSourceItems: [],
    ...overrides,
  };
}

export function quest(id: number, at: Place, overrides: Partial<QuestInfo> = {}, tasks: Task[] = []): RouteQuest {
  const objectives = tasks.map((t) => ({ index: t.objectiveIndex, kind: "npc" as const, id: 1, required: t.count }));
  return {
    id,
    info: info(id, { objectives, ...overrides }),
    accept: at,
    turnin: at,
    tasks,
    dungeonAreaId: null,
    accessChain: false,
    returnVisit: false,
  };
}

export function kill(at: Place, mobLevel = 1): Task {
  return { kind: "kill", objectiveIndex: 0, count: 1, cluster: { center: at, loop: [at] }, mobLevel, elite: false, dropChance: 1, assumedDropChance: false };
}

export function worldOf(quests: RouteQuest[], overrides: Partial<World> = {}): World {
  return world({ quests: new Map(quests.map((q) => [q.id, q])), ...overrides });
}

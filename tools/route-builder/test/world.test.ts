import { describe, expect, it } from "vitest";
import type { TravelData } from "../../../addon/src/data/generated/travel";
import type { QuestieSnapshot } from "../ingest/snapshot";
import type { CmangosCounts } from "../ingest/cmangos";
import { parseInstanceTypes } from "../ingest/instances";
import { zonePercentToWorld } from "../ingest/zones";
import { buildWorld } from "../model/world";
import { ELWYNN, snapshot, travel, zones } from "./fixtures";

const RACES = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64, 8: 128, 95: 4294967296, 96: 8589934592 };
const NODE_PERCENT = { x: 30, y: 30 };
const YARDS_PER_Y_PERCENT = (ELWYNN.maxX - ELWYNN.minX) / 100;

const AREA_CSV = [
  "ID,AreaName_lang,ContinentID",
  "209,\"Shadowfang Keep\",33",
  "2717,\"Molten Core\",409",
  "3277,\"Warsong Gulch\",489",
  "1583,\"Blackrock Spire\",0",
].join("\n");
const MAP_CSV = [
  "ID,MapName_lang,InstanceType,AreaTableID",
  "0,\"Eastern Kingdoms\",0,0",
  "33,\"Shadowfang, Keep\",1,0",
  "409,Molten Core,2,2717",
  "489,Warsong Gulch,3,3277",
  "229,Blackrock Spire,1,1583",
].join("\n");
const INSTANCES = parseInstanceTypes(AREA_CSV, "AreaTable.csv", MAP_CSV, "Map.csv");

type Npc = QuestieSnapshot["npcs"][number];

function npc(spawns: Record<number, number[][]>, extra: Partial<Npc> = {}): Npc {
  return { name: null, spawns, rank: 0, friendlyToFaction: "A", minLevel: 5, maxLevel: 5, npcFlags: 2, ...extra };
}

function fakeCounts(rows: [number, "npcOrObject" | "item", number, number][]): CmangosCounts {
  const map = new Map(rows.map(([questId, kind, id, count]) => [`${questId}:${kind}:${id}`, count]));
  return { get: (questId, kind, id) => map.get(`${questId}:${kind}:${id}`) ?? null };
}

const COUNTS = fakeCounts([
  [8, "item", 501, 6],
  [9, "npcOrObject", -600, 2],
  [9, "item", 502, 3],
  [21, "npcOrObject", 203, 5],
]);

function quest(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, questLevel: 5, requiredLevel: 5, requiredRaces: 0, requiredClasses: 0,
    startedBy: [[100]], finishedBy: [[100]], objectives: [], zoneOrSort: 12, ...extra,
  };
}

function fixture(flightMasterYards = 3): QuestieSnapshot {
  const quests: Record<number, Record<string, unknown>> = {
    1: quest("Wolves", { requiredLevel: 1, questLevel: 2, objectivesText: ["Kill 8 Kobold Vermin."], objectives: [[[200, null, 0]]] }),
    2: quest("Pelts without rate", { objectivesText: ["Bring 5 Ragged Pelts."], objectives: [null, null, [[500, null, 0]]] }),
    3: quest("Nowhere", { startedBy: [[101]] }),
    4: quest("Warrior only", { requiredClasses: 1 }),
    5: quest("Into the Keep", { zoneOrSort: 209, objectives: [[[103, null, 1]]] }),
    6: quest("Back into the Keep", { zoneOrSort: 209, preQuestSingle: [5] }),
    7: quest("For the Horde", { startedBy: [[102]] }),
    8: quest("Fangs", { objectivesText: ["Bring 4 Wolf Fangs."], objectives: [null, null, [[501, null, 0]]] }),
    9: quest("Crates", { objectivesText: ["Open the crates."], objectives: [null, [[600, null, 0]], [[502, null, 0]]] }),
    10: quest("Into the Core", { zoneOrSort: 2717 }),
    11: quest("Into the Gulch", { zoneOrSort: 3277 }),
    13: quest("Willix", { startedBy: [[104]], finishedBy: [[104]] }),
    14: quest("Core objective", { objectives: [[[105, null, 1]]] }),
    15: quest("Mixed drops", { objectivesText: ["Collect 2 Mixed Pelts."], objectives: [null, null, [[503, null, 0]]] }),
    16: quest("Coldridge", { requiredLevel: 1, startedBy: [[110]], finishedBy: [[110]], zoneOrSort: 1 }),
    17: quest("Shadowglen", { requiredLevel: 1, startedBy: [[111]], finishedBy: [[111]], zoneOrSort: 141 }),
    18: quest("Zephras", { requiredLevel: 1, startedBy: [[112]], finishedBy: [[112]], zoneOrSort: 16593 }),
    19: quest("Uncounted", { objectives: [[[200, null, 0]]] }),
    20: quest("Credit", { objectivesText: ["Slay 3 Defias Thugs."], objectives: [null, null, null, null, [[[201], 203, "Thugs slain"]]] }),
    21: quest("Credit from cmangos", { objectives: [null, null, null, null, [[[201], 203, "Thugs slain"]]] }),
    22: quest("Assumed drops", { objectivesText: ["Bring 2 Odd Trinkets."], objectives: [null, null, [[504, null, 0]]] }),
    23: quest("Singular", { objectivesText: ["Bring the Crate Goods to Marshal Dughan."], objectives: [null, null, [[502, null, 0]]] }),
    92432: quest("An Alarming Request", { requiredLevel: 30, questLevel: 33 }),
  };
  const questXp: Record<number, [number, number]> = {};
  for (const id of Object.keys(quests)) questXp[Number(id)] = [5, 100];
  return snapshot({
    quests,
    questXp,
    npcs: {
      100: npc({ 12: [[48, 42]] }),
      101: npc({ 999: [[50, 50]] }),
      102: npc({ 12: [[49, 42]] }, { friendlyToFaction: "H" }),
      103: npc({ 209: [[-1, -1]] }, { rank: 1, minLevel: 20, maxLevel: 20 }),
      104: npc({ 209: [[-1, -1]] }),
      105: npc({ 2717: [[-1, -1]] }, { npcFlags: 0 }),
      106: npc({ 209: [[-1, -1]] }, { npcFlags: 0 }),
      110: npc({ 1: [[30, 70]] }),
      111: npc({ 141: [[58, 44]] }),
      112: npc({ 16593: [[47, 22]] }),
      200: npc({ 12: [[40, 50], [40.5, 50], [41, 50.5], [80, 80]] }, { name: "Kobold Vermin", minLevel: 6, maxLevel: 7, npcFlags: 0 }),
      201: npc({ 12: [[60, 50]] }, { name: "Defias Thug", minLevel: 8, maxLevel: 8, npcFlags: 0 }),
      203: npc({}, { name: "Thug Kill Credit", npcFlags: 0 }),
      300: npc({ 12: [[NODE_PERCENT.x, NODE_PERCENT.y + flightMasterYards / YARDS_PER_Y_PERCENT]] }, { npcFlags: 8 }),
      400: npc({ 12: [[44, 66]] }, { npcFlags: 128 }),
    },
    objects: { 600: { name: "Crate", spawns: { 40: [[50, 50], [50.2, 50.2]] } } },
    items: {
      500: { name: "Ragged Pelt", npcDrops: [200], objectDrops: [] },
      501: { name: "Wolf Fang", npcDrops: [200], objectDrops: [] },
      502: { name: "Crate Goods", npcDrops: [], objectDrops: [600] },
      503: { name: "Mixed Pelt", npcDrops: [106, 200], objectDrops: [] },
      504: { name: "Odd Trinket", npcDrops: [200], objectDrops: [] },
    },
    dropRates: { 500: { 200: 0 }, 501: { 200: 35 }, 503: { 106: 50, 200: 20 } },
    areaIdToUiMapId: { 1: 1426, 12: 1429, 40: 1436, 141: 1438, 209: 310, 16593: 2521 },
    dungeons: {
      209: { name: "Shadowfang Keep", altAreaIds: [], parentZone: 40, entrances: [{ areaId: 40, x: 60, y: 60 }] },
      2717: { name: "Molten Core", altAreaIds: [], parentZone: 40, entrances: [{ areaId: 40, x: 61, y: 61 }] },
      3277: { name: "Warsong Gulch", altAreaIds: [], parentZone: 40, entrances: [{ areaId: 40, x: 62, y: 62 }] },
      5000: { name: "Nowhere Keep", altAreaIds: [], parentZone: 40, entrances: [{ areaId: 40, x: 63, y: 63 }] },
    },
    npcFlagValues: { innkeeper: 128, flightMaster: 8 },
    raceMaskById: RACES,
  });
}

function taxi(): TravelData {
  return travel({ taxiNodes: [{ id: 2, name: "Stormwind", pos: zonePercentToWorld(ELWYNN, NODE_PERCENT.x, NODE_PERCENT.y), faction: "A" }] });
}

describe("buildWorld", () => {
  const w = buildWorld(fixture(), zones(), "A", taxi(), INSTANCES, COUNTS);

  it("turns a kill objective into one kill task on the biggest cluster", () => {
    const q = w.quests.get(1)!;
    expect(q.tasks).toHaveLength(1);
    expect(q.tasks[0]).toMatchObject({ kind: "kill", objectiveIndex: 1, count: 8, mobLevel: 7, elite: false, dropChance: 1 });
    expect(q.tasks[0].cluster.loop).toHaveLength(3);
    expect(q.tasks[0].cluster.loop.every((p) => p.npcId === 200 && p.uiMapId === 1429)).toBe(true);
    expect(q.accept).toMatchObject({ uiMapId: 1429, x: 48, y: 42, npcId: 100, objectId: null });
    expect(q.accept.pos).toEqual(zonePercentToWorld(ELWYNN, 48, 42));
  });

  it("turns drops into collect tasks and object sources into use tasks", () => {
    expect(w.quests.get(8)!.tasks[0]).toMatchObject({ kind: "collect", count: 4, dropChance: 0.35, mobLevel: 7 });
    const crates = w.quests.get(9)!.tasks;
    expect(crates.map((t) => [t.kind, t.count, t.cluster.loop.length])).toEqual([["use", 2, 2], ["use", 3, 2]]);
    expect(crates[0].cluster.center.objectId).toBe(600);
  });

  it("takes counts from the objective text first and falls back to cmangos", () => {
    expect(w.quests.get(1)!.tasks[0].count).toBe(8);
    expect(w.quests.get(8)!.tasks[0].count).toBe(4);
    expect(w.quests.get(9)!.tasks.map((t) => t.count)).toEqual([2, 3]);
    expect(w.quests.get(20)!.tasks[0]).toMatchObject({ kind: "kill", count: 3 });
    expect(w.quests.get(20)!.tasks[0].cluster.center.npcId).toBe(201);
    expect(w.quests.get(21)!.tasks[0].count).toBe(5);
    expect(w.quests.get(23)!.tasks[0]).toMatchObject({ kind: "use", count: 1 });
    expect(w.countStats).toEqual({
      fromText: 6, fromTextSingular: 1, fromCmangos: 3, bothSources: 1, disagreements: 1, noCount: 1, assumedDropRate: 1,
    });
  });

  it("marks collect tasks whose drop rate is unknown and keeps a zero rate excluded", () => {
    expect(w.quests.get(22)!.tasks[0]).toMatchObject({ kind: "collect", count: 2, assumedDropChance: true, mobLevel: 7 });
    expect(w.quests.get(22)!.tasks[0].cluster.center.npcId).toBe(200);
    expect(w.quests.get(8)!.tasks[0].assumedDropChance).toBe(false);
    expect(w.quests.has(2)).toBe(false);
  });

  it("excludes a quest whose objective has no count anywhere", () => {
    expect(w.quests.has(19)).toBe(false);
    expect(w.excluded.get("noCount")).toBe(1);
  });

  it("counts each exclusion with its reason", () => {
    expect(w.quests.has(2)).toBe(false);
    expect(w.excluded.get("noDropRate")).toBe(1);
    expect(w.quests.has(3)).toBe(false);
    expect(w.excluded.get("noPosition")).toBe(1);
    expect(w.quests.has(4)).toBe(false);
    expect(w.excluded.get("class")).toBe(1);
    expect(w.quests.has(7)).toBe(false);
    expect(w.excluded.get("wrongFaction")).toBe(1);
  });

  it("marks dungeon quests, return visits and access chains", () => {
    expect(w.quests.get(5)).toMatchObject({ dungeonAreaId: 209, returnVisit: false, tasks: [] });
    expect(w.quests.get(6)).toMatchObject({ dungeonAreaId: 209, returnVisit: true });
    expect(w.quests.get(1)).toMatchObject({ dungeonAreaId: null, accessChain: false });
    expect(w.quests.get(92432)!.accessChain).toBe(true);
    expect(w.dungeons).toEqual([
      { areaId: 209, name: "Shadowfang Keep", entrance: expect.objectContaining({ uiMapId: 1436, x: 60, y: 60 }), questIds: [5, 6, 13] },
    ]);
  });

  it("joins AreaTable to Map, falling back to Map.AreaTableID for outdoor-continent rows", () => {
    expect(INSTANCES).toEqual(new Map([[209, 1], [2717, 2], [3277, 3], [1583, 1]]));
  });

  it("keeps party instances and excludes raid and battleground quests", () => {
    expect(w.quests.has(10)).toBe(false);
    expect(w.quests.has(11)).toBe(false);
    expect(w.excluded.get("raidOrBattleground")).toBe(3);
    expect(w.quests.has(14)).toBe(false);
    expect(w.dungeons.map((d) => d.areaId)).toEqual([209]);
  });

  it("throws for an unresolved instance that holds a candidate quest", () => {
    const s = fixture();
    expect(() => buildWorld(s, zones(), "A", taxi(), INSTANCES, COUNTS)).not.toThrow();
    s.quests[12] = quest("Into Nowhere", { zoneOrSort: 5000 });
    s.questXp[12] = [5, 100];
    expect(() => buildWorld(s, zones(), "A", taxi(), INSTANCES, COUNTS)).toThrow("world: dungeon 5000 (Nowhere Keep) has no instance type");
  });

  it("places sentinel in-dungeon starters at the entrance and marks the quest as a dungeon quest", () => {
    expect(w.quests.get(13)).toMatchObject({
      dungeonAreaId: 209,
      accept: { uiMapId: 1436, x: 60, y: 60, npcId: 104, objectId: null },
      turnin: { uiMapId: 1436, x: 60, y: 60, npcId: 104 },
    });
  });

  it("keeps an outdoor quest outdoors when only one drop source is inside a dungeon", () => {
    expect(w.quests.get(15)).toMatchObject({ dungeonAreaId: null });
    expect(w.quests.get(15)!.tasks[0]).toMatchObject({ kind: "collect", dropChance: 0.2 });
  });

  it("refuses a start area that has no zone map", () => {
    const rects = zones();
    rects.delete(2521);
    expect(() => buildWorld(fixture(), rects, "A", taxi(), INSTANCES, COUNTS)).toThrow("world: start zone zephras-isle (area 16593) has no zone map");
  });

  it("finds inns, taxi zones, the capital node and the start zones", () => {
    expect(w.faction).toBe("A");
    expect(w.raceMask).toBe(1 + 4 + 8 + 64 + 4294967296);
    expect(w.inns.map((i) => i.place.npcId)).toEqual([400]);
    expect(w.taxiZone).toEqual(new Map([[2, 1429]]));
    expect([...w.taxiPlaces].map(([id, p]) => [id, p.npcId, p.uiMapId])).toEqual([[2, 300, 1429]]);
    expect(w.areaUiMap.get(12)).toBe(1429);
    expect(w.capitalTaxiNode).toBe(2);
    expect(w.conversionOffsetYards).toBeCloseTo(3, 5);
    expect(w.startZones).toEqual([
      { key: "elwynn-forest", faction: "A", raceMask: 1, areaId: 12, start: w.quests.get(1)!.accept },
      { key: "dun-morogh", faction: "A", raceMask: 4 + 64, areaId: 1, start: w.quests.get(16)!.accept },
      { key: "teldrassil", faction: "A", raceMask: 8, areaId: 141, start: w.quests.get(17)!.accept },
      { key: "zephras-isle", faction: "A", raceMask: 4294967296, areaId: 16593, start: w.quests.get(18)!.accept },
    ]);
  });

  it("fails the conversion check when flight masters sit far from their nodes", () => {
    expect(() => buildWorld(fixture(100), zones(), "A", taxi(), INSTANCES, COUNTS)).toThrow(
      "world: zone conversion check failed, median offset 100.0 yd",
    );
  });

  it("refuses a faction without any flight master", () => {
    const s = fixture();
    delete s.npcs[300];
    expect(() => buildWorld(s, zones(), "A", taxi(), INSTANCES, COUNTS)).toThrow(/no flight master/);
  });
});

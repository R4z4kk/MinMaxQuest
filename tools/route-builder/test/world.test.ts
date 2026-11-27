import { describe, expect, it } from "vitest";
import type { TravelData } from "../../../addon/src/data/generated/travel";
import type { QuestieSnapshot } from "../ingest/snapshot";
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
  return { spawns, rank: 0, friendlyToFaction: "A", minLevel: 5, maxLevel: 5, npcFlags: 2, ...extra };
}

function quest(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, questLevel: 5, requiredLevel: 5, requiredRaces: 0, requiredClasses: 0,
    startedBy: [[100]], finishedBy: [[100]], objectives: [], zoneOrSort: 12, ...extra,
  };
}

function fixture(flightMasterYards = 3): QuestieSnapshot {
  const quests: Record<number, Record<string, unknown>> = {
    1: quest("Wolves", { requiredLevel: 1, questLevel: 2, objectives: [[[200, null, 8]]] }),
    2: quest("Pelts without rate", { objectives: [null, null, [[500, null, 5]]] }),
    3: quest("Nowhere", { startedBy: [[101]] }),
    4: quest("Warrior only", { requiredClasses: 1 }),
    5: quest("Into the Keep", { zoneOrSort: 209, objectives: [[[103, null, 1]]] }),
    6: quest("Back into the Keep", { zoneOrSort: 209, preQuestSingle: [5] }),
    7: quest("For the Horde", { startedBy: [[102]] }),
    8: quest("Fangs", { objectives: [null, null, [[501, null, 4]]] }),
    9: quest("Crates", { objectives: [null, [[600, null, 2]], [[502, null, 3]]] }),
    10: quest("Into the Core", { zoneOrSort: 2717 }),
    11: quest("Into the Gulch", { zoneOrSort: 3277 }),
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
      103: npc({ 209: [[50, 50]] }, { rank: 1, minLevel: 20, maxLevel: 20 }),
      200: npc({ 12: [[40, 50], [40.5, 50], [41, 50.5], [80, 80]] }, { minLevel: 6, maxLevel: 7, npcFlags: 0 }),
      300: npc({ 12: [[NODE_PERCENT.x, NODE_PERCENT.y + flightMasterYards / YARDS_PER_Y_PERCENT]] }, { npcFlags: 8 }),
      400: npc({ 12: [[44, 66]] }, { npcFlags: 128 }),
    },
    objects: { 600: { spawns: { 40: [[50, 50], [50.2, 50.2]] } } },
    items: {
      500: { npcDrops: [200], objectDrops: [] },
      501: { npcDrops: [200], objectDrops: [] },
      502: { npcDrops: [], objectDrops: [600] },
    },
    dropRates: { 501: { 200: 35 } },
    areaIdToUiMapId: { 12: 1429, 40: 1436, 209: 310 },
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
  const w = buildWorld(fixture(), zones(), "A", taxi(), INSTANCES);

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
      { areaId: 209, name: "Shadowfang Keep", entrance: expect.objectContaining({ uiMapId: 1436, x: 60, y: 60 }), questIds: [5, 6] },
    ]);
  });

  it("joins AreaTable to Map, falling back to Map.AreaTableID for outdoor-continent rows", () => {
    expect(INSTANCES).toEqual(new Map([[209, 1], [2717, 2], [3277, 3], [1583, 1]]));
  });

  it("keeps party instances and excludes raid and battleground quests", () => {
    expect(w.quests.has(10)).toBe(false);
    expect(w.quests.has(11)).toBe(false);
    expect(w.excluded.get("raidOrBattleground")).toBe(2);
    expect(w.dungeons.map((d) => d.areaId)).toEqual([209]);
  });

  it("throws for an unresolved instance that holds a candidate quest", () => {
    const s = fixture();
    expect(() => buildWorld(s, zones(), "A", taxi(), INSTANCES)).not.toThrow();
    s.quests[12] = quest("Into Nowhere", { zoneOrSort: 5000 });
    s.questXp[12] = [5, 100];
    expect(() => buildWorld(s, zones(), "A", taxi(), INSTANCES)).toThrow("world: dungeon 5000 (Nowhere Keep) has no instance type");
  });

  it("finds inns, taxi zones, the capital node and the start zone", () => {
    expect(w.faction).toBe("A");
    expect(w.raceMask).toBe(1 + 4 + 8 + 64 + 4294967296);
    expect(w.inns.map((i) => i.place.npcId)).toEqual([400]);
    expect(w.taxiZone).toEqual(new Map([[2, 1429]]));
    expect(w.capitalTaxiNode).toBe(2);
    expect(w.conversionOffsetYards).toBeCloseTo(3, 5);
    expect(w.startZones).toEqual([
      { key: "elwynn-forest", faction: "A", raceMask: 1, areaId: 12, start: w.quests.get(1)!.accept },
    ]);
  });

  it("fails the conversion check when flight masters sit far from their nodes", () => {
    expect(() => buildWorld(fixture(100), zones(), "A", taxi(), INSTANCES)).toThrow(
      "world: zone conversion check failed, median offset 100.0 yd",
    );
  });

  it("refuses a faction without any flight master", () => {
    const s = fixture();
    delete s.npcs[300];
    expect(() => buildWorld(s, zones(), "A", taxi(), INSTANCES)).toThrow(/no flight master/);
  });
});

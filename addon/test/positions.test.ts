import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import type { AreaPoint, QuestInfo, QuestRepository } from "../src/data/questRepository";
import { createPlaceFor, createPositions, isFriendlyTo } from "../src/game/positions";

function quest(over: Partial<QuestInfo>): QuestInfo {
  return {
    id: 1, name: "Q", level: 10, requiredLevel: 1, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], starterItems: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false, isElite: false, zoneAreaId: null,
    ...over,
  };
}

const NPC_SPAWNS: Record<number, AreaPoint[]> = {
  10: [{ areaId: 1, x: 10, y: 20 }, { areaId: 99, x: 1, y: 1 }],
  11: [{ areaId: 1, x: 30, y: 40 }],
};
const OBJECT_SPAWNS: Record<number, AreaPoint[]> = { 50: [{ areaId: 1, x: 50, y: 60 }] };
const FRIENDLY: Record<number, "A" | "H" | "AH"> = { 12: "H", 13: "AH" };
NPC_SPAWNS[12] = [{ areaId: 1, x: 70, y: 0 }];
NPC_SPAWNS[13] = [{ areaId: 1, x: 80, y: 0 }];
NPC_SPAWNS[14] = [{ areaId: 1, x: 90, y: 0 }];

function repo(calls: { items: number }): QuestRepository {
  return {
    get: () => null,
    allIds: () => [],
    npcSpawns: (id) => NPC_SPAWNS[id] ?? [],
    objectSpawns: (id) => OBJECT_SPAWNS[id] ?? [],
    itemSources: (id) => (calls.items++, id === 7 ? { npcs: [11], objects: [50] } : { npcs: [], objects: [] }),
    uiMapIdForArea: () => null,
    npcFriendlyTo: (id) => FRIENDLY[id] ?? null,
    npcName: () => null,
    objectName: () => null,
    itemName: () => null,
    lastError: () => null,
  };
}

function setup() {
  const calls = { convert: 0, items: 0 };
  const toWorld = (p: AreaPoint): WorldPos | null => {
    calls.convert++;
    return p.areaId === 99 ? null : { continent: 0, x: p.x, y: p.y };
  };
  return { positionsFor: createPositions(repo(calls), toWorld, () => "A"), calls };
}

const xs = (points: WorldPos[]) => points.map((p) => p.x);

describe("positionsFor", () => {
  it("merges starter NPC and object spawns and drops unconvertible points", () => {
    const { positionsFor } = setup();
    expect(xs(positionsFor(quest({ starterNpcs: [10], starterObjects: [50] }), "accept", null))).toEqual([10, 50]);
  });

  it("drops starters and finishers of the other faction, like Questie", () => {
    const { positionsFor } = setup();
    const npcs = [11, 12, 13, 14];
    expect(xs(positionsFor(quest({ starterNpcs: npcs }), "accept", null))).toEqual([30, 80, 90]);
    expect(xs(positionsFor(quest({ finisherNpcs: npcs }), "turnin", null))).toEqual([30, 80, 90]);
    const q = quest({ objectives: [{ kind: "npc", id: 12, required: 1, index: 1 }] });
    expect(xs(positionsFor(q, "objective", 1))).toEqual([70]);
  });

  it("uses finishers for turn-in", () => {
    const { positionsFor } = setup();
    expect(xs(positionsFor(quest({ finisherNpcs: [11] }), "turnin", null))).toEqual([30]);
  });

  it("converts each NPC's spawns once", () => {
    const { positionsFor, calls } = setup();
    const q = quest({ starterNpcs: [10] });
    positionsFor(q, "accept", null);
    const again = positionsFor(q, "accept", null);
    expect(calls.convert).toBe(2);
    expect(positionsFor(q, "accept", null)[0]).toBe(again[0]);
  });

  it("resolves npc, object and item objectives", () => {
    const { positionsFor } = setup();
    const q = quest({
      objectives: [
        { kind: "npc", id: 11, required: 1, index: 1 },
        { kind: "object", id: 50, required: 1, index: 2 },
        { kind: "item", id: 7, required: 1, index: 3 },
        { kind: "reputation", index: 5 },
      ],
    });
    expect(positionsFor(q, "objective", 5)).toEqual([]);
    expect(xs(positionsFor(q, "objective", 1))).toEqual([30]);
    expect(xs(positionsFor(q, "objective", 2))).toEqual([50]);
    expect(xs(positionsFor(q, "objective", 3))).toEqual([30, 50]);
    expect(positionsFor(q, "objective", 4)).toEqual([]);
  });

  it("reads item sources once per item", () => {
    const { positionsFor, calls } = setup();
    const q = quest({ objectives: [{ kind: "item", id: 7, required: 1, index: 1 }] });
    positionsFor(q, "objective", 1);
    positionsFor(q, "objective", 1);
    expect(calls.items).toBe(1);
  });
});

describe("isFriendlyTo", () => {
  it("counts nil, both sides and the own side as friendly", () => {
    const reads: ("A" | "H" | "AH" | null)[] = [null, "AH", "A", "H"];
    expect(reads.map((read) => isFriendlyTo(read, "A"))).toEqual([true, true, true, false]);
  });
});

describe("createPlaceFor", () => {
  // Same finisher in three cities, as the Alliance Brigadier General of the battleground quests.
  const SPAWNS: AreaPoint[] = [{ areaId: 1, x: 10, y: 0 }, { areaId: 1, x: 500, y: 0 }, { areaId: 1, x: 900, y: 0 }];
  const placeRepo: QuestRepository = { ...repo({ items: 0 }), npcSpawns: () => SPAWNS, uiMapIdForArea: () => 7 };
  const toWorld = (_m: number, x: number, y: number): WorldPos => ({ continent: 0, x, y });
  const q = quest({ finisherNpcs: [15351] });

  it("turns in at the spawn nearest to the player, not the first one listed", () => {
    const place = createPlaceFor(placeRepo, () => "A", () => ({ continent: 0, x: 880, y: 0 }), toWorld);
    expect(place(q, "turnin", null)).toEqual({ uiMapId: 7, x: 900, y: 0 });
  });

  it("keeps the first spawn when the player position is unknown", () => {
    const place = createPlaceFor(placeRepo, () => "A", () => null, toWorld);
    expect(place(q, "turnin", null)).toEqual({ uiMapId: 7, x: 10, y: 0 });
  });
});

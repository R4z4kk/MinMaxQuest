import { describe, expect, it } from "vitest";
import { createQuestRepository } from "../src/data/questRepository";

type Row = Record<string, unknown>;

function fakeLib(quests: Record<number, Row>, ranks: Record<number, number> = {}): LibQuestieDBApi {
  return {
    RequireContract: () => [true] as unknown as ReturnType<LibQuestieDBApi["RequireContract"]>,
    Quest: {
      Get: (id, field) => {
        const row = quests[id];
        if (row == null) return null;
        if (row.__throw === true) throw new Error("boom");
        return row[field] ?? null;
      },
      GetAllIds: () => Object.keys(quests).map(Number),
    },
    Npc: {
      Get: (id, field) =>
        field === "rank" ? (ranks[id] ?? null) : { 12: [[10, 20], [-1, -1], [Number.NaN, 1]], 13: [[30, 40, 1]] },
    },
    Item: { Get: (_id, field) => (field === "npcDrops" ? [7, 8] : null) },
    Object: { Get: () => null },
    Support: {
      Get: ((name: string) =>
        name === "QuestXP"
          ? { db: { 33: [5, 450] } }
          : { private: { areaIdToUiMapId: { 12: 1429 } } }) as LibQuestieDBApi["Support"]["Get"],
    },
  };
}

describe("createQuestRepository", () => {
  it("returns error result on contract mismatch", () => {
    const lib = fakeLib({});
    lib.RequireContract = () => [false, "msg"] as unknown as ReturnType<LibQuestieDBApi["RequireContract"]>;
    expect(createQuestRepository(lib)).toEqual({ ok: false, message: "msg" });
  });

  it("returns error result without a library", () => {
    expect(createQuestRepository(null).ok).toBe(false);
  });

  it("maps a quest row", () => {
    const lib = fakeLib(
      {
        33: {
          name: "Wolves", questLevel: 5, requiredLevel: 3, requiredRaces: 0, preQuestSingle: [1],
          startedBy: [[100], null, null], finishedBy: [[101]],
          objectives: [[[200, "wolf", 8]], null, [[300, "pelt", 4]], null, [[[400, 401], 400, "x", 2]]],
          nextQuestInChain: 34, zoneOrSort: 12,
        },
      },
      { 401: 1 },
    );
    const result = createQuestRepository(lib);
    if (!result.ok) throw new Error(result.message);
    const q = result.repo.get(33);
    expect(q).toMatchObject({
      id: 33, name: "Wolves", level: 5, requiredLevel: 3, preSingle: [1], starterNpcs: [100],
      starterObjects: [], finisherNpcs: [101], nextInChain: 34, zoneAreaId: 12, baseXp: 450,
      isElite: true, hasUnsupportedRequirement: false,
    });
    expect(q?.objectives).toEqual([
      { kind: "npc", id: 200, required: 8, index: 1 },
      { kind: "item", id: 300, required: 4, index: 2 },
      { kind: "npc", id: 400, required: 2, index: 3 },
    ]);
    expect(result.repo.uiMapIdForArea(12)).toBe(1429);
    expect(result.repo.itemSources(5)).toEqual({ npcs: [7, 8], objects: [] });
  });

  it("flags unsupported requirements", () => {
    const result = createQuestRepository(fakeLib({ 1: { name: "A", questLevel: 1, requiredSkill: [164, 50] } }));
    if (!result.ok) throw new Error(result.message);
    expect(result.repo.get(1)?.hasUnsupportedRequirement).toBe(true);
  });

  it("returns null for unknown or malformed quests without throwing", () => {
    const result = createQuestRepository(fakeLib({ 1: { name: "A" }, 2: { __throw: true } }));
    if (!result.ok) throw new Error(result.message);
    expect(result.repo.get(999)).toBeNull();
    expect(result.repo.get(1)).toBeNull();
    expect(result.repo.get(2)).toBeNull();
  });

  it("drops sentinel and non-finite spawn coordinates", () => {
    const result = createQuestRepository(fakeLib({}));
    if (!result.ok) throw new Error(result.message);
    expect(result.repo.npcSpawns(1)).toEqual([
      { areaId: 12, x: 10, y: 20 },
      { areaId: 13, x: 30, y: 40 },
    ]);
  });
});

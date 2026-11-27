import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../src/core/l10n";
import { resetReports, setReportSink } from "../src/core/report";
import { createQuestRepository } from "../src/data/questRepository";

type Row = Record<string, unknown>;

const NO_HINTS = (): LibQuestieDBApi["ObjectiveFirst"] => ({
  killCreditObjectiveFirst: {},
  objectObjectiveFirst: {},
  itemObjectiveFirst: {},
  eventObjectiveFirst: {},
  spellObjectiveFirst: {},
});

const TABLE_ZONES: QuestieDBZonePrivate = { areaIdToUiMapId: { 12: 1429, 14: 1 }, areaIdToUiMapIdOverride: { 14: 1411 } };

function fakeLib(
  quests: Record<number, Row>,
  ranks: Record<number, number> = {},
  zones: QuestieDBZonePrivate = TABLE_ZONES,
): LibQuestieDBApi {
  return {
    ObjectiveFirst: NO_HINTS(),
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
        field === "rank"
          ? (ranks[id] ?? null)
          : field === "friendlyToFaction"
            ? ({ 1: "A", 2: "AH", 3: "X" } as Record<number, string>)[id] ?? null
            : { 12: [[10, 20], [-1, -1], [Number.NaN, 1]], 13: [[30, 40, 1]] },
    },
    Item: { Get: (_id, field) => (field === "npcDrops" ? [7, 8] : null) },
    Object: { Get: () => null },
    Support: {
      Get: ((name: string) =>
        name === "QuestXP"
          ? { db: { 33: [5, 450] } }
          : { private: zones }) as LibQuestieDBApi["Support"]["Get"],
    },
  };
}

// Node has no Lua loadstring: this one reads "return <json>" so the string path runs here; gameLua tests decode real Lua.
const host = globalThis as { loadstring?: (source: string) => [() => unknown] | [null, string] };
host.loadstring = (source) => {
  try {
    const value: unknown = JSON.parse(source.replace(/^return /, ""));
    return [() => value];
  } catch (error) {
    return [null, String(error)];
  }
};

let reported: string[] = [];
beforeEach(() => {
  setLocale("enUS");
  reported = [];
  resetReports();
  setReportSink((line) => reported.push(line));
});

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

  it("reads the quest items, null and empty when absent", () => {
    const result = createQuestRepository(
      fakeLib({
        1: { name: "A", questLevel: 1, sourceItemId: 900, requiredSourceItems: [901, 902] },
        2: { name: "B", questLevel: 1 },
        3: { name: "C", questLevel: 1, sourceItemId: 0 },
      }),
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.repo.get(1)).toMatchObject({ sourceItemId: 900, requiredSourceItems: [901, 902] });
    expect(result.repo.get(2)).toMatchObject({ sourceItemId: null, requiredSourceItems: [] });
    expect(result.repo.get(3)?.sourceItemId).toBeNull();
  });

  it("flags unsupported requirements", () => {
    const result = createQuestRepository(fakeLib({ 1: { name: "A", questLevel: 1, requiredSkill: [164, 50] } }));
    if (!result.ok) throw new Error(result.message);
    expect(result.repo.get(1)?.hasUnsupportedRequirement).toBe(true);
  });

  it("treats a zero required spell as no requirement", () => {
    const result = createQuestRepository(
      fakeLib({ 1: { name: "A", questLevel: 1, requiredSpell: 0 }, 2: { name: "B", questLevel: 1, requiredSpell: -1230656 } }),
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.repo.get(1)?.hasUnsupportedRequirement).toBe(false);
    expect(result.repo.get(2)?.hasUnsupportedRequirement).toBe(true);
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

  function repoFor(lib: LibQuestieDBApi) {
    const result = createQuestRepository(lib);
    if (!result.ok) throw new Error(result.message);
    return result.repo;
  }

  const ALL_KINDS = [[[200, "wolf"]], [[210, "chest"]], [[300, "pelt"], [301, "fang"]], [72, 3000], [[[400], 400, "x"]], [[500, "cast", 9]]];
  const kinds = (q: { objectives: { kind: string; index: number }[] } | null) =>
    q?.objectives.map((o) => `${o.index}:${o.kind}`);

  it("numbers objectives in Questie order, rep, spell and event included", () => {
    const repo = repoFor(fakeLib({ 1: { name: "A", questLevel: 1, objectives: ALL_KINDS, triggerEnd: ["Explore", {}] } }));
    expect(kinds(repo.get(1))).toEqual([
      "1:npc", "2:object", "3:item", "4:item", "5:reputation", "6:npc", "7:spell", "8:event",
    ]);
  });

  it("applies the ObjectiveFirst hints like Questie", () => {
    const lib = fakeLib({
      1: { name: "A", questLevel: 1, objectives: ALL_KINDS },
      2: { name: "B", questLevel: 1, objectives: ALL_KINDS, triggerEnd: ["Explore", {}] },
    });
    lib.ObjectiveFirst.itemObjectiveFirst[1] = true;
    lib.ObjectiveFirst.killCreditObjectiveFirst[1] = true;
    lib.ObjectiveFirst.eventObjectiveFirst[2] = true;
    const repo = repoFor(lib);
    expect(repo.get(1)?.objectives.slice(0, 4)).toEqual([
      { kind: "npc", id: 400, required: 1, index: 1 },
      { kind: "item", id: 301, required: 1, index: 2 },
      { kind: "item", id: 300, required: 1, index: 3 },
      { kind: "npc", id: 200, required: 1, index: 4 },
    ]);
    expect(kinds(repo.get(2))?.slice(0, 2)).toEqual(["1:event", "2:npc"]);
  });

  it("keeps the slot of an objective without a readable id", () => {
    const repo = repoFor(fakeLib({ 1: { name: "A", questLevel: 1, objectives: [[["bad", "x"], [201, "y"]]] } }));
    expect(kinds(repo.get(1))).toEqual(["1:missing", "2:npc"]);
  });

  it("reports missing ObjectiveFirst hints", () => {
    const lib = fakeLib({ 1: { name: "A", questLevel: 1, objectives: [[[200, "x"]]] } });
    (lib as { ObjectiveFirst: unknown }).ObjectiveFirst = null;
    expect(repoFor(lib).get(1)?.objectives.length).toBe(1);
    expect(reported[0]).toContain("ObjectiveFirst");
  });

  it("reads the factions an NPC is friendly to", () => {
    const repo = repoFor(fakeLib({}));
    expect([1, 2, 3, 4].map((id) => repo.npcFriendlyTo(id))).toEqual(["A", "AH", null, null]);
  });

  it("falls back to the base NPC when the kill-credit list is empty", () => {
    const repo = repoFor(fakeLib({ 1: { name: "A", questLevel: 1, objectives: [null, null, null, null, [[[], 500, "x", 3]]] } }));
    expect(repo.get(1)?.objectives).toEqual([{ kind: "npc", id: 500, required: 3, index: 1 }]);
  });

  it("derives isElite from creature rank 1 but not from ranks 0 and 4", () => {
    const rows = (npc: number): Record<number, Row> => ({
      1: { name: "A", questLevel: 1, objectives: [[[npc, "x", 1]]] },
    });
    expect(repoFor(fakeLib(rows(10), { 10: 1 })).get(1)?.isElite).toBe(true);
    expect(repoFor(fakeLib(rows(10), { 10: 0 })).get(1)?.isElite).toBe(false);
    expect(repoFor(fakeLib(rows(10), { 10: 4 })).get(1)?.isElite).toBe(false);
  });

  it("normalizes zero and negative sentinels to null", () => {
    const repo = repoFor(
      fakeLib({ 1: { name: "A", questLevel: 1, requiredMaxLevel: 0, nextQuestInChain: 0, zoneOrSort: -22 } }),
    );
    expect(repo.get(1)).toMatchObject({ requiredMaxLevel: null, nextInChain: null, zoneAreaId: null });
  });

  it("keeps quests readable when support data is missing", () => {
    const lib = fakeLib({ 1: { name: "A", questLevel: 1 } });
    lib.Support.Get = (() => null) as unknown as LibQuestieDBApi["Support"]["Get"];
    const repo = repoFor(lib);
    expect(repo.get(1)?.baseXp).toBeNull();
    expect(repo.uiMapIdForArea(12)).toBeNull();
    expect(repo.lastError()).toContain("QuestXP");
  });

  it("caches quests, including misses", () => {
    let reads = 0;
    const lib = fakeLib({ 1: { name: "A", questLevel: 1 } });
    const get = lib.Quest.Get;
    lib.Quest.Get = (id, field) => {
      reads += 1;
      return get(id, field);
    };
    const repo = repoFor(lib);
    expect(repo.get(1)).toBe(repo.get(1));
    expect(repo.get(9)).toBeNull();
    const before = reads;
    repo.get(1);
    repo.get(9);
    expect(reads).toBe(before);
  });

  it("records the first error per method", () => {
    const repo = repoFor(fakeLib({ 2: { __throw: true } }));
    expect(repo.lastError()).toBeNull();
    repo.get(2);
    expect(repo.lastError()).toContain("get");
  });

  it("reports each failing method once", () => {
    const repo = repoFor(fakeLib({ 2: { __throw: true }, 3: { __throw: true } }));
    repo.get(2);
    repo.get(3);
    expect(reported).toEqual(["MinMaxQuest: QuestieDB read failed (get): Error: boom"]);
  });

  it("leaves the XP unknown when the quest has no QuestXP entry", () => {
    expect(repoFor(fakeLib({ 1: { name: "A", questLevel: 1 } })).get(1)?.baseXp).toBeNull();
  });

  it("applies the override on top of the table zone maps", () => {
    const repo = repoFor(fakeLib({}));
    expect(repo.uiMapIdForArea(12)).toBe(1429);
    expect(repo.uiMapIdForArea(14)).toBe(1411);
    expect(repo.uiMapIdForArea(99)).toBeNull();
  });

  it("decodes Lua source zone maps and applies the override on top", () => {
    const repo = repoFor(
      fakeLib({}, {}, { areaIdToUiMapId: 'return {"12": 1429, "14": 1}', areaIdToUiMapIdOverride: 'return {"14": 1411}' }),
    );
    expect(repo.uiMapIdForArea(12)).toBe(1429);
    expect(repo.uiMapIdForArea(14)).toBe(1411);
    expect(repo.lastError()).toBeNull();
  });

  it("reports a zone map that does not compile", () => {
    const repo = repoFor(fakeLib({}, {}, { areaIdToUiMapId: "return {", areaIdToUiMapIdOverride: "return {}" }));
    expect(repo.uiMapIdForArea(12)).toBeNull();
    expect(repo.lastError()).toContain("ZoneDB.private.areaIdToUiMapId does not compile");
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("QuestieDB read failed (ZoneDB)");
  });

  it("reports a missing zone map override", () => {
    const repo = repoFor(fakeLib({}, {}, { areaIdToUiMapId: { 12: 1429 } } as unknown as QuestieDBZonePrivate));
    expect(repo.uiMapIdForArea(12)).toBeNull();
    expect(repo.lastError()).toContain("ZoneDB.private.areaIdToUiMapIdOverride is not a table");
  });
});

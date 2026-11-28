import { describe, expect, it } from "vitest";
import type { ProfessionData, Skill } from "../src/data/generated/professions";
import type { QuestInfo, QuestObjectiveRef } from "../src/data/questRepository";
import { createPlanFor, createPlayerSkills, obtainPlan, playerSkills } from "../src/game/professions";

const NONE: Record<Skill, number[]> = {
  herbalism: [2366], mining: [2575], skinning: [8613], fishing: [7620], alchemy: [2259], blacksmithing: [2018],
  enchanting: [7411], engineering: [4036], leatherworking: [2108], tailoring: [3908], cooking: [2550], firstAid: [3273],
};

const DATA: ProfessionData = {
  source: { questieDb: "t", cmangosCommit: "c", wagoBuild: "b", verifiedOn: "2026-11-28", expiresOn: "2026-12-27" },
  items: {
    8846: { gather: ["herbalism"], craft: [], cloth: false },
    2840: { gather: [], craft: ["mining"], cloth: false },
    2318: { gather: ["skinning"], craft: ["leatherworking"], cloth: false },
    6303: { gather: ["fishing"], craft: [], cloth: false },
    2589: { gather: [], craft: [], cloth: true },
  },
  nodes: { 142145: "herbalism" },
  skinned: { 2318: [113, 118] },
  auctioneers: [{ npcId: 8670, faction: "A" }],
  skillSpells: NONE,
};

const skills = (...list: Skill[]): Set<Skill> => new Set(list);
const HERB_OBJECTS = [142145, 2843];

describe("obtainPlan", () => {
  it("leaves a non-profession item to today's sources", () => {
    expect(obtainPlan(11405, [], skills(), DATA)).toBeNull();
  });

  it("gathers an herb at its nodes only, without the mob drops, with Herbalism", () => {
    expect(obtainPlan(8846, HERB_OBJECTS, skills("herbalism"), DATA)).toEqual({ how: "gather", npcs: [], objects: [142145] });
  });

  it("buys an herb at the auction house without Herbalism", () => {
    expect(obtainPlan(8846, HERB_OBJECTS, skills("mining"), DATA)).toEqual({ how: "buy", npcs: [], objects: [] });
  });

  it("crafts with the craft skill, buys without", () => {
    expect(obtainPlan(2840, [], skills("mining"), DATA)?.how).toBe("craft");
    expect(obtainPlan(2840, [], skills("alchemy"), DATA)?.how).toBe("buy");
  });

  it("skins the listed creatures with Skinning, before crafting", () => {
    expect(obtainPlan(2318, [], skills("skinning", "leatherworking"), DATA)).toEqual({ how: "gather", npcs: [113, 118], objects: [] });
    expect(obtainPlan(2318, [], skills("leatherworking"), DATA)?.how).toBe("craft");
  });

  it("fishes with Fishing, buys without", () => {
    expect(obtainPlan(6303, [], skills("fishing"), DATA)?.how).toBe("fish");
    expect(obtainPlan(6303, [], skills(), DATA)?.how).toBe("buy");
  });

  it("buys a trade good that is neither gathered nor crafted", () => {
    expect(obtainPlan(2589, [], skills("tailoring"), DATA)?.how).toBe("buy");
  });
});

describe("playerSkills", () => {
  it("has a profession when any of its rank spells is known", () => {
    expect([...(playerSkills((id) => id === 2366 || id === 3908, DATA) ?? [])]).toEqual(["herbalism", "tailoring"]);
  });

  it("is unknown when the client cannot tell known spells", () => {
    expect(playerSkills(null, DATA)).toBeNull();
  });
});

describe("createPlayerSkills", () => {
  it("reads once per change and says whether the set changed", () => {
    let known = new Set<number>();
    let reads = 0;
    const player = createPlayerSkills(() => (id) => (reads++, known.has(id)), DATA);
    expect(player.current()).toBeNull();
    expect(player.refresh()).toBe(true);
    expect([...(player.current() ?? [])]).toEqual([]);
    const after = reads;
    expect(player.refresh()).toBe(false);
    expect(reads).toBe(after);
    known = new Set([2366]);
    player.markDirty();
    expect(player.refresh()).toBe(true);
    expect([...(player.current() ?? [])]).toEqual(["herbalism"]);
    player.markDirty();
    expect(player.refresh()).toBe(false);
  });
});

function quest(objectives: QuestObjectiveRef[]): QuestInfo {
  return {
    id: 4201, name: "The Love Potion", level: 58, requiredLevel: 50, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives, baseXp: 0, hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false, isElite: false, zoneAreaId: null,
    sourceItemId: null, requiredSourceItems: [],
  };
}

describe("createPlanFor", () => {
  const sources = (id: number) => (id === 8846 ? { npcs: [12258], objects: HERB_OBJECTS } : { npcs: [], objects: [] });
  const love = quest([
    { kind: "item", id: 8846, required: 4, index: 1 },
    { kind: "item", id: 11405, required: 1, index: 2 },
    { kind: "npc", id: 5, required: 1, index: 3 },
  ]);

  it("plans item objectives of profession items, named, keyed by the skills", () => {
    const planFor = createPlanFor(sources, () => skills(), (id) => (id === 8846 ? "Gromsblood" : null), DATA);
    expect(planFor(love, 1)).toEqual({ how: "buy", itemId: 8846, item: "Gromsblood", npcs: [], objects: [], key: "buy:" });
    expect(planFor(love, 2)).toBeNull();
    expect(planFor(love, 3)).toBeNull();
  });

  it("keeps today's behaviour while the skills are unknown", () => {
    expect(createPlanFor(sources, () => null, () => "Gromsblood", DATA)(love, 1)).toBeNull();
  });

  it("falls back to the item id for a name and replans when the skills change", () => {
    let current = skills();
    const planFor = createPlanFor(sources, () => current, () => null, DATA);
    expect(planFor(love, 1)?.item).toBe("#8846");
    current = skills("herbalism", "tailoring");
    expect(planFor(love, 1)).toMatchObject({ how: "gather", objects: [142145], key: "gather:herbalism,tailoring" });
  });
});

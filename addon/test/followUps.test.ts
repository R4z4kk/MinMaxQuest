import { describe, expect, it } from "vitest";
import { XP_PER_LEVEL, expiredConstants } from "../src/core/constants";
import { questXp } from "../src/core/questXp";
import type { QuestInfo } from "../src/data/questRepository";
import { followUps, lostXp } from "../src/quests/followUps";

function quest(id: number, over: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id,
    name: `q${id}`,
    level: 10,
    requiredLevel: 1,
    requiredMaxLevel: null,
    races: 0,
    classes: 0,
    preGroup: [],
    preSingle: [],
    exclusiveTo: [],
    nextInChain: null,
    children: [],
    starterNpcs: [],
    starterObjects: [],
    finisherNpcs: [],
    finisherObjects: [],
    objectives: [],
    baseXp: 1000,
    hasUnsupportedRequirement: false,
    isElite: false,
    zoneAreaId: null,
    ...over,
  };
}

function lookup(quests: QuestInfo[]): (id: number) => QuestInfo | null {
  const byId: Record<number, QuestInfo> = {};
  for (const q of quests) byId[q.id] = q;
  return (id) => byId[id] ?? null;
}

const ids = (list: QuestInfo[]): number[] => list.map((q) => q.id);

describe("followUps", () => {
  it("returns the chain in BFS order", () => {
    const get = lookup([quest(1, { nextInChain: 2 }), quest(2, { nextInChain: 3, preSingle: [1] }), quest(3, { preSingle: [2] })]);
    expect(ids(followUps(1, get))).toEqual([2, 3]);
  });

  it("includes children", () => {
    const get = lookup([quest(1, { children: [5, 6] }), quest(5, { preGroup: [1] }), quest(6)]);
    expect(ids(followUps(1, get))).toEqual([5, 6]);
  });

  it("terminates on a cycle and excludes the start quest", () => {
    const get = lookup([quest(1, { nextInChain: 2 }), quest(2, { nextInChain: 1 })]);
    expect(ids(followUps(1, get))).toEqual([2]);
  });

  it("returns [] without follow-ups", () => {
    expect(followUps(1, lookup([quest(1)]))).toEqual([]);
    expect(followUps(99, lookup([]))).toEqual([]);
  });

  it("skips unknown ids", () => {
    expect(followUps(1, lookup([quest(1, { nextInChain: 2 })]))).toEqual([]);
  });

  it("excludes a quest unlocked by A or X", () => {
    const get = lookup([quest(1, { nextInChain: 2 }), quest(2, { preSingle: [1, 7] }), quest(7)]);
    expect(followUps(1, get)).toEqual([]);
  });

  it("keeps a quest needing both A and Y", () => {
    const get = lookup([quest(1, { nextInChain: 2 }), quest(2, { preGroup: [1, 8] }), quest(8)]);
    expect(ids(followUps(1, get))).toEqual([2]);
  });

  it("keeps an or-quest whose alternative is itself a follow-up", () => {
    const get = lookup([
      quest(1, { nextInChain: 2 }),
      quest(2, { nextInChain: 3, preSingle: [1] }),
      quest(3, { preSingle: [1, 2] }),
    ]);
    expect(ids(followUps(1, get))).toEqual([2, 3]);
  });
});

describe("lostXp", () => {
  it("sums questXp at the current level", () => {
    const a = quest(1, { level: 20, baseXp: 1000 });
    const b = quest(2, { level: 18, baseXp: 500 });
    const xp = questXp(1000, 20, 20, 60) + questXp(500, 18, 20, 60);
    const result = lostXp([a, b], 20, 60);
    expect(result.xp).toBe(xp);
    expect(result.levelFraction).toBeCloseTo(xp / 23200, 10);
  });

  it("is zero at max level", () => {
    expect(lostXp([quest(1)], 60, 60)).toEqual({ xp: 0, levelFraction: 0 });
  });

  it("is zero fraction without a table entry", () => {
    const result = lostXp([quest(1)], 70, 80);
    expect(result.levelFraction).toBe(0);
  });
});

describe("XP_PER_LEVEL", () => {
  const sum = (from: number, to: number): number =>
    XP_PER_LEVEL.values.slice(from - 1, to).reduce((a, b) => a + b, 0);

  it("has 59 entries totalling 4,084,700", () => {
    expect(XP_PER_LEVEL.values).toHaveLength(59);
    expect(sum(1, 59)).toBe(4084700);
  });
  it("matches the verified partial sums", () => {
    expect(sum(1, 10)).toBe(35200);
    expect(sum(11, 20)).toBe(155200);
    expect(sum(21, 30)).toBe(356000);
    expect(sum(31, 40)).toBe(698700);
    expect(sum(41, 50)).toBe(1208500);
    expect(sum(51, 59)).toBe(1631100);
  });
  it("is reported when expired", () => {
    expect(expiredConstants("2026-12-28")).toContain("XP_PER_LEVEL");
    expect(expiredConstants("2026-12-27")).not.toContain("XP_PER_LEVEL");
  });
});

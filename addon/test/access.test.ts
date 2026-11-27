import { describe, expect, it } from "vitest";
import { ACCESS_CHAINS, resolveSteps, type AccessChainDef } from "../src/access/chains";
import { chainProgress } from "../src/access/progress";
import type { QuestInfo } from "../src/data/questRepository";

function quest(id: number, nextInChain: number | null): QuestInfo {
  return {
    id, name: "Q", level: 10, requiredLevel: 8, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
  };
}

function lookup(quests: QuestInfo[]): (id: number) => QuestInfo | null {
  const byId: Record<number, QuestInfo> = {};
  for (const q of quests) byId[q.id] = q;
  return (id) => byId[id] ?? null;
}

function def(overrides: Partial<AccessChainDef> = {}): AccessChainDef {
  return {
    id: "t", name: { frFR: "t", enUS: "t" }, kind: "dungeon", levelRange: [1, 10],
    start: { A: [1], H: [10] }, ...overrides,
  };
}

describe("resolveSteps", () => {
  const get = lookup([quest(1, 2), quest(2, 3), quest(3, null), quest(10, null)]);

  it("follows a 3-quest chain", () => {
    expect(resolveSteps(def(), "A", get)).toEqual([1, 2, 3]);
  });

  it("uses the faction start", () => {
    expect(resolveSteps(def(), "H", get)).toEqual([10]);
  });

  it("stops at an unknown quest", () => {
    expect(resolveSteps(def({ start: { A: [3], H: [] } }), "A", lookup([quest(3, 99)]))).toEqual([3]);
  });

  it("stops on a cycle", () => {
    expect(resolveSteps(def(), "A", lookup([quest(1, 2), quest(2, 1)]))).toEqual([1, 2]);
  });

  it("concatenates several starts without duplicates", () => {
    const d = def({ start: { A: [1, 2, 10], H: [] } });
    expect(resolveSteps(d, "A", get)).toEqual([1, 2, 3, 10]);
  });

  it("returns explicit steps as-is", () => {
    const d = def({ explicitSteps: { A: [7, 8], H: [9] } });
    expect(resolveSteps(d, "A", get)).toEqual([7, 8]);
    expect(resolveSteps(d, "H", get)).toEqual([9]);
  });
});

describe("chainProgress", () => {
  it("marks the first non-completed step current", () => {
    const p = chainProgress([1, 2, 3], new Set([1]), new Set());
    expect(p.steps.map((s) => s.state)).toEqual(["done", "current", "todo"]);
    expect(p.done).toBe(1);
    expect(p.total).toBe(3);
  });

  it("prefers the earliest in-log step as current", () => {
    const p = chainProgress([1, 2, 3], new Set([1]), new Set([3]));
    expect(p.steps.map((s) => s.state)).toEqual(["done", "todo", "current"]);
  });

  it("has no current when everything is done", () => {
    const p = chainProgress([1, 2], new Set([1, 2]), new Set());
    expect(p.steps.map((s) => s.state)).toEqual(["done", "done"]);
    expect(p.done).toBe(2);
  });

  it("handles an empty chain", () => {
    expect(chainProgress([], new Set(), new Set())).toEqual({ steps: [], done: 0, total: 0 });
  });
});

describe("ACCESS_CHAINS", () => {
  it("contains the dalaran-sewers key chain", () => {
    expect(ACCESS_CHAINS).toEqual([
      {
        id: "dalaran-sewers",
        name: { frFR: "Égouts de Dalaran", enUS: "Dalaran Sewers" },
        kind: "key",
        levelRange: [28, 33],
        start: { A: [92432], H: [92432] },
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { entriesFor, entryQuests, findEntry, pruneAccessState, walkChain } from "../src/access/chains";
import { entryProgress, type AccessContext } from "../src/access/progress";
import type { AccessEntry, AccessStep } from "../src/data/generated/access";
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

function step(id: number, kind: AccessStep["kind"], ref: number, follows: number[], extra: Partial<AccessStep> = {}): AccessStep {
  return { id, kind, ref, follows, origin: "attune", ...extra };
}

function entry(steps: AccessStep[], faction: AccessEntry["faction"] = "AH"): AccessEntry {
  return { id: "t", group: "dungeon", faction, levels: null, name: { enUS: "t", frFR: "t" }, steps };
}

function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    level: 10, raceMask: 1, completed: new Set(), inLog: new Set(),
    itemCount: () => 0, repEarned: () => null, knownQuest: () => true, ...overrides,
  };
}

const states = (e: AccessEntry, c: AccessContext): string[] => entryProgress(e, c).steps.map((s) => s.state);

describe("walkChain", () => {
  const get = lookup([quest(1, 2), quest(2, 3), quest(3, null), quest(10, null)]);

  it("follows a chain and stops at unknown quests", () => {
    expect(walkChain([1], get)).toEqual([1, 2, 3]);
    expect(walkChain([3], lookup([quest(3, 99)]))).toEqual([3]);
  });

  it("stops on a cycle and concatenates starts without duplicates", () => {
    expect(walkChain([1], lookup([quest(1, 2), quest(2, 1)]))).toEqual([1, 2]);
    expect(walkChain([1, 2, 10], get)).toEqual([1, 2, 3, 10]);
  });
});

describe("generated entries", () => {
  it("filters by faction", () => {
    const ids = (f: "A" | "H") => entriesFor(f).map((e) => e.id);
    expect(ids("A")).toContain("154");
    expect(ids("A")).not.toContain("155");
    expect(ids("H")).toContain("155");
    expect(findEntry("154")?.name.enUS).toBe("Dalaran Sewer Key");
    expect(findEntry("nope")).toBeNull();
  });

  it("lists quests of pickUp, turnIn and quest steps, deduplicated, in step order", () => {
    const e = entry([
      step(10, "level", 5, []),
      step(20, "pickUp", 7, [10]),
      step(30, "item", 99, [20]),
      step(40, "turnIn", 7, [30]),
      step(50, "quest", 8, [40]),
      step(60, "kill", 3, [50]),
    ]);
    expect(entryQuests(e, 1)).toEqual([7, 8]);
  });

  it("skips steps hidden by race", () => {
    const e = entry([step(10, "quest", 7, [], { excludedRaces: 16 }), step(20, "quest", 8, [])]);
    expect(entryQuests(e, 16)).toEqual([8]);
    expect(entryQuests(e, 1)).toEqual([7, 8]);
  });
});

describe("pruneAccessState", () => {
  const prune = (trackedChains: string[], expandedChain: string | null, faction: "A" | "H" | null) => {
    const db = { trackedChains, expandedChain };
    pruneAccessState(db, faction);
    return db;
  };

  it("drops unknown ids and duplicates, keeps known ones", () => {
    expect(prune(["154", "nope", "154", "155"], "nope", "A")).toEqual({ trackedChains: ["154", "155"], expandedChain: null });
    expect(prune([], "155", "A").expandedChain).toBe("155");
  });

  it("migrates dalaran-sewers to the entry of the player faction", () => {
    expect(prune(["dalaran-sewers"], null, "A").trackedChains).toEqual(["154"]);
    expect(prune(["dalaran-sewers"], null, "H").trackedChains).toEqual(["155"]);
    expect(prune(["dalaran-sewers"], null, null).trackedChains).toEqual([]);
  });
});

describe("entryProgress", () => {
  it("pickUp is done when in the log or completed", () => {
    const e = entry([step(10, "pickUp", 1, []), step(20, "pickUp", 2, []), step(30, "pickUp", 3, [])]);
    expect(states(e, ctx({ inLog: new Set([1]), completed: new Set([2]) }))).toEqual(["done", "done", "current"]);
  });

  it("turnIn and quest are done only when completed", () => {
    const e = entry([step(10, "turnIn", 1, []), step(20, "quest", 2, [])]);
    const p = entryProgress(e, ctx({ inLog: new Set([1, 2]), completed: new Set([2]) }));
    expect(p.steps.map((s) => s.state)).toEqual(["current", "done"]);
  });

  it("item uses the count and defaults to one", () => {
    const e = entry([step(10, "item", 5, []), step(20, "item", 6, [], { count: 3 })]);
    expect(states(e, ctx({ itemCount: (id) => (id === 5 ? 1 : 2) }))).toEqual(["done", "current"]);
    expect(states(e, ctx({ itemCount: () => 3 }))).toEqual(["done", "done"]);
  });

  it("level compares the player level", () => {
    const e = entry([step(10, "level", 10, []), step(20, "level", 11, [10])]);
    expect(states(e, ctx())).toEqual(["done", "current"]);
  });

  it("kill, interact, click, prof are done when a following step is done", () => {
    const e = entry([
      step(10, "kill", 1, []), step(20, "interact", 2, []), step(30, "click", 3, []), step(40, "prof", 4, []),
      step(50, "quest", 9, [10, 20, 30, 40]),
    ]);
    expect(states(e, ctx())).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(states(e, ctx({ completed: new Set([9]) }))).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("an item is also done when a following step is done", () => {
    const e = entry([step(10, "item", 5, []), step(20, "quest", 9, [10])]);
    expect(states(e, ctx({ completed: new Set([9]) }))).toEqual(["done", "done"]);
  });

  it("rep compares earned reputation and tolerates unknown factions", () => {
    const e = entry([step(10, "rep", 529, [], { count: 3000 })]);
    expect(states(e, ctx({ repEarned: () => 2999 }))).toEqual(["current"]);
    expect(states(e, ctx({ repEarned: () => 3000 }))).toEqual(["done"]);
    expect(states(e, ctx({ repEarned: () => null }))).toEqual(["current"]);
    const neutral = entry([step(10, "rep", 529, [])]);
    expect(states(neutral, ctx({ repEarned: () => 0 }))).toEqual(["done"]);
    expect(states(neutral, ctx({ repEarned: () => -1 }))).toEqual(["current"]);
  });

  it("an orGroup counts once when any member is done", () => {
    const e = entry([
      step(10, "pickUp", 1, [], { orGroup: true }), step(20, "pickUp", 2, [], { orGroup: true }), step(30, "quest", 9, [10]),
    ]);
    const p = entryProgress(e, ctx({ inLog: new Set([2]) }));
    expect(p.steps.map((s) => s.state)).toEqual(["done", "done", "current"]);
    expect([p.done, p.total]).toEqual([1, 2]);
  });

  it("optional steps are shown but not counted", () => {
    const e = entry([step(10, "quest", 1, []), step(20, "quest", 2, [10], { optional: true })]);
    const p = entryProgress(e, ctx({ completed: new Set([1]) }));
    expect([p.done, p.total, p.complete]).toEqual([1, 1, true]);
    expect(p.steps).toHaveLength(2);
  });

  it("hides steps whose race is excluded", () => {
    const e = entry([step(10, "quest", 1, [], { excludedRaces: 16 }), step(20, "quest", 2, [])]);
    expect(entryProgress(e, ctx({ raceMask: 16 })).steps.map((s) => s.step.id)).toEqual([20]);
    expect(entryProgress(e, ctx({ raceMask: 1 })).total).toBe(2);
  });

  it("an unknown quest shows as todo", () => {
    const e = entry([step(10, "pickUp", 1, []), step(20, "quest", 2, [10])]);
    const p = entryProgress(e, ctx({ completed: new Set([1, 2]), knownQuest: (id) => id === 2 }));
    expect(p.steps.map((s) => s.state)).toEqual(["current", "done"]);
  });

  it("is complete when the end step is done, else when the last step is done", () => {
    const withEnd = entry([step(10, "quest", 1, []), step(20, "item", 5, [10]), step(30, "end", 0, [20])]);
    expect(entryProgress(withEnd, ctx({ completed: new Set([1]) })).complete).toBe(false);
    expect(entryProgress(withEnd, ctx({ completed: new Set([1]), itemCount: () => 1 })).complete).toBe(true);
    const noEnd = entry([step(10, "quest", 1, []), step(20, "quest", 2, [10])]);
    expect(entryProgress(noEnd, ctx({ completed: new Set([1]) })).complete).toBe(false);
    expect(entryProgress(noEnd, ctx({ completed: new Set([1, 2]) })).complete).toBe(true);
  });

  it("prefers the in-log step as current", () => {
    const e = entry([step(10, "quest", 1, []), step(20, "quest", 2, [])]);
    expect(states(e, ctx({ inLog: new Set([2]) }))).toEqual(["todo", "current"]);
  });

  it("handles an empty entry", () => {
    const p = entryProgress(entry([]), ctx());
    expect([p.steps, p.done, p.total, p.complete]).toEqual([[], 0, 0, false]);
  });
});

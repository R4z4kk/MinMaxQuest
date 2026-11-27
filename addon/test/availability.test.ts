import { describe, expect, it } from "vitest";
import type { QuestInfo } from "../src/data/questRepository";
import { isAvailable, isTrivial, passesMaxLevelOption, type PlayerQuestState } from "../src/quests/availability";

function quest(overrides: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id: 100, name: "Q", level: 10, requiredLevel: 8, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
    ...overrides,
  };
}

function player(overrides: Partial<PlayerQuestState> = {}): PlayerQuestState {
  return { level: 10, raceMask: 1, classMask: 1, completed: new Set(), inLog: new Set(), ...overrides };
}

describe("isAvailable", () => {
  it("accepts a quest with all requirements met", () => {
    const q = quest({ preGroup: [1, 2], preSingle: [3, 4], exclusiveTo: [5] });
    expect(isAvailable(q, player({ completed: new Set([1, 2, 4]) }))).toBe(true);
  });

  it("rejects below required level", () => {
    expect(isAvailable(quest(), player({ level: 7 }))).toBe(false);
  });

  it("rejects above required max level", () => {
    expect(isAvailable(quest({ requiredMaxLevel: 12 }), player({ level: 13 }))).toBe(false);
  });

  it("rejects when a preGroup quest is missing", () => {
    expect(isAvailable(quest({ preGroup: [1, 2] }), player({ completed: new Set([1]) }))).toBe(false);
  });

  it("rejects when no preSingle quest is completed", () => {
    expect(isAvailable(quest({ preSingle: [3, 4] }), player())).toBe(false);
  });

  it("rejects when an exclusive quest is completed or in log", () => {
    const q = quest({ exclusiveTo: [5] });
    expect(isAvailable(q, player({ completed: new Set([5]) }))).toBe(false);
    expect(isAvailable(q, player({ inLog: new Set([5]) }))).toBe(false);
  });

  it("rejects completed and in-log quests", () => {
    expect(isAvailable(quest(), player({ completed: new Set([100]) }))).toBe(false);
    expect(isAvailable(quest(), player({ inLog: new Set([100]) }))).toBe(false);
  });

  it("checks race and class masks, 0 meaning any", () => {
    expect(isAvailable(quest({ races: 2 }), player({ raceMask: 1 }))).toBe(false);
    expect(isAvailable(quest({ races: 3 }), player({ raceMask: 2 }))).toBe(true);
    expect(isAvailable(quest({ classes: 4 }), player({ classMask: 8 }))).toBe(false);
    expect(isAvailable(quest({ classes: 0 }), player({ classMask: 8 }))).toBe(true);
  });

  it("handles masks above 2^31", () => {
    expect(isAvailable(quest({ races: 2 ** 33 }), player({ raceMask: 2 ** 33 + 1 }))).toBe(true);
  });

  it("rejects unsupported requirements", () => {
    expect(isAvailable(quest({ hasUnsupportedRequirement: true }), player())).toBe(false);
  });
});

describe("isTrivial", () => {
  it("is grey beyond the green range", () => {
    expect(isTrivial(quest({ level: 10 }), player({ level: 16 }), 5)).toBe(true);
    expect(isTrivial(quest({ level: 10 }), player({ level: 14 }), 5)).toBe(false);
  });
});

describe("passesMaxLevelOption", () => {
  it("requires quest level <= player level - gap", () => {
    expect(passesMaxLevelOption(quest({ level: 15 }), player({ level: 15 }), 2)).toBe(false);
    expect(passesMaxLevelOption(quest({ level: 13 }), player({ level: 15 }), 2)).toBe(true);
  });

  it("passes when the option is off", () => {
    expect(passesMaxLevelOption(quest({ level: 60 }), player({ level: 1 }), null)).toBe(true);
  });
});

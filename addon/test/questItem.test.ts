import { describe, expect, it } from "vitest";
import { questItemFor, type ItemDeps } from "../src/arrow/questItem";
import type { QuestInfo } from "../src/data/questRepository";

function quest(sourceItemId: number | null, requiredSourceItems: number[]): QuestInfo {
  return {
    id: 1,
    name: "Q",
    level: 1,
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
    baseXp: null,
    hasUnsupportedRequirement: false,
    isElite: false,
    zoneAreaId: null,
    sourceItemId,
    requiredSourceItems,
  };
}

function deps(bags: Record<number, number>, usable: number[]): ItemDeps {
  return { count: (id) => bags[id] ?? 0, usable: (id) => usable.includes(id) };
}

describe("questItemFor", () => {
  it("picks the source item first", () => {
    expect(questItemFor(quest(10, [20]), deps({ 10: 1, 20: 1 }, [10, 20]))).toBe(10);
  });

  it("skips a source item that is not in the bags or not usable", () => {
    expect(questItemFor(quest(10, [20]), deps({ 20: 1 }, [10, 20]))).toBe(20);
    expect(questItemFor(quest(10, [20]), deps({ 10: 1, 20: 1 }, [20]))).toBe(20);
  });

  it("takes the required items in order", () => {
    expect(questItemFor(quest(null, [20, 30, 40]), deps({ 30: 2, 40: 1 }, [30, 40]))).toBe(30);
  });

  it("returns null without a usable bag item or a quest", () => {
    expect(questItemFor(quest(10, [20]), deps({ 10: 1, 20: 1 }, []))).toBeNull();
    expect(questItemFor(quest(null, []), deps({}, []))).toBeNull();
    expect(questItemFor(null, deps({}, []))).toBeNull();
  });
});

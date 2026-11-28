import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import type { QuestInfo } from "../src/data/questRepository";
import type { EmittedStep } from "../src/route/format";
import { chainBlock, insertBlocks, type InsertBlock, type PlaceFor } from "../src/route/insert";

const toWorld = (map: number, x: number, y: number): WorldPos | null => (map === 99 ? null : { continent: map, x, y });

const at = (x: number, extra: Partial<EmittedStep> = {}): EmittedStep => ({
  type: "complete", uiMapId: 1, x, y: 0, targetLevel: 10, targetXpIntoLevel: 7, estCostSeconds: 30, estXpGain: 100, ...extra,
});

const block = (x: number, minLevel: number, questId: number): InsertBlock => ({
  steps: [at(x, { type: "accept", questId, targetLevel: 0, targetXpIntoLevel: 0 }), at(x + 1, { type: "turnin", questId })],
  minLevel,
});

const ids = (steps: EmittedStep[]): (number | undefined)[] => steps.map((s) => s.questId);

function info(id: number, extra: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id, name: "Q" + id, level: 1, requiredLevel: 1, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false, isElite: false, zoneAreaId: null, ...extra,
  };
}

describe("insertBlocks", () => {
  const route = [at(0, { questId: 1 }), at(10, { questId: 2 }), at(1000, { questId: 3 }), at(1010, { questId: 4 })];

  it("places a block next to the nearer group", () => {
    const out = insertBlocks(route, 0, [block(1005, 1, 50)], toWorld);
    expect(ids(out)).toEqual([1, 2, 3, 50, 50, 4]);
  });

  it("neutral steps take the neighbour level and zero cost", () => {
    const out = insertBlocks(route, 0, [block(12, 1, 50)], toWorld);
    expect(out[2]).toMatchObject({ questId: 50, targetLevel: 10, targetXpIntoLevel: 7, estCostSeconds: 0, estXpGain: 0 });
  });

  it("minLevel forbids an earlier, cheaper position", () => {
    const leveled = [at(0, { targetLevel: 5 }), at(10, { questId: 2, targetLevel: 5 }), at(15, { questId: 3, targetLevel: 8 }), at(1010, { questId: 4, targetLevel: 8 })];
    const out = insertBlocks(leveled, 0, [block(12, 8, 50)], toWorld);
    expect(ids(out)).toEqual([undefined, 2, 3, 50, 50, 4]);
  });

  it("never inserts at or before from", () => {
    const out = insertBlocks(route, 2, [block(0, 1, 50)], toWorld);
    expect(ids(out).indexOf(50)).toBeGreaterThan(2);
  });

  it("keeps the relative order of two blocks", () => {
    const out = insertBlocks(route, 0, [block(12, 1, 50), block(13, 1, 51)], toWorld);
    expect(ids(out).filter((q) => q === 50 || q === 51)).toEqual([50, 50, 51, 51]);
  });

  it("appends an unconvertible block at the end", () => {
    const lost: InsertBlock = { steps: [at(5, { uiMapId: 99, questId: 60 })], minLevel: 1 };
    const out = insertBlocks(route, 0, [lost], toWorld);
    expect(ids(out)).toEqual([1, 2, 3, 4, 60]);
    expect(out[4].targetLevel).toBe(10);
  });

  it("picks the earliest position on a tie", () => {
    const flat = [at(0, { questId: 1 }), at(10, { questId: 2 }), at(20, { questId: 3 })];
    const out = insertBlocks(flat, 0, [{ steps: [at(10, { questId: 50 })], minLevel: 1 }], toWorld);
    expect(ids(out)).toEqual([1, 50, 2, 3]);
  });

  it("allows insertion right after from", () => {
    const out = insertBlocks(route, 0, [block(0, 1, 50)], toWorld);
    expect(ids(out)).toEqual([1, 50, 50, 2, 3, 4]);
  });

  it("lands before leaving the continent", () => {
    const hop = [at(0, { uiMapId: 1, questId: 1 }), at(100, { uiMapId: 1, questId: 2 }), at(0, { uiMapId: 2, questId: 3 })];
    const out = insertBlocks(hop, 0, [block(105, 1, 50)], toWorld);
    expect(ids(out)).toEqual([1, 2, 50, 50, 3]);
  });

  it("does not mutate its inputs", () => {
    const b = block(12, 1, 50);
    insertBlocks(route, 0, [b], toWorld);
    expect(route).toHaveLength(4);
    expect(b.steps[0].targetLevel).toBe(0);
  });
});

describe("chainBlock", () => {
  const place: PlaceFor = (q, kind, index) => ({ uiMapId: 1, x: q.id * 10 + (index ?? 0), y: 0 + (kind === "turnin" ? 1 : 0) });
  const quests = new Map<number, QuestInfo>([
    [1, info(1, { requiredLevel: 20, objectives: [{ kind: "npc", id: 5, required: 1, index: 1 }, { kind: "item", id: 6, required: 1, index: 2 }] })],
    [2, info(2, { requiredLevel: 25 })],
    [3, info(3)],
  ]);
  const get = (id: number): QuestInfo | null => quests.get(id) ?? null;

  it("emits accept, one complete per objective, turnin, in chain order", () => {
    const r = chainBlock([1, 2], get, place);
    expect(r.unplaceable).toBe(0);
    expect(r.block.steps.map((s) => s.type + (s.objectiveIndex ?? ""))).toEqual(["accept", "complete1", "complete2", "turnin", "accept", "turnin"]);
    expect(r.block.minLevel).toBe(25);
  });

  it("emits no complete step for non-placeable objectives", () => {
    const mixed = new Map(quests).set(4, info(4, { objectives: [{ kind: "npc", id: 5, required: 1, index: 1 }, { kind: "event", index: 2 }] }));
    const r = chainBlock([4], (id) => mixed.get(id) ?? null, place);
    expect(r.unplaceable).toBe(0);
    expect(r.block.steps.map((s) => s.type + (s.objectiveIndex ?? ""))).toEqual(["accept", "complete1", "turnin"]);
  });

  it("skips quests already in the route", () => {
    const r = chainBlock([1, 2], get, place, new Set([1]));
    expect(ids(r.block.steps)).toEqual([2, 2]);
    expect(r.block.minLevel).toBe(25);
  });

  it("drops a quest with an unplaceable objective and counts it", () => {
    const r = chainBlock([1, 2], get, (q, kind, i) => (q.id === 1 && kind === "objective" && i === 2 ? null : place(q, kind, i)));
    expect(ids(r.block.steps)).toEqual([2, 2]);
    expect(r.unplaceable).toBe(1);
  });

  it("counts an unknown quest as unplaceable", () => {
    const r = chainBlock([9, 3], get, place);
    expect(r.unplaceable).toBe(1);
    expect(ids(r.block.steps)).toEqual([3, 3]);
  });
});

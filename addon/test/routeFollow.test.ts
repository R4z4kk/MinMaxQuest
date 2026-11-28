import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import type { QuestInfo } from "../src/data/questRepository";
import type { PlayerQuestState } from "../src/quests/availability";
import type { EmittedStep, StepType } from "../src/route/format";
import { follow } from "../src/route/follow";
import type { ProgressContext, RouteCursor } from "../src/route/progress";

const step = (type: StepType, extra: Partial<EmittedStep> = {}): EmittedStep => ({
  type, uiMapId: 1, x: 0, y: 0, targetLevel: 1, targetXpIntoLevel: 0, estCostSeconds: 5, estXpGain: 0, ...extra,
});

function info(id: number): QuestInfo {
  return {
    id, name: "Q" + id, level: 1, requiredLevel: 1, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false, isElite: false, zoneAreaId: null,
  };
}

const quest = (id: number): QuestInfo | null => info(id);

function context(extra: Partial<ProgressContext> = {}): ProgressContext {
  return {
    completed: new Set(), log: new Map(), level: 5, xpIntoLevel: 0, knownTaxi: new Set(),
    pos: null, bindPos: null, hearthBoundWhileCurrent: false,
    toWorld: (_map, x, y): WorldPos => ({ continent: 0, x, y }),
    taxiPos: () => null,
    ...extra,
  };
}

function player(c: ProgressContext): PlayerQuestState {
  return { level: c.level, raceMask: 1, classMask: 1, completed: c.completed, inLog: new Set(c.log.keys()) };
}

// Positions are in seconds from the player at the origin.
const timeTo = (p: WorldPos): number => Math.hypot(p.x, p.y);
const between = (a: WorldPos, b: WorldPos): number => Math.hypot(a.x - b.x, a.y - b.y);
// Quest 7 is ready to turn in, quest 9 still has its objective to do.
const inLog = () => new Map([[7, { complete: true, objectivesDone: new Set([1]) }], [9, { complete: false, objectivesDone: new Set<number>() }]]);
const kill = (x: number, extra: Partial<EmittedStep> = {}): EmittedStep => step("complete", { x, questId: 9, objectiveIndex: 1, targetLevel: 5, ...extra });
const quest7 = (type: StepType, x: number, extra: Partial<EmittedStep> = {}): EmittedStep => step(type, { x, questId: 7, objectiveIndex: 1, targetLevel: 5, ...extra });
const at = (seconds: number, extra: Partial<EmittedStep> = {}): EmittedStep => step("fly", { x: seconds, taxiNodeId: 1, targetLevel: 5, ...extra });

interface Options {
  current?: number;
  removed?: number[];
  skipped?: number[];
  ctx?: ProgressContext;
  realizable?: (i: number) => boolean;
  maxLevel?: number;
}

function run(steps: EmittedStep[], opts: Options = {}) {
  const ctx = opts.ctx ?? context();
  const cursor: RouteCursor = { current: opts.current ?? 0, removed: new Set(opts.removed ?? []) };
  return follow(steps, cursor, ctx, timeTo, between, opts.realizable ?? (() => true), opts.maxLevel ?? 60, quest, player(ctx), 0, new Set(opts.skipped ?? []));
}

describe("target", () => {
  it("is current when it is near", () => {
    expect(run([at(10), at(1), at(2)]).target).toBe(0);
  });

  it("jumps to a window step much closer than a far current", () => {
    expect(run([at(300), at(200), at(30)]).target).toBe(2);
  });

  it("stays on current when the gain is under the threshold", () => {
    expect(run([at(300), at(260)]).target).toBe(0);
  });

  it("ignores unrealizable steps", () => {
    expect(run([at(300), at(30), at(200)], { realizable: (i) => i !== 1 }).target).toBe(2);
    expect(run([at(300), at(30)], { realizable: (i) => i !== 1 }).target).toBe(0);
  });

  it("ignores steps beyond the window", () => {
    const steps = [at(300), ...Array.from({ length: 15 }, () => at(290)), at(10)];
    expect(run(steps).target).toBe(0);
  });

  it("takes the last step inside the window", () => {
    const steps = [at(300), ...Array.from({ length: 14 }, () => at(290)), at(10)];
    expect(run(steps).target).toBe(15);
  });

  it("ignores removed and skipped steps", () => {
    expect(run([at(300), at(10), at(20)], { removed: [1], skipped: [2] }).target).toBe(0);
  });

  it("ignores done steps", () => {
    const ctx = context({ knownTaxi: new Set([9]) });
    const steps = [at(300), step("getFlightPath", { x: 5, taxiNodeId: 9 }), at(100)];
    expect(run(steps, { ctx }).target).toBe(2);
  });

  it("goes to the earliest of tied candidates", () => {
    expect(run([at(300), at(30), at(30)]).target).toBe(1);
  });

  it("stays on a current step exactly 120 s away", () => {
    expect(run([at(120), at(10)]).target).toBe(0);
  });

  it("switches for a gain of exactly 60 s", () => {
    expect(run([at(200), at(140)]).target).toBe(1);
  });

  it("aims at the nearest doable step when the near current one cannot be done yet", () => {
    expect(run([at(30), at(50), at(40), at(45)], { realizable: (i) => i !== 0 }).target).toBe(2);
  });

  it("keeps a current step that cannot be done yet when nothing in the window can", () => {
    expect(run([at(30), at(50)], { realizable: () => false }).target).toBe(0);
  });

  it("goes to a nearer quest step on the way to a near current", () => {
    const ctx = context({ log: inLog() });
    expect(run([step("accept", { x: 50, questId: 8, targetLevel: 5 }), quest7("turnin", 30)], { ctx }).target).toBe(1);
  });

  it("picks the nearest of the quest steps on the way", () => {
    const ctx = context({ log: inLog() });
    expect(run([at(50), quest7("turnin", 30), kill(10)], { ctx }).target).toBe(2);
  });

  it("accepts a detour of up to 10 s for a quest step", () => {
    const ctx = context({ log: inLog() });
    expect(run([at(50), quest7("turnin", -5)], { ctx }).target).toBe(1);
    expect(run([at(50), quest7("turnin", -6)], { ctx }).target).toBe(0);
  });

  it("stays on a near current when the nearer quest step is off the way", () => {
    const ctx = context({ log: inLog() });
    expect(run([at(50), quest7("turnin", 0, { y: 30 })], { ctx }).target).toBe(0);
  });

  it("never leaves a near current for a travel step on the way", () => {
    expect(run([at(50), at(30)]).target).toBe(0);
  });

  it("measures an objective step to the spawn nearest the player", () => {
    const ctx = context({ log: inLog(), pos: { continent: 0, x: 0, y: 0 } });
    expect(run([at(50), kill(100, { loop: [[100, 0], [5, 0]] })], { ctx }).target).toBe(1);
  });
});

describe("next", () => {
  it("lists up to 3 following todo steps", () => {
    expect(run([at(1), at(1), at(1), at(1), at(1)]).next).toEqual([1, 2, 3]);
  });

  it("skips removed, skipped and done steps", () => {
    const ctx = context({ knownTaxi: new Set([9]) });
    const steps = [at(1), at(1), at(1), step("getFlightPath", { taxiNodeId: 9, targetLevel: 5 }), at(1), at(1)];
    expect(run(steps, { ctx, removed: [1], skipped: [2] }).next).toEqual([4, 5]);
  });
});

describe("levelGap", () => {
  it("is null at a gap of 3", () => {
    expect(run([at(1, { targetLevel: 8 })]).levelGap).toBeNull();
  });

  it("is set at a gap of 4", () => {
    expect(run([at(1, { targetLevel: 9 })]).levelGap).toBe(-4);
    expect(run([at(1, { targetLevel: 1 })]).levelGap).toBe(4);
  });
});

describe("remainingSeconds", () => {
  it("sums only not-done steps from current", () => {
    const ctx = context({ knownTaxi: new Set([9]) });
    const steps = [at(1, { estCostSeconds: 10 }), step("getFlightPath", { taxiNodeId: 9, estCostSeconds: 99 }), at(1, { estCostSeconds: 7 }), at(1, { estCostSeconds: 3 })];
    expect(run(steps, { ctx, skipped: [3] }).remainingSeconds).toBe(17);
    expect(run(steps, { ctx, current: 2 }).remainingSeconds).toBe(10);
  });
});

describe("finished", () => {
  it("is true at the end of the route", () => {
    expect(run([at(1)], { current: 1 })).toEqual({ target: null, current: null, next: [], levelGap: null, remainingSeconds: 0, finished: true });
  });

  it("is true at the max level", () => {
    const view = run([at(1)], { ctx: context({ level: 60 }) });
    expect(view.finished).toBe(true);
    expect(view.target).toBeNull();
  });

  it("is false otherwise", () => {
    expect(run([at(1)]).finished).toBe(false);
  });
});

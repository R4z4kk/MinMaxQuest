import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import type { QuestInfo } from "../src/data/questRepository";
import type { PlayerQuestState } from "../src/quests/availability";
import type { EmittedStep, StepType } from "../src/route/format";
import { advance, resyncIndex, stepStatus, type ProgressContext } from "../src/route/progress";

const step = (type: StepType, extra: Partial<EmittedStep> = {}): EmittedStep => ({
  type, uiMapId: 1, x: 0, y: 0, targetLevel: 1, targetXpIntoLevel: 0, estCostSeconds: 5, estXpGain: 0, ...extra,
});
const q = (type: StepType, questId: number, extra: Partial<EmittedStep> = {}): EmittedStep => step(type, { questId, ...extra });

function info(id: number, extra: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id, name: "Q" + id, level: 1, requiredLevel: 1, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
    ...extra,
  };
}

function lookup(...quests: QuestInfo[]): (id: number) => QuestInfo | null {
  const byId = new Map<number, QuestInfo>();
  for (const quest of quests) byId.set(quest.id, quest);
  return (id) => byId.get(id) ?? null;
}

const at = (x: number, y: number): WorldPos => ({ continent: 0, x, y });

function context(extra: Partial<ProgressContext> = {}): ProgressContext {
  const taxis = new Map<number, WorldPos>([[7, at(1000, 1000)]]);
  return {
    completed: new Set(), log: new Map(), level: 1, xpIntoLevel: 0, knownTaxi: new Set(),
    pos: null, bindPos: null, hearthBoundWhileCurrent: false,
    toWorld: (uiMapId, x, y) => ({ continent: 0, x: x * 10, y: y * 10 }),
    taxiPos: (nodeId) => taxis.get(nodeId) ?? null,
    ...extra,
  };
}

function player(c: ProgressContext, extra: Partial<PlayerQuestState> = {}): PlayerQuestState {
  return { level: c.level, raceMask: 1, classMask: 1, completed: c.completed, inLog: new Set(c.log.keys()), ...extra };
}

const entry = (complete: boolean, done: number[] = []): { complete: boolean; objectivesDone: Set<number> } => ({ complete, objectivesDone: new Set(done) });
const QUESTS = lookup(info(1), info(2), info(3));
const status = (steps: EmittedStep[], i: number, c: ProgressContext, quests = QUESTS): string => stepStatus(steps, i, c, quests, player(c));

describe("own conditions", () => {
  it("accept: in the log or completed", () => {
    const steps = [q("accept", 1)];
    expect(status(steps, 0, context())).toBe("todo");
    expect(status(steps, 0, context({ log: new Map([[1, entry(false)]]) }))).toBe("done");
    expect(status(steps, 0, context({ completed: new Set([1]) }))).toBe("done");
  });

  it("complete: objective done in the log, or quest completed", () => {
    const steps = [q("accept", 1), q("complete", 1, { objectiveIndex: 2 })];
    expect(status(steps, 1, context({ log: new Map([[1, entry(false, [1])]]) }))).toBe("todo");
    expect(status(steps, 1, context({ log: new Map([[1, entry(false, [2])]]) }))).toBe("done");
    expect(status(steps, 1, context({ log: new Map([[1, entry(true)]]) }))).toBe("done");
    expect(status(steps, 1, context({ completed: new Set([1]) }))).toBe("done");
  });

  it("turnin: completed only", () => {
    const steps = [q("turnin", 1)];
    expect(status(steps, 0, context({ log: new Map([[1, entry(true)]]) }))).toBe("todo");
    expect(status(steps, 0, context({ completed: new Set([1]) }))).toBe("done");
  });

  it("getFlightPath: the node is known", () => {
    const steps = [step("getFlightPath", { taxiNodeId: 7 })];
    expect(status(steps, 0, context())).toBe("todo");
    expect(status(steps, 0, context({ knownTaxi: new Set([7]) }))).toBe("done");
  });

  it("grind: level and xp into level reached", () => {
    const steps = [step("grind", { targetLevel: 5, targetXpIntoLevel: 300 })];
    expect(status(steps, 0, context({ level: 5, xpIntoLevel: 299 }))).toBe("todo");
    expect(status(steps, 0, context({ level: 5, xpIntoLevel: 300 }))).toBe("done");
  });

  it("grind to a level already reached is done", () => {
    const steps = [step("grind", { targetLevel: 5, targetXpIntoLevel: 300 })];
    expect(status(steps, 0, context({ level: 6, xpIntoLevel: 0 }))).toBe("done");
  });

  it("dungeon: quests accepted before and turned in after have their objectives done", () => {
    const steps = [q("accept", 1), q("accept", 2), q("accept", 3), step("dungeon"), q("turnin", 1), q("turnin", 2), q("turnin", 3)];
    const pending = context({ log: new Map([[1, entry(true)], [2, entry(false)], [3, entry(true)]]) });
    expect(status(steps, 3, pending)).toBe("todo");
    const ready = context({ log: new Map([[1, entry(true)], [3, entry(true)]]), completed: new Set([2]) });
    expect(status(steps, 3, ready)).toBe("done");
  });

  it("fly: within 150 yd of the destination node", () => {
    const steps = [step("fly", { taxiNodeId: 7 })];
    expect(status(steps, 0, context({ pos: at(1000, 1200) }))).toBe("todo");
    expect(status(steps, 0, context({ pos: at(1000, 1100) }))).toBe("done");
  });

  it("hearth: within 150 yd of the bind location", () => {
    const steps = [step("hearth")];
    expect(status(steps, 0, context({ pos: at(0, 0), bindPos: at(500, 0) }))).toBe("todo");
    expect(status(steps, 0, context({ pos: at(0, 0), bindPos: at(100, 0) }))).toBe("done");
  });

  it("setHearth: bound while current, or bind location at the step place", () => {
    const steps = [step("setHearth", { x: 50, y: 50 })];
    expect(status(steps, 0, context({ bindPos: at(0, 0) }))).toBe("todo");
    expect(status(steps, 0, context({ hearthBoundWhileCurrent: true }))).toBe("done");
    expect(status(steps, 0, context({ bindPos: at(500, 450) }))).toBe("done");
  });
});

describe("later turn-ins", () => {
  const steps = [step("fly", { taxiNodeId: 7 }), step("hearth"), step("grind", { targetLevel: 9 }), q("accept", 1), q("turnin", 2)];

  it("a later turnin makes earlier travel and grind steps done", () => {
    const c = context({ completed: new Set([2]) });
    expect([0, 1, 2].map((i) => status(steps, i, c))).toEqual(["done", "done", "done"]);
  });

  it("a later accept does not", () => {
    const c = context({ log: new Map([[1, entry(false)]]) });
    expect([0, 1, 2].map((i) => status(steps, i, c))).toEqual(["todo", "todo", "todo"]);
  });
});

describe("impossible steps", () => {
  it("a quest missing from the database is impossible", () => {
    expect(status([q("accept", 99)], 0, context())).toBe("impossible");
  });

  it("a race or class excluded quest is impossible", () => {
    const quests = lookup(info(1, { races: 2 }), info(2, { classes: 4 }));
    expect(status([q("accept", 1)], 0, context(), quests)).toBe("impossible");
    expect(status([q("accept", 2)], 0, context(), quests)).toBe("impossible");
  });

  it("a level-locked accept stays todo", () => {
    expect(status([q("accept", 1)], 0, context(), lookup(info(1, { requiredLevel: 10 })))).toBe("todo");
  });

  it("a prerequisite still to do stays todo, an impossible one makes it impossible", () => {
    const quests = lookup(info(1), info(2, { preGroup: [1] }), info(3, { preSingle: [4] }));
    expect(status([q("accept", 2)], 0, context(), quests)).toBe("todo");
    expect(status([q("accept", 3)], 0, context(), quests)).toBe("impossible");
  });

  it("complete or turnin of a quest not in the log yet is todo", () => {
    const steps = [q("accept", 1), q("complete", 1), q("turnin", 1)];
    expect(status(steps, 1, context())).toBe("todo");
    expect(status(steps, 2, context())).toBe("todo");
  });
});

describe("advance", () => {
  const none = new Set<number>();

  it("returns the first todo step from the start index", () => {
    const steps = [q("accept", 1), q("accept", 2), q("turnin", 1)];
    const c = context({ log: new Map([[1, entry(false)]]) });
    expect(advance(steps, 0, none, none, c, QUESTS, player(c))).toEqual({ current: 1, removed: new Set() });
  });

  it("ignores skipped steps and returns the route length when all is done", () => {
    const steps = [q("accept", 1), q("accept", 2)];
    const c = context({ log: new Map([[1, entry(false)]]) });
    expect(advance(steps, 0, new Set([1]), none, c, QUESTS, player(c)).current).toBe(2);
  });

  it("an abandoned quest moves the cursor back to its accept", () => {
    const steps = [q("accept", 1), q("accept", 2), q("complete", 1), q("turnin", 2)];
    const before = context({ log: new Map([[1, entry(false)], [2, entry(false)]]) });
    expect(advance(steps, 0, none, none, before, QUESTS, player(before)).current).toBe(2);
    const after = context({ log: new Map([[2, entry(false)]]) });
    expect(advance(steps, 0, none, none, after, QUESTS, player(after)).current).toBe(0);
  });

  it("removes an exclusive quest already completed with its follow-up", () => {
    const quests = lookup(info(1), info(2, { exclusiveTo: [1] }), info(3, { preGroup: [2] }), info(4));
    const steps = [q("accept", 2), q("turnin", 2, { unlocks: [3] }), q("accept", 3), q("turnin", 3), q("accept", 4)];
    const c = context({ completed: new Set([1]) });
    expect(advance(steps, 0, none, none, c, quests, player(c))).toEqual({ current: 4, removed: new Set([0, 1, 2, 3]) });
  });

  it("removes skipped quests and their unlocks transitively", () => {
    const quests = lookup(info(1), info(2), info(3), info(4));
    const steps = [q("accept", 1), q("turnin", 1, { unlocks: [2] }), q("accept", 2), q("turnin", 2, { unlocks: [3] }), q("accept", 3), q("accept", 4)];
    const c = context();
    expect(advance(steps, 0, none, new Set([1]), c, quests, player(c))).toEqual({ current: 5, removed: new Set([0, 1, 2, 3, 4]) });
  });

  it("keeps a level-locked accept as current", () => {
    const steps = [q("accept", 1), q("accept", 2)];
    const c = context();
    expect(advance(steps, 0, none, none, c, lookup(info(1, { requiredLevel: 10 }), info(2)), player(c)).current).toBe(0);
  });
});

describe("resyncIndex", () => {
  const steps = [3, 4, 5, 6, 7].map((targetLevel) => step("grind", { targetLevel }));

  it("picks the first step at level minus one from the given index", () => {
    expect(resyncIndex(steps, 6, 0)).toBe(2);
    expect(resyncIndex(steps, 6, 3)).toBe(3);
  });

  it("falls back to the last index", () => {
    expect(resyncIndex(steps, 20, 0)).toBe(4);
  });
});

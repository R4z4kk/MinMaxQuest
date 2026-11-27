import { beforeAll, describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import { setLocale } from "../src/core/l10n";
import { loadCharDb } from "../src/core/storage";
import type { QuestInfo } from "../src/data/questRepository";
import { createEngine, type PlayerSnapshot } from "../src/game/engine";
import { lostXp } from "../src/quests/followUps";
import type { Target } from "../src/targets/completion";
import type { TravelHop } from "../src/travel/graph";

const at = (x: number, y = 0): WorldPos => ({ continent: 0, x, y });

function quest(id: number, over: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id, name: `Q${id}`, level: 10, requiredLevel: 1, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 1000, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
    ...over,
  };
}

function target(questId: number, over: Partial<Target> = {}): Target {
  return {
    questId, kind: "accept", objectiveIndex: null, pos: at(questId * 10), cluster: null, otherSpots: 0, seconds: questId,
    questLevel: 10, trivial: false, elite: false, zoneAreaId: null, ...over,
  };
}

function snapshot(): PlayerSnapshot {
  return {
    pos: at(0),
    state: { level: 10, raceMask: 1, classMask: 1, completed: new Set(), inLog: new Set() },
    log: new Map(),
    greenRange: 5,
    faction: "A",
    hearth: { ready: false, pos: null },
    maxLevel: 60,
  };
}

function setup(initial: Target[], quests: QuestInfo[] = []) {
  const world = {
    clock: 0,
    snap: snapshot() as PlayerSnapshot | null,
    list: initial,
    hop: null as TravelHop | null,
    completionCalls: 0,
    changes: 0,
    taxi: false,
    ms: 0,
    msStep: 0,
  };
  const byId = new Map(quests.map((q) => [q.id, q]));
  const db = loadCharDb(null);
  const engine = createEngine(
    {
      now: () => world.clock,
      readPlayer: () => world.snap,
      readPosition: () => world.snap?.pos ?? null,
      completion: () => {
        world.completionCalls++;
        return world.list;
      },
      firstHop: () => world.hop,
      getQuest: (id) => byId.get(id) ?? null,
      allQuests: () => quests,
      onTargets: () => {},
      onTaxi: () => world.taxi,
      clockMs: () => (world.ms += world.msStep),
    },
    db,
  );
  engine.onChange(() => world.changes++);
  return { engine, db, world };
}

beforeAll(() => setLocale("enUS"));

describe("refreshTargets", () => {
  it("runs completion at most once per 2 s without force", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(false);
    world.clock = 1.9;
    engine.refreshTargets(false);
    expect(world.completionCalls).toBe(1);
    world.clock = 2;
    if (world.snap != null) world.snap.pos = at(20);
    engine.refreshTargets(false);
    expect(world.completionCalls).toBe(2);
  });

  it("skips an unforced refresh while the player stays within 10 yards", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(false);
    world.clock = 5;
    if (world.snap != null) world.snap.pos = at(9);
    engine.refreshTargets(false);
    expect(world.completionCalls).toBe(1);
    if (world.snap != null) world.snap.pos = at(11);
    engine.refreshTargets(false);
    expect(world.completionCalls).toBe(2);
    world.clock = 5.1;
    engine.refreshTargets(true);
    expect(world.completionCalls).toBe(3);
  });

  it("skips unforced refreshes on a taxi but still runs forced ones", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(false);
    world.taxi = true;
    world.clock = 5;
    if (world.snap != null) world.snap.pos = at(500);
    engine.refreshTargets(false);
    expect(world.completionCalls).toBe(1);
    engine.refreshTargets(true);
    expect(world.completionCalls).toBe(2);
  });

  it("measures the first and the last full refresh", () => {
    const { engine, world } = setup([target(1)]);
    expect(engine.profile()).toEqual({ first: null, last: null });
    world.msStep = 4;
    engine.refreshTargets(true);
    world.msStep = 1;
    engine.refreshTargets(true);
    expect(engine.profile()).toEqual({ first: 4, last: 1 });
  });

  it("bypasses the throttle when forced", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(false);
    world.clock = 0.1;
    engine.refreshTargets(true);
    expect(world.completionCalls).toBe(2);
  });

  it("refreshTargets with null player position keeps previous list", () => {
    const { engine, world } = setup([target(1), target(2)]);
    engine.refreshTargets(true);
    world.snap = { ...snapshot(), pos: null };
    world.list = [target(3)];
    engine.refreshTargets(true);
    expect(engine.targets().map((t) => t.questId)).toEqual([1, 2]);
    expect(world.completionCalls).toBe(1);
  });

  it("keeps the previous list when the player cannot be read", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(true);
    world.snap = null;
    engine.refreshTargets(true);
    expect(engine.targets().map((t) => t.questId)).toEqual([1]);
  });

  it("excludes skipped quests", () => {
    const { engine, db } = setup([target(1), target(2)]);
    db.skippedQuests.push(1);
    engine.refreshTargets(true);
    expect(engine.targets().map((t) => t.questId)).toEqual([2]);
    expect(engine.current()?.questId).toBe(2);
  });

  it("notifies only when the list or current target changes", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(true);
    engine.refreshTargets(true);
    expect(world.changes).toBe(1);
    world.list = [target(1, { seconds: 50 })];
    engine.refreshTargets(true);
    expect(world.changes).toBe(2);
  });
});

describe("pin", () => {
  it("notifies listeners on pin and unpin even when the current target is unchanged", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(true);
    const before = world.changes;
    engine.pin(1);
    expect(world.changes).toBe(before + 1);
    engine.pin(null);
    expect(world.changes).toBe(before + 2);
  });

  it("notifies listeners when skipping clears the pin", () => {
    const { engine, world } = setup([target(1), target(2)], [quest(1), quest(2)]);
    engine.refreshTargets(true);
    engine.pin(2);
    const before = world.changes;
    engine.skip(2, false);
    expect(world.changes).toBeGreaterThan(before);
  });

  it("recomputes the targets on pin and unpin so filters can let the pinned quest through", () => {
    const { engine, world } = setup([target(1)]);
    engine.refreshTargets(true);
    world.list = [target(1), target(7)];
    engine.pin(7);
    expect(world.completionCalls).toBe(2);
    expect(engine.current()?.questId).toBe(7);
    engine.pin(null);
    expect(world.completionCalls).toBe(3);
  });

  it("makes current the best target of the pinned quest", () => {
    const { engine, db } = setup([target(1), target(7, { seconds: 2 }), target(7, { seconds: 3, kind: "turnin" })]);
    engine.refreshTargets(true);
    engine.pin(7);
    expect(db.pinnedQuestId).toBe(7);
    expect(engine.current()).toMatchObject({ questId: 7, seconds: 2 });
  });

  it("falls back to the first target but keeps the pin when the quest has none", () => {
    const { engine, db } = setup([target(1), target(2)]);
    engine.refreshTargets(true);
    engine.pin(9);
    expect(engine.current()?.questId).toBe(1);
    expect(db.pinnedQuestId).toBe(9);
  });

  it("is cleared once the pinned quest is turned in", () => {
    const { engine, db, world } = setup([target(1), target(7)]);
    engine.refreshTargets(true);
    engine.pin(7);
    world.snap?.state.completed.add(7);
    world.list = [target(1)];
    engine.refreshTargets(true);
    expect(db.pinnedQuestId).toBeNull();
    expect(engine.current()?.questId).toBe(1);
  });
});

describe("skip", () => {
  it("skips directly when the quest has no follow-ups", () => {
    const { engine, db } = setup([target(1), target(2)], [quest(1), quest(2)]);
    engine.refreshTargets(true);
    const result = engine.skip(1, false);
    expect(result.needsConfirm).toBe(false);
    expect(db.skippedQuests).toEqual([1]);
    expect(engine.targets().map((t) => t.questId)).toEqual([2]);
  });

  it("asks for confirmation when follow-ups would be lost", () => {
    const quests = [quest(1, { nextInChain: 2 }), quest(2, { level: 12 })];
    const { engine, db } = setup([target(1)], quests);
    engine.refreshTargets(true);
    const result = engine.skip(1, false);
    expect(result.needsConfirm).toBe(true);
    expect(result.followUps.map((q) => q.id)).toEqual([2]);
    expect(result.lost).toEqual(lostXp(quests, 10, 60));
    expect(db.skippedQuests).toEqual([]);
    expect(engine.skip(1, true).needsConfirm).toBe(false);
    expect(db.skippedQuests).toEqual([1]);
  });

  it("reports the lost XP as unknown without a player snapshot", () => {
    const { engine, world } = setup([], [quest(1, { nextInChain: 2 }), quest(2)]);
    world.snap = null;
    const result = engine.skip(1, false);
    expect(result.needsConfirm).toBe(true);
    expect(result.lost).toBeNull();
  });

  it("clears the pin of a skipped quest", () => {
    const { engine, db } = setup([target(1)], [quest(1)]);
    engine.pin(1);
    engine.skip(1, false);
    expect(db.pinnedQuestId).toBeNull();
  });
});

describe("unskip", () => {
  it("re-activates one skipped quest or all of them", () => {
    const { engine, db } = setup([target(1), target(2), target(3)], [quest(1), quest(2), quest(3)]);
    engine.refreshTargets(true);
    engine.skip(1, false);
    engine.skip(2, false);
    expect(engine.skipped()).toEqual([1, 2]);
    expect(engine.unskip(1)).toBe(true);
    expect(engine.unskip(1)).toBe(false);
    expect(engine.targets().map((t) => t.questId)).toEqual([1, 3]);
    expect(engine.unskipAll()).toBe(1);
    expect(db.skippedQuests).toEqual([]);
    expect(engine.targets().map((t) => t.questId)).toEqual([1, 2, 3]);
  });
});

describe("arrowTarget", () => {
  it("is null without targets", () => {
    const { engine } = setup([]);
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toBeNull();
  });

  it("points at the target with the quest name and kind", () => {
    const { engine } = setup([target(1)], [quest(1, { name: "Wolves" })]);
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toEqual({ pos: at(10), label: "Wolves · pick up" });
  });

  it("points at the flight master or the boat when the route starts with one", () => {
    const { engine, world } = setup([target(1)], [quest(1)]);
    world.hop = { kind: "taxi", pos: at(500), taxiNodeId: 2 };
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toEqual({ pos: at(500), label: "Go to the flight master" });
    world.hop = { kind: "boat", pos: at(600), taxiNodeId: null };
    world.clock = 5;
    world.list = [target(1, { seconds: 9 })];
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toEqual({ pos: at(600), label: "Take the boat" });
  });

  it("asks to use the hearthstone when the route starts with it", () => {
    const { engine, world } = setup([target(1)], [quest(1)]);
    world.hop = { kind: "hearth", pos: at(0), taxiNodeId: null };
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toEqual({ pos: at(0), label: "Use Hearthstone" });
  });

  it("cycles through the kill loop within 25 yards", () => {
    const points = [at(100), at(40)];
    const cluster = { center: at(70), points };
    const objective = target(1, { kind: "objective", objectiveIndex: 2, pos: at(70), cluster });
    const { engine, world } = setup([objective], [quest(1, { name: "Boars" })]);
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toEqual({ pos: at(40), label: "Boars · objective 2" });
    if (world.snap != null) world.snap.pos = at(30);
    world.clock = 0.5;
    engine.refreshTargets(false);
    expect(engine.arrowTarget()?.pos).toEqual(at(100));
  });

  it("keeps the same object while nothing changes", () => {
    const { engine, world } = setup([target(1)], [quest(1)]);
    engine.refreshTargets(true);
    const first = engine.arrowTarget();
    world.list = [target(1)];
    engine.refreshTargets(true);
    expect(engine.arrowTarget()).toBe(first);
  });
});

describe("zoneProgress", () => {
  it("is null before the first read and counts completed zone quests after", () => {
    const quests = [quest(1, { zoneAreaId: 12 }), quest(2, { zoneAreaId: 12 }), quest(3, { zoneAreaId: 40 })];
    const { engine, world } = setup([], quests);
    expect(engine.zoneProgress(12)).toBeNull();
    world.snap?.state.completed.add(1);
    engine.refreshTargets(true);
    expect(engine.zoneProgress(12)).toEqual({ done: 1, total: 2 });
  });
});

describe("snapshot", () => {
  it("is null before the first read and returns the last snapshot after", () => {
    const { engine, world } = setup([]);
    expect(engine.snapshot()).toBeNull();
    engine.refreshTargets(true);
    expect(engine.snapshot()).toBe(world.snap);
  });
});

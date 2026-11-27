import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import type { QuestInfo } from "../src/data/questRepository";
import type { PlayerQuestState } from "../src/quests/availability";
import {
  selectTargets,
  zoneProgress,
  zoneTotals,
  type CompletionInput,
  type CompletionOptions,
  type TargetKind,
} from "../src/targets/completion";

const at = (x: number, y = 0): WorldPos => ({ continent: 0, x, y });

function quest(overrides: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id: 100, name: "Q", level: 10, requiredLevel: 8, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
    ...overrides,
  };
}

const player = (overrides: Partial<PlayerQuestState> = {}): PlayerQuestState => ({
  level: 10, raceMask: 1, classMask: 1, completed: new Set(), inLog: new Set(), ...overrides,
});

const opts = (overrides: Partial<CompletionOptions> = {}): CompletionOptions => ({
  mode: "proximity", zoneAreaId: null, showTrivial: true, showElite: true, minLevelGap: null, pinnedQuestId: null,
  ...overrides,
});

type Positions = Record<string, WorldPos[]>;

function input(quests: QuestInfo[], positions: Positions, overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    quests,
    log: new Map(),
    player: player(),
    greenRange: 5,
    positionsFor: (q: QuestInfo, kind: TargetKind, index: number | null) => positions[`${q.id}:${kind}:${index}`] ?? [],
    timeTo: (p) => p.x,
    clusters: new Map(),
    ...overrides,
  };
}

const objective = (index: number) => ({ kind: "npc" as const, id: index, required: 1, index });
const logged = (complete: boolean, done: number[] = []) => ({ complete, objectivesDone: new Set<number>(done) });

describe("selectTargets", () => {
  it("sorts by seconds ascending with Infinity and NaN last", () => {
    const quests = [quest({ id: 1 }), quest({ id: 2 }), quest({ id: 3 }), quest({ id: 4 })];
    const positions: Positions = {
      "1:accept:null": [at(50)],
      "2:accept:null": [at(Infinity)],
      "3:accept:null": [at(10)],
      "4:accept:null": [at(NaN)],
    };
    const targets = selectTargets(input(quests, positions), opts());
    expect(targets.map((t) => t.questId)).toEqual([3, 1, 2, 4]);
    expect(targets[3].seconds).toBe(Infinity);
  });

  it("breaks ties by quest id then objective index", () => {
    const quests = [quest({ id: 2 }), quest({ id: 1, objectives: [objective(2), objective(1)] })];
    const positions: Positions = {
      "2:accept:null": [at(5)],
      "1:objective:1": [at(5)],
      "1:objective:2": [at(5)],
    };
    const targets = selectTargets(input(quests, positions, { log: new Map([[1, logged(false)]]) }), opts());
    expect(targets.map((t) => [t.questId, t.objectiveIndex])).toEqual([[1, 1], [1, 2], [2, null]]);
  });

  it("yields a turnin for a complete quest at the nearest finisher", () => {
    const positions: Positions = { "1:turnin:null": [at(90), at(30)] };
    const targets = selectTargets(input([quest({ id: 1 })], positions, { log: new Map([[1, logged(true)]]) }), opts());
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ kind: "turnin", objectiveIndex: null, cluster: null, seconds: 30 });
    expect(targets[0].pos).toEqual(at(30));
  });

  it("yields one objective target per unfinished objective at the picked cluster center", () => {
    const q = quest({ id: 1, objectives: [objective(1), objective(2), objective(3)] });
    const positions: Positions = {
      "1:objective:1": [at(500), at(510), at(20), at(30)],
      "1:objective:3": [at(70)],
    };
    const targets = selectTargets(input([q], positions, { log: new Map([[1, logged(false, [2])]]) }), opts());
    expect(targets.map((t) => [t.kind, t.objectiveIndex, t.seconds])).toEqual([
      ["objective", 1, 25],
      ["objective", 3, 70],
    ]);
    expect(targets[0].cluster?.points).toHaveLength(2);
    expect(targets[0].pos).toEqual(at(25));
  });

  it("extends the picked cluster with every spawn within 250 yards, not the farther ones", () => {
    const q = quest({ id: 1, objectives: [objective(1)] });
    const positions: Positions = { "1:objective:1": [at(0), at(150), at(200), at(600)] };
    const targets = selectTargets(input([q], positions, { log: new Map([[1, logged(false)]]) }), opts());
    expect(targets[0].pos).toEqual(at(0));
    expect(targets[0].cluster?.points).toEqual([at(0), at(150), at(200)]);
  });

  it("counts the other clusters as otherSpots, and none for accept and turnin", () => {
    const q = quest({ id: 1, objectives: [objective(1)] });
    const spots = { "1:objective:1": [at(10), at(500), at(1000)] };
    const [objectiveTarget] = selectTargets(input([q], spots, { log: new Map([[1, logged(false)]]) }), opts());
    expect(objectiveTarget.otherSpots).toBe(2);
    const [accept] = selectTargets(input([quest({ id: 2 })], { "2:accept:null": [at(10), at(500)] }), opts());
    expect(accept.otherSpots).toBe(0);
    const turnin = selectTargets(
      input([quest({ id: 3 })], { "3:turnin:null": [at(10), at(500)] }, { log: new Map([[3, logged(true)]]) }),
      opts(),
    );
    expect(turnin[0].otherSpots).toBe(0);
  });

  it("objective without positions is excluded", () => {
    const q = quest({ id: 1, objectives: [objective(1)] });
    expect(selectTargets(input([q], {}, { log: new Map([[1, logged(false)]]) }), opts())).toEqual([]);
  });

  it("excludes an accept quest without starter positions", () => {
    expect(selectTargets(input([quest()], {}), opts())).toEqual([]);
  });

  it("omits blocked quests", () => {
    const q = quest({ id: 1, preGroup: [9] });
    expect(selectTargets(input([q], { "1:accept:null": [at(1)] }), opts())).toEqual([]);
  });

  it("does not offer accept for a quest already in the log", () => {
    const targets = selectTargets(
      input([quest({ id: 1 })], { "1:accept:null": [at(1)] }, { log: new Map([[1, logged(false)]]) }),
      opts(),
    );
    expect(targets).toEqual([]);
  });

  it("filters trivial quests when showTrivial is false", () => {
    const grey = quest({ id: 1, level: 2, requiredLevel: 1 });
    const positions: Positions = { "1:accept:null": [at(1)] };
    expect(selectTargets(input([grey], positions), opts({ showTrivial: false }))).toEqual([]);
    expect(selectTargets(input([grey], positions), opts({ showTrivial: true }))[0].trivial).toBe(true);
  });

  it("filters elite quests when showElite is false", () => {
    const elite = quest({ id: 1, isElite: true });
    const positions: Positions = { "1:accept:null": [at(1)] };
    expect(selectTargets(input([elite], positions), opts({ showElite: false }))).toEqual([]);
    expect(selectTargets(input([elite], positions), opts())[0].elite).toBe(true);
  });

  it("applies minLevelGap to accept targets only", () => {
    const fresh = quest({ id: 1, level: 15 });
    const done = quest({ id: 2, level: 15 });
    const positions: Positions = { "1:accept:null": [at(1)], "2:turnin:null": [at(2)] };
    const targets = selectTargets(
      input([fresh, done], positions, { log: new Map([[2, logged(true)]]), player: player({ level: 15 }) }),
      opts({ minLevelGap: 2 }),
    );
    expect(targets.map((t) => t.questId)).toEqual([2]);
  });

  it("zone mode keeps only targets of the chosen zone", () => {
    const a = quest({ id: 1, zoneAreaId: 10 });
    const b = quest({ id: 2, zoneAreaId: 20 });
    const c = quest({ id: 3, zoneAreaId: null });
    const positions: Positions = { "1:accept:null": [at(5)], "2:accept:null": [at(1)], "3:accept:null": [at(2)] };
    const zone = selectTargets(input([a, b, c], positions), opts({ mode: "zone", zoneAreaId: 10 }));
    expect(zone.map((t) => t.questId)).toEqual([1]);
    const all = selectTargets(input([a, b, c], positions), opts({ zoneAreaId: 10 }));
    expect(all.map((t) => t.questId)).toEqual([2, 3, 1]);
  });
});

describe("selectTargets log mode", () => {
  const positions: Positions = {
    "1:accept:null": [at(1)], "2:turnin:null": [at(2)], "3:objective:1": [at(3)], "3:objective:2": [at(4)],
    "4:accept:null": [at(5)], "5:objective:1": [at(6)],
  };
  const logMode = opts({ mode: "log" });

  it("targets only logged quests, never accepts", () => {
    const quests = [quest({ id: 1 }), quest({ id: 2 }), quest({ id: 3, objectives: [objective(1), objective(2)] }), quest({ id: 4 })];
    const log = new Map([[2, logged(true)], [3, logged(false, [2])]]);
    const targets = selectTargets(input(quests, positions, { log }), logMode);
    expect(targets.map((t) => [t.questId, t.kind])).toEqual([[2, "turnin"], [3, "objective"]]);
  });

  it("ignores grey, elite and zone filters", () => {
    const q = quest({ id: 5, level: 1, isElite: true, zoneAreaId: 40, objectives: [objective(1)] });
    const log = new Map([[5, logged(false)]]);
    const strict = opts({ mode: "log", showTrivial: false, showElite: false, zoneAreaId: 10 });
    const targets = selectTargets(input([q], positions, { log, player: player({ level: 30 }) }), strict);
    expect(targets.map((t) => t.questId)).toEqual([5]);
  });

  it("returns nothing for an empty log", () => {
    expect(selectTargets(input([quest({ id: 1 })], positions), logMode)).toEqual([]);
  });
});

describe("selectTargets edge cases", () => {
  it("keeps the pinned quest through the grey, elite and zone filters", () => {
    const pinned = quest({ id: 1, level: 1, isElite: true, zoneAreaId: 40 });
    const other = quest({ id: 2, level: 1, isElite: true, zoneAreaId: 40 });
    const positions: Positions = { "1:accept:null": [at(5)], "2:accept:null": [at(6)] };
    const strict = opts({ showTrivial: false, showElite: false, mode: "zone", zoneAreaId: 10, pinnedQuestId: 1 });
    expect(selectTargets(input([pinned, other], positions, { player: player({ level: 30 }) }), strict).map((t) => t.questId)).toEqual([1]);
  });

  it("zone mode without a zone returns nothing", () => {
    const q = quest({ id: 1, zoneAreaId: null });
    expect(selectTargets(input([q], { "1:accept:null": [at(1)] }), opts({ mode: "zone", zoneAreaId: null }))).toEqual([]);
  });

  it("accept uses the nearest starter", () => {
    const targets = selectTargets(input([quest({ id: 1 })], { "1:accept:null": [at(80), at(15), at(40)] }), opts());
    expect(targets[0].pos).toEqual(at(15));
  });

  it("objective picks the finite cluster over a NaN-time one", () => {
    const q = quest({ id: 1, objectives: [objective(1)] });
    const positions: Positions = { "1:objective:1": [at(1000), at(30)] };
    const timeTo = (p: WorldPos): number => (p.x === 1000 ? NaN : p.x);
    const targets = selectTargets(input([q], positions, { log: new Map([[1, logged(false)]]), timeTo }), opts());
    expect(targets[0].pos).toEqual(at(30));
    expect(targets[0].seconds).toBe(30);
  });

  it("reuses the clusters of an objective across refreshes", () => {
    let reads = 0;
    const q = quest({ id: 1, objectives: [objective(1)] });
    const spawns = [at(10), at(20)];
    const cached = input([q], {}, {
      log: new Map([[1, logged(false)]]),
      positionsFor: () => (reads++, spawns),
    });
    const [first] = selectTargets(cached, opts());
    const [second] = selectTargets({ ...cached, timeTo: (p) => p.x + 1 }, opts());
    expect(reads).toBe(1);
    expect(second.cluster).toBe(first.cluster);
    expect(second.seconds).toBe(first.seconds + 1);
  });

  it("calls timeTo once per position", () => {
    let calls = 0;
    selectTargets(input([quest({ id: 1 })], { "1:accept:null": [at(5), at(9)] }, { timeTo: (p) => (calls++, p.x) }), opts());
    expect(calls).toBe(2);
  });
});

describe("zoneProgress", () => {
  it("counts completed over zone quests the race and class can take", () => {
    const quests = [
      quest({ id: 1, zoneAreaId: 10 }),
      quest({ id: 2, zoneAreaId: 10 }),
      quest({ id: 3, zoneAreaId: 10, races: 2 }),
      quest({ id: 4, zoneAreaId: 10, classes: 4 }),
      quest({ id: 5, zoneAreaId: 20 }),
    ];
    const p = player({ raceMask: 1, classMask: 1 });
    expect(zoneProgress(quests, new Set([1, 5]), 10, p)).toEqual({ done: 1, total: 2 });
  });
});

describe("zoneTotals", () => {
  it("counts every zone in one pass with the zoneProgress rules", () => {
    const quests = [
      quest({ id: 1, zoneAreaId: 10 }),
      quest({ id: 2, zoneAreaId: 10 }),
      quest({ id: 3, zoneAreaId: 10, races: 2 }),
      quest({ id: 5, zoneAreaId: 20 }),
      quest({ id: 6, zoneAreaId: null }),
    ];
    const totals = zoneTotals(quests, new Set([1, 5]), player());
    expect([...totals.entries()]).toEqual([
      [10, { done: 1, total: 2 }],
      [20, { done: 1, total: 1 }],
    ]);
  });
});

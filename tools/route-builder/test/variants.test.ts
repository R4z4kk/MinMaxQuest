import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { travel as travelFixture } from "./fixtures";
import { SCENARIOS } from "../model/constants";
import type { RouteQuest, World } from "../model/world";
import { allVariants, buildFaction, pickWinner, variantKey, type Evaluated, type FactionRoutes } from "../opt/variants";
import { buildRoute, type Variant } from "../opt/build";
import { initialState, simulate } from "../sim/simulate";
import { kill, place, quest, worldOf } from "./fixtures";

const RACE_A = 1;
const RACE_B = 4;
const data = travelFixture({
  taxiNodes: [{ id: 2, name: "Capital", pos: { continent: 0, x: 5, y: 5 }, faction: "A" }],
});

const segmentQuests = [0, 1, 2, 3].map((i) =>
  quest(10 + i, place(i * 40, 0, 1), { baseXp: 9000, level: 5 }, [kill(place(i * 40, 30, 1), 5)]),
);
const trunkQuests = [0, 1, 2, 3, 4, 5].map((i) =>
  quest(100 + i, place(i * 40, 0, 2), { baseXp: 900000, level: 60, requiredLevel: 10 }, [kill(place(i * 40, 30, 2), 60)]),
);
const raceQuest: RouteQuest = quest(200, place(10, 0, 2), { baseXp: 900000, level: 60, requiredLevel: 10, races: RACE_A }, [kill(place(10, 30, 2), 60)]);
const returnQuests: RouteQuest[] = [301, 302].map((id) => ({
  ...quest(id, place(id, 0, 2), { level: 20, requiredLevel: 20, objectives: [{ index: 0, kind: "npc" as const, id: 1, required: 1 }] }),
  dungeonAreaId: 99,
  returnVisit: true,
}));
returnQuests[0].info.preGroup = [302];

function world() {
  return worldOf([...segmentQuests, ...trunkQuests, raceQuest, ...returnQuests], {
    raceMask: RACE_A + RACE_B,
    raceMasks: [RACE_A, RACE_B],
    inns: [{ place: { ...place(2, 0, 1), npcId: 9 } }],
    taxiPlaces: new Map([[2, place(5, 5, 2)]]),
    areaUiMap: new Map([[12, 1], [13, 1], [40, 2]]),
    startZones: [{ key: "start", faction: "A", raceMask: RACE_A, areaId: 12, start: place(0, 0, 1) }],
    dungeons: [{ areaId: 99, name: "Test", entrance: place(500, 0, 2), questIds: [301, 302] }],
  });
}

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => vi.restoreAllMocks());

describe("variants", () => {
  it("lists 16 unique keys and formats them", () => {
    const keys = allVariants().map(variantKey);
    expect(new Set(keys).size).toBe(16);
    expect(keys).toEqual([...keys].sort());
    expect(variantKey({ elites: true, dungeons: false, maxLevelGap: 2 })).toBe("e1d0x2");
    expect(variantKey({ elites: false, dungeons: true, maxLevelGap: null })).toBe("e0d1x0");
  });
});

describe("buildFaction", () => {
  let routes: FactionRoutes;
  const w = world();
  beforeAll(() => {
    routes = buildFaction(w, { beamWidth: 4, branching: 3 }, data);
  });

  it("fills every variant for the segment and the trunk", () => {
    const keys = allVariants().map(variantKey);
    expect(routes.faction).toBe("A");
    expect(Object.keys(routes.segments)).toEqual(["start"]);
    expect(Object.keys(routes.segments.start).sort()).toEqual(keys);
    expect(Object.keys(routes.trunk).sort()).toEqual(keys);
  });

  it("averages the three scenario times of the winner", () => {
    const e = routes.trunk.e0d1x0;
    const times = SCENARIOS.map((s) => e.secondsByScenario[s.name]);
    expect(times.every((t) => t > 0)).toBe(true);
    expect(e.average).toBeCloseTo(times.reduce((a, b) => a + b, 0) / 3, 6);
    const replay = simulate(e.steps, initialState(place(5, 5, 2), 10, [2], { continent: 0, x: 2, y: 0 }), w, SCENARIOS[1], {
      maxLevelGap: null,
      tolerant: false,
      raceMask: w.raceMask,
    }, data);
    expect(replay.violations).toEqual([]);
    expect(replay.state.seconds).toBeCloseTo(e.secondsByScenario.medium, 6);
  });

  it("reports the race that skips a race-specific trunk quest", () => {
    const e = routes.trunk.e0d1x0;
    expect(e.steps.some((s) => s.questId === 200)).toBe(true);
    expect(e.worstRace.raceMask).toBe(RACE_B);
    expect(e.worstRace.skipped).toBeGreaterThanOrEqual(1);
  });

  it("limits the segment race check to the start zone races", () => {
    expect(routes.segments.start.e0d1x0.worstRace.raceMask).toBe(RACE_A);
    expect(routes.segments.start.e0d1x0.worstRace.skipped).toBe(0);
  });

  it("orders return block quests along their chain around one dungeon visit", () => {
    const steps = routes.returnBlocks[99];
    expect(steps.map((s) => `${s.type}${s.questId ?? ""}`)).toEqual(["accept302", "accept301", "dungeon", "turnin302", "turnin301"]);
    expect(steps[2]).toMatchObject({ dungeonAreaId: 99, place: { pos: { x: 500 } } });
  });

  it("names the context when a candidate cannot be built", () => {
    const blocked = worldOf([quest(1, place(0, 0, 1), { requiredLevel: 5 })], {
      raceMasks: [RACE_A],
      taxiPlaces: new Map([[2, place(5, 5, 2)]]),
      areaUiMap: new Map([[12, 1]]),
      startZones: [{ key: "start", faction: "A", raceMask: RACE_A, areaId: 12, start: place(0, 0, 1) }],
    });
    expect(() => buildFaction(blocked, { beamWidth: 2, branching: 2 }, data)).toThrow(/start e0d0x0 fast/);
  });
});

function candidateAverages(w: World, variant: Variant): number[] {
  const start = () => initialState(place(5, 5, 2), 10, [2], null);
  const options = { maxLevelGap: variant.maxLevelGap, tolerant: false, raceMask: w.raceMask };
  return SCENARIOS.map((built) => {
    const { steps } = buildRoute({ world: w, scenario: built, variant, start: start(), targetLevel: 60, areaIds: null, beamWidth: 4, branching: 3 }, data);
    const times = SCENARIOS.map((s) => simulate(steps, start(), w, s, options, data).state.seconds);
    return times.reduce((a, b) => a + b, 0) / times.length;
  });
}

const trunkOnly = (quests: RouteQuest[]) =>
  worldOf(quests, { raceMask: RACE_A, raceMasks: [RACE_A], taxiPlaces: new Map([[2, place(5, 5, 2)]]) });

describe("scenario selection", () => {
  const big = { baseXp: 900000, level: 60, requiredLevel: 10 };
  const mk = (id: number, x: number, xp: number, count: number): RouteQuest => {
    const task = { ...kill(place(x, 30, 2), 60), count };
    return quest(id, place(x, 0, 2), { ...big, baseXp: xp }, [task]);
  };

  it("keeps the candidate with the lowest average over the three scenarios", () => {
    const w = trunkOnly([mk(1, 0, 900000, 1), mk(2, 40, 900000, 1), mk(3, 80, 900000, 1), mk(4, 120, 900000, 1), mk(5, 1200, 300, 40), mk(6, 1240, 300, 40)]);
    const routes = buildFaction(w, { beamWidth: 4, branching: 3 }, data);
    let differing = 0;
    for (const variant of allVariants()) {
      const averages = candidateAverages(w, variant);
      if (Math.max(...averages) - Math.min(...averages) > 1) differing++;
      expect(routes.trunk[variantKey(variant)].average).toBeCloseTo(Math.min(...averages), 6);
    }
    expect(differing).toBeGreaterThan(0);
  });

  const collect = quest(1, place(5, 5, 2), { baseXp: 100, level: 5, requiredLevel: 10, objectives: [{ index: 0, kind: "item" as const, id: 1, required: 20 }] }, [
    { kind: "collect", objectiveIndex: 0, count: 20, cluster: { center: place(0, 30, 2), loop: [place(0, 30, 2), place(0, 60, 2)] }, mobLevel: 12, elite: false, dropChance: 0, assumedDropChance: true },
  ]);
  const gated = quest(2, place(10, 0, 2), { baseXp: 100, level: 10, requiredLevel: 10 });
  const filler = quest(3, place(20, 0, 2), { baseXp: 50, level: 5, requiredLevel: 10 }, [kill(place(20, 30, 2), 9)]);

  it("discards a candidate that violates a strict rule under another scenario and records it", () => {
    const routes = buildFaction(trunkOnly([collect, gated, filler]), { beamWidth: 4, branching: 3 }, data);
    const e = routes.trunk.e0d0x1;
    expect(e.discardedCandidates).toEqual([{ scenario: "slow", violation: expect.stringMatching(/^scenario fast: step \d+: accept 2: maxLevelGap$/) }]);
    expect(routes.trunk.e0d0x0.discardedCandidates).toEqual([]);
    expect(Number.isFinite(e.average)).toBe(true);
  });

  const candidate = (average: number): Evaluated => ({
    steps: [],
    secondsByScenario: { fast: average, medium: average, slow: average },
    average,
    worstRace: { raceMask: 0, seconds: 0, skipped: 0 },
    discardedCandidates: [],
  });

  it("throws naming every violation when no candidate is valid under all scenarios", () => {
    const discarded = SCENARIOS.map((s) => ({ scenario: s.name, violation: `scenario other: step 1: accept ${s.name}` }));
    expect(() => pickWinner("trunk e0d0x1", [], discarded)).toThrow(
      /trunk e0d0x1 has no candidate valid.*fast route, scenario other: step 1: accept fast; medium route.*accept medium; slow route.*accept slow/,
    );
  });

  it("returns the lowest average among several valid candidates", () => {
    const winner = pickWinner("trunk e0d0x1", [candidate(300), candidate(100), candidate(200)], []);
    expect(winner.average).toBe(100);
  });
});

describe("race check inputs", () => {
  const zoneQuests = [0, 1, 2, 3].map((i) => quest(10 + i, place(i * 40, 0, 1), { baseXp: 9000, level: 5 }, [kill(place(i * 40, 30, 1), 5)]));
  const gated = quest(20, place(10, 0, 1), { baseXp: 9000, level: 5, races: RACE_A }, [kill(place(10, 30, 1), 5)]);
  const worldWith = (zoneMask: number, masks: number[]) =>
    worldOf([...zoneQuests, gated, ...trunkQuests], {
      raceMask: RACE_A + RACE_B,
      raceMasks: masks,
      taxiPlaces: new Map([[2, place(5, 5, 2)]]),
      areaUiMap: new Map([[12, 1], [40, 2]]),
      startZones: [{ key: "start", faction: "A", raceMask: zoneMask, areaId: 12, start: place(0, 0, 1) }],
    });

  it("checks only the races of the start zone", () => {
    const routes = buildFaction(worldWith(RACE_A, [RACE_A, RACE_B]), { beamWidth: 4, branching: 3 }, data);
    const e = routes.segments.start.e0d1x0;
    expect(e.steps.some((s) => s.questId === 20)).toBe(true);
    expect(e.worstRace.raceMask).toBe(RACE_A);
    expect(e.worstRace.skipped).toBe(0);
  });

  it("throws naming the segment and zone mask when no race applies", () => {
    expect(() => buildFaction(worldWith(RACE_B, [RACE_A]), { beamWidth: 4, branching: 3 }, data)).toThrow(/start \(zone mask 4\) has no race/);
    expect(() => buildFaction(worldWith(RACE_A, []), { beamWidth: 4, branching: 3 }, data)).toThrow(/start \(zone mask 1\) has no race/);
    expect(() => buildFaction({ ...worldWith(RACE_A, []), startZones: [] }, { beamWidth: 4, branching: 3 }, data)).toThrow(/trunk has no race/);
  });
});

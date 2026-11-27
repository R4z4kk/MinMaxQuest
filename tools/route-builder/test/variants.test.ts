import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { travel as travelFixture } from "./fixtures";
import { SCENARIOS } from "../model/constants";
import type { RouteQuest } from "../model/world";
import { allVariants, buildFaction, variantKey, type FactionRoutes } from "../opt/variants";
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    routes = buildFaction(w, { beamWidth: 4, branching: 3 }, data);
  });
  afterAll(() => vi.restoreAllMocks());

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

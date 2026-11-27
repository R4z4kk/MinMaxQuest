import { describe, expect, it } from "vitest";
import { BUILDER, SCENARIOS } from "../model/constants";
import { mobXp } from "../model/mobXp";
import type { RouteQuest, World } from "../model/world";
import { buildRoute, grindRate, type BuildRequest, type BuiltRoute, type Variant } from "../opt/build";
import { applyStep, cloneState, initialState, simulate, type RouteStep, type SimOptions, type SimState } from "../sim/simulate";
import { kill, place, quest, travel, worldOf } from "./fixtures";

const scenario = SCENARIOS[1];
const data = travel();
const BASE: Variant = { elites: false, dungeons: true, maxLevelGap: null };

function start(level = 1, at = place(0, 0, 1)): SimState {
  return initialState(at, level, [], null);
}

function request(w: World, s: SimState, targetLevel: number, variant: Variant = BASE): BuildRequest {
  return { world: w, scenario, variant, start: s, targetLevel, areaIds: null, beamWidth: 8, branching: 6 };
}

function options(req: BuildRequest): SimOptions {
  return { maxLevelGap: req.variant.maxLevelGap, tolerant: false, raceMask: req.world.raceMask };
}

function replay(req: BuildRequest, steps: RouteStep[]) {
  return simulate(steps, req.start, req.world, scenario, options(req), data);
}

function build(req: BuildRequest): BuiltRoute {
  const route = buildRoute(req, data);
  const result = replay(req, route.steps);
  expect(result.violations).toEqual([]);
  expect(result.state.seconds).toBeCloseTo(route.end.seconds, 6);
  expect(route.end.level).toBeGreaterThanOrEqual(req.targetLevel);
  return route;
}

function cycle(q: RouteQuest): RouteStep[] {
  const tasks = q.tasks.map((t): RouteStep => ({ type: "complete", place: t.cluster.center, questId: q.id, objectiveIndex: t.objectiveIndex }));
  return [{ type: "accept", place: q.accept, questId: q.id }, ...tasks, { type: "turnin", place: q.turnin, questId: q.id }];
}

function accepted(route: BuiltRoute, ids: number[]): number[] {
  return route.steps.filter((s) => s.type === "accept" && s.questId != null && ids.includes(s.questId)).map((s) => s.questId ?? 0);
}

describe("grindRate", () => {
  it("is equal-level mob XP per kill and loot second", () => {
    expect(grindRate(7, scenario)).toBe(mobXp(7, 7, false) / (scenario.killSec.value + BUILDER.lootSec.value));
  });
});

describe("buildRoute", () => {
  const zoneA = [0, 1, 2, 3].map((i) => quest(10 + i, place(i * 40, 0, 1), { baseXp: 400 }, [kill(place(i * 40, 30, 1))]));
  const zoneB = [0, 1, 2, 3].map((i) => quest(20 + i, place(3000 + i * 40, 0, 2), { baseXp: 400 }, [kill(place(3000 + i * 40, 30, 2))]));

  it("finishes one zone before moving and beats the alternating order", () => {
    const req = request(worldOf([...zoneA, ...zoneB]), start(), 5);
    const route = build(req);
    const zonesSeen = route.steps.filter((s) => s.questId != null).map((s) => s.place.uiMapId);
    expect(zonesSeen.filter((z, i) => i > 0 && z !== zonesSeen[i - 1])).toHaveLength(1);
    expect(route.end.completed).toEqual(new Set([...zoneA, ...zoneB].map((q) => q.id)));

    const lastTurnin = route.steps.map((s) => s.type).lastIndexOf("turnin");
    const naive = zoneA.flatMap((q, i) => [...cycle(q), ...cycle(zoneB[i])]);
    expect(replay(req, route.steps.slice(0, lastTurnin + 1)).state.seconds).toBeLessThan(replay(req, naive).state.seconds);
  });

  it("keeps the quest log at 20 or fewer with 25 quests in one block", () => {
    const quests = Array.from({ length: 25 }, (_, i) => quest(100 + i, place(i * 2, 0, 1), {}, [kill(place(i * 2, 20, 1))]));
    const req = request(worldOf(quests), start(), 5);
    const route = build(req);
    const s = cloneState(req.start);
    let most = 0;
    for (const step of route.steps) {
      applyStep(s, step, req.world, scenario, options(req), data);
      most = Math.max(most, s.inLog.size);
    }
    expect(most).toBe(20);
    expect(route.end.completed).toEqual(new Set(quests.map((q) => q.id)));
  });

  describe("dungeons", () => {
    const hub = place(100, 0, 1);
    const dungeonQuest = (id: number, chain = false): RouteQuest => {
      const objectives = chain ? [] : [{ index: 0, kind: "npc" as const, id: 1, required: 1 }];
      return { ...quest(id, hub, { level: 3, baseXp: 600, objectives }), dungeonAreaId: 99, accessChain: chain };
    };
    const normals = Array.from({ length: 18 }, (_, i) => quest(200 + i, place(i * 5, 0, 1), { level: 3 }, [kill(place(i * 5, 40, 1), 3)]));
    const dungeonWorld = (chain: boolean) =>
      worldOf([...normals, dungeonQuest(301), dungeonQuest(302), dungeonQuest(303, chain)], {
        dungeons: [{ areaId: 99, name: "Test", entrance: place(600, 0, 1), questIds: [301, 302, 303] }],
      });
    const dungeonSteps = (route: BuiltRoute) => route.steps.filter((s) => s.type === "dungeon");

    it("runs a forced dungeon once and turns in its quests", () => {
      const route = build(request(dungeonWorld(false), start(3), 6));
      expect(dungeonSteps(route)).toHaveLength(1);
      for (const id of [301, 302, 303]) expect(route.end.completed.has(id)).toBe(true);
    });

    it("accepts at most 2 dungeon quests with 18 quests in the log", () => {
      const s = start(3);
      for (const q of normals) s.inLog.add(q.id);
      const route = build(request(dungeonWorld(false), s, 6));
      expect(dungeonSteps(route)).toHaveLength(1);
      expect(accepted(route, [301, 302, 303]).length).toBeLessThanOrEqual(2);
    });

    it("skips dungeons without the variant but keeps access chains", () => {
      const route = build(request(dungeonWorld(true), start(3), 6, { ...BASE, dungeons: false }));
      expect(dungeonSteps(route)).toHaveLength(0);
      expect(accepted(route, [301, 302, 303])).toEqual([303]);
      expect(route.end.completed.has(303)).toBe(true);
    });
  });

  it("grinds first under maxLevelGap 3 from level 1", () => {
    const quests = Array.from({ length: 5 }, (_, i) => quest(500 + i, place(i * 30, 0, 1), { baseXp: 300 }, [kill(place(i * 30, 40, 1), 1 + (i % 2))]));
    const route = build(request(worldOf(quests), start(), 6, { ...BASE, maxLevelGap: 3 }));
    expect(route.steps.slice(0, 3).map((s) => s.type)).toEqual(["grind", "grind", "grind"]);
  });

  const inn = place(10, 0, 1);
  const hubFirst = [0, 1].map((i) => quest(400 + i, place(i * 20, 0, 1), { baseXp: 400 }, [kill(place(i * 20, 30, 1))]));
  const far = [0, 1].map((i) => quest(410 + i, place(4000 + i * 20, 0, 2), { level: 2, baseXp: 800 }, [kill(place(4000 + i * 20, 30, 2), 2)]));
  const hubLater = [0, 1].map((i) =>
    quest(420 + i, place(i * 20, 5, 1), { level: 6, baseXp: 1500, preGroup: [410, 411] }, [kill(place(i * 20, 35, 1), 3)]),
  );
  const hearthWorld = () => worldOf([...hubFirst, ...far, ...hubLater], { inns: [{ place: { ...inn, npcId: 9 } }] });

  it("binds the hearth at a hub visited twice and hearths back", () => {
    const req = request(hearthWorld(), start(), 6);
    const route = build(req);
    const types = route.steps.map((s) => s.type);
    expect(types.indexOf("setHearth")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("hearth")).toBeGreaterThan(types.indexOf("setHearth"));
    for (const q of hubLater) expect(route.end.completed.has(q.id)).toBe(true);
    const walking = route.steps.filter((s) => s.type !== "setHearth" && s.type !== "hearth");
    expect(replay(req, walking).state.seconds).toBeGreaterThan(route.end.seconds);
  });

  it("is deterministic", () => {
    const first = buildRoute(request(hearthWorld(), start(), 6), data);
    const second = buildRoute(request(hearthWorld(), start(), 6), data);
    expect(second.steps).toEqual(first.steps);
    expect(second.end.seconds).toBe(first.end.seconds);
  });

  it("skips nearer blocks whose quests are not worth it", () => {
    const dead = [1, 3].map((uiMapId, i) => quest(700 + i, place(i * 10, 0, uiMapId), { baseXp: 1 }, [kill(place(i * 10, 1000, uiMapId))]));
    const good = [0, 1].map((i) => quest(710 + i, place(1500 + i * 20, 0, 2), { baseXp: 800 }, [kill(place(1500 + i * 20, 30, 2))]));
    const route = build({ ...request(worldOf([...dead, ...good]), start(), 4), branching: 2 });
    for (const q of good) expect(route.end.completed.has(q.id)).toBe(true);
    for (const q of dead) expect(route.end.completed.has(q.id)).toBe(false);
  });

  it("learns the zone flight path and marks the flight", () => {
    const flights = travel({
      taxiNodes: [
        { id: 1, name: "A", pos: { continent: 0, x: 5, y: 5 }, faction: "A" },
        { id: 2, name: "B", pos: { continent: 0, x: 6005, y: 5 }, faction: "A" },
      ],
      taxiEdges: [
        { from: 1, to: 2, seconds: 60 },
        { from: 2, to: 1, seconds: 60 },
      ],
    });
    const near = [0, 1].map((i) => quest(30 + i, place(i * 20, 0, 1), { baseXp: 400 }, [kill(place(i * 20, 30, 1))]));
    const remote = [0, 1].map((i) => quest(40 + i, place(6000 + i * 20, 0, 2), { baseXp: 800 }, [kill(place(6000 + i * 20, 30, 2))]));
    const w = worldOf([...near, ...remote], {
      taxiZone: new Map([[1, 1], [2, 2]]),
      taxiPlaces: new Map([[1, place(5, 5, 1)], [2, place(6005, 5, 2)]]),
    });
    const req = request(w, initialState(place(0, 0, 1), 1, [2], null), 4);
    const route = buildRoute(req, flights);
    const result = simulate(route.steps, req.start, w, scenario, options(req), flights);
    expect(result.violations).toEqual([]);
    expect(route.steps[0]).toMatchObject({ type: "getFlightPath", taxiNodeId: 1 });
    const fly = route.steps.findIndex((s) => s.type === "fly");
    expect(route.steps[fly]).toMatchObject({ taxiNodeId: 2, place: { uiMapId: 1 } });
    expect(route.steps[fly + 1]).toMatchObject({ type: "accept", place: { uiMapId: 2 } });
  });

  it("restricts quests to the accept areas", () => {
    const w = worldOf([...zoneA, ...zoneB], { areaUiMap: new Map([[12, 1], [40, 2]]) });
    const route = build({ ...request(w, start(), 3), areaIds: new Set([12]) });
    expect(route.steps.every((s) => s.place.uiMapId === 1)).toBe(true);
    expect(() => buildRoute({ ...request(w, start(), 3), areaIds: new Set([77]) }, data)).toThrow(/area 77/);
  });

  it("names the level and remaining blocks when nothing can progress", () => {
    const blocked = quest(600, place(0, 0, 1), { requiredLevel: 5 });
    expect(() => buildRoute(request(worldOf([blocked]), start(), 3), data)).toThrow(/level 1.*1 blocks? left/);
  });

  it("rejects an unknown hearth position", () => {
    expect(() => buildRoute(request(worldOf(zoneA), initialState(place(0, 0, 1), 1, [], { continent: 0, x: 5, y: 5 }), 3), data)).toThrow(
      /hearth/,
    );
  });
});

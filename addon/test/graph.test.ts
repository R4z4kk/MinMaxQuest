import { describe, expect, it } from "vitest";
import { CONSTANTS } from "../src/core/constants";
import type { WorldPos } from "../src/core/geometry";
import { TRAVEL, type TravelData } from "../src/data/generated/travel";
import { buildGraph, firstHop, hearthPenaltyOf, solveFrom, taxiDestination, travelTime, type TravelContext } from "../src/travel/graph";

const SPEED = 7;
const WALK = CONSTANTS.detourFactor.value / SPEED;

const pos = (x: number, y: number, continent = 0): WorldPos => ({ continent, x, y });

const SOURCE: TravelData["source"] = {
  name: "Shortest Path Forever",
  version: "test",
  build: "test",
  cmangosCommit: "test",
  wagoBuild: "test",
  commit: "test",
  verifiedOn: "2026-11-27", expiresOn: "2026-12-27",
};

function data(partial: Partial<TravelData>): TravelData {
  return { source: SOURCE, taxiNodes: [], taxiEdges: [], transports: [], portals: [], walkPlaces: [], walks: [], ...partial };
}

function context(partial: Partial<TravelContext> = {}): TravelContext {
  return {
    speed: SPEED,
    knownTaxiNodes: new Set<number>(),
    faction: "A",
    hearth: { ready: false, pos: null },
    hearthPenaltySec: CONSTANTS.hearthPenaltySec.value,
    ...partial,
  };
}

function evaluate(travel: TravelData, ctx: TravelContext, origin: WorldPos, target: WorldPos) {
  const graph = buildGraph(travel, ctx);
  const plan = solveFrom(graph, origin, ctx);
  return { time: travelTime(plan, graph, target, ctx), hop: firstHop(plan, graph, target, ctx) };
}

const TAXI = data({
  taxiNodes: [
    { id: 1, name: "A", pos: pos(100, 0), faction: "AH" },
    { id: 2, name: "B", pos: pos(10000, 0), faction: "AH" },
  ],
  taxiEdges: [{ from: 1, to: 2, seconds: 60 }],
});

describe("travel graph", () => {
  it("walks on the same continent without taxi", () => {
    const { time, hop } = evaluate(data({}), context(), pos(0, 0), pos(300, 400));
    expect(time).toBeCloseTo(500 * WALK);
    expect(hop).toEqual({ kind: "walk", pos: pos(300, 400), taxiNodeId: null });
  });

  it("chooses a known taxi when faster and starts at its departure node", () => {
    const ctx = context({ knownTaxiNodes: new Set([1, 2]) });
    const { time, hop } = evaluate(TAXI, ctx, pos(0, 0), pos(10050, 0));
    expect(time).toBeCloseTo(100 * WALK + 60 + 50 * WALK);
    expect(hop).toEqual({ kind: "taxi", pos: pos(100, 0), taxiNodeId: 1 });
  });

  it("ignores unknown taxi nodes", () => {
    const ctx = context({ knownTaxiNodes: new Set([1]) });
    const { time, hop } = evaluate(TAXI, ctx, pos(0, 0), pos(10050, 0));
    expect(time).toBeCloseTo(10050 * WALK);
    expect(hop?.kind).toBe("walk");
  });

  it("ignores taxi nodes of the other faction", () => {
    const hordeOnly = data({
      taxiNodes: TAXI.taxiNodes.map((node) => ({ ...node, faction: "H" as const })),
      taxiEdges: TAXI.taxiEdges,
    });
    const ctx = context({ knownTaxiNodes: new Set([1, 2]) });
    expect(evaluate(hordeOnly, ctx, pos(0, 0), pos(10050, 0)).time).toBeCloseTo(10050 * WALK);
  });

  it("returns Infinity and no hop across continents without a dock", () => {
    const { time, hop } = evaluate(data({}), context(), pos(0, 0), pos(0, 0, 1));
    expect(time).toBe(Infinity);
    expect(hop).toBeNull();
  });

  describe("boats", () => {
    const boat = data({
      transports: [{ fromDock: pos(0, 0), toDock: pos(0, 0, 1), seconds: 120, periodSec: 300 }],
    });

    it("adds half the period plus the ride across continents", () => {
      const { time, hop } = evaluate(boat, context(), pos(0, 0), pos(70, 0, 1));
      expect(time).toBeCloseTo(150 + 120 + 70 * WALK);
      expect(hop).toEqual({ kind: "boat", pos: pos(0, 0), taxiNodeId: null });
    });

    it("skips boats of the other faction", () => {
      const horde = data({ transports: [{ ...boat.transports[0], faction: "H" }] });
      expect(evaluate(horde, context(), pos(0, 0), pos(70, 0, 1)).time).toBe(Infinity);
    });
  });

  describe("portals", () => {
    const portal = data({ portals: [{ name: "test", from: pos(100, 0), to: pos(3000, 0) }] });

    it("takes a portal when walking to it plus the portal time beats walking", () => {
      const { time, hop } = evaluate(portal, context(), pos(0, 0), pos(3050, 0));
      expect(time).toBeCloseTo(100 * WALK + CONSTANTS.portalSec.value + 50 * WALK);
      expect(hop).toEqual({ kind: "portal", pos: pos(100, 0), taxiNodeId: null });
    });

    it("walks when the portal does not help", () => {
      const { time, hop } = evaluate(portal, context(), pos(0, 0), pos(50, 0));
      expect(time).toBeCloseTo(50 * WALK);
      expect(hop?.kind).toBe("walk");
    });

    it("is one-way", () => {
      const { time, hop } = evaluate(portal, context(), pos(3000, 0), pos(0, 0));
      expect(time).toBeCloseTo(3000 * WALK);
      expect(hop?.kind).toBe("walk");
    });
  });

  it("uses a ready hearthstone when home is next to the target", () => {
    const ctx = context({ hearth: { ready: true, pos: pos(5000, 5000) } });
    const { time, hop } = evaluate(data({}), ctx, pos(0, 0), pos(5030, 5040));
    expect(time).toBeCloseTo(CONSTANTS.hearthCastSec.value + CONSTANTS.hearthPenaltySec.value + 50 * WALK);
    expect(hop?.kind).toBe("hearth");
  });

  it("reports the hearth penalty only when the first hop is the hearthstone", () => {
    const ctx = context({ hearth: { ready: true, pos: pos(5000, 5000) } });
    const graph = buildGraph(data({}), ctx);
    const plan = solveFrom(graph, pos(0, 0), ctx);
    expect(hearthPenaltyOf(plan, graph, pos(5030, 5040), ctx)).toBe(CONSTANTS.hearthPenaltySec.value);
    expect(hearthPenaltyOf(plan, graph, pos(10, 0), ctx)).toBe(0);
  });

  it("walks a short trip even when the inn is next to the target", () => {
    const ctx = context({ hearth: { ready: true, pos: pos(100, 0) } });
    const { time, hop } = evaluate(data({}), ctx, pos(0, 0), pos(126, 0));
    expect(time).toBeCloseTo(126 * WALK);
    expect(hop?.kind).toBe("walk");
  });

  it("ignores the hearthstone while it is on cooldown", () => {
    const ctx = context({ hearth: { ready: false, pos: pos(5000, 5000) } });
    const { time, hop } = evaluate(data({}), ctx, pos(0, 0), pos(5030, 5040));
    expect(time).toBeCloseTo(Math.hypot(5030, 5040) * WALK);
    expect(hop?.kind).toBe("walk");
  });

  it("caches the nearest nodes of a target point per graph and stays exact for new origins", () => {
    const ctx = context({ knownTaxiNodes: new Set([1, 2]) });
    const graph = buildGraph(TAXI, ctx);
    const target = pos(10050, 0);
    const first = travelTime(solveFrom(graph, pos(0, 0), ctx), graph, target, ctx);
    const second = travelTime(solveFrom(graph, pos(9000, 0), ctx), graph, target, ctx);
    expect(graph.nearest.size).toBe(1);
    expect(first).toBeCloseTo(100 * WALK + 60 + 50 * WALK);
    expect(second).toBeCloseTo(evaluate(TAXI, ctx, pos(9000, 0), pos(10050, 0)).time);
  });

  it("reuses a graph for several targets and origins", () => {
    const ctx = context({ knownTaxiNodes: new Set([1, 2]) });
    const graph = buildGraph(TAXI, ctx);
    const first = solveFrom(graph, pos(0, 0), ctx);
    const second = solveFrom(graph, pos(10000, 0), ctx);
    expect(travelTime(first, graph, pos(10050, 0), ctx)).toBeCloseTo(100 * WALK + 60 + 50 * WALK);
    expect(travelTime(second, graph, pos(10050, 0), ctx)).toBeCloseTo(50 * WALK);
  });

  it("rejects a non-positive or non-finite speed", () => {
    for (const speed of [0, -1, NaN, Infinity]) {
      const ctx = context({ speed });
      expect(() => buildGraph(data({}), ctx)).toThrow(/speed/);
      const graph = buildGraph(data({}), context());
      expect(() => solveFrom(graph, pos(0, 0), ctx)).toThrow(/speed/);
    }
  });

  it("starts with the boat when the path is boat, taxi, walk", () => {
    const travel = data({
      taxiNodes: [
        { id: 1, name: "A", pos: pos(0, 0, 1), faction: "AH" },
        { id: 2, name: "B", pos: pos(20000, 0, 1), faction: "AH" },
      ],
      taxiEdges: [{ from: 1, to: 2, seconds: 60 }],
      transports: [{ fromDock: pos(0, 0), toDock: pos(0, 0, 1), seconds: 100, periodSec: 200 }],
    });
    const ctx = context({ knownTaxiNodes: new Set([1, 2]) });
    const { time, hop } = evaluate(travel, ctx, pos(0, 0), pos(20050, 0, 1));
    expect(time).toBeCloseTo(100 + 100 + 60 + 50 * WALK);
    expect(hop).toEqual({ kind: "boat", pos: pos(0, 0), taxiNodeId: null });
  });

  it("starts at the first node of a taxi chain", () => {
    const travel = data({
      taxiNodes: [
        { id: 1, name: "A", pos: pos(0, 0), faction: "AH" },
        { id: 2, name: "B", pos: pos(20000, 0), faction: "AH" },
        { id: 3, name: "C", pos: pos(40000, 0), faction: "AH" },
      ],
      taxiEdges: [
        { from: 1, to: 2, seconds: 60 },
        { from: 2, to: 3, seconds: 60 },
      ],
    });
    const ctx = context({ knownTaxiNodes: new Set([1, 2, 3]) });
    const { time, hop } = evaluate(travel, ctx, pos(0, 0), pos(40000, 0));
    expect(time).toBeCloseTo(120);
    expect(hop).toEqual({ kind: "taxi", pos: pos(0, 0), taxiNodeId: 1 });
  });

  it("only considers the 3 nearest graph nodes to the target", () => {
    const travel = data({
      taxiNodes: [
        { id: 1, name: "A", pos: pos(0, 0), faction: "AH" },
        { id: 2, name: "B", pos: pos(20000, 3000), faction: "AH" },
        { id: 3, name: "C", pos: pos(20000, 4000), faction: "AH" },
        { id: 4, name: "D", pos: pos(20000, 5000), faction: "AH" },
        { id: 5, name: "E", pos: pos(20000, -6000), faction: "AH" },
      ],
      taxiEdges: [
        { from: 1, to: 2, seconds: 600 },
        { from: 1, to: 3, seconds: 600 },
        { from: 1, to: 4, seconds: 600 },
        { from: 1, to: 5, seconds: 1 },
      ],
    });
    const ctx = context({ knownTaxiNodes: new Set([1, 2, 3, 4, 5]) });
    const { time } = evaluate(travel, ctx, pos(0, 0), pos(20000, 0));
    expect(time).toBeCloseTo(600 + 3000 * WALK);
  });
});

describe("baked walks", () => {
  const A = pos(0, 0);
  const B = pos(1000, 0);
  const twoTaxis = (walks: number[]) =>
    data({
      taxiNodes: [
        { id: 1, name: "A", pos: A, faction: "AH" },
        { id: 2, name: "B", pos: B, faction: "AH" },
      ],
      walkPlaces: [A, B],
      walks,
    });
  const known = context({ knownTaxiNodes: new Set([1, 2]) });

  it("walks between two fixed places along the baked yards, without the detour factor", () => {
    const { time, hop } = evaluate(twoTaxis([0, 1, 1100, 1100]), known, pos(0, 0), pos(1000, 0));
    expect(time).toBeCloseTo(1100 / SPEED);
    expect(hop?.kind).toBe("walk");
  });

  it("follows the direction of an asymmetric pair", () => {
    const travel = twoTaxis([0, 1, 1100, 3000]);
    expect(evaluate(travel, known, pos(0, 0), pos(1000, 0)).time).toBeCloseTo(1100 / SPEED);
    expect(evaluate(travel, known, pos(1000, 0), pos(0, 0)).time).toBeCloseTo(3000 / SPEED);
  });

  it("raises a direct walk to the baked walk between the nearest places", () => {
    const { time } = evaluate(twoTaxis([0, 1, 3000, 3000]), known, pos(0, 50), pos(1000, 50));
    expect(time).toBeCloseTo((3000 - (50 + 50) * CONSTANTS.landmarkDetourFactor.value) / SPEED);
  });

  it("never lowers a walk from or to a free point below the straight estimate", () => {
    const { time } = evaluate(twoTaxis([0, 1, 1010, 1010]), known, pos(0, 500), pos(1000, 500));
    expect(time).toBeCloseTo(1000 * WALK);
  });

  describe("two places with no baked pair", () => {
    const cluster = (x: number): WorldPos[] => [pos(x, 0), pos(x, 300), pos(x + 300, 0)];
    const west = cluster(0);
    const east = cluster(3000);
    const places = [...west, ...east];
    const inside = [0, 1, 400, 400, 0, 2, 400, 400, 1, 2, 500, 500, 3, 4, 400, 400, 3, 5, 400, 400, 4, 5, 500, 500];
    const islands = (taxiSeconds: number | null) =>
      data({
        taxiNodes: places.map((p, i) => ({ id: i + 1, name: `N${i + 1}`, pos: p, faction: "AH" as const })),
        taxiEdges: taxiSeconds == null ? [] : [{ from: 1, to: 4, seconds: taxiSeconds }],
        walkPlaces: places,
        walks: inside,
      });
    const ctx = context({ knownTaxiNodes: new Set([1, 4]) });

    it("does not walk between them, even when the straight line is short", () => {
      const { time, hop } = evaluate(islands(10000), ctx, pos(10, 0), pos(3010, 0));
      expect(time).toBeCloseTo(10 * WALK + 10000 + 10 * WALK);
      expect(hop).toEqual({ kind: "taxi", pos: west[0], taxiNodeId: 1 });
    });

    it("is unreachable without another way", () => {
      const { time, hop } = evaluate(islands(null), ctx, pos(10, 0), pos(3010, 0));
      expect(time).toBe(Infinity);
      expect(hop).toBeNull();
    });
  });

  // Real positions and costs: Taxi.lua and Walks.lua at the pinned Shortest Path Forever commit.
  describe("Felwood to Mount Hyjal", () => {
    const talonbranch = pos(6205.9, -1949.6, 1);
    const everlook = pos(6799.2, -4742.4, 1);
    const taintedFoothills = pos(4393.5, -2836.3, 1);
    const hyjal = (withWalks: boolean) =>
      data({
        taxiNodes: [
          { id: 65, name: "Talonbranch Glade, Felwood", pos: talonbranch, faction: "A" },
          { id: 52, name: "Everlook, Winterspring", pos: everlook, faction: "A" },
          { id: 3242, name: "Tainted Foothills, Mount Hyjal", pos: taintedFoothills, faction: "AH" },
        ],
        taxiEdges: [
          { from: 65, to: 52, seconds: 121 },
          { from: 52, to: 3242, seconds: 126.8 },
        ],
        walkPlaces: withWalks ? [talonbranch, everlook, taintedFoothills] : [],
        walks: withWalks ? [2, 1, 4436, 4529, 2, 0, 6413, 7415, 1, 0, 3113, 3746] : [],
      });
    const ctx = context({ speed: CONSTANTS.mountSpeed.value, knownTaxiNodes: new Set([65, 52, 3242]) });
    const start = pos(6150, -1990, 1);
    const goal = pos(4450, -2800, 1);

    it("walked straight into the mountains with straight-line estimates", () => {
      expect(evaluate(hyjal(false), ctx, start, goal).hop?.kind).toBe("walk");
    });

    it("sends the player to the flight master with the baked walks", () => {
      const { hop } = evaluate(hyjal(true), ctx, start, goal);
      expect(hop).toEqual({ kind: "taxi", pos: talonbranch, taxiNodeId: 65 });
    });

    it("does the same with the generated travel data", () => {
      const { hop } = evaluate(TRAVEL, ctx, start, goal);
      expect(hop?.kind).toBe("taxi");
      expect(hop?.taxiNodeId).toBe(65);
    });
  });
});

describe("portal factions", () => {
  const portal = (faction: "A" | "H") => data({ portals: [{ name: "gated", faction, from: pos(100, 0), to: pos(3000, 0) }] });

  it("takes a portal of the player's faction", () => {
    expect(evaluate(portal("A"), context(), pos(0, 0), pos(3050, 0)).hop?.kind).toBe("portal");
  });

  it("ignores a portal of the other faction", () => {
    const { time, hop } = evaluate(portal("H"), context(), pos(0, 0), pos(3050, 0));
    expect(time).toBeCloseTo(Math.hypot(3050, 0) * WALK);
    expect(hop?.kind).toBe("walk");
  });
});

describe("taxiDestination", () => {
  const CHAIN = data({
    taxiNodes: [
      { id: 1, name: "A", pos: pos(100, 0), faction: "AH" },
      { id: 2, name: "B", pos: pos(5000, 0), faction: "AH" },
      { id: 3, name: "C", pos: pos(10000, 0), faction: "AH" },
      { id: 4, name: "D", pos: pos(20000, 0), faction: "AH" },
    ],
    taxiEdges: [
      { from: 1, to: 2, seconds: 60 },
      { from: 2, to: 3, seconds: 60 },
      { from: 3, to: 4, seconds: 60 },
    ],
  });

  function destination(travel: TravelData, known: number[], target: WorldPos): number | null {
    const ctx = context({ knownTaxiNodes: new Set(known) });
    const graph = buildGraph(travel, ctx);
    const plan = solveFrom(graph, pos(0, 0), ctx);
    return taxiDestination(plan, graph, target, ctx);
  }

  it("returns the arrival node of a single flight", () => {
    expect(destination(TAXI, [1, 2], pos(10050, 0))).toBe(2);
  });

  it("returns the last node of a multi-hop flight", () => {
    expect(destination(CHAIN, [1, 2, 3, 4], pos(20050, 0))).toBe(4);
  });

  it("stops where the path walks between flights", () => {
    expect(destination(CHAIN, [1, 2, 4], pos(20050, 0))).toBe(2);
  });

  it("is null when the path walks", () => {
    expect(destination(TAXI, [1], pos(300, 400))).toBeNull();
    expect(destination(TAXI, [1, 2], pos(50, 0))).toBeNull();
  });
});

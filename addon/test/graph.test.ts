import { describe, expect, it } from "vitest";
import { CONSTANTS } from "../src/core/constants";
import type { WorldPos } from "../src/core/geometry";
import type { TravelData } from "../src/data/generated/travel";
import { buildGraph, firstHop, solveFrom, travelTime, type TravelContext } from "../src/travel/graph";

const SPEED = 7;
const WALK = CONSTANTS.detourFactor.value / SPEED;

const pos = (x: number, y: number, continent = 0): WorldPos => ({ continent, x, y });

const SOURCE: TravelData["source"] = {
  name: "Shortest Path Forever",
  version: "test",
  build: "test",
  generatedOn: "2026-11-27",
};

function data(partial: Partial<TravelData>): TravelData {
  return { source: SOURCE, taxiNodes: [], taxiEdges: [], transports: [], ...partial };
}

function context(partial: Partial<TravelContext> = {}): TravelContext {
  return {
    speed: SPEED,
    knownTaxiNodes: new Set<number>(),
    faction: "A",
    hearth: { ready: false, pos: null },
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

  it("uses a ready hearthstone when home is next to the target", () => {
    const ctx = context({ hearth: { ready: true, pos: pos(5000, 5000) } });
    const { time, hop } = evaluate(data({}), ctx, pos(0, 0), pos(5030, 5040));
    expect(time).toBeCloseTo(CONSTANTS.hearthCastSec.value + 50 * WALK);
    expect(hop?.kind).toBe("hearth");
  });

  it("ignores the hearthstone while it is on cooldown", () => {
    const ctx = context({ hearth: { ready: false, pos: pos(5000, 5000) } });
    const { time, hop } = evaluate(data({}), ctx, pos(0, 0), pos(5030, 5040));
    expect(time).toBeCloseTo(Math.hypot(5030, 5040) * WALK);
    expect(hop?.kind).toBe("walk");
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

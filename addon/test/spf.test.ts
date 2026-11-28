import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import { chooseHop, createSpf, type SpfApi, type SpfVerdict } from "../src/game/spf";
import type { Detour, TravelHop } from "../src/travel/graph";

const at = (x: number, y = 0): WorldPos => ({ continent: 0, x, y });
const walk: TravelHop = { kind: "walk", pos: at(900), taxiNodeId: null };
const taxi: TravelHop = { kind: "taxi", pos: at(100), taxiNodeId: 1 };
const seconds = (value: number): SpfVerdict => ({ kind: "seconds", seconds: value });

describe("chooseHop", () => {
  const flight = (sec: number): Detour => ({ hop: taxi, seconds: sec });
  const FAR = 900;

  it("keeps a first hop that is not a walk, whatever SPF says", () => {
    expect(chooseHop(taxi, { hop: walk, seconds: 10 }, 100, { kind: "unreachable" }, FAR)).toBe(taxi);
    expect(chooseHop(taxi, null, 100, seconds(900), FAR)).toBe(taxi);
  });

  it("keeps the walk without an SPF answer", () => {
    expect(chooseHop(walk, flight(110), 100, { kind: "none" }, FAR)).toBe(walk);
  });

  it("takes the detour only when its own time beats SPF's walk", () => {
    expect(chooseHop(walk, flight(300), 100, seconds(250), FAR)).toBe(walk);
    expect(chooseHop(walk, flight(300), 100, seconds(300), FAR)).toBe(walk);
    expect(chooseHop(walk, flight(300), 100, seconds(301), FAR)).toBe(taxi);
    expect(chooseHop(walk, flight(110), 100, seconds(126), FAR)).toBe(taxi);
  });

  it("keeps the walk when SPF finds it faster than ours and the detour is slower than our walk", () => {
    expect(chooseHop(walk, flight(120), 100, seconds(40), FAR)).toBe(walk);
  });

  it("takes the detour when SPF finds no way to a target over 100 yards away", () => {
    expect(chooseHop(walk, flight(900), 100, { kind: "unreachable" }, 101)).toBe(taxi);
  });

  it("keeps walking to a short off-mesh target SPF cannot reach", () => {
    expect(chooseHop(walk, flight(900), 100, { kind: "unreachable" }, 100)).toBe(walk);
    expect(chooseHop(walk, flight(900), 100, { kind: "unreachable" }, 20)).toBe(walk);
  });

  it("keeps the walk when there is no alternative", () => {
    expect(chooseHop(walk, null, 100, seconds(900), FAR)).toBe(walk);
    expect(chooseHop(walk, null, 100, { kind: "unreachable" }, FAR)).toBe(walk);
  });

  it("is null without a first hop", () => {
    expect(chooseHop(null, flight(10), 100, seconds(900), FAR)).toBeNull();
  });
});

describe("createSpf", () => {
  type Answer = [number | null, string | null];

  function setup(answer: Answer = [60, null], version = 2) {
    const world = { calls: [] as number[][], answer, reports: [] as string[], present: true, map: true };
    const api = {
      version,
      Estimate: (...args: number[]) => {
        world.calls.push(args);
        return world.answer;
      },
    } as unknown as SpfApi;
    const spf = createSpf({
      api: () => (world.present ? api : null),
      toMap: (pos) => (world.map ? { uiMapId: 7, x: pos.x / 1000, y: pos.y / 1000 } : null),
      report: (reason) => world.reports.push(reason),
    });
    return { world, spf };
  }

  it("passes uiMapIDs and 0-1 coordinates and returns the seconds", () => {
    const { world, spf } = setup();
    expect(spf.estimate(at(100, 200), at(500, 600))).toEqual(seconds(60));
    expect(world.calls).toEqual([[7, 0.1, 0.2, 7, 0.5, 0.6]]);
  });

  it("answers none without calling when SPF is absent, in an unsupported version or off the map", () => {
    const absent = setup();
    absent.world.present = false;
    expect(absent.spf.estimate(at(0), at(1))).toEqual({ kind: "none" });
    const future = setup([60, null], 3);
    expect(future.spf.estimate(at(0), at(1))).toEqual({ kind: "none" });
    expect(setup([60, null], 1).spf.estimate(at(0), at(1))).toEqual(seconds(60));
    const offMap = setup();
    offMap.world.map = false;
    expect(offMap.spf.estimate(at(0), at(1))).toEqual({ kind: "none" });
    expect([absent.world.calls, future.world.calls, offMap.world.calls]).toEqual([[], [], []]);
  });

  it("maps reasons: unreachable is a verdict, combat and loading are not and are not cached", () => {
    const { world, spf } = setup([null, "unreachable"]);
    expect(spf.estimate(at(0), at(1))).toEqual({ kind: "unreachable" });
    const busy = setup([null, "combat"]);
    expect(busy.spf.estimate(at(0), at(1))).toEqual({ kind: "none" });
    busy.world.answer = [null, "loading"];
    expect(busy.spf.estimate(at(0), at(1))).toEqual({ kind: "none" });
    expect(busy.world.calls.length).toBe(2);
    expect(busy.world.reports).toEqual([]);
    expect(world.reports).toEqual([]);
  });

  it("reports an unexpected reason and answers none", () => {
    const { world, spf } = setup([null, "invalid"]);
    expect(spf.estimate(at(0), at(1))).toEqual({ kind: "none" });
    expect(world.reports).toEqual(["invalid"]);
  });

  it("caches per target and moves the cache after 30 yards", () => {
    const { world, spf } = setup();
    spf.estimate(at(0), at(500));
    spf.estimate(at(29), at(500));
    expect(world.calls.length).toBe(1);
    spf.estimate(at(30), at(500));
    expect(world.calls.length).toBe(2);
    spf.estimate(at(30), at(600));
    expect(world.calls.length).toBe(3);
    spf.estimate(at(30), at(600));
    expect(world.calls.length).toBe(3);
  });
});

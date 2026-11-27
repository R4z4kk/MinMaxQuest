import { describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import { CLUSTER_RADIUS_YARDS, WAYPOINT_MAX, WAYPOINT_RADIUS_YARDS, clusterSpawns, killLoop, nextLoopIndex, pickCluster, waypointLoop } from "../src/targets/spawns";

const at = (x: number, y: number, continent = 0): WorldPos => ({ continent, x, y });

describe("clusterSpawns", () => {
  it("splits two groups 500 yards apart", () => {
    const clusters = clusterSpawns([at(0, 0), at(10, 0), at(500, 0), at(510, 0)], CLUSTER_RADIUS_YARDS);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].points).toHaveLength(2);
    expect(clusters[0].center).toEqual(at(5, 0));
    expect(clusters[1].center).toEqual(at(505, 0));
  });
  it("ignores sentinel points", () => {
    const clusters = clusterSpawns([at(NaN, NaN), at(0, 0), at(Infinity, 3)], CLUSTER_RADIUS_YARDS);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].points).toEqual([at(0, 0)]);
  });
  it("never merges across continents", () => {
    const clusters = clusterSpawns([at(0, 0, 0), at(1, 1, 1)], CLUSTER_RADIUS_YARDS);
    expect(clusters.map((c) => c.center.continent)).toEqual([0, 1]);
  });
  it("returns nothing for no points", () => expect(clusterSpawns([], CLUSTER_RADIUS_YARDS)).toEqual([]));
});

describe("pickCluster", () => {
  const near = { center: at(0, 0), points: [at(0, 0)] };
  const far = { center: at(100, 0), points: [at(100, 0)] };
  it("picks the faster cluster", () => expect(pickCluster([far, near], (p) => p.x)).toBe(near));
  it("breaks ties with the larger cluster", () => {
    const big = { center: at(5, 0), points: [at(5, 0), at(6, 0)] };
    expect(pickCluster([near, big], () => 10)).toBe(big);
  });
  it("treats a NaN time as Infinity", () => {
    const times = new Map([[near, NaN], [far, 50]]);
    expect(pickCluster([near, far], (p) => times.get(p === near.center ? near : far) ?? NaN)).toBe(far);
  });
  it("returns null when empty", () => expect(pickCluster([], () => 0)).toBeNull());
});

describe("killLoop", () => {
  it("visits every point once, nearest first", () => {
    const cluster = { center: at(0, 0), points: [at(30, 0), at(10, 0), at(20, 0)] };
    expect(killLoop(cluster, at(0, 0))).toEqual([at(10, 0), at(20, 0), at(30, 0)]);
    expect(cluster.points[0]).toEqual(at(30, 0));
  });
});

describe("killLoop edge cases", () => {
  it("returns [] for an empty cluster", () => expect(killLoop({ center: at(0, 0), points: [] }, at(0, 0))).toEqual([]));
  it("visits every point once from another continent", () => {
    const cluster = { center: at(0, 0), points: [at(30, 0), at(10, 0), at(20, 0)] };
    const loop = killLoop(cluster, at(0, 0, 1));
    expect(loop).toHaveLength(3);
    expect(new Set(loop).size).toBe(3);
  });
});

describe("nextLoopIndex", () => {
  const loop = [at(0, 0), at(100, 0), at(200, 0)];
  it("advances at 20 yards", () => expect(nextLoopIndex(loop, 0, at(20, 0), 25)).toBe(1));
  it("stays put on NaN player coordinates", () => expect(nextLoopIndex(loop, 1, at(NaN, 0), 25)).toBe(1));
  it("stays at 30 yards", () => expect(nextLoopIndex(loop, 0, at(30, 0), 25)).toBe(0));
  it("wraps at the end", () => expect(nextLoopIndex(loop, 2, at(200, 0), 25)).toBe(0));
  it("returns 0 for an empty loop", () => expect(nextLoopIndex([], 5, at(0, 0), 25)).toBe(0));
  it("resets an out-of-range index", () => expect(nextLoopIndex(loop, 7, at(0, 0), 25)).toBe(0));
});

describe("waypointLoop", () => {
  const cluster = { center: at(0, 0), points: [at(0, 0)] };
  const loop = (points: WorldPos[], start = at(0, 0)) => waypointLoop(points, cluster, start, WAYPOINT_RADIUS_YARDS, WAYPOINT_MAX);
  it("keeps the 25 nearest of 30 points, ordered nearest-neighbour from the start", () => {
    const points: WorldPos[] = [];
    for (let i = 0; i < 30; i++) points.push(at(i * 5, 0));
    const result = loop(points);
    expect(result).toHaveLength(25);
    expect(result[0]).toEqual(at(0, 0));
    expect(result[24]).toEqual(at(120, 0));
    expect(result).toEqual(points.slice(0, 25));
  });
  it("starts from the player side", () => {
    expect(loop([at(0, 0), at(10, 0), at(20, 0)], at(100, 0))).toEqual([at(20, 0), at(10, 0), at(0, 0)]);
  });
  it("excludes points at 300 yards and on another continent", () => {
    expect(loop([at(0, 0), at(300, 0), at(5, 0, 1), at(240, 0)])).toEqual([at(0, 0), at(240, 0)]);
  });
  it("returns the single point", () => expect(loop([at(0, 0)])).toEqual([at(0, 0)]));
});

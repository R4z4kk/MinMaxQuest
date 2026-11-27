import { describe, expect, it } from "vitest";
import { createNeighbourFinder, neighbourMaps, type HbdMap, type HbdMapData, type MapRect } from "../src/game/neighbours";

const rect = (uiMapId: number, x: number, instance = 0): MapRect => ({ uiMapId, instance, left: x + 1000, top: 1000, width: 1000, height: 1000 });

describe("neighbourMaps", () => {
  it("always includes the current map", () => {
    expect([...neighbourMaps(1, [])]).toEqual([1]);
  });

  it("includes touching rectangles", () => {
    expect(neighbourMaps(1, [rect(1, 0), rect(2, 1000)]).has(2)).toBe(true);
  });

  it("includes a 250 yard gap and drops a 400 yard gap", () => {
    const result = neighbourMaps(1, [rect(1, 0), rect(2, 1250), rect(3, 1400)]);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(false);
  });

  it("measures diagonal gaps in a straight line", () => {
    const diagonal: MapRect = { uiMapId: 2, instance: 0, left: 2250, top: 2250, width: 1000, height: 1000 };
    expect(neighbourMaps(1, [rect(1, 0), diagonal]).has(2)).toBe(false);
  });

  it("ignores another continent", () => {
    expect(neighbourMaps(1, [rect(1, 0), rect(2, 1000, 1)]).has(2)).toBe(false);
  });
});

const hbd = (width: number, height: number, left: number, top: number, mapType: number, parent: number, instance = 0): HbdMap =>
  Object.assign([width, height, left, top], { mapType, parent, instance });

describe("createNeighbourFinder", () => {
  const data: HbdMapData = {
    1: hbd(1000, 1000, 1000, 1000, 3, 0),
    2: hbd(1000, 1000, 2100, 1000, 3, 0),
    3: hbd(1000, 1000, 9000, 1000, 3, 0),
    4: hbd(10, 10, 500, 500, 4, 1),
    5: hbd(0, 0, 0, 0, 2, 0),
  };
  const finder = (read: () => HbdMapData | null = () => data) => createNeighbourFinder(read, 3);

  it("returns the zone and its neighbours", () => {
    expect([...finder().around(1)].sort()).toEqual([1, 2]);
  });

  it("resolves a sub-map to its parent zone", () => {
    expect([...finder().around(4)].sort()).toEqual([1, 2]);
  });

  it("returns nothing for an unknown map, no map or a map without a zone", () => {
    const f = finder();
    expect(f.around(null).size).toBe(0);
    expect(f.around(99).size).toBe(0);
    expect(f.around(5).size).toBe(0);
  });

  it("returns nothing while the map data is missing", () => {
    expect(finder(() => null).around(1).size).toBe(0);
  });

  it("computes once per map", () => {
    let reads = 0;
    const f = finder(() => (reads++, data));
    expect(f.around(1)).toBe(f.around(1));
    expect(reads).toBe(1);
  });
});

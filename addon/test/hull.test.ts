import { describe, expect, it } from "vitest";
import { convexHull, dashSegments, inflate, type Vec2 } from "../src/map/hull";

const v = (x: number, y: number): Vec2 => ({ x, y });
const key = (p: Vec2) => `${p.x},${p.y}`;

describe("convexHull", () => {
  it("keeps the outer points of a square and drops the inner one", () => {
    const hull = convexHull([v(0, 0), v(10, 0), v(5, 5), v(10, 10), v(0, 10)]);
    expect(hull.map(key).sort()).toEqual(["0,0", "0,10", "10,0", "10,10"]);
  });

  it("drops collinear and duplicate points", () => {
    const hull = convexHull([v(0, 0), v(5, 0), v(10, 0), v(10, 0), v(5, 8)]);
    expect(hull.map(key).sort()).toEqual(["0,0", "10,0", "5,8"]);
  });

  it("returns fewer than three points when all points are on a line", () => {
    expect(convexHull([v(0, 0), v(1, 1), v(2, 2)])).toHaveLength(2);
    expect(convexHull([v(3, 3)])).toEqual([v(3, 3)]);
    expect(convexHull([])).toEqual([]);
  });

  it("does not change its input", () => {
    const points = [v(10, 0), v(0, 0), v(0, 10)];
    convexHull(points);
    expect(points).toEqual([v(10, 0), v(0, 0), v(0, 10)]);
  });
});

describe("inflate", () => {
  it("moves every vertex away from the centroid by the margin", () => {
    const out = inflate([v(-10, 0), v(10, 0), v(0, 10), v(0, -10)], 2);
    expect(out).toEqual([v(-12, 0), v(12, 0), v(0, 12), v(0, -12)]);
  });

  it("keeps a vertex sitting on the centroid", () => {
    expect(inflate([v(1, 1)], 5)).toEqual([v(1, 1)]);
  });
});

describe("dashSegments", () => {
  const square = [v(0, 0), v(100, 0), v(100, 100), v(0, 100)];

  it("alternates dashes and gaps along every edge of the closed outline", () => {
    const dashes = dashSegments(square, 6, 4, 1000);
    expect(dashes).toHaveLength(40);
    expect(dashes[0]).toEqual({ x1: 0, y1: 0, x2: 6, y2: 0 });
    expect(dashes[1]).toEqual({ x1: 10, y1: 0, x2: 16, y2: 0 });
    const last = dashes[dashes.length - 1];
    expect(last.x1).toBeCloseTo(0);
    expect(last.y1).toBeCloseTo(10);
    expect(last.y2).toBeCloseTo(4);
  });

  it("lengthens the period to stay within the maximum", () => {
    const dashes = dashSegments(square, 6, 4, 8);
    expect(dashes).toHaveLength(8);
    expect(dashes[0]).toEqual({ x1: 0, y1: 0, x2: 30, y2: 0 });
  });

  it("gives a short edge one dash", () => {
    expect(dashSegments([v(0, 0), v(2, 0), v(1, 1)], 6, 4, 100)).toHaveLength(3);
  });

  it("returns nothing for a point or a zero maximum", () => {
    expect(dashSegments([v(0, 0)], 6, 4, 10)).toEqual([]);
    expect(dashSegments(square, 6, 4, 0)).toEqual([]);
  });
});

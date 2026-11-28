import { describe, expect, it } from "vitest";
import type { WorldPos } from "../../addon/src/core/geometry";
import { importWalks, type OurPlace, type SpfPair, type SpfPlace } from "./walks";

const pos = (x: number, y: number, continent = 0): WorldPos => ({ continent, x, y });

const PLACES: SpfPlace[] = [
  { map: 0, id: "taxi1", x: 0, y: 0 },
  { map: 0, id: "dock5", x: 1000, y: 0 },
  { map: 0, id: "portal3", x: 2000, y: 0 },
  { map: 0, id: "teleport9", x: 3000, y: 0 },
  { map: 0, id: "dock1001", x: 4000, y: 0 },
  { map: 0, id: "zz7", x: 5000, y: 0 },
];

const OURS: OurPlace[] = [
  { pos: pos(0.3, -0.2), taxiId: 1 },
  { pos: pos(1000.4, 0), taxiId: null },
  { pos: pos(1999.6, 0.4), taxiId: null },
  { pos: pos(7000, 0), taxiId: null },
];

function yards(result: ReturnType<typeof importWalks>, from: WorldPos, to: WorldPos): number | null {
  const a = result.walkPlaces.indexOf(from);
  const b = result.walkPlaces.indexOf(to);
  for (let i = 0; i < result.walks.length; i += 4) {
    if (result.walks[i] === a && result.walks[i + 1] === b) return result.walks[i + 2];
    if (result.walks[i] === b && result.walks[i + 1] === a) return result.walks[i + 3];
  }
  return null;
}

describe("importWalks", () => {
  const pairs: SpfPair[] = [
    { map: 0, key: "dock5 taxi1", there: 1200, back: 1200 },
    { map: 0, key: "dock5 portal3", there: 1500, back: 1900 },
    { map: 0, key: "portal3 taxi1", there: false, back: false },
    { map: 0, key: "taxi1 teleport9", there: 3100, back: 3100 },
  ];

  it("keeps our places that SPF knows, by taxi id or by position", () => {
    const result = importWalks(PLACES, pairs, OURS);
    expect(result.walkPlaces).toEqual([OURS[0].pos, OURS[1].pos, OURS[2].pos]);
    expect(result.unbaked).toEqual([OURS[3].pos]);
  });

  it("stores a symmetric pair both ways", () => {
    const result = importWalks(PLACES, pairs, OURS);
    expect(yards(result, OURS[0].pos, OURS[1].pos)).toBe(1200);
    expect(yards(result, OURS[1].pos, OURS[0].pos)).toBe(1200);
  });

  it("keeps the reverse cost of an asymmetric pair", () => {
    const result = importWalks(PLACES, pairs, OURS);
    expect(yards(result, OURS[1].pos, OURS[2].pos)).toBe(1500);
    expect(yards(result, OURS[2].pos, OURS[1].pos)).toBe(1900);
  });

  it("drops pairs with no way through and pairs with a place we do not model", () => {
    const result = importWalks(PLACES, pairs, OURS);
    expect(yards(result, OURS[0].pos, OURS[2].pos)).toBeNull();
    expect(result.walks.length).toBe(8);
  });

  it("marks a one-way pair with -1 on the blocked side", () => {
    const oneWay: SpfPair[] = [{ map: 0, key: "dock5 taxi1", there: false, back: 800 }];
    const result = importWalks(PLACES, oneWay, OURS);
    expect(yards(result, OURS[1].pos, OURS[0].pos)).toBe(-1);
    expect(yards(result, OURS[0].pos, OURS[1].pos)).toBe(800);
  });

  it("reports SPF places we do not model, and unknown kinds", () => {
    const result = importWalks(PLACES, pairs, OURS);
    expect(result.unmodelled).toEqual({ dock: 1, teleport: 1, zz: 1 });
    expect(result.unknownKinds).toEqual(["zz"]);
  });

  it("refuses a taxi place that moved: the baked costs are stale", () => {
    const moved = [{ ...PLACES[0], x: 40 }, ...PLACES.slice(1)];
    expect(() => importWalks(moved, pairs, OURS)).toThrow(/taxi1.*stale/);
  });

  it("refuses a pair naming an unknown place", () => {
    expect(() => importWalks(PLACES, [{ map: 0, key: "dock5 taxi404", there: 1, back: 1 }], OURS)).toThrow(/taxi404/);
  });

  it("refuses a position matching two SPF places", () => {
    const twins = [...PLACES, { map: 0, id: "dock6", x: 1000, y: 1 }];
    expect(() => importWalks(twins, pairs, OURS)).toThrow(/dock5.*dock6|dock6.*dock5/);
  });
});

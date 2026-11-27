import { describe, expect, it } from "vitest";
import { distance, formatDistance, formatDuration, heading, type WorldPos } from "../src/core/geometry";

const at = (x: number, y: number, continent = 0): WorldPos => ({ continent, x, y });

describe("distance", () => {
  it("computes 3-4-5", () => expect(distance(at(0, 0), at(3, 4))).toBe(5));
  it("is Infinity across continents", () => expect(distance(at(0, 0, 0), at(3, 4, 1))).toBe(Infinity));
});

describe("heading", () => {
  it("returns null when facing is null", () => expect(heading(at(0, 0), null, at(10, 0))).toBeNull());
  it("returns null across continents", () => expect(heading(at(0, 0, 0), 0, at(10, 0, 1))).toBeNull());
  it("is 0 for target due north, facing 0", () => expect(heading(at(0, 0), 0, at(10, 0))).toBeCloseTo(0));
  it("is pi/2 for target due west, facing 0", () => expect(heading(at(0, 0), 0, at(0, 10))).toBeCloseTo(Math.PI / 2));
  it("is 0 for target due west, facing pi/2", () => expect(heading(at(0, 0), Math.PI / 2, at(0, 10))).toBeCloseTo(0));
  it("stays within [0, 2pi)", () => {
    const h = heading(at(0, 0), Math.PI / 2, at(10, 0));
    expect(h).not.toBeNull();
    expect(h as number).toBeGreaterThanOrEqual(0);
    expect(h as number).toBeLessThan(2 * Math.PI);
    expect(h as number).toBeCloseTo(1.5 * Math.PI);
  });
});

describe("formatDistance", () => {
  it("shows metres under 1000", () => expect(formatDistance(142.4, "frFR")).toBe("142 m"));
  it("uses comma decimal in frFR", () => expect(formatDistance(1100, "frFR")).toBe("1,1 km"));
  it("uses dot decimal in enUS", () => expect(formatDistance(1100, "enUS")).toBe("1.1 km"));
  it("keeps one decimal on whole km", () => expect(formatDistance(2000, "enUS")).toBe("2.0 km"));
  it("shows a dash for Infinity", () => expect(formatDistance(Infinity, "enUS")).toBe("—"));
});

describe("formatDuration", () => {
  it("shows <1 min under 60 s", () => expect(formatDuration(59)).toBe("<1 min"));
  it("rounds to minutes", () => expect(formatDuration(100)).toBe("~2 min"));
  it("shows a dash for Infinity", () => expect(formatDuration(Infinity)).toBe("—"));
  it("shows a dash for NaN", () => expect(formatDuration(NaN)).toBe("—"));
});

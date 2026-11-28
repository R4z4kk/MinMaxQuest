import { describe, expect, it } from "vitest";
import { pickTaxiLeg } from "../src/taxi/autoFly";

describe("pickTaxiLeg", () => {
  it("prefers the leg re-planned with the known flight paths when it leaves from the same flight master", () => {
    expect(pickTaxiLeg({ from: 1, to: 2 }, { from: 1, to: 9 })).toEqual({ from: 1, to: 9 });
  });

  it("keeps the route leg when the re-planned one leaves from elsewhere or is missing", () => {
    expect(pickTaxiLeg({ from: 1, to: 2 }, { from: 3, to: 9 })).toEqual({ from: 1, to: 2 });
    expect(pickTaxiLeg({ from: 1, to: 2 }, null)).toEqual({ from: 1, to: 2 });
  });

  it("falls back to the re-planned leg without a route leg", () => {
    expect(pickTaxiLeg(null, { from: 3, to: 9 })).toEqual({ from: 3, to: 9 });
    expect(pickTaxiLeg(null, null)).toBeNull();
  });
});

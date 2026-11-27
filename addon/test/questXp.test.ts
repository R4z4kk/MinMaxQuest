import { describe, expect, it } from "vitest";
import { questXp } from "../src/core/questXp";

describe("questXp", () => {
  it("returns full xp at equal level", () => expect(questXp(1000, 10, 10, 60)).toBe(1000));
  it("applies 80% six levels above quest", () => expect(questXp(1000, 10, 16, 60)).toBe(800));
  it("floors at 50%", () => expect(questXp(1000, 10, 30, 60)).toBe(500));
  it("rounds to 5 band", () => expect(questXp(87, 10, 10, 60)).toBe(85));
  it("uses the 10 band", () => expect(questXp(300, 10, 16, 60)).toBe(240));
  it("uses the 50 band", () => expect(questXp(2000, 10, 10, 60)).toBe(2000));
  it("clamps multiplier for quest above char level", () => expect(questXp(1000, 20, 10, 60)).toBe(1000));
  it("returns 0 at max level", () => expect(questXp(1000, 55, 60, 60)).toBe(0));
});

import { describe, expect, it } from "vitest";
import { questXp } from "../src/core/questXp";

describe("questXp", () => {
  it("returns full xp at equal level", () => expect(questXp(1000, 10, 10, 60)).toBe(1000));
  it("applies 80% six levels above quest", () => expect(questXp(1000, 10, 16, 60)).toBe(800));
  it("floors at 50%", () => expect(questXp(1000, 10, 30, 60)).toBe(500));
  it("rounds to 5 band", () => expect(questXp(87, 10, 10, 60)).toBe(85));
  it("returns 0 at max level", () => expect(questXp(1000, 55, 60, 60)).toBe(0));
});

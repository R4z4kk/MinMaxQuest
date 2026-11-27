import { describe, expect, it } from "vitest";
import { parseCount } from "../ingest/counts";

describe("parseCount", () => {
  it("reads <n> <name>", () => {
    expect(parseCount(["Kill 10 Kobold Vermin, then return to Marshal McBride."], "Kobold Vermin")).toBe(10);
    expect(parseCount(["Bring 8 Gold Dust to Remy."], "gold dust")).toBe(8);
  });

  it("tolerates plurals", () => {
    expect(parseCount(["Collect 4 Wolf Meats."], "Wolf Meat")).toBe(4);
    expect(parseCount(["Bring 6 Fine Boxes."], "Fine Box")).toBe(6);
  });

  it("reads a measure word before the name", () => {
    expect(parseCount(["Bring 8 pieces of Tough Wolf Meat to Eagan."], "Tough Wolf Meat")).toBe(8);
  });

  it("reads <name> x<n> and <name> (<n>)", () => {
    expect(parseCount(["Collect: Wolf Meat x5"], "Wolf Meat")).toBe(5);
    expect(parseCount(["Wolf Meat (7)"], "Wolf Meat")).toBe(7);
  });

  it("returns null when the target is ambiguous or absent", () => {
    expect(parseCount(["Kill 10 Kobold Vermin.", "Kill 5 Kobold Vermin."], "Kobold Vermin")).toBeNull();
    expect(parseCount(["Kill 10 Kobold Vermin."], "Defias Thug")).toBeNull();
    expect(parseCount(["Kill the Kobold Vermin."], "Kobold Vermin")).toBeNull();
    expect(parseCount(null, "Kobold Vermin")).toBeNull();
    expect(parseCount(["Kill 10 Kobold Workers."], "")).toBeNull();
  });

  it("keeps one value when the same number repeats", () => {
    expect(parseCount(["Kill 10 Kobold Vermin.", "Kobold Vermin (10)"], "Kobold Vermin")).toBe(10);
  });

  it("does not match a name that is the start of a longer name", () => {
    expect(parseCount(["Kill 10 Kobold Vermin."], "Kobold")).toBeNull();
  });
});

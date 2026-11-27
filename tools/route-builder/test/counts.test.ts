import { describe, expect, it } from "vitest";
import { parseCount, textCount } from "../ingest/counts";

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
    expect(parseCount(null, "Kobold Vermin")).toBeNull();
    expect(parseCount(["Kill 10 Kobold Workers."], "")).toBeNull();
  });

  it("keeps one value when the same number repeats", () => {
    expect(parseCount(["Kill 10 Kobold Vermin.", "Kobold Vermin (10)"], "Kobold Vermin")).toBe(10);
  });

  it("reads spelled-out numbers and <n> of <name>", () => {
    expect(parseCount(["Bring five Centipaar insect parts from the Noxious Lair."], "Centipaar Insect Parts")).toBe(5);
    expect(parseCount(["Bring twenty-four Robo-mechanical Guts to Shoni."], "Robo-mechanical Guts")).toBe(24);
    expect(parseCount(["Bring two Heavy Mithril Boots and one Ornate Mithril Pants."], "Ornate Mithril Pants")).toBe(1);
    expect(parseCount(["Recover fourteen Crystallized Azsharite."], "Crystallized Azsharite")).toBe(14);
    expect(parseCount(["Bring 12 of Zanzil's Mixture to Crank."], "Zanzil's Mixture")).toBe(12);
    expect(parseCount(["Help someone Kobold Vermin."], "Kobold Vermin")).toBe(1);
  });

  it("does not take a name behind a plural measure word as singular", () => {
    expect(parseCount(["Bring him the bottles of Pupellyverbos Port he lost."], "Pupellyverbos Port")).toBeNull();
  });

  it("reads a pluralised inner word", () => {
    expect(parseCount(["Bring 6 Vials of Animal Blood and 18 Duskweed Petals to Remy."], "Vial of Animal Blood")).toBe(6);
    expect(parseCount(["Collect 3 Bodies of Water."], "Body of Water")).toBe(3);
  });

  it("counts a name named only in its singular form as 1", () => {
    expect(textCount(["Bring the Head of Hogger to Marshal Dughan."], "Head of Hogger")).toEqual({ count: 1, singular: true });
    expect(textCount(["Defeat Morgan the Collector."], "Morgan the Collector")).toEqual({ count: 1, singular: true });
    expect(textCount(["Kill 10 Kobold Vermin."], "Kobold Vermin")).toEqual({ count: 10, singular: false });
  });

  it("returns null for a plural or mixed name without a number", () => {
    expect(parseCount(["Collect Wolf Meats."], "Wolf Meat")).toBeNull();
    expect(parseCount(["Collect Wolf Meats. Wolf Meat drops from wolves."], "Wolf Meat")).toBeNull();
    expect(parseCount(["Kill Kobold Vermin."], "Kobold")).toBeNull();
  });

  it("does not match a name that is the start of a longer name", () => {
    expect(parseCount(["Kill 10 Kobold Vermin."], "Kobold")).toBeNull();
  });
});

import { expect, it } from "vitest";
import { findTaxiIndex, normalizeTaxiName } from "../src/taxi/match";

it("normalizes case, punctuation and spaces", () => {
  expect(normalizeTaxiName("Stormwind, Elwynn")).toBe("stormwind elwynn");
  expect(normalizeTaxiName("  Tarren   Mill -- Hillsbrad ")).toBe("tarren mill hillsbrad");
});

it("strips accents", () => {
  expect(normalizeTaxiName("Hurlevent, Elwynn")).toBe("hurlevent elwynn");
  expect(normalizeTaxiName("Forêt d'Éternautes, Désolace")).toBe("foret d eternautes desolace");
});

it("keeps non-latin letters", () => {
  expect(normalizeTaxiName("штормград, элвиннский")).toBe("штормград элвиннский");
});

it("finds the 1-based index of a matching name", () => {
  const names = ["Ironforge, Dun Morogh", "Stormwind, Elwynn", "Darkshire, Duskwood"];
  expect(findTaxiIndex(names, "stormwind elwynn")).toBe(2);
  expect(findTaxiIndex(names, "Darkshire, Duskwood")).toBe(3);
});

it("returns null for an unknown name", () => {
  expect(findTaxiIndex(["Ironforge, Dun Morogh"], "Stormwind, Elwynn")).toBeNull();
  expect(findTaxiIndex([], "Stormwind, Elwynn")).toBeNull();
});

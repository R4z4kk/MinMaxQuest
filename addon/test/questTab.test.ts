import { expect, it } from "vitest";
import { stepIcon } from "../src/ui/questTab";

it("maps every step type to its icon", () => {
  expect(stepIcon("accept")).toBe("accept");
  expect(stepIcon("turnin")).toBe("turnin");
  expect(stepIcon("complete")).toBe("kill");
  expect(stepIcon("grind")).toBe("kill");
  expect(stepIcon("dungeon")).toBe("kill");
  expect(stepIcon("fly")).toBe("fly");
  expect(stepIcon("getFlightPath")).toBe("fly");
  expect(stepIcon("hearth")).toBe("hearth");
  expect(stepIcon("setHearth")).toBe("hearth");
});

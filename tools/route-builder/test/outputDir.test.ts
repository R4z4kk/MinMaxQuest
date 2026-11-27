import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { outputDir } from "../emit/outputDir";

describe("outputDir", () => {
  it("writes full runs to the committed data directory", () => {
    expect(outputDir(false)).toBe(join("data", "routes"));
  });

  it("writes partial runs to the git-ignored cache", () => {
    expect(outputDir(true)).toBe(join("tools", "route-builder", ".cache", "partial"));
  });
});

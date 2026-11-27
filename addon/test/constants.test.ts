import { describe, expect, it } from "vitest";
import { CONSTANTS, expiredConstants } from "../src/core/constants";

describe("expiredConstants", () => {
  it("is empty before expiry", () => expect(expiredConstants("2026-12-01")).toEqual([]));
  it("lists expired names", () => expect(expiredConstants("2027-01-01")).toContain("runSpeed"));
  it("is not expired on the expiry day", () => expect(expiredConstants("2026-12-27")).toEqual([]));
  it("every constant has a source", () => {
    for (const entry of Object.values(CONSTANTS)) expect(entry.source.length).toBeGreaterThan(0);
  });
  it("no constant is expired today", () =>
    expect(expiredConstants(new Date().toISOString().slice(0, 10))).toEqual([]));
});

import { describe, expect, it } from "vitest";
import { expiredConstants } from "../src/core/constants";

describe("expiredConstants", () => {
  it("is empty before expiry", () => expect(expiredConstants("2026-12-01")).toEqual([]));
  it("lists expired names", () => expect(expiredConstants("2027-01-01")).toContain("runSpeed"));
  it("no constant is expired today", () =>
    expect(expiredConstants(new Date().toISOString().slice(0, 10))).toEqual([]));
});

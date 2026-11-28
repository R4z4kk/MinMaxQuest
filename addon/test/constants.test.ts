import { describe, expect, it } from "vitest";
import { CONSTANTS, expiredConstants, expiredRecords } from "../src/core/constants";
import { ACCESS } from "../src/data/generated/access";
import { TRAVEL } from "../src/data/generated/travel";

describe("expiredConstants", () => {
  it("is empty before expiry", () => expect(expiredConstants("2026-12-01")).toEqual([]));
  it("lists expired names", () => expect(expiredConstants("2027-01-01")).toContain("runSpeed"));
  it("is not expired on the expiry day", () => expect(expiredConstants("2026-12-27")).toEqual([]));
  it("lists the portal time among expired constants", () => expect(expiredConstants("2027-01-01")).toContain("portalSec"));
  it("every constant has a source", () => {
    for (const entry of Object.values(CONSTANTS)) expect(entry.source.length).toBeGreaterThan(0);
  });
  it("no constant is expired today", () =>
    expect(expiredConstants(new Date().toISOString().slice(0, 10))).toEqual([]));
  it("reports expired travel data", () => {
    expect(expiredConstants("2026-12-28")).toContain("TRAVEL");
    expect(expiredConstants(TRAVEL.source.expiresOn)).not.toContain("TRAVEL");
  });
  it("reports expired access data", () => {
    expect(expiredConstants("2026-12-28")).toContain("ACCESS");
    expect(expiredConstants(ACCESS.source.expiresOn)).not.toContain("ACCESS");
  });
  it("checks any dated record", () =>
    expect(expiredRecords({ a: { expiresOn: "2026-01-01" }, b: { expiresOn: "2027-01-01" } }, "2026-06-01")).toEqual(["a"]));
});

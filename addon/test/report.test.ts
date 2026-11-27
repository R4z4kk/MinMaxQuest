import { beforeEach, describe, expect, it } from "vitest";
import { guard, isDisabled, reportOnce, resetReports, setReportSink } from "../src/core/report";
import { setLocale, t } from "../src/core/l10n";

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  resetReports();
  setReportSink((line) => lines.push(line));
});

describe("reportOnce", () => {
  it("prints once per feature and disables it", () => {
    reportOnce("arrow", "boom");
    reportOnce("arrow", "boom again");
    expect(lines).toEqual(["MinMaxQuest: boom"]);
    expect(isDisabled("arrow")).toBe(true);
    expect(isDisabled("other")).toBe(false);
  });
});

describe("guard", () => {
  it("returns the value when fn succeeds", () => expect(guard("a", () => 5)).toBe(5));
  it("returns null, reports once and disables after throws", () => {
    const boom = (): number => {
      throw new Error("bad");
    };
    expect(guard("a", boom)).toBeNull();
    expect(guard("a", boom)).toBeNull();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("bad");
    expect(isDisabled("a")).toBe(true);
  });
  it("localizes the disabled message", () => {
    setLocale("frFR");
    guard("arrow", () => {
      throw new Error("bad");
    });
    setLocale("enUS");
    expect(lines[0]).toBe("MinMaxQuest: arrow désactivé : Error: bad");
  });
  it("skips fn when the feature is disabled", () => {
    reportOnce("a", "x");
    let called = false;
    expect(guard("a", () => (called = true))).toBeNull();
    expect(called).toBe(false);
  });
});

describe("t", () => {
  it("returns English by default and French for frFR", () => {
    setLocale("enUS");
    expect(t("tabQuest")).toBe("Quest");
    setLocale("frFR");
    expect(t("tabQuest")).toBe("Quête");
    expect(t("questieMissing")).toBe("QuestieDB est requis");
    setLocale("deDE");
    expect(t("tabAccess")).toBe("Access");
  });
});

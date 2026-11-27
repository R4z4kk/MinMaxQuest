import { afterEach, describe, expect, it } from "vitest";
import { applyLanguage, currentLocale, resolveLanguage, setLocale, t } from "../src/core/l10n";

const scope = globalThis as { GetLocale?: () => string };

afterEach(() => {
  delete scope.GetLocale;
  setLocale("enUS");
});

describe("applyLanguage", () => {
  it("follows the client locale for auto", () => {
    scope.GetLocale = () => "frFR";
    applyLanguage("auto");
    expect(currentLocale()).toBe("frFR");
    scope.GetLocale = () => "enUS";
    applyLanguage("auto");
    expect(currentLocale()).toBe("enUS");
  });
  it("overrides the client locale", () => {
    scope.GetLocale = () => "enUS";
    applyLanguage("frFR");
    expect(t("tabQuest")).toBe("Quête");
    scope.GetLocale = () => "frFR";
    applyLanguage("enUS");
    expect(t("tabQuest")).toBe("Quest");
  });
  it("resolves a setting without applying it", () => {
    scope.GetLocale = () => "frFR";
    expect(resolveLanguage("auto")).toBe("frFR");
    expect(resolveLanguage("enUS")).toBe("enUS");
  });
});

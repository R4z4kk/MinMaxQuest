import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetReports, setReportSink } from "../src/core/report";
import { formatDuration, type WorldPos } from "../src/core/geometry";
import { setLocale } from "../src/core/l10n";
import type { QuestInfo } from "../src/data/questRepository";
import type { Target } from "../src/targets/completion";
import type { ZoneIndex } from "../src/ui/maps";
import { colorCode, COLOR, GLYPH } from "../src/ui/theme";
import {
  bannerText,
  completionLines,
  footerTexts,
  formatCount,
  headerZone,
  lostText,
  modeText,
  logHeader,
  percentText,
  progressText,
  sumProgress,
  zoneLabel,
} from "../src/ui/viewModel";

const at = (x: number): WorldPos => ({ continent: 0, x, y: 0 });

function target(questId: number, over: Partial<Target> = {}): Target {
  return {
    questId, kind: "accept", objectiveIndex: null, pos: at(questId * 100), cluster: null, otherSpots: 0, seconds: 30, penaltySec: 0,
    questLevel: 10, trivial: false, elite: false, zoneAreaId: null, ...over,
  };
}

const names: Record<number, string> = { 1: "Wolves", 2: "Kodos", 3: "Grey one", 4: "Big one" };
const getQuest = (id: number): QuestInfo | null =>
  names[id] == null ? null : ({ id, name: names[id], objectives: [] } as unknown as QuestInfo);

let reported: string[] = [];
beforeEach(() => {
  reported = [];
  resetReports();
  setReportSink((line) => reported.push(line));
});
afterEach(() => setLocale("enUS"));

describe("formatting", () => {
  it("groups thousands per locale", () => {
    setLocale("enUS");
    expect([formatCount(980), formatCount(1204), formatCount(1234567)]).toEqual(["980", "1,204", "1,234,567"]);
    setLocale("frFR");
    expect(formatCount(1204)).toBe("1 204");
  });

  it("formats zone progress and percent", () => {
    setLocale("enUS");
    expect(progressText({ done: 42, total: 58 })).toBe("42 / 58 quests");
    expect(percentText({ done: 42, total: 58 })).toBe("72%");
    expect(percentText({ done: 0, total: 0 })).toBe("0%");
    setLocale("frFR");
    expect(percentText({ done: 42, total: 58 })).toBe("72 %");
  });

  it("describes the lost XP or says it is unknown", () => {
    setLocale("enUS");
    expect(lostText({ xp: 4250.4, levelFraction: 0.42 })).toBe("You lose about 4,250 XP (0.4 level).");
    expect(lostText({ xp: 30000, levelFraction: 2.04 })).toBe("You lose about 30,000 XP (2 levels).");
    expect(lostText({ xp: 30000, levelFraction: 1.96 })).toBe("You lose about 30,000 XP (2 levels).");
    expect(lostText({ xp: 30000, levelFraction: 1.94 })).toBe("You lose about 30,000 XP (1.9 level).");
    expect(lostText(null)).toBe("Lost XP unknown.");
    setLocale("frFR");
    expect(lostText({ xp: 4250, levelFraction: 0.42 })).toBe("Tu perds environ 4 250 XP, soit 0,4 niveau.");
    expect(lostText({ xp: 30000, levelFraction: 2.5 })).toBe("Tu perds environ 30 000 XP, soit 2,5 niveaux.");
  });

  it("sums the kept zones", () => {
    const totals = new Map([
      [1, { done: 1, total: 2 }],
      [2, { done: 3, total: 4 }],
      [3, { done: 5, total: 6 }],
    ]);
    expect(sumProgress(totals, (id) => id !== 2)).toEqual({ done: 6, total: 8 });
  });
});

describe("bannerText", () => {
  it("is null when the build matches and nothing expired", () => {
    expect(bannerText([], "1.60.1.71139", "1.60.1.71139")).toBeNull();
    expect(bannerText([], null, "1.60.1.71139")).toBeNull();
  });

  it("names the data build on a mismatch and lists expired constants", () => {
    setLocale("enUS");
    expect(bannerText([], "1", "1.60.1.71139")).toBe("Data built for build 1.60.1.71139");
    expect(bannerText(["runSpeed", "XP_PER_LEVEL"], "1", "2")).toBe(
      "Data built for build 2 · Expired data: runSpeed, XP_PER_LEVEL",
    );
    setLocale("frFR");
    expect(bannerText([], "1", "2")).toBe("Données générées pour le build 2");
  });
  it("names the routes build when it differs from the client", () => {
    setLocale("enUS");
    expect(bannerText([], "1.60.1.71139", "1.60.1.71139", "1.60.1.71139")).toBeNull();
    expect(bannerText([], "1.60.1.71139", "1.60.1.71139", "1.60.0.70000")).toBe("Routes built for build 1.60.0.70000");
    expect(bannerText([], "1", "2", "3")).toBe("Data built for build 2 · Routes built for build 3");
    expect(bannerText([], null, "2", "3")).toBeNull();
    setLocale("frFR");
    expect(bannerText([], "1", "1", "3")).toBe("Routes générées pour le build 3");
  });
});

describe("completionLines", () => {
  const quest = (id: number, kind: "npc" | "item" | "object"): QuestInfo =>
    ({ id, name: names[id], objectives: [{ kind, id: 1, required: 1, index: 1 }] }) as unknown as QuestInfo;
  const get = (id: number): QuestInfo | null => (id === 2 ? quest(2, "npc") : id === 4 ? quest(4, "item") : getQuest(id));

  it("orders sections turn-in, objectives, pick-up and omits empty ones", () => {
    setLocale("enUS");
    const list = [
      target(1),
      target(2, { kind: "objective", objectiveIndex: 1 }),
      target(4, { kind: "turnin" }),
    ];
    const lines = completionLines(list, null, getQuest, 20);
    expect(lines.filter((l) => l.kind === "section")).toEqual([
      { kind: "section", label: "To turn in", count: 1 },
      { kind: "section", label: "Objectives", count: 1 },
      { kind: "section", label: "To pick up", count: 1 },
    ]);
    expect(completionLines([target(1)], null, getQuest, 20).map((l) => l.kind)).toEqual(["section", "row"]);
    setLocale("frFR");
    expect(completionLines([target(1)], null, getQuest, 20)[0]).toEqual({ kind: "section", label: "À prendre", count: 1 });
  });

  it("counts every target of a section even when truncated", () => {
    const list = [target(1), target(2), target(3), target(4)];
    const lines = completionLines(list, null, getQuest, 3);
    expect(lines[0]).toEqual({ kind: "section", label: "To pick up", count: 4 });
  });

  it("marks only the arrow target row, even when it is not first", () => {
    setLocale("enUS");
    const list = [target(1), target(2, { seconds: 60 }), target(3, { trivial: true })];
    const rows = completionLines(list, list[1], getQuest, 20).filter((l) => l.kind === "row");
    expect(rows.map((r) => r.tone)).toEqual(["normal", "target", "grey"]);
    expect(rows.map((r) => r.name)).toEqual(["Wolves", `${GLYPH.current}Kodos`, "Grey one"]);
  });

  it("uses kill for npc objectives and collect for item or object ones", () => {
    const list = [
      target(2, { kind: "objective", objectiveIndex: 1 }),
      target(4, { kind: "objective", objectiveIndex: 1 }),
      target(9, { kind: "objective", objectiveIndex: 1 }),
      target(1),
      target(3, { kind: "turnin" }),
    ];
    const rows = completionLines(list, null, get, 20).filter((l) => l.kind === "row");
    expect(rows.map((r) => r.icon)).toEqual(["turnin", "kill", "collect", "collect", "accept"]);
    expect(reported).toEqual(["MinMaxQuest: quest 9 objective 1 not found"]);
    completionLines(list, null, get, 20);
    expect(reported.length).toBe(1);
  });

  it("keeps one row per quest, the time without penalty, the level and the elite tag", () => {
    setLocale("enUS");
    const list = [
      target(1, { seconds: 400, penaltySec: 300, questLevel: 12, elite: true }),
      target(1, { seconds: 500 }),
    ];
    expect(completionLines(list, null, getQuest, 20)).toEqual([
      { kind: "section", label: "To pick up", count: 1 },
      { kind: "row", icon: "accept", level: "12", name: `Wolves  ${colorCode(COLOR.sub)}Elite|r`, time: formatDuration(100), tone: "normal", questId: 1 },
    ]);
  });

  it("shows a dash for a row without a position", () => {
    setLocale("enUS");
    const rows = completionLines([target(1, { pos: null, seconds: 0 })], null, getQuest, 20).filter((l) => l.kind === "row");
    expect(rows.map((r) => r.kind === "row" && r.time)).toEqual(["—"]);
  });

  it("carries the quest id of each row", () => {
    setLocale("enUS");
    const rows = completionLines([target(1), target(2, { kind: "turnin" })], null, getQuest, 20).filter((l) => l.kind === "row");
    expect(rows.map((r) => r.questId)).toEqual([2, 1]);
  });

  it("ends with a more row when rows are cut", () => {
    setLocale("enUS");
    const list = [target(1), target(2), target(3), target(4)];
    const lines = completionLines(list, null, getQuest, 4);
    expect(lines.length).toBe(4);
    expect(lines[3]).toEqual({ kind: "row", icon: "empty", level: "", name: "+2 more...", time: "", tone: "more", questId: null });
    const dropped = completionLines([target(1, { kind: "turnin" }), target(2)], null, getQuest, 3);
    expect(dropped.map((l) => l.kind)).toEqual(["section", "row", "row"]);
    expect(dropped[2]).toMatchObject({ tone: "more", name: "+1 more..." });
  });

  it("keeps the arrow target visible when it sits in a lower section", () => {
    setLocale("enUS");
    const list = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => target(id, { kind: "turnin" })),
      ...[11, 12, 13, 14, 15, 16, 17, 18, 19].map((id) => target(id)),
      target(20),
    ];
    const lines = completionLines(list, list[19], getQuest, 8);
    expect(lines.length).toBe(8);
    expect(lines[7]).toMatchObject({ tone: "more", name: "+15 more..." });
    expect(lines[6]).toMatchObject({ tone: "target", name: `${GLYPH.current}#20` });
    expect(lines[5]).toEqual({ kind: "section", label: "To pick up", count: 10 });
    expect(lines[0]).toEqual({ kind: "section", label: "To turn in", count: 10 });
    const inSection = completionLines(list, list[14], getQuest, 14);
    expect(inSection.filter((l) => l.kind === "row" && l.tone === "target").length).toBe(1);
    expect(inSection[inSection.length - 1]).toMatchObject({ tone: "more" });
    for (let i = 0; i < inSection.length - 1; i++) {
      if (inSection[i].kind === "section") expect(inSection[i + 1].kind).toBe("row");
    }
  });

  it("returns no lines for no targets and never lists route steps", () => {
    expect(completionLines([], null, getQuest, 10)).toEqual([]);
    expect(completionLines([target(1, { kind: "route", questId: null })], null, getQuest, 10)).toEqual([]);
  });
});

describe("completion header and footer", () => {
  const index: ZoneIndex = {
    name: (id) => ({ 12: "Elwynn", 14: "Durotar", 40: "Westfall" })[id] ?? null,
    continentOf: (id) => (id === 14 ? { id: 1414, name: "Kalimdor" } : id === 99 ? null : { id: 1415, name: "Eastern Kingdoms" }),
    zoneOfMap: () => null,
  };
  const totals = new Map([
    [12, { done: 1, total: 2 }],
    [40, { done: 1204, total: 1300 }],
    [14, { done: 0, total: 5 }],
  ]);

  it("picks the stored zone in zone mode and the current zone otherwise", () => {
    expect(headerZone("zone", 14, 12)).toBe(14);
    expect(headerZone("proximity", 14, 12)).toBe(12);
    expect(headerZone("zone", null, 12)).toBeNull();
  });

  it("names a zone or says it is unknown", () => {
    setLocale("enUS");
    expect([zoneLabel(index, 12), zoneLabel(index, 77), zoneLabel(null, 12), zoneLabel(index, null)]).toEqual([
      "Elwynn", "Unknown zone", "Unknown zone", "Unknown zone",
    ]);
  });

  it("sums the zone's continent and everything", () => {
    setLocale("enUS");
    expect(footerTexts(totals, 12, index)).toEqual({ continent: "Eastern Kingdoms · 1,205 / 1,302", total: "Total · 1,205 / 1,307" });
    expect(footerTexts(totals, null, index).continent).toBe("");
    expect(footerTexts(totals, 99, index).continent).toBe("");
    expect(footerTexts(totals, 12, null)).toEqual({ continent: "", total: "Total · 1,205 / 1,307" });
  });

  it("labels the mode toggle and the log header", () => {
    setLocale("enUS");
    expect(modeText("proximity")).toBe("Proximity");
    expect(modeText("zone")).toBe("Zone");
    expect(modeText("log")).toBe("Log");
    expect(logHeader(0)).toBe("0 quests in log");
    expect(logHeader(1)).toBe("1 quest in log");
    expect(logHeader(4)).toBe("4 quests in log");
    setLocale("frFR");
    expect(logHeader(0)).toBe("0 quête dans le journal");
    expect(logHeader(1)).toBe("1 quête dans le journal");
    expect(logHeader(4)).toBe("4 quêtes dans le journal");
    expect(modeText("log")).toBe("Journal");
  });
});


describe("colorCode", () => {
  it("encodes a theme colour as a WoW colour escape", () => {
    expect(colorCode(COLOR.sub)).toBe("|cff9d95c4");
    expect(colorCode(COLOR.accent)).toBe("|cffc9a75a");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import { setLocale } from "../src/core/l10n";
import type { QuestInfo } from "../src/data/questRepository";
import type { Target } from "../src/targets/completion";
import {
  bannerText,
  completionView,
  formatCount,
  lostText,
  percentText,
  progressText,
  sumProgress,
} from "../src/ui/viewModel";

const at = (x: number): WorldPos => ({ continent: 0, x, y: 0 });

function target(questId: number, over: Partial<Target> = {}): Target {
  return {
    questId, kind: "accept", objectiveIndex: null, pos: at(questId * 100), cluster: null, seconds: 30,
    questLevel: 10, trivial: false, elite: false, zoneAreaId: null, ...over,
  };
}

const names: Record<number, string> = { 1: "Wolves", 2: "Kodos", 3: "Grey one", 4: "Big one" };
const getQuest = (id: number): QuestInfo | null =>
  names[id] == null ? null : ({ id, name: names[id] } as QuestInfo);

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
    expect(lostText({ xp: 4250.4, levelFraction: 0.42 })).toBe("You lose about 4,250 XP (0.4 levels).");
    expect(lostText(null)).toBe("Lost XP unknown.");
    setLocale("frFR");
    expect(lostText({ xp: 4250, levelFraction: 0.42 })).toBe("Tu perds environ 4 250 XP, soit 0,4 niveau.");
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
});

describe("completionView", () => {
  const list = [
    target(1, { seconds: 20 }),
    target(2, { kind: "objective", objectiveIndex: 1, seconds: 90 }),
    target(2, { kind: "objective", objectiveIndex: 2, seconds: 120 }),
    target(3, { seconds: 200, trivial: true, questLevel: 4 }),
    target(4, { seconds: 300, elite: true, questLevel: 12 }),
    target(9, { seconds: 400 }),
  ];

  it("shows the current target, the next one and the remaining quests once each", () => {
    setLocale("enUS");
    const view = completionView(list, list[0], getQuest, at(0), 10);
    expect(view.nearest).toEqual({ questId: 1, name: "Wolves", line: "pick up · <1 min · 100 m" });
    expect(view.next).toEqual({ questId: 2, name: "Kodos", line: "objective 1 · ~2 min · 200 m" });
    expect(view.rows).toEqual([
      { level: "10", name: "Kodos", time: "~2 min", grey: false, elite: false },
      { level: "4", name: "Grey one", time: "~3 min", grey: true, elite: false },
      { level: "12", name: "Big one", time: "~5 min", grey: false, elite: true },
      { level: "10", name: "#9", time: "~7 min", grey: false, elite: false },
    ]);
    expect([view.remaining, view.more]).toEqual([4, 0]);
  });

  it("puts a pinned current first and keeps the nearest as next", () => {
    const view = completionView(list, list[4], getQuest, at(0), 10);
    expect(view.nearest?.questId).toBe(4);
    expect(view.next?.questId).toBe(1);
    expect(view.rows.map((r) => r.name)).toEqual(["Kodos", "Grey one", "#9"]);
  });

  it("caps the rows and counts the rest", () => {
    const view = completionView(list, list[0], getQuest, at(0), 2);
    expect(view.rows.length).toBe(2);
    expect([view.remaining, view.more]).toEqual([4, 2]);
  });

  it("shows a dash distance without a position and nothing for an empty list", () => {
    expect(completionView(list, list[0], getQuest, null, 10).nearest?.line).toBe("pick up · <1 min · —");
    expect(completionView([], null, getQuest, at(0), 10)).toEqual({
      nearest: null, next: null, rows: [], remaining: 0, more: 0,
    });
  });
});

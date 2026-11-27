import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../src/core/l10n";
import type { AccessEntry } from "../src/data/generated/access";
import type { QuestInfo } from "../src/data/questRepository";
import { accessView, trackedText } from "../src/ui/accessModel";

const ENTRY: AccessEntry = {
  id: "sewers", group: "key", faction: "A", levels: [28, 33],
  name: { enUS: "Sewers", frFR: "Égouts" },
  steps: [
    { id: 10, kind: "pickUp", ref: 1, follows: [], origin: "attune" },
    { id: 20, kind: "quest", ref: 2, follows: [10], origin: "attune" },
    { id: 30, kind: "quest", ref: 3, follows: [20], origin: "attune" },
  ],
};
const HORDE: AccessEntry = { ...ENTRY, id: "horde", faction: "H" };
const NO_LEVELS: AccessEntry = { ...ENTRY, id: "free", levels: null };

const QUESTS: Record<number, Partial<QuestInfo>> = {
  1: { name: "Message", zoneAreaId: 5 },
  2: { name: "Key", zoneAreaId: 5 },
  3: { name: "Tome", zoneAreaId: null },
};
const getQuest = (id: number): QuestInfo | null =>
  QUESTS[id] == null ? null : ({ id, ...QUESTS[id] } as QuestInfo);

const base = {
  faction: "A" as const,
  level: 30,
  raceMask: 1,
  completed: new Set([1]),
  inLog: new Set([2]),
  getQuest,
  itemCount: () => 0,
  repEarned: () => null,
  zoneName: (areaId: number) => (areaId === 5 ? "Alterac" : null),
  expanded: null as string | null,
  tracked: [] as string[],
};

afterEach(() => setLocale("enUS"));

describe("accessView", () => {
  it("builds the row with steps, zone of the current step and progress", () => {
    setLocale("enUS");
    const [row] = accessView([ENTRY], { ...base, expanded: "sewers", tracked: ["sewers"] });
    expect(row).toEqual({
      id: "sewers",
      name: "Sewers",
      range: "28-33",
      fraction: 1 / 3,
      expanded: true,
      tracked: true,
      count: "1/3 steps",
      steps: [
        { text: "Message", state: "done" },
        { text: "Key · Alterac", state: "current" },
        { text: "Tome", state: "todo" },
      ],
    });
  });

  it("uses the localized name, filters by faction and leaves the range empty without levels", () => {
    setLocale("frFR");
    const rows = accessView([ENTRY, HORDE, NO_LEVELS], base);
    expect(rows.map((r) => r.id)).toEqual(["sewers", "free"]);
    expect(rows[0].name).toBe("Égouts");
    expect(rows[1].range).toBe("");
    expect(rows[0].steps).toEqual([]);
  });

  it("counts tracked chains", () => {
    setLocale("enUS");
    expect(trackedText(1)).toBe("1 chain tracked");
    expect(trackedText(2)).toBe("2 chains tracked");
    setLocale("frFR");
    expect(trackedText(0)).toBe("0 chaîne suivie");
  });
});

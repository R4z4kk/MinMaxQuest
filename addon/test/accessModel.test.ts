import { afterEach, describe, expect, it } from "vitest";
import type { AccessChainDef } from "../src/access/chains";
import { setLocale } from "../src/core/l10n";
import type { QuestInfo } from "../src/data/questRepository";
import { accessView, trackedText } from "../src/ui/accessModel";

const DEF: AccessChainDef = {
  id: "sewers",
  name: { frFR: "Égouts", enUS: "Sewers" },
  kind: "key",
  levelRange: [28, 33],
  start: { A: [1], H: [7] },
};

const QUESTS: Record<number, Partial<QuestInfo>> = {
  1: { name: "Message", nextInChain: 2, zoneAreaId: 5 },
  2: { name: "Key", nextInChain: 3, zoneAreaId: 5 },
  3: { name: "Tome", nextInChain: null, zoneAreaId: null },
};
const getQuest = (id: number): QuestInfo | null =>
  QUESTS[id] == null ? null : ({ id, ...QUESTS[id] } as QuestInfo);

const base = {
  faction: "A" as const,
  completed: new Set([1]),
  inLog: new Set([2]),
  getQuest,
  zoneName: (areaId: number) => (areaId === 5 ? "Alterac" : null),
  expanded: null as string | null,
  tracked: [] as string[],
};

afterEach(() => setLocale("enUS"));

describe("accessView", () => {
  it("builds the chain row with steps, zone of the current step and progress", () => {
    setLocale("enUS");
    const [row] = accessView([DEF], { ...base, expanded: "sewers", tracked: ["sewers"] });
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

  it("uses the localized name, the faction start and handles an unknown chain", () => {
    setLocale("frFR");
    const [row] = accessView([DEF], { ...base, faction: "H" });
    expect(row.name).toBe("Égouts");
    expect([row.expanded, row.tracked, row.fraction, row.steps]).toEqual([false, false, 0, []]);
    expect(row.count).toBe("0/0 étapes");
  });

  it("counts tracked chains", () => {
    setLocale("enUS");
    expect(trackedText(1)).toBe("1 chain tracked");
    expect(trackedText(2)).toBe("2 chains tracked");
    setLocale("frFR");
    expect(trackedText(0)).toBe("0 chaîne suivie");
  });
});

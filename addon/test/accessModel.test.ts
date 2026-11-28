import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../src/core/l10n";
import type { AccessEntry } from "../src/data/generated/access";
import type { QuestInfo } from "../src/data/questRepository";
import { accessLines, accessView, trackedGroups, trackedText } from "../src/ui/accessModel";

const ENTRY: AccessEntry = {
  id: "sewers", group: "key", faction: "A", levels: [28, 33],
  name: { enUS: "Sewers", frFR: "Égouts" },
  steps: [
    { id: 10, kind: "pickUp", ref: 1, follows: [], origin: "attune" },
    { id: 20, kind: "quest", ref: 2, follows: [10], origin: "attune" },
    { id: 30, kind: "quest", ref: 3, follows: [20], origin: "attune" },
  ],
};
const NO_LEVELS: AccessEntry = { ...ENTRY, id: "free", levels: null };
const KINDS: AccessEntry = {
  id: "kinds", group: "raid", faction: "AH", levels: null,
  name: { enUS: "Kinds", frFR: "Types" },
  steps: [
    { id: 1, kind: "level", ref: 20, follows: [], origin: "attune" },
    { id: 2, kind: "quest", ref: 2, follows: [1], origin: "attune" },
    { id: 3, kind: "quest", ref: 9, follows: [2], origin: "attune" },
    { id: 4, kind: "item", ref: 55, follows: [3], origin: "attune", count: 3 },
    { id: 5, kind: "item", ref: 56, follows: [4], origin: "attune" },
    { id: 6, kind: "kill", ref: 123, follows: [5], origin: "attune" },
    { id: 7, kind: "interact", ref: 0, follows: [6], origin: "attune" },
    { id: 75, kind: "click", ref: 0, follows: [7], origin: "attune" },
    { id: 8, kind: "click", ref: 7, follows: [75], origin: "attune" },
    { id: 85, kind: "interact", ref: 124, follows: [8], origin: "attune" },
    { id: 86, kind: "click", ref: 8, follows: [85], origin: "attune" },
    { id: 9, kind: "rep", ref: 529, follows: [86], origin: "attune", count: 9000 },
    { id: 10, kind: "prof", ref: 4, follows: [9], origin: "attune" },
    { id: 11, kind: "end", ref: 0, follows: [10], origin: "attune" },
  ],
};

const QUESTS: Record<number, Partial<QuestInfo>> = {
  1: { name: "Message", zoneAreaId: 5 },
  2: { name: "Key", zoneAreaId: 5 },
  3: { name: "Tome", zoneAreaId: null },
};
const getQuest = (id: number): QuestInfo | null =>
  QUESTS[id] == null ? null : ({ id, ...QUESTS[id] } as QuestInfo);

const base = {
  level: 30,
  raceMask: 1,
  completed: new Set([1]),
  inLog: new Set([2]),
  getQuest,
  questTitle: (id: number) => (id === 2 ? "Client Key" : null),
  itemName: (id: number) => (id === 55 ? "Pearl" : null),
  factionName: (id: number) => (id === 529 ? "Argent Dawn" : null),
  npcName: (id: number) => (id === 123 ? "Hogger" : null),
  objectName: (id: number) => (id === 8 ? "Altar" : null),
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
      group: "key",
      name: "Sewers",
      range: "28-33",
      fraction: 1 / 3,
      expanded: true,
      tracked: true,
      complete: false,
      started: true,
      count: "1/3 steps",
      steps: [
        { text: "Message", state: "done" },
        { text: "Client Key · Alterac", state: "current" },
        { text: "Tome", state: "todo" },
      ],
    });
  });

  it("uses the localized name, keeps every given entry and has no range without levels", () => {
    setLocale("frFR");
    const rows = accessView([ENTRY, { ...ENTRY, id: "horde", faction: "H" }, NO_LEVELS], base);
    expect(rows.map((r) => r.id)).toEqual(["sewers", "horde", "free"]);
    expect(rows[0].name).toBe("Égouts");
    expect(rows[2].range).toBeNull();
    expect(rows[0].steps).toEqual([]);
  });

  it("labels every step kind from client names, falling back to QuestieDB and ids", () => {
    setLocale("enUS");
    const [row] = accessView([KINDS], { ...base, level: 1, completed: new Set<number>(), inLog: new Set<number>(), expanded: "kinds" });
    expect(row.steps.map((step) => step.text)).toEqual([
      "Reach level 20",
      "Client Key",
      "#9",
      "Pearl ×3",
      "#56",
      "Kill Hogger",
      "Talk to the NPC",
      "Use the object",
      "Use #7",
      "Talk to #124",
      "Use Altar",
      "Argent Dawn: 9000 reputation",
      "Profession #4",
      "Access unlocked",
    ]);
    setLocale("frFR");
    const [fr] = accessView([KINDS], { ...base, level: 1, expanded: "kinds" });
    expect(fr.steps.map((step) => step.text).slice(0, 1)).toEqual(["Atteins le niveau 20"]);
    expect(fr.steps.slice(5, 8).map((step) => step.text)).toEqual(["Tue Hogger", "Parle au PNJ", "Utilise l'objet"]);
  });
});

describe("accessLines", () => {
  const views = (expanded: string | null) =>
    accessView([ENTRY, NO_LEVELS, KINDS], { ...base, expanded, tracked: ["free"] });

  it("orders the groups, counts complete entries and lists only open groups", () => {
    setLocale("enUS");
    const lines = accessLines(views(null), new Set(["key"]));
    expect(lines.map((line) => (line.kind === "group" ? `${line.label} ${line.count}:${line.open}` : line.kind))).toEqual([
      "Raids 0 / 1:false",
      "Keys 0 / 2:true",
      "entry",
      "entry",
    ]);
  });

  it("puts the steps and the track line under the expanded entry", () => {
    setLocale("enUS");
    const lines = accessLines(views("sewers"), new Set(["key"]));
    expect(lines.map((line) => line.kind)).toEqual(["group", "group", "entry", "step", "step", "step", "track", "entry"]);
  });

  it("gives finished, started and untouched entries done, progress and empty icons", () => {
    const icons = (completed: number[]) =>
      accessLines(accessView([ENTRY], { ...base, completed: new Set(completed), inLog: new Set() }), new Set(["key"]))
        .flatMap((line) => (line.kind === "entry" ? [line.icon] : []));
    expect(icons([1, 2, 3])).toEqual(["done"]);
    expect(icons([1])).toEqual(["progress"]);
    expect(icons([])).toEqual(["empty"]);
  });

  it("shows a bar for started entries and the level range otherwise", () => {
    const view = (completed: number[]) => accessView([ENTRY], { ...base, completed: new Set(completed), inLog: new Set() })[0];
    expect(view([1]).started).toBe(true);
    expect(view([1]).range).toBe("28-33");
    expect(view([]).started).toBe(false);
    expect(view([1, 2, 3]).started).toBe(false);
  });

  it("opens the groups holding a tracked entry", () => {
    expect([...trackedGroups(views(null))]).toEqual(["key"]);
  });

  it("counts tracked chains", () => {
    setLocale("enUS");
    expect(trackedText(1)).toBe("1 chain tracked");
    expect(trackedText(2)).toBe("2 chains tracked");
    setLocale("frFR");
    expect(trackedText(0)).toBe("0 chaîne suivie");
  });
});

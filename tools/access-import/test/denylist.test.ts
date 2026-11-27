import { describe, expect, it } from "vitest";
import { crossCheck } from "../crosscheck";
import { DENYLIST, type Denylist } from "../denylist";
import type { AccessEntry, AccessStep } from "../types";
import { INSTANCE_TYPES, snapshotFixture } from "./fixtures";

const step = (id: number, kind: AccessStep["kind"], ref: number, follows: number[]): AccessStep => ({ id, kind, ref, follows, origin: "attune" });
const entry = (id: string, faction: AccessEntry["faction"], steps: AccessStep[]): AccessEntry => ({
  id, group: "misc", faction, levels: null, name: { enUS: id, frFR: id }, steps,
});

function run(entries: AccessEntry[], denylist: Denylist) {
  return crossCheck({ entries, snapshot: snapshotFixture(), instanceTypes: INSTANCE_TYPES, chains: [], denylist });
}

describe("denylist", () => {
  it("drops a denied quest from every entry and counts it", () => {
    const list: Denylist = { quests: [{ quest: 7848, reason: "r" }], steps: [] };
    const { entries, report } = run([entry("a", "H", [step(1, "pickUp", 7848, []), step(2, "turnIn", 7848, [1]), step(3, "end", 0, [2])])], list);
    expect(entries.find((e) => e.id === "a")?.steps).toEqual([step(3, "end", 0, [])]);
    expect(report.excludedQuests).toEqual([{ quest: 7848, reason: "r", removed: 2 }]);
  });

  it("blocks a denied quest from the QuestieDB completion", () => {
    const list: Denylist = { quests: [{ quest: 5761, reason: "r" }], steps: [] };
    const { report } = run([], list);
    expect(report.missingDungeons.map((d) => d.entry)).toContain("questie-2437-h");
    expect(report.excludedQuests[0].removed).toBeGreaterThan(0);
  });

  it("removes listed steps of one entry only and rewires follows to the removed step's own follows", () => {
    const list: Denylist = { quests: [], steps: [{ entry: "h", steps: [2, 4], quest: 5722, reason: "r" }] };
    const build = (id: string) =>
      entry(id, id === "h" ? "H" : "A", [
        step(1, "level", 10, []),
        step(2, "pickUp", 5722, [1]),
        step(3, "item", 14544, [2]),
        step(4, "turnIn", 5722, [3]),
        step(5, "end", 0, [4, 1]),
      ]);
    const { entries, report } = run([build("h"), build("a")], list);
    expect(entries.find((e) => e.id === "h")?.steps.map((s) => [s.id, s.follows])).toEqual([[1, []], [3, [1]], [5, [3, 1]]]);
    expect(entries.find((e) => e.id === "a")?.steps).toHaveLength(5);
    expect(report.excludedSteps.map((x) => [x.entry, x.step])).toEqual([["h", 2], ["h", 4]]);
  });

  it("leaves a step alone when its quest differs from the listed one", () => {
    const list: Denylist = { quests: [], steps: [{ entry: "h", steps: [1], quest: 5761, reason: "r" }] };
    const { entries } = run([entry("h", "H", [step(1, "quest", 5722, [])])], list);
    expect(entries.find((e) => e.id === "h")?.steps).toHaveLength(1);
  });

  it("keeps the real list free of duplicates and of the kept Sparklematic variant", () => {
    const quests = DENYLIST.quests.map((q) => q.quest);
    expect(new Set(quests).size).toBe(quests.length);
    expect(quests).not.toContain(2952);
    expect(quests).toEqual(expect.arrayContaining([78916, 78917, 80324, 80325, 82062, 84555, 4601, 4602, 4605, 4606]));
    expect(DENYLIST.steps.flatMap((s) => s.steps.map((id) => `${s.entry}:${id}`)).sort()).toEqual(["166:120", "166:140", "351:725", "356:1480", "356:1490"]);
  });
});

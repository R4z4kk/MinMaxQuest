import { describe, expect, it } from "vitest";
import { ACCESS_CHAINS } from "../legacyChains";
import { parseAttune } from "../attune";
import { crossCheck, sortEntries } from "../crosscheck";
import type { AccessEntry } from "../types";
import { ATTUNE_FILES, INSTANCE_TYPES, RACE_MASKS, snapshotFixture } from "./fixtures";

const ALLIANCE_RACES = 1 + 4 + 8 + 64 + 4294967296;

async function run(snapshot = snapshotFixture(), keep: (e: AccessEntry) => boolean = () => true) {
  const { entries } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
  return crossCheck({ entries: entries.filter(keep), snapshot, instanceTypes: INSTANCE_TYPES, chains: ACCESS_CHAINS });
}

describe("crossCheck", () => {
  it("flags unknown quest and item ids", async () => {
    const { report } = await run();
    expect(report.unknownQuests).toEqual([{ entry: "160", step: 60, ref: 99999 }]);
    expect(report.unknownItems).toEqual([]);
  });

  it("appends a missing dungeon quest to the faction's entry, skipping class quests", async () => {
    const { entries, report } = await run();
    const rfc = entries.find((e) => e.id === "160");
    expect(rfc?.steps.at(-1)).toEqual({ id: 91, kind: "quest", ref: 5761, follows: [], origin: "questiedb" });
    expect(report.addedQuests).toContainEqual({ entry: "160", quest: 5761 });
    expect(report.skippedClassQuests).toEqual([{ areaId: 2437, quest: 5728 }]);
    expect(report.skippedFlaggedQuests).toEqual([
      { areaId: 2437, quest: 5800, flag: "repeatable" },
      { areaId: 2437, quest: 5801, flag: "event" },
    ]);
    expect(rfc?.steps.some((s) => s.ref === 5800 || s.ref === 5801)).toBe(false);
    expect(rfc?.steps.some((s) => s.ref === 5723)).toBe(false);
  });

  it("adds a party dungeon missing from Attune per faction, and lists dungeons without quests", async () => {
    const { entries, report } = await run();
    expect(report.missingDungeons.map((d) => [d.areaId, d.faction, d.entry])).toEqual([
      [719, "A", "questie-719-a"],
      [719, "H", "questie-719-h"],
      [2437, "A", "questie-2437-a"],
    ]);
    const bfd = entries.find((e) => e.id === "questie-719-h");
    expect(bfd).toEqual({
      id: "questie-719-h",
      group: "dungeon",
      faction: "H",
      levels: null,
      name: { enUS: "Blackfathom Deeps", frFR: "Blackfathom Deeps" },
      steps: [{ id: 1, kind: "quest", ref: 914, follows: [], origin: "questiedb" }],
    });
    expect(entries.find((e) => e.id === "questie-2437-a")?.steps.map((s) => s.ref)).toEqual([5723]);
    expect(report.questlessDungeons).toEqual([{ areaId: 206, name: "Utgarde Keep" }]);
  });

  it("reports faction conflicts and one-sided quests in entries for both factions", async () => {
    const snapshot = snapshotFixture();
    snapshot.quests[5722] = { ...snapshot.quests[5722], requiredRaces: ALLIANCE_RACES };
    snapshot.quests[7848] = { ...snapshot.quests[7848], requiredRaces: ALLIANCE_RACES };
    const { report } = await run(snapshot);
    expect(report.factionConflicts).toEqual([
      { entry: "160", step: 20, ref: 5722, questFaction: "A" },
      { entry: "160", step: 50, ref: 5722, questFaction: "A" },
    ]);
    expect(report.oneSidedInBoth).toEqual([{ entry: "20", step: 30, ref: 7848, questFaction: "A" }]);
  });

  it("merges the addon chains found in Attune and keeps the others", async () => {
    expect((await run()).report.chains).toEqual([{ id: "dalaran-sewers", mergedInto: ["154"] }]);
    const { entries, report } = await run(snapshotFixture(), (e) => e.id !== "154");
    expect(report.chains).toEqual([{ id: "dalaran-sewers", mergedInto: [] }]);
    expect(entries.find((e) => e.id === "dalaran-sewers")).toEqual({
      id: "dalaran-sewers",
      group: "key",
      faction: "AH",
      levels: [28, 33],
      name: { enUS: "Dalaran Sewers", frFR: "Égouts de Dalaran" },
      steps: [
        { id: 1, kind: "quest", ref: 92432, follows: [], origin: "questiedb" },
        { id: 2, kind: "quest", ref: 92458, follows: [1], origin: "questiedb" },
      ],
    });
  });

  it("lists Attune dungeons matched to no QuestieDB party dungeon", async () => {
    const snapshot = snapshotFixture();
    snapshot.quests[5722] = { ...snapshot.quests[5722], zoneOrSort: 1637 };
    snapshot.quests[5761] = { ...snapshot.quests[5761], zoneOrSort: 1637 };
    snapshot.quests[5728] = { ...snapshot.quests[5728], zoneOrSort: 1637 };
    snapshot.quests[5723] = { ...snapshot.quests[5723], zoneOrSort: 1637 };
    snapshot.quests[5800] = { ...snapshot.quests[5800], zoneOrSort: 1637 };
    snapshot.quests[5801] = { ...snapshot.quests[5801], zoneOrSort: 1637 };
    expect((await run(snapshot)).report.unmatchedAttuneDungeons).toEqual(["160"]);
  });
});

describe("sortEntries", () => {
  const entry = (id: string, group: AccessEntry["group"], levels: AccessEntry["levels"]): AccessEntry => ({
    id,
    group,
    faction: "AH",
    levels,
    name: { enUS: id, frFR: id },
    steps: [],
  });

  it("orders by group, then levels (none last), then id", () => {
    const sorted = sortEntries([
      entry("misc", "misc", null),
      entry("b", "dungeon", [20, 30]),
      entry("raid", "raid", null),
      entry("z", "dungeon", null),
      entry("a", "dungeon", [20, 30]),
      entry("c", "dungeon", [13, 18]),
      entry("key", "key", [28, 33]),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b", "z", "raid", "key", "misc"]);
  });
});

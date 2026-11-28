import { describe, expect, it } from "vitest";
import type { AccessEntry } from "../types";
import { keepUnlocks } from "../unlocks";

const entry = (id: string, group: AccessEntry["group"]): AccessEntry => ({
  id, group, faction: "AH", levels: null, name: { enUS: id, frFR: id }, steps: [],
});

describe("keepUnlocks", () => {
  it("drops open dungeons, keeps raids, keys and misc, and moves Upper Blackrock Spire to the keys", () => {
    const { entries, dropped } = keepUnlocks([
      entry("170", "dungeon"), entry("365", "dungeon"), entry("366", "dungeon"),
      entry("20", "raid"), entry("120", "key"), entry("80", "misc"),
    ]);
    expect(entries.map((e) => [e.id, e.group])).toEqual([["365", "key"], ["366", "key"], ["20", "raid"], ["120", "key"], ["80", "misc"]]);
    expect(dropped.map((e) => e.id)).toEqual(["170"]);
  });
});

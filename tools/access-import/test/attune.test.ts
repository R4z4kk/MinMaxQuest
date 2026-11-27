import { describe, expect, it } from "vitest";
import { parseAttune, readAttuneVersion } from "../attune";
import { ATTUNE_DATA, ATTUNE_FILES, RACE_MASKS } from "./fixtures";

describe("parseAttune", () => {
  it("parses the attunes with their group, faction and levels", async () => {
    const { entries } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    expect(entries.map((e) => [e.id, e.group, e.faction, e.levels])).toEqual([
      ["160", "dungeon", "H", [13, 18]],
      ["20", "raid", "AH", null],
      ["154", "key", "A", null],
    ]);
  });

  it("skips the character trials", async () => {
    const { entries, notes } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    expect(entries.some((e) => e.id === "500")).toBe(false);
    expect(notes.skippedEntries).toEqual(["500 Initiate (CHARACTER)"]);
  });

  it("maps the step types and refs, sorted by stage", async () => {
    const { entries } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    const rfc = entries[0].steps.map((s) => [s.id, s.kind, s.ref, s.origin]);
    expect(rfc).toEqual([
      [10, "level", 9, "attune"],
      [20, "pickUp", 5722, "attune"],
      [40, "item", 14544, "attune"],
      [50, "turnIn", 5722, "attune"],
      [60, "quest", 99999, "attune"],
      [70, "kill", 11520, "attune"],
      [80, "interact", 0, "attune"],
      [85, "click", 1, "attune"],
      [90, "end", 0, "attune"],
    ]);
    expect(entries[1].steps.map((s) => [s.id, s.kind, s.ref])).toEqual([
      [10, "rep", 749],
      [20, "prof", 0],
      [30, "pickUp", 7848],
    ]);
  });

  it("drops spacers and cross-attune links and remaps FOLLOWS across them", async () => {
    const { entries, notes } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    const follows = Object.fromEntries(entries[0].steps.map((s) => [s.id, s.follows]));
    expect(follows).toEqual({ 10: [], 20: [10], 40: [20], 50: [40, 20], 60: [], 70: [50], 80: [70], 85: [80], 90: [85, 60] });
    expect(entries[1].steps.find((s) => s.id === 20)?.follows).toEqual([10]);
    expect(notes.droppedSteps).toEqual(["20/15 Attune 120"]);
    expect(notes.droppedFollows).toEqual(["160/60 -> 5.0 (malformed)", "20/30 -> 99 (no such step)"]);
    expect(notes.orFollows).toEqual(["160/90"]);
    expect(notes.placeholderRefs).toEqual(["160/80 Interact ambermill"]);
  });

  it("resolves names per locale, falling back to enUS like AceLocale", async () => {
    const { entries, notes } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    expect(entries[0].name).toEqual({ enUS: "Ragefire Chasm", frFR: "Gouffre de Ragefeu" });
    expect(entries[1].name).toEqual({ enUS: "Molten Core", frFR: "Molten Core" });
    expect(notes.frenchFallbacks).toEqual(["Molten Core"]);
  });

  it("keeps Attune's step filters: excluded races, optional steps and OR follows", async () => {
    const { entries } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    const step = (id: number) => entries[0].steps.find((s) => s.id === id);
    expect(step(70)).toEqual({ id: 70, kind: "kill", ref: 11520, follows: [50], origin: "attune", excludedRaces: 18 });
    expect(step(60)).toEqual({ id: 60, kind: "quest", ref: 99999, follows: [], origin: "attune", optional: true });
    expect(step(85)).toEqual({ id: 85, kind: "click", ref: 1, follows: [80], origin: "attune", optional: true });
    expect(step(90)).toEqual({ id: 90, kind: "end", ref: 0, follows: [85, 60], origin: "attune", followsAny: true });
    expect(step(20)).toEqual({ id: 20, kind: "pickUp", ref: 5722, follows: [10], origin: "attune" });
  });

  it("keeps item counts, the rep standing goal and OR rows", async () => {
    const { entries } = await parseAttune(ATTUNE_FILES, RACE_MASKS);
    expect(entries[0].steps.find((s) => s.id === 40)).toEqual({ id: 40, kind: "item", ref: 14544, follows: [20], origin: "attune", count: 20 });
    expect(entries[1].steps[0]).toEqual({ id: 10, kind: "rep", ref: 749, follows: [], origin: "attune", count: 9000, orGroup: true });
  });

  it("throws on a COUNT that is not a positive integer or sits on a step without a count", async () => {
    await expect(parseAttune({ ...ATTUNE_FILES, data: ATTUNE_DATA.replace("COUNT=20", 'COUNT="x"') }, RACE_MASKS)).rejects.toThrow(
      "attune 160 step 40: COUNT is not a positive integer",
    );
    const data = ATTUNE_DATA.replace('ID_WOWHEAD="5722",FOLLOWS="10",STAGE="20"}', 'ID_WOWHEAD="5722",FOLLOWS="10",STAGE="20",COUNT=2}');
    await expect(parseAttune({ ...ATTUNE_FILES, data }, RACE_MASKS)).rejects.toThrow('attune 160 step 20: COUNT on a "Pick Up" step');
  });

  it("throws on an unknown NORACE token", async () => {
    const data = ATTUNE_DATA.replace('NORACE="Scourge|Orc"', 'NORACE="Pandaren"');
    await expect(parseAttune({ ...ATTUNE_FILES, data }, RACE_MASKS)).rejects.toThrow('attune 160 step 70: unknown NORACE race "Pandaren"');
  });

  it("throws on an unknown step TYPE, naming it", async () => {
    const data = ATTUNE_DATA.replace('TYPE="Kill"', 'TYPE="Teleport"');
    await expect(parseAttune({ ...ATTUNE_FILES, data }, RACE_MASKS)).rejects.toThrow('unknown step TYPE "Teleport" (attune 160 step 70)');
  });

  it("throws on a known TYPE that has no access kind in a kept entry", async () => {
    const data = ATTUNE_DATA.replace('TYPE="Kill"', 'TYPE="Stat"');
    await expect(parseAttune({ ...ATTUNE_FILES, data }, RACE_MASKS)).rejects.toThrow('TYPE "Stat" has no access kind (attune 160 step 70)');
  });

  it("throws on an unknown faction, group or name key", async () => {
    await expect(parseAttune({ ...ATTUNE_FILES, data: ATTUNE_DATA.replace('FACTION="Horde"', 'FACTION="Neutral"') }, RACE_MASKS)).rejects.toThrow(
      'attune 160: unknown FACTION "Neutral"',
    );
    await expect(parseAttune({ ...ATTUNE_FILES, data: ATTUNE_DATA.replace("['RAIDS']", "['PVP']") }, RACE_MASKS)).rejects.toThrow(
      'attune 20: unknown GROUP "PVP"',
    );
    await expect(parseAttune({ ...ATTUNE_FILES, enUS: ATTUNE_FILES.enUS.replace('Lang["Molten Core"]', 'Lang["MC"]') }, RACE_MASKS)).rejects.toThrow(
      'attune 20: enUS locale has no "Molten Core"',
    );
  });

  it("throws when the data file does not load", async () => {
    await expect(parseAttune({ ...ATTUNE_FILES, data: "Attune_Data.attunes = {" }, RACE_MASKS)).rejects.toThrow("AttuneData.lua");
    await expect(parseAttune({ ...ATTUNE_FILES, data: "Attune_Data.attunes = {}" }, RACE_MASKS)).rejects.toThrow("AttuneData.lua: Attune_Data.steps is not a list");
  });
});

describe("readAttuneVersion", () => {
  it("reads the TOC version", () => expect(readAttuneVersion("## Title: Attune\n## Version: 16001-46\r\n")).toBe("16001-46"));
  it("throws without a version", () => expect(() => readAttuneVersion("## Title: Attune\n")).toThrow("Attune.toc"));
});

import { describe, expect, it } from "vitest";
import { parseAttune, readAttuneVersion } from "../attune";
import { ATTUNE_DATA, ATTUNE_FILES } from "./fixtures";

describe("parseAttune", () => {
  it("parses the attunes with their group, faction and levels", async () => {
    const { entries } = await parseAttune(ATTUNE_FILES);
    expect(entries.map((e) => [e.id, e.group, e.faction, e.levels])).toEqual([
      ["160", "dungeon", "H", [13, 18]],
      ["20", "raid", "AH", null],
      ["154", "key", "A", null],
    ]);
  });

  it("skips the character trials", async () => {
    const { entries, notes } = await parseAttune(ATTUNE_FILES);
    expect(entries.some((e) => e.id === "500")).toBe(false);
    expect(notes.skippedEntries).toEqual(["500 Initiate (CHARACTER)"]);
  });

  it("maps the step types and refs, sorted by stage", async () => {
    const { entries } = await parseAttune(ATTUNE_FILES);
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
    const { entries, notes } = await parseAttune(ATTUNE_FILES);
    const follows = Object.fromEntries(entries[0].steps.map((s) => [s.id, s.follows]));
    expect(follows).toEqual({ 10: [], 20: [10], 40: [20], 50: [40, 20], 60: [], 70: [50], 80: [70], 85: [80], 90: [85, 60] });
    expect(entries[1].steps.find((s) => s.id === 20)?.follows).toEqual([10]);
    expect(notes.droppedSteps).toEqual(["20/15 Attune 120"]);
    expect(notes.droppedFollows).toEqual(["160/60 -> 5.0 (malformed)", "20/30 -> 99 (no such step)"]);
    expect(notes.orFollows).toEqual(["160/90"]);
    expect(notes.placeholderRefs).toEqual(["160/80 Interact ambermill"]);
  });

  it("resolves names per locale, falling back to enUS like AceLocale", async () => {
    const { entries, notes } = await parseAttune(ATTUNE_FILES);
    expect(entries[0].name).toEqual({ enUS: "Ragefire Chasm", frFR: "Gouffre de Ragefeu" });
    expect(entries[1].name).toEqual({ enUS: "Molten Core", frFR: "Molten Core" });
    expect(notes.frenchFallbacks).toEqual(["Molten Core"]);
  });

  it("throws on an unknown step TYPE, naming it", async () => {
    const data = ATTUNE_DATA.replace('TYPE="Kill"', 'TYPE="Teleport"');
    await expect(parseAttune({ ...ATTUNE_FILES, data })).rejects.toThrow('unknown step TYPE "Teleport" (attune 160 step 70)');
  });

  it("throws on a known TYPE that has no access kind in a kept entry", async () => {
    const data = ATTUNE_DATA.replace('TYPE="Kill"', 'TYPE="Stat"');
    await expect(parseAttune({ ...ATTUNE_FILES, data })).rejects.toThrow('TYPE "Stat" has no access kind (attune 160 step 70)');
  });

  it("throws on an unknown faction, group or name key", async () => {
    await expect(parseAttune({ ...ATTUNE_FILES, data: ATTUNE_DATA.replace('FACTION="Horde"', 'FACTION="Neutral"') })).rejects.toThrow(
      'attune 160: unknown FACTION "Neutral"',
    );
    await expect(parseAttune({ ...ATTUNE_FILES, data: ATTUNE_DATA.replace("['RAIDS']", "['PVP']") })).rejects.toThrow(
      'attune 20: unknown GROUP "PVP"',
    );
    await expect(parseAttune({ ...ATTUNE_FILES, enUS: ATTUNE_FILES.enUS.replace('Lang["Molten Core"]', 'Lang["MC"]') })).rejects.toThrow(
      'attune 20: enUS locale has no "Molten Core"',
    );
  });

  it("throws when the data file does not load", async () => {
    await expect(parseAttune({ ...ATTUNE_FILES, data: "Attune_Data.attunes = {" })).rejects.toThrow("AttuneData.lua");
    await expect(parseAttune({ ...ATTUNE_FILES, data: "Attune_Data.attunes = {}" })).rejects.toThrow("AttuneData.lua: Attune_Data.steps is not a list");
  });
});

describe("readAttuneVersion", () => {
  it("reads the TOC version", () => expect(readAttuneVersion("## Title: Attune\n## Version: 16001-46\r\n")).toBe("16001-46"));
  it("throws without a version", () => expect(() => readAttuneVersion("## Title: Attune\n")).toThrow("Attune.toc"));
});

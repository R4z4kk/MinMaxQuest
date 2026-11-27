import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCmangosCounts } from "../ingest/cmangos";

const CREATE = [
  "CREATE TABLE `quest_template` (",
  "  `entry` mediumint unsigned NOT NULL DEFAULT '0',",
  "  `Title` text,",
  "  `ReqItemId1` mediumint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemId2` mediumint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemId3` mediumint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemId4` mediumint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemCount1` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemCount2` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemCount3` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqItemCount4` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOId1` mediumint NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOId2` mediumint NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOId3` mediumint NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOId4` mediumint NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOCount1` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOCount2` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOCount3` smallint unsigned NOT NULL DEFAULT '0',",
  "  `ReqCreatureOrGOCount4` smallint unsigned NOT NULL DEFAULT '0',",
  "  `PointX` float NOT NULL DEFAULT '0',",
  "  PRIMARY KEY (`entry`)",
  ") ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COMMENT='Quest System';",
];

const REQ_COLUMNS = ["entry", ...["ReqItemId", "ReqItemCount", "ReqCreatureOrGOId", "ReqCreatureOrGOCount"].flatMap((c) => [1, 2, 3, 4].map((n) => `${c}${n}`))];

function dump(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "cmangos-"));
  const file = join(dir, "dump.sql");
  writeFileSync(file, lines.join("\n"));
  return file;
}

describe("loadCmangosCounts", () => {
  it("reads counts by the dump's own column order", () => {
    const file = dump([
      "INSERT INTO `other_table` VALUES (1,2,3);",
      ...CREATE,
      "INSERT INTO `quest_template` VALUES (7,'Kobold, Camp \\'Cleanup\\'',0,0,0,0,0,0,0,0,6,0,0,0,10,0,0,0,1.5),(33,'Wolves',750,0,0,0,8,0,0,0,-1234,0,0,0,3,0,0,0,0);",
      `INSERT INTO \`quest_template\` (${REQ_COLUMNS.map((c) => `\`${c}\``).join(",")}) VALUES (40,${REQ_COLUMNS.slice(1).map((c) => (c === "ReqItemId1" ? 99 : c === "ReqItemCount1" ? 2 : 0)).join(",")});`,
    ]);
    const counts = loadCmangosCounts(file);
    expect(counts.get(7, "npcOrObject", 6)).toBe(10);
    expect(counts.get(33, "item", 750)).toBe(8);
    expect(counts.get(33, "npcOrObject", -1234)).toBe(3);
    expect(counts.get(33, "npcOrObject", 1234)).toBeNull();
    expect(counts.get(40, "item", 99)).toBe(2);
    expect(counts.get(7, "item", 750)).toBeNull();
    expect(counts.get(999, "item", 750)).toBeNull();
  });

  it("throws naming the file and line on a malformed row", () => {
    const file = dump([...CREATE, "INSERT INTO `quest_template` VALUES (7,'unterminated,0);"]);
    expect(() => loadCmangosCounts(file)).toThrow(`${file}:${CREATE.length + 1}:`);
  });

  it("throws on a row whose width does not match the columns", () => {
    const file = dump([...CREATE, "INSERT INTO `quest_template` VALUES (7,'x',1);"]);
    expect(() => loadCmangosCounts(file)).toThrow(`${file}:${CREATE.length + 1}:`);
  });

  it("throws naming the file and column when a Req column is missing from CREATE TABLE or INSERT", () => {
    const noCount = CREATE.filter((line) => !line.includes("`ReqItemCount3`"));
    const fromCreate = dump([...noCount, "INSERT INTO `quest_template` VALUES (7,'x',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);"]);
    expect(() => loadCmangosCounts(fromCreate)).toThrow(fromCreate);
    expect(() => loadCmangosCounts(fromCreate)).toThrow(/ReqItemCount3/);
    const fromInsert = dump([...CREATE, "INSERT INTO `quest_template` (`entry`,`ReqItemId1`) VALUES (40,99);"]);
    expect(() => loadCmangosCounts(fromInsert)).toThrow(/ReqItemCount1/);
    expect(() => loadCmangosCounts(fromInsert)).toThrow(fromInsert);
    const noEntry = dump(["INSERT INTO `quest_template` (`ReqItemId1`) VALUES (99);"]);
    expect(() => loadCmangosCounts(noEntry)).toThrow(/entry/);
  });

  it("throws when no quest_template row is parsed", () => {
    const file = dump(CREATE);
    expect(() => loadCmangosCounts(file)).toThrow(`${file}: no quest_template row parsed`);
  });

  it("throws when the quest_template table is missing", () => {
    const file = dump(["INSERT INTO `other_table` VALUES (1);"]);
    expect(() => loadCmangosCounts(file)).toThrow(`${file}: no quest_template`);
  });
});

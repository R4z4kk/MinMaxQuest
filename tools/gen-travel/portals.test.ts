import { describe, expect, it } from "vitest";
import { importPortals, type PortalSources } from "./portals";

const CREATE = [
  "CREATE TABLE `areatrigger_teleport` (",
  "  `id` mediumint NOT NULL,",
  "  `name` text,",
  "  `required_level` tinyint NOT NULL,",
  "  `required_item` mediumint NOT NULL,",
  "  `required_item2` mediumint NOT NULL,",
  "  `required_quest_done` int NOT NULL,",
  "  `target_map` smallint NOT NULL,",
  "  `target_position_x` float NOT NULL,",
  "  `target_position_y` float NOT NULL,",
  "  `condition_id` int NOT NULL,",
  "  PRIMARY KEY (`id`)",
  ") ENGINE=MyISAM;",
];
const MAPS = "ID,InstanceType\n0,0\n1,0\n34,1\n";
const TRIGGERS = "Pos_0,Pos_1,Pos_2,ID,ContinentID\n100,100,0,1,1\n100,100,0,2,1\n100,100,0,3,1\n100,100,0,4,1\n100,100,0,5,1\n";

function sources(rows: string, triggers = TRIGGERS): PortalSources {
  return {
    cmangosSql: [...CREATE, `INSERT INTO \`areatrigger_teleport\` VALUES ${rows};`].join("\n"),
    cmangosLabel: "db.sql",
    areaTriggerCsv: triggers,
    areaTriggerLabel: "trigger.csv",
    mapCsv: MAPS,
    mapLabel: "map.csv",
  };
}

describe("importPortals", () => {
  it("keeps long free open-world teleports and drops the rest", () => {
    const rows = [
      "(5,'far',0,0,0,0,1,1000,100,0)",
      "(1,'near',0,0,0,0,1,150,100,0)",
      "(2,'gated',10,0,0,0,1,1000,100,0)",
      "(3,'dungeon',0,0,0,0,34,1000,100,0)",
      "(4,'other continent',0,0,0,0,0,1000,100,0)",
      "(6,'conditional',0,0,0,0,1,1000,100,7)",
    ].join(",");
    const result = importPortals(sources(rows));
    expect(result.portals).toEqual([{ name: "far", from: { continent: 1, x: 100, y: 100 }, to: { continent: 1, x: 1000, y: 100 } }]);
  });

  it("sorts by id", () => {
    const result = importPortals(sources("(5,'b',0,0,0,0,1,1000,100,0),(2,'a',0,0,0,0,1,100,1000,0)"));
    expect(result.portals.map((portal) => portal.name)).toEqual(["a", "b"]);
  });

  it("reports a free open-world teleport that has no trigger position", () => {
    const result = importPortals(sources("(9,'lost',0,0,0,0,1,1000,100,0)"));
    expect(result.portals).toEqual([]);
    expect(result.noTrigger).toEqual([9]);
  });

  it("throws on a non numeric target position", () => {
    expect(() => importPortals(sources("(5,'bad',0,0,0,0,1,NULL,100,0)"))).toThrow(/target position/);
  });
});

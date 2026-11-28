import { describe, expect, it } from "vitest";
import { importPortals, mergePortals, type PortalImport, type PortalSources, type SpfPortal } from "./portals";

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
    expect(result.ids).toEqual([2, 5]);
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

describe("mergePortals", () => {
  const darnassus = { name: "Teddrassil - Ruth Theran", from: { continent: 1, x: 9947.5, y: 2630 }, to: { continent: 1, x: 8785.8, y: 967 } };
  const other = { name: "other", from: { continent: 1, x: 0, y: 0 }, to: { continent: 1, x: 900, y: 0 } };
  const imported: PortalImport = {
    portals: [darnassus, other],
    ids: [527, 600],
    triggers: new Map([
      [527, { continent: 1, x: 9947.48, y: 2630.04 }],
      [600, { continent: 1, x: 0, y: 0 }],
      [2173, { continent: 0, x: -8346.46, y: 514.031 }],
    ]),
    candidates: 2,
    noTrigger: [],
  };
  const spf: SpfPortal[] = [
    { name: "Portal to Rut'theran Village", faction: "", from: { map: 1, x: 9947.48, y: 2630.04 }, to: { map: 1, x: 8785.79, y: 966.983 } },
    { name: "Passage to Deeprun Tram (Stormwind)", faction: "", from: { map: 0, x: -8346.46, y: 514.031 }, to: { map: 369, x: 67.761, y: 2490.98 } },
    { name: "Portal to Stormwind", faction: "Alliance", from: { map: 571, x: 5807.06, y: 506.244 }, to: { map: 0, x: -8842.09, y: 626.358 } },
    { name: "Gated", faction: "Horde", from: { map: 0, x: 10, y: 10 }, to: { map: 0, x: 5000, y: 10 } },
  ];
  const result = mergePortals(spf, imported, new Set([0, 1]));

  it("replaces the cmangos teleporter of the same area trigger by SPF's", () => {
    expect(result.portals.filter((portal) => portal.from.x === 9947.5)).toEqual([
      { name: "Portal to Rut'theran Village", from: { continent: 1, x: 9947.5, y: 2630 }, to: { continent: 1, x: 8785.8, y: 967 } },
    ]);
  });

  it("keeps the cmangos teleporters SPF does not list", () => {
    expect(result.portals).toContainEqual(other);
  });

  it("keeps SPF's faction gate", () => {
    expect(result.portals).toContainEqual({ name: "Gated", faction: "H", from: { continent: 0, x: 10, y: 10 }, to: { continent: 0, x: 5000, y: 10 } });
  });

  it("drops and reports portals with an end on a map the graph does not model", () => {
    expect(result.portals.map((portal) => portal.name)).not.toContain("Portal to Stormwind");
    expect(result.dropped).toEqual(["Passage to Deeprun Tram (Stormwind) (0 -> 369)", "Portal to Stormwind (571 -> 0)"]);
  });

  it("refuses an unknown faction", () => {
    expect(() => mergePortals([{ ...spf[3], faction: "Scourge" }], imported, new Set([0, 1]))).toThrow(/Scourge/);
  });
});

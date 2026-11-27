import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../ingest/csv";
import { loadZones, parseUiMapAssignment, parseZones, zonePercentToWorld } from "../ingest/zones";
import { WAGO_DB2 } from "../sources";

const LUA = `local _, ns = ...
ns.Zones = {
  [1429] = { low = 1, high = 10, map = 0, minX = -10254, minY = -1935, maxX = -7940, maxY = 1535 },
  [1453] = { city = "A", zone = 1429, map = 0, minX = -9100, minY = 200, maxX = -8100, maxY = 1500 },
}`;

describe("zones", () => {
  it("parses rects keyed by uiMapId", async () => {
    const zones = await parseZones(LUA);
    expect(zones.get(1429)).toEqual({ uiMapId: 1429, continent: 0, minX: -10254, minY: -1935, maxX: -7940, maxY: 1535, low: 1, high: 10 });
    expect(zones.get(1453)?.low).toBeNull();
  });

  it("maps zone percent to world like GetWorldPosFromMapPos (x north, y west)", async () => {
    const rect = (await parseZones(LUA)).get(1429)!;
    expect(zonePercentToWorld(rect, 0, 0)).toEqual({ continent: 0, x: -7940, y: 1535 });
    expect(zonePercentToWorld(rect, 100, 100)).toEqual({ continent: 0, x: -10254, y: -1935 });
    expect(zonePercentToWorld(rect, 50, 50)).toEqual({ continent: 0, x: -9097, y: -200 });
  });

  it("rejects a rect with a missing bound", async () => {
    await expect(parseZones(`local _, ns = ... ns.Zones = { [1] = { map = 0, minX = 1 } }`)).rejects.toThrow(/Zones.lua.*1/);
  });

  it("names the zone when a bound is missing mid-row", async () => {
    await expect(parseZones(`local _, ns = ... ns.Zones = { [7] = { map = 0, minX = 1, maxX = 2, maxY = 3 } }`)).rejects.toThrow(/Zones.lua.*7/);
  });

  it("loads the vendored file", async () => {
    const zones = await loadZones();
    expect(zones.get(1411)?.continent).toBe(1);
    expect(zones.size).toBeGreaterThan(30);
  });

  it("loads Zephras Isle from UiMapAssignment, keeping Zones.lua rects", async () => {
    const zones = await loadZones();
    expect(zones.get(2521)).toEqual({ uiMapId: 2521, continent: 2991, minX: 1247.9169921875, minY: -1331.25, maxX: 4956.25, maxY: 4231.25, low: null, high: null });
    expect(zones.get(1429)?.low).toBe(1);
  });

  it("matches Zones.lua for a uiMap present in both sources", async () => {
    const lua = await parseZones(readFileSync(join("vendor", "shortest-path-forever", "Zones.lua"), "utf8"));
    const csv = parseUiMapAssignment(readFileSync(join("vendor", "wago", `UiMapAssignment-${WAGO_DB2.build}.csv`), "utf8"), "UiMapAssignment.csv");
    for (const id of [1412, 1429]) {
      const a = lua.get(id)!;
      const b = csv.get(id)!;
      expect([b.continent, b.minX, b.minY, b.maxX, b.maxY].map(Math.round)).toEqual([a.continent, a.minX, a.minY, a.maxX, a.maxY]);
    }
  });
});

const ASSIGNMENT_HEADER = "UiMin_0,UiMin_1,UiMax_0,UiMax_1,Region_0,Region_1,Region_2,Region_3,Region_4,Region_5,ID,UiMapID,OrderIndex,MapID,AreaID";

describe("UiMapAssignment", () => {
  it("keeps full-map rows of order 0 only", () => {
    const csv = [
      ASSIGNMENT_HEADER,
      "0,0,1,1,10,20,-1000000,30,40,1000000,1,500,0,7,0",
      "0.5,0,1,1,11,21,-1000000,31,41,1000000,2,501,0,7,0",
      "0,0,1,1,12,22,-1000000,32,42,1000000,3,502,1,7,0",
    ].join("\n");
    expect([...parseUiMapAssignment(csv, "t.csv").values()]).toEqual([
      { uiMapId: 500, continent: 7, minX: 10, minY: 20, maxX: 30, maxY: 40, low: null, high: null },
    ]);
  });

  it("names the file and row of a malformed value", () => {
    const csv = [ASSIGNMENT_HEADER, "0,0,1,1,x,20,-1000000,30,40,1000000,1,500,0,7,0"].join("\n");
    expect(() => parseUiMapAssignment(csv, "t.csv")).toThrow("t.csv: row 2 has no numeric Region_0");
  });
});

describe("parseCsv", () => {
  it("reads quoted fields with commas, quotes and newlines by header name", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n1,2\n', "t.csv")).toEqual([
      { a: "x, y", b: 'say "hi"\nthere' },
      { a: "1", b: "2" },
    ]);
  });

  it("rejects a row with the wrong field count", () => {
    expect(() => parseCsv("a,b\n1\n", "t.csv")).toThrow("t.csv: row 2 has 1 fields, header has 2");
  });
});

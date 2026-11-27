import { describe, expect, it } from "vitest";
import { loadZones, parseZones, zonePercentToWorld } from "../ingest/zones";

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
});

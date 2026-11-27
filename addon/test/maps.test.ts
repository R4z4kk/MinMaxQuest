import { describe, expect, it } from "vitest";
import { createZoneIndex, zoneEntries, type MapDeps, type MapInfo } from "../src/ui/maps";

const CONTINENT = 2;
const MAPS: Record<number, MapInfo> = {
  947: { name: "Azeroth", mapType: 1, parentMapID: 0 },
  1415: { name: "Eastern Kingdoms", mapType: CONTINENT, parentMapID: 947 },
  1414: { name: "Kalimdor", mapType: CONTINENT, parentMapID: 947 },
  1429: { name: "Elwynn Forest", mapType: 3, parentMapID: 1415 },
  1411: { name: "Durotar", mapType: 3, parentMapID: 1414 },
  9001: { name: "Goldshire Inn", mapType: 5, parentMapID: 1429 },
};
const UI_MAPS: Record<number, number> = { 12: 1429, 14: 1411 };
const AREAS: Record<number, string> = { 12: "Elwynn Forest", 14: "Durotar" };

function deps() {
  const calls = { mapInfo: 0 };
  const d: MapDeps = {
    uiMapOf: (areaId) => UI_MAPS[areaId] ?? null,
    mapInfo: (id) => {
      calls.mapInfo++;
      return MAPS[id] ?? null;
    },
    areaName: (areaId) => AREAS[areaId] ?? null,
    continentType: CONTINENT,
  };
  return { d, calls };
}

describe("createZoneIndex", () => {
  it("names zones and finds their continent once", () => {
    const { d, calls } = deps();
    const index = createZoneIndex([12, 14, 99], d);
    expect(index.name(12)).toBe("Elwynn Forest");
    expect(index.name(99)).toBeNull();
    expect(index.continentOf(12)).toEqual({ id: 1415, name: "Eastern Kingdoms" });
    const after = calls.mapInfo;
    expect(index.continentOf(12)).toEqual({ id: 1415, name: "Eastern Kingdoms" });
    expect(calls.mapInfo).toBe(after);
    expect(index.continentOf(99)).toBeNull();
  });

  it("maps the player's map to a quest zone through its parents", () => {
    const { d } = deps();
    const index = createZoneIndex([12, 14], d);
    expect(index.zoneOfMap(1429)).toBe(12);
    expect(index.zoneOfMap(9001)).toBe(12);
    expect(index.zoneOfMap(947)).toBeNull();
    expect(index.zoneOfMap(5555)).toBeNull();
  });

  it("survives a parent cycle", () => {
    const d: MapDeps = {
      uiMapOf: () => null,
      mapInfo: (id) => ({ name: "loop", mapType: 3, parentMapID: id === 1 ? 2 : 1 }),
      areaName: () => null,
      continentType: CONTINENT,
    };
    expect(createZoneIndex([], d).zoneOfMap(1)).toBeNull();
  });
});

describe("zoneEntries", () => {
  it("lists named zones with quests sorted by name", () => {
    const { d } = deps();
    const index = createZoneIndex([12, 14, 99], d);
    const totals = new Map([
      [12, { done: 0, total: 3 }],
      [14, { done: 1, total: 2 }],
      [99, { done: 0, total: 1 }],
    ]);
    expect(zoneEntries(totals, index)).toEqual([
      { areaId: 14, name: "Durotar" },
      { areaId: 12, name: "Elwynn Forest" },
    ]);
  });
});

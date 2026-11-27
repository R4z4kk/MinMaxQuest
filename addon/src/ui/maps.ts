import type { QuestRepository } from "../data/questRepository";
import type { ZoneProgress } from "../targets/completion";

export interface MapInfo {
  name: string;
  mapType: number;
  parentMapID: number;
}

export interface MapDeps {
  uiMapOf(areaId: number): number | null;
  mapInfo(uiMapId: number): MapInfo | null;
  areaName(areaId: number): string | null;
  continentType: number;
}

export interface Continent {
  id: number;
  name: string;
}

export interface ZoneIndex {
  name(areaId: number): string | null;
  continentOf(areaId: number): Continent | null;
  zoneOfMap(uiMapId: number): number | null;
}

const MAX_DEPTH = 8;

export function createZoneIndex(areaIds: number[], deps: MapDeps): ZoneIndex {
  const infos = new Map<number, MapInfo | false>();
  const names = new Map<number, string | false>();
  const continents = new Map<number, Continent | false>();
  const zoneByMap = new Map<number, number>();
  for (const areaId of areaIds) {
    const uiMap = deps.uiMapOf(areaId);
    if (uiMap != null && !zoneByMap.has(uiMap)) zoneByMap.set(uiMap, areaId);
  }

  const info = (uiMapId: number): MapInfo | null => {
    let cached = infos.get(uiMapId);
    if (cached == null) {
      cached = deps.mapInfo(uiMapId) ?? false;
      infos.set(uiMapId, cached);
    }
    return cached === false ? null : cached;
  };

  const ancestor = (uiMapId: number, found: (id: number, map: MapInfo) => boolean): number | null => {
    let id = uiMapId;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const map = info(id);
      if (map == null) return null;
      if (found(id, map)) return id;
      id = map.parentMapID;
    }
    return null;
  };

  return {
    name(areaId) {
      let cached = names.get(areaId);
      if (cached == null) {
        cached = deps.areaName(areaId) ?? false;
        names.set(areaId, cached);
      }
      return cached === false ? null : cached;
    },
    continentOf(areaId) {
      let cached = continents.get(areaId);
      if (cached == null) {
        const uiMap = deps.uiMapOf(areaId);
        const id = uiMap == null ? null : ancestor(uiMap, (_, map) => map.mapType === deps.continentType);
        const map = id == null ? null : info(id);
        cached = id == null || map == null ? false : { id, name: map.name };
        continents.set(areaId, cached);
      }
      return cached === false ? null : cached;
    },
    zoneOfMap(uiMapId) {
      const id = ancestor(uiMapId, (mapId) => zoneByMap.has(mapId));
      return id == null ? null : (zoneByMap.get(id) ?? null);
    },
  };
}

export function zoneEntries(totals: Map<number, ZoneProgress>, index: ZoneIndex): { areaId: number; name: string }[] {
  const entries: { areaId: number; name: string }[] = [];
  for (const [areaId, zone] of totals) {
    const name = index.name(areaId);
    if (zone.total > 0 && name != null) entries.push({ areaId, name });
  }
  entries.sort((a, b) => (a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.areaId - b.areaId));
  return entries;
}

export function wowMapDeps(repo: QuestRepository): MapDeps {
  return {
    uiMapOf: (areaId) => repo.uiMapIdForArea(areaId),
    mapInfo: (uiMapId) => C_Map.GetMapInfo(uiMapId),
    areaName: (areaId) => C_Map.GetAreaInfo(areaId),
    continentType: Enum.UIMapType.Continent,
  };
}

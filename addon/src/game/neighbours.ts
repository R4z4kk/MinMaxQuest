export interface MapRect {
  uiMapId: number;
  instance: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

// HereBeDragons-2.0 mapData entry: [1] width, [2] height, [3] left, [4] top (yards, x and y decrease rightwards and downwards).
export interface HbdMap extends Array<number> {
  instance: number;
  mapType: number;
  parent: number;
}

export type HbdMapData = Record<number, HbdMap>;

// Enum.UIMapType.Zone
export const ZONE_MAP_TYPE = 3;
export const NEIGHBOUR_MARGIN_YARDS = 300;
const MAX_DEPTH = 8;

function gap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0;
}

// The current map is always included; others must share its instance and sit within marginYards of it.
export function neighbourMaps(current: number, rects: MapRect[], marginYards: number = NEIGHBOUR_MARGIN_YARDS): Set<number> {
  const result = new Set<number>([current]);
  const here = rects.find((r) => r.uiMapId === current);
  if (here == null) return result;
  for (const other of rects) {
    if (other.instance !== here.instance) continue;
    const dx = gap(here.left - here.width, here.left, other.left - other.width, other.left);
    const dy = gap(here.top - here.height, here.top, other.top - other.height, other.top);
    if (Math.sqrt(dx * dx + dy * dy) <= marginYards) result.add(other.uiMapId);
  }
  return result;
}

export interface NeighbourFinder {
  // Maps near the zone holding uiMapId; empty when it cannot be placed on a zone.
  around(uiMapId: number | null): Set<number>;
}

export function createNeighbourFinder(read: () => HbdMapData | null, zoneType: number = ZONE_MAP_TYPE): NeighbourFinder {
  const cache = new Map<number, Set<number>>();
  const none = new Set<number>();
  let rects: MapRect[] | null = null;

  const isZone = (map: HbdMap): boolean => map.mapType === zoneType && map[0] > 0 && map[1] > 0;

  const resolve = (data: HbdMapData, uiMapId: number): number | null => {
    let id = uiMapId;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const map = data[id];
      if (map == null) return null;
      if (isZone(map)) return id;
      id = map.parent;
    }
    return null;
  };

  return {
    around(uiMapId) {
      if (uiMapId == null) return none;
      const cached = cache.get(uiMapId);
      if (cached != null) return cached;
      const data = read();
      if (data == null) return none;
      const zone = resolve(data, uiMapId);
      if (zone == null) return none;
      if (rects == null) {
        const list: MapRect[] = [];
        for (const [key, map] of Object.entries(data)) {
          if (isZone(map)) list.push({ uiMapId: Number(key), instance: map.instance, left: map[2], top: map[3], width: map[0], height: map[1] });
        }
        rects = list;
      }
      const result = neighbourMaps(zone, rects);
      cache.set(uiMapId, result);
      return result;
    },
  };
}

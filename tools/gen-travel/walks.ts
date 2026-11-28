import type { WorldPos } from "../../addon/src/core/geometry";

// SPF rounds place coordinates to yards; ours are rounded to 0.1 yd.
const MATCH_YARDS = 1.5;
const KNOWN_KINDS = new Set(["taxi", "dock", "portal", "teleport"]);
const POINT_KINDS = new Set(["dock", "portal"]);
export const NO_WAY = -1;

export interface SpfPlace {
  map: number;
  id: string;
  x: number;
  y: number;
}

export interface SpfPair {
  map: number;
  key: string;
  there: number | false;
  back: number | false;
}

export interface OurPlace {
  pos: WorldPos;
  taxiId: number | null;
}

export interface WalkImport {
  walkPlaces: WorldPos[];
  // [from place, to place, yards there, yards back] per pair; NO_WAY on a blocked side.
  walks: number[];
  unbaked: WorldPos[];
  unmodelled: Record<string, number>;
  unknownKinds: string[];
}

function kindOf(id: string): string {
  let end = 0;
  while (end < id.length && id[end] >= "a" && id[end] <= "z") end++;
  if (end === 0 || end === id.length) throw new Error(`gen-travel: unreadable SPF place id "${id}"`);
  return id.slice(0, end);
}

function placeKey(map: number, id: string): string {
  return `${map}:${id}`;
}

function near(place: SpfPlace, pos: WorldPos): boolean {
  return place.map === pos.continent && Math.abs(place.x - pos.x) <= MATCH_YARDS && Math.abs(place.y - pos.y) <= MATCH_YARDS;
}

function yards(value: number | false, what: string): number {
  if (value === false) return NO_WAY;
  if (!Number.isFinite(value) || value < 0) throw new Error(`gen-travel: bad walking cost in ${what}`);
  return Math.round(value);
}

export function importWalks(spfPlaces: SpfPlace[], spfPairs: SpfPair[], ours: OurPlace[]): WalkImport {
  const byKey = new Map<string, SpfPlace>();
  for (const place of spfPlaces) byKey.set(placeKey(place.map, place.id), place);

  const indexOf = new Map<string, number>();
  const walkPlaces: WorldPos[] = [];
  const unbaked: WorldPos[] = [];
  for (const our of ours) {
    let match: SpfPlace | null = null;
    if (our.taxiId != null) {
      const id = `taxi${our.taxiId}`;
      const place = byKey.get(placeKey(our.pos.continent, id));
      if (place != null && !near(place, our.pos)) {
        throw new Error(`gen-travel: SPF place ${id} is at ${place.x},${place.y}, taxi node at ${our.pos.x},${our.pos.y}: baked walks are stale`);
      }
      match = place ?? null;
    } else {
      const found = spfPlaces.filter((place) => POINT_KINDS.has(kindOf(place.id)) && near(place, our.pos));
      if (found.length > 1) throw new Error(`gen-travel: ${our.pos.continent}:${our.pos.x},${our.pos.y} matches SPF places ${found.map((place) => place.id).join(", ")}`);
      match = found.length === 1 ? found[0] : null;
    }
    if (match == null) {
      unbaked.push(our.pos);
      continue;
    }
    const key = placeKey(match.map, match.id);
    if (indexOf.has(key)) throw new Error(`gen-travel: SPF place ${match.id} matches two of our places`);
    indexOf.set(key, walkPlaces.length);
    walkPlaces.push(our.pos);
  }

  const unmodelled: Record<string, number> = {};
  const unknown = new Set<string>();
  for (const place of spfPlaces) {
    const kind = kindOf(place.id);
    if (!KNOWN_KINDS.has(kind)) unknown.add(kind);
    if (!indexOf.has(placeKey(place.map, place.id))) unmodelled[kind] = (unmodelled[kind] ?? 0) + 1;
  }

  const rows: number[][] = [];
  for (const pair of spfPairs) {
    const ids = pair.key.split(" ");
    if (ids.length !== 2) throw new Error(`gen-travel: unreadable SPF walk key "${pair.key}"`);
    for (const id of ids) {
      if (!byKey.has(placeKey(pair.map, id))) throw new Error(`gen-travel: SPF walk "${pair.key}" names unknown place ${id} on map ${pair.map}`);
    }
    const a = indexOf.get(placeKey(pair.map, ids[0]));
    const b = indexOf.get(placeKey(pair.map, ids[1]));
    if (a == null || b == null) continue;
    const there = yards(pair.there, pair.key);
    const back = yards(pair.back, pair.key);
    if (there === NO_WAY && back === NO_WAY) continue;
    rows.push(a < b ? [a, b, there, back] : [b, a, back, there]);
  }
  rows.sort((p, q) => p[0] - q[0] || p[1] - q[1]);

  return {
    walkPlaces,
    walks: rows.flat(),
    unbaked,
    unmodelled: Object.fromEntries(Object.entries(unmodelled).sort(([p], [q]) => p.localeCompare(q))),
    unknownKinds: [...unknown].sort(),
  };
}

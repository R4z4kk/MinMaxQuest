import { ACCESS_CHAINS, resolveSteps } from "../../../addon/src/access/chains";
import { distance, type WorldPos } from "../../../addon/src/core/geometry";
import {
  createQuestRepository,
  isEliteRank,
  type AreaPoint,
  type QuestInfo,
  type QuestObjectiveRef,
  type QuestRepository,
} from "../../../addon/src/data/questRepository";
import { TRAVEL, type TravelData } from "../../../addon/src/data/generated/travel";
import { isAvailable, maskAllows } from "../../../addon/src/quests/availability";
import { CLUSTER_RADIUS_YARDS, clusterSpawns, killLoop } from "../../../addon/src/targets/spawns";
import { dropRate, hasFlag, npcInfo, snapshotLib, type QuestieSnapshot } from "../ingest/snapshot";
import { zonePercentToWorld, type UiMapRect } from "../ingest/zones";
import { BUILDER } from "./constants";

export interface Place { pos: WorldPos; uiMapId: number; x: number; y: number; npcId: number | null; objectId: number | null }
export type TaskKind = "kill" | "collect" | "use";
export interface Task {
  kind: TaskKind;
  objectiveIndex: number;
  count: number;
  cluster: { center: Place; loop: Place[] };
  mobLevel: number;
  elite: boolean;
  dropChance: number;
}
export interface RouteQuest {
  id: number;
  info: QuestInfo;
  accept: Place;
  turnin: Place;
  tasks: Task[];
  dungeonAreaId: number | null;
  accessChain: boolean;
  returnVisit: boolean;
}
export interface Inn { place: Place }
export interface Dungeon { areaId: number; name: string; entrance: Place; questIds: number[] }
export interface StartZone { key: string; faction: "A" | "H"; raceMask: number; areaId: number; start: Place }
export interface World {
  faction: "A" | "H";
  raceMask: number;
  quests: Map<number, RouteQuest>;
  inns: Inn[];
  dungeons: Dungeon[];
  startZones: StartZone[];
  taxiZone: Map<number, number>;
  capitalTaxiNode: number;
  conversionOffsetYards: number;
  excluded: Map<string, number>;
}

export type ExclusionReason =
  | "unreadable"
  | "class"
  | "wrongFaction"
  | "noXp"
  | "unsupportedRequirement"
  | "noStarter"
  | "noFinisher"
  | "noPosition"
  | "unsupportedObjective"
  | "noDropRate"
  | "noMobLevel";

// Race ids: QuestieDB src/corrections/enum/expansions.lua, Forever raceKeys ALL_ALLIANCE / ALL_HORDE.
const FACTION_RACES: Record<"A" | "H", number[]> = { A: [1, 3, 4, 7, 95], H: [2, 5, 6, 8, 96] };

// areaIds: QuestieDB src/corrections/enum/zones.lua (v1.1.6). Classic race start zones per
// https://warcraft.wiki.gg/wiki/Starting_zone; Skyborne (95, 96) start on Zephras Isle (Forever).
const START_AREAS: { key: string; faction: "A" | "H"; races: number[]; areaId: number }[] = [
  { key: "elwynn-forest", faction: "A", races: [1], areaId: 12 },
  { key: "dun-morogh", faction: "A", races: [3, 7], areaId: 1 },
  { key: "teldrassil", faction: "A", races: [4], areaId: 141 },
  { key: "zephras-isle", faction: "A", races: [95], areaId: 16593 },
  { key: "durotar", faction: "H", races: [2, 8], areaId: 14 },
  { key: "tirisfal-glades", faction: "H", races: [5], areaId: 85 },
  { key: "mulgore", faction: "H", races: [6], areaId: 215 },
  { key: "zephras-isle", faction: "H", races: [96], areaId: 16593 },
];

// Taxi node ids from tools/gen-travel output: 2 = Stormwind, 23 = Orgrimmar.
const CAPITAL_TAXI_NODE: Record<"A" | "H", number> = { A: 2, H: 23 };
const MAX_CONVERSION_OFFSET_YARDS = 15;

class Excluded extends Error {
  constructor(readonly reason: ExclusionReason) {
    super(reason);
  }
}

function exclude(reason: ExclusionReason): never {
  throw new Excluded(reason);
}

function raceUnion(s: QuestieSnapshot, races: number[]): number {
  let mask = 0;
  for (const race of races) {
    const bit = s.raceMaskById[race];
    if (bit == null) throw new Error(`world: race ${race} missing from raceMaskById`);
    mask += bit;
  }
  return mask;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildWorld(
  s: QuestieSnapshot,
  zones: Map<number, UiMapRect>,
  faction: "A" | "H",
  travel: TravelData = TRAVEL,
): World {
  const result = createQuestRepository(snapshotLib(s));
  if (!result.ok) throw new Error(`world: ${result.message}`);
  const repo: QuestRepository = result.repo;
  const raceMask = raceUnion(s, FACTION_RACES[faction]);
  const excluded = new Map<string, number>();

  const toPlace = (p: AreaPoint, npcId: number | null, objectId: number | null): Place | null => {
    const uiMapId = repo.uiMapIdForArea(p.areaId);
    const rect = uiMapId == null ? null : zones.get(uiMapId);
    if (uiMapId == null || rect == null) return null;
    return { pos: zonePercentToWorld(rect, p.x, p.y), uiMapId, x: p.x, y: p.y, npcId, objectId };
  };

  const npcPlaceCache = new Map<number, Place[]>();
  const objectPlaceCache = new Map<number, Place[]>();
  const npcPlaces = (id: number): Place[] => {
    let places = npcPlaceCache.get(id);
    if (places == null) {
      places = repo.npcSpawns(id).flatMap((p) => toPlace(p, id, null) ?? []);
      npcPlaceCache.set(id, places);
    }
    return places;
  };
  const objectPlaces = (id: number): Place[] => {
    let places = objectPlaceCache.get(id);
    if (places == null) {
      places = repo.objectSpawns(id).flatMap((p) => toPlace(p, null, id) ?? []);
      objectPlaceCache.set(id, places);
    }
    return places;
  };

  // As positions.ts: nil friendlyToFaction counts as friendly.
  const isFriendly = (npcId: number): boolean => {
    const to = repo.npcFriendlyTo(npcId);
    return to == null || to === "AH" || to === faction;
  };

  const dungeonOfArea = new Map<number, number>();
  for (const [key, d] of Object.entries(s.dungeons)) {
    const areaId = Number(key);
    dungeonOfArea.set(areaId, areaId);
    for (const alt of d.altAreaIds) dungeonOfArea.set(alt, areaId);
  }
  const entrances = new Map<number, Place | null>();
  const entranceOf = (dungeonAreaId: number): Place | null => {
    if (!entrances.has(dungeonAreaId)) {
      const d = s.dungeons[dungeonAreaId];
      let place: Place | null = null;
      for (const e of d?.entrances ?? []) {
        place = toPlace(e, null, null);
        if (place != null) break;
      }
      entrances.set(dungeonAreaId, place);
    }
    return entrances.get(dungeonAreaId) ?? null;
  };
  // A spawn inside an instance has no outdoor map: it converts to nothing but its area is a dungeon area.
  const dungeonOfSpawns = (points: AreaPoint[]): number | null => {
    for (const p of points) {
      const d = dungeonOfArea.get(p.areaId);
      if (d != null && toPlace(p, null, null) == null) return d;
    }
    return null;
  };

  const placeOf = (npcs: number[], objects: number[]): Place | null => {
    for (const id of npcs) if (npcPlaces(id).length > 0) return npcPlaces(id)[0];
    for (const id of objects) if (objectPlaces(id).length > 0) return objectPlaces(id)[0];
    for (const id of npcs) {
      const d = dungeonOfSpawns(repo.npcSpawns(id));
      const entrance = d == null ? null : entranceOf(d);
      if (entrance != null) return { ...entrance, npcId: id };
    }
    for (const id of objects) {
      const d = dungeonOfSpawns(repo.objectSpawns(id));
      const entrance = d == null ? null : entranceOf(d);
      if (entrance != null) return { ...entrance, objectId: id };
    }
    return null;
  };

  const objectiveSpawns = (o: QuestObjectiveRef): AreaPoint[] => {
    if (o.kind === "npc") return repo.npcSpawns(o.id);
    if (o.kind === "object") return repo.objectSpawns(o.id);
    if (o.kind !== "item") return [];
    const sources = repo.itemSources(o.id);
    return [...sources.npcs.flatMap((id) => repo.npcSpawns(id)), ...sources.objects.flatMap((id) => repo.objectSpawns(id))];
  };

  const dungeonOf = (q: QuestInfo): number | null => {
    if (q.zoneAreaId != null && dungeonOfArea.has(q.zoneAreaId)) return dungeonOfArea.get(q.zoneAreaId) ?? null;
    const starterSpawns = [...q.starterNpcs.flatMap((id) => repo.npcSpawns(id)), ...q.starterObjects.flatMap((id) => repo.objectSpawns(id))];
    return dungeonOfSpawns(starterSpawns) ?? dungeonOfSpawns(q.objectives.flatMap(objectiveSpawns));
  };

  // The task cluster is the biggest one; its center is the member nearest the centroid.
  const clusterOf = (places: Place[]): Task["cluster"] => {
    const byPos = new Map<WorldPos, Place>(places.map((p) => [p.pos, p]));
    const clusters = clusterSpawns(places.map((p) => p.pos), CLUSTER_RADIUS_YARDS);
    let best = clusters[0];
    for (const c of clusters) if (c.points.length > best.points.length) best = c;
    let center = best.points[0];
    for (const p of best.points) if (distance(p, best.center) < distance(center, best.center)) center = p;
    const placeAt = (pos: WorldPos): Place => {
      const place = byPos.get(pos);
      if (place == null) throw new Error("world: cluster point without a place");
      return place;
    };
    return { center: placeAt(center), loop: killLoop(best, center).map(placeAt) };
  };

  const mobOf = (npcId: number): { mobLevel: number; elite: boolean } => {
    const info = npcInfo(s, npcId);
    if (info == null) exclude("noMobLevel");
    return { mobLevel: info.maxLevel, elite: isEliteRank(s.npcs[npcId]?.rank ?? 0) };
  };

  const taskOf = (o: QuestObjectiveRef): Task => {
    if (o.kind !== "npc" && o.kind !== "object" && o.kind !== "item") exclude("unsupportedObjective");
    const base = { objectiveIndex: o.index, dropChance: 1 };
    if (o.kind === "npc") {
      const places = npcPlaces(o.id);
      if (places.length === 0) exclude("noPosition");
      return { ...base, kind: "kill", count: o.required, cluster: clusterOf(places), ...mobOf(o.id) };
    }
    if (o.kind === "object") {
      const places = objectPlaces(o.id);
      if (places.length === 0) exclude("noPosition");
      return { ...base, kind: "use", count: o.required, cluster: clusterOf(places), mobLevel: 0, elite: false };
    }
    const sources = repo.itemSources(o.id);
    const spawned = sources.npcs.filter((id) => npcPlaces(id).length > 0);
    let bestNpc: number | null = null;
    let bestRate = 0;
    for (const id of spawned) {
      const rate = dropRate(s, o.id, id) ?? 0;
      if (rate > bestRate) {
        bestNpc = id;
        bestRate = rate;
      }
    }
    if (bestNpc != null) {
      return { ...base, kind: "collect", count: o.required, cluster: clusterOf(npcPlaces(bestNpc)), ...mobOf(bestNpc), dropChance: bestRate };
    }
    const object = sources.objects.find((id) => objectPlaces(id).length > 0);
    if (object != null) {
      const count = Math.ceil(o.required / BUILDER.objectYield.value);
      return { ...base, kind: "use", count, cluster: clusterOf(objectPlaces(object)), mobLevel: 0, elite: false };
    }
    return exclude(spawned.length > 0 ? "noDropRate" : "noPosition");
  };

  const routeQuest = (q: QuestInfo): RouteQuest => {
    if (q.classes !== 0) exclude("class");
    if (!maskAllows(q.races, raceMask)) exclude("wrongFaction");
    if (q.baseXp == null || q.baseXp <= 0) exclude("noXp");
    if (q.hasUnsupportedRequirement) exclude("unsupportedRequirement");
    if (q.starterNpcs.length + q.starterObjects.length === 0) exclude("noStarter");
    if (q.finisherNpcs.length + q.finisherObjects.length === 0) exclude("noFinisher");
    const starters = q.starterNpcs.filter(isFriendly);
    const finishers = q.finisherNpcs.filter(isFriendly);
    if (starters.length + q.starterObjects.length === 0 || finishers.length + q.finisherObjects.length === 0) exclude("wrongFaction");
    const dungeonAreaId = dungeonOf(q);
    const accept = placeOf(starters, q.starterObjects) ?? exclude("noPosition");
    const turnin = placeOf(finishers, q.finisherObjects) ?? exclude("noPosition");
    if (dungeonAreaId != null && entranceOf(dungeonAreaId) == null) exclude("noPosition");
    // A dungeon quest's objectives are done by the dungeon step.
    const tasks = dungeonAreaId != null ? [] : q.objectives.map(taskOf);
    return { id: q.id, info: q, accept, turnin, tasks, dungeonAreaId, accessChain: false, returnVisit: false };
  };

  const quests = new Map<number, RouteQuest>();
  for (const id of repo.allIds()) {
    const info = repo.get(id);
    try {
      if (info == null) exclude("unreadable");
      quests.set(id, routeQuest(info));
    } catch (error) {
      if (!(error instanceof Excluded)) throw error;
      excluded.set(error.reason, (excluded.get(error.reason) ?? 0) + 1);
    }
  }
  const repoError = repo.lastError();
  if (repoError != null) throw new Error(`world: QuestieDB read failed (${repoError})`);

  const chainIds = new Set(ACCESS_CHAINS.flatMap((def) => resolveSteps(def, faction, (id) => repo.get(id))));
  for (const q of quests.values()) {
    q.accessChain = chainIds.has(q.id);
    q.returnVisit =
      q.dungeonAreaId != null &&
      [...q.info.preGroup, ...q.info.preSingle].some((pre) => quests.get(pre)?.dungeonAreaId === q.dungeonAreaId);
  }

  const dungeons: Dungeon[] = [];
  for (const q of quests.values()) {
    if (q.dungeonAreaId == null) continue;
    let d = dungeons.find((x) => x.areaId === q.dungeonAreaId);
    if (d == null) {
      const entrance = entranceOf(q.dungeonAreaId);
      if (entrance == null) throw new Error(`world: dungeon ${q.dungeonAreaId} has no entrance`);
      d = { areaId: q.dungeonAreaId, name: s.dungeons[q.dungeonAreaId].name, entrance, questIds: [] };
      dungeons.push(d);
    }
    d.questIds.push(q.id);
  }
  dungeons.sort((a, b) => a.areaId - b.areaId);

  const inns: Inn[] = [];
  const flightMasters: Place[] = [];
  for (const key of Object.keys(s.npcs)) {
    const id = Number(key);
    const flags = s.npcs[id].npcFlags ?? 0;
    if (!isFriendly(id)) continue;
    if (hasFlag(flags, s.npcFlagValues.innkeeper) && npcPlaces(id).length > 0) inns.push({ place: npcPlaces(id)[0] });
    if (hasFlag(flags, s.npcFlagValues.flightMaster)) flightMasters.push(...npcPlaces(id));
  }
  if (flightMasters.length === 0) throw new Error(`world: no flight master found for faction ${faction}`);

  const nodes = travel.taxiNodes.filter((n) => n.faction === faction || n.faction === "AH");
  if (nodes.length === 0) throw new Error(`world: no taxi node for faction ${faction} in TRAVEL`);
  const taxiZone = new Map<number, number>();
  const offsets: number[] = [];
  for (const node of nodes) {
    let nearest: Place | null = null;
    for (const fm of flightMasters) if (nearest == null || distance(node.pos, fm.pos) < distance(node.pos, nearest.pos)) nearest = fm;
    const offset = nearest == null ? Infinity : distance(node.pos, nearest.pos);
    offsets.push(offset);
    if (nearest != null && Number.isFinite(offset)) taxiZone.set(node.id, nearest.uiMapId);
  }
  const conversionOffsetYards = median(offsets);
  if (!(conversionOffsetYards <= MAX_CONVERSION_OFFSET_YARDS)) {
    throw new Error(`world: zone conversion check failed, median offset ${conversionOffsetYards.toFixed(1)} yd`);
  }

  const capitalTaxiNode = CAPITAL_TAXI_NODE[faction];
  if (!nodes.some((n) => n.id === capitalTaxiNode)) throw new Error(`world: capital taxi node ${capitalTaxiNode} missing from TRAVEL`);

  const startZones: StartZone[] = [];
  for (const area of START_AREAS.filter((a) => a.faction === faction)) {
    const uiMapId = repo.uiMapIdForArea(area.areaId);
    if (uiMapId == null || !zones.has(uiMapId)) continue;
    const zoneMask = raceUnion(s, area.races);
    const player = { level: 1, raceMask: zoneMask, classMask: 0, completed: new Set<number>(), inLog: new Set<number>() };
    let best: RouteQuest | null = null;
    for (const q of quests.values()) {
      if (q.accept.uiMapId !== uiMapId || !isAvailable(q.info, player)) continue;
      if (best == null || q.info.requiredLevel < best.info.requiredLevel) best = q;
    }
    if (best == null) throw new Error(`world: start zone ${area.key} (area ${area.areaId}) has no level-1 quest`);
    startZones.push({ key: area.key, faction, raceMask: zoneMask, areaId: area.areaId, start: best.accept });
  }

  return { faction, raceMask, quests, inns, dungeons, startZones, taxiZone, capitalTaxiNode, conversionOffsetYards, excluded };
}

import { ACCESS_CHAINS, resolveSteps } from "../../access-import/legacyChains";
import { CONSTANTS } from "../../../addon/src/core/constants";
import { distance, type WorldPos } from "../../../addon/src/core/geometry";
import {
  createQuestRepository,
  isEliteRank,
  type AreaPoint,
  type QuestInfo,
  type QuestObjectiveRef,
  type QuestRepository,
} from "../../../addon/src/data/questRepository";
import type { TravelData } from "../../../addon/src/data/generated/travel";
import { isFriendlyTo } from "../../../addon/src/game/positions";
import { buildGraph, solveFrom, travelTime, type TravelContext } from "../../../addon/src/travel/graph";
import { isAvailable, maskAllows } from "../../../addon/src/quests/availability";
import { CLUSTER_RADIUS_YARDS, clusterSpawns, killLoop } from "../../../addon/src/targets/spawns";
import type { CmangosCounts } from "../ingest/cmangos";
import { textCount } from "../ingest/counts";
import { INSTANCE_PARTY, INSTANCE_PVP, INSTANCE_RAID } from "../ingest/instances";
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
  // No known drop rate: the simulator uses the scenario's questDropChance; dropChance is then 0.
  assumedDropChance: boolean;
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
// Per objective. fromTextSingular: name only in its singular form, no number (count 1).
// bothSources: text and cmangos both give a count. assumedDropRate: collect tasks without a known drop rate.
export interface CountStats {
  fromText: number;
  fromTextSingular: number;
  fromCmangos: number;
  bothSources: number;
  disagreements: number;
  noCount: number;
  assumedDropRate: number;
}
export interface World {
  faction: "A" | "H";
  raceMask: number;
  raceMasks: number[];
  quests: Map<number, RouteQuest>;
  inns: Inn[];
  dungeons: Dungeon[];
  startZones: StartZone[];
  taxiZone: Map<number, number>;
  taxiPlaces: Map<number, Place>;
  unlearnableTaxiNodes: number[];
  areaUiMap: Map<number, number>;
  capitalTaxiNode: number;
  conversionOffsetYards: number;
  excluded: Map<string, number>;
  countStats: CountStats;
}

export type ExclusionReason =
  | "unreadable"
  | "class"
  | "wrongFaction"
  | "noXp"
  | "unsupportedRequirement"
  | "repeatable"
  | "seasonal"
  | "noStarter"
  | "noFinisher"
  | "noPosition"
  | "unsupportedObjective"
  | "noDropRate"
  | "noMobLevel"
  | "noCount"
  | "raidOrBattleground";

// Race ids: QuestieDB src/corrections/enum/expansions.lua, Forever raceKeys ALL_ALLIANCE / ALL_HORDE.
export const FACTION_RACES: Record<"A" | "H", number[]> = { A: [1, 3, 4, 7, 95], H: [2, 5, 6, 8, 96] };

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
// Beyond this the node has no reachable flight master in QuestieDB.
export const MAX_FLIGHT_MASTER_OFFSET_YARDS = 100;

class Excluded extends Error {
  constructor(readonly reason: ExclusionReason) {
    super(reason);
  }
}

function exclude(reason: ExclusionReason): never {
  throw new Excluded(reason);
}

export function raceUnion(s: QuestieSnapshot, races: number[]): number {
  let mask = 0;
  for (const race of races) {
    const bit = s.raceMaskById[race];
    if (bit == null) throw new Error(`world: race ${race} missing from raceMaskById`);
    mask += bit;
  }
  return mask;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildWorld(
  s: QuestieSnapshot,
  zones: Map<number, UiMapRect>,
  faction: "A" | "H",
  travel: TravelData,
  instanceTypes: Map<number, number>,
  counts: CmangosCounts,
): World {
  const result = createQuestRepository(snapshotLib(s));
  if (!result.ok) throw new Error(`world: ${result.message}`);
  const repo: QuestRepository = result.repo;
  const raceMask = raceUnion(s, FACTION_RACES[faction]);
  const raceMasks = FACTION_RACES[faction].map((race) => raceUnion(s, [race]));
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

  const isFriendly = (npcId: number): boolean => isFriendlyTo(repo.npcFriendlyTo(npcId), faction);

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
  type Entity = { kind: "npc" | "object"; id: number };
  const outdoorPlaces = (e: Entity): Place[] => (e.kind === "npc" ? npcPlaces(e.id) : objectPlaces(e.id));
  // Raw area keys: the repository drops the [-1, -1] sentinels QuestieDB uses for in-instance spawns.
  const entityDungeon = (e: Entity): number | null => {
    const spawns = e.kind === "npc" ? s.npcs[e.id]?.spawns : s.objects[e.id]?.spawns;
    if (spawns == null || typeof spawns !== "object" || outdoorPlaces(e).length > 0) return null;
    for (const key of Object.keys(spawns)) {
      const d = dungeonOfArea.get(Number(key));
      if (d != null) return d;
    }
    return null;
  };
  // A group (starters, finishers, one objective's sources) is inside a dungeon only if none of it is outdoors.
  const groupDungeon = (group: Entity[]): number | null => {
    if (group.some((e) => outdoorPlaces(e).length > 0)) return null;
    for (const e of group) {
      const d = entityDungeon(e);
      if (d != null) return d;
    }
    return null;
  };
  const entities = (npcs: number[], objects: number[]): Entity[] => [
    ...npcs.map((id): Entity => ({ kind: "npc", id })),
    ...objects.map((id): Entity => ({ kind: "object", id })),
  ];

  const placeOf = (group: Entity[]): Place | null => {
    for (const e of group) if (outdoorPlaces(e).length > 0) return outdoorPlaces(e)[0];
    for (const e of group) {
      const d = entityDungeon(e);
      const entrance = d == null ? null : entranceOf(d);
      if (entrance != null) return e.kind === "npc" ? { ...entrance, npcId: e.id } : { ...entrance, objectId: e.id };
    }
    return null;
  };

  const objectiveGroup = (o: QuestObjectiveRef): Entity[] => {
    if (o.kind === "npc") return entities([o.id], []);
    if (o.kind === "object") return entities([], [o.id]);
    if (o.kind !== "item") return [];
    const sources = repo.itemSources(o.id);
    return entities(sources.npcs, sources.objects);
  };

  const dungeonOf = (q: QuestInfo, starters: Entity[], finishers: Entity[]): number | null => {
    if (q.zoneAreaId != null && dungeonOfArea.has(q.zoneAreaId)) return dungeonOfArea.get(q.zoneAreaId) ?? null;
    for (const group of [starters, finishers, ...q.objectives.map(objectiveGroup)]) {
      const d = groupDungeon(group);
      if (d != null) return d;
    }
    return null;
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

  const countStats: CountStats = { fromText: 0, fromTextSingular: 0, fromCmangos: 0, bothSources: 0, disagreements: 0, noCount: 0, assumedDropRate: 0 };
  const single = (values: (number | null)[]): number | null => {
    const distinct = new Set(values.filter((v): v is number => v != null));
    return distinct.size === 1 ? [...distinct][0] : null;
  };
  // Kill-credit entries (objectives slot 5): {creditNpcIds, baseNpcId, text}; the repository keys them by the first credit.
  const creditIds = (questId: number, npcId: number): number[] => {
    const raw: unknown = s.quests[questId]?.objectives;
    const entries: unknown = Array.isArray(raw) ? (raw as unknown[])[4] : null;
    const ids = [npcId];
    if (!Array.isArray(entries)) return ids;
    for (const entry of entries as unknown[]) {
      if (!Array.isArray(entry)) continue;
      const [rawCredits, rawBase] = entry as unknown[];
      const credits = Array.isArray(rawCredits) ? (rawCredits as unknown[]).filter((id): id is number => typeof id === "number") : [];
      const base = typeof rawBase === "number" ? rawBase : null;
      if ((credits[0] ?? base) !== npcId) continue;
      for (const id of [...credits, ...(base == null ? [] : [base])]) if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  const countOf = (questId: number, o: { kind: "npc" | "object" | "item"; id: number }): number => {
    const text: unknown = s.quests[questId]?.objectivesText;
    const lines = Array.isArray(text) ? (text as unknown[]).filter((line): line is string => typeof line === "string") : null;
    const ids = o.kind === "npc" ? creditIds(questId, o.id) : [o.id];
    const nameOf = (id: number): string | null =>
      (o.kind === "npc" ? s.npcs[id]?.name : o.kind === "object" ? s.objects[id]?.name : s.items[id]?.name) ?? null;
    const parsed = ids.flatMap((id) => {
      const name = nameOf(id);
      const found = name == null ? null : textCount(lines, name);
      return found == null ? [] : [found];
    });
    const fromText = single(parsed.map((p) => p.count));
    const singular = fromText != null && parsed.every((p) => p.singular);
    const fromCmangos = single(ids.map((id) => (o.kind === "item" ? counts.get(questId, "item", id) : counts.get(questId, "npcOrObject", o.kind === "object" ? -id : id))));
    if (fromText != null && fromCmangos != null) {
      countStats.bothSources++;
      if (fromText !== fromCmangos) countStats.disagreements++;
    }
    if (fromText != null) {
      if (singular) countStats.fromTextSingular++;
      else countStats.fromText++;
      return fromText;
    }
    if (fromCmangos != null) {
      countStats.fromCmangos++;
      return fromCmangos;
    }
    countStats.noCount++;
    return exclude("noCount");
  };

  const taskOf = (questId: number, o: QuestObjectiveRef): Task => {
    if (o.kind !== "npc" && o.kind !== "object" && o.kind !== "item") exclude("unsupportedObjective");
    const count = countOf(questId, o);
    const base = { objectiveIndex: o.index, dropChance: 1, assumedDropChance: false };
    if (o.kind === "npc") {
      const places = npcPlaces(o.id);
      if (places.length === 0) exclude("noPosition");
      return { ...base, kind: "kill", count, cluster: clusterOf(places), ...mobOf(o.id) };
    }
    if (o.kind === "object") {
      const places = objectPlaces(o.id);
      if (places.length === 0) exclude("noPosition");
      return { ...base, kind: "use", count, cluster: clusterOf(places), mobLevel: 0, elite: false };
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
      return { ...base, kind: "collect", count, cluster: clusterOf(npcPlaces(bestNpc)), ...mobOf(bestNpc), dropChance: bestRate };
    }
    const object = sources.objects.find((id) => objectPlaces(id).length > 0);
    if (object != null) {
      return { ...base, kind: "use", count: Math.ceil(count / BUILDER.objectYield.value), cluster: clusterOf(objectPlaces(object)), mobLevel: 0, elite: false };
    }
    // Unknown rate (absent from the drop tables): the most spawned source, at the scenario's assumed chance.
    let assumedNpc: number | null = null;
    for (const id of spawned) {
      if (dropRate(s, o.id, id) != null) continue;
      if (assumedNpc == null || npcPlaces(id).length > npcPlaces(assumedNpc).length) assumedNpc = id;
    }
    if (assumedNpc != null) {
      const task: Task = { ...base, kind: "collect", count, cluster: clusterOf(npcPlaces(assumedNpc)), ...mobOf(assumedNpc), dropChance: 0, assumedDropChance: true };
      countStats.assumedDropRate++;
      return task;
    }
    return exclude(spawned.length > 0 ? "noDropRate" : "noPosition");
  };

  const routeQuest = (q: QuestInfo): RouteQuest => {
    if (q.classes !== 0) exclude("class");
    if (!maskAllows(q.races, raceMask)) exclude("wrongFaction");
    if (q.baseXp == null || q.baseXp <= 0) exclude("noXp");
    if (q.hasUnsupportedRequirement) exclude("unsupportedRequirement");
    if (q.repeatable) exclude("repeatable");
    if (q.seasonal) exclude("seasonal");
    if (q.starterNpcs.length + q.starterObjects.length === 0) exclude("noStarter");
    if (q.finisherNpcs.length + q.finisherObjects.length === 0) exclude("noFinisher");
    const starters = entities(q.starterNpcs.filter(isFriendly), q.starterObjects);
    const finishers = entities(q.finisherNpcs.filter(isFriendly), q.finisherObjects);
    if (starters.length === 0 || finishers.length === 0) exclude("wrongFaction");
    const instance = dungeonOf(q, starters, finishers);
    const instanceType = instance == null ? null : (instanceTypes.get(instance) ?? null);
    if (instanceType === INSTANCE_RAID || instanceType === INSTANCE_PVP) exclude("raidOrBattleground");
    // Non-instance entries of QuestieDB's dungeon list (Deeprun Tram, PvP barracks) are ordinary quest areas.
    const dungeonAreaId = instanceType == null || instanceType === INSTANCE_PARTY ? instance : null;
    const accept = placeOf(starters) ?? exclude("noPosition");
    const turnin = placeOf(finishers) ?? exclude("noPosition");
    if (dungeonAreaId != null && entranceOf(dungeonAreaId) == null) exclude("noPosition");
    // A dungeon quest's objectives are done by the dungeon step.
    const tasks = dungeonAreaId != null ? [] : q.objectives.map((o) => taskOf(q.id, o));
    if (instance != null && instanceType == null) {
      throw new Error(`world: dungeon ${instance} (${s.dungeons[instance].name}) has no instance type`);
    }
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
  const taxiPlaces = new Map<number, Place>();
  const unlearnableTaxiNodes: number[] = [];
  const offsets: number[] = [];
  for (const node of [...nodes].sort((a, b) => a.id - b.id)) {
    let nearest: Place | null = null;
    for (const fm of flightMasters) if (nearest == null || distance(node.pos, fm.pos) < distance(node.pos, nearest.pos)) nearest = fm;
    const offset = nearest == null ? Infinity : distance(node.pos, nearest.pos);
    offsets.push(offset);
    if (nearest != null && offset <= MAX_FLIGHT_MASTER_OFFSET_YARDS) {
      taxiZone.set(node.id, nearest.uiMapId);
      taxiPlaces.set(node.id, nearest);
    } else {
      unlearnableTaxiNodes.push(node.id);
    }
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
    if (uiMapId == null || !zones.has(uiMapId)) throw new Error(`world: start zone ${area.key} (area ${area.areaId}) has no zone map`);
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

  // Walks stop at islands and cliffs (Teldrassil for the Horde): a quest no start reaches would stall the route.
  const capitalNode = nodes.find((n) => n.id === capitalTaxiNode);
  if (capitalNode == null) throw new Error(`world: capital taxi node ${capitalTaxiNode} missing from TRAVEL`);
  const reachCtx: TravelContext = {
    speed: CONSTANTS.runSpeed.value,
    knownTaxiNodes: new Set(nodes.map((n) => n.id)),
    faction,
    hearth: { ready: false, pos: null },
    hearthPenaltySec: 0,
  };
  const reachGraph = buildGraph(travel, reachCtx);
  const reachPlans = [capitalNode.pos, ...startZones.map((z) => z.start.pos)].map((origin) => solveFrom(reachGraph, origin, reachCtx));
  const reachable = (p: Place): boolean => reachPlans.some((plan) => Number.isFinite(travelTime(plan, reachGraph, p.pos, reachCtx)));
  for (const [id, q] of quests) {
    const entrance = dungeons.find((d) => d.areaId === q.dungeonAreaId)?.entrance;
    const places = [q.accept, q.turnin, ...q.tasks.map((t) => t.cluster.center), ...(entrance == null ? [] : [entrance])];
    if (places.every(reachable)) continue;
    quests.delete(id);
    excluded.set("unreachable", (excluded.get("unreachable") ?? 0) + 1);
  }
  for (const d of dungeons) d.questIds = d.questIds.filter((id) => quests.has(id));
  const reachableDungeons = dungeons.filter((d) => d.questIds.length > 0);

  const repoError = repo.lastError();
  if (repoError != null) throw new Error(`world: QuestieDB read failed (${repoError})`);
  const areaUiMap = new Map(Object.entries(s.areaIdToUiMapId).map(([areaId, uiMapId]) => [Number(areaId), uiMapId]));
  return { faction, raceMask, raceMasks, quests, inns, dungeons: reachableDungeons, startZones, taxiZone, taxiPlaces, unlearnableTaxiNodes, areaUiMap, capitalTaxiNode, conversionOffsetYards, excluded, countStats };
}

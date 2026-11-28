import { distance, type WorldPos } from "../core/geometry";
import { PROFESSIONS, type ProfessionData } from "../data/generated/professions";
import type { AreaPoint, QuestRepository } from "../data/questRepository";
import type { PlaceFor } from "../route/insert";
import type { CompletionInput } from "../targets/completion";
import type { PlanFor } from "./professions";

export type AreaToWorld = (point: AreaPoint) => WorldPos | null;

const PERCENT = 100;

// GetWorldPosFromMapPos returns (continentId, vec) with vec.x = world north and vec.y = world west, like UnitPosition.
// x and y are map percents, as in QuestieDB spawns and route steps.
export function uiMapToWorld(uiMapId: number, x: number, y: number): WorldPos | null {
  const [continent, vec] = C_Map.GetWorldPosFromMapPos(uiMapId, CreateVector2D(x / PERCENT, y / PERCENT));
  if (continent == null || vec == null || !Number.isFinite(vec.x) || !Number.isFinite(vec.y)) return null;
  return { continent, x: vec.x, y: vec.y };
}

export function mapToWorld(repo: QuestRepository): AreaToWorld {
  return (point) => {
    const uiMapId = repo.uiMapIdForArea(point.areaId);
    return uiMapId == null ? null : uiMapToWorld(uiMapId, point.x, point.y);
  };
}

// As Questie DistanceUtils.GetNearestFinisherOrStarter with IsFriendlyToPlayer: nil friendlyToFaction counts as friendly.
export function isFriendlyTo(read: "A" | "H" | "AH" | null, side: "A" | "H"): boolean {
  return read == null || read === "AH" || read === side;
}

const FRIENDLY = "friendly";
const HOSTILE = "hostile";

function friendlyAuctioneers(auctioneers: ProfessionData["auctioneers"], side: "A" | "H" | null): number[] {
  const out: number[] = [];
  for (const a of auctioneers) if (side == null || isFriendlyTo(a.faction, side)) out.push(a.npcId);
  return out;
}

// Spawn of the quest's starter, objective source or finisher for route insertion: the one nearest to the
// player (a battleground quest's finisher stands in every capital), else the first convertible one.
export function createPlaceFor(
  repo: QuestRepository,
  faction: () => "A" | "H" | null,
  near: () => WorldPos | null,
  toWorld: (uiMapId: number, x: number, y: number) => WorldPos | null = uiMapToWorld,
  planFor: PlanFor | null = null,
  auctioneers: ProfessionData["auctioneers"] = PROFESSIONS.auctioneers,
): PlaceFor {
  const first = (points: AreaPoint[]): { uiMapId: number; x: number; y: number } | null => {
    const from = near();
    let best: { uiMapId: number; x: number; y: number } | null = null;
    let bestYards = Infinity;
    for (const point of points) {
      const uiMapId = repo.uiMapIdForArea(point.areaId);
      const pos = uiMapId == null ? null : toWorld(uiMapId, point.x, point.y);
      if (uiMapId == null || pos == null) continue;
      if (from == null) return { uiMapId, x: point.x, y: point.y };
      const yards = distance(from, pos);
      if (best == null || yards < bestYards) {
        best = { uiMapId, x: point.x, y: point.y };
        bestYards = yards;
      }
    }
    return best;
  };
  const from = (npcs: number[], objects: number[], friendlyOnly: boolean): { uiMapId: number; x: number; y: number } | null => {
    const side = faction();
    for (const id of npcs) {
      if (friendlyOnly && side != null && !isFriendlyTo(repo.npcFriendlyTo(id), side)) continue;
      const place = first(repo.npcSpawns(id));
      if (place != null) return place;
    }
    for (const id of objects) {
      const place = first(repo.objectSpawns(id));
      if (place != null) return place;
    }
    return null;
  };
  return (q, kind, objectiveIndex) => {
    if (kind === "accept") return from(q.starterNpcs, q.starterObjects, true);
    if (kind === "turnin") return from(q.finisherNpcs, q.finisherObjects, true);
    const objective = q.objectives.find((o) => o.index === objectiveIndex);
    if (objective == null) return null;
    if (objective.kind === "npc") return from([objective.id], [], false);
    if (objective.kind === "object") return from([], [objective.id], false);
    if (objective.kind !== "item") return null;
    const plan = planFor?.(q, objective.index) ?? null;
    if (plan == null) {
      const sources = repo.itemSources(objective.id);
      return from(sources.npcs, sources.objects, false);
    }
    if (plan.how === "gather") return from(plan.npcs, plan.objects, false);
    if (plan.how !== "buy") return "anywhere";
    const points: AreaPoint[] = [];
    for (const id of friendlyAuctioneers(auctioneers, faction())) for (const point of repo.npcSpawns(id)) points.push(point);
    return first(points);
  };
}

export function createPositions(
  repo: QuestRepository,
  toWorld: AreaToWorld,
  faction: () => "A" | "H" | null,
  planFor: PlanFor | null = null,
  auctioneers: ProfessionData["auctioneers"] = PROFESSIONS.auctioneers,
): CompletionInput["positionsFor"] {
  const friendly: Record<number, string> = {};
  const npcPoints: Record<number, WorldPos[]> = {};
  const objectPoints: Record<number, WorldPos[]> = {};
  const itemSources: Record<number, { npcs: number[]; objects: number[] }> = {};

  const convert = (points: AreaPoint[]): WorldPos[] => {
    const out: WorldPos[] = [];
    for (const point of points) {
      const pos = toWorld(point);
      if (pos != null) out.push(pos);
    }
    return out;
  };

  const cached = (cache: Record<number, WorldPos[]>, id: number, read: (id: number) => AreaPoint[]): WorldPos[] => {
    let points = cache[id];
    if (points == null) {
      points = convert(read(id));
      cache[id] = points;
    }
    return points;
  };

  const collect = (npcs: number[], objects: number[]): WorldPos[] => {
    const out: WorldPos[] = [];
    for (const id of npcs) for (const pos of cached(npcPoints, id, (n) => repo.npcSpawns(n))) out.push(pos);
    for (const id of objects) for (const pos of cached(objectPoints, id, (o) => repo.objectSpawns(o))) out.push(pos);
    return out;
  };

  const friendlyNpcs = (npcs: number[]): number[] => {
    const side = faction();
    if (side == null) return npcs;
    return npcs.filter((id) => {
      let to = friendly[id];
      if (to == null) {
        to = isFriendlyTo(repo.npcFriendlyTo(id), side) ? FRIENDLY : HOSTILE;
        friendly[id] = to;
      }
      return to !== HOSTILE;
    });
  };

  return (q, kind, objectiveIndex) => {
    if (kind === "accept") return collect(friendlyNpcs(q.starterNpcs), q.starterObjects);
    if (kind === "turnin") return collect(friendlyNpcs(q.finisherNpcs), q.finisherObjects);
    const objective = q.objectives.find((o) => o.index === objectiveIndex);
    if (objective == null) return [];
    if (objective.kind === "npc") return collect([objective.id], []);
    if (objective.kind === "object") return collect([], [objective.id]);
    if (objective.kind !== "item") return [];
    const plan = planFor?.(q, objective.index) ?? null;
    if (plan != null) {
      if (plan.how === "gather") return collect(plan.npcs, plan.objects);
      return plan.how === "buy" ? collect(friendlyAuctioneers(auctioneers, faction()), []) : [];
    }
    let sources = itemSources[objective.id];
    if (sources == null) {
      sources = repo.itemSources(objective.id);
      itemSources[objective.id] = sources;
    }
    return collect(sources.npcs, sources.objects);
  };
}

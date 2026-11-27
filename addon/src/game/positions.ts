import type { WorldPos } from "../core/geometry";
import type { AreaPoint, QuestRepository } from "../data/questRepository";
import type { CompletionInput } from "../targets/completion";

export type AreaToWorld = (point: AreaPoint) => WorldPos | null;

const PERCENT = 100;

// GetWorldPosFromMapPos returns (continentId, vec) with vec.x = world north and vec.y = world west, like UnitPosition.
export function mapToWorld(repo: QuestRepository): AreaToWorld {
  return (point) => {
    const uiMapId = repo.uiMapIdForArea(point.areaId);
    if (uiMapId == null) return null;
    const [continent, vec] = C_Map.GetWorldPosFromMapPos(uiMapId, CreateVector2D(point.x / PERCENT, point.y / PERCENT));
    if (continent == null || vec == null || !Number.isFinite(vec.x) || !Number.isFinite(vec.y)) return null;
    return { continent, x: vec.x, y: vec.y };
  };
}

// As Questie DistanceUtils.GetNearestFinisherOrStarter with IsFriendlyToPlayer: nil friendlyToFaction counts as friendly.
export function isFriendlyTo(read: "A" | "H" | "AH" | null, side: "A" | "H"): boolean {
  return read == null || read === "AH" || read === side;
}

const FRIENDLY = "friendly";
const HOSTILE = "hostile";

export function createPositions(
  repo: QuestRepository,
  toWorld: AreaToWorld,
  faction: () => "A" | "H" | null,
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
    let sources = itemSources[objective.id];
    if (sources == null) {
      sources = repo.itemSources(objective.id);
      itemSources[objective.id] = sources;
    }
    return collect(sources.npcs, sources.objects);
  };
}

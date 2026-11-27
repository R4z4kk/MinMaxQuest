import type { WorldPos } from "../core/geometry";
import type { QuestInfo } from "../data/questRepository";
import type { StepType } from "../route/format";
import {
  isAvailable,
  isTrivial,
  maskAllows,
  passesMaxLevelOption,
  type PlayerQuestState,
} from "../quests/availability";
import { objectiveClusters, pickCluster, type SpawnCluster } from "./spawns";

export type TargetKind = "accept" | "objective" | "turnin" | "route";
export type QuestTargetKind = Exclude<TargetKind, "route">;

// Set for targets built from a route step; label only matters for non-quest steps.
export interface RouteRef {
  index: number;
  type: StepType;
  label: string;
}

export interface Target {
  // Null only for non-quest route steps.
  questId: number | null;
  kind: TargetKind;
  objectiveIndex: number | null;
  pos: WorldPos;
  cluster: SpawnCluster | null;
  otherSpots: number;
  seconds: number;
  // Part of seconds that only ranks (hearthstone penalty); not shown.
  penaltySec: number;
  questLevel: number;
  trivial: boolean;
  elite: boolean;
  zoneAreaId: number | null;
  route: RouteRef | null;
}

export interface CompletionOptions {
  mode: "proximity" | "zone" | "log";
  zoneAreaId: number | null;
  showTrivial: boolean;
  showElite: boolean;
  minLevelGap: number | null;
  pinnedQuestId: number | null;
  maxLevel: number;
  // Proximity only: ui maps allowed; absent means no restriction.
  nearbyMaps?: Set<number>;
}

export interface CompletionInput {
  quests: QuestInfo[];
  log: Map<number, { complete: boolean; objectivesDone: Set<number>; counts?: { have: number; need: number }[] }>;
  player: PlayerQuestState;
  greenRange: number;
  positionsFor: (q: QuestInfo, kind: QuestTargetKind, objectiveIndex: number | null) => WorldPos[];
  timeTo: (p: WorldPos) => number;
  // Spawns never change, so clusters are kept across refreshes, keyed by questId:objectiveIndex.
  clusters: Map<string, SpawnCluster[]>;
  uiMapOf?: (zoneAreaId: number) => number | null;
  penaltyOf?: (p: WorldPos) => number;
}

export interface ZoneProgress {
  done: number;
  total: number;
}

function inNearbyMaps(q: QuestInfo, maps: Set<number>, uiMapOf: CompletionInput["uiMapOf"]): boolean {
  if (q.zoneAreaId == null || uiMapOf == null) return false;
  const uiMapId = uiMapOf(q.zoneAreaId);
  return uiMapId != null && maps.has(uiMapId);
}

export function selectTargets(input: CompletionInput, opts: CompletionOptions): Target[] {
  const { log, player, greenRange, positionsFor } = input;
  const times = new Map<WorldPos, number>();
  const timeTo = (p: WorldPos): number => {
    const cached = times.get(p);
    if (cached != null) return cached;
    const raw = input.timeTo(p);
    const t = Number.isNaN(raw) ? Infinity : raw;
    times.set(p, t);
    return t;
  };
  const targets: Target[] = [];

  const push = (
    q: QuestInfo,
    trivial: boolean,
    kind: QuestTargetKind,
    objectiveIndex: number | null,
    pos: WorldPos,
    cluster: SpawnCluster | null,
    otherSpots: number,
  ): void => {
    targets.push({
      questId: q.id,
      kind,
      objectiveIndex,
      pos,
      cluster,
      otherSpots,
      seconds: timeTo(pos),
      penaltySec: input.penaltyOf?.(pos) ?? 0,
      questLevel: q.level,
      trivial,
      elite: q.isElite,
      zoneAreaId: q.zoneAreaId,
      route: null,
    });
  };

  const nearest = (points: WorldPos[]): WorldPos | null => {
    let best: WorldPos | null = null;
    let bestTime = Infinity;
    for (const p of points) {
      const t = timeTo(p);
      if (best === null || t < bestTime) {
        best = p;
        bestTime = t;
      }
    }
    return best;
  };

  for (const q of input.quests) {
    const trivial = isTrivial(q, player, greenRange);
    const entry = log.get(q.id);
    const pinned = q.id === opts.pinnedQuestId;
    if (opts.mode === "log") {
      if (entry == null && !pinned) continue;
    } else if (!pinned) {
      if (!opts.showElite && q.isElite) continue;
      if (!opts.showTrivial && trivial) continue;
      if (opts.mode === "proximity" && opts.nearbyMaps != null && !inNearbyMaps(q, opts.nearbyMaps, input.uiMapOf)) continue;
      if (opts.mode === "zone" && (opts.zoneAreaId == null || q.zoneAreaId !== opts.zoneAreaId)) continue;
    }

    if (entry == null) {
      if (!isAvailable(q, player) || !passesMaxLevelOption(q, player, opts.minLevelGap)) continue;
      if (q.clothDonation && player.level >= opts.maxLevel) continue;
      const pos = nearest(positionsFor(q, "accept", null));
      if (pos != null) push(q, trivial, "accept", null, pos, null, 0);
    } else if (entry.complete) {
      const pos = nearest(positionsFor(q, "turnin", null));
      if (pos != null) push(q, trivial, "turnin", null, pos, null, 0);
    } else {
      for (const obj of q.objectives) {
        if (entry.objectivesDone.has(obj.index)) continue;
        const key = `${q.id}:${obj.index}`;
        let clusters = input.clusters.get(key);
        if (clusters == null) {
          clusters = objectiveClusters(positionsFor(q, "objective", obj.index));
          input.clusters.set(key, clusters);
        }
        const cluster = pickCluster(clusters, timeTo);
        if (cluster != null) push(q, trivial, "objective", obj.index, cluster.center, cluster, clusters.length - 1);
      }
    }
  }

  targets.sort((a, b) => {
    if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
    if (a.questId !== b.questId) return (a.questId ?? 0) - (b.questId ?? 0);
    return (a.objectiveIndex ?? 0) - (b.objectiveIndex ?? 0);
  });
  return targets;
}

type Masks = Pick<PlayerQuestState, "raceMask" | "classMask">;

export function zoneTotals(quests: QuestInfo[], completed: Set<number>, player: Masks): Map<number, ZoneProgress> {
  const totals = new Map<number, ZoneProgress>();
  for (const q of quests) {
    if (q.zoneAreaId == null) continue;
    if (!maskAllows(q.races, player.raceMask) || !maskAllows(q.classes, player.classMask)) continue;
    let zone = totals.get(q.zoneAreaId);
    if (zone == null) {
      zone = { done: 0, total: 0 };
      totals.set(q.zoneAreaId, zone);
    }
    zone.total++;
    if (completed.has(q.id)) zone.done++;
  }
  return totals;
}

export function zoneProgress(
  quests: QuestInfo[],
  completed: Set<number>,
  zoneAreaId: number,
  player: Masks,
): ZoneProgress {
  return zoneTotals(quests, completed, player).get(zoneAreaId) ?? { done: 0, total: 0 };
}

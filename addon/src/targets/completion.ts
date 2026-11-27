import type { WorldPos } from "../core/geometry";
import type { QuestInfo } from "../data/questRepository";
import {
  isAvailable,
  isTrivial,
  maskAllows,
  passesMaxLevelOption,
  type PlayerQuestState,
} from "../quests/availability";
import { CLUSTER_RADIUS_YARDS, clusterSpawns, pickCluster, type SpawnCluster } from "./spawns";

export type TargetKind = "accept" | "objective" | "turnin";

export interface Target {
  questId: number;
  kind: TargetKind;
  objectiveIndex: number | null;
  pos: WorldPos;
  cluster: SpawnCluster | null;
  otherSpots: number;
  seconds: number;
  questLevel: number;
  trivial: boolean;
  elite: boolean;
  zoneAreaId: number | null;
}

export interface CompletionOptions {
  mode: "proximity" | "zone";
  zoneAreaId: number | null;
  showTrivial: boolean;
  showElite: boolean;
  minLevelGap: number | null;
}

export interface CompletionInput {
  quests: QuestInfo[];
  log: Map<number, { complete: boolean; objectivesDone: Set<number> }>;
  player: PlayerQuestState;
  greenRange: number;
  positionsFor: (q: QuestInfo, kind: TargetKind, objectiveIndex: number | null) => WorldPos[];
  timeTo: (p: WorldPos) => number;
  // Spawns never change, so clusters are kept across refreshes, keyed by questId:objectiveIndex.
  clusters: Map<string, SpawnCluster[]>;
}

export interface ZoneProgress {
  done: number;
  total: number;
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
    kind: TargetKind,
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
      questLevel: q.level,
      trivial,
      elite: q.isElite,
      zoneAreaId: q.zoneAreaId,
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
    if (!opts.showElite && q.isElite) continue;
    const trivial = isTrivial(q, player, greenRange);
    if (!opts.showTrivial && trivial) continue;
    if (opts.mode === "zone" && (opts.zoneAreaId == null || q.zoneAreaId !== opts.zoneAreaId)) continue;

    const entry = log.get(q.id);
    if (entry == null) {
      if (!isAvailable(q, player) || !passesMaxLevelOption(q, player, opts.minLevelGap)) continue;
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
          clusters = clusterSpawns(positionsFor(q, "objective", obj.index), CLUSTER_RADIUS_YARDS);
          input.clusters.set(key, clusters);
        }
        const cluster = pickCluster(clusters, timeTo);
        if (cluster != null) push(q, trivial, "objective", obj.index, cluster.center, cluster, clusters.length - 1);
      }
    }
  }

  targets.sort((a, b) => {
    if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
    if (a.questId !== b.questId) return a.questId - b.questId;
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

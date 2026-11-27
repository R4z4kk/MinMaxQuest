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
}

export interface ZoneProgress {
  done: number;
  total: number;
}

export function selectTargets(input: CompletionInput, opts: CompletionOptions): Target[] {
  const { log, player, greenRange, positionsFor } = input;
  const timeTo = (p: WorldPos): number => {
    const t = input.timeTo(p);
    return Number.isNaN(t) ? Infinity : t;
  };
  const targets: Target[] = [];

  const push = (
    q: QuestInfo,
    kind: TargetKind,
    objectiveIndex: number | null,
    pos: WorldPos,
    cluster: SpawnCluster | null,
  ): void => {
    targets.push({
      questId: q.id,
      kind,
      objectiveIndex,
      pos,
      cluster,
      seconds: timeTo(pos),
      questLevel: q.level,
      trivial: isTrivial(q, player, greenRange),
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
    if (!opts.showTrivial && isTrivial(q, player, greenRange)) continue;
    if (opts.mode === "zone" && q.zoneAreaId !== opts.zoneAreaId) continue;

    const entry = log.get(q.id);
    if (entry == null) {
      if (!isAvailable(q, player) || !passesMaxLevelOption(q, player, opts.minLevelGap)) continue;
      const pos = nearest(positionsFor(q, "accept", null));
      if (pos != null) push(q, "accept", null, pos, null);
    } else if (entry.complete) {
      const pos = nearest(positionsFor(q, "turnin", null));
      if (pos != null) push(q, "turnin", null, pos, null);
    } else {
      for (const obj of q.objectives) {
        if (entry.objectivesDone.has(obj.index)) continue;
        const clusters = clusterSpawns(positionsFor(q, "objective", obj.index), CLUSTER_RADIUS_YARDS);
        const cluster = pickCluster(clusters, timeTo);
        if (cluster != null) push(q, "objective", obj.index, cluster.center, cluster);
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

export function zoneProgress(
  quests: QuestInfo[],
  completed: Set<number>,
  zoneAreaId: number,
  player: Pick<PlayerQuestState, "raceMask" | "classMask">,
): ZoneProgress {
  let done = 0;
  let total = 0;
  for (const q of quests) {
    if (q.zoneAreaId !== zoneAreaId) continue;
    if (!maskAllows(q.races, player.raceMask) || !maskAllows(q.classes, player.classMask)) continue;
    total++;
    if (completed.has(q.id)) done++;
  }
  return { done, total };
}

import type { WorldPos } from "../core/geometry";
import type { QuestInfo } from "../data/questRepository";
import type { ObtainPlan, PlanFor } from "../game/professions";
import type { StepType } from "../route/format";
import {
  isAvailable,
  isTrivial,
  maskAllows,
  passesMaxLevelOption,
  type PlayerQuestState,
} from "../quests/availability";
import { nearbyClusters, pickCluster, type SpawnCluster } from "./spawns";

export type TargetKind = "accept" | "objective" | "turnin" | "route";
export type QuestTargetKind = Exclude<TargetKind, "route">;

// Set for targets built from a route step; label only matters for non-quest steps.
export interface RouteRef {
  index: number;
  type: StepType;
  label: string;
}

// A profession item to buy, craft or fish instead of farming mobs (design 2026-11-28-professions).
export interface TargetObtain {
  how: Exclude<ObtainPlan["how"], "gather">;
  item: string;
  count: number;
}

export interface Target {
  // Null only for non-quest route steps.
  questId: number | null;
  kind: TargetKind;
  objectiveIndex: number | null;
  // Null for an objective done anywhere (craft, fish): listed, never shown by the arrow.
  pos: WorldPos | null;
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
  obtain?: TargetObtain;
  // Item to loot that starts the quest (accept of an item-started route step).
  loot?: string;
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
  // Player position: objectives with very many spawns only cluster the nearest ones.
  origin?: WorldPos | null;
  uiMapOf?: (zoneAreaId: number) => number | null;
  penaltyOf?: (p: WorldPos) => number;
  planFor?: PlanFor;
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

export function clusterKey(questId: number, objectiveIndex: number, plan: ObtainPlan | null): string {
  return plan == null ? `${questId}:${objectiveIndex}` : `${questId}:${objectiveIndex}:${plan.key}`;
}

export function targetObtain(plan: ObtainPlan | null, required: number, count: { have: number; need: number } | null): TargetObtain | null {
  if (plan == null || plan.how === "gather") return null;
  return { how: plan.how, item: plan.item, count: count == null ? required : Math.max(count.need - count.have, 0) };
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
    pos: WorldPos | null,
    cluster: SpawnCluster | null,
    otherSpots: number,
    obtain: TargetObtain | null = null,
  ): void => {
    const target: Target = {
      questId: q.id,
      kind,
      objectiveIndex,
      pos,
      cluster,
      otherSpots,
      seconds: pos == null ? Infinity : timeTo(pos),
      penaltySec: pos == null ? 0 : (input.penaltyOf?.(pos) ?? 0),
      questLevel: q.level,
      trivial,
      elite: q.isElite,
      zoneAreaId: q.zoneAreaId,
      route: null,
    };
    if (obtain != null) target.obtain = obtain;
    targets.push(target);
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
        const plan = input.planFor?.(q, obj.index) ?? null;
        const clusters = nearbyClusters(input.clusters, clusterKey(q.id, obj.index, plan), input.origin ?? null, () => positionsFor(q, "objective", obj.index));
        const obtain = targetObtain(plan, obj.kind === "item" ? obj.required : 1, entry.counts?.[obj.index - 1] ?? null);
        const cluster = pickCluster(clusters, timeTo);
        if (cluster != null) push(q, trivial, "objective", obj.index, cluster.center, cluster, clusters.length - 1, obtain);
        else if (obtain != null && obtain.how !== "buy") push(q, trivial, "objective", obj.index, null, null, 0, obtain);
      }
    }
  }

  targets.sort((a, b) => {
    if ((a.pos == null) !== (b.pos == null)) return a.pos == null ? 1 : -1;
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

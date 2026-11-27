import { distance, type WorldPos } from "../core/geometry";
import type { QuestInfo } from "../data/questRepository";
import { isAvailable, maskAllows, type PlayerQuestState } from "../quests/availability";
import type { EmittedStep } from "./format";

export interface QuestLogEntry { complete: boolean; objectivesDone: Set<number> }

export interface ProgressContext {
  completed: Set<number>;
  log: Map<number, QuestLogEntry>;
  level: number;
  xpIntoLevel: number;
  knownTaxi: Set<number>;
  pos: WorldPos | null;
  bindPos: WorldPos | null;
  hearthBoundWhileCurrent: boolean;
  toWorld(uiMapId: number, x: number, y: number): WorldPos | null;
  taxiPos(nodeId: number): WorldPos | null;
}

export type StepStatus = "done" | "todo" | "impossible";
export interface RouteCursor { current: number; removed: Set<number> }
export type QuestLookup = (id: number) => QuestInfo | null;
type Dropped = (id: number) => boolean;

const NEAR_YARDS = 150;
const NONE = new Set<number>();

function near(a: WorldPos | null, b: WorldPos | null): boolean {
  return a != null && b != null && distance(a, b) <= NEAR_YARDS;
}

function isQuestStep(s: EmittedStep): boolean {
  return s.type === "accept" || s.type === "complete" || s.type === "turnin";
}

function objectivesDone(ctx: ProgressContext, id: number): boolean {
  const entry = ctx.log.get(id);
  return ctx.completed.has(id) || (entry != null && entry.complete);
}

function dungeonDone(steps: EmittedStep[], i: number, ctx: ProgressContext, dropped: Dropped): boolean {
  const before = new Set<number>();
  for (let j = 0; j < i; j++) {
    const id = steps[j].questId;
    if (steps[j].type === "accept" && id != null) before.add(id);
  }
  for (let j = i + 1; j < steps.length; j++) {
    const id = steps[j].questId;
    if (steps[j].type === "turnin" && id != null && before.has(id) && !dropped(id) && !objectivesDone(ctx, id)) return false;
  }
  return true;
}

function ownDone(steps: EmittedStep[], i: number, ctx: ProgressContext, dropped: Dropped): boolean {
  const s = steps[i];
  const id = s.questId;
  switch (s.type) {
    case "accept":
      return id != null && (ctx.completed.has(id) || ctx.log.has(id));
    case "complete": {
      if (id == null) return false;
      const entry = ctx.log.get(id);
      return ctx.completed.has(id) || (entry != null && (entry.complete || (s.objectiveIndex != null && entry.objectivesDone.has(s.objectiveIndex))));
    }
    case "turnin":
      return id != null && ctx.completed.has(id);
    case "getFlightPath":
      return s.taxiNodeId != null && ctx.knownTaxi.has(s.taxiNodeId);
    case "grind":
      return ctx.level > s.targetLevel || (ctx.level === s.targetLevel && ctx.xpIntoLevel >= s.targetXpIntoLevel);
    case "dungeon":
      return dungeonDone(steps, i, ctx, dropped);
    case "fly":
      return s.taxiNodeId != null && near(ctx.pos, ctx.taxiPos(s.taxiNodeId));
    case "hearth":
      return near(ctx.pos, ctx.bindPos);
    case "setHearth":
      return ctx.hearthBoundWhileCurrent || near(ctx.bindPos, ctx.toWorld(s.uiMapId, s.x, s.y));
  }
}

function statusAt(steps: EmittedStep[], i: number, ctx: ProgressContext, dropped: Dropped, laterTurninDone: boolean): StepStatus {
  const s = steps[i];
  if (ownDone(steps, i, ctx, dropped)) return "done";
  if (isQuestStep(s)) return s.questId == null || dropped(s.questId) ? "impossible" : "todo";
  return laterTurninDone ? "done" : "todo";
}

// Only reasons that never go away (the level never decreases); anything else isAvailable rejects is "not yet".
function impossibleForGood(id: number, quest: QuestLookup, p: PlayerQuestState, dropped: Dropped): boolean {
  const q = quest(id);
  if (q == null) return true;
  if (p.completed.has(id) || p.inLog.has(id) || isAvailable(q, p)) return false;
  const taken = (other: number): boolean => p.completed.has(other) || p.inLog.has(other);
  const lost = (pre: number): boolean => !p.completed.has(pre) && dropped(pre);
  return (q.requiredMaxLevel != null && p.level > q.requiredMaxLevel) || !maskAllows(q.races, p.raceMask) || !maskAllows(q.classes, p.classMask) || q.exclusiveTo.some((other) => taken(other))
    || q.preGroup.some((pre) => lost(pre)) || (q.preSingle.length > 0 && q.preSingle.every((pre) => lost(pre)));
}

function droppedQuests(quest: QuestLookup, p: PlayerQuestState, removedQuests: Set<number>): Dropped {
  const memo = new Map<number, boolean>();
  const dropped = (id: number): boolean => {
    if (removedQuests.has(id)) return true;
    const known = memo.get(id);
    if (known != null) return known;
    memo.set(id, false);
    const result = impossibleForGood(id, quest, p, dropped);
    memo.set(id, result);
    return result;
  };
  return dropped;
}

export function stepStatus(steps: EmittedStep[], i: number, ctx: ProgressContext, quest: QuestLookup, player: PlayerQuestState): StepStatus {
  let laterTurninDone = false;
  for (let j = i + 1; j < steps.length && !laterTurninDone; j++) {
    const id = steps[j].questId;
    laterTurninDone = steps[j].type === "turnin" && id != null && ctx.completed.has(id);
  }
  return statusAt(steps, i, ctx, droppedQuests(quest, player, NONE), laterTurninDone);
}

export function advance(steps: EmittedStep[], startIndex: number, skipped: Set<number>, removedQuests: Set<number>, ctx: ProgressContext, quest: QuestLookup, player: PlayerQuestState): RouteCursor {
  const dropped = droppedQuests(quest, player, removedQuests);
  const unlocksOf = new Map<number, number[]>();
  const lost = new Set<number>();
  const queue: number[] = [];
  const lose = (id: number): void => {
    if (lost.has(id)) return;
    lost.add(id);
    queue.push(id);
  };
  for (const s of steps) {
    if (s.questId == null) continue;
    if (s.unlocks != null) {
      const list = unlocksOf.get(s.questId) ?? [];
      for (const next of s.unlocks) list.push(next);
      unlocksOf.set(s.questId, list);
    }
    if (dropped(s.questId)) lose(s.questId);
  }
  for (let k = 0; k < queue.length; k++) for (const next of unlocksOf.get(queue[k]) ?? []) lose(next);

  const removed = new Set<number>();
  let lastDoneTurnin = -1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (isQuestStep(s) && (s.questId == null || lost.has(s.questId))) removed.add(i);
    if (s.type === "turnin" && s.questId != null && ctx.completed.has(s.questId)) lastDoneTurnin = i;
  }

  const isLost = (id: number): boolean => lost.has(id);
  for (let i = Math.max(0, startIndex); i < steps.length; i++) {
    if (skipped.has(i) || removed.has(i)) continue;
    if (statusAt(steps, i, ctx, isLost, i < lastDoneTurnin) === "todo") return { current: i, removed };
  }
  return { current: steps.length, removed };
}

export function resyncIndex(steps: EmittedStep[], level: number, from: number): number {
  for (let i = Math.max(0, from); i < steps.length; i++) if (steps[i].targetLevel >= level - 1) return i;
  return Math.max(0, steps.length - 1);
}

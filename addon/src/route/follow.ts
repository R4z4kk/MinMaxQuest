import { distance, type WorldPos } from "../core/geometry";
import type { PlayerQuestState } from "../quests/availability";
import type { EmittedStep } from "./format";
import { stepStatus, type ProgressContext, type QuestLookup, type RouteCursor } from "./progress";

export const OFF_ROUTE_WINDOW = 15;
export const OFF_ROUTE_MIN_SECONDS = 120;
export const OFF_ROUTE_GAIN_SECONDS = 60;
export const ON_THE_WAY_SECONDS = 10;
export const LEVEL_BANNER_GAP = 3;
const NEXT_COUNT = 3;
const QUEST_STEPS: Partial<Record<EmittedStep["type"], boolean>> = { accept: true, complete: true, turnin: true };

export interface FollowView {
  target: number | null;
  current: number | null;
  next: number[];
  levelGap: number | null;
  remainingSeconds: number;
  finished: boolean;
}

export function follow(
  steps: EmittedStep[], cursor: RouteCursor, ctx: ProgressContext, timeTo: (p: WorldPos) => number,
  between: (a: WorldPos, b: WorldPos) => number, realizable: (i: number) => boolean, maxLevel: number,
  quest: QuestLookup, player: PlayerQuestState, startIndex: number, skipped: Set<number>,
): FollowView {
  const current = cursor.current;
  if (current >= steps.length || ctx.level >= maxLevel) {
    return { target: null, current: null, next: [], levelGap: null, remainingSeconds: 0, finished: true };
  }

  const hidden = (i: number): boolean => cursor.removed.has(i) || skipped.has(i);
  const todo = (i: number): boolean => stepStatus(steps, i, ctx, quest, player, startIndex) === "todo";
  const placeOf = (i: number): WorldPos | null => {
    const s = steps[i];
    let best = ctx.toWorld(s.uiMapId, s.x, s.y);
    const from = ctx.pos;
    if (s.type !== "complete" || s.loop == null || from == null) return best;
    let bestYards = best == null ? Infinity : distance(from, best);
    for (const [x, y] of s.loop) {
      const p = ctx.toWorld(s.uiMapId, x, y);
      const yards = p == null ? Infinity : distance(from, p);
      if (yards < bestYards) {
        best = p;
        bestYards = yards;
      }
    }
    return best;
  };
  const timeOf = (i: number): number | null => {
    const pos = placeOf(i);
    return pos == null ? null : timeTo(pos);
  };

  // Design 3.5/3.6: a step not doable yet stays current while the arrow aims at the nearest doable one.
  let target = current;
  const currentTime = timeOf(current);
  const blocked = !realizable(current);
  if (blocked || (currentTime != null && currentTime > OFF_ROUTE_MIN_SECONDS)) {
    let best = blocked || currentTime == null ? Infinity : currentTime - OFF_ROUTE_GAIN_SECONDS;
    let found = false;
    for (let i = current + 1; i < steps.length && i <= current + OFF_ROUTE_WINDOW; i++) {
      if (hidden(i) || !realizable(i)) continue;
      const t = timeOf(i);
      if (t == null || Number.isNaN(t) || t > best || (found && t === best) || !todo(i)) continue;
      best = t;
      target = i;
      found = true;
    }
  } else if (currentTime != null) {
    // A later quest step on the way costs nothing now and saves coming back.
    const currentPos = placeOf(current);
    let best = currentTime;
    for (let i = current + 1; currentPos != null && i < steps.length && i <= current + OFF_ROUTE_WINDOW; i++) {
      if (!QUEST_STEPS[steps[i].type] || hidden(i) || !realizable(i)) continue;
      const pos = placeOf(i);
      const t = pos == null ? NaN : timeTo(pos);
      if (!(t < best) || pos == null || !(t + between(pos, currentPos) <= currentTime + ON_THE_WAY_SECONDS) || !todo(i)) continue;
      best = t;
      target = i;
    }
  }

  const scanEnd = current + OFF_ROUTE_WINDOW + NEXT_COUNT;
  const next: number[] = [];
  let remainingSeconds = steps[current].estCostSeconds;
  for (let i = current + 1; i < steps.length; i++) {
    if (hidden(i)) continue;
    if (i <= scanEnd && !todo(i)) continue;
    remainingSeconds += steps[i].estCostSeconds;
    if (next.length < NEXT_COUNT) next.push(i);
  }

  const gap = ctx.level - steps[current].targetLevel;
  return { target, current, next, levelGap: Math.abs(gap) > LEVEL_BANNER_GAP ? gap : null, remainingSeconds, finished: false };
}

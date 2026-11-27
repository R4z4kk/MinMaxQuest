import { distance, type WorldPos } from "../core/geometry";
import type { QuestInfo } from "../data/questRepository";
import type { EmittedStep } from "./format";

export interface InsertBlock {
  steps: EmittedStep[];
  minLevel: number;
}

export interface ChainBlockResult {
  block: InsertBlock;
  unplaceable: number;
}

export type PlaceKind = "accept" | "objective" | "turnin";
export type PlaceFor = (
  q: QuestInfo, kind: PlaceKind, objectiveIndex: number | null,
) => { uiMapId: number; x: number; y: number } | null;

type ToWorld = (uiMapId: number, x: number, y: number) => WorldPos | null;

function questSteps(q: QuestInfo, place: PlaceFor): EmittedStep[] | null {
  const steps: EmittedStep[] = [];
  const add = (type: "accept" | "complete" | "turnin", kind: PlaceKind, index: number | null): boolean => {
    const p = place(q, kind, index);
    if (p == null) return false;
    const step: EmittedStep = {
      type, uiMapId: p.uiMapId, x: p.x, y: p.y, questId: q.id,
      targetLevel: 0, targetXpIntoLevel: 0, estCostSeconds: 0, estXpGain: 0,
    };
    if (index != null) step.objectiveIndex = index;
    steps.push(step);
    return true;
  };
  if (!add("accept", "accept", null)) return null;
  for (const objective of q.objectives) {
    if (!add("complete", "objective", objective.index)) return null;
  }
  if (!add("turnin", "turnin", null)) return null;
  return steps;
}

export function chainBlock(
  questIds: number[], quest: (id: number) => QuestInfo | null, place: PlaceFor, present: Set<number> = new Set(),
): ChainBlockResult {
  const steps: EmittedStep[] = [];
  let minLevel = 0;
  let unplaceable = 0;
  for (const id of questIds) {
    if (present.has(id)) continue;
    const q = quest(id);
    const own = q == null ? null : questSteps(q, place);
    if (q == null || own == null) {
      unplaceable++;
      continue;
    }
    if (steps.length === 0) minLevel = q.requiredLevel;
    for (const step of own) steps.push(step);
  }
  return { block: { steps, minLevel }, unplaceable };
}

function worldOf(step: EmittedStep, toWorld: ToWorld): WorldPos | null {
  return toWorld(step.uiMapId, step.x, step.y);
}

function bestPosition(route: EmittedStep[], from: number, block: InsertBlock, toWorld: ToWorld): number | null {
  const first = worldOf(block.steps[0], toWorld);
  const last = worldOf(block.steps[block.steps.length - 1], toWorld);
  if (first == null || last == null) return null;
  let best: number | null = null;
  let bestCost = Infinity;
  for (let p = Math.max(from + 1, 1); p <= route.length; p++) {
    const prev = route[p - 1];
    if (prev.targetLevel < block.minLevel) continue;
    const prevPos = worldOf(prev, toWorld);
    if (prevPos == null) continue;
    let cost = distance(prevPos, first);
    if (p < route.length) {
      const nextPos = worldOf(route[p], toWorld);
      if (nextPos == null) continue;
      const direct = distance(prevPos, nextPos);
      cost += distance(last, nextPos) - (direct === Infinity ? 0 : direct);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }
  return best;
}

export function insertBlocks(route: EmittedStep[], from: number, blocks: InsertBlock[], toWorld: ToWorld): EmittedStep[] {
  let out = route.slice();
  for (const block of blocks) {
    if (block.steps.length === 0) continue;
    const found = bestPosition(out, from, block, toWorld);
    const at = found ?? out.length;
    const neighbour = at > 0 ? out[at - 1] : null;
    const steps = block.steps.map((s): EmittedStep => ({
      ...s,
      targetLevel: neighbour == null ? block.minLevel : neighbour.targetLevel,
      targetXpIntoLevel: neighbour == null ? 0 : neighbour.targetXpIntoLevel,
      estCostSeconds: 0,
      estXpGain: 0,
    }));
    const next: EmittedStep[] = [];
    for (let i = 0; i < at; i++) next.push(out[i]);
    for (const s of steps) next.push(s);
    for (let i = at; i < out.length; i++) next.push(out[i]);
    out = next;
  }
  return out;
}

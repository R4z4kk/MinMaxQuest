import type { WorldPos } from "../core/geometry";
import type { ArrowTarget } from "./arrowFrame";

export interface CorpseDeps {
  isDead(): boolean;
  isGhost(): boolean;
  corpseOnMap(uiMapId: number): { x: number; y: number } | null;
  playerMap(): number | null;
  parentMap(uiMapId: number): number | null;
  toWorld(uiMapId: number, x: number, y: number): WorldPos | null;
}

export type CorpseTarget = { kind: "none" } | { kind: "atBody" } | { kind: "unknown" } | { kind: "corpse"; target: ArrowTarget };

const PERCENT = 100;
const NONE: CorpseTarget = { kind: "none" };
const AT_BODY: CorpseTarget = { kind: "atBody" };
const UNKNOWN: CorpseTarget = { kind: "unknown" };

let cached: CorpseTarget & { kind: "corpse" } | null = null;

function reuse(pos: WorldPos, label: string): CorpseTarget & { kind: "corpse" } {
  const old = cached?.target;
  if (cached != null && old != null && old.label === label && old.pos.continent === pos.continent && old.pos.x === pos.x && old.pos.y === pos.y) {
    return cached;
  }
  cached = { kind: "corpse", target: { pos, label } };
  return cached;
}

export function corpseTarget(deps: CorpseDeps, label: string): CorpseTarget {
  if (!deps.isDead()) return NONE;
  if (!deps.isGhost()) return AT_BODY;
  const here = deps.playerMap();
  if (here == null) return UNKNOWN;
  const parent = deps.parentMap(here);
  const maps = parent == null ? [here] : [here, parent];
  for (const uiMapId of maps) {
    const spot = deps.corpseOnMap(uiMapId);
    if (spot == null) continue;
    const pos = deps.toWorld(uiMapId, spot.x * PERCENT, spot.y * PERCENT);
    if (pos != null) return reuse(pos, label);
  }
  return UNKNOWN;
}

import { distance, type WorldPos } from "../core/geometry";
import { guard } from "../core/report";
import type { Target } from "../targets/completion";
import type { TravelHop } from "../travel/graph";
import type { Routing } from "./routing";
import type { MapPoint } from "./positions";

// Shortest Path Forever public API (docs/api.md): uiMapID + 0-1 coordinates, seconds or nil + reason.
export interface SpfApi {
  version: number;
  Estimate: (this: void, fromMap: number, fromX: number, fromY: number, toMap: number, toX: number, toY: number) => LuaMultiReturn<[number | null, string | null]>;
}

export type SpfVerdict = { kind: "none" } | { kind: "unreachable" } | { kind: "seconds"; seconds: number };

export interface SpfDeps {
  api(): SpfApi | null;
  toMap(pos: WorldPos): MapPoint | null;
  report(reason: string): void;
}

export interface Spf {
  estimate(from: WorldPos, to: WorldPos): SpfVerdict;
}

export const SPF_SLOW_FACTOR = 1.25;
export const SPF_MOVE_YARDS = 30;
const SPF_FEATURE = "spf";
const NONE: SpfVerdict = { kind: "none" };
const UNREACHABLE: SpfVerdict = { kind: "unreachable" };

// A walk that SPF finds clearly longer than ours (or impossible) gives way to the best other first hop.
export function chooseHop(ours: TravelHop | null, detour: TravelHop | null, ourSeconds: number, verdict: SpfVerdict): TravelHop | null {
  if (ours == null || ours.kind !== "walk" || detour == null) return ours;
  if (verdict.kind === "unreachable") return detour;
  if (verdict.kind === "seconds" && verdict.seconds > ourSeconds * SPF_SLOW_FACTOR) return detour;
  return ours;
}

export function readSpfApi(): SpfApi | null {
  const root = _G.ShortestPathForever;
  if (typeof root !== "object" || root == null) return null;
  return (root as { API: SpfApi | null }).API;
}

export function createSpf(deps: SpfDeps): Spf {
  let cached: { key: string; from: WorldPos; verdict: SpfVerdict } | null = null;
  return {
    estimate(from, to) {
      const api = deps.api();
      if (api == null || (api.version !== 1 && api.version !== 2) || typeof api.Estimate !== "function") return NONE;
      const key = `${to.continent}:${to.x}:${to.y}`;
      if (cached != null && cached.key === key && distance(from, cached.from) < SPF_MOVE_YARDS) return cached.verdict;
      const origin = deps.toMap(from);
      const goal = deps.toMap(to);
      if (origin == null || goal == null) return NONE;
      const [seconds, reason] = api.Estimate(origin.uiMapId, origin.x, origin.y, goal.uiMapId, goal.x, goal.y);
      if (reason === "combat" || reason === "loading") return NONE;
      let verdict: SpfVerdict = NONE;
      if (typeof seconds === "number" && seconds >= 0 && seconds < Infinity) verdict = { kind: "seconds", seconds };
      else if (reason === "unreachable") verdict = UNREACHABLE;
      else deps.report(String(reason));
      cached = { key, from, verdict };
      return verdict;
    },
  };
}

// Asks SPF only when our first hop is a walk and another way exists; a failing SPF disables only itself.
export function createHopChooser(spf: Spf, routing: Pick<Routing, "firstHop" | "detour">): (target: Target) => TravelHop | null {
  return (target) => {
    const ours = routing.firstHop(target);
    if (ours == null || ours.kind !== "walk" || target.pos == null) return ours;
    const alternative = routing.detour(target);
    if (alternative == null || alternative.hop == null) return ours;
    const goal = target.pos;
    const verdict = guard(SPF_FEATURE, () => spf.estimate(alternative.from, goal)) ?? NONE;
    return chooseHop(ours, alternative.hop, alternative.seconds, verdict);
  };
}

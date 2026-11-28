import { CONSTANTS } from "../core/constants";
import type { WorldPos } from "../core/geometry";
import type { CharDb } from "../core/storage";
import { TRAVEL, type TravelData } from "../data/generated/travel";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import { selectTargets, type CompletionInput, type Target } from "../targets/completion";
import type { SpawnCluster } from "../targets/spawns";
import {
  buildGraph,
  firstHop,
  hearthPenaltyOf,
  solveFrom,
  taxiDestination,
  travelTime,
  type TaxiLeg,
  type TravelContext,
  type TravelGraph,
  type TravelHop,
  type TravelPlan,
} from "../travel/graph";
import type { PlayerSnapshot } from "./engine";
import type { PlanFor } from "./professions";

export interface NearbyScope {
  maps(): Set<number>;
  zoneOf(uiMapId: number): number | null;
}

export interface Routing {
  completion(snap: PlayerSnapshot): Target[];
  // Solves the travel graph from the snapshot (shared with completion and firstHop); null without a position.
  timeTo(snap: PlayerSnapshot): ((p: WorldPos) => number) | null;
  firstHop(target: Target): TravelHop | null;
  taxiLeg(target: Target): TaxiLeg | null;
  taxiLegTo(pos: WorldPos): TaxiLeg | null;
  quests(): QuestInfo[];
}

export function travelSpeed(level: number): number {
  if (level >= CONSTANTS.epicMountLevel.value) return CONSTANTS.epicMountSpeed.value;
  if (level >= CONSTANTS.mountLevel.value) return CONSTANTS.mountSpeed.value;
  return CONSTANTS.runSpeed.value;
}

export function graphKey(ctx: TravelContext, knownTaxiNodes: number[]): string {
  const hearth = ctx.hearth.pos;
  const hearthKey = hearth == null ? "none" : `${hearth.continent}:${hearth.x}:${hearth.y}`;
  return `${ctx.faction}|${hearthKey}|${knownTaxiNodes.join(",")}`;
}

export function createRouting(
  repo: QuestRepository,
  db: CharDb,
  positionsFor: CompletionInput["positionsFor"],
  data: TravelData = TRAVEL,
  nearby: NearbyScope | null = null,
  planFor: PlanFor | null = null,
): Routing {
  let quests: QuestInfo[] | null = null;
  let graph: TravelGraph | null = null;
  let builtFor = "";
  let solved: { plan: TravelPlan; graph: TravelGraph; ctx: TravelContext; snap: PlayerSnapshot } | null = null;
  const clusters = new Map<string, SpawnCluster[]>();

  const allQuests = (): QuestInfo[] => {
    if (quests == null) {
      const loaded: QuestInfo[] = [];
      for (const id of repo.allIds()) {
        const quest = repo.get(id);
        if (quest != null) loaded.push(quest);
      }
      quests = loaded;
    }
    return quests;
  };

  // One solve per snapshot, whichever source asks first.
  const solve = (snap: PlayerSnapshot): { plan: TravelPlan; graph: TravelGraph; ctx: TravelContext; snap: PlayerSnapshot } | null => {
    if (snap.pos == null) return null;
    if (solved != null && solved.snap === snap) return solved;
    const ctx: TravelContext = {
      speed: travelSpeed(snap.state.level),
      knownTaxiNodes: new Set(db.knownTaxiNodes),
      faction: snap.faction,
      hearth: snap.hearth,
      hearthPenaltySec: (db.activeMode === "completion" ? CONSTANTS.completionHearthPenaltySec : CONSTANTS.hearthPenaltySec).value,
    };
    const key = graphKey(ctx, db.knownTaxiNodes);
    if (graph == null || key !== builtFor) {
      graph = buildGraph(data, ctx);
      builtFor = key;
    }
    solved = { plan: solveFrom(graph, snap.pos, ctx), graph, ctx, snap };
    return solved;
  };

  const taxiLegTo = (pos: WorldPos): TaxiLeg | null => {
    if (solved == null) return null;
    const { plan, graph: solvedGraph, ctx } = solved;
    const hop = firstHop(plan, solvedGraph, pos, ctx);
    if (hop == null || hop.kind !== "taxi" || hop.taxiNodeId == null) return null;
    const to = taxiDestination(plan, solvedGraph, pos, ctx);
    return to == null ? null : { from: hop.taxiNodeId, to };
  };

  return {
    quests: () => allQuests(),
    timeTo(snap) {
      const current = solve(snap);
      return current == null ? null : (p) => travelTime(current.plan, current.graph, p, current.ctx);
    },
    completion(snap) {
      const current = solve(snap);
      if (current == null) return [];
      const { mode, zoneAreaId, showTrivial, showElite } = db.completion;
      return selectTargets(
        {
          quests: allQuests(),
          log: snap.log,
          player: snap.state,
          greenRange: snap.greenRange,
          positionsFor,
          timeTo: (p) => travelTime(current.plan, current.graph, p, current.ctx),
          clusters,
          uiMapOf: (areaId) => {
            const uiMapId = repo.uiMapIdForArea(areaId);
            return uiMapId == null || nearby == null ? uiMapId : nearby.zoneOf(uiMapId);
          },
          penaltyOf: (p) => hearthPenaltyOf(current.plan, current.graph, p, current.ctx),
          ...(planFor != null ? { planFor } : {}),
        },
        {
          mode, zoneAreaId, showTrivial, showElite, minLevelGap: db.minLevelGap, pinnedQuestId: db.pinnedQuestId, maxLevel: snap.maxLevel,
          ...(mode === "proximity" && nearby != null ? { nearbyMaps: nearby.maps() } : {}),
        },
      );
    },
    firstHop(target) {
      if (solved == null || target.pos == null) return null;
      return firstHop(solved.plan, solved.graph, target.pos, solved.ctx);
    },
    taxiLeg(target) {
      return target.pos == null ? null : taxiLegTo(target.pos);
    },
    taxiLegTo: (pos) => taxiLegTo(pos),
  };
}

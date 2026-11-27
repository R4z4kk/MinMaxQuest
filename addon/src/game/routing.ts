import { CONSTANTS } from "../core/constants";
import type { CharDb } from "../core/storage";
import { TRAVEL, type TravelData } from "../data/generated/travel";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import { selectTargets, type CompletionInput, type Target } from "../targets/completion";
import {
  buildGraph,
  firstHop,
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

export interface Routing {
  completion(snap: PlayerSnapshot): Target[];
  firstHop(target: Target): TravelHop | null;
  taxiLeg(target: Target): TaxiLeg | null;
  quests(): QuestInfo[];
}

export function travelSpeed(level: number): number {
  if (level >= CONSTANTS.epicMountLevel.value) return CONSTANTS.epicMountSpeed.value;
  if (level >= CONSTANTS.mountLevel.value) return CONSTANTS.mountSpeed.value;
  return CONSTANTS.runSpeed.value;
}

function graphKey(ctx: TravelContext, knownTaxiNodes: number[]): string {
  const hearth = ctx.hearth.pos;
  const hearthKey = hearth == null ? "none" : `${hearth.continent}:${hearth.x}:${hearth.y}`;
  return `${ctx.faction}|${hearthKey}|${knownTaxiNodes.join(",")}`;
}

export function createRouting(
  repo: QuestRepository,
  db: CharDb,
  positionsFor: CompletionInput["positionsFor"],
  data: TravelData = TRAVEL,
): Routing {
  let quests: QuestInfo[] | null = null;
  let graph: TravelGraph | null = null;
  let builtFor = "";
  let solved: { plan: TravelPlan; graph: TravelGraph; ctx: TravelContext } | null = null;

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

  return {
    quests: () => allQuests(),
    completion(snap) {
      if (snap.pos == null) return [];
      const ctx: TravelContext = {
        speed: travelSpeed(snap.state.level),
        knownTaxiNodes: new Set(db.knownTaxiNodes),
        faction: snap.faction,
        hearth: snap.hearth,
      };
      const key = graphKey(ctx, db.knownTaxiNodes);
      if (graph == null || key !== builtFor) {
        graph = buildGraph(data, ctx);
        builtFor = key;
      }
      const current = { plan: solveFrom(graph, snap.pos, ctx), graph, ctx };
      solved = current;
      const { mode, zoneAreaId, showTrivial, showElite } = db.completion;
      return selectTargets(
        {
          quests: allQuests(),
          log: snap.log,
          player: snap.state,
          greenRange: snap.greenRange,
          positionsFor,
          timeTo: (p) => travelTime(current.plan, current.graph, p, current.ctx),
        },
        { mode, zoneAreaId, showTrivial, showElite, minLevelGap: db.minLevelGap },
      );
    },
    firstHop(target) {
      if (solved == null) return null;
      return firstHop(solved.plan, solved.graph, target.pos, solved.ctx);
    },
    taxiLeg(target) {
      if (solved == null) return null;
      const { plan, graph: solvedGraph, ctx } = solved;
      const hop = firstHop(plan, solvedGraph, target.pos, ctx);
      if (hop == null || hop.kind !== "taxi" || hop.taxiNodeId == null) return null;
      const to = taxiDestination(plan, solvedGraph, target.pos, ctx);
      return to == null ? null : { from: hop.taxiNodeId, to };
    },
  };
}

import { ACCESS_CHAINS, resolveSteps } from "../access/chains";
import { distance, type WorldPos } from "../core/geometry";
import { currentLocale, t } from "../core/l10n";
import { reportOnce } from "../core/report";
import type { CharDb } from "../core/storage";
import type { QuestInfo } from "../data/questRepository";
import { questLabel, type PlayerSnapshot } from "../game/engine";
import { isFriendlyTo } from "../game/positions";
import { isAvailable } from "../quests/availability";
import type { Target, TargetKind } from "../targets/completion";
import type { SpawnCluster } from "../targets/spawns";
import type { TaxiLeg } from "../travel/graph";
import { follow, type FollowView } from "./follow";
import type { EmittedStep } from "./format";
import { chainBlock, insertBlocks, type InsertBlock, type PlaceFor } from "./insert";
import { advance, resyncIndex, type ProgressContext, type RouteCursor } from "./progress";
import { composeRoute, decodeReturnBlock, readRoutes, routesInstalled, variantKey, type FactionRoutes, type RouteOptions } from "./routeData";

export const QUEST_LOG_SIZE = 20;

export interface FollowerDeps {
  db: CharDb;
  faction(): "A" | "H" | null;
  quest(id: number): QuestInfo | null;
  toWorld(uiMapId: number, x: number, y: number): WorldPos | null;
  place: PlaceFor;
  // Null when the player position is unknown.
  timeTo(snap: PlayerSnapshot): ((p: WorldPos) => number) | null;
  inCombat(): boolean;
  taxiNodes: { id: number; name: string; pos: WorldPos; faction: "A" | "H" | "AH" }[];
}

export interface RouteView extends FollowView {
  total: number;
  startIndex: number;
  currentText: string | null;
  targetText: string | null;
  nextTexts: string[];
}

export interface RouteFollower {
  // Null while the routes are unavailable (missing, invalid or undecodable): the engine uses completion.
  targets(snap: PlayerSnapshot): Target[] | null;
  view(): RouteView | null;
  resync(): void;
  hearthBound(): void;
  taxiLeg(target: Target): TaxiLeg | null;
  unavailable(): string | null;
  routesBuild(): string | null;
}

const QUEST_KIND: Partial<Record<EmittedStep["type"], TargetKind>> = { accept: "accept", complete: "objective", turnin: "turnin" };
// Done only while the player stands near them, so once passed they are kept as skipped.
const TRAVEL_STEPS: Partial<Record<EmittedStep["type"], boolean>> = { fly: true, hearth: true, setHearth: true, getFlightPath: true };

export function createRouteFollower(deps: FollowerDeps): RouteFollower {
  const { db } = deps;
  const quest = (id: number): QuestInfo | null => deps.quest(id);
  const toWorld = (uiMapId: number, x: number, y: number): WorldPos | null => deps.toWorld(uiMapId, x, y);
  let routes: FactionRoutes | null = null;
  let segmentEndLevel = 0;
  let unavailable: string | null = null;
  let builtKey = "";
  let failedKey = "";
  let steps: EmittedStep[] = [];
  let baseIndex = new Map<EmittedStep, number>();
  let hearthSteps: number[] = [];
  let cursor: RouteCursor | null = null;
  let followed: FollowView | null = null;
  let lastSnap: PlayerSnapshot | null = null;
  let hearthBoundWhileCurrent = false;
  let lastCurrent = -1;
  let taxiById: Map<number, { name: string; pos: WorldPos }> | null = null;

  const load = (): FactionRoutes | null => {
    if (routes != null || unavailable != null) return routes;
    const faction = deps.faction();
    if (faction == null) return null;
    const result = readRoutes(faction);
    if (!result.ok) {
      unavailable = result.message;
      return null;
    }
    const end = result.routes.meta.constants.segmentEndLevel;
    if (end == null) {
      unavailable = "meta.constants.segmentEndLevel missing";
      return null;
    }
    routes = result.routes;
    segmentEndLevel = end;
    return routes;
  };

  const options = (): RouteOptions => ({ elites: db.routeElites, dungeons: db.routeDungeons, minLevelGap: db.minLevelGap });

  const wantedKey = (): string =>
    `${variantKey(options())}|${db.trackedChains.join(",")}|${db.dungeonReturns.join(",")}|${db.route.startIndex}`;

  const taxiNode = (id: number): { name: string; pos: WorldPos } | null => {
    if (taxiById == null) {
      taxiById = new Map();
      for (const node of deps.taxiNodes) taxiById.set(node.id, node);
    }
    return taxiById.get(id) ?? null;
  };

  const taxiName = (id: number | null): string => {
    if (id == null) return "?";
    return db.taxiNames[id] ?? taxiNode(id)?.name ?? `#${id}`;
  };

  const stepText = (s: EmittedStep): string => {
    switch (s.type) {
      case "accept":
      case "complete":
      case "turnin": {
        const id = s.questId ?? 0;
        const action = s.type === "accept" ? t("targetAccept") : s.type === "turnin" ? t("targetTurnin") : `${t("targetObjective")} ${s.objectiveIndex ?? ""}`;
        return `${questLabel(id, deps.quest(id))} · ${action}`;
      }
      case "fly":
        return t("routeFly").replace("{name}", taxiName(s.taxiNodeId ?? null));
      case "hearth":
        return t("routeHearth");
      case "setHearth":
        return t("routeSetHearth");
      case "getFlightPath":
        return t("routeFlightPath");
      case "grind":
        return t("routeGrind").replace("{n}", String(s.targetLevel));
      case "dungeon":
        return t("routeDungeon");
    }
  };

  const chainBlocks = (r: FactionRoutes, base: EmittedStep[]): InsertBlock[] => {
    const present = new Set<number>();
    for (const s of base) if (s.questId != null) present.add(s.questId);
    const blocks: InsertBlock[] = [];
    const faction = r.faction;
    for (const id of db.trackedChains) {
      const def = ACCESS_CHAINS.find((chain) => chain.id === id);
      if (def == null) {
        reportOnce(`routeChain:${id}`, t("routeChainUnknown").replace("{id}", id));
        continue;
      }
      const { block, unplaceable } = chainBlock(resolveSteps(def, faction, quest), quest, deps.place, present);
      if (unplaceable > 0) {
        reportOnce(`routeChain:${id}`, t("routeChainUnplaceable").replace("{name}", def.name[currentLocale()]).replace("{n}", String(unplaceable)));
      }
      blocks.push(block);
    }
    for (const areaId of db.dungeonReturns) {
      let block: EmittedStep[];
      try {
        block = decodeReturnBlock(r, areaId);
      } catch (error) {
        reportOnce(`routeReturn:${areaId}`, `${t("routesMissing")} (${String(error)})`);
        continue;
      }
      let minLevel = 0;
      for (const s of block) {
        const q = s.questId == null ? null : deps.quest(s.questId);
        if (q != null && q.requiredLevel > minLevel) minLevel = q.requiredLevel;
      }
      blocks.push({ steps: block, minLevel });
    }
    return blocks;
  };

  // A list index as a base-route index: inserted steps map to the next base step.
  const toBaseIndex = (i: number, baseLength: number): number => {
    for (let j = Math.max(0, i); j < steps.length; j++) {
      const index = baseIndex.get(steps[j]);
      if (index != null) return index;
    }
    return Math.max(0, baseLength - 1);
  };

  const rebuild = (r: FactionRoutes, snap: PlayerSnapshot, key: string): boolean => {
    const variant = `${variantKey(options())}:`;
    const stored = db.route.variant;
    // Once a start segment was chosen it stays, whatever the level now.
    const keepSegment = stored != null && stored.startsWith(variant) && !stored.startsWith(`${variant}:`);
    let base: EmittedStep[];
    let stamp: string;
    try {
      const composed = composeRoute(r, options(), snap.state.raceMask, keepSegment ? 0 : snap.state.level, segmentEndLevel);
      base = composed.steps;
      stamp = `${composed.key}@${r.meta.generatedOn}`;
    } catch (error) {
      failedKey = key;
      reportOnce("routeDecode", `${t("routesMissing")} (${String(error)})`);
      return false;
    }
    const previous = steps;
    const fresh = stamp !== stored;
    if (fresh) {
      db.route.variant = stamp;
      db.route.startIndex = resyncIndex(base, snap.state.level, 0);
      db.route.skippedSteps = [];
    }
    const list = insertBlocks(base, db.route.startIndex, chainBlocks(r, base), toWorld);
    const listIndex = new Map<EmittedStep, number>();
    list.forEach((s, i) => listIndex.set(s, i));
    if (!fresh && previous.length > 0) {
      const kept: number[] = [];
      for (const i of db.route.skippedSteps) {
        const index = previous[i] == null ? null : listIndex.get(previous[i]);
        if (index != null) kept.push(index);
      }
      db.route.skippedSteps = kept;
    }
    baseIndex = new Map();
    base.forEach((s, i) => baseIndex.set(s, i));
    hearthSteps = [];
    list.forEach((s, i) => {
      if (s.type === "hearth") hearthSteps.push(i);
    });
    steps = list;
    cursor = null;
    followed = null;
    lastCurrent = -1;
    hearthBoundWhileCurrent = false;
    builtKey = wantedKey();
    return true;
  };

  const context = (snap: PlayerSnapshot): ProgressContext => ({
    completed: snap.state.completed,
    log: snap.log,
    level: snap.state.level,
    xpIntoLevel: snap.xpIntoLevel,
    knownTaxi: new Set(db.knownTaxiNodes),
    pos: snap.pos,
    bindPos: snap.hearth.pos,
    hearthBoundWhileCurrent,
    toWorld,
    taxiPos: (id) => taxiNode(id)?.pos ?? null,
  });

  const loopCluster = (s: EmittedStep, center: WorldPos): SpawnCluster | null => {
    if (s.loop == null) return null;
    const points: WorldPos[] = [];
    for (const [x, y] of s.loop) {
      const p = deps.toWorld(s.uiMapId, x, y);
      if (p != null) points.push(p);
    }
    return points.length > 0 ? { center, points } : null;
  };

  const toTarget = (i: number, timeTo: (p: WorldPos) => number): Target | null => {
    const s = steps[i];
    const pos = deps.toWorld(s.uiMapId, s.x, s.y);
    if (pos == null) {
      reportOnce("routeStepPlace", t("routeStepUnplaced").replace("{n}", String(i + 1)));
      return null;
    }
    const kind = QUEST_KIND[s.type] ?? "route";
    const questId = kind === "route" ? null : (s.questId ?? null);
    const quest = questId == null ? null : deps.quest(questId);
    const seconds = timeTo(pos);
    return {
      questId,
      kind,
      objectiveIndex: kind === "objective" ? (s.objectiveIndex ?? null) : null,
      pos,
      cluster: kind === "objective" ? loopCluster(s, pos) : null,
      otherSpots: 0,
      seconds: Number.isNaN(seconds) ? Infinity : seconds,
      questLevel: quest?.level ?? s.targetLevel,
      trivial: false,
      elite: quest?.isElite ?? false,
      zoneAreaId: quest?.zoneAreaId ?? null,
      route: { index: i, type: s.type, label: kind === "route" ? stepText(s) : "" },
    };
  };

  const targets = (snap: PlayerSnapshot): Target[] | null => {
    const r = load();
    if (r == null) {
      // Not installed at all is shown by the Quest tab; only broken data is reported.
      if (unavailable != null && routesInstalled()) reportOnce("routeData", `${t("routesMissing")} (${unavailable})`);
      return null;
    }
    const key = wantedKey();
    if (key !== builtKey) {
      if (key === failedKey) return null;
      // Decoding waits for the end of combat; the previous route stays in use meanwhile.
      if (!deps.inCombat() && !rebuild(r, snap, key)) return null;
    }
    // Never built yet (first load in combat): completion drives the arrow meanwhile.
    if (builtKey === "") return null;
    lastSnap = snap;
    const ctx = context(snap);
    const skipped = new Set(db.route.skippedSteps);
    // Design 3.5: a hearth step on cooldown is passed; the travel graph walks or flies instead.
    if (!snap.hearth.ready) for (const i of hearthSteps) skipped.add(i);
    const startIndex = db.route.startIndex;
    const next = advance(steps, startIndex, skipped, new Set(db.skippedQuests), ctx, quest, snap.state);
    cursor = next;
    const passedFrom = lastCurrent >= 0 ? lastCurrent : startIndex;
    for (let i = Math.max(0, passedFrom); i < next.current && i < steps.length; i++) {
      if (TRAVEL_STEPS[steps[i].type] === true && !skipped.has(i) && !db.route.skippedSteps.includes(i)) db.route.skippedSteps.push(i);
    }
    if (next.current !== lastCurrent) {
      lastCurrent = next.current;
      hearthBoundWhileCurrent = false;
    }
    if (next.removed.size > 0) reportOnce("routeRemoved", t("routeStepsRemoved").replace("{n}", String(next.removed.size)));
    const timeTo = deps.timeTo(snap);
    if (timeTo == null) return [];
    const realizable = (i: number): boolean => {
      const s = steps[i];
      if (s.questId == null) return s.type !== "accept" && s.type !== "complete" && s.type !== "turnin";
      if (s.type === "complete" || s.type === "turnin") return snap.log.has(s.questId);
      if (s.type !== "accept") return true;
      const q = deps.quest(s.questId);
      return q != null && isAvailable(q, snap.state) && snap.state.inLog.size < QUEST_LOG_SIZE;
    };
    const view = follow(steps, next, ctx, timeTo, realizable, snap.maxLevel, quest, snap.state, startIndex, skipped);
    followed = view;
    const out: Target[] = [];
    const add = (i: number | null): void => {
      if (i == null) return;
      const target = toTarget(i, timeTo);
      if (target != null) out.push(target);
    };
    add(view.target);
    if (view.current !== view.target) add(view.current);
    for (const i of view.next) if (i !== view.target) add(i);
    return out;
  };

  return {
    targets: (snap) => targets(snap),
    view() {
      const v = followed;
      if (v == null) return null;
      const text = (i: number | null): string | null => (i == null || steps[i] == null ? null : stepText(steps[i]));
      const nextTexts: string[] = [];
      for (const i of v.next) nextTexts.push(stepText(steps[i]));
      return { ...v, total: steps.length, startIndex: db.route.startIndex, currentText: text(v.current), targetText: text(v.target), nextTexts };
    },
    resync() {
      const snap = lastSnap;
      if (snap == null || builtKey === "") return;
      const baseLength = baseIndex.size;
      db.route.startIndex = toBaseIndex(resyncIndex(steps, snap.state.level, 0), baseLength);
      lastCurrent = -1;
    },
    hearthBound() {
      if (cursor != null && steps[cursor.current]?.type === "setHearth") hearthBoundWhileCurrent = true;
    },
    taxiLeg(target) {
      const ref = target.route;
      const s = ref == null ? null : steps[ref.index];
      if (s == null || s.type !== "fly" || s.taxiNodeId == null) return null;
      let from: number | null = null;
      let best = Infinity;
      const side = deps.faction();
      for (const node of deps.taxiNodes) {
        if (side != null && !isFriendlyTo(node.faction, side)) continue;
        const d = distance(node.pos, target.pos);
        if (d < best) {
          best = d;
          from = node.id;
        }
      }
      return from == null ? null : { from, to: s.taxiNodeId };
    },
    unavailable: () => {
      load();
      return unavailable;
    },
    routesBuild: () => load()?.meta.build ?? null,
  };
}

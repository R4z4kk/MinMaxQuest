import { XP_PER_LEVEL } from "../../../addon/src/core/constants";
import { distance, type WorldPos } from "../../../addon/src/core/geometry";
import { questXp } from "../../../addon/src/core/questXp";
import { TRAVEL, type TravelData } from "../../../addon/src/data/generated/travel";
import { isAvailable, passesMaxLevelOption } from "../../../addon/src/quests/availability";
import { firstHop, taxiDestination, travelTime } from "../../../addon/src/travel/graph";
import type { Scenario } from "../model/constants";
import { mobXp } from "../model/mobXp";
import { median, type Dungeon, type Place, type RouteQuest, type Task, type World } from "../model/world";
import {
  applyStep,
  cloneState,
  doTask,
  grindSecondsPerKill,
  loopSpacing,
  MAX_LEVEL,
  objectiveKey,
  objectivesDone,
  posLabel,
  QUEST_LOG_SIZE,
  questView,
  starterCredit,
  travelView,
  type RouteStep,
  type SimOptions,
  type SimState,
  type TravelView,
} from "../sim/simulate";

export interface Variant { elites: boolean; dungeons: boolean; maxLevelGap: number | null }
export interface BuildRequest {
  world: World;
  scenario: Scenario;
  variant: Variant;
  start: SimState;
  targetLevel: number;
  areaIds: Set<number> | null;
  beamWidth: number;
  branching: number;
}
export interface BuiltRoute { steps: RouteStep[]; end: SimState }

export const DEFAULT_BEAM_WIDTH = 8;
export const DEFAULT_BRANCHING = 6;
const LEVEL_BAND = 5;
const HEARTH_INN_YARDS = 400;

interface Block {
  key: string;
  quests: RouteQuest[];
  uiMapId: number;
  centroid: WorldPos;
  inn: Place | null;
  dungeon: Dungeon | null;
  maxRequired: number;
  medianLevel: number;
}
interface Draft { state: SimState; steps: RouteStep[]; blocksDone: Set<string>; hearth: Place | null }
interface Node extends Draft { score: number }
interface Context {
  req: BuildRequest;
  travel: TravelData;
  opts: SimOptions;
  blocks: Block[];
  kills: Task[];
  taxiByMap: Map<number, number[]>;
}

export function grindRate(s: SimState, spacingYards: number, scenario: Scenario): number {
  return mobXp(s.level, s.level, false) / grindSecondsPerKill(s, spacingYards, scenario);
}

function remainingXp(s: SimState, targetLevel: number): number {
  if (s.level >= targetLevel) return 0;
  let xp = -s.xp;
  for (let level = s.level; level < targetLevel; level++) xp += XP_PER_LEVEL.values[level - 1];
  return xp;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stepId(s: RouteStep): string {
  const fields = [s.questId, s.objectiveIndex, s.taxiNodeId, s.dungeonAreaId, s.grindToLevel, s.grindMobLevel, s.grindSpacingYards];
  return `${s.type}:${fields.map((f) => f ?? "").join(":")}@${posLabel(s.place.pos)}`;
}

function compareNodes(a: Node, b: Node): number {
  return (
    a.score - b.score ||
    a.state.seconds - b.state.seconds ||
    compareText(a.steps.map(stepId).join("|"), b.steps.map(stepId).join("|"))
  );
}

function eligible(q: RouteQuest, v: Variant, uiMaps: Set<number> | null): boolean {
  if (!v.elites && q.info.isElite) return false;
  if (q.returnVisit && !q.accessChain) return false;
  if (q.dungeonAreaId != null && !v.dungeons && !q.accessChain) return false;
  return uiMaps == null || uiMaps.has(q.accept.uiMapId);
}

function uiMapsOf(world: World, areaIds: Set<number> | null): Set<number> | null {
  if (areaIds == null) return null;
  const maps = new Set<number>();
  for (const areaId of [...areaIds].sort((a, b) => a - b)) {
    const uiMapId = world.areaUiMap.get(areaId);
    if (uiMapId == null) throw new Error(`buildRoute: area ${areaId} has no uiMap`);
    maps.add(uiMapId);
  }
  return maps;
}

function centroidOf(key: string, quests: RouteQuest[]): WorldPos {
  const continent = quests[0].accept.pos.continent;
  let x = 0;
  let y = 0;
  for (const q of quests) {
    if (q.accept.pos.continent !== continent) throw new Error(`buildRoute: block ${key} spans continents (quest ${q.id})`);
    x += q.accept.pos.x;
    y += q.accept.pos.y;
  }
  return { continent, x: x / quests.length, y: y / quests.length };
}

function nearestInn(world: World, at: WorldPos): Place | null {
  let best: Place | null = null;
  for (const inn of world.inns) {
    const yards = distance(inn.place.pos, at);
    if (yards <= HEARTH_INN_YARDS && (best == null || yards < distance(best.pos, at))) best = inn.place;
  }
  return best;
}

function makeBlock(key: string, quests: RouteQuest[], dungeon: Dungeon | null, world: World): Block {
  const centroid = dungeon == null ? centroidOf(key, quests) : dungeon.entrance.pos;
  return {
    key,
    quests,
    uiMapId: dungeon == null ? quests[0].accept.uiMapId : dungeon.entrance.uiMapId,
    centroid,
    inn: dungeon == null ? nearestInn(world, centroid) : null,
    dungeon,
    maxRequired: Math.max(...quests.map((q) => q.info.requiredLevel)),
    medianLevel: median(quests.map((q) => q.info.level)),
  };
}

function group<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list == null) map.set(key, [value]);
  else list.push(value);
}

function context(req: BuildRequest, travel: TravelData): Context {
  const { world, variant } = req;
  const uiMaps = uiMapsOf(world, req.areaIds);
  const zones = new Map<string, RouteQuest[]>();
  const dungeons = new Map<number, RouteQuest[]>();
  const kills: Task[] = [];
  const killSpots = new Set<string>();
  for (const id of [...world.quests.keys()].sort((a, b) => a - b)) {
    const q = world.quests.get(id);
    if (q != null && q.accessChain && q.returnVisit) {
      const dungeon = world.dungeons.find((d) => d.areaId === q.dungeonAreaId);
      throw new Error(`buildRoute: access-chain quest ${q.id} needs a second visit to dungeon ${q.dungeonAreaId} (${dungeon?.name ?? "not in the world"}), unsupported`);
    }
    if (q == null || !eligible(q, variant, uiMaps)) continue;
    if (q.dungeonAreaId != null) {
      group(dungeons, q.dungeonAreaId, q);
      continue;
    }
    group(zones, `z:${q.accept.uiMapId}:${Math.floor((q.info.level - 1) / LEVEL_BAND)}`, q);
    for (const t of q.tasks) {
      const spot = posLabel(t.cluster.center.pos);
      if (t.kind !== "kill" || t.elite || killSpots.has(spot)) continue;
      killSpots.add(spot);
      kills.push(t);
    }
  }
  const blocks = [...zones].map(([key, quests]) => makeBlock(key, quests, null, world));
  for (const [areaId, quests] of dungeons) {
    const dungeon = world.dungeons.find((d) => d.areaId === areaId);
    if (dungeon == null) throw new Error(`buildRoute: dungeon ${areaId} of quest ${quests[0].id} is not in the world`);
    blocks.push(makeBlock(`d:${areaId}`, quests, dungeon, world));
  }
  blocks.sort((a, b) => compareText(a.key, b.key));

  const taxiByMap = new Map<number, number[]>();
  for (const id of [...world.taxiZone.keys()].sort((a, b) => a - b)) {
    const uiMapId = world.taxiZone.get(id);
    if (uiMapId != null) group(taxiByMap, uiMapId, id);
  }
  const opts: SimOptions = { maxLevelGap: variant.maxLevelGap, tolerant: false, raceMask: world.raceMask };
  return { req, travel, opts, blocks, kills, taxiByMap };
}

function taxiPlace(c: Context, nodeId: number): Place {
  const place = c.req.world.taxiPlaces.get(nodeId);
  if (place == null) throw new Error(`buildRoute: taxi node ${nodeId} has no flight master place`);
  return place;
}

function acceptable(c: Context, s: SimState, q: RouteQuest): boolean {
  const view = questView(s, c.opts);
  return isAvailable(q.info, view) && passesMaxLevelOption(q.info, view, c.opts.maxLevelGap);
}

function nearest<T>(c: Context, s: SimState, items: T[], at: (item: T) => WorldPos): T | null {
  if (items.length === 0) return null;
  const v = travelView(s, c.req.world, c.travel);
  let best: T | null = null;
  let bestSeconds = Infinity;
  for (const item of items) {
    const seconds = travelTime(v.plan, v.graph, at(item), v.ctx);
    if (seconds < bestSeconds) {
      best = item;
      bestSeconds = seconds;
    }
  }
  if (best == null) throw new Error(`buildRoute: none of ${items.length} places is reachable from ${posLabel(s.pos)} at level ${s.level}`);
  return best;
}

function apply(c: Context, d: Draft, step: RouteStep): void {
  const outcome = applyStep(d.state, step, c.req.world, c.req.scenario, c.opts, c.travel);
  if (outcome.violation != null) throw new Error(`buildRoute: builder emitted an invalid step at level ${d.state.level} (${outcome.violation})`);
  d.steps.push(step);
}

function markTravel(c: Context, d: Draft, target: WorldPos): void {
  let hearthed = false;
  while (distance(d.state.pos, target) !== 0) {
    const v = travelView(d.state, c.req.world, c.travel);
    const hop = firstHop(v.plan, v.graph, target, v.ctx);
    if (hop?.kind === "hearth" && !hearthed) {
      if (d.hearth == null) throw new Error(`buildRoute: hearth used at level ${d.state.level} without a bound inn`);
      apply(c, d, { type: "hearth", place: d.hearth });
      hearthed = true;
      continue;
    }
    if (hop?.kind === "taxi") {
      const to = taxiDestination(v.plan, v.graph, target, v.ctx);
      if (hop.taxiNodeId == null || to == null) throw new Error(`buildRoute: taxi hop to ${posLabel(target)} has no node`);
      apply(c, d, { type: "fly", place: taxiPlace(c, hop.taxiNodeId), taxiNodeId: to });
    }
    return;
  }
}

function emit(c: Context, d: Draft, step: RouteStep): void {
  markTravel(c, d, step.place.pos);
  apply(c, d, step);
}

function grindTask(c: Context, s: SimState): { task: Task; mobLevel: number } | null {
  const level = s.level;
  const near = c.kills.filter((t) => t.mobLevel >= level - 2 && t.mobLevel <= level + 1 && mobXp(level, t.mobLevel, false) > 0);
  const pool = near.length > 0 ? near : c.kills;
  const task = nearest(c, s, pool, (t) => t.cluster.center.pos);
  if (task == null) return null;
  return { task, mobLevel: near.length > 0 ? task.mobLevel : level };
}

// Priced on the cluster grindChild would pick; with no kill cluster at all, the walk-free lower bound.
function grindEstimate(c: Context, s: SimState): number {
  const pick = grindTask(c, s);
  return grindRate(s, pick == null ? 0 : loopSpacing(pick.task.cluster.loop), c.req.scenario);
}

function worthIt(c: Context, s: SimState, q: RouteQuest, from: TravelView, rate: number): boolean {
  if (q.info.baseXp == null) throw new Error(`buildRoute: quest ${q.id} has no baseXp`);
  const away = (pos: WorldPos): number => travelTime(from.plan, from.graph, pos, from.ctx);
  let xp = questXp(q.info.baseXp, q.info.level, s.level, MAX_LEVEL);
  let seconds = 0;
  let detour = Math.max(away(q.accept.pos), away(q.turnin.pos));
  const tasks = q.starter == null ? q.tasks : [q.starter, ...q.tasks];
  for (const t of tasks) {
    const probe: SimState = { ...s, kills: new Map(s.kills) };
    xp += doTask(probe, t, c.req.scenario, t === q.starter ? starterCredit(s, t) : 0);
    seconds += probe.seconds - s.seconds;
    detour = Math.max(detour, away(t.cluster.center.pos));
  }
  return xp >= rate * (seconds + 2 * detour);
}

// A starter dropped by mobs that a quest in the log still has to kill is looted after those kills.
function waitsForKills(c: Context, s: SimState, q: RouteQuest): boolean {
  const npcId = q.starter?.cluster.center.npcId ?? null;
  if (npcId == null) return false;
  for (const id of s.inLog) {
    const logged = c.req.world.quests.get(id);
    if (logged?.tasks.some((t) => t.cluster.center.npcId === npcId && !s.done.has(objectiveKey(id, t.objectiveIndex)))) return true;
  }
  return false;
}

function acceptQuests(c: Context, d: Draft, b: Block, filtered: boolean): void {
  const from = filtered ? travelView(d.state, c.req.world, c.travel, b.centroid) : null;
  while (d.state.inLog.size < QUEST_LOG_SIZE) {
    const rate = from == null ? 0 : grindEstimate(c, d.state);
    const open = b.quests.filter(
      (q) => acceptable(c, d.state, q) && !waitsForKills(c, d.state, q) && (from == null || worthIt(c, d.state, q, from, rate)),
    );
    const q = nearest(c, d.state, open, (x) => x.accept.pos);
    if (q == null) return;
    emit(c, d, { type: "accept", place: q.accept, questId: q.id });
  }
}

function doTasks(c: Context, d: Draft, b: Block): void {
  for (;;) {
    const open: { q: RouteQuest; t: Task }[] = [];
    for (const q of b.quests) {
      if (!d.state.inLog.has(q.id)) continue;
      for (const t of q.tasks) if (!d.state.done.has(objectiveKey(q.id, t.objectiveIndex))) open.push({ q, t });
    }
    const next = nearest(c, d.state, open, (x) => x.t.cluster.center.pos);
    if (next == null) return;
    emit(c, d, { type: "complete", place: next.t.cluster.center, questId: next.q.id, objectiveIndex: next.t.objectiveIndex });
  }
}

function turnIn(c: Context, d: Draft, b: Block): void {
  for (;;) {
    const open = b.quests.filter((q) => d.state.inLog.has(q.id) && objectivesDone(d.state, q));
    const q = nearest(c, d.state, open, (x) => x.turnin.pos);
    if (q == null) return;
    emit(c, d, { type: "turnin", place: q.turnin, questId: q.id });
  }
}

function draft(node: Node): Draft {
  return { state: cloneState(node.state), steps: [...node.steps], blocksDone: new Set(node.blocksDone), hearth: node.hearth };
}

function finish(c: Context, d: Draft): Node {
  const xp = remainingXp(d.state, c.req.targetLevel);
  return { ...d, score: d.state.seconds + (xp === 0 ? 0 : xp / grindEstimate(c, d.state)) };
}

function fillZone(c: Context, node: Node, b: Block, inn: Place | null): Node | null {
  const d = draft(node);
  if (inn != null) {
    emit(c, d, { type: "setHearth", place: inn });
    d.hearth = inn;
  }
  const unknown = (c.taxiByMap.get(b.uiMapId) ?? []).filter((id) => !d.state.knownTaxi.has(id));
  const taxi = nearest(c, d.state, unknown, (id) => taxiPlace(c, id).pos);
  if (taxi != null) emit(c, d, { type: "getFlightPath", place: taxiPlace(c, taxi), taxiNodeId: taxi });
  for (;;) {
    const before = d.steps.length;
    acceptQuests(c, d, b, true);
    doTasks(c, d, b);
    turnIn(c, d, b);
    if (d.steps.length === before) break;
  }
  return d.state.completed.size > node.state.completed.size ? finish(c, d) : null;
}

function fillDungeon(c: Context, node: Node, b: Block, dungeon: Dungeon): Node | null {
  const d = draft(node);
  acceptQuests(c, d, b, false);
  const inLog = b.quests.filter((q) => d.state.inLog.has(q.id));
  if (inLog.length === 0) return null;
  if (inLog.some((q) => !objectivesDone(d.state, q))) {
    emit(c, d, { type: "dungeon", place: dungeon.entrance, dungeonAreaId: dungeon.areaId });
  }
  turnIn(c, d, b);
  d.blocksDone.add(b.key);
  return finish(c, d);
}

function grindChild(c: Context, node: Node): Node | null {
  const pick = grindTask(c, node.state);
  if (pick == null) return null;
  const { task, mobLevel } = pick;
  const d = draft(node);
  const step: RouteStep = {
    type: "grind",
    place: task.cluster.center,
    grindToLevel: node.state.level + 1,
    grindMobLevel: mobLevel,
    grindSpacingYards: loopSpacing(task.cluster.loop),
  };
  emit(c, d, step);
  return finish(c, d);
}

// A no-op where the build scenario reached the target; it closes the gap where another scenario (fewer assumed-drop kills) ends short.
function closingGrind(c: Context, node: Node): Draft {
  const d = draft(node);
  const last = d.steps.at(-1);
  if (last == null || (last.type === "grind" && last.grindToLevel != null && last.grindToLevel >= c.req.targetLevel)) return d;
  const pick = grindTask(c, d.state);
  apply(c, d, {
    type: "grind",
    place: last.place,
    grindToLevel: c.req.targetLevel,
    grindMobLevel: pick?.mobLevel ?? d.state.level,
    grindSpacingYards: pick == null ? 0 : loopSpacing(pick.task.cluster.loop),
  });
  return d;
}

function zoneOpen(c: Context, s: SimState, b: Block): boolean {
  return b.quests.some((q) => s.inLog.has(q.id) || acceptable(c, s, q));
}

function tryChild(b: Block | null, node: Node, make: () => Node | null): Node | null {
  try {
    return make();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${b == null ? "grind" : `block ${b.key}`} at level ${node.state.level}: ${message}`, { cause: error });
  }
}

function children(c: Context, node: Node): Node[] {
  const s = node.state;
  const made: (Node | null)[] = [];
  const dungeons = c.blocks.filter(
    (b) =>
      b.dungeon != null &&
      !node.blocksDone.has(b.key) &&
      s.level >= b.maxRequired &&
      s.inLog.size < QUEST_LOG_SIZE &&
      b.quests.some((q) => acceptable(c, s, q)),
  );
  const forced = dungeons.filter((b) => s.level >= b.medianLevel);
  for (const b of forced.length > 0 ? forced : dungeons) {
    const dungeon = b.dungeon;
    if (dungeon != null) made.push(tryChild(b, node, () => fillDungeon(c, node, b, dungeon)));
  }
  if (forced.length === 0) {
    const v = travelView(s, c.req.world, c.travel);
    const zones = c.blocks
      .filter((b) => b.dungeon == null && zoneOpen(c, s, b))
      .map((b) => ({ b, seconds: travelTime(v.plan, v.graph, b.centroid, v.ctx) }))
      .filter((x) => Number.isFinite(x.seconds))
      .sort((x, y) => x.seconds - y.seconds || compareText(x.b.key, y.b.key));
    let filled = 0;
    for (const { b } of zones) {
      if (filled === c.req.branching) break;
      const plain = tryChild(b, node, () => fillZone(c, node, b, null));
      if (plain == null) continue;
      filled += 1;
      made.push(plain);
      const inn = b.inn;
      if (inn != null && (s.hearth.pos == null || distance(inn.pos, s.hearth.pos) !== 0)) {
        made.push(tryChild(b, node, () => fillZone(c, node, b, inn)));
      }
    }
    made.push(tryChild(null, node, () => grindChild(c, node)));
  }
  return made.filter((n): n is Node => n != null);
}

function remainingBlocks(c: Context, node: Node): number {
  return c.blocks.filter((b) =>
    b.dungeon != null ? !node.blocksDone.has(b.key) : b.quests.some((q) => !node.state.completed.has(q.id)),
  ).length;
}

function positiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`buildRoute: ${name} must be a positive integer, got ${value}`);
}

function boundInn(req: BuildRequest): Place | null {
  const pos = req.start.hearth.pos;
  if (pos == null) return null;
  const inn = req.world.inns.find((i) => distance(i.place.pos, pos) === 0);
  if (inn == null) throw new Error(`buildRoute: start hearth ${posLabel(pos)} is not at a known inn`);
  return inn.place;
}

export function buildRoute(req: BuildRequest, travel: TravelData = TRAVEL): BuiltRoute {
  const target = req.targetLevel;
  if (!Number.isInteger(target) || target < 2 || target > MAX_LEVEL) {
    throw new Error(`buildRoute: targetLevel must be an integer 2..${MAX_LEVEL}, got ${target}`);
  }
  positiveInteger("beamWidth", req.beamWidth);
  positiveInteger("branching", req.branching);
  const gap = req.variant.maxLevelGap;
  if (gap != null && !(Number.isInteger(gap) && gap >= 0)) throw new Error(`buildRoute: maxLevelGap must be a non-negative integer, got ${gap}`);

  const c = context(req, travel);
  let beam = [finish(c, { state: cloneState(req.start), steps: [], blocksDone: new Set(), hearth: boundInn(req) })];
  for (;;) {
    const open = beam.filter((n) => n.state.level < target);
    if (open.length === 0) {
      const best = closingGrind(c, [...beam].sort((a, b) => a.state.seconds - b.state.seconds || compareNodes(a, b))[0]);
      return { steps: best.steps, end: best.state };
    }
    const next = beam.filter((n) => n.state.level >= target);
    for (const node of open) next.push(...children(c, node));
    if (next.length === 0) {
      const stuck = beam[0];
      throw new Error(
        `buildRoute: no route can progress at level ${stuck.state.level} with ${remainingBlocks(c, stuck)} blocks left (variant ${JSON.stringify(req.variant)})`,
      );
    }
    next.sort(compareNodes);
    beam = next.slice(0, req.beamWidth);
  }
}

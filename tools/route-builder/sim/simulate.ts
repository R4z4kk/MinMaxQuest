import { CONSTANTS, XP_PER_LEVEL } from "../../../addon/src/core/constants";
import { distance, type WorldPos } from "../../../addon/src/core/geometry";
import { questXp } from "../../../addon/src/core/questXp";
import { TRAVEL, type TravelData } from "../../../addon/src/data/generated/travel";
import { graphKey, travelSpeed } from "../../../addon/src/game/routing";
import { isAvailable, passesMaxLevelOption, type PlayerQuestState } from "../../../addon/src/quests/availability";
import type { StepType } from "../../../addon/src/route/format";
import { buildGraph, firstHop, solveFrom, travelTime, type TravelContext, type TravelGraph, type TravelPlan } from "../../../addon/src/travel/graph";
import { BUILDER, COLLECT_QUANTILE, type Scenario } from "../model/constants";
import { killsForItems } from "../model/drops";
import { mobXp } from "../model/mobXp";
import type { Place, RouteQuest, Task, World } from "../model/world";

export interface RouteStep {
  type: StepType;
  place: Place;
  questId?: number;
  objectiveIndex?: number;
  taxiNodeId?: number;
  dungeonAreaId?: number;
  grindToLevel?: number;
  grindMobLevel?: number;
}
export interface SimOptions { maxLevelGap: number | null; tolerant: boolean; raceMask: number }
export interface SimState {
  seconds: number;
  level: number;
  xp: number;
  pos: WorldPos;
  inLog: Set<number>;
  completed: Set<number>;
  done: Set<string>;
  knownTaxi: Set<number>;
  hearth: { pos: WorldPos | null; readyAt: number };
  skipped: Set<number>;
}
export interface StepOutcome { seconds: number; xp: number; violation: string | null }
export interface SimResult { state: SimState; outcomes: StepOutcome[]; violations: string[] }
export interface TravelView { graph: TravelGraph; plan: TravelPlan; ctx: TravelContext }

type NumericField = "questId" | "objectiveIndex" | "taxiNodeId" | "dungeonAreaId" | "grindToLevel" | "grindMobLevel";

export const MAX_LEVEL = XP_PER_LEVEL.values.length + 1;
// Classic quest log cap, https://warcraft.wiki.gg/wiki/Quest_log
export const QUEST_LOG_SIZE = 20;
// Unverified modelling assumption: a grind walks one loop of 10 spawns 20 yd apart per level gained.
const GRIND_LOOP_YARDS = 10 * 20;
const zero = (): StepOutcome => ({ seconds: 0, xp: 0, violation: null });

const graphs = new WeakMap<TravelData, Map<string, TravelGraph>>();

export function initialState(start: Place, level: number, knownTaxi: number[], hearthPos: WorldPos | null): SimState {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) throw new Error(`initialState: level must be 1..${MAX_LEVEL}, got ${level}`);
  return {
    seconds: 0,
    level,
    xp: 0,
    pos: start.pos,
    inLog: new Set(),
    completed: new Set(),
    done: new Set(),
    knownTaxi: new Set(knownTaxi),
    hearth: { pos: hearthPos, readyAt: 0 },
    skipped: new Set(),
  };
}

export function cloneState(s: SimState): SimState {
  return {
    ...s,
    inLog: new Set(s.inLog),
    completed: new Set(s.completed),
    done: new Set(s.done),
    knownTaxi: new Set(s.knownTaxi),
    hearth: { ...s.hearth },
    skipped: new Set(s.skipped),
  };
}

function field(step: RouteStep, name: NumericField): number {
  const value = step[name];
  if (value == null) throw new Error(`${step.type} step needs ${name}`);
  return value;
}

export function posLabel(p: WorldPos): string {
  return `${p.continent}:${p.x.toFixed(0)},${p.y.toFixed(0)}`;
}

function walkSeconds(yards: number, level: number): number {
  return (yards * CONSTANTS.detourFactor.value) / travelSpeed(level);
}

function gainXp(s: SimState, amount: number): number {
  if (s.level >= MAX_LEVEL) return 0;
  s.xp += amount;
  while (s.level < MAX_LEVEL && s.xp >= XP_PER_LEVEL.values[s.level - 1]) {
    s.xp -= XP_PER_LEVEL.values[s.level - 1];
    s.level += 1;
  }
  if (s.level === MAX_LEVEL) s.xp = 0;
  return amount;
}

export function travelView(s: SimState, world: World, travel: TravelData = TRAVEL, from: WorldPos = s.pos): TravelView {
  const ctx: TravelContext = {
    speed: travelSpeed(s.level),
    knownTaxiNodes: new Set(s.knownTaxi),
    faction: world.faction,
    hearth: { ready: s.seconds >= s.hearth.readyAt, pos: s.hearth.pos },
  };
  const key = graphKey(ctx, [...s.knownTaxi].sort((a, b) => a - b));
  let byKey = graphs.get(travel);
  if (byKey == null) {
    byKey = new Map();
    graphs.set(travel, byKey);
  }
  let graph = byKey.get(key);
  if (graph == null) {
    graph = buildGraph(travel, ctx);
    byKey.set(key, graph);
  }
  return { graph, plan: solveFrom(graph, from, ctx), ctx };
}

function travelTo(s: SimState, target: Place, world: World, travel: TravelData): void {
  if (distance(s.pos, target.pos) === 0) return;
  const { graph, plan, ctx } = travelView(s, world, travel);
  const seconds = travelTime(plan, graph, target.pos, ctx);
  if (!Number.isFinite(seconds)) throw new Error(`place ${posLabel(target.pos)} unreachable from ${posLabel(s.pos)}`);
  if (firstHop(plan, graph, target.pos, ctx)?.kind === "hearth") s.hearth.readyAt = s.seconds + CONSTANTS.hearthCooldownSec.value;
  s.seconds += seconds;
  s.pos = target.pos;
}

function loopSeconds(task: Task, level: number): number {
  const loop = task.cluster.loop;
  let yards = 0;
  for (let i = 1; i < loop.length; i++) yards += distance(loop[i - 1].pos, loop[i].pos);
  if (!Number.isFinite(yards)) throw new Error(`objective ${task.objectiveIndex} loop spans continents`);
  return walkSeconds(yards, level);
}

export function doTask(s: SimState, task: Task, scenario: Scenario): number {
  const loop = loopSeconds(task, s.level);
  s.seconds += loop;
  if (task.kind === "use") {
    s.seconds += task.count * BUILDER.objectUseSec.value;
    return 0;
  }
  const kills = task.kind === "kill" ? task.count : killsForItems(task.count, task.dropChance, COLLECT_QUANTILE);
  const perKill = scenario.killSec.value * (task.elite ? scenario.eliteFactor.value : 1) + BUILDER.lootSec.value;
  let xp = 0;
  for (let i = 0; i < kills; i++) {
    s.seconds += perKill;
    xp += gainXp(s, mobXp(s.level, task.mobLevel, task.elite));
  }
  return xp;
}

function grind(s: SimState, toLevel: number, mobLevel: number, scenario: Scenario): number {
  if (!Number.isInteger(toLevel) || toLevel > MAX_LEVEL) throw new Error(`grindToLevel must be an integer up to ${MAX_LEVEL}, got ${toLevel}`);
  const perKill = scenario.killSec.value + BUILDER.lootSec.value;
  let xp = 0;
  while (s.level < toLevel) {
    const level = s.level;
    const gain = mobXp(level, mobLevel, false);
    if (gain <= 0) throw new Error(`grind: mob level ${mobLevel} gives no XP at level ${level}`);
    s.seconds += perKill;
    xp += gainXp(s, gain);
    s.seconds += (s.level - level) * walkSeconds(GRIND_LOOP_YARDS, level);
  }
  return xp;
}

export function questView(s: SimState, opts: SimOptions): PlayerQuestState {
  return { level: s.level, raceMask: opts.raceMask, classMask: 0, completed: s.completed, inLog: s.inLog };
}

export function objectiveKey(questId: number, objectiveIndex: number): string {
  return `${questId}:${objectiveIndex}`;
}

export function objectivesDone(s: SimState, q: RouteQuest): boolean {
  return q.info.objectives.every((o) => s.done.has(objectiveKey(q.id, o.index)));
}

function rejection(s: SimState, type: StepType, q: RouteQuest, opts: SimOptions): string | null {
  if (type === "accept") {
    if (s.inLog.size >= QUEST_LOG_SIZE) return "logFull";
    if (!isAvailable(q.info, questView(s, opts))) return "unavailable";
    if (!passesMaxLevelOption(q.info, questView(s, opts), opts.maxLevelGap)) return "maxLevelGap";
    return null;
  }
  if (!s.inLog.has(q.id)) return "notInLog";
  if (type === "turnin" && !objectivesDone(s, q)) return "objectivesNotDone";
  return null;
}

function questStep(s: SimState, step: RouteStep, world: World, scenario: Scenario, opts: SimOptions, travel: TravelData): StepOutcome {
  const id = field(step, "questId");
  const q = world.quests.get(id);
  if (q == null) throw new Error(`unknown questId ${id}`);
  let task: Task | null = null;
  if (step.type === "complete") {
    const index = field(step, "objectiveIndex");
    task = q.tasks.find((t) => t.objectiveIndex === index) ?? null;
    if (task == null) throw new Error(`quest ${id} has no task for objective ${index}`);
  }
  if (opts.tolerant && s.skipped.has(id)) return zero();
  const reason = rejection(s, step.type, q, opts);
  if (reason != null) {
    if (!opts.tolerant) return { ...zero(), violation: `${step.type} ${id}: ${reason}` };
    if (step.type === "accept") s.skipped.add(id);
    return zero();
  }

  const before = s.seconds;
  travelTo(s, step.place, world, travel);
  let xp = 0;
  if (task != null) {
    xp = doTask(s, task, scenario);
    s.done.add(objectiveKey(id, task.objectiveIndex));
  } else if (step.type === "accept") {
    s.seconds += BUILDER.npcInteractSec.value;
    s.inLog.add(id);
  } else {
    if (q.info.baseXp == null) throw new Error(`quest ${id} has no baseXp`);
    s.seconds += BUILDER.npcInteractSec.value;
    xp = gainXp(s, questXp(q.info.baseXp, q.info.level, s.level, MAX_LEVEL));
    s.inLog.delete(id);
    s.completed.add(id);
  }
  return { seconds: s.seconds - before, xp, violation: null };
}

export function applyStep(
  s: SimState,
  step: RouteStep,
  world: World,
  scenario: Scenario,
  opts: SimOptions,
  travel: TravelData = TRAVEL,
): StepOutcome {
  if (step.type === "accept" || step.type === "complete" || step.type === "turnin") {
    return questStep(s, step, world, scenario, opts, travel);
  }
  if (step.type === "fly") return zero();
  if (step.type === "hearth" && (s.hearth.pos == null || s.seconds < s.hearth.readyAt)) return zero();

  const before = s.seconds;
  let xp = 0;
  if (step.type === "grind") {
    const toLevel = field(step, "grindToLevel");
    const mobLevel = field(step, "grindMobLevel");
    travelTo(s, step.place, world, travel);
    xp = grind(s, toLevel, mobLevel, scenario);
  } else if (step.type === "dungeon") {
    const areaId = field(step, "dungeonAreaId");
    if (!world.dungeons.some((d) => d.areaId === areaId)) throw new Error(`unknown dungeonAreaId ${areaId}`);
    travelTo(s, step.place, world, travel);
    s.seconds += scenario.dungeonSec.value;
    for (const id of s.inLog) {
      const q = world.quests.get(id);
      if (q == null) throw new Error(`questId ${id} in log is not in the world`);
      if (q.dungeonAreaId !== areaId) continue;
      for (const o of q.info.objectives) s.done.add(objectiveKey(id, o.index));
    }
  } else if (step.type === "getFlightPath") {
    const node = field(step, "taxiNodeId");
    travelTo(s, step.place, world, travel);
    s.seconds += BUILDER.npcInteractSec.value;
    s.knownTaxi.add(node);
  } else {
    travelTo(s, step.place, world, travel);
    if (step.type === "setHearth") {
      s.seconds += BUILDER.npcInteractSec.value;
      s.hearth.pos = step.place.pos;
    }
  }
  return { seconds: s.seconds - before, xp, violation: null };
}

export function simulate(
  steps: RouteStep[],
  start: SimState,
  world: World,
  scenario: Scenario,
  opts: SimOptions,
  travel: TravelData = TRAVEL,
): SimResult {
  const state = cloneState(start);
  const outcomes: StepOutcome[] = [];
  const violations: string[] = [];
  steps.forEach((step, index) => {
    let outcome: StepOutcome;
    try {
      outcome = applyStep(state, step, world, scenario, opts, travel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`simulate: step ${index} (${step.type}): ${message}`, { cause: error });
    }
    outcomes.push(outcome);
    if (outcome.violation != null) violations.push(`step ${index}: ${outcome.violation}`);
  });
  return { state, outcomes, violations };
}

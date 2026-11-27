import { TRAVEL, type TravelData } from "../../../addon/src/data/generated/travel";
import { followUps } from "../../../addon/src/quests/followUps";
import { encodeSteps, type EmittedStep } from "../../../addon/src/route/format";
import { SCENARIOS, type Scenario } from "../model/constants";
import type { World } from "../model/world";
import { allVariants, segments, variantKey, type Evaluated, type FactionRoutes, type Segment } from "../opt/variants";
import { applyStep, initialState, type RouteStep, type SimOptions, type SimState, type StepOutcome } from "../sim/simulate";

export interface EmitMeta { build: string; questieDb: string; generatedOn: string; constants: Record<string, number> }

const FACTION_NAMES = { A: "Alliance", H: "Horde" };
const REPORT_COLUMNS = ["Variant", "Fast h", "Medium h", "Slow h", "Average h", "Quests", "Grind %", "Steps", "Worst race h", "Skipped"];

export function luaLongString(content: string): string {
  for (let level = 0; ; level++) {
    const equals = "=".repeat(level);
    const close = `]${equals}]`;
    if ((content + close).indexOf(close) === content.length) return `[${equals}[${content}${close}`;
  }
}

function luaString(value: string): string {
  return JSON.stringify(value).replace(/\\u([0-9a-f]{4})/g, (_, hex: string) => `\\${String(parseInt(hex, 16)).padStart(3, "0")}`);
}

function medium(): Scenario {
  const found = SCENARIOS.find((s) => s.name === "medium");
  if (found == null) throw new Error("emit: scenario medium missing");
  return found;
}

interface Traced { steps: EmittedStep[]; outcomes: StepOutcome[] }

function emittedStep(step: RouteStep, world: World, after: SimState | null, outcome: StepOutcome): EmittedStep {
  const out: EmittedStep = {
    type: step.type,
    uiMapId: step.place.uiMapId,
    x: step.place.x,
    y: step.place.y,
    targetLevel: after == null ? 0 : after.level,
    targetXpIntoLevel: after == null ? 0 : Math.round(after.xp),
    estCostSeconds: Math.round(outcome.seconds),
    estXpGain: Math.round(outcome.xp),
  };
  if (step.questId != null) out.questId = step.questId;
  if (step.objectiveIndex != null) out.objectiveIndex = step.objectiveIndex;
  if (step.place.npcId != null) out.npcId = step.place.npcId;
  if (step.taxiNodeId != null) out.taxiNodeId = step.taxiNodeId;
  const quest = step.questId == null ? null : world.quests.get(step.questId);
  if (quest != null) {
    if (quest.info.races !== 0) out.races = quest.info.races;
    if (step.type === "turnin") {
      const unlocks = followUps(quest.id, (id) => world.quests.get(id)?.info ?? null).map((q) => q.id);
      if (unlocks.length > 0) out.unlocks = unlocks;
    }
    if (step.type === "complete") {
      // Loop points in another uiMap than the step's cannot be drawn on its map and are dropped.
      const task = quest.tasks.find((t) => t.objectiveIndex === step.objectiveIndex);
      const loop = (task?.cluster.loop ?? []).filter((p) => p.uiMapId === step.place.uiMapId);
      if (loop.length > 0) out.loop = loop.map((p): [number, number] => [p.x, p.y]);
    }
  }
  return out;
}

function traceRoute(label: string, steps: RouteStep[], world: World, seg: Segment, maxLevelGap: number | null, travel: TravelData): Traced {
  const state = initialState(seg.start, seg.level, seg.knownTaxi, seg.hearth?.pos ?? null);
  const opts: SimOptions = { maxLevelGap, tolerant: false, raceMask: world.raceMask };
  const emitted: EmittedStep[] = [];
  const outcomes: StepOutcome[] = [];
  steps.forEach((step, index) => {
    let outcome: StepOutcome;
    try {
      outcome = applyStep(state, step, world, medium(), opts, travel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`emit: ${label} step ${index} (${step.type}): ${message}`, { cause: error });
    }
    if (outcome.violation != null) throw new Error(`emit: ${label} step ${index}: ${outcome.violation}`);
    outcomes.push(outcome);
    emitted.push(emittedStep(step, world, state, outcome));
  });
  return { steps: emitted, outcomes };
}

// Return blocks are not a route: no level target, cost and XP from a tolerant run at the highest required level of their quests.
function traceReturnBlock(areaId: number, steps: RouteStep[], world: World, travel: TravelData): EmittedStep[] {
  if (steps.length === 0) return [];
  const level = Math.max(1, ...steps.map((s) => (s.questId == null ? 1 : (world.quests.get(s.questId)?.info.requiredLevel ?? 1))));
  const state = initialState(steps[0].place, level, [], null);
  const opts: SimOptions = { maxLevelGap: null, tolerant: true, raceMask: world.raceMask };
  return steps.map((step, index) => {
    try {
      return emittedStep(step, world, null, applyStep(state, step, world, medium(), opts, travel));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`emit: return block ${areaId} step ${index} (${step.type}): ${message}`, { cause: error });
    }
  });
}

function gapOf(key: string): number | null {
  const variant = allVariants().find((v) => variantKey(v) === key);
  if (variant == null) throw new Error(`emit: unknown variant key ${key}`);
  return variant.maxLevelGap;
}

function segmentOf(world: World, name: string): Segment {
  const seg = segments(world).find((s) => s.name === name);
  if (seg == null) throw new Error(`emit: no segment ${name} for faction ${world.faction}`);
  return seg;
}

function sortedKeys<T>(record: Record<string, T>): string[] {
  return Object.keys(record).sort();
}

function luaVariants(world: World, name: string, variants: Record<string, Evaluated>, travel: TravelData, indent: string): string {
  const seg = segmentOf(world, name);
  const lines = sortedKeys(variants).map((key) => {
    const traced = traceRoute(`${name} ${key}`, variants[key].steps, world, seg, gapOf(key), travel);
    return `${indent}  [${luaString(key)}] = ${luaLongString(encodeSteps(traced.steps))},`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
}

export function emitFaction(routes: FactionRoutes, world: World, meta: EmitMeta, travel: TravelData = TRAVEL): string {
  if (routes.faction !== world.faction) throw new Error(`emitFaction: routes are for ${routes.faction}, world for ${world.faction}`);
  const constants = sortedKeys(meta.constants).map((key) => {
    const value = meta.constants[key];
    if (!Number.isFinite(value)) throw new Error(`emitFaction: constant ${key} is not finite: ${value}`);
    return `[${luaString(key)}] = ${value}`;
  });
  const zones = sortedKeys(routes.segments).map((zone) => `    [${luaString(zone)}] = ${luaVariants(world, zone, routes.segments[zone], travel, "    ")},`);
  const blocks = Object.keys(routes.returnBlocks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((areaId) => `    [${areaId}] = ${luaLongString(encodeSteps(traceReturnBlock(areaId, routes.returnBlocks[areaId], world, travel)))},`);
  return [
    "MinMaxQuestRoutes = MinMaxQuestRoutes or {}",
    `MinMaxQuestRoutes.${FACTION_NAMES[routes.faction]} = {`,
    `  meta = { build = ${luaString(meta.build)}, questieDb = ${luaString(meta.questieDb)}, generatedOn = ${luaString(meta.generatedOn)}, constants = { ${constants.join(", ")} } },`,
    `  segments = {\n${zones.join("\n")}\n  },`,
    `  trunk = ${luaVariants(world, "trunk", routes.trunk, travel, "  ")},`,
    `  returnBlocks = {\n${blocks.join("\n")}\n  },`,
    "}",
    "",
  ].join("\n");
}

const hours = (seconds: number): string => (seconds / 3600).toFixed(2);

function reportTable(title: string, name: string, variants: Record<string, Evaluated>, world: World, travel: TravelData): string[] {
  const seg = segmentOf(world, name);
  const rows = sortedKeys(variants).map((key) => {
    const v = variants[key];
    const traced = traceRoute(`${name} ${key}`, v.steps, world, seg, gapOf(key), travel);
    const total = traced.outcomes.reduce((sum, o) => sum + o.seconds, 0);
    const grind = v.steps.reduce((sum, step, i) => sum + (step.type === "grind" ? traced.outcomes[i].seconds : 0), 0);
    const quests = v.steps.filter((s) => s.type === "turnin").length;
    const cells = [
      key,
      hours(v.secondsByScenario.fast),
      hours(v.secondsByScenario.medium),
      hours(v.secondsByScenario.slow),
      hours(v.average),
      String(quests),
      (total > 0 ? (100 * grind) / total : 0).toFixed(1),
      String(v.steps.length),
      hours(v.worstRace.seconds),
      String(v.worstRace.skipped),
    ];
    return `| ${cells.join(" | ")} |`;
  });
  return [`## ${title}`, "", `| ${REPORT_COLUMNS.join(" | ")} |`, `|${REPORT_COLUMNS.map(() => " --- ").join("|")}|`, ...rows, ""];
}

export function emitReport(all: FactionRoutes[], worlds: World[], meta: EmitMeta, travel: TravelData = TRAVEL): string {
  const out = ["# Route report", "", `Build ${meta.build}, QuestieDB ${meta.questieDb}, generated ${meta.generatedOn}.`, ""];
  for (const routes of all) {
    const world = worlds.find((w) => w.faction === routes.faction);
    if (world == null) throw new Error(`emitReport: no world for faction ${routes.faction}`);
    const faction = FACTION_NAMES[routes.faction];
    out.push(...reportTable(`${faction} trunk`, "trunk", routes.trunk, world, travel));
    for (const zone of sortedKeys(routes.segments)) out.push(...reportTable(`${faction} ${zone}`, zone, routes.segments[zone], world, travel));
    out.push(`## ${faction} excluded quests`, "", "| Reason | Count |", "| --- | --- |");
    for (const [reason, count] of [...world.excluded].sort((a, b) => a[0].localeCompare(b[0]))) out.push(`| ${reason} | ${count} |`);
    out.push("", `Zone conversion check: median offset ${world.conversionOffsetYards.toFixed(2)} yards.`, "");
  }
  return out.join("\n");
}

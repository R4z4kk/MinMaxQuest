import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRAVEL, type TravelData } from "../../../addon/src/data/generated/travel";
import { SCENARIOS, type Scenario } from "../model/constants";
import type { World } from "../model/world";
import { segments, type Evaluated, type FactionRoutes } from "../opt/variants";
import { applyStep, cloneState, initialState, type RouteStep, type SimOptions, type SimState } from "../sim/simulate";

export interface RxpGuideFile { file: string; zone: string; faction: "A" | "H"; finalLevel: number }

// finalLevel: upper bound of the file-name level range; Skyborne has none, so its last start-zone header (9-13).
export const RXP_GUIDES: RxpGuideFile[] = [
  { file: "Alliance-1-10_NightElf.lua", zone: "teldrassil", faction: "A", finalLevel: 10 },
  { file: "Alliance-1-13_Human.lua", zone: "elwynn-forest", faction: "A", finalLevel: 13 },
  { file: "Alliance-1-14_DwarfGnome.lua", zone: "dun-morogh", faction: "A", finalLevel: 14 },
  { file: "Horde-01-12_Durotar.lua", zone: "durotar", faction: "H", finalLevel: 12 },
  { file: "Horde-01-14_Undead.lua", zone: "tirisfal-glades", faction: "H", finalLevel: 14 },
  { file: "Horde-1-12_Mulgore.lua", zone: "mulgore", faction: "H", finalLevel: 12 },
  { file: "RestedXP-Skyborne.lua", zone: "zephras-isle", faction: "A", finalLevel: 13 },
  { file: "RestedXP-Skyborne.lua", zone: "zephras-isle", faction: "H", finalLevel: 13 },
];

// droppedAt: number of kept steps before each dropped directive.
export interface ParsedGuide { steps: RouteStep[]; dropped: number; droppedAt: number[] }
export interface RxpRun { consumed: number; seconds: number; level: number; reached: boolean; skipped: number }
export interface BenchRow {
  faction: "A" | "H";
  zone: string;
  file: string;
  level: number;
  rxpSeconds: number;
  rxpLevel: number;
  reached: boolean;
  oursSeconds: number;
  variant: string;
  steps: number;
  dropped: number;
  skipped: number;
}

const DIRECTIVE = /^\s*\.(accept|turnin|complete)\b(.*)$/;
const ARGUMENTS = /^\s+([+-]?\d+)(?:,(\d+))?/;

export function parseRxpGuide(text: string, world: World, source: string): ParsedGuide {
  const steps: RouteStep[] = [];
  const seen = new Set<string>();
  const droppedAt: number[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const directive = DIRECTIVE.exec(line);
    if (directive == null) return;
    const type = directive[1] as "accept" | "turnin" | "complete";
    const args = ARGUMENTS.exec(directive[2]);
    if (args == null || (type === "complete" && args[2] == null)) throw new Error(`rxp: ${source}:${index + 1}: malformed directive "${line.trim()}"`);
    const questId = Number(args[1]);
    const objectiveIndex = Number(args[2]);
    const key = type === "complete" ? `complete ${questId},${objectiveIndex}` : `${type} ${questId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const quest = world.quests.get(questId);
    if (quest == null) {
      droppedAt.push(steps.length);
      return;
    }
    if (type === "accept") steps.push({ type, place: quest.accept, questId });
    else if (type === "turnin") steps.push({ type, place: quest.turnin, questId });
    else {
      const task = quest.tasks.find((t) => t.objectiveIndex === objectiveIndex);
      if (task == null) droppedAt.push(steps.length);
      else steps.push({ type, place: task.cluster.center, questId, objectiveIndex });
    }
  });
  return { steps, dropped: droppedAt.length, droppedAt };
}

export function runRxp(
  steps: RouteStep[],
  start: SimState,
  world: World,
  scenario: Scenario,
  targetLevel: number,
  raceMask: number,
  travel: TravelData = TRAVEL,
): RxpRun {
  const state = cloneState(start);
  const opts: SimOptions = { maxLevelGap: null, tolerant: true, raceMask };
  let reached = state.level >= targetLevel;
  let consumed = 0;
  for (; consumed < steps.length && !reached; consumed++) {
    const index = consumed;
    try {
      applyStep(state, steps[index], world, scenario, opts, travel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`rxp: step ${index} (${steps[index].type}): ${message}`, { cause: error });
    }
    reached = state.level >= targetLevel;
  }
  return { consumed, seconds: state.seconds - start.seconds, level: state.level, reached, skipped: state.skipped.size };
}

function medium(): Scenario {
  const found = SCENARIOS.find((s) => s.name === "medium");
  if (found == null) throw new Error("rxp: scenario medium missing");
  return found;
}

function bestOurs(zone: string, variants: Record<string, Evaluated>): { variant: string; seconds: number } {
  let best: { variant: string; seconds: number } | null = null;
  for (const [variant, evaluated] of Object.entries(variants)) {
    const seconds = evaluated.secondsByScenario.medium;
    if (best == null || seconds < best.seconds) best = { variant, seconds };
  }
  if (best == null) throw new Error(`rxp: no variant built for ${zone}`);
  return best;
}

export function benchmarkRxp(dir: string, world: World, routes: FactionRoutes, travel: TravelData = TRAVEL): BenchRow[] {
  const rows: BenchRow[] = [];
  for (const guide of RXP_GUIDES.filter((g) => g.faction === world.faction)) {
    const variants = routes.segments[guide.zone];
    const seg = segments(world).find((s) => s.name === guide.zone);
    if (variants == null || Object.keys(variants).length === 0 || seg == null) {
      throw new Error(`rxp: ${guide.file}: zone ${guide.zone} has no built segment for faction ${world.faction}`);
    }
    if (seg.zoneMask == null) throw new Error(`rxp: ${guide.zone} has no race mask`);
    if (guide.finalLevel < seg.targetLevel) throw new Error(`rxp: ${guide.file} ends at level ${guide.finalLevel}, before the segment target ${seg.targetLevel}`);
    const path = join(dir, guide.file);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (error) {
      throw new Error(`rxp: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const parsed = parseRxpGuide(text, world, path);
    const start = initialState(seg.start, seg.level, seg.knownTaxi, seg.hearth?.pos ?? null);
    const run = runRxp(parsed.steps, start, world, medium(), seg.targetLevel, seg.zoneMask, travel);
    const ours = bestOurs(guide.zone, variants);
    rows.push({
      faction: world.faction,
      zone: guide.zone,
      file: guide.file,
      level: seg.targetLevel,
      rxpSeconds: run.seconds,
      rxpLevel: run.level,
      reached: run.reached,
      oursSeconds: ours.seconds,
      variant: ours.variant,
      steps: run.consumed,
      dropped: parsed.droppedAt.filter((at) => (run.reached ? at < run.consumed : at <= run.consumed)).length,
      skipped: run.skipped,
    });
  }
  return rows;
}

import { distance } from "../../../addon/src/core/geometry";
import { TRAVEL, type TravelData } from "../../../addon/src/data/generated/travel";
import { maskAllows } from "../../../addon/src/quests/availability";
import { BUILDER, SCENARIOS, type Scenario } from "../model/constants";
import type { Place, RouteQuest, World } from "../model/world";
import { initialState, simulate, type RouteStep, type SimOptions, type SimState } from "../sim/simulate";
import { buildRoute, type Variant } from "./build";

export type VariantKey = string;
export interface RaceRun { raceMask: number; seconds: number; skipped: number; level: number; reached: boolean }
export interface Evaluated {
  steps: RouteStep[];
  secondsByScenario: Record<Scenario["name"], number>;
  levelByScenario: Record<Scenario["name"], number>;
  average: number;
  worstRace: RaceRun;
  discardedCandidates: { scenario: Scenario["name"]; violation: string }[];
}
export interface Scored {
  secondsByScenario: Record<Scenario["name"], number>;
  levelByScenario: Record<Scenario["name"], number>;
  violation: string | null;
}
export interface FactionRoutes {
  faction: "A" | "H";
  segments: Record<string, Record<VariantKey, Evaluated>>;
  trunk: Record<VariantKey, Evaluated>;
  returnBlocks: Record<number, RouteStep[]>;
}

const MAX_LEVEL_GAPS = [null, 1, 2, 3];
const TRUNK_START_LEVEL = 10;
const TRUNK_TARGET_LEVEL = 60;
const RACE_CHECK_SCENARIO = "medium";

export function variantKey(v: Variant): VariantKey {
  return `e${+v.elites}d${+v.dungeons}x${v.maxLevelGap ?? 0}`;
}

export function allVariants(): Variant[] {
  const out: Variant[] = [];
  for (const elites of [false, true]) {
    for (const dungeons of [false, true]) {
      for (const maxLevelGap of MAX_LEVEL_GAPS) out.push({ elites, dungeons, maxLevelGap });
    }
  }
  return out;
}

export interface Segment {
  name: string;
  start: Place;
  level: number;
  knownTaxi: number[];
  hearth: Place | null;
  targetLevel: number;
  areaIds: Set<number> | null;
  raceMasks: number[];
  zoneMask: number | null;
}

function nearestInn(world: World, to: Place): Place | null {
  let best: Place | null = null;
  let bestDistance = Infinity;
  for (const inn of world.inns) {
    const d = distance(inn.place.pos, to.pos);
    if (d < bestDistance) {
      best = inn.place;
      bestDistance = d;
    }
  }
  return best;
}

export function segments(world: World): Segment[] {
  const out: Segment[] = world.startZones.map((zone) => {
    const uiMapId = world.areaUiMap.get(zone.areaId);
    if (uiMapId == null) throw new Error(`buildFaction: start zone ${zone.key} area ${zone.areaId} has no uiMap`);
    const areaIds = new Set([...world.areaUiMap].filter(([, map]) => map === uiMapId).map(([areaId]) => areaId));
    return {
      name: zone.key,
      start: zone.start,
      level: 1,
      knownTaxi: [],
      hearth: nearestInn(world, zone.start),
      targetLevel: BUILDER.segmentEndLevel.value,
      areaIds,
      zoneMask: zone.raceMask,
      raceMasks: world.raceMasks.filter((mask) => maskAllows(zone.raceMask, mask)),
    };
  });
  const capital = world.taxiPlaces.get(world.capitalTaxiNode);
  if (capital == null) throw new Error(`buildFaction: capital taxi node ${world.capitalTaxiNode} has no place`);
  out.push({
    name: "trunk",
    start: capital,
    level: TRUNK_START_LEVEL,
    knownTaxi: [world.capitalTaxiNode],
    hearth: nearestInn(world, capital),
    targetLevel: TRUNK_TARGET_LEVEL,
    areaIds: null,
    zoneMask: null,
    raceMasks: world.raceMasks,
  });
  return out;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function pickWinner<T extends { average: number }>(label: string, valid: T[], discarded: Evaluated["discardedCandidates"]): T {
  let best: T | null = null;
  for (const candidate of valid) if (best == null || candidate.average < best.average) best = candidate;
  if (best == null) {
    const all = discarded.map((d) => `${d.scenario} route, ${d.violation}`).join("; ");
    throw new Error(`buildFaction: ${label} has no candidate valid under all scenarios: ${all}`);
  }
  return best;
}

// A strict violation or an end below the target under any scenario makes the candidate invalid.
export function scoreCandidate(
  steps: RouteStep[],
  start: () => SimState,
  world: World,
  targetLevel: number,
  strict: SimOptions,
  travel: TravelData,
): Scored {
  const secondsByScenario = {} as Record<Scenario["name"], number>;
  const levelByScenario = {} as Record<Scenario["name"], number>;
  let violation: string | null = null;
  for (const s of SCENARIOS) {
    const result = simulate(steps, start(), world, s, strict, travel);
    if (violation == null && result.violations.length > 0) violation = `scenario ${s.name}: ${result.violations[0]}`;
    if (violation == null && result.state.level < targetLevel) {
      violation = `ends at level ${result.state.level} < target ${targetLevel} under ${s.name}`;
    }
    secondsByScenario[s.name] = result.state.seconds;
    levelByScenario[s.name] = result.state.level;
  }
  return { secondsByScenario, levelByScenario, violation };
}

// Worse: ends below the target first, then more skipped quests, then more seconds.
export function worseRace(a: RaceRun, b: RaceRun): boolean {
  if (a.reached !== b.reached) return !a.reached;
  if (a.skipped !== b.skipped) return a.skipped > b.skipped;
  return a.seconds > b.seconds;
}

function evaluate(
  world: World,
  seg: Segment,
  variant: Variant,
  opts: { beamWidth: number; branching: number },
  travel: TravelData,
): Evaluated {
  const key = variantKey(variant);
  const start = (): SimState => initialState(seg.start, seg.level, seg.knownTaxi, seg.hearth?.pos ?? null);
  const strict: SimOptions = { maxLevelGap: variant.maxLevelGap, tolerant: false, raceMask: world.raceMask };
  const tag = `[${world.faction}] ${seg.name} ${key}`;
  const valid: Omit<Evaluated, "worstRace">[] = [];
  const discarded: Evaluated["discardedCandidates"] = [];

  for (const built of SCENARIOS) {
    let steps: RouteStep[];
    try {
      steps = buildRoute({ world, scenario: built, variant, start: start(), targetLevel: seg.targetLevel, areaIds: seg.areaIds, ...opts }, travel).steps;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`buildFaction: ${seg.name} ${key} ${built.name}: ${message}`, { cause: error });
    }
    const { secondsByScenario, levelByScenario, violation } = scoreCandidate(steps, start, world, seg.targetLevel, strict, travel);
    if (violation != null) {
      console.error(`${tag} ${built.name} candidate discarded, ${violation}`);
      discarded.push({ scenario: built.name, violation });
      continue;
    }
    const average = mean(SCENARIOS.map((s) => secondsByScenario[s.name]));
    console.error(`${tag} ${built.name} candidate average ${average.toFixed(0)}s`);
    valid.push({ steps, secondsByScenario, levelByScenario, average, discardedCandidates: [] });
  }
  const winner = pickWinner(`${seg.name} ${key}`, valid, discarded);
  const checked = SCENARIOS.find((s) => s.name === RACE_CHECK_SCENARIO);
  if (checked == null) throw new Error(`buildFaction: scenario ${RACE_CHECK_SCENARIO} missing`);
  if (seg.raceMasks.length === 0) {
    const zone = seg.zoneMask == null ? "" : ` (zone mask ${seg.zoneMask})`;
    throw new Error(`buildFaction: ${seg.name}${zone} has no race to check, faction masks [${world.raceMasks.join(",")}]`);
  }
  let worst: RaceRun | null = null;
  for (const raceMask of seg.raceMasks) {
    const result = simulate(winner.steps, start(), world, checked, { ...strict, tolerant: true, raceMask }, travel);
    const run: RaceRun = {
      raceMask,
      seconds: result.state.seconds,
      skipped: result.state.skipped.size,
      level: result.state.level,
      reached: result.state.level >= seg.targetLevel,
    };
    if (worst == null || worseRace(run, worst)) worst = run;
  }
  if (worst == null) throw new Error(`buildFaction: ${seg.name} race check ran no race`);
  const best: Evaluated = { ...winner, worstRace: worst, discardedCandidates: [...discarded] };
  const short = worst.reached ? "" : `, ends at level ${worst.level} < target ${seg.targetLevel}`;
  console.error(`${tag} winner average ${best.average.toFixed(0)}s worst race ${worst.raceMask} skipped ${worst.skipped}${short}`);
  return best;
}

function chainOrder(quests: RouteQuest[]): RouteQuest[] {
  const ids = new Set(quests.map((q) => q.id));
  const before = (q: RouteQuest): number[] => {
    const prerequisites = [...q.info.preGroup, ...q.info.preSingle, ...quests.filter((p) => p.info.nextInChain === q.id).map((p) => p.id)];
    return prerequisites.filter((id) => ids.has(id));
  };
  const placed = new Set<number>();
  const out: RouteQuest[] = [];
  const left = [...quests].sort((a, b) => a.id - b.id);
  while (left.length > 0) {
    const index = left.findIndex((q) => before(q).every((id) => placed.has(id)));
    if (index < 0) throw new Error(`buildFaction: return quests ${left.map((q) => q.id).join(",")} form a prerequisite cycle`);
    const [q] = left.splice(index, 1);
    placed.add(q.id);
    out.push(q);
  }
  return out;
}

function returnBlocks(world: World): Record<number, RouteStep[]> {
  const out: Record<number, RouteStep[]> = {};
  for (const dungeon of world.dungeons) {
    const quests: RouteQuest[] = [];
    for (const id of dungeon.questIds) {
      const q = world.quests.get(id);
      if (q != null && q.returnVisit && !q.accessChain) quests.push(q);
    }
    if (quests.length === 0) continue;
    const ordered = chainOrder(quests);
    out[dungeon.areaId] = [
      ...ordered.map((q): RouteStep => ({ type: "accept", place: q.accept, questId: q.id })),
      { type: "dungeon", place: dungeon.entrance, dungeonAreaId: dungeon.areaId },
      ...ordered.map((q): RouteStep => ({ type: "turnin", place: q.turnin, questId: q.id })),
    ];
  }
  return out;
}

export function buildFaction(
  world: World,
  opts: { beamWidth: number; branching: number; variants?: Variant[] },
  travel: TravelData = TRAVEL,
): FactionRoutes {
  const { variants = allVariants(), ...search } = opts;
  if (variants.length === 0) throw new Error("buildFaction: no variant requested");
  const routes: FactionRoutes = { faction: world.faction, segments: {}, trunk: {}, returnBlocks: returnBlocks(world) };
  for (const seg of segments(world)) {
    const target: Record<VariantKey, Evaluated> = {};
    for (const variant of variants) target[variantKey(variant)] = evaluate(world, seg, variant, search, travel);
    if (seg.name === "trunk") routes.trunk = target;
    else routes.segments[seg.name] = target;
  }
  return routes;
}

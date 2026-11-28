import { CONSTANTS } from "../core/constants";
import { distance, type WorldPos } from "../core/geometry";
import type { TravelData } from "../data/generated/travel";

export interface TravelContext {
  speed: number;
  knownTaxiNodes: Set<number>;
  faction: "A" | "H";
  hearth: { ready: boolean; pos: WorldPos | null };
  hearthPenaltySec: number;
}

// Nearest walk places of a point, nearest first; places -1 and dists Infinity past count.
export interface Landmarks {
  places: number[];
  dists: number[];
  count: number;
}

export interface TravelPlan {
  times: Map<number, number>;
  via: Map<number, number>;
  viaKind: Map<number, number>;
  nodePos: Map<number, WorldPos>;
  originMarks: Landmarks;
}

export interface TaxiLeg {
  from: number;
  to: number;
}

export interface TravelHop {
  kind: "walk" | "taxi" | "boat" | "portal" | "hearth";
  pos: WorldPos;
  taxiNodeId: number | null;
}

export interface TravelGraph {
  ids: number[];
  positions: WorldPos[];
  edgeTo: number[][];
  edgeCost: number[][];
  edgeKind: number[][];
  hearthSlot: number;
  slotCount: number;
  dist: number[];
  prev: number[];
  prevKind: number[];
  heap: number[];
  heapPos: number[];
  heapSize: number;
  bestCost: number;
  places: WorldPos[];
  // Baked walking yards between walk places, row-major; Infinity where there is no way through.
  placeYards: number[];
  slotPlace: number[];
  // Walking yards between fixed slots, row-major with stride slotCount; the origin row is filled per solve.
  walkYards: number[];
  originYards: number[];
  // Nearest slots and walk places per target point (by identity); the graph is rebuilt, never mutated, so this never goes stale.
  nearest: Map<WorldPos, TargetLinks>;
}

interface TargetLinks {
  slots: number[];
  marks: Landmarks;
}

export const ORIGIN_ID = -1;
export const HEARTH_ID = -2;

const DOCK_ID_BASE = 1000000;
const WALK = 0;
const TAXI = 1;
const BOAT = 2;
const HEARTH = 3;
const PORTAL = 4;
const DIRECT = -100;
const UNREACHABLE = -101;
const NO_PLACE = -1;
const MARK_COUNT = 3;

function factionAllowed(allowed: "A" | "H" | "AH" | null, faction: "A" | "H"): boolean {
  return allowed == null || allowed === "AH" || allowed === faction;
}

function assertSpeed(ctx: TravelContext): void {
  if (!Number.isFinite(ctx.speed) || ctx.speed <= 0) {
    throw new Error(`travel graph: speed must be a finite number > 0, got ${ctx.speed}`);
  }
}

function straightYards(a: WorldPos, b: WorldPos): number {
  return distance(a, b) * CONSTANTS.detourFactor.value;
}

function filled(length: number, value: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < length; i++) values.push(value);
  return values;
}

function posKey(pos: WorldPos): string {
  return `${pos.continent}:${pos.x}:${pos.y}`;
}

function bakedYards(data: TravelData): number[] {
  const count = data.walkPlaces.length;
  const walks = data.walks;
  if (walks.length % 4 !== 0) throw new Error(`travel graph: walks length ${walks.length} is not a multiple of 4`);
  const yards = filled(count * count, Infinity);
  for (let place = 0; place < count; place++) yards[place * count + place] = 0;
  for (let i = 0; i < walks.length; i += 4) {
    const a = walks[i];
    const b = walks[i + 1];
    if (a < 0 || b < 0 || a >= count || b >= count || a === b) throw new Error(`travel graph: bad walk places ${a} ${b}`);
    if (walks[i + 2] >= 0) yards[a * count + b] = walks[i + 2];
    if (walks[i + 3] >= 0) yards[b * count + a] = walks[i + 3];
  }
  return yards;
}

function emptyMarks(): Landmarks {
  return { places: filled(MARK_COUNT, NO_PLACE), dists: filled(MARK_COUNT, Infinity), count: 0 };
}

function findMarks(places: WorldPos[], point: WorldPos, marks: Landmarks): Landmarks {
  for (let place = 0; place < places.length; place++) {
    const pos = places[place];
    if (pos.continent !== point.continent) continue;
    const dist = Math.sqrt((pos.x - point.x) ** 2 + (pos.y - point.y) ** 2);
    if (dist >= marks.dists[MARK_COUNT - 1]) continue;
    let index = MARK_COUNT - 1;
    while (index > 0 && marks.dists[index - 1] > dist) {
      marks.places[index] = marks.places[index - 1];
      marks.dists[index] = marks.dists[index - 1];
      index -= 1;
    }
    marks.places[index] = place;
    marks.dists[index] = dist;
    if (marks.count < MARK_COUNT) marks.count += 1;
  }
  return marks;
}

// A free point (player, target) is on the landmass of its nearest walk place that has a baked walk to the
// other end: the walk is at least that baked walk minus the straight lines to it, and never below the straight estimate.
function freeToPlaceYards(graph: TravelGraph, marks: Landmarks, place: number, straight: number, outbound: boolean): number {
  if (marks.count === 0) return straight;
  const count = graph.places.length;
  for (let i = 0; i < marks.count; i++) {
    const mark = marks.places[i];
    const baked = outbound ? graph.placeYards[mark * count + place] : graph.placeYards[place * count + mark];
    if (baked !== Infinity) return Math.max(straight, baked - marks.dists[i]);
  }
  return Infinity;
}

function freeToFreeYards(graph: TravelGraph, from: Landmarks, to: Landmarks, straight: number): number {
  if (from.count === 0 || to.count === 0) return straight;
  const count = graph.places.length;
  let nearest = Infinity;
  let bound = 0;
  for (let i = 0; i < from.count; i++) {
    for (let j = 0; j < to.count; j++) {
      const baked = graph.placeYards[from.places[i] * count + to.places[j]];
      const dists = from.dists[i] + to.dists[j];
      if (baked !== Infinity && dists < nearest) {
        nearest = dists;
        bound = baked - dists;
      }
    }
  }
  return nearest === Infinity ? Infinity : Math.max(straight, bound);
}

export function buildGraph(data: TravelData, ctx: TravelContext): TravelGraph {
  assertSpeed(ctx);
  const ids: number[] = [];
  const positions: WorldPos[] = [];
  const edgeTo: number[][] = [];
  const edgeCost: number[][] = [];
  const edgeKind: number[][] = [];
  const slotOf = new Map<number, number>();
  const dockSlots = new Map<string, number>();
  const slotPlace: number[] = [];
  const placeOf = new Map<string, number>();
  data.walkPlaces.forEach((pos, place) => placeOf.set(posKey(pos), place));

  const addNode = (id: number, pos: WorldPos, place: number): number => {
    const slot = ids.length;
    ids.push(id);
    positions.push(pos);
    slotPlace.push(place);
    edgeTo.push([]);
    edgeCost.push([]);
    edgeKind.push([]);
    slotOf.set(id, slot);
    return slot;
  };
  const addEdge = (from: number, to: number, cost: number, kind: number): void => {
    edgeTo[from].push(to);
    edgeCost[from].push(cost);
    edgeKind[from].push(kind);
  };
  const dockSlot = (pos: WorldPos): number => {
    const key = posKey(pos);
    const known = dockSlots.get(key);
    if (known != null) return known;
    const slot = addNode(DOCK_ID_BASE + dockSlots.size, pos, placeOf.get(key) ?? NO_PLACE);
    dockSlots.set(key, slot);
    return slot;
  };

  for (const node of data.taxiNodes) {
    if (ctx.knownTaxiNodes.has(node.id) && factionAllowed(node.faction, ctx.faction)) addNode(node.id, node.pos, placeOf.get(posKey(node.pos)) ?? NO_PLACE);
  }
  for (const edge of data.taxiEdges) {
    const from = slotOf.get(edge.from);
    const to = slotOf.get(edge.to);
    if (from != null && to != null) addEdge(from, to, edge.seconds, TAXI);
  }
  for (const leg of data.transports) {
    if (!factionAllowed(leg.faction == null ? null : leg.faction, ctx.faction)) continue;
    addEdge(dockSlot(leg.fromDock), dockSlot(leg.toDock), leg.periodSec / 2 + leg.seconds, BOAT);
  }
  for (const portal of data.portals) {
    if (!factionAllowed(portal.faction == null ? null : portal.faction, ctx.faction)) continue;
    addEdge(dockSlot(portal.from), dockSlot(portal.to), CONSTANTS.portalSec.value, PORTAL);
  }
  const hearthSlot = ctx.hearth.pos == null ? -1 : addNode(HEARTH_ID, ctx.hearth.pos, NO_PLACE);

  const originSlot = addNode(ORIGIN_ID, { continent: -1, x: 0, y: 0 }, NO_PLACE);
  const slotCount = originSlot + 1;
  const placeCount = data.walkPlaces.length;
  const placeYards = bakedYards(data);
  const walkYards = filled(slotCount * slotCount, Infinity);
  for (let from = 0; from < originSlot; from++) {
    for (let to = 0; to < originSlot; to++) {
      const a = slotPlace[from];
      const b = slotPlace[to];
      let yards = 0;
      if (from !== to) yards = a >= 0 && b >= 0 ? placeYards[a * placeCount + b] : straightYards(positions[from], positions[to]);
      walkYards[from * slotCount + to] = yards;
    }
  }
  return {
    ids,
    positions,
    edgeTo,
    edgeCost,
    edgeKind,
    hearthSlot,
    slotCount,
    dist: filled(slotCount, Infinity),
    prev: filled(slotCount, -1),
    prevKind: filled(slotCount, WALK),
    heap: filled(slotCount, -1),
    heapPos: filled(slotCount, -1),
    heapSize: 0,
    bestCost: Infinity,
    places: data.walkPlaces,
    placeYards,
    slotPlace,
    walkYards,
    originYards: filled(slotCount, Infinity),
    nearest: new Map<WorldPos, TargetLinks>(),
  };
}

function heapSwap(graph: TravelGraph, a: number, b: number): void {
  const { heap, heapPos } = graph;
  const slotA = heap[a];
  const slotB = heap[b];
  heap[a] = slotB;
  heap[b] = slotA;
  heapPos[slotB] = a;
  heapPos[slotA] = b;
}

function siftUp(graph: TravelGraph, start: number): void {
  let index = start;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (graph.dist[graph.heap[parent]] <= graph.dist[graph.heap[index]]) return;
    heapSwap(graph, parent, index);
    index = parent;
  }
}

function siftDown(graph: TravelGraph, start: number): void {
  let index = start;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < graph.heapSize && graph.dist[graph.heap[left]] < graph.dist[graph.heap[smallest]]) smallest = left;
    if (right < graph.heapSize && graph.dist[graph.heap[right]] < graph.dist[graph.heap[smallest]]) smallest = right;
    if (smallest === index) return;
    heapSwap(graph, index, smallest);
    index = smallest;
  }
}

function relax(graph: TravelGraph, from: number, to: number, cost: number, kind: number): void {
  const candidate = graph.dist[from] + cost;
  if (candidate >= graph.dist[to]) return;
  graph.dist[to] = candidate;
  graph.prev[to] = from;
  graph.prevKind[to] = kind;
  if (graph.heapPos[to] < 0) {
    graph.heap[graph.heapSize] = to;
    graph.heapPos[to] = graph.heapSize;
    graph.heapSize += 1;
  }
  siftUp(graph, graph.heapPos[to]);
}

function popMin(graph: TravelGraph): number {
  const top = graph.heap[0];
  graph.heapSize -= 1;
  graph.heapPos[top] = -1;
  if (graph.heapSize > 0) {
    const last = graph.heap[graph.heapSize];
    graph.heap[0] = last;
    graph.heapPos[last] = 0;
    siftDown(graph, 0);
  }
  return top;
}

export function solveFrom(graph: TravelGraph, origin: WorldPos, ctx: TravelContext): TravelPlan {
  assertSpeed(ctx);
  const originSlot = graph.slotCount - 1;
  graph.positions[originSlot] = origin;
  for (let slot = 0; slot < graph.slotCount; slot++) {
    graph.dist[slot] = Infinity;
    graph.prev[slot] = -1;
    graph.prevKind[slot] = WALK;
    graph.heapPos[slot] = -1;
  }
  graph.heapSize = 0;
  graph.dist[originSlot] = 0;
  graph.heap[0] = originSlot;
  graph.heapPos[originSlot] = 0;
  graph.heapSize = 1;
  const originMarks = findMarks(graph.places, origin, emptyMarks());
  for (let other = 0; other < originSlot; other++) {
    const straight = straightYards(origin, graph.positions[other]);
    const place = graph.slotPlace[other];
    graph.originYards[other] = place >= 0 ? freeToPlaceYards(graph, originMarks, place, straight, true) : straight;
  }

  while (graph.heapSize > 0) {
    const current = popMin(graph);
    const row = current * graph.slotCount;
    for (let other = 0; other < originSlot; other++) {
      if (other === current) continue;
      const yards = current === originSlot ? graph.originYards[other] : graph.walkYards[row + other];
      if (yards !== Infinity) relax(graph, current, other, yards / ctx.speed, WALK);
    }
    const targets = graph.edgeTo[current];
    if (targets != null) {
      for (let i = 0; i < targets.length; i++) {
        relax(graph, current, targets[i], graph.edgeCost[current][i], graph.edgeKind[current][i]);
      }
    }
    if (current === originSlot && graph.hearthSlot >= 0 && ctx.hearth.ready) {
      relax(graph, current, graph.hearthSlot, CONSTANTS.hearthCastSec.value + ctx.hearthPenaltySec, HEARTH);
    }
  }

  const plan: TravelPlan = {
    times: new Map<number, number>(),
    via: new Map<number, number>(),
    viaKind: new Map<number, number>(),
    nodePos: new Map<number, WorldPos>(),
    originMarks,
  };
  for (let slot = 0; slot < graph.slotCount; slot++) {
    if (graph.dist[slot] === Infinity) continue;
    const id = graph.ids[slot];
    plan.times.set(id, graph.dist[slot]);
    plan.nodePos.set(id, graph.positions[slot]);
    if (slot !== originSlot) {
      plan.via.set(id, graph.ids[graph.prev[slot]]);
      plan.viaKind.set(id, graph.prevKind[slot]);
    }
  }
  return plan;
}

// The nearest slots are chosen once per target by straight distance, whatever the origin; unreachable ones cost Infinity.
function nearestSlots(graph: TravelGraph, target: WorldPos): number[] {
  let slotA = -1;
  let slotB = -1;
  let slotC = -1;
  let distA = Infinity;
  let distB = Infinity;
  let distC = Infinity;
  for (let slot = 0; slot < graph.slotCount - 1; slot++) {
    const pos = graph.positions[slot];
    if (pos.continent !== target.continent) continue;
    const squared = (pos.x - target.x) ** 2 + (pos.y - target.y) ** 2;
    if (squared < distA) {
      slotC = slotB;
      distC = distB;
      slotB = slotA;
      distB = distA;
      slotA = slot;
      distA = squared;
    } else if (squared < distB) {
      slotC = slotB;
      distC = distB;
      slotB = slot;
      distB = squared;
    } else if (squared < distC) {
      slotC = slot;
      distC = squared;
    }
  }
  const slots: number[] = [];
  if (slotA >= 0) slots.push(slotA);
  if (slotB >= 0) slots.push(slotB);
  if (slotC >= 0) slots.push(slotC);
  return slots;
}

// Returns the winning graph node id, DIRECT for a plain walk, UNREACHABLE otherwise; cost goes to graph.bestCost.
function bestApproach(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): number {
  const origin = plan.nodePos.get(ORIGIN_ID);
  let bestId = UNREACHABLE;
  graph.bestCost = Infinity;
  if (origin == null) return bestId;

  let links = graph.nearest.get(target);
  if (links == null) {
    links = { slots: nearestSlots(graph, target), marks: findMarks(graph.places, target, emptyMarks()) };
    graph.nearest.set(target, links);
  }

  const direct = freeToFreeYards(graph, plan.originMarks, links.marks, straightYards(origin, target));
  if (direct !== Infinity) {
    graph.bestCost = direct / ctx.speed;
    bestId = DIRECT;
  }

  for (const slot of links.slots) {
    const id = graph.ids[slot];
    const straight = straightYards(graph.positions[slot], target);
    const place = graph.slotPlace[slot];
    const yards = place >= 0 ? freeToPlaceYards(graph, links.marks, place, straight, false) : straight;
    const cost = (plan.times.get(id) ?? Infinity) + yards / ctx.speed;
    if (cost < graph.bestCost) {
      graph.bestCost = cost;
      bestId = id;
    }
  }
  return bestId;
}

export function travelTime(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): number {
  bestApproach(plan, graph, target, ctx);
  return graph.bestCost;
}

// Ranking penalty included in travelTime when the path starts with the hearthstone; 0 otherwise.
export function hearthPenaltyOf(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): number {
  return firstHop(plan, graph, target, ctx)?.kind === "hearth" ? ctx.hearthPenaltySec : 0;
}

export function firstHop(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): TravelHop | null {
  const approach = bestApproach(plan, graph, target, ctx);
  if (approach === UNREACHABLE) return null;
  const walkTo: TravelHop = { kind: "walk", pos: target, taxiNodeId: null };
  if (approach === DIRECT) return walkTo;

  let departure = ORIGIN_ID;
  let departureKind = WALK;
  let current = approach;
  while (current !== ORIGIN_ID) {
    const parent = plan.via.get(current);
    const kind = plan.viaKind.get(current);
    if (parent == null || kind == null) return null;
    if (kind !== WALK) {
      departure = parent;
      departureKind = kind;
    }
    current = parent;
  }

  const departurePos = plan.nodePos.get(departure);
  if (departurePos == null || departureKind === WALK) return walkTo;
  if (departureKind === TAXI) return { kind: "taxi", pos: departurePos, taxiNodeId: departure };
  if (departureKind === BOAT) return { kind: "boat", pos: departurePos, taxiNodeId: null };
  if (departureKind === PORTAL) return { kind: "portal", pos: departurePos, taxiNodeId: null };
  return { kind: "hearth", pos: departurePos, taxiNodeId: null };
}

// Arrival node of the first contiguous flight of the best path, or null when that path does not start by flying.
export function taxiDestination(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): number | null {
  const approach = bestApproach(plan, graph, target, ctx);
  if (approach === UNREACHABLE || approach === DIRECT) return null;

  const nodes: number[] = [];
  const kinds: number[] = [];
  let current = approach;
  while (current !== ORIGIN_ID) {
    const parent = plan.via.get(current);
    const kind = plan.viaKind.get(current);
    if (parent == null || kind == null) return null;
    nodes.push(current);
    kinds.push(kind);
    current = parent;
  }

  let index = nodes.length - 1;
  while (index >= 0 && kinds[index] === WALK) index -= 1;
  if (index < 0 || kinds[index] !== TAXI) return null;
  while (index > 0 && kinds[index - 1] === TAXI) index -= 1;
  return nodes[index];
}

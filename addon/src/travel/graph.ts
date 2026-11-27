import { CONSTANTS } from "../core/constants";
import { distance, type WorldPos } from "../core/geometry";
import type { TravelData } from "../data/generated/travel";

export interface TravelContext {
  speed: number;
  knownTaxiNodes: Set<number>;
  faction: "A" | "H";
  hearth: { ready: boolean; pos: WorldPos | null };
}

export interface TravelPlan {
  times: Map<number, number>;
  via: Map<number, number>;
  viaKind: Map<number, number>;
  nodePos: Map<number, WorldPos>;
}

export interface TravelHop {
  kind: "walk" | "taxi" | "boat" | "hearth";
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
}

export const ORIGIN_ID = -1;
export const HEARTH_ID = -2;

const DOCK_ID_BASE = 1000000;
const NEAREST_COUNT = 3;
const WALK = 0;
const TAXI = 1;
const BOAT = 2;
const HEARTH = 3;
const DIRECT = -100;
const UNREACHABLE = -101;

function factionAllowed(allowed: "A" | "H" | "AH" | null, faction: "A" | "H"): boolean {
  return allowed == null || allowed === "AH" || allowed === faction;
}

function walkSeconds(yards: number, ctx: TravelContext): number {
  return (yards * CONSTANTS.detourFactor.value) / ctx.speed;
}

function filled(length: number, value: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < length; i++) values.push(value);
  return values;
}

export function buildGraph(data: TravelData, ctx: TravelContext): TravelGraph {
  const ids: number[] = [];
  const positions: WorldPos[] = [];
  const edgeTo: number[][] = [];
  const edgeCost: number[][] = [];
  const edgeKind: number[][] = [];
  const slotOf = new Map<number, number>();
  const dockSlots = new Map<string, number>();

  const addNode = (id: number, pos: WorldPos): number => {
    const slot = ids.length;
    ids.push(id);
    positions.push(pos);
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
    const key = `${pos.continent}:${pos.x}:${pos.y}`;
    const known = dockSlots.get(key);
    if (known != null) return known;
    const slot = addNode(DOCK_ID_BASE + dockSlots.size, pos);
    dockSlots.set(key, slot);
    return slot;
  };

  for (const node of data.taxiNodes) {
    if (ctx.knownTaxiNodes.has(node.id) && factionAllowed(node.faction, ctx.faction)) addNode(node.id, node.pos);
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
  const hearthSlot = ctx.hearth.pos == null ? -1 : addNode(HEARTH_ID, ctx.hearth.pos);

  const originSlot = addNode(ORIGIN_ID, { continent: -1, x: 0, y: 0 });
  const slotCount = originSlot + 1;
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

  while (graph.heapSize > 0) {
    const current = popMin(graph);
    const here = graph.positions[current];
    for (let other = 0; other < originSlot; other++) {
      if (other === current) continue;
      const yards = distance(here, graph.positions[other]);
      if (yards !== Infinity) relax(graph, current, other, walkSeconds(yards, ctx), WALK);
    }
    const targets = graph.edgeTo[current];
    if (targets != null) {
      for (let i = 0; i < targets.length; i++) {
        relax(graph, current, targets[i], graph.edgeCost[current][i], graph.edgeKind[current][i]);
      }
    }
    if (current === originSlot && graph.hearthSlot >= 0 && ctx.hearth.ready) {
      relax(graph, current, graph.hearthSlot, CONSTANTS.hearthCastSec.value, HEARTH);
    }
  }

  const plan: TravelPlan = {
    times: new Map<number, number>(),
    via: new Map<number, number>(),
    viaKind: new Map<number, number>(),
    nodePos: new Map<number, WorldPos>(),
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

// Returns the winning graph node id, DIRECT for a plain walk, UNREACHABLE otherwise; cost goes to graph.bestCost.
function bestApproach(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): number {
  const origin = plan.nodePos.get(ORIGIN_ID);
  let bestId = UNREACHABLE;
  graph.bestCost = Infinity;
  if (origin == null) return bestId;

  const direct = distance(origin, target);
  if (direct !== Infinity) {
    graph.bestCost = walkSeconds(direct, ctx);
    bestId = DIRECT;
  }

  let slotA = -1;
  let slotB = -1;
  let slotC = -1;
  let distA = Infinity;
  let distB = Infinity;
  let distC = Infinity;
  for (let slot = 0; slot < graph.slotCount - 1; slot++) {
    const pos = graph.positions[slot];
    if (pos.continent !== target.continent || !plan.times.has(graph.ids[slot])) continue;
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

  for (let rank = 0; rank < NEAREST_COUNT; rank++) {
    const slot = rank === 0 ? slotA : rank === 1 ? slotB : slotC;
    if (slot < 0) break;
    const id = graph.ids[slot];
    const cost = (plan.times.get(id) ?? Infinity) + walkSeconds(distance(graph.positions[slot], target), ctx);
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
  return { kind: "hearth", pos: departurePos, taxiNodeId: null };
}

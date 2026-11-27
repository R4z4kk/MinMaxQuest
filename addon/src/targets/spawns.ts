import { distance, type WorldPos } from "../core/geometry";

export interface SpawnCluster {
  center: WorldPos;
  points: WorldPos[];
}

export const CLUSTER_RADIUS_YARDS = 60;
export const WAYPOINT_RADIUS_YARDS = 250;
export const WAYPOINT_MAX = 25;

export function clusterSpawns(points: WorldPos[], radius: number): SpawnCluster[] {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const assigned: boolean[] = [];
  const clusters: SpawnCluster[] = [];
  for (let i = 0; i < valid.length; i++) {
    if (assigned[i]) continue;
    assigned[i] = true;
    const seed = valid[i];
    const members: WorldPos[] = [seed];
    for (let j = i + 1; j < valid.length; j++) {
      if (assigned[j] || distance(seed, valid[j]) > radius) continue;
      assigned[j] = true;
      members.push(valid[j]);
    }
    let sx = 0;
    let sy = 0;
    for (const m of members) {
      sx += m.x;
      sy += m.y;
    }
    clusters.push({
      center: { continent: seed.continent, x: sx / members.length, y: sy / members.length },
      points: members,
    });
  }
  return clusters;
}

export function pickCluster(clusters: SpawnCluster[], timeTo: (p: WorldPos) => number): SpawnCluster | null {
  let best: SpawnCluster | null = null;
  let bestTime = Infinity;
  for (const cluster of clusters) {
    const raw = timeTo(cluster.center);
    const time = Number.isNaN(raw) ? Infinity : raw;
    if (best === null || time < bestTime || (time === bestTime && cluster.points.length > best.points.length)) {
      best = cluster;
      bestTime = time;
    }
  }
  return best;
}

// Closest cluster to pos by distance; null when none is on pos's continent.
export function nearestCluster(clusters: SpawnCluster[], pos: WorldPos): SpawnCluster | null {
  const best = pickCluster(clusters, (p) => distance(p, pos));
  return best != null && Number.isFinite(distance(best.center, pos)) ? best : null;
}

export function killLoop(cluster: SpawnCluster, start: WorldPos): WorldPos[] {
  const remaining = cluster.points.slice();
  const order: WorldPos[] = [];
  let from = start;
  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distance(from, remaining[i]);
      if (d < nearestDist) {
        nearest = i;
        nearestDist = d;
      }
    }
    from = remaining[nearest];
    order.push(from);
    remaining.splice(nearest, 1);
  }
  return order;
}

export function nextLoopIndex(loop: WorldPos[], current: number, player: WorldPos, advanceYards: number): number {
  if (loop.length === 0 || current < 0 || current >= loop.length) return 0;
  if (!(distance(player, loop[current]) <= advanceYards)) return current;
  return (current + 1) % loop.length;
}

export function waypointLoop(points: WorldPos[], cluster: SpawnCluster, start: WorldPos, radius: number, max: number): WorldPos[] {
  const near: { pos: WorldPos; d: number }[] = [];
  for (const pos of points) {
    if (pos.continent !== cluster.center.continent) continue;
    const d = distance(cluster.center, pos);
    if (d <= radius) near.push({ pos, d });
  }
  near.sort((a, b) => a.d - b.d);
  const kept: WorldPos[] = [];
  for (let i = 0; i < near.length && i < max; i++) kept.push(near[i].pos);
  return killLoop({ center: cluster.center, points: kept }, start);
}

export function objectiveClusters(points: WorldPos[]): SpawnCluster[] {
  return clusterSpawns(points, CLUSTER_RADIUS_YARDS).map((c) => ({
    center: c.center,
    points: waypointLoop(points, c, c.center, WAYPOINT_RADIUS_YARDS, WAYPOINT_MAX),
  }));
}

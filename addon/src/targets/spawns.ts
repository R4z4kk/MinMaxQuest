import { distance, type WorldPos } from "../core/geometry";

export interface SpawnCluster {
  center: WorldPos;
  points: WorldPos[];
}

export const CLUSTER_RADIUS_YARDS = 60;

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
    const time = timeTo(cluster.center);
    if (best === null || time < bestTime || (time === bestTime && cluster.points.length > best.points.length)) {
      best = cluster;
      bestTime = time;
    }
  }
  return best;
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
  if (distance(player, loop[current]) > advanceYards) return current;
  return (current + 1) % loop.length;
}

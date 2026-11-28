export interface Vec2 {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function length(a: Vec2, b: Vec2): number {
  return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
}

// Andrew's monotone chain; collinear and duplicate points are dropped.
export function convexHull(points: Vec2[]): Vec2[] {
  const sorted = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (sorted.length < 2) return sorted;
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function inflate(polygon: Vec2[], margin: number): Vec2[] {
  let cx = 0;
  let cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  cx /= Math.max(1, polygon.length);
  cy /= Math.max(1, polygon.length);
  return polygon.map((p) => {
    const d = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
    if (d === 0) return { x: p.x, y: p.y };
    return { x: p.x + ((p.x - cx) / d) * margin, y: p.y + ((p.y - cy) / d) * margin };
  });
}

// Dashes along the closed outline, evenly spread per edge; the period grows so at most max are returned.
export function dashSegments(polygon: Vec2[], dash: number, gap: number, max: number): Segment[] {
  const out: Segment[] = [];
  const n = polygon.length;
  if (n < 2 || max <= 0 || dash <= 0) return out;
  let perimeter = 0;
  for (let i = 0; i < n; i++) perimeter += length(polygon[i], polygon[(i + 1) % n]);
  const period = Math.max(dash + gap, perimeter / max);
  const on = dash / (dash + gap);
  for (let i = 0; i < n && out.length < max; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const edge = length(a, b);
    if (edge === 0) continue;
    const count = Math.max(1, Math.round(edge / period));
    const step = 1 / count;
    for (let k = 0; k < count && out.length < max; k++) {
      const t0 = k * step;
      const t1 = t0 + step * on;
      out.push({ x1: a.x + (b.x - a.x) * t0, y1: a.y + (b.y - a.y) * t0, x2: a.x + (b.x - a.x) * t1, y2: a.y + (b.y - a.y) * t1 });
    }
  }
  return out;
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SIZE = 64;
const SAMPLES = 4;
const OUTLINE_PX = 2;
const FILL = [0xc9, 0xa7, 0x5a];
const OUTLINE = [0x11, 0x11, 0x11];
const POLYGON: [number, number][] = [
  [32, 6],
  [56, 56],
  [32, 42],
  [8, 56],
];

function inside(x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = POLYGON.length - 1; i < POLYGON.length; j = i++) {
    const [xi, yi] = POLYGON[i];
    const [xj, yj] = POLYGON[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function edgeDistance(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = POLYGON.length - 1; i < POLYGON.length; j = i++) {
    const [ax, ay] = POLYGON[j];
    const [bx, by] = POLYGON[i];
    const dx = bx - ax;
    const dy = by - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + u * dx), y - (ay + u * dy)));
  }
  return best;
}

const out = Buffer.alloc(18 + SIZE * SIZE * 4);
out[2] = 2;
out.writeUInt16LE(SIZE, 12);
out.writeUInt16LE(SIZE, 14);
out[16] = 32;
out[17] = 0x28;

for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const sum = [0, 0, 0];
    let covered = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const x = px + (sx + 0.5) / SAMPLES;
        const y = py + (sy + 0.5) / SAMPLES;
        const color = inside(x, y) ? FILL : edgeDistance(x, y) <= OUTLINE_PX ? OUTLINE : null;
        if (color == null) continue;
        covered++;
        for (let c = 0; c < 3; c++) sum[c] += color[c];
      }
    }
    const offset = 18 + (py * SIZE + px) * 4;
    if (covered === 0) continue;
    out[offset] = Math.round(sum[2] / covered);
    out[offset + 1] = Math.round(sum[1] / covered);
    out[offset + 2] = Math.round(sum[0] / covered);
    out[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
  }
}

const target = "media/arrow.tga";
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out);

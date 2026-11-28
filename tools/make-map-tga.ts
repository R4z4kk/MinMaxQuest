import { mkdirSync, writeFileSync } from "node:fs";

// Shipped media live outside addon/, which .pkgmeta leaves out of the package.
const OUT_DIR = "media/map";
const SAMPLES = 4;
// Quest text / icon yellow of the Blizzard UI.
const GOLD: Rgb = [0xff, 0xd1, 0x00];
const GOLD_LIGHT: Rgb = [0xff, 0xe8, 0x8a];
const GOLD_DARK: Rgb = [0xb8, 0x86, 0x0b];
const DARK: Rgb = [0x1b, 0x18, 0x30];

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

// Teardrop in a 64 px square: round head, tip at the bottom centre.
const HEAD = { x: 32, y: 22, r: 19 };
const TIP = { x: 32, y: 61 };
const DISC_R = 12;
const OUTLINE_PX = 2;

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const u = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

const tangent = (() => {
  const d = TIP.y - HEAD.y;
  const cos = HEAD.r / d;
  const sin = Math.sqrt(1 - cos * cos);
  return { dx: HEAD.r * sin, y: HEAD.y + HEAD.r * cos };
})();

// Signed distance to the teardrop: negative inside.
function pinDistance(x: number, y: number): number {
  const head = Math.hypot(x - HEAD.x, y - HEAD.y) - HEAD.r;
  const left = { x: HEAD.x - tangent.dx, y: tangent.y };
  const right = { x: HEAD.x + tangent.dx, y: tangent.y };
  const edge = Math.min(
    segmentDistance(x, y, left.x, left.y, TIP.x, TIP.y),
    segmentDistance(x, y, right.x, right.y, TIP.x, TIP.y),
    segmentDistance(x, y, left.x, left.y, right.x, right.y),
  );
  const t = (y - tangent.y) / (TIP.y - tangent.y);
  const insideTri = t >= 0 && t <= 1 && Math.abs(x - HEAD.x) <= tangent.dx * (1 - t);
  return Math.min(head, insideTri ? -edge : edge);
}

function pinColor(x: number, y: number): Rgba | null {
  const d = pinDistance(x, y);
  if (d > OUTLINE_PX) return null;
  if (d > 0) return [...DARK, 1];
  if (Math.hypot(x - HEAD.x, y - HEAD.y) <= DISC_R) return [...DARK, 1];
  const t = clamp01((y - (HEAD.y - HEAD.r)) / (TIP.y - (HEAD.y - HEAD.r)));
  const fill = t < 0.45 ? mix(GOLD_LIGHT, GOLD, t / 0.45) : mix(GOLD, GOLD_DARK, (t - 0.45) / 0.55);
  return [...fill, 1];
}

function badgeColor(x: number, y: number): Rgba | null {
  const r = Math.hypot(x - 16, y - 16);
  if (r > 15) return null;
  if (r > 12.5) return [...GOLD, 1];
  return [...DARK, 1];
}

function supersampled(size: number, color: (x: number, y: number) => Rgba | null): Rgba[] {
  const out: Rgba[] = [];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = color(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES);
          if (c == null) continue;
          for (let i = 0; i < 3; i++) sum[i] += c[i] * c[3];
          sum[3] += c[3];
        }
      }
      const a = sum[3];
      out.push(a === 0 ? [0, 0, 0, 0] : [sum[0] / a, sum[1] / a, sum[2] / a, a / (SAMPLES * SAMPLES)]);
    }
  }
  return out;
}

function analytic(size: number, color: (x: number, y: number) => Rgba): Rgba[] {
  const out: Rgba[] = [];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) out.push(color(px + 0.5, py + 0.5));
  return out;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const shadow = (x: number, y: number): Rgba => [0, 0, 0, 0.55 * (1 - smoothstep(-3, 3, pinDistance(x, y)))];

const halo = (x: number, y: number): Rgba => {
  const r = Math.hypot(x - 32, y - 32);
  return [...GOLD, Math.exp(-((r - 26) * (r - 26)) / (2 * 3 * 3))];
};

const glow = (x: number, y: number): Rgba => {
  const r = Math.hypot(x - 16, y - 16) / 16;
  return [...GOLD, 0.95 * Math.pow(clamp01(1 - r), 1.2)];
};

function tga(size: number, pixels: Rgba[]): Buffer {
  const out = Buffer.alloc(18 + size * size * 4);
  out[2] = 2;
  out.writeUInt16LE(size, 12);
  out.writeUInt16LE(size, 14);
  out[16] = 32;
  out[17] = 0x28;
  pixels.forEach(([r, g, b, a], i) => {
    const offset = 18 + i * 4;
    out[offset] = Math.round(b);
    out[offset + 1] = Math.round(g);
    out[offset + 2] = Math.round(r);
    out[offset + 3] = Math.round(clamp01(a) * 255);
  });
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/pin.tga`, tga(64, supersampled(64, pinColor)));
writeFileSync(`${OUT_DIR}/pin-shadow.tga`, tga(64, analytic(64, shadow)));
writeFileSync(`${OUT_DIR}/halo.tga`, tga(64, analytic(64, halo)));
writeFileSync(`${OUT_DIR}/badge.tga`, tga(32, supersampled(32, badgeColor)));
writeFileSync(`${OUT_DIR}/glow.tga`, tga(32, analytic(32, glow)));

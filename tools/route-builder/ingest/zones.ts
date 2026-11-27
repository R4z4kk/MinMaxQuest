import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import type { WorldPos } from "../../../addon/src/core/geometry";

const ZONES_FILE = join("vendor", "shortest-path-forever", "Zones.lua");
const FILE_LABEL = "Zones.lua";
const PERCENT = 100;

export interface UiMapRect {
  uiMapId: number;
  continent: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  low: number | null;
  high: number | null;
}

const EXTRACT = `
local out = {}
for id, z in pairs(ns.Zones) do
  out[#out + 1] = { id = id, map = z.map, minX = z.minX, minY = z.minY, maxX = z.maxX, maxY = z.maxY, low = z.low, high = z.high }
end
return out
`;

function requiredNumber(value: unknown, field: string, uiMapId: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${FILE_LABEL}: zone ${String(uiMapId)} has no numeric ${field}`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string, uiMapId: unknown): number | null {
  return value == null ? null : requiredNumber(value, field, uiMapId);
}

export async function parseZones(lua: string): Promise<Map<number, UiMapRect>> {
  const engine = await new LuaFactory().createEngine();
  let rows: unknown;
  try {
    await engine.doString("ns = {}");
    engine.global.set("CHUNK_SOURCE", lua);
    engine.global.set("CHUNK_NAME", FILE_LABEL);
    await engine.doString('assert(load(CHUNK_SOURCE, CHUNK_NAME))("SPF", ns)');
    rows = await engine.doString(EXTRACT);
  } catch (error) {
    throw new Error(`${FILE_LABEL}: cannot evaluate (${error instanceof Error ? error.message : String(error)})`);
  } finally {
    engine.global.close();
  }
  if (!Array.isArray(rows)) throw new Error(`${FILE_LABEL}: ns.Zones is not a table`);

  const zones = new Map<number, UiMapRect>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) throw new Error(`${FILE_LABEL}: malformed zone row`);
    const { id, map, minX, minY, maxX, maxY, low, high } = row as Record<string, unknown>;
    const uiMapId = requiredNumber(id, "id", id);
    zones.set(uiMapId, {
      uiMapId,
      continent: requiredNumber(map, "map", uiMapId),
      minX: requiredNumber(minX, "minX", uiMapId),
      minY: requiredNumber(minY, "minY", uiMapId),
      maxX: requiredNumber(maxX, "maxX", uiMapId),
      maxY: requiredNumber(maxY, "maxY", uiMapId),
      low: optionalNumber(low, "low", uiMapId),
      high: optionalNumber(high, "high", uiMapId),
    });
  }
  return zones;
}

export async function loadZones(): Promise<Map<number, UiMapRect>> {
  return parseZones(readFileSync(ZONES_FILE, "utf8"));
}

export function zonePercentToWorld(rect: UiMapRect, x: number, y: number): WorldPos {
  return {
    continent: rect.continent,
    x: rect.maxX - (y / PERCENT) * (rect.maxX - rect.minX),
    y: rect.maxY - (x / PERCENT) * (rect.maxY - rect.minY),
  };
}

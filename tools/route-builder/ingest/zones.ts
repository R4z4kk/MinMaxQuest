import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import type { WorldPos } from "../../../addon/src/core/geometry";
import { WAGO_DB2 } from "../sources";
import { csvNumber, parseCsv } from "./csv";

const ZONES_FILE = join("vendor", "shortest-path-forever", "Zones.lua");
const UI_MAP_ASSIGNMENT_FILE = join("vendor", "wago", `UiMapAssignment-${WAGO_DB2.build}.csv`);
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
  for (const row of rows as unknown[]) {
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

// Full-map assignments only: UiMin (0,0), UiMax (1,1), OrderIndex 0. Region_0..2 = min x,y,z; Region_3..5 = max.
export function parseUiMapAssignment(csv: string, label: string): Map<number, UiMapRect> {
  const rects = new Map<number, UiMapRect>();
  parseCsv(csv, label).forEach((row, i) => {
    const rowNumber = i + 2;
    const n = (column: string): number => csvNumber(row, column, label, rowNumber);
    const fullMap = n("UiMin_0") === 0 && n("UiMin_1") === 0 && n("UiMax_0") === 1 && n("UiMax_1") === 1;
    if (!fullMap || n("OrderIndex") !== 0) return;
    const uiMapId = n("UiMapID");
    if (rects.has(uiMapId)) throw new Error(`${label}: row ${rowNumber} repeats uiMap ${uiMapId}`);
    rects.set(uiMapId, {
      uiMapId,
      continent: n("MapID"),
      minX: n("Region_0"),
      minY: n("Region_1"),
      maxX: n("Region_3"),
      maxY: n("Region_4"),
      low: null,
      high: null,
    });
  });
  return rects;
}

// Zones.lua first; UiMapAssignment only fills uiMaps it lacks (e.g. Zephras Isle 2521).
export async function loadZones(): Promise<Map<number, UiMapRect>> {
  const zones = await parseZones(readFileSync(ZONES_FILE, "utf8"));
  for (const [id, rect] of parseUiMapAssignment(readFileSync(UI_MAP_ASSIGNMENT_FILE, "utf8"), UI_MAP_ASSIGNMENT_FILE)) {
    if (!zones.has(id)) zones.set(id, rect);
  }
  return zones;
}

export function zonePercentToWorld(rect: UiMapRect, x: number, y: number): WorldPos {
  return {
    continent: rect.continent,
    x: rect.maxX - (y / PERCENT) * (rect.maxX - rect.minX),
    y: rect.maxY - (x / PERCENT) * (rect.maxY - rect.minY),
  };
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WAGO_DB2 } from "../sources";
import { csvNumber, parseCsv } from "./csv";

export const INSTANCE_PARTY = 1;
export const INSTANCE_RAID = 2;
export const INSTANCE_PVP = 3;

const AREA_TABLE_FILE = join("vendor", "wago", `AreaTable-${WAGO_DB2.build}.csv`);
const MAP_FILE = join("vendor", "wago", `Map-${WAGO_DB2.build}.csv`);

// areaId -> Map.InstanceType through AreaTable.ContinentID = Map.ID. Some instances (Sunken Temple,
// Blackrock Spire/Depths) have their AreaTable row on the outdoor continent; Map.AreaTableID names them instead.
export function parseInstanceTypes(areaCsv: string, areaLabel: string, mapCsv: string, mapLabel: string): Map<number, number> {
  const typeByMap = new Map<number, number>();
  const instanceTypesByArea = new Map<number, Set<number>>();
  parseCsv(mapCsv, mapLabel).forEach((row, i) => {
    const type = csvNumber(row, "InstanceType", mapLabel, i + 2);
    typeByMap.set(csvNumber(row, "ID", mapLabel, i + 2), type);
    const area = csvNumber(row, "AreaTableID", mapLabel, i + 2);
    if (area !== 0 && type !== 0) instanceTypesByArea.set(area, (instanceTypesByArea.get(area) ?? new Set()).add(type));
  });
  const typeByArea = new Map<number, number>();
  parseCsv(areaCsv, areaLabel).forEach((row, i) => {
    const type = typeByMap.get(csvNumber(row, "ContinentID", areaLabel, i + 2));
    if (type != null) typeByArea.set(csvNumber(row, "ID", areaLabel, i + 2), type);
  });
  for (const [area, types] of instanceTypesByArea) {
    if (types.size > 1) throw new Error(`${mapLabel}: area ${area} has instance types ${[...types].join(", ")}`);
    if ((typeByArea.get(area) ?? 0) === 0) typeByArea.set(area, [...types][0]);
  }
  return typeByArea;
}

export function loadInstanceTypes(): Map<number, number> {
  return parseInstanceTypes(readFileSync(AREA_TABLE_FILE, "utf8"), AREA_TABLE_FILE, readFileSync(MAP_FILE, "utf8"), MAP_FILE);
}

import type { WorldPos } from "../../addon/src/core/geometry";
import { parseSqlTable } from "../route-builder/ingest/cmangos";
import { csvNumber, parseCsv } from "../route-builder/ingest/csv";

// Instance exits have no AreaTrigger row on the open world: they are reported, never imported.
export const MIN_PORTAL_YARDS = 200;

const TABLE = "areatrigger_teleport";
const COLUMNS = [
  "id",
  "name",
  "required_level",
  "required_item",
  "required_item2",
  "required_quest_done",
  "target_map",
  "target_position_x",
  "target_position_y",
  "condition_id",
];
const REQUIREMENTS = ["required_level", "required_item", "required_item2", "required_quest_done", "condition_id"];
// cmangos 943 "Leap of Faith - End of fall" is a safety net under a cliff, not a way to travel.
const NOT_TRAVEL = new Set([943]);
const OPEN_WORLD = 0;

export interface Portal {
  name: string;
  from: WorldPos;
  to: WorldPos;
}

export interface PortalImport {
  portals: Portal[];
  candidates: number;
  noTrigger: number[];
}

export interface PortalSources {
  cmangosSql: string;
  cmangosLabel: string;
  areaTriggerCsv: string;
  areaTriggerLabel: string;
  mapCsv: string;
  mapLabel: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function openWorldMaps(mapCsv: string, label: string): Set<number> {
  const maps = new Set<number>();
  parseCsv(mapCsv, label).forEach((row, i) => {
    if (csvNumber(row, "InstanceType", label, i + 2) === OPEN_WORLD) maps.add(csvNumber(row, "ID", label, i + 2));
  });
  return maps;
}

function triggerPositions(csv: string, label: string): Map<number, { continent: number; x: number; y: number }> {
  const triggers = new Map<number, { continent: number; x: number; y: number }>();
  parseCsv(csv, label).forEach((row, i) => {
    const at = i + 2;
    triggers.set(csvNumber(row, "ID", label, at), {
      continent: csvNumber(row, "ContinentID", label, at),
      x: csvNumber(row, "Pos_0", label, at),
      y: csvNumber(row, "Pos_1", label, at),
    });
  });
  return triggers;
}

export function importPortals(sources: PortalSources): PortalImport {
  const openWorld = openWorldMaps(sources.mapCsv, sources.mapLabel);
  const triggers = triggerPositions(sources.areaTriggerCsv, sources.areaTriggerLabel);
  const rows = parseSqlTable(sources.cmangosSql, sources.cmangosLabel, TABLE, COLUMNS);
  const found: { id: number; portal: Portal }[] = [];
  const noTrigger: number[] = [];
  let candidates = 0;
  for (const row of rows) {
    const id = row.int("id");
    if (NOT_TRAVEL.has(id)) continue;
    const targetMap = row.int("target_map");
    if (!openWorld.has(targetMap) || REQUIREMENTS.some((column) => row.int(column) !== 0)) continue;
    candidates++;
    const trigger = triggers.get(id);
    if (trigger == null) {
      noTrigger.push(id);
      continue;
    }
    if (trigger.continent !== targetMap) continue;
    const x = row.value("target_position_x");
    const y = row.value("target_position_y");
    const name = row.value("name");
    if (typeof x !== "number" || typeof y !== "number") throw new Error(`${row.where}: ${TABLE} ${id} has no numeric target position`);
    if (typeof name !== "string" || name === "") throw new Error(`${row.where}: ${TABLE} ${id} has no name`);
    if (Math.hypot(x - trigger.x, y - trigger.y) <= MIN_PORTAL_YARDS) continue;
    found.push({
      id,
      portal: {
        name,
        from: { continent: trigger.continent, x: round1(trigger.x), y: round1(trigger.y) },
        to: { continent: targetMap, x: round1(x), y: round1(y) },
      },
    });
  }
  found.sort((a, b) => a.id - b.id);
  return { portals: found.map((entry) => entry.portal), candidates, noTrigger };
}

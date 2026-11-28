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

// SPF's portal sources are AreaTrigger positions: a trigger within this distance is the same one.
const SAME_TRIGGER_YARDS = 1;

export interface Portal {
  name: string;
  from: WorldPos;
  to: WorldPos;
  faction?: "A" | "H";
}

export interface PortalImport {
  portals: Portal[];
  ids: number[];
  triggers: Map<number, WorldPos>;
  candidates: number;
  noTrigger: number[];
}

export interface SpfPortal {
  name: string;
  faction: string;
  from: { map: number; x: number; y: number };
  to: { map: number; x: number; y: number };
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

function triggerPositions(csv: string, label: string): Map<number, WorldPos> {
  const triggers = new Map<number, WorldPos>();
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
  return { portals: found.map((entry) => entry.portal), ids: found.map((entry) => entry.id), triggers, candidates, noTrigger };
}

function spfFaction(label: string): "A" | "H" | null {
  if (label === "Alliance") return "A";
  if (label === "Horde") return "H";
  if (label === "") return null;
  throw new Error(`gen-travel: unknown SPF portal faction "${label}"`);
}

function triggerAt(triggers: Map<number, WorldPos>, at: SpfPortal["from"]): number | null {
  for (const [id, trigger] of triggers) {
    if (trigger.continent === at.map && Math.hypot(trigger.x - at.x, trigger.y - at.y) <= SAME_TRIGGER_YARDS) return id;
  }
  return null;
}

// SPF's portals replace the cmangos import entry of the same AreaTrigger; both ends must be on maps the graph models.
export function mergePortals(spf: SpfPortal[], imported: PortalImport, modelled: Set<number>): { portals: Portal[]; dropped: string[] } {
  const byTrigger = new Map<number, Portal>();
  imported.portals.forEach((portal, i) => byTrigger.set(imported.ids[i], portal));
  const extra: Portal[] = [];
  const dropped: string[] = [];
  for (const entry of spf) {
    const portal: Portal = {
      name: entry.name,
      from: { continent: entry.from.map, x: round1(entry.from.x), y: round1(entry.from.y) },
      to: { continent: entry.to.map, x: round1(entry.to.x), y: round1(entry.to.y) },
    };
    const faction = spfFaction(entry.faction);
    if (faction != null) portal.faction = faction;
    const trigger = triggerAt(imported.triggers, entry.from);
    if (trigger != null) byTrigger.delete(trigger);
    if (!modelled.has(entry.from.map) || !modelled.has(entry.to.map)) {
      dropped.push(`${entry.name} (${entry.from.map} -> ${entry.to.map})`);
      continue;
    }
    if (trigger == null) extra.push(portal);
    else byTrigger.set(trigger, portal);
  }
  const sorted = [...byTrigger.entries()].sort(([a], [b]) => a - b).map(([, portal]) => portal);
  return { portals: [...sorted, ...extra], dropped };
}

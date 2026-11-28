import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import { fetchCmangos, readSqlFile } from "../route-builder/ingest/cmangos";
import { CMANGOS_CLASSIC_DB, WAGO_DB2 } from "../route-builder/sources";
import { importPortals, mergePortals, type SpfPortal } from "./portals";
import { importWalks, type OurPlace, type SpfPair, type SpfPlace } from "./walks";
import type { WorldPos } from "../../addon/src/core/geometry";
import type { TravelData } from "../../addon/src/data/generated/travel";

const VENDOR_DIR = "vendor/shortest-path-forever";
const WAGO_DIR = "vendor/wago";
const OUTPUT_FILE = "addon/src/data/generated/travel.ts";
const LUA_FILES = ["Taxi.lua", "Routes.lua", "Transports.lua", "Walks.lua", "Portals.lua"];
const TRANSPORT_KINDS = ["boat", "zeppelin", "tram"];
const MS_PER_SECOND = 1000;
const VALID_DAYS = 30;
const MS_PER_DAY = 86400000;

const EXTRACT = `
local out = { nodes = {}, paths = {}, docks = {}, routes = {}, places = {}, walks = {}, portals = {} }
for id, n in pairs(ns.TaxiNodes) do
  out.nodes[#out.nodes + 1] = { id, n.map, n.x, n.y, n.name, n.faction or "" }
end
for _, p in ipairs(ns.TaxiPaths) do
  out.paths[#out.paths + 1] = { p.from, p.to, p.seconds }
end
for id, d in pairs(ns.Docks) do
  local w = d.pin or d.walk or d
  out.docks[#out.docks + 1] = { id, w.map, w.x, w.y }
end
for id, r in pairs(ns.Routes) do
  local stops = {}
  for _, s in ipairs(r.stops) do stops[#stops + 1] = { s.dock, s.arrive, s.depart } end
  out.routes[#out.routes + 1] = { id, r.kind, r.faction or "", r.period, stops }
end
for map, places in pairs(ns.WalkPlaces) do
  for id, p in pairs(places) do out.places[#out.places + 1] = { map, id, p[1], p[2] } end
end
for map, walks in pairs(ns.Walks) do
  for key, w in pairs(walks) do
    local back = w[3]
    if back == nil then back = w[1] end
    out.walks[#out.walks + 1] = { map, key, w[1], back }
  end
end
for _, p in ipairs(ns.Portals) do
  out.portals[#out.portals + 1] = { p.name, p.faction or "", p.from.map, p.from.x, p.from.y, p.to.map, p.to.x, p.to.y }
end
return out
`;

type Row = unknown[];

function asRows(value: unknown, what: string): Row[] {
  if (!Array.isArray(value)) throw new Error(`gen-travel: ${what} is not a list`);
  return value as Row[];
}

function num(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`gen-travel: bad number in ${what}`);
  return value;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`gen-travel: bad string in ${what}`);
  return value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function worldPos(continent: unknown, x: unknown, y: unknown, what: string): WorldPos {
  return { continent: num(continent, what), x: round1(num(x, what)), y: round1(num(y, what)) };
}

function factionOf(label: string): "A" | "H" | "AH" {
  if (label === "Alliance") return "A";
  if (label === "Horde") return "H";
  if (label === "") return "AH";
  throw new Error(`gen-travel: unknown faction "${label}"`);
}

function readHeaderBuild(taxiSource: string): string {
  const match = /CSV build ([\d.]+)/.exec(taxiSource);
  if (match == null) throw new Error("gen-travel: build not found in Taxi.lua header");
  return match[1];
}

function addDays(isoDate: string, days: number): string {
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new Error(`gen-travel: bad date ${isoDate}`);
  return new Date(time + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function readVersion(versionText: string): { version: string; commit: string; verifiedOn: string } {
  const version = /^v?([\d.]+)/.exec(versionText);
  const commit = /commit ([0-9a-f]{40})/.exec(versionText);
  const date = /retrieved (\d{4}-\d{2}-\d{2})/.exec(versionText);
  if (version == null || commit == null || date == null) throw new Error("gen-travel: unreadable VERSION file");
  return { version: version[1], commit: commit[1], verifiedOn: date[1] };
}

function walkCost(value: unknown, what: string): number | false {
  return value === false ? false : num(value, what);
}

function posKey(pos: WorldPos): string {
  return `${pos.continent}:${pos.x}:${pos.y}`;
}

function seconds(milliseconds: number): number {
  return Math.round(milliseconds / MS_PER_SECOND);
}

export async function generateTravel(vendorDir: string): Promise<TravelData> {
  const taxiSource = readFileSync(join(vendorDir, "Taxi.lua"), "utf8");
  const { version, commit, verifiedOn } = readVersion(readFileSync(join(vendorDir, "VERSION"), "utf8"));
  const lua = await new LuaFactory().createEngine();
  let extracted: Record<string, unknown>;
  try {
    await lua.doString("ns = {}");
    for (const file of LUA_FILES) {
      lua.global.set("CHUNK_SOURCE", readFileSync(join(vendorDir, file), "utf8"));
      lua.global.set("CHUNK_NAME", file);
      await lua.doString('assert(load(CHUNK_SOURCE, CHUNK_NAME))("SPF", ns)');
    }
    extracted = (await lua.doString(EXTRACT)) as Record<string, unknown>;
  } finally {
    lua.global.close();
  }

  const taxiNodes: TravelData["taxiNodes"] = asRows(extracted.nodes, "nodes")
    .map((row) => ({
      id: num(row[0], "node id"),
      name: str(row[4], "node name"),
      pos: worldPos(row[1], row[2], row[3], "node position"),
      faction: factionOf(str(row[5], "node faction")),
    }))
    .sort((a, b) => a.id - b.id);

  const nodeIds = new Set(taxiNodes.map((node) => node.id));
  const taxiEdges: TravelData["taxiEdges"] = asRows(extracted.paths, "paths").map((row) => {
    const edge = { from: num(row[0], "path from"), to: num(row[1], "path to"), seconds: num(row[2], "path seconds") };
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.seconds <= 0) {
      throw new Error(`gen-travel: invalid taxi edge ${edge.from} -> ${edge.to}`);
    }
    return edge;
  });

  const docks = new Map<number, WorldPos>();
  for (const row of asRows(extracted.docks, "docks")) {
    docks.set(num(row[0], "dock id"), worldPos(row[1], row[2], row[3], "dock position"));
  }

  const transports: TravelData["transports"] = [];
  const routes = asRows(extracted.routes, "routes").sort((a, b) => num(a[0], "route id") - num(b[0], "route id"));
  for (const route of routes) {
    if (!TRANSPORT_KINDS.includes(str(route[1], "route kind"))) continue;
    const label = str(route[2], "route faction");
    const periodMs = num(route[3], "route period");
    const routeFaction = factionOf(label);
    if (periodMs <= 0) throw new Error(`gen-travel: invalid period on route ${String(route[0])}`);
    const stops = asRows(route[4], "route stops");
    for (let i = 0; i < stops.length; i++) {
      const current = stops[i];
      const next = stops[(i + 1) % stops.length];
      const ride = (((num(next[1], "arrive") - num(current[2], "depart")) % periodMs) + periodMs) % periodMs;
      const fromDock = docks.get(num(current[0], "dock"));
      const toDock = docks.get(num(next[0], "dock"));
      if (fromDock == null || toDock == null) throw new Error(`gen-travel: unknown dock on route ${String(route[0])}`);
      if (seconds(ride) <= 0) throw new Error(`gen-travel: invalid ride on route ${String(route[0])}`);
      const leg: TravelData["transports"][number] = {
        fromDock,
        toDock,
        seconds: seconds(ride),
        periodSec: seconds(periodMs),
      };
      if (routeFaction !== "AH") leg.faction = routeFaction;
      transports.push(leg);
    }
  }

  const cmangosFile = fetchCmangos();
  const areaTriggerFile = join(WAGO_DIR, `AreaTrigger-${WAGO_DB2.build}.csv`);
  const mapFile = join(WAGO_DIR, `Map-${WAGO_DB2.build}.csv`);
  const imported = importPortals({
    cmangosSql: readSqlFile(cmangosFile),
    cmangosLabel: cmangosFile,
    areaTriggerCsv: readFileSync(areaTriggerFile, "utf8"),
    areaTriggerLabel: areaTriggerFile,
    mapCsv: readFileSync(mapFile, "utf8"),
    mapLabel: mapFile,
  });

  console.log(
    `gen-travel: cmangos: ${imported.portals.length} portals kept of ${imported.candidates} free open-world teleports (${imported.noTrigger.length} without a wago trigger row: ${imported.noTrigger.join(",")})`,
  );

  const modelled = new Set<number>(taxiNodes.map((node) => node.pos.continent));
  for (const dock of docks.values()) modelled.add(dock.continent);
  const spfPortals: SpfPortal[] = asRows(extracted.portals, "portals").map((row) => ({
    name: str(row[0], "portal name"),
    faction: str(row[1], "portal faction"),
    from: { map: num(row[2], "portal from"), x: num(row[3], "portal from"), y: num(row[4], "portal from") },
    to: { map: num(row[5], "portal to"), x: num(row[6], "portal to"), y: num(row[7], "portal to") },
  }));
  const { portals, dropped } = mergePortals(spfPortals, imported, modelled);
  console.log(`gen-travel: ${portals.length} portals (${portals.map((portal) => portal.name).join(", ")}); dropped, map not modelled: ${dropped.join(", ")}`);

  const points = new Map<string, WorldPos>();
  for (const leg of transports) for (const dock of [leg.fromDock, leg.toDock]) points.set(posKey(dock), dock);
  for (const portal of portals) for (const end of [portal.from, portal.to]) points.set(posKey(end), end);
  const ours: OurPlace[] = [
    ...taxiNodes.map((node) => ({ pos: node.pos, taxiId: node.id })),
    ...[...points.values()]
      .sort((a, b) => a.continent - b.continent || a.x - b.x || a.y - b.y)
      .map((pos) => ({ pos, taxiId: null })),
  ];
  const spfPlaces: SpfPlace[] = asRows(extracted.places, "walk places").map((row) => ({
    map: num(row[0], "walk place map"),
    id: str(row[1], "walk place id"),
    x: num(row[2], "walk place x"),
    y: num(row[3], "walk place y"),
  }));
  const spfPairs: SpfPair[] = asRows(extracted.walks, "walks").map((row) => ({
    map: num(row[0], "walk map"),
    key: str(row[1], "walk key"),
    there: walkCost(row[2], "walk cost"),
    back: walkCost(row[3], "walk cost"),
  }));
  const walks = importWalks(spfPlaces, spfPairs, ours);
  console.log(
    `gen-travel: ${walks.walkPlaces.length} walk places, ${walks.walks.length / 4} baked pairs; no SPF place for ${walks.unbaked.map(posKey).join(", ") || "none"}; SPF places not modelled: ${JSON.stringify(walks.unmodelled)}; unknown kinds: ${walks.unknownKinds.join(", ") || "none"}`,
  );

  return {
    source: {
      name: "Shortest Path Forever",
      version,
      commit,
      build: readHeaderBuild(taxiSource),
      cmangosCommit: CMANGOS_CLASSIC_DB.commit,
      wagoBuild: WAGO_DB2.build,
      verifiedOn,
      expiresOn: [addDays(verifiedOn, VALID_DAYS), CMANGOS_CLASSIC_DB.expiresOn, WAGO_DB2.expiresOn].sort()[0],
    },
    taxiNodes,
    taxiEdges,
    transports,
    portals,
    walkPlaces: walks.walkPlaces,
    walks: walks.walks,
  };
}

const INTERFACE_TEXT = `import type { WorldPos } from "../../core/geometry";

export interface TravelData {
  source: {
    name: "Shortest Path Forever";
    version: string;
    commit: string;
    build: string;
    cmangosCommit: string;
    wagoBuild: string;
    verifiedOn: string;
    expiresOn: string;
  };
  taxiNodes: { id: number; name: string; pos: WorldPos; faction: "A" | "H" | "AH" }[];
  taxiEdges: { from: number; to: number; seconds: number }[];
  transports: {
    fromDock: WorldPos;
    toDock: WorldPos;
    seconds: number;
    periodSec: number;
    faction?: "A" | "H";
  }[];
  portals: { name: string; from: WorldPos; to: WorldPos; faction?: "A" | "H" }[];
  // Places with baked walking yards (Shortest Path Forever Walks.lua): taxi nodes, docks and portal ends, at our positions.
  walkPlaces: WorldPos[];
  // [from place, to place, yards there, yards back] per walkable pair of the same map; -1 on a blocked side.
  walks: number[];
}
`;

function renderList(items: unknown[]): string {
  return `[\n${items.map((item) => `    ${JSON.stringify(item)},`).join("\n")}\n  ]`;
}

function renderWalks(walks: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < walks.length; i += 4) lines.push(`    ${walks.slice(i, i + 4).join(", ")},`);
  return `[\n${lines.join("\n")}\n  ]`;
}

export function renderTravel(data: TravelData): string {
  return `// Generated by tools/gen-travel — do not edit
${INTERFACE_TEXT}
export const TRAVEL: TravelData = {
  source: ${JSON.stringify(data.source)},
  taxiNodes: ${renderList(data.taxiNodes)},
  taxiEdges: ${renderList(data.taxiEdges)},
  transports: ${renderList(data.transports)},
  portals: ${renderList(data.portals)},
  walkPlaces: ${renderList(data.walkPlaces)},
  walks: ${renderWalks(data.walks)},
};
`;
}

async function main(): Promise<void> {
  const data = await generateTravel(VENDOR_DIR);
  writeFileSync(OUTPUT_FILE, renderTravel(data));
  console.log(
    `gen-travel: ${data.taxiNodes.length} nodes, ${data.taxiEdges.length} edges, ${data.transports.length} transport legs, ${data.portals.length} portals, ${data.walks.length / 4} baked walks -> ${OUTPUT_FILE}`,
  );
}

if (process.argv[1]?.endsWith("main.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

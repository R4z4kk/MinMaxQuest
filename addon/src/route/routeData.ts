import { maskAllows } from "../quests/availability";
import { decodeSteps, type EmittedStep } from "./format";

export interface RouteOptions { elites: boolean; dungeons: boolean; minLevelGap: number | null }

export interface FactionRoutes {
  faction: "A" | "H";
  meta: { build: string; questieDb: string; generatedOn: string; constants: Record<string, number> };
  segmentRaces: Record<string, number>;
  segments: Record<string, Record<string, string>>;
  trunk: Record<string, string>;
  returnBlocks: Record<number, string>;
}

export type RoutesResult = { ok: true; routes: FactionRoutes } | { ok: false; message: string };

export interface CharacterRoute { key: string; segmentKey: string | null; steps: EmittedStep[]; segmentLength: number }

const FACTION_TABLES = { A: "Alliance", H: "Horde" };
const OTHER_FACTION = { A: "H", H: "A" } as const;

export function variantKey(o: RouteOptions): string {
  return "e" + (o.elites ? 1 : 0) + "d" + (o.dungeons ? 1 : 0) + "x" + (o.minLevelGap ?? 0);
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringTable(value: unknown): Record<string, string> | null {
  if (!isTable(value)) return null;
  for (const key of Object.keys(value)) if (typeof value[key] !== "string") return null;
  return value as Record<string, string>;
}

function numberTable(value: unknown): Record<string, number> | null {
  if (!isTable(value)) return null;
  for (const key of Object.keys(value)) if (typeof value[key] !== "number") return null;
  return value as Record<string, number>;
}

function parseRoutes(faction: "A" | "H", raw: unknown): RoutesResult {
  const name = FACTION_TABLES[faction];
  const fail = (what: string): RoutesResult => ({ ok: false, message: "Route data for " + name + ": " + what });
  if (!isTable(raw)) return fail("table missing");
  const meta = raw.meta;
  if (!isTable(meta)) return fail("meta missing");
  const constants = numberTable(meta.constants);
  if (constants == null) return fail("meta.constants invalid");
  if (typeof meta.build !== "string" || typeof meta.questieDb !== "string" || typeof meta.generatedOn !== "string") return fail("meta fields invalid");
  const segmentRaces = numberTable(raw.segmentRaces);
  if (segmentRaces == null) return fail("segmentRaces invalid");
  const trunk = stringTable(raw.trunk);
  if (trunk == null) return fail("trunk missing or invalid");
  const rawSegments = raw.segments;
  if (!isTable(rawSegments)) return fail("segments invalid");
  const segments: Record<string, Record<string, string>> = {};
  for (const key of Object.keys(rawSegments)) {
    const variants = stringTable(rawSegments[key]);
    if (variants == null) return fail("segment " + key + " invalid");
    segments[key] = variants;
  }
  const returnBlocks = stringTable(raw.returnBlocks);
  if (returnBlocks == null) return fail("returnBlocks invalid");
  return {
    ok: true,
    routes: {
      faction,
      meta: { build: meta.build, questieDb: meta.questieDb, generatedOn: meta.generatedOn, constants },
      segmentRaces,
      segments,
      trunk,
      returnBlocks: returnBlocks as unknown as Record<number, string>,
    },
  };
}

export function readRoutes(faction: "A" | "H"): RoutesResult {
  const all = (globalThis as unknown as Record<string, unknown>).MinMaxQuestRoutes;
  if (!isTable(all)) return { ok: false, message: "Route data missing: MinMaxQuestRoutes is not loaded (" + FACTION_TABLES[faction] + ")" };
  // The faction never changes in a session: let the garbage collector reclaim the other one.
  delete all[FACTION_TABLES[OTHER_FACTION[faction]]];
  return parseRoutes(faction, all[FACTION_TABLES[faction]]);
}

function decode(r: FactionRoutes, variant: string, text: string | null, what: string): EmittedStep[] {
  if (text == null) throw new Error("Route data " + r.faction + " " + variant + ": " + what + " missing");
  try {
    return decodeSteps(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error("Route data " + r.faction + " " + variant + " (" + what + "): " + message);
  }
}

function pickSegment(r: FactionRoutes, raceMask: number, level: number, segmentEndLevel: number): string | null {
  if (level >= segmentEndLevel) return null;
  const keys = Object.keys(r.segmentRaces).sort();
  for (const key of keys) if (maskAllows(r.segmentRaces[key], raceMask)) return key;
  return null;
}

function forRace(steps: EmittedStep[], raceMask: number): EmittedStep[] {
  return steps.filter((s) => s.races == null || maskAllows(s.races, raceMask));
}

let cachedRoutes: FactionRoutes | null = null;
let cached: CharacterRoute | null = null;

export function composeRoute(r: FactionRoutes, o: RouteOptions, raceMask: number, level: number, segmentEndLevel: number): CharacterRoute {
  const variant = variantKey(o);
  const segmentKey = pickSegment(r, raceMask, level, segmentEndLevel);
  const key = variant + ":" + (segmentKey ?? "") + ":" + raceMask;
  if (cached != null && cachedRoutes === r && cached.key === key) return cached;
  const segmentSteps = segmentKey == null ? [] : forRace(decode(r, variant, r.segments[segmentKey][variant] ?? null, "segment " + segmentKey), raceMask);
  const trunkSteps = forRace(decode(r, variant, r.trunk[variant] ?? null, "trunk"), raceMask);
  const route: CharacterRoute = { key, segmentKey, steps: [...segmentSteps, ...trunkSteps], segmentLength: segmentSteps.length };
  cachedRoutes = r;
  cached = route;
  return route;
}

export function decodeReturnBlock(r: FactionRoutes, dungeonAreaId: number): EmittedStep[] {
  const text = r.returnBlocks[dungeonAreaId] ?? null;
  if (text == null) return [];
  return decode(r, "returnBlock", text, "dungeon area " + dungeonAreaId);
}

export type LanguageSetting = "auto" | "enUS" | "frFR";

export interface AccountDb {
  version: 1;
  locale: LanguageSetting;
}

export interface CharDb {
  version: 1;
  tab: "quest" | "access" | "completion";
  activeMode: "quest" | "completion";
  window: { x: number; y: number } | null;
  arrow: { x: number; y: number; locked: boolean } | null;
  itemButton: { x: number; y: number } | null;
  hidden: boolean;
  completion: {
    mode: "proximity" | "zone" | "log";
    zoneAreaId: number | null;
    showTrivial: boolean;
    showElite: boolean;
  };
  minLevelGap: number | null;
  routeElites: boolean;
  routeDungeons: boolean;
  autoFly: boolean;
  nativeWaypoint: boolean;
  pinnedQuestId: number | null;
  skippedQuests: number[];
  trackedChains: string[];
  knownTaxiNodes: number[];
  taxiNames: { [nodeId: number]: string };
  expandedChain: string | null;
  hearthPos: { continent: number; x: number; y: number } | null;
  route: { variant: string | null; startIndex: number; skippedSteps: number[] };
  dungeonReturns: number[];
}

export const ACCOUNT_DEFAULTS: AccountDb = { version: 1, locale: "auto" };

export const CHAR_DEFAULTS: CharDb = {
  version: 1,
  tab: "quest",
  activeMode: "quest",
  window: null,
  arrow: null,
  itemButton: null,
  hidden: false,
  completion: { mode: "proximity", zoneAreaId: null, showTrivial: true, showElite: true },
  minLevelGap: null,
  routeElites: false,
  routeDungeons: false,
  autoFly: true,
  nativeWaypoint: true,
  pinnedQuestId: null,
  skippedQuests: [],
  trackedChains: [],
  knownTaxiNodes: [],
  taxiNames: {},
  expandedChain: null,
  hearthPos: null,
  route: { variant: null, startIndex: 0, skippedSteps: [] },
  dungeonReturns: [],
};

// Sample values describing the shape of fields whose default is null.
const CHAR_SHAPES = {
  window: { x: 0, y: 0 },
  arrow: { x: 0, y: 0, locked: false },
  itemButton: { x: 0, y: 0 },
  completion: { zoneAreaId: 0 },
  minLevelGap: 0,
  pinnedQuestId: 0,
  expandedChain: "",
  hearthPos: { continent: 0, x: 0, y: 0 },
  route: { variant: "" },
};

type Dict = Record<string, unknown>;

function merge(saved: unknown, defaults: unknown, shape: unknown): unknown {
  if (defaults == null) {
    if (saved == null) return null;
    if (shape == null) return saved;
    return typeof saved === typeof shape ? merge(saved, shape, null) : null;
  }
  if (typeof defaults !== "object") return typeof saved === typeof defaults ? saved : defaults;
  const defs = defaults as Dict;
  const keys = Object.keys(defs);
  const source: Dict | null = typeof saved === "object" && saved != null ? (saved as Dict) : null;
  if (keys.length === 0) return source ?? (Array.isArray(defaults) ? [] : {});
  const shapes: Dict = typeof shape === "object" && shape != null ? (shape as Dict) : {};
  // Lua drops null-valued keys, so nullable fields are enumerated from the shape too.
  for (const key of Object.keys(shapes)) if (defs[key] == null) keys.push(key);
  const out: Dict = {};
  for (const key of keys) out[key] = merge(source == null ? null : source[key], defs[key], shapes[key]);
  return out;
}

// Fills missing keys, replaces wrong primitive types, drops unknown keys.
// Empty-object defaults act as free-form containers (arrays, maps): saved tables are kept as is.
export function withDefaults<T>(saved: unknown, defaults: T, shape: unknown = null): T {
  return merge(saved, defaults, shape) as T;
}

function isIndex(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && Math.floor(value) === value;
}

function isIndexList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const item of value) if (!isIndex(item)) return false;
  return true;
}

export function loadCharDb(saved: unknown): CharDb {
  const db = withDefaults(saved, CHAR_DEFAULTS, CHAR_SHAPES);
  if (db.tab !== "quest" && db.tab !== "access" && db.tab !== "completion") db.tab = CHAR_DEFAULTS.tab;
  if (db.activeMode !== "quest" && db.activeMode !== "completion") db.activeMode = CHAR_DEFAULTS.activeMode;
  if (!isIndex(db.route.startIndex)) db.route.startIndex = 0;
  if (!isIndexList(db.route.skippedSteps)) db.route.skippedSteps = [];
  if (!isIndexList(db.dungeonReturns)) db.dungeonReturns = [];
  if (db.completion.mode !== "proximity" && db.completion.mode !== "zone" && db.completion.mode !== "log") {
    db.completion.mode = CHAR_DEFAULTS.completion.mode;
  }
  return db;
}

export function loadAccountDb(saved: unknown): AccountDb {
  const db = withDefaults(saved, ACCOUNT_DEFAULTS);
  if (db.locale !== "auto" && db.locale !== "enUS" && db.locale !== "frFR") db.locale = ACCOUNT_DEFAULTS.locale;
  return db;
}

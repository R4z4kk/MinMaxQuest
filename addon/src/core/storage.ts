export interface AccountDb {
  version: 1;
}

export interface CharDb {
  version: 1;
  tab: "quest" | "access" | "completion";
  window: { x: number; y: number } | null;
  arrow: { x: number; y: number; locked: boolean } | null;
  completion: {
    mode: "proximity" | "zone";
    zoneAreaId: number | null;
    showTrivial: boolean;
    showElite: boolean;
  };
  minLevelGap: number | null;
  autoFly: boolean;
  nativeWaypoint: boolean;
  pinnedQuestId: number | null;
  skippedQuests: number[];
  trackedChains: string[];
  knownTaxiNodes: number[];
  taxiNames: { [nodeId: number]: string };
  expandedChain: string | null;
}

export const ACCOUNT_DEFAULTS: AccountDb = { version: 1 };

export const CHAR_DEFAULTS: CharDb = {
  version: 1,
  tab: "quest",
  window: null,
  arrow: null,
  completion: { mode: "proximity", zoneAreaId: null, showTrivial: true, showElite: true },
  minLevelGap: null,
  autoFly: true,
  nativeWaypoint: true,
  pinnedQuestId: null,
  skippedQuests: [],
  trackedChains: [],
  knownTaxiNodes: [],
  taxiNames: {},
  expandedChain: null,
};

// Sample values describing the shape of fields whose default is null.
const CHAR_SHAPES = {
  window: { x: 0, y: 0 },
  arrow: { x: 0, y: 0, locked: false },
  completion: { zoneAreaId: 0 },
  minLevelGap: 0,
  pinnedQuestId: 0,
  expandedChain: "",
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
  const out: Dict = {};
  for (const key of keys) out[key] = merge(source == null ? null : source[key], defs[key], shapes[key]);
  return out;
}

// Fills missing keys, replaces wrong primitive types, drops unknown keys.
// Empty-object defaults act as free-form containers (arrays, maps): saved tables are kept as is.
export function withDefaults<T>(saved: unknown, defaults: T, shape: unknown = null): T {
  return merge(saved, defaults, shape) as T;
}

export function loadCharDb(saved: unknown): CharDb {
  const db = withDefaults(saved, CHAR_DEFAULTS, CHAR_SHAPES);
  if (db.tab !== "quest" && db.tab !== "access" && db.tab !== "completion") db.tab = CHAR_DEFAULTS.tab;
  if (db.completion.mode !== "proximity" && db.completion.mode !== "zone") {
    db.completion.mode = CHAR_DEFAULTS.completion.mode;
  }
  return db;
}

export function loadAccountDb(saved: unknown): AccountDb {
  return withDefaults(saved, ACCOUNT_DEFAULTS);
}

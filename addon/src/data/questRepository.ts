export interface AreaPoint {
  areaId: number;
  x: number;
  y: number;
}

export type QuestObjectiveRef = { kind: "npc" | "object" | "item"; id: number; required: number; index: number };

export interface QuestInfo {
  id: number;
  name: string;
  level: number;
  requiredLevel: number;
  requiredMaxLevel: number | null;
  races: number;
  classes: number;
  preGroup: number[];
  preSingle: number[];
  exclusiveTo: number[];
  nextInChain: number | null;
  children: number[];
  starterNpcs: number[];
  starterObjects: number[];
  finisherNpcs: number[];
  finisherObjects: number[];
  objectives: QuestObjectiveRef[];
  baseXp: number;
  hasUnsupportedRequirement: boolean;
  isElite: boolean;
  zoneAreaId: number | null;
}

export interface QuestRepository {
  get(id: number): QuestInfo | null;
  allIds(): number[];
  npcSpawns(npcId: number): AreaPoint[];
  objectSpawns(objectId: number): AreaPoint[];
  itemSources(itemId: number): { npcs: number[]; objects: number[] };
  uiMapIdForArea(areaId: number): number | null;
  lastError(): string | null;
}

export type RepoResult = { ok: true; repo: QuestRepository } | { ok: false; message: string };

const CONTRACT = 4;
const MIN_ELITE_RANK = 1;
const MAX_ELITE_RANK = 3;
const NO_RANK = -1;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slot(tuple: unknown, index: number): unknown {
  return tuple != null && typeof tuple === "object" ? (tuple as unknown[])[index] : null;
}

function entries(list: unknown): unknown[] {
  return list != null && typeof list === "object" ? (list as unknown[]) : [];
}

function numList(value: unknown): number[] {
  const out: number[] = [];
  for (const item of entries(value)) {
    const n = num(item);
    if (n != null) out.push(n);
  }
  return out;
}

function readSpawns(spawns: unknown): AreaPoint[] {
  if (spawns == null || typeof spawns !== "object") return [];
  const points: AreaPoint[] = [];
  for (const [key, list] of Object.entries(spawns as QuestieDBSpawnList)) {
    const areaId = Number(key);
    if (!Number.isFinite(areaId)) continue;
    for (const coord of entries(list)) {
      const x = num(slot(coord, 0));
      const y = num(slot(coord, 1));
      if (x == null || y == null || (x === -1 && y === -1)) continue;
      points.push({ areaId, x, y });
    }
  }
  return points;
}

function readObjectives(
  raw: unknown,
  isEliteNpc: (npcId: number) => boolean,
): { refs: QuestObjectiveRef[]; elite: boolean } {
  const refs: QuestObjectiveRef[] = [];
  let elite = false;
  const push = (kind: QuestObjectiveRef["kind"], id: number | null, required: number | null): void => {
    if (id != null) refs.push({ kind, id, required: required ?? 1, index: refs.length + 1 });
  };

  for (const entry of entries(slot(raw, 0))) {
    const id = num(slot(entry, 0));
    if (id != null && isEliteNpc(id)) elite = true;
    push("npc", id, num(slot(entry, 2)));
  }
  for (const entry of entries(slot(raw, 1))) push("object", num(slot(entry, 0)), num(slot(entry, 2)));
  for (const entry of entries(slot(raw, 2))) push("item", num(slot(entry, 0)), num(slot(entry, 2)));
  for (const entry of entries(slot(raw, 4))) {
    const credits = numList(slot(entry, 0));
    if (credits.some((credit) => isEliteNpc(credit))) elite = true;
    push("npc", credits.length > 0 ? credits[0] : num(slot(entry, 1)), num(slot(entry, 3)));
  }
  return { refs, elite };
}

function buildRepository(lib: LibQuestieDBApi): QuestRepository {
  let firstError: string | null = null;
  const failed: Record<string, true> = {};
  const record = (method: string, error: unknown): void => {
    if (failed[method] != null) return;
    failed[method] = true;
    if (firstError == null) firstError = `${method}: ${String(error)}`;
  };
  const safe = <T>(method: string, fallback: T, read: () => T): T => {
    try {
      return read();
    } catch (error) {
      record(method, error);
      return fallback;
    }
  };

  const xpDb = safe<QuestieDBIdMap<QuestieDBPair> | null>("QuestXP", null, () => lib.Support.Get("QuestXP").db ?? null);
  const areaToUiMap = safe<QuestieDBIdMap<number> | null>(
    "ZoneDB",
    null,
    () => lib.Support.Get("ZoneDB").private.areaIdToUiMapId ?? null,
  );
  const quests: Record<number, QuestInfo> = {};
  const missing: Record<number, true> = {};
  const ranks: Record<number, number> = {};
  let ids: number[] | null = null;
  const field = (id: number, name: string): unknown => lib.Quest.Get(id, name);

  const isEliteNpc = (npcId: number): boolean => {
    let rank = ranks[npcId];
    if (rank == null) {
      rank = num(lib.Npc.Get(npcId, "rank")) ?? NO_RANK;
      ranks[npcId] = rank;
    }
    return rank >= MIN_ELITE_RANK && rank <= MAX_ELITE_RANK;
  };

  const readQuest = (id: number): QuestInfo | null => {
    const name = field(id, "name");
    const level = num(field(id, "questLevel"));
    if (typeof name !== "string" || level == null) return null;

    const startedBy = field(id, "startedBy");
    const finishedBy = field(id, "finishedBy");
    const objectives = readObjectives(field(id, "objectives"), isEliteNpc);
    const nextInChain = num(field(id, "nextQuestInChain"));
    const maxLevel = num(field(id, "requiredMaxLevel"));
    const zone = num(field(id, "zoneOrSort"));

    return {
      id,
      name,
      level,
      requiredLevel: num(field(id, "requiredLevel")) ?? 0,
      requiredMaxLevel: maxLevel != null && maxLevel > 0 ? maxLevel : null,
      races: num(field(id, "requiredRaces")) ?? 0,
      classes: num(field(id, "requiredClasses")) ?? 0,
      preGroup: numList(field(id, "preQuestGroup")),
      preSingle: numList(field(id, "preQuestSingle")),
      exclusiveTo: numList(field(id, "exclusiveTo")),
      nextInChain: nextInChain != null && nextInChain > 0 ? nextInChain : null,
      children: numList(field(id, "childQuests")),
      starterNpcs: numList(slot(startedBy, 0)),
      starterObjects: numList(slot(startedBy, 1)),
      finisherNpcs: numList(slot(finishedBy, 0)),
      finisherObjects: numList(slot(finishedBy, 1)),
      objectives: objectives.refs,
      baseXp: xpDb == null ? 0 : (num(slot(xpDb[id], 1)) ?? 0),
      hasUnsupportedRequirement:
        field(id, "requiredSkill") != null ||
        field(id, "requiredMinRep") != null ||
        field(id, "requiredMaxRep") != null ||
        field(id, "requiredSpell") != null,
      isElite: objectives.elite,
      zoneAreaId: zone != null && zone > 0 ? zone : null,
    };
  };

  return {
    get: (id) => {
      const cached = quests[id];
      if (cached != null) return cached;
      if (missing[id] != null) return null;
      const quest = safe<QuestInfo | null>("get", null, () => readQuest(id));
      if (quest == null) missing[id] = true;
      else quests[id] = quest;
      return quest;
    },
    allIds: () => {
      if (ids == null) ids = safe<number[]>("allIds", [], () => numList(lib.Quest.GetAllIds()));
      return ids;
    },
    npcSpawns: (npcId) => safe<AreaPoint[]>("npcSpawns", [], () => readSpawns(lib.Npc.Get(npcId, "spawns"))),
    objectSpawns: (objectId) =>
      safe<AreaPoint[]>("objectSpawns", [], () => readSpawns(lib.Object.Get(objectId, "spawns"))),
    itemSources: (itemId) =>
      safe<{ npcs: number[]; objects: number[] }>("itemSources", { npcs: [], objects: [] }, () => ({
        npcs: numList(lib.Item.Get(itemId, "npcDrops")),
        objects: numList(lib.Item.Get(itemId, "objectDrops")),
      })),
    uiMapIdForArea: (areaId) =>
      areaToUiMap == null ? null : safe<number | null>("uiMapIdForArea", null, () => num(areaToUiMap[areaId])),
    lastError: () => firstError,
  };
}

export function createQuestRepository(lib: LibQuestieDBApi | null): RepoResult {
  if (lib == null) return { ok: false, message: "QuestieDB is not loaded" };
  try {
    const [ok, message] = lib.RequireContract(CONTRACT);
    if (!ok) return { ok: false, message: message ?? `QuestieDB contract ${CONTRACT} is not supported` };
    return { ok: true, repo: buildRepository(lib) };
  } catch (error) {
    return { ok: false, message: `QuestieDB could not be read: ${String(error)}` };
  }
}

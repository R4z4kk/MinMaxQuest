// Offline load, mirroring QuestieDB's own harness (emulator/native-source.test.lua, Forever block):
//   client = dofile("emulator/client.lua"); emulator = dofile("emulator/metadata.lua")
//   client.reset(); client.install({ expansion = "Forever", gameType = "forever" })
//   emulator.install(config.addonName, emulator.parse("QuestieDB.toc"))
//   db = emulator.loadAddon("QuestieDB.toc", config.addonName)   -- source mode, files picked by emulator.selectFile
// The extraction chunk then serializes the snapshot to JSON inside Lua: holey Lua lists would not survive wasmoon's table conversion.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import { QUESTIE_DB } from "../sources";
import { cacheDir, questieDir } from "./fetchQuestie";
import type { QuestieSnapshot } from "./snapshot";

const TOC = "QuestieDB.toc";
const HARNESS_FILES = [
  TOC,
  "emulator/metadata.lua",
  "emulator/client.lua",
  "generator/base64.lua",
  "generator/vendor/BlizzardCBOR.lua",
  "generator/vendor/LibDeflate.lua",
  "src/config.lua",
];
const GAME_TYPE = "forever";
const EXPANSION = "Forever";

type FieldKind = "string" | "number" | "list" | "strings" | "trigger";

// Every field addon/src/data/questRepository.ts reads.
const QUEST_FIELDS: Record<string, FieldKind> = {
  name: "string",
  startedBy: "list",
  finishedBy: "list",
  requiredLevel: "number",
  questLevel: "number",
  requiredRaces: "number",
  requiredClasses: "number",
  triggerEnd: "trigger",
  objectivesText: "strings",
  objectives: "list",
  preQuestGroup: "list",
  preQuestSingle: "list",
  childQuests: "list",
  exclusiveTo: "list",
  zoneOrSort: "number",
  requiredSkill: "list",
  requiredMinRep: "list",
  requiredMaxRep: "list",
  nextQuestInChain: "number",
  requiredSpell: "number",
  requiredMaxLevel: "number",
};

const SELECT_FILES = String.raw`
local emulator = dofile("emulator/metadata.lua")
local files = {}
for line in io.lines("${TOC}") do
  local path = emulator.selectFile(line, "${GAME_TYPE}")
  if path then files[#files + 1] = path end
end
return files
`;

const LOAD = String.raw`
-- Lua 5.1 global used by src/read/source.lua; 5.4 load accepts strings.
loadstring = load
local config = dofile("src/config.lua")
local client = dofile("emulator/client.lua")
local emulator = dofile("emulator/metadata.lua")
client.reset()
client.install({ expansion = "${EXPANSION}", gameType = "${GAME_TYPE}" })
emulator.install(config.addonName, emulator.parse("${TOC}"))
QDB = emulator.loadAddon("${TOC}", config.addonName)
`;

const EXTRACT = String.raw`
local db = QDB
local QUEST_FIELDS = { ${Object.keys(QUEST_FIELDS).map((f) => `"${f}"`).join(", ")} }
local buf, n = {}, 0
local function put(s) n = n + 1; buf[n] = s end

local ESC = { ['"'] = '\\"', ['\\'] = '\\\\' }
local function escape(c) return ESC[c] or string.format("\\u%04x", c:byte()) end
local function str(s) put('"' .. s:gsub('[%c"\\]', escape) .. '"') end

local function num(v, ctx)
  if v ~= v or v == math.huge or v == -math.huge then error(ctx .. ": non-finite number", 0) end
  local i = math.tointeger(v)
  if i then put(tostring(i)) return end
  local s = string.format("%.15g", v)
  if tonumber(s) ~= v then s = string.format("%.17g", v) end
  put(s)
end

local value
local function list(t, ctx)
  local max, count = 0, 0
  for k in pairs(t) do
    if math.type(k) ~= "integer" or k < 1 then error(ctx .. ": non-positional key " .. tostring(k), 0) end
    count = count + 1
    if k > max then max = k end
  end
  if max > 2 * count + 6 then error(ctx .. ": sparse table where a list was expected", 0) end
  put("[")
  for i = 1, max do
    if i > 1 then put(",") end
    value(t[i], ctx)
  end
  put("]")
end

value = function(v, ctx)
  local kind = type(v)
  if v == nil then put("null")
  elseif kind == "number" then num(v, ctx)
  elseif kind == "string" then str(v)
  elseif kind == "boolean" then put(tostring(v))
  elseif kind == "table" then list(v, ctx)
  else error(ctx .. ": unsupported " .. kind, 0) end
end

local function key(k, ctx)
  local i = math.tointeger(k)
  if i then return tostring(i) end
  if type(k) == "string" then return k end
  error(ctx .. ": unsupported key " .. tostring(k), 0)
end

local function map(t, ctx, each)
  if t == nil then put("null") return end
  if type(t) ~= "table" then error(ctx .. ": expected a table", 0) end
  put("{")
  local first = true
  for k, v in pairs(t) do
    if not first then put(",") end
    first = false
    str(key(k, ctx))
    put(":")
    each(v, ctx .. "[" .. tostring(k) .. "]")
  end
  put("}")
end

local function field(name) str(name) put(":") end

local function spawns(v, ctx) map(v, ctx, value) end

local function trigger(v, ctx)
  if v == nil then put("null") return end
  put("[")
  value(v[1], ctx)
  put(",")
  spawns(v[2], ctx)
  put("]")
end

local function ids(v, ctx) value(v or {}, ctx) end

local function addAll(set, list)
  if type(list) ~= "table" then return end
  for _, id in pairs(list) do
    if type(id) == "number" then set[id] = true end
  end
end

local function sortedKeys(set)
  local out = {}
  for id in pairs(set) do out[#out + 1] = id end
  table.sort(out)
  return out
end

local npcSet, objectSet, itemSet = {}, {}, {}

put("{")
field("tag") str(${JSON.stringify(QUESTIE_DB.tag)}) put(",")
field("contract") num(db.contractVersion, "contractVersion") put(",")

field("quests") put("{")
for index, id in ipairs(db.Quest.GetAllIds()) do
  if index > 1 then put(",") end
  str(tostring(id)) put(":{")
  for j, name in ipairs(QUEST_FIELDS) do
    if j > 1 then put(",") end
    field(name)
    local ctx = "quest " .. id .. " " .. name
    local v = db.Quest.Get(id, name)
    if name == "triggerEnd" then trigger(v, ctx) else value(v, ctx) end
  end
  put("}")
  local startedBy, finishedBy, objectives = db.Quest.Get(id, "startedBy"), db.Quest.Get(id, "finishedBy"), db.Quest.Get(id, "objectives")
  if startedBy then addAll(npcSet, startedBy[1]) addAll(objectSet, startedBy[2]) addAll(itemSet, startedBy[3]) end
  if finishedBy then addAll(npcSet, finishedBy[1]) addAll(objectSet, finishedBy[2]) end
  if objectives then
    for _, o in pairs(objectives[1] or {}) do addAll(npcSet, { o[1] }) end
    for _, o in pairs(objectives[2] or {}) do addAll(objectSet, { o[1] }) end
    for _, o in pairs(objectives[3] or {}) do addAll(itemSet, { o[1] }) end
    for _, o in pairs(objectives[5] or {}) do addAll(npcSet, o[1]) addAll(npcSet, { o[2] }) end
  end
end
put("},")

local itemIds = sortedKeys(itemSet)
field("items") put("{")
local firstItem = true
for _, id in ipairs(itemIds) do
  if db.Item.Exists(id) then
    if not firstItem then put(",") end
    firstItem = false
    local npcDrops, objectDrops = db.Item.Get(id, "npcDrops"), db.Item.Get(id, "objectDrops")
    addAll(npcSet, npcDrops)
    addAll(objectSet, objectDrops)
    str(tostring(id)) put(":{")
    field("name") value(db.Item.Get(id, "name"), "item " .. id .. " name") put(",")
    field("npcDrops") ids(npcDrops, "item " .. id .. " npcDrops") put(",")
    field("objectDrops") ids(objectDrops, "item " .. id .. " objectDrops") put("}")
  end
end
put("},")

local npcFlags = db.Enum.npcFlags
local INNKEEPER = assert(npcFlags and npcFlags.INNKEEPER, "Enum.npcFlags.INNKEEPER is missing")
local FLIGHT_MASTER = assert(npcFlags and npcFlags.FLIGHT_MASTER, "Enum.npcFlags.FLIGHT_MASTER is missing")
for _, id in ipairs(db.Npc.GetAllIds()) do
  local flags = math.tointeger(db.Npc.Get(id, "npcFlags") or 0)
  if flags == nil then error("npc " .. id .. " npcFlags: not an integer", 0) end
  if flags & (INNKEEPER | FLIGHT_MASTER) ~= 0 then npcSet[id] = true end
end

field("npcs") put("{")
local firstNpc = true
for _, id in ipairs(sortedKeys(npcSet)) do
  if db.Npc.Exists(id) then
    if not firstNpc then put(",") end
    firstNpc = false
    local ctx = "npc " .. id
    str(tostring(id)) put(":{")
    field("spawns") spawns(db.Npc.Get(id, "spawns"), ctx .. " spawns") put(",")
    for j, name in ipairs({ "name", "rank", "friendlyToFaction", "minLevel", "maxLevel", "npcFlags" }) do
      if j > 1 then put(",") end
      field(name) value(db.Npc.Get(id, name), ctx .. " " .. name)
    end
    put("}")
  end
end
put("},")

field("objects") put("{")
local firstObject = true
for _, id in ipairs(sortedKeys(objectSet)) do
  if db.Object.Exists(id) then
    if not firstObject then put(",") end
    firstObject = false
    str(tostring(id)) put(":{")
    field("name") value(db.Object.Get(id, "name"), "object " .. id .. " name") put(",")
    field("spawns") spawns(db.Object.Get(id, "spawns"), "object " .. id .. " spawns") put("}")
  end
end
put("},")

local support = db.Support
local questXp = assert(support.Get("QuestXP") and support.Get("QuestXP").db, "Support QuestXP.db is missing")
field("questXp") map(questXp, "questXp", value) put(",")
local zoneDb = assert(support.Get("ZoneDB"), "Support ZoneDB is missing")
-- Support maps ship as "return {...}" source strings, decoded by the consumer.
local function decode(source, label)
  if type(source) ~= "string" then error(label .. " is not a source string", 0) end
  local chunk, err = load(source, label)
  if not chunk then error(label .. ": " .. tostring(err), 0) end
  local decoded = chunk()
  if type(decoded) ~= "table" then error(label .. " did not decode to a table", 0) end
  return decoded
end
-- Same merge as Questie's ZoneDB.Initialize: base map, then overrides.
local areaIdToUiMapId = decode(zoneDb.private.areaIdToUiMapId, "ZoneDB.private.areaIdToUiMapId")
for areaId, uiMapId in pairs(decode(zoneDb.private.areaIdToUiMapIdOverride, "ZoneDB.private.areaIdToUiMapIdOverride")) do
  areaIdToUiMapId[areaId] = uiMapId
end
field("areaIdToUiMapId") map(areaIdToUiMapId, "areaIdToUiMapId", value) put(",")
field("objectiveFirst") map(assert(db.ObjectiveFirst, "ObjectiveFirst is missing"), "objectiveFirst", function(v, ctx) map(v, ctx, value) end) put(",")

-- Same precedence as Questie's DropDB.GetItemDroprate: corrections > private server > Wowhead.
local drops = assert(support.Get("QuestieClassicItemDrops"), "Support QuestieClassicItemDrops is missing")
local wowhead = decode(drops.wowheadData, "QuestieClassicItemDrops.wowheadData")
local pserver = decode(drops.cmangosData, "QuestieClassicItemDrops.cmangosData")
local correctionKeys = assert(support.Get("DropDB") and support.Get("DropDB").correctionKeys, "DropDB.correctionKeys is missing")
local correctionModule = assert(support.Get("QuestieItemDropCorrections"), "Support QuestieItemDropCorrections is missing")
local current = assert(support.Get("Expansions") and support.Get("Expansions").Current, "Expansions.Current is missing")
local corrections = {}
for index, name in ipairs({ "Era", "Tbc", "Wotlk", "Cata", "MoP" }) do
  if index <= current then
    for itemId, rows in pairs(assert(correctionModule[name], "QuestieItemDropCorrections." .. name .. " is missing")) do corrections[itemId] = rows end
  end
end
local function dropRate(itemId, npcId)
  local fixed = corrections[itemId] and corrections[itemId][npcId]
  if fixed ~= nil then
    if fixed >= 0 then return fixed end
    local ref = fixed == correctionKeys.WOWHEAD and wowhead or fixed == correctionKeys.PSERVER and pserver or nil
    if ref == nil then error("drop correction item " .. itemId .. " npc " .. npcId .. ": unknown key " .. fixed, 0) end
    if ref[itemId] and ref[itemId][npcId] then return ref[itemId][npcId] end
  end
  if pserver[itemId] and pserver[itemId][npcId] then return pserver[itemId][npcId] end
  if wowhead[itemId] and wowhead[itemId][npcId] then return wowhead[itemId][npcId] end
  return nil
end
field("dropRates") put("{")
local firstDrop = true
for _, itemId in ipairs(itemIds) do
  local npcIds = {}
  for _, source in ipairs({ corrections, pserver, wowhead }) do
    for npcId in pairs(source[itemId] or {}) do npcIds[npcId] = true end
  end
  local sorted = sortedKeys(npcIds)
  if #sorted > 0 then
    if not firstDrop then put(",") end
    firstDrop = false
    str(tostring(itemId)) put(":{")
    local firstNpcRate = true
    for _, npcId in ipairs(sorted) do
      local rate = dropRate(itemId, npcId)
      if rate ~= nil then
        if not firstNpcRate then put(",") end
        firstNpcRate = false
        str(tostring(npcId)) put(":") num(rate, "drop item " .. itemId .. " npc " .. npcId)
      end
    end
    put("}")
  end
end
put("},")

field("dungeons") map(assert(zoneDb.private.dungeons, "ZoneDB.private.dungeons is missing"), "dungeons", function(d, ctx)
  put("{")
  field("name") value(d[1], ctx) put(",")
  field("altAreaIds") ids(d[2], ctx) put(",")
  field("parentZone") value(d[3], ctx) put(",")
  field("entrances") put("[")
  for i, e in ipairs(d[4] or {}) do
    if i > 1 then put(",") end
    put("{") field("areaId") value(e[1], ctx) put(",") field("x") value(e[2], ctx) put(",") field("y") value(e[3], ctx) put("}")
  end
  put("]}")
end) put(",")

field("npcFlagValues") put("{") field("innkeeper") num(INNKEEPER, "INNKEEPER") put(",") field("flightMaster") num(FLIGHT_MASTER, "FLIGHT_MASTER") put("},")
field("raceMaskById") map(assert(db.Enum.raceMaskById, "Enum.raceMaskById is missing"), "raceMaskById", value)
put("}")
return table.concat(buf)
`;

type Json = Record<string, unknown>;

function fail(label: string, what: string): never {
  throw new Error(`${label}: ${what}`);
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string, what: string): Json {
  if (!isRecord(value)) fail(label, `${what} is not an object`);
  return value;
}

function finite(value: unknown, label: string, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(label, `${what} is not a number`);
  return value;
}

function nullableNumber(value: unknown, label: string, what: string): number | null {
  return value === null ? null : finite(value, label, what);
}

function nullableString(value: unknown, label: string, what: string): string | null {
  if (value !== null && typeof value !== "string") fail(label, `${what} is not a string`);
  return value;
}

function numberList(value: unknown, label: string, what: string): number[] {
  if (!Array.isArray(value)) fail(label, `${what} is not a list`);
  return (value as unknown[]).map((item, index) => finite(item, label, `${what}[${index}]`));
}

function idEntries<T>(value: unknown, label: string, what: string, read: (entry: unknown, id: number) => T): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [key, entry] of Object.entries(record(value, label, what))) {
    const id = Number(key);
    if (!Number.isInteger(id)) fail(label, `${what} has non-numeric id "${key}"`);
    out[id] = read(entry, id);
  }
  return out;
}

function spawnMap(value: unknown, label: string, what: string): Record<number, number[][]> | null {
  if (value === null) return null;
  return idEntries(value, label, what, (coords, areaId) => {
    if (!Array.isArray(coords)) fail(label, `${what}[${areaId}] is not a list`);
    return (coords as unknown[]).map((coord, index) => numberList(coord, label, `${what}[${areaId}][${index}]`));
  });
}

function questField(value: unknown, kind: FieldKind, label: string, what: string): unknown {
  if (value === null) return null;
  if (kind === "string" && typeof value !== "string") fail(label, `${what} is not a string`);
  if (kind === "number") finite(value, label, what);
  if (kind === "list" && !Array.isArray(value)) fail(label, `${what} is not a list`);
  if (kind === "strings" && (!Array.isArray(value) || (value as unknown[]).some((line) => typeof line !== "string"))) fail(label, `${what} is not a list of strings`);
  if (kind === "trigger") {
    if (!Array.isArray(value)) fail(label, `${what} is not a list`);
    spawnMap((value as unknown[])[1] ?? null, label, `${what} spawns`);
  }
  return value;
}

export function validateSnapshot(raw: unknown, label: string): QuestieSnapshot {
  const root = record(raw, label, "snapshot");
  if (typeof root.tag !== "string") fail(label, "tag is not a string");
  const flags = record(root.npcFlagValues, label, "npcFlagValues");
  return {
    tag: root.tag,
    contract: finite(root.contract, label, "contract"),
    quests: idEntries(root.quests, label, "quests", (entry, id) => {
      const row = record(entry, label, `quest ${id}`);
      const out: Record<string, unknown> = {};
      for (const [name, kind] of Object.entries(QUEST_FIELDS)) {
        if (!(name in row)) fail(label, `quest ${id} ${name} is absent`);
        out[name] = questField(row[name], kind, label, `quest ${id} ${name}`);
      }
      return out;
    }),
    npcs: idEntries(root.npcs, label, "npcs", (entry, id) => {
      const row = record(entry, label, `npc ${id}`);
      const faction = row.friendlyToFaction;
      if (faction !== null && typeof faction !== "string") fail(label, `npc ${id} friendlyToFaction is not a string`);
      return {
        name: nullableString(row.name, label, `npc ${id} name`),
        spawns: spawnMap(row.spawns, label, `npc ${id} spawns`),
        rank: nullableNumber(row.rank, label, `npc ${id} rank`),
        friendlyToFaction: faction,
        minLevel: nullableNumber(row.minLevel, label, `npc ${id} minLevel`),
        maxLevel: nullableNumber(row.maxLevel, label, `npc ${id} maxLevel`),
        npcFlags: nullableNumber(row.npcFlags, label, `npc ${id} npcFlags`),
      };
    }),
    objects: idEntries(root.objects, label, "objects", (entry, id) => {
      const row = record(entry, label, `object ${id}`);
      return { name: nullableString(row.name, label, `object ${id} name`), spawns: spawnMap(row.spawns, label, `object ${id} spawns`) };
    }),
    items: idEntries(root.items, label, "items", (entry, id) => {
      const row = record(entry, label, `item ${id}`);
      return {
        name: nullableString(row.name, label, `item ${id} name`),
        npcDrops: numberList(row.npcDrops, label, `item ${id} npcDrops`),
        objectDrops: numberList(row.objectDrops, label, `item ${id} objectDrops`),
      };
    }),
    questXp: idEntries(root.questXp, label, "questXp", (entry, id) => {
      const pair = numberList(entry, label, `questXp ${id}`);
      if (pair.length !== 2) fail(label, `questXp ${id} is not a [level, xp] pair`);
      return [pair[0], pair[1]];
    }),
    areaIdToUiMapId: idEntries(root.areaIdToUiMapId, label, "areaIdToUiMapId", (entry, id) =>
      finite(entry, label, `areaIdToUiMapId ${id}`),
    ),
    objectiveFirst: Object.fromEntries(
      Object.entries(record(root.objectiveFirst, label, "objectiveFirst")).map(([hint, ids]) => [
        hint,
        idEntries(ids, label, `objectiveFirst ${hint}`, (entry, id) => {
          if (typeof entry !== "boolean") fail(label, `objectiveFirst ${hint} ${id} is not a boolean`);
          return entry;
        }),
      ]),
    ),
    dropRates: idEntries(root.dropRates, label, "dropRates", (entry, itemId) =>
      idEntries(entry, label, `dropRates ${itemId}`, (rate, npcId) => finite(rate, label, `dropRates ${itemId} npc ${npcId}`)),
    ),
    dungeons: idEntries(root.dungeons, label, "dungeons", (entry, areaId) => {
      const row = record(entry, label, `dungeon ${areaId}`);
      if (typeof row.name !== "string") fail(label, `dungeon ${areaId} name is not a string`);
      if (!Array.isArray(row.entrances)) fail(label, `dungeon ${areaId} entrances is not a list`);
      return {
        name: row.name,
        altAreaIds: numberList(row.altAreaIds, label, `dungeon ${areaId} altAreaIds`),
        parentZone: finite(row.parentZone, label, `dungeon ${areaId} parentZone`),
        entrances: (row.entrances as unknown[]).map((raw, index) => {
          const e = record(raw, label, `dungeon ${areaId} entrance ${index}`);
          const what = `dungeon ${areaId} entrance ${index}`;
          return { areaId: finite(e.areaId, label, `${what} areaId`), x: finite(e.x, label, `${what} x`), y: finite(e.y, label, `${what} y`) };
        }),
      };
    }),
    npcFlagValues: {
      innkeeper: finite(flags.innkeeper, label, "npcFlagValues.innkeeper"),
      flightMaster: finite(flags.flightMaster, label, "npcFlagValues.flightMaster"),
    },
    raceMaskById: idEntries(root.raceMaskById, label, "raceMaskById", (entry, id) => finite(entry, label, `raceMaskById ${id}`)),
  };
}

function readDirFile(dir: string, path: string): Buffer {
  const full = join(dir, path);
  try {
    return readFileSync(full);
  } catch (error) {
    throw new Error(`QuestieDB: cannot read ${full} (${error instanceof Error ? error.message : String(error)})`);
  }
}

export async function loadSnapshot(dir: string): Promise<QuestieSnapshot> {
  const label = `QuestieDB ${dir}`;
  const factory = new LuaFactory();
  for (const path of HARNESS_FILES) await factory.mountFile(path, readDirFile(dir, path));
  const engine = await factory.createEngine();
  let json: unknown;
  try {
    const files: unknown = await engine.doString(SELECT_FILES);
    if (!Array.isArray(files) || (files as unknown[]).some((path) => typeof path !== "string")) fail(label, "TOC selection is not a list of paths");
    for (const path of files as string[]) await factory.mountFile(path, readDirFile(dir, path));
    await engine.doString(LOAD);
    json = await engine.doString(EXTRACT);
  } catch (error) {
    throw new Error(`${label}: Lua failed (${error instanceof Error ? error.message : String(error)})`);
  } finally {
    engine.global.close();
  }
  if (typeof json !== "string") fail(label, "extraction did not return a string");
  return validateSnapshot(JSON.parse(json), label);
}

export function snapshotPath(): string {
  return join(cacheDir(), `snapshot-${QUESTIE_DB.tag}.json`);
}

// Fields added after the first cache format; a cache without them is regenerated.
function staleField(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const missing = (table: unknown, field: string): boolean =>
    isRecord(table) && Object.values(table).some((row) => isRecord(row) && !(field in row));
  if (missing(raw.quests, "objectivesText")) return "quests[].objectivesText";
  for (const table of ["npcs", "objects", "items"]) if (missing(raw[table], "name")) return `${table}[].name`;
  return null;
}

// Returns null when the cache is absent or stale (written before a field was added).
export function readCachedSnapshot(): QuestieSnapshot | null {
  const path = snapshotPath();
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: cannot parse (${error instanceof Error ? error.message : String(error)})`);
  }
  const stale = staleField(raw);
  if (stale != null) {
    console.warn(`${path}: stale snapshot cache (no ${stale}), regenerating`);
    return null;
  }
  const snapshot = validateSnapshot(raw, path);
  if (snapshot.tag !== QUESTIE_DB.tag) fail(path, `tag ${snapshot.tag} does not match ${QUESTIE_DB.tag}`);
  return snapshot;
}

export function writeCachedSnapshot(snapshot: QuestieSnapshot): void {
  writeFileSync(snapshotPath(), JSON.stringify(snapshot));
}

export async function cachedSnapshot(): Promise<QuestieSnapshot> {
  const cached = readCachedSnapshot();
  if (cached != null) return cached;
  const dir = questieDir();
  if (!existsSync(dir)) throw new Error(`QuestieDB: ${snapshotPath()} is absent or stale and ${dir} is missing (run npm run fetch:questie)`);
  const snapshot = await loadSnapshot(dir);
  writeCachedSnapshot(snapshot);
  return snapshot;
}

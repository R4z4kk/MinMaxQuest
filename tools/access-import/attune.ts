import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import type { AccessEntry, AccessGroup, AccessStep, AccessStepKind } from "./types";

export interface AttuneFiles {
  data: string;
  enUS: string;
  frFR: string;
}

export interface AttuneNotes {
  skippedEntries: string[];
  droppedSteps: string[];
  droppedFollows: string[];
  orFollows: string[];
  filteredSteps: { excludedRaces: number; optional: number };
  placeholderRefs: string[];
  frenchFallbacks: string[];
}

export interface AttuneImport {
  entries: AccessEntry[];
  notes: AttuneNotes;
}

const DATA_LABEL = "AttuneData.lua";
const LOCALE_FILES = { enUS: join("Locales", "enUS.lua"), frFR: join("Locales", "frFR.lua") } as const;
// AttuneLang lookups evaluate to MARK .. key, so the data keeps its locale keys.
const MARK = "\u0001";

const PRELUDE = String.raw`
Attune_Data = {}
AttuneLang = setmetatable({}, { __index = function(_, key) return "\1" .. key end })
LOCALES = {}
function LibStub(major)
  if major ~= "AceLocale-3.0" then error("unexpected LibStub(" .. tostring(major) .. ")", 0) end
  return { NewLocale = function(_, _, locale) local t = {}; LOCALES[locale] = t; return t end }
end
function RUN(source, name)
  local chunk, err = load(source, "@" .. name)
  if not chunk then error(err, 0) end
  chunk()
end
`;

const GROUPS: Record<string, AccessGroup> = { DUNGEONS: "dungeon", RAIDS: "raid", KEYS: "key", MISC: "misc" };
const SKIPPED_GROUPS = new Set(["CHARACTER"]);
const FACTIONS: Record<string, AccessEntry["faction"]> = { Alliance: "A", Horde: "H", Both: "AH" };
const STEP_KINDS: Record<string, AccessStepKind> = {
  "Pick Up": "pickUp",
  "Turn In": "turnIn",
  Quest: "quest",
  Item: "item",
  Kill: "kill",
  Level: "level",
  Interact: "interact",
  Click: "click",
  Rep: "rep",
  Prof: "prof",
  End: "end",
};
// Spacers are layout; Attune steps point at another attune entry, which is its own entry here.
const DROPPED_TYPES = new Set(["Spacer", "Attune"]);
const UNSUPPORTED_TYPES = new Set(["Stat"]);
const PLACEHOLDER_KINDS = new Set<AccessStepKind>(["interact", "click"]);
// NORACE holds UnitRace file names; race ids per https://warcraft.wiki.gg/wiki/API_UnitRace.
const RACE_IDS: Record<string, number> = { Human: 1, Orc: 2, Dwarf: 3, NightElf: 4, Scourge: 5, Tauren: 6, Gnome: 7, Troll: 8 };

type Row = Record<string, unknown>;

interface RawStep {
  index: number;
  attune: string;
  id: number;
  type: string;
  row: Row;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function list(value: unknown, what: string): Row[] {
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) if (typeof item !== "object" || item === null) throw new Error(`${DATA_LABEL}: ${what} has a non-table row`);
    return value as Row[];
  }
  // wasmoon turns an empty Lua table into an empty object.
  if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return [];
  throw new Error(`${DATA_LABEL}: ${what} is not a list`);
}

function text(row: Row, field: string, label: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`${label}: ${field} is not a string`);
  return value;
}

function localeKey(value: string, field: string, label: string): string {
  if (!value.startsWith(MARK) || value.indexOf(MARK, 1) !== -1) throw new Error(`${label}: ${field} is not a single AttuneLang key`);
  return value.slice(1);
}

function integer(value: string, what: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${what} "${value}" is not a number`);
  return Number(value);
}

function strings(value: unknown, label: string): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label}: no AceLocale table was created`);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) if (typeof entry === "string") out[key] = entry;
  return out;
}

async function evaluate(files: AttuneFiles): Promise<{ attunes: Row[]; steps: Row[]; enUS: Record<string, string>; frFR: Record<string, string> }> {
  const engine = await new LuaFactory().createEngine();
  try {
    await engine.doString(PRELUDE);
    const run = async (source: string, name: string): Promise<void> => {
      engine.global.set("CHUNK_SOURCE", source);
      engine.global.set("CHUNK_NAME", name);
      try {
        await engine.doString("RUN(CHUNK_SOURCE, CHUNK_NAME)");
      } catch (error) {
        throw new Error(`${name}: cannot evaluate (${errorText(error)})`);
      }
    };
    await run(files.enUS, LOCALE_FILES.enUS);
    await run(files.frFR, LOCALE_FILES.frFR);
    await run(files.data, DATA_LABEL);
    const attunes = list(await engine.doString("return Attune_Data.attunes"), "Attune_Data.attunes");
    const steps = list(await engine.doString("return Attune_Data.steps"), "Attune_Data.steps");
    const enUS = strings(await engine.doString("return LOCALES.enUS"), LOCALE_FILES.enUS);
    const frFR = strings(await engine.doString("return LOCALES.frFR"), LOCALE_FILES.frFR);
    return { attunes, steps, enUS, frFR };
  } finally {
    engine.global.close();
  }
}

function parseFollows(step: RawStep, known: (id: number) => boolean, notes: AttuneNotes): number[] {
  const raw = text(step.row, "FOLLOWS", `attune ${step.attune} step ${step.id}`);
  const ids: number[] = [];
  for (const token of raw.split(/[&|]/)) {
    if (token === "0") continue;
    if (!/^\d+$/.test(token)) notes.droppedFollows.push(`${step.attune}/${step.id} -> ${token} (malformed)`);
    else if (!known(Number(token))) notes.droppedFollows.push(`${step.attune}/${step.id} -> ${token} (no such step)`);
    else ids.push(Number(token));
  }
  return ids;
}

function stepRef(step: RawStep, kind: AccessStepKind, notes: AttuneNotes): number {
  const what = `attune ${step.attune} step ${step.id}`;
  if (kind === "end") return 0;
  if (kind === "rep") return integer(text(step.row, "LOCATION", what), `${what}: LOCATION`);
  const raw = text(step.row, "ID_WOWHEAD", what);
  if (!/^\d+$/.test(raw) && PLACEHOLDER_KINDS.has(kind)) {
    notes.placeholderRefs.push(`${step.attune}/${step.id} ${step.type} ${raw}`);
    return 0;
  }
  return integer(raw, `${what}: ID_WOWHEAD`);
}

function excludedRaces(step: RawStep, raceMaskById: Record<number, number>): number | null {
  if (step.row.NORACE == null) return null;
  const what = `attune ${step.attune} step ${step.id}`;
  let mask = 0;
  for (const token of text(step.row, "NORACE", what).split("|")) {
    const race = RACE_IDS[token];
    if (race == null) throw new Error(`${what}: unknown NORACE race "${token}"`);
    const bit = raceMaskById[race];
    if (bit == null) throw new Error(`${what}: race ${race} (${token}) missing from QuestieDB raceMaskById`);
    mask += bit;
  }
  return mask;
}

function buildSteps(attune: string, raws: RawStep[], notes: AttuneNotes, raceMaskById: Record<number, number>): AccessStep[] {
  const kept = new Map<number, RawStep>();
  const dropped = new Map<number, RawStep[]>();
  for (const step of raws) {
    if (DROPPED_TYPES.has(step.type)) {
      dropped.set(step.id, [...(dropped.get(step.id) ?? []), step]);
      if (step.type !== "Spacer") notes.droppedSteps.push(`${attune}/${step.id} ${step.type} ${text(step.row, "ID_WOWHEAD", `attune ${attune} step ${step.id}`)}`);
      continue;
    }
    if (UNSUPPORTED_TYPES.has(step.type)) throw new Error(`${DATA_LABEL}: TYPE "${step.type}" has no access kind (attune ${attune} step ${step.id})`);
    if (kept.has(step.id)) throw new Error(`${DATA_LABEL}: attune ${attune} has duplicate step ID ${step.id}`);
    kept.set(step.id, step);
  }
  const known = (id: number): boolean => kept.has(id) || dropped.has(id);
  const parsed = new Map<RawStep, number[]>();
  const followsOf = (step: RawStep): number[] => {
    if (!parsed.has(step)) parsed.set(step, parseFollows(step, known, notes));
    return parsed.get(step) ?? [];
  };
  // A kept step wins over a dropped step that reuses its ID.
  const resolve = (id: number, path: number[]): number[] => {
    if (kept.has(id)) return [id];
    if (path.includes(id)) throw new Error(`${DATA_LABEL}: attune ${attune} has a FOLLOWS cycle through ${[...path, id].join(" -> ")}`);
    return (dropped.get(id) ?? []).flatMap((spacer) => followsOf(spacer).flatMap((next) => resolve(next, [...path, id])));
  };

  const stage = (step: RawStep): number => integer(text(step.row, "STAGE", `attune ${attune} step ${step.id}`), `attune ${attune} step ${step.id}: STAGE`);
  return [...kept.values()]
    .sort((a, b) => stage(a) - stage(b) || a.index - b.index)
    .map((step) => {
      const kind = STEP_KINDS[step.type];
      const followsAny = text(step.row, "FOLLOWS", `attune ${attune} step ${step.id}`).includes("|");
      if (followsAny) notes.orFollows.push(`${attune}/${step.id}`);
      const follows = [...new Set(followsOf(step).flatMap((id) => resolve(id, [step.id])))];
      const excluded = excludedRaces(step, raceMaskById);
      const result: AccessStep = { id: step.id, kind, ref: stepRef(step, kind, notes), follows, origin: "attune" };
      if (excluded != null) {
        result.excludedRaces = excluded;
        notes.filteredSteps.excludedRaces += 1;
      }
      if (step.row.SIDE === true || step.row.FOLLOW === true) {
        result.optional = true;
        notes.filteredSteps.optional += 1;
      }
      if (followsAny) result.followsAny = true;
      return result;
    });
}

export async function parseAttune(files: AttuneFiles, raceMaskById: Record<number, number>): Promise<AttuneImport> {
  const { attunes, steps, enUS, frFR } = await evaluate(files);
  const notes: AttuneNotes = { skippedEntries: [], droppedSteps: [], droppedFollows: [], orFollows: [], filteredSteps: { excludedRaces: 0, optional: 0 }, placeholderRefs: [], frenchFallbacks: [] };

  const stepsByAttune = new Map<string, RawStep[]>();
  steps.forEach((row, index) => {
    const label = `${DATA_LABEL}: step ${index + 1}`;
    const attune = text(row, "ID_ATTUNE", label);
    const id = integer(text(row, "ID", label), `${label}: ID`);
    const type = text(row, "TYPE", label);
    if (!(type in STEP_KINDS) && !DROPPED_TYPES.has(type) && !UNSUPPORTED_TYPES.has(type)) {
      throw new Error(`${DATA_LABEL}: unknown step TYPE "${type}" (attune ${attune} step ${id})`);
    }
    stepsByAttune.set(attune, [...(stepsByAttune.get(attune) ?? []), { index, attune, id, type, row }]);
  });

  const entries: AccessEntry[] = [];
  const seen = new Set<string>();
  for (const row of attunes) {
    const id = text(row, "ID", `${DATA_LABEL}: attune`);
    const label = `${DATA_LABEL}: attune ${id}`;
    if (seen.has(id)) throw new Error(`${label}: duplicate ID`);
    seen.add(id);
    const nameKey = localeKey(text(row, "NAME", label), "NAME", label);
    const groupKey = localeKey(text(row, "GROUP", label), "GROUP", label);
    if (SKIPPED_GROUPS.has(groupKey)) {
      notes.skippedEntries.push(`${id} ${enUS[nameKey] ?? nameKey} (${groupKey})`);
      continue;
    }
    const group = GROUPS[groupKey];
    if (group == null) throw new Error(`attune ${id}: unknown GROUP "${groupKey}"`);
    const factionName = text(row, "FACTION", label);
    const faction = FACTIONS[factionName];
    if (faction == null) throw new Error(`attune ${id}: unknown FACTION "${factionName}"`);
    let levels: [number, number] | null = null;
    if (row.LEVELS != null) {
      const match = /^(\d+)-(\d+)$/.exec(text(row, "LEVELS", label));
      if (match == null) throw new Error(`${label}: LEVELS "${String(row.LEVELS)}" is not "min-max"`);
      levels = [Number(match[1]), Number(match[2])];
    }
    const enName = enUS[nameKey];
    if (enName == null) throw new Error(`attune ${id}: enUS locale has no "${nameKey}"`);
    const frName = frFR[nameKey];
    if (frName == null && !notes.frenchFallbacks.includes(nameKey)) notes.frenchFallbacks.push(nameKey);
    entries.push({ id, group, faction, levels, name: { enUS: enName, frFR: frName ?? enName }, steps: buildSteps(id, stepsByAttune.get(id) ?? [], notes, raceMaskById) });
  }
  for (const attune of stepsByAttune.keys()) if (!seen.has(attune)) throw new Error(`${DATA_LABEL}: steps name an unknown attune ${attune}`);
  return { entries, notes };
}

export function readAttuneVersion(toc: string): string {
  const match = /^## Version:\s*(\S+)\s*$/m.exec(toc);
  if (match == null) throw new Error("Attune.toc: no ## Version line");
  return match[1];
}

function readText(dir: string, file: string): string {
  const path = join(dir, file);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Attune: cannot read ${path} (${errorText(error)})`);
  }
}

export function readAttuneToc(dir: string): string {
  return readText(dir, "Attune.toc");
}

export function readAttuneFiles(dir: string): AttuneFiles {
  return { data: readText(dir, DATA_LABEL), enUS: readText(dir, LOCALE_FILES.enUS), frFR: readText(dir, LOCALE_FILES.frFR) };
}

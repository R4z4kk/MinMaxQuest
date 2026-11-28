import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { CMANGOS_CLASSIC_DB } from "../sources";
import { cacheDir } from "./fetchQuestie";

export interface CmangosCounts {
  // npcOrObject ids are signed as in the dump: negative for game objects.
  get(questId: number, kind: "npcOrObject" | "item", id: number): number | null;
}

const TABLE = "quest_template";
const SLOTS = [1, 2, 3, 4];
const REQUIRED_COLUMNS = ["entry", ...["ReqCreatureOrGOId", "ReqCreatureOrGOCount", "ReqItemId", "ReqItemCount"].flatMap((c) => SLOTS.map((slot) => `${c}${slot}`))];
const ESCAPES: Record<string, string> = { "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" };

export type SqlValue = string | number | null;

function key(questId: number, kind: "npcOrObject" | "item", id: number): string {
  return `${questId}:${kind}:${id}`;
}

function columnList(text: string, where: string): string[] {
  return text.split(",").map((raw) => {
    const name = /^\s*`(\w+)`\s*$/.exec(raw);
    if (name == null) throw new Error(`${where}: bad column "${raw.trim()}"`);
    return name[1];
  });
}

// Parses "(v,...),(v,...);" starting at `from`; strings keep MySQL backslash and doubled-quote escapes.
function tuples(line: string, from: number, where: string): SqlValue[][] {
  const rows: SqlValue[][] = [];
  let i = from;
  function fail(what: string): never {
    throw new Error(`${where}: ${what} at column ${i + 1}`);
  }
  const skipSpace = (): void => {
    while (i < line.length && /\s/.test(line[i])) i++;
  };
  for (;;) {
    skipSpace();
    if (line[i] !== "(") fail("expected (");
    i++;
    const row: SqlValue[] = [];
    for (;;) {
      skipSpace();
      if (line[i] === "'") {
        let value = "";
        i++;
        for (;;) {
          if (i >= line.length) fail("unterminated string");
          const c = line[i];
          if (c === "\\") {
            const next = line[i + 1];
            if (next == null) fail("unterminated string");
            value += ESCAPES[next] ?? next;
            i += 2;
          } else if (c === "'" && line[i + 1] === "'") {
            value += "'";
            i += 2;
          } else if (c === "'") {
            i++;
            break;
          } else {
            value += c;
            i++;
          }
        }
        row.push(value);
      } else {
        const token = /^[^,)\s]+/.exec(line.slice(i, i + 64));
        if (token == null) fail("expected a value");
        const text = token[0];
        if (text.toUpperCase() === "NULL") row.push(null);
        else {
          const n = Number(text);
          if (!Number.isFinite(n)) fail(`bad value "${text}"`);
          row.push(n);
        }
        i += text.length;
      }
      skipSpace();
      if (line[i] === ",") {
        i++;
        continue;
      }
      if (line[i] === ")") {
        i++;
        break;
      }
      fail("expected , or )");
    }
    rows.push(row);
    skipSpace();
    if (line[i] === ",") {
      i++;
      continue;
    }
    if (line[i] === ";") {
      i++;
      skipSpace();
      if (i !== line.length) fail("trailing text");
      return rows;
    }
    fail("expected , or ;");
  }
}

export interface SqlRow {
  where: string;
  value(column: string): SqlValue;
  int(column: string): number;
}

export function parseSqlTable(sql: string, file: string, table: string, requiredColumns: string[]): SqlRow[] {
  const lines = sql.split(/\r?\n/);
  let columns: string[] | null = null;
  let seen = false;
  const rows: SqlRow[] = [];
  const insertPrefix = new RegExp(`^INSERT INTO \`${table}\`\\s*(?:\\(([^)]*)\\))?\\s*VALUES\\s*`);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const where = `${file}:${n + 1}`;
    if (line.startsWith(`CREATE TABLE \`${table}\``)) {
      seen = true;
      columns = [];
      for (n++; n < lines.length; n++) {
        const column = /^\s*`(\w+)`/.exec(lines[n]);
        if (column == null) break;
        columns.push(column[1]);
      }
      if (columns.length === 0) throw new Error(`${where}: ${table} has no columns`);
      continue;
    }
    const insert = insertPrefix.exec(line);
    if (insert == null) continue;
    seen = true;
    const names = insert[1] != null ? columnList(insert[1], where) : columns;
    if (names == null) throw new Error(`${where}: INSERT into ${table} before its CREATE TABLE`);
    const index = new Map(names.map((name, i) => [name, i]));
    const missing = requiredColumns.filter((column) => !index.has(column));
    if (missing.length > 0) throw new Error(`${where}: ${table} has no column ${missing.join(", ")}`);
    for (const row of tuples(line, insert[0].length, where)) {
      if (row.length !== names.length) throw new Error(`${where}: row has ${row.length} values for ${names.length} columns`);
      const value = (column: string): SqlValue => {
        const at = index.get(column);
        if (at == null) throw new Error(`${where}: ${table} has no column ${column}`);
        return row[at];
      };
      const int = (column: string): number => {
        const v = value(column);
        if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${where}: ${table} ${column} is not an integer`);
        return v;
      };
      rows.push({ where, value, int });
    }
  }
  if (!seen) throw new Error(`${file}: no ${table} table`);
  if (rows.length === 0) throw new Error(`${file}: no ${table} row parsed`);
  return rows;
}

export function parseCmangosCounts(sql: string, file: string): CmangosCounts {
  const counts = new Map<string, number>();
  for (const row of parseSqlTable(sql, file, TABLE, REQUIRED_COLUMNS)) {
    const questId = row.int("entry");
    for (const slot of SLOTS) {
      for (const [kind, idColumn, countColumn] of [
        ["npcOrObject", `ReqCreatureOrGOId${slot}`, `ReqCreatureOrGOCount${slot}`],
        ["item", `ReqItemId${slot}`, `ReqItemCount${slot}`],
      ] as const) {
        const id = row.int(idColumn);
        const count = row.int(countColumn);
        if (id === 0 || count <= 0) continue;
        const k = key(questId, kind, id);
        const previous = counts.get(k);
        if (previous != null && previous !== count) throw new Error(`${row.where}: quest ${questId} ${kind} ${id} has counts ${previous} and ${count}`);
        counts.set(k, count);
      }
    }
  }
  return { get: (questId, kind, id) => counts.get(key(questId, kind, id)) ?? null };
}

export function readSqlFile(file: string): string {
  try {
    const raw = readFileSync(file);
    return (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  } catch (error) {
    throw new Error(`${file}: cannot read (${error instanceof Error ? error.message : String(error)})`);
  }
}

export function loadCmangosCounts(file: string): CmangosCounts {
  return parseCmangosCounts(readSqlFile(file), file);
}

export function cmangosPath(): string {
  const name = CMANGOS_CLASSIC_DB.file.split("/").pop() ?? CMANGOS_CLASSIC_DB.file;
  return join(cacheDir(), "cmangos", CMANGOS_CLASSIC_DB.commit, name);
}

export function fetchCmangos(): string {
  const path = cmangosPath();
  if (existsSync(path)) return path;
  mkdirSync(join(cacheDir(), "cmangos", CMANGOS_CLASSIC_DB.commit), { recursive: true });
  const partial = `${path}.part`;
  try {
    execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", "--output", partial, CMANGOS_CLASSIC_DB.source], { stdio: "inherit" });
    gunzipSync(readFileSync(partial));
    renameSync(partial, path);
  } catch (error) {
    rmSync(partial, { force: true });
    throw new Error(`fetch:cmangos: download of ${CMANGOS_CLASSIC_DB.source} failed (${error instanceof Error ? error.message : String(error)})`);
  }
  return path;
}

export function loadPinnedCmangosCounts(): CmangosCounts {
  return loadCmangosCounts(fetchCmangos());
}

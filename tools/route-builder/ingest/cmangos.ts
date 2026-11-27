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

type SqlValue = string | number | null;

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

export function parseCmangosCounts(sql: string, file: string): CmangosCounts {
  const lines = sql.split(/\r?\n/);
  let columns: string[] | null = null;
  let seen = false;
  let parsedRows = 0;
  const counts = new Map<string, number>();
  const insertPrefix = new RegExp(`^INSERT INTO \`${TABLE}\`\\s*(?:\\(([^)]*)\\))?\\s*VALUES\\s*`);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const where = `${file}:${n + 1}`;
    if (line.startsWith(`CREATE TABLE \`${TABLE}\``)) {
      seen = true;
      columns = [];
      for (n++; n < lines.length; n++) {
        const column = /^\s*`(\w+)`/.exec(lines[n]);
        if (column == null) break;
        columns.push(column[1]);
      }
      if (columns.length === 0) throw new Error(`${where}: ${TABLE} has no columns`);
      continue;
    }
    const insert = insertPrefix.exec(line);
    if (insert == null) continue;
    seen = true;
    const names = insert[1] != null ? columnList(insert[1], where) : columns;
    if (names == null) throw new Error(`${where}: INSERT into ${TABLE} before its CREATE TABLE`);
    const index = new Map(names.map((name, i) => [name, i]));
    const missing = REQUIRED_COLUMNS.filter((column) => !index.has(column));
    if (missing.length > 0) throw new Error(`${where}: ${TABLE} has no column ${missing.join(", ")}`);
    const entryAt = index.get("entry");
    if (entryAt == null) throw new Error(`${where}: no entry column`);
    for (const row of tuples(line, insert[0].length, where)) {
      if (row.length !== names.length) throw new Error(`${where}: row has ${row.length} values for ${names.length} columns`);
      parsedRows++;
      const int = (column: string): number => {
        const at = index.get(column);
        if (at == null) throw new Error(`${where}: ${TABLE} has no column ${column}`);
        const value = row[at];
        if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${where}: quest ${String(row[entryAt])} ${column} is not an integer`);
        return value;
      };
      const questId = int("entry");
      for (const slot of SLOTS) {
        for (const [kind, idColumn, countColumn] of [
          ["npcOrObject", `ReqCreatureOrGOId${slot}`, `ReqCreatureOrGOCount${slot}`],
          ["item", `ReqItemId${slot}`, `ReqItemCount${slot}`],
        ] as const) {
          const id = int(idColumn);
          const count = int(countColumn);
          if (id === 0 || count <= 0) continue;
          const k = key(questId, kind, id);
          const previous = counts.get(k);
          if (previous != null && previous !== count) throw new Error(`${where}: quest ${questId} ${kind} ${id} has counts ${previous} and ${count}`);
          counts.set(k, count);
        }
      }
    }
  }
  if (!seen) throw new Error(`${file}: no quest_template table`);
  if (parsedRows === 0) throw new Error(`${file}: no quest_template row parsed`);
  return { get: (questId, kind, id) => counts.get(key(questId, kind, id)) ?? null };
}

export function loadCmangosCounts(file: string): CmangosCounts {
  let sql: string;
  try {
    const raw = readFileSync(file);
    sql = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  } catch (error) {
    throw new Error(`${file}: cannot read (${error instanceof Error ? error.message : String(error)})`);
  }
  return parseCmangosCounts(sql, file);
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

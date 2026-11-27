import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const ROOTS = ["addon/src", "tools"];
const ANY_TYPE = /(:\s*any\b|<\s*any\b|\bas\s+any\b|\bany\s*(\[\]|[|&>,)=;])|[|&]\s*any\b)/;
const UNDEFINED_TOKEN = /\bundefined\b/;

function collect(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : collect(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

function stripCommentsAndStrings(source: string): string {
  const token = /\/\*[\s\S]*?\*\/|\/\/.*$|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/gm;
  return source.replace(token, (match) => (match.startsWith("/") ? "" : '""'));
}

const files = ROOTS.flatMap(collect);

it("scans source files", () => expect(files.length).toBeGreaterThan(0));

it("source has no any type and no undefined token", () => {
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
    if (ANY_TYPE.test(code)) offenders.push(`${file}: any`);
    if (UNDEFINED_TOKEN.test(code)) offenders.push(`${file}: undefined`);
  }
  expect(offenders).toEqual([]);
});

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { QUESTIE_DB } from "../sources";

const CACHE_DIR = join("tools", "route-builder", ".cache");

export function cacheDir(): string {
  return CACHE_DIR;
}

export function questieDir(): string {
  return join(CACHE_DIR, "questiedb", QUESTIE_DB.tag);
}

export function fetchQuestie(): void {
  const dir = questieDir();
  if (existsSync(dir)) return;
  mkdirSync(dirname(dir), { recursive: true });
  try {
    execFileSync("git", ["clone", "--depth", "1", "--branch", QUESTIE_DB.tag, QUESTIE_DB.repo, dir], { stdio: "inherit" });
  } catch (error) {
    throw new Error(`fetch:questie: git clone of ${QUESTIE_DB.repo}@${QUESTIE_DB.tag} failed (${error instanceof Error ? error.message : String(error)})`);
  }
}

if (process.argv[1] != null && /fetchQuestie\.ts$/.test(process.argv[1])) fetchQuestie();

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRAVEL } from "../../addon/src/data/generated/travel";
import { emitFaction, emitReport, type EmitMeta } from "./emit/emit";
import { loadPinnedCmangosCounts } from "./ingest/cmangos";
import { fetchQuestie } from "./ingest/fetchQuestie";
import { loadInstanceTypes } from "./ingest/instances";
import { cachedSnapshot } from "./ingest/questie";
import { loadZones } from "./ingest/zones";
import { BUILDER, SCENARIOS, expiredBuilderValues } from "./model/constants";
import { buildWorld, type World } from "./model/world";
import { DEFAULT_BEAM_WIDTH, DEFAULT_BRANCHING, type Variant } from "./opt/build";
import { allVariants, buildFaction, variantKey, type FactionRoutes } from "./opt/variants";
import { QUESTIE_DB, WAGO_DB2 } from "./sources";

type Faction = "A" | "H";

const OUT_DIR = join("data", "routes");
const FACTION_FILES: Record<Faction, string> = { A: "Alliance.lua", H: "Horde.lua" };
const REPORT_FILE = "report.md";
const USAGE = "usage: gen:routes [--faction A|H] [--variant <key>]";

interface Args { factions: Faction[]; variants: Variant[] }

function parseArgs(argv: string[]): Args {
  const args: Args = { factions: ["A", "H"], variants: allVariants() };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) throw new Error(`gen:routes: ${flag} needs a value (${USAGE})`);
    if (flag === "--faction") {
      if (value !== "A" && value !== "H") throw new Error(`gen:routes: --faction ${value} is not A or H`);
      args.factions = [value];
    } else if (flag === "--variant") {
      const variant = allVariants().find((v) => variantKey(v) === value);
      if (variant == null) throw new Error(`gen:routes: --variant ${value} is not one of ${allVariants().map(variantKey).join(", ")}`);
      args.variants = [variant];
    } else {
      throw new Error(`gen:routes: unknown argument ${flag} (${USAGE})`);
    }
  }
  return args;
}

function constants(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, dated] of Object.entries(BUILDER)) out[name] = dated.value;
  for (const s of SCENARIOS) {
    out[`${s.name}.killSec`] = s.killSec.value;
    out[`${s.name}.eliteFactor`] = s.eliteFactor.value;
    out[`${s.name}.dungeonSec`] = s.dungeonSec.value;
    out[`${s.name}.questDropChance`] = s.questDropChance.value;
  }
  return out;
}

const elapsed = (since: number): string => `${((Date.now() - since) / 1000).toFixed(1)}s`;

function write(file: string, content: string): void {
  const path = join(OUT_DIR, file);
  writeFileSync(path, content);
  console.log(`wrote ${path} (${statSync(path).size} bytes)`);
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  const expired = expiredBuilderValues(today);
  if (expired.length > 0) throw new Error(`gen:routes: expired dated values on ${today}, verify and renew them: ${expired.join(", ")}`);

  fetchQuestie();
  const snapshot = await cachedSnapshot();
  const zones = await loadZones();
  const instanceTypes = loadInstanceTypes();
  const counts = loadPinnedCmangosCounts();

  const worlds: World[] = [];
  const all: FactionRoutes[] = [];
  for (const faction of args.factions) {
    const factionStarted = Date.now();
    const world = buildWorld(snapshot, zones, faction, TRAVEL, instanceTypes, counts);
    console.log(`[${faction}] world: ${world.quests.size} candidates, offset ${world.conversionOffsetYards.toFixed(2)} yd`);
    try {
      all.push(buildFaction(world, { beamWidth: DEFAULT_BEAM_WIDTH, branching: DEFAULT_BRANCHING, variants: args.variants }));
    } catch (error) {
      throw new Error(`[${faction}] ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    worlds.push(world);
    console.log(`[${faction}] routes built in ${elapsed(factionStarted)}`);
  }

  const meta: EmitMeta = { build: WAGO_DB2.build, questieDb: QUESTIE_DB.tag, generatedOn: today, constants: constants() };
  mkdirSync(OUT_DIR, { recursive: true });
  for (const routes of all) {
    const world = worlds.find((w) => w.faction === routes.faction);
    if (world == null) throw new Error(`gen:routes: no world for faction ${routes.faction}`);
    write(FACTION_FILES[routes.faction], emitFaction(routes, world, meta));
  }
  write(REPORT_FILE, emitReport(all, worlds, meta));
  console.log(`gen:routes: done in ${elapsed(started)}`);
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void run();

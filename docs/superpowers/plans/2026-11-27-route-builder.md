# Route Builder (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline generator (`npm run gen:routes`) that reads QuestieDB, simulates leveling, builds optimized 1-60 quest routes for both factions in 16 variants, and writes them as Lua data plus a readable report.

**Architecture:** TypeScript under `tools/route-builder/`, run with tsx. It reuses the addon's pure TS modules unchanged (travel graph, quest XP, availability, spawn clustering, quest repository). QuestieDB is loaded in wasmoon through QuestieDB's own offline emulator and cached as a JSON snapshot. A deterministic simulator is the objective. A beam search over zone blocks builds each route under three robustness scenarios, and the route with the best average time wins. The route codec lives in `addon/src/route/format.ts` so the addon can decode it in Plan 3.

**Tech Stack:** Node 24, TypeScript (strict), tsx, vitest, wasmoon, TypeScriptToLua (codec only).

**Spec:** `docs/superpowers/specs/2026-11-27-minmaxquest-design.md`, §7 and especially §7.7, which overrides §7.1-§7.5.

## Global Constraints

- Everything in English: code, names, comments, commits, branch (`feat/route-builder`). Comments minimal.
- TypeScript only. No `any`. No explicit `undefined`: use optional properties or `null`.
- Robust errors. Any ingest, data or solver failure throws an `Error` naming the input. The CLI prints it and exits with code 1. No silent default value anywhere.
- Every value that can go stale carries `source`, `verifiedOn` and `expiresOn` (the `DatedValue` shape from `addon/src/core/constants.ts`). The generator refuses to run when one has expired. A vitest test fails on expiry.
- Player-dependent timings are robustness scenarios, not estimates. They are named `fast`, `medium` and `slow`, use the exact values in Task 4, and are marked "unverified".
- Reuse the addon's pure modules. Never copy their logic: `travel/graph.ts`, `core/questXp.ts`, `core/constants.ts`, `quests/availability.ts`, `targets/spawns.ts`, `data/questRepository.ts`, `game/routing.ts#travelSpeed`, `access/chains.ts`.
- Tests never need QuestieDB, the network or the game. Integration tests that read the real cache use `it.skipIf(!existsSync(cachePath))`.
- No class quests (`classes !== 0` excluded). No rested XP. The level 40 mount costs no gold.
- Commits are conventional, with no `Co-Authored-By` line.

## Review Focus

- A quest whose starter, objective or turn-in has no convertible position (area not in ZoneDB, uiMap not in Zones.lua, other continent): it is excluded with a reason counted in the report. It never crashes the run and is never placed at (0, 0).
- A chain whose first quest is unavailable to the faction or race: its follow-ups never enter the route. In tolerant (per-race) mode they are skipped with no violation.
- A forced dungeon block that would push the quest log past 20: the builder accepts at most `20 - inLog` dungeon quests and drops the rest. The simulator reports `logFull` if the limit is ever crossed.
- A `hearth` step reached while the stone is on cooldown, which happens in a slower scenario than the one that built the route: the simulator walks or flies instead. It reports no violation and does not reset the cooldown.
- Variant `maxLevelGap = 3` at levels 1-3, where no quest qualifies: the builder emits `grind` steps until quests qualify, and the segment still reaches level 10.

---

## File Structure

```
tools/route-builder/
  tsconfig.json              type-check config for tools (node types)
  sources.ts                 pinned, dated external sources (QuestieDB tag, SPF version)
  main.ts                    CLI: fetch/ingest → world → build all → emit
  ingest/fetchQuestie.ts     shallow clone of the pinned QuestieDB tag into the cache
  ingest/questie.ts          load QuestieDB via its emulator in wasmoon → QuestieSnapshot
  ingest/snapshot.ts         QuestieSnapshot type + LibQuestieDBApi shim + extras accessors
  ingest/zones.ts            vendor SPF Zones.lua → uiMap rects + areaToWorld
  model/constants.ts         dated builder constants and scenarios
  model/mobXp.ts             vmangos mob XP formula
  model/drops.ts             negative-binomial kill quantile
  model/world.ts             World: candidate quests, places, tasks, inns, taxi zones, dungeons, start zones
  sim/simulate.ts            state, applyStep, simulate
  opt/build.ts               block beam search
  opt/variants.ts            16 variants × segments/trunk × scenario selection, return blocks
  emit/emit.ts               Lua files + report.md
  test/fixtures.ts           tiny snapshot + world builders for tests
  test/*.test.ts
addon/src/route/format.ts    step codec shared with the addon (TSTL-safe)
data/routes/Alliance.lua, Horde.lua, report.md   generated, committed
vendor/shortest-path-forever/Zones.lua            vendored, same version as the other SPF files
```

---

### Task 1: Tooling base and zone conversion

**Files:**
- Create: `tools/route-builder/tsconfig.json`, `tools/route-builder/sources.ts`, `tools/route-builder/ingest/zones.ts`, `tools/route-builder/test/zones.test.ts`
- Create: `vendor/shortest-path-forever/Zones.lua` (from `cjber/shortest-path-forever` tag `v1.48.0`, path `Data/Zones.lua`, the same commit as `VERSION`)
- Modify: `package.json` (scripts, devDependency `@types/node`), `.gitignore` (`tools/route-builder/.cache/`), `vitest.config.ts` (nothing to change if `tools/**/*.test.ts` already matches)

**Interfaces:**
- Produces:
  - `interface UiMapRect { uiMapId: number; continent: number; minX: number; minY: number; maxX: number; maxY: number; low: number | null; high: number | null }`
  - `parseZones(lua: string): Promise<Map<number, UiMapRect>>`
  - `loadZones(): Promise<Map<number, UiMapRect>>` (reads the vendored file)
  - `zonePercentToWorld(rect: UiMapRect, x: number, y: number): WorldPos`
  - `sources.ts` exports `QUESTIE_DB: { repo: "https://github.com/Questie/QuestieDB.git"; tag: string; verifiedOn: string; expiresOn: string }` and `SPF_ZONES: { version: "v1.48.0"; verifiedOn: string; expiresOn: string }`. The tag is the latest QuestieDB release tag on the day of implementation (`gh api repos/Questie/QuestieDB/releases`), and `expiresOn` is `verifiedOn` + 30 days.

- [ ] **Step 1: Branch from main.** `git switch -c feat/route-builder`.
- [ ] **Step 2: Vendor Zones.lua.** `gh api "repos/cjber/shortest-path-forever/contents/Data/Zones.lua?ref=v1.48.0" --jq .content | base64 -d > vendor/shortest-path-forever/Zones.lua`. Append the file name to `VERSION`'s note if the file lists files.
- [ ] **Step 3: Add the tools type-check.** `tools/route-builder/tsconfig.json`:
  - `strict`, `noEmit`, `types: ["node"]`;
  - include `tools/**/*.ts`, `addon/types/*.d.ts` and a `tools/route-builder/types/lua-globals.d.ts` that declares only the Lua globals the imported addon modules reference (`print`, `LuaMultiReturn`). Add whatever else `tsc` reports as missing, one declaration at a time.

  Script: `"typecheck:tools": "tsc -p tools/route-builder/tsconfig.json"`. Change `pretest` to `npm run build && npm run typecheck:tools`. Install `@types/node` pinned to the major of Node 24.
- [ ] **Step 4: Write the failing tests** in `test/zones.test.ts`:

```ts
const LUA = `local _, ns = ...
ns.Zones = {
  [1429] = { low = 1, high = 10, map = 0, minX = -10254, minY = -1935, maxX = -7940, maxY = 1535 },
  [1453] = { city = "A", zone = 1429, map = 0, minX = -9100, minY = 200, maxX = -8100, maxY = 1500 },
}`;
it("parses rects keyed by uiMapId", async () => {
  const zones = await parseZones(LUA);
  expect(zones.get(1429)).toEqual({ uiMapId: 1429, continent: 0, minX: -10254, minY: -1935, maxX: -7940, maxY: 1535, low: 1, high: 10 });
  expect(zones.get(1453)?.low).toBeNull();
});
it("maps zone percent to world like GetWorldPosFromMapPos (x north, y west)", async () => {
  const rect = (await parseZones(LUA)).get(1429)!;
  expect(zonePercentToWorld(rect, 0, 0)).toEqual({ continent: 0, x: -7940, y: 1535 });
  expect(zonePercentToWorld(rect, 100, 100)).toEqual({ continent: 0, x: -10254, y: -1935 });
  expect(zonePercentToWorld(rect, 50, 50)).toEqual({ continent: 0, x: -9097, y: -200 });
});
it("rejects a rect with a missing bound", async () => {
  await expect(parseZones(`local _, ns = ... ns.Zones = { [1] = { map = 0, minX = 1 } }`)).rejects.toThrow(/Zones.lua.*1/);
});
```

- [ ] **Step 5: Run.** `npx vitest run tools/route-builder/test/zones.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 6: Implement `ingest/zones.ts`.** Evaluate the Lua in wasmoon the same way `tools/gen-travel/main.ts` does (`...` = `"SPF", ns`). Convert with `x = maxX - (py/100)*(maxX-minX)` and `y = maxY - (px/100)*(maxY-minY)`.
- [ ] **Step 7: Run all tests.** `npm test`. Expected: PASS, and the tools type-check is clean.
- [ ] **Step 8: Commit.** `chore: add route-builder tooling and zone conversion`.

---

### Task 2: Fetch and load QuestieDB offline

**Files:**
- Create: `tools/route-builder/ingest/fetchQuestie.ts`, `tools/route-builder/ingest/questie.ts`, `tools/route-builder/test/questie.integration.test.ts`
- Modify: `package.json` (`"fetch:questie": "tsx tools/route-builder/ingest/fetchQuestie.ts"`)

**Interfaces:**
- Consumes: `QUESTIE_DB` from `sources.ts`.
- Produces:
  - `questieDir(): string`, which returns `tools/route-builder/.cache/questiedb/<tag>`;
  - `fetchQuestie(): void`, which shallow-clones `QUESTIE_DB.tag` into `questieDir()` if absent and throws if `git` fails;
  - `loadSnapshot(dir: string): Promise<QuestieSnapshot>`, plus the cached JSON at `.cache/snapshot-<tag>.json` with `readCachedSnapshot()` / `writeCachedSnapshot()`.

  `QuestieSnapshot` is defined in Task 3's file and imported here:

```ts
interface QuestieSnapshot {
  tag: string;
  quests: Record<number, Record<string, unknown>>;   // every field questRepository reads, raw (JS arrays, 0-based)
  npcs: Record<number, { spawns: unknown; rank: number | null; friendlyToFaction: string | null; minLevel: number | null; maxLevel: number | null; npcFlags: number | null }>;
  objects: Record<number, { spawns: unknown }>;
  items: Record<number, { npcDrops: number[]; objectDrops: number[] }>;
  questXp: Record<number, [number, number]>;          // [questLevel, xp]
  areaIdToUiMapId: Record<number, number>;
  objectiveFirst: Record<string, Record<number, boolean>>;
  dropRates: Record<number, Record<number, number>>;  // itemId -> npcId -> percent
  dungeons: Record<number, { name: string; altAreaIds: number[]; parentZone: number; entrances: { areaId: number; x: number; y: number }[] }>;
  npcFlagValues: { innkeeper: number; flightMaster: number };   // read from QuestieDB's npcFlags enum
  raceMaskById: Record<number, number>;
}
```

- [ ] **Step 1: Read the harness.** In the clone, read `emulator/client.lua`, `emulator/metadata.lua`, `test.lua` and `docs/` to learn how a Forever QuestieDB is loaded offline in source mode, using `config.flavors` and the `Forever` flavor. Note the call sequence in a comment at the top of `questie.ts`.
- [ ] **Step 2: Write the integration test** (`it.skipIf(!existsSync(questieDir()))`). It loads the snapshot and checks:
  - more than 3000 quests;
  - `questXp` has more than 3000 entries;
  - quest 92432 (Dalaran Sewer Key) has a `name` string;
  - `npcFlagValues.innkeeper > 0`;
  - `dungeons` contains Shadowfang Keep (area 209).
- [ ] **Step 3: Implement `fetchQuestie.ts`.** Use `execFileSync("git", ["clone", "--depth", "1", "--branch", tag, repo, dir])` and wrap any failure in `Error("fetch:questie: …")`.
- [ ] **Step 4: Implement `loadSnapshot`.**
  - Create a wasmoon engine and mount every needed `.lua` file and the TOC from `dir` into the virtual FS (`factory.mountFile`).
  - Run the emulator exactly as QuestieDB's own harness does, for flavor `Forever`. Then run an extraction chunk in Lua that walks `LibQuestieDB.Quest.GetAllIds()` and copies the fields named in `QuestieSnapshot`. Only NPCs, objects and items referenced by quests are copied, plus every NPC whose `npcFlags` has the innkeeper or flight-master bit. Use `Npc.GetAllIds` if the API has it; otherwise stop and report BLOCKED.
  - Return plain Lua arrays and tables to JS, as gen-travel does.
  - **wasmoon runs Lua 5.4.** If QuestieDB needs a 5.1 global (`unpack`, `setfenv`, `bit`…), define a minimal shim before loading, one per missing global, each with a one-line comment. If a shim cannot make it load, stop and report BLOCKED with the error. Never fall back to another data source.
- [ ] **Step 5: Run.** `npm run fetch:questie`, then `npx vitest run tools/route-builder/test/questie.integration.test.ts`. Expected: PASS, not skipped.
- [ ] **Step 6: Commit.** `feat: load QuestieDB offline through its emulator`.

---

### Task 3: Snapshot-backed QuestieDB API

**Files:**
- Create: `tools/route-builder/ingest/snapshot.ts`, `tools/route-builder/test/fixtures.ts`, `tools/route-builder/test/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `type QuestieSnapshot` (shape above);
  - `snapshotLib(s: QuestieSnapshot): LibQuestieDBApi`, which plugs into `createQuestRepository` unchanged;
  - `npcInfo(s, npcId): { minLevel: number; maxLevel: number; flags: number } | null`;
  - `hasFlag(flags: number, bit: number): boolean`, reusing the arithmetic of `maskAllows`;
  - `dropRate(s, itemId, npcId): number | null` (0..1).
- `test/fixtures.ts` exports `snapshot(overrides: Partial<QuestieSnapshot>): QuestieSnapshot` with empty defaults and `tag: "test"`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("feeds createQuestRepository the same way the game lib does", () => {
  const s = snapshot({
    quests: { 7: { name: "Wolves", questLevel: 5, requiredLevel: 3, startedBy: [[100]], finishedBy: [[100]], objectives: [[[200, null, 8]]] } },
    npcs: { 100: { spawns: { 12: [[40, 50]] }, rank: 0, friendlyToFaction: "A", minLevel: 5, maxLevel: 5, npcFlags: 2 },
            200: { spawns: { 12: [[45, 55]] }, rank: 1, friendlyToFaction: null, minLevel: 6, maxLevel: 7, npcFlags: 0 } },
    questXp: { 7: [5, 450] },
    areaIdToUiMapId: { 12: 1429 },
  });
  const result = createQuestRepository(snapshotLib(s));
  if (!result.ok) throw new Error(result.message);
  const q = result.repo.get(7)!;
  expect(q.baseXp).toBe(450);
  expect(q.isElite).toBe(true);
  expect(q.objectives[0]).toEqual({ kind: "npc", id: 200, required: 8, index: 1 });
  expect(result.repo.uiMapIdForArea(12)).toBe(1429);
});
it("returns drop rates as fractions and null when unknown", () => {
  const s = snapshot({ dropRates: { 9: { 200: 35 } } });
  expect(dropRate(s, 9, 200)).toBeCloseTo(0.35);
  expect(dropRate(s, 9, 201)).toBeNull();
});
```

- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** `RequireContract` returns `[true]` only when the snapshot came from contract 4. Store the contract number in the snapshot as `contract` and add it to the type. `Support.Get("QuestXP").db` maps to `questXp` and `Support.Get("ZoneDB").private.areaIdToUiMapId` to `areaIdToUiMapId`.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: serve QuestieDB snapshot through the addon repository`.

---

### Task 4: Dated constants, scenarios, mob XP, drop quantile

**Files:**
- Create: `tools/route-builder/model/constants.ts`, `model/mobXp.ts`, `model/drops.ts`, `test/model.test.ts`

**Interfaces:**
- Produces:
  - `BUILDER`, a record of `DatedValue`:
    - `npcInteractSec` = 7 (spec §7.2 "5 à 10 s", unverified);
    - `objectUseSec` = 3;
    - `lootSec` = 3;
    - `objectYield` = 1 (items per object use);
    - `segmentEndLevel` = 10 (spec §7.7).

    Each one: `source` cites the spec section or says "unverified estimate, MinMaxQuest spec §7.7", `verifiedOn` is today, `expiresOn` is +30 days.
  - `interface Scenario { name: "fast" | "medium" | "slow"; killSec: DatedValue; eliteFactor: DatedValue; dungeonSec: DatedValue }` and `SCENARIOS: Scenario[]`, with these values:

    | Scenario | killSec | eliteFactor | dungeonSec |
    |---|---|---|---|
    | `fast` | 20 | 1.5 | 1800 |
    | `medium` | 30 | 2 | 2700 |
    | `slow` | 50 | 3 | 3600 |

    Kill times come from the user's own figures and Kami Labs (https://kami-labs.fr/en/wow-forever/combien-de-temps-monter-niveau-60-wow-forever/). Dungeon durations are unverified.
  - `expiredBuilderValues(today: string): string[]`. It covers `BUILDER`, every scenario field, `QUESTIE_DB`, `SPF_ZONES`, and the addon's `expiredConstants(today)`.
  - `mobXp(playerLevel: number, mobLevel: number, elite: boolean): number`.
  - `killsForItems(needed: number, chance: number, quantile: number): number`. It returns the smallest n with P(at least `needed` successes in n trials) ≥ `quantile`, and throws if `chance` is outside (0, 1].
  - `COLLECT_QUANTILE = 0.8` (spec §7.2).

- [ ] **Step 1: Verify the formula source.** Fetch `https://raw.githubusercontent.com/vmangos/core/development/src/game/Formulas.h`. Confirm `GetGrayLevel`, `GetZeroDifference` and `BaseGain`, plus the elite multiplier ×2 outside instances. Put the URL and today's date in a comment above `mobXp`. If the tables differ from the expected values below, use the source's values and fix the test values to match, noting it in the report.
- [ ] **Step 2: Write the failing tests.**

```ts
it("matches known equal-level kill XP", () => {
  expect(mobXp(10, 10, false)).toBe(95);
  expect(mobXp(30, 30, false)).toBe(195);
  expect(mobXp(59, 59, false)).toBe(340);
});
it("scales above, below and grey", () => {
  expect(mobXp(10, 11, false)).toBe(100);
  expect(mobXp(10, 14, false)).toBe(114);
  expect(mobXp(10, 20, false)).toBe(114);
  expect(mobXp(10, 8, false)).toBe(68);
  expect(mobXp(10, 4, false)).toBe(0);
  expect(mobXp(10, 10, true)).toBe(190);
});
it("plans collect objectives at the quantile", () => {
  expect(killsForItems(1, 1, 0.8)).toBe(1);
  expect(killsForItems(1, 0.5, 0.8)).toBe(3);
  expect(killsForItems(2, 0.5, 0.8)).toBe(5);
  expect(() => killsForItems(1, 0, 0.8)).toThrow();
});
it("has no expired builder value today", () => {
  expect(expiredBuilderValues(new Date().toISOString().slice(0, 10))).toEqual([]);
});
it("reports an expired value by name", () => {
  expect(expiredBuilderValues("2999-01-01")).toContain("npcInteractSec");
});
```

- [ ] **Step 3: Run.** It fails.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** `npm test`, expect PASS.
- [ ] **Step 6: Commit.** `feat: add dated builder constants, scenarios and XP models`.

---

### Task 5: World model

**Files:**
- Create: `tools/route-builder/model/world.ts`, `test/world.test.ts`. Extend `test/fixtures.ts` with a `world(...)` helper.

**Interfaces:**
- Consumes:
  - `QuestRepository` from `createQuestRepository(snapshotLib(s))`;
  - `npcInfo`, `dropRate`, `hasFlag`;
  - `UiMapRect`, `zonePercentToWorld`;
  - `clusterSpawns` and `CLUSTER_RADIUS_YARDS` from `addon/src/targets/spawns.ts`;
  - `ACCESS_CHAINS` and `resolveSteps` from `addon/src/access/chains.ts`;
  - `TRAVEL`.
- Produces:

```ts
interface Place { pos: WorldPos; uiMapId: number; x: number; y: number; npcId: number | null; objectId: number | null }
type TaskKind = "kill" | "collect" | "use";
interface Task {
  kind: TaskKind; objectiveIndex: number; count: number;   // kills (kill), items (collect), uses (use)
  cluster: { center: Place; loop: Place[] };               // loop = killLoop order from center
  mobLevel: number; elite: boolean;
  dropChance: number;                                       // 1 for kill/use
}
interface RouteQuest {
  id: number; info: QuestInfo; accept: Place; turnin: Place; tasks: Task[];
  dungeonAreaId: number | null;   // zoneOrSort or starter/objective inside a dungeon area
  accessChain: boolean;           // in resolveSteps of any ACCESS_CHAINS entry for this faction
  returnVisit: boolean;           // dungeon follow-up whose prerequisite is a quest of the same dungeon
}
interface Inn { place: Place }
interface Dungeon { areaId: number; name: string; entrance: Place; questIds: number[] }
interface StartZone { key: string; faction: "A" | "H"; raceMask: number; areaId: number; start: Place }
interface World {
  faction: "A" | "H"; raceMask: number;    // union of the faction's races
  quests: Map<number, RouteQuest>; inns: Inn[]; dungeons: Dungeon[]; startZones: StartZone[];
  taxiZone: Map<number, number>;           // taxi node id -> uiMapId of its flight master
  capitalTaxiNode: number;                 // 2 (Stormwind) for A, 23 (Orgrimmar) for H, from TRAVEL
  excluded: Map<string, number>;           // reason -> count
}
function buildWorld(s: QuestieSnapshot, zones: Map<number, UiMapRect>, faction: "A" | "H"): World
```

Rules, as one line each in code:
- **Excluded reasons:** `class`, `noXp`, `noStarter`, `noFinisher`, `noPosition`, `unsupportedObjective` (reputation, spell, event, missing), `noDropRate`, `wrongFaction` (starter not friendly, as in `positions.ts`), `unsupportedRequirement`.
- **Places:** the accept or turn-in place is the first convertible spawn of the first friendly starter or finisher NPC or object. A task cluster is the cluster with the most points among `clusterSpawns(points, CLUSTER_RADIUS_YARDS)`. The builder picks the nearest one later only if this proves weak; YAGNI for now.
- **Item objectives:** NPC sources become a `collect` task with the highest `dropRate` among sources that have spawns. Object sources become a `use` task with `count = ceil(required / objectYield)`.
- **Mob level** is `maxLevel` of the target NPC, and `elite` is its rank.
- **Start zones:** one per race start area of the faction.
  - Races and masks come from `raceMaskById`.
  - Each start area's `areaId` comes from QuestieDB's zone enum (`src/corrections/enum/zones.lua` in the clone), and the code cites that file.
  - Zephras Isle is included for each faction whose races start there.
  - `start` is the accept place of the lowest-`requiredLevel` quest available at level 1 for that race mask whose accept place lies in that area.
- **Sanity check:** for every faction taxi node in `TRAVEL`, take the nearest flight-master NPC place (flag from `npcFlagValues`) on the same continent. If the median distance is above 15 yd, throw `Error("world: zone conversion check failed, median offset N yd")`. Also fill `taxiZone`.

- [ ] **Step 1: Write the failing tests.** Use a fixture world of 2 zones (uiMap 1429 and 1436, rects from the real Zones.lua) and a hand-made `TRAVEL`-like fixture. Assert:
  - a kill quest becomes one `kill` task, with `count` equal to the objective's `required` and `loop.length` equal to the cluster size;
  - a drop quest without a drop rate is excluded with `noDropRate`, and `excluded.get("noDropRate") === 1`;
  - a quest whose area has no uiMap is excluded with `noPosition`;
  - a class quest is excluded with `class`;
  - a dungeon quest (zoneOrSort 209) gets `dungeonAreaId === 209`, and its follow-up gets `returnVisit === true`;
  - quest 92432 in the fixture gets `accessChain === true`;
  - the sanity check throws when a flight master is moved 100 yd away from its node, and passes at 3 yd.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement `buildWorld`.**
- [ ] **Step 4: Add the real-data integration test**, skipped without the cache. `buildWorld` succeeds for both factions, more than 1000 candidate quests per faction, and at least 6 start zones in total. Print the excluded counts.
- [ ] **Step 5: Run.** `npm test`, expect PASS. Run the integration test locally, expect PASS.
- [ ] **Step 6: Commit.** `feat: build the route-builder world model`.

---

### Task 6: Simulator

**Files:**
- Create: `tools/route-builder/sim/simulate.ts`, `test/simulate.test.ts`
- Create: `addon/src/route/format.ts` holding only `export type StepType` for now; Task 9 adds the codec. The type lives in the addon because the addon bundle cannot import from `tools/`.

**Interfaces:**
- Consumes: `World`, `Scenario`, `BUILDER`, `buildGraph`/`solveFrom`/`travelTime`/`firstHop` (graph), `travelSpeed`, `questXp`, `XP_PER_LEVEL`, `CONSTANTS.hearthCooldownSec`, `isAvailable`, `passesMaxLevelOption`, `mobXp`, `killsForItems`.
- Produces:

```ts
// addon/src/route/format.ts
export type StepType = "accept" | "complete" | "turnin" | "fly" | "hearth" | "setHearth" | "getFlightPath" | "grind" | "dungeon";
// tools/route-builder/sim/simulate.ts
interface RouteStep {
  type: StepType; place: Place;
  questId?: number; objectiveIndex?: number; taxiNodeId?: number;
  dungeonAreaId?: number;         // "dungeon": all its accepted quests' objectives complete
  grindToLevel?: number;          // "grind": kill near place until this level
  grindMobLevel?: number;
}
interface SimOptions { maxLevelGap: number | null; tolerant: boolean; raceMask: number }
interface SimState { seconds: number; level: number; xp: number; pos: WorldPos; inLog: Set<number>; completed: Set<number>;
  done: Set<string>; knownTaxi: Set<number>; hearth: { pos: WorldPos | null; readyAt: number }; skipped: Set<number> }
interface StepOutcome { seconds: number; xp: number; violation: string | null }
function initialState(start: Place, level: number, knownTaxi: number[], hearthPos: WorldPos | null): SimState
function cloneState(s: SimState): SimState
function applyStep(s: SimState, step: RouteStep, world: World, scenario: Scenario, opts: SimOptions): StepOutcome
interface SimResult { state: SimState; outcomes: StepOutcome[]; violations: string[] }
function simulate(steps: RouteStep[], start: SimState, world: World, scenario: Scenario, opts: SimOptions): SimResult
```

Semantics, as one line each in code:
- **Travel:** every step with a place first travels there. The time comes from `travelTime` on a graph built with `{ speed: travelSpeed(level), knownTaxiNodes, faction, hearth: { ready: seconds >= readyAt, pos } }`. Cache the graph by the same key as `routing.ts#graphKey`. If `firstHop` is `hearth`, set `readyAt = seconds + hearthCooldownSec`.
- **Service time:**
  - `accept`, `turnin`, `setHearth` and `getFlightPath` add `npcInteractSec`;
  - `kill`: `count × (killSec × (elite ? eliteFactor : 1) + lootSec)`, plus walking the loop once;
  - `collect`: `killsForItems(count, dropChance, COLLECT_QUANTILE)` kills, with the same per-kill cost;
  - `use`: `count × objectUseSec` plus the loop walk;
  - `dungeon`: `dungeonSec`.
- **XP:**
  - kills give `mobXp(level, mobLevel, elite)` each;
  - `turnin` gives `questXp(baseXp, info.level, level, 60)`;
  - `dungeon` gives 0 kill XP (spec §7.7);
  - `grind` adds kills until `grindToLevel` is reached, at `mobXp(level, grindMobLevel, false)` each, `killSec + lootSec` each, plus one loop of 10 spawns. Recompute the XP each level.

  Level-up is applied after each XP gain, using `XP_PER_LEVEL`, and stops at 60.
- **Violations,** reported in strict mode, or the step is skipped in tolerant mode:
  - `accept` when `!isAvailable` or `!passesMaxLevelOption`;
  - `logFull` (an accept with 20 quests in the log);
  - `complete` or `turnin` of a quest not in the log;
  - a `turnin` whose objectives are not done.

  In tolerant mode, a skipped accept adds the quest to `skipped`, and later steps for it are skipped silently.
- **Hearth markers:** a `hearth` step when the stone is not ready is a no-op with no violation. `fly` steps are zero-cost markers, because the next positional step pays the travel. `setHearth` sets `hearth.pos` to the place. `getFlightPath` adds the node to `knownTaxi`.

- [ ] **Step 1: Write the failing tests** on a fixture world with an empty `TravelData` (walking only), so expected times are `yards × CONSTANTS.detourFactor.value / speed`:
  - accept at 70 yd, then a kill task of 3 mobs at level 5, then turn-in: total seconds and XP match the formula. Compute the expectation in the test from the constants, not as literals;
  - level-up mid-route changes the speed used for the next travel (a run starting at level 39 that ends at 40 uses `mountSpeed` after the level-up);
  - accept below `requiredLevel` gives a violation in strict mode, and is skipped with no violation in tolerant mode, together with its turn-in;
  - the 21st accept gives `logFull`;
  - exclusive quests: accepting the second one gives a violation;
  - with `maxLevelGap: 2` at level 10, a quest of level 9 is rejected and one of level 8 is accepted;
  - hearth: a `setHearth` at A, then travel 3000 yd away, then `hearth` and a step at A. The second leg costs about the cast time and sets `readyAt`. A second `hearth` within the cooldown is a no-op and the leg is walked;
  - `grind` to level 3 from level 1 adds exactly the XP needed, plus the kills' time.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** No allocation constraints apply, since this is Node.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: add the leveling simulator`.

---

### Task 7: Block beam search

**Files:**
- Create: `tools/route-builder/opt/build.ts`, `test/build.test.ts`

**Interfaces:**
- Consumes: the simulator (`applyStep`, `cloneState`), `World`, `Scenario`, `isAvailable`, `travelTime`.
- Produces:

```ts
interface Variant { elites: boolean; dungeons: boolean; maxLevelGap: number | null }
interface BuildRequest {
  world: World; scenario: Scenario; variant: Variant; start: SimState; targetLevel: number;
  areaIds: Set<number> | null;   // restrict quests to these accept areas (start segments); null = whole faction
  beamWidth: number;             // default 8
  branching: number;             // default 6
}
interface BuiltRoute { steps: RouteStep[]; end: SimState }
function buildRoute(req: BuildRequest): BuiltRoute
function grindRate(level: number, scenario: Scenario): number   // xp per second, equal-level mob
```

**Algorithm:**
1. **Eligible quests** for the variant:
   - `!elites` drops `info.isElite`;
   - `!dungeons` drops quests with `dungeonAreaId != null`, except `accessChain` ones, which are always kept with their dungeon;
   - quests with `returnVisit && !accessChain` are always dropped (Task 8 emits them as return blocks);
   - `areaIds` filters on the accept place's area.
2. **Blocks:**
   - normal quests are grouped by `accept.uiMapId` and level band `floor((info.level - 1) / 5)`;
   - each dungeon (variant `dungeons`) is one dungeon block holding its eligible quests.
3. **State and score.** A beam node holds `{ state, steps, blocksDone }`. Its score is `state.seconds + remainingXp(state) / grindRate(state.level, scenario)`, where `remainingXp` is the XP left to `targetLevel`. Lower is better.
4. **Expansion.** From each node, the candidates are:
   - the `branching` nearest unfinished blocks (by `travelTime` from `state.pos` to the block's accept centroid) that have at least one quest accept-able at the current level;
   - a **grind** action: one `grind` step to `level + 1` at the nearest kill-task cluster whose mob level is within [level-2, level+1]. If there is none, use the nearest kill cluster of any level and a mob level equal to the player level;
   - a **dungeon block**, which is a candidate once `level ≥ max(requiredLevel)` of its quests. When `level ≥ median(info.level)` it is the only candidate (forced).

   Each normal block is expanded twice: plain, and preceded by a `setHearth` at the inn nearest the block centroid, if one is within 400 yd.
5. **Block fill, greedy.** Done with the simulator, so state stays exact:
   - first, a `getFlightPath` step if the block's uiMap has a faction taxi node not yet known;
   - **accept:** accept available block quests in nearest-neighbour order while the log is under 20, skipping a quest whose ratio `xp / (task service time + 2 × travel from the centroid)` is below `grindRate`;
   - **tasks:** do the accepted quests' tasks in nearest-neighbour order;
   - **turn-ins:** turn in, nearest neighbour;
   - repeat while new block quests became available, for chains.

   A dungeon block goes: accepts outside the dungeon, then one `dungeon` step at the entrance, then turn-ins.
6. **Travel markers.** Before each positional step, if `firstHop` is `hearth`, emit a `hearth` step. If it is `taxi`, emit `fly` with `taxiNodeId = taxiDestination(...)`.
7. **Beam.** Keep the best `beamWidth` nodes by score; ties are broken by fewer seconds, then by lexicographic step ids, for determinism. Stop when every node reaches `targetLevel`, and return the lowest `state.seconds`. If no node can progress, throw an `Error` with the level and the remaining block count.

- [ ] **Step 1: Write the failing tests** on synthetic worlds:
  - **two zones 3000 yd apart,** 4 quests each, same level: the route does all of one zone before moving, and its time is below the naive alternating order simulated with the same simulator;
  - **25 accept-able quests in one block:** the log never exceeds 20 and the simulation has no violations;
  - **forced dungeon:** with `dungeons: true`, the route contains exactly one `dungeon` step and every non-return quest of that dungeon is turned in. With 18 quests already in the log, at most 2 dungeon quests are accepted, and there are no violations. With `dungeons: false` there is none, except for an `accessChain` dungeon quest, which is still in the route;
  - **`maxLevelGap: 3` from level 1:** the first steps are `grind` and the route reaches `targetLevel`;
  - **hearth:** a world where a hub is visited twice with a far zone in between. The chosen route contains `setHearth` then `hearth` when that is faster;
  - **determinism:** two runs give equal steps (`toEqual`).
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: add the block beam search route builder`.

---

### Task 8: Variants, scenario selection, race check, return blocks

**Files:**
- Create: `tools/route-builder/opt/variants.ts`, `test/variants.test.ts`

**Interfaces:**
- Consumes: `buildRoute`, `simulate`, `SCENARIOS`, `World`.
- Produces:

```ts
type VariantKey = string;   // `e${0|1}d${0|1}x${0|1|2|3}`, x0 = max level option off
function variantKey(v: Variant): VariantKey
function allVariants(): Variant[]   // 16, in key order
interface Evaluated { steps: RouteStep[]; secondsByScenario: Record<Scenario["name"], number>; average: number;
  worstRace: { raceMask: number; seconds: number; skipped: number } }
interface FactionRoutes {
  faction: "A" | "H";
  segments: Record<string, Record<VariantKey, Evaluated>>;   // start zone key -> variant
  trunk: Record<VariantKey, Evaluated>;
  returnBlocks: Record<number, RouteStep[]>;                 // dungeon areaId -> insertable steps
}
function buildFaction(world: World, opts: { beamWidth: number; branching: number }): FactionRoutes
```

**Rules:**
- **Segment:**
  - starts at `startZone.start`, level 1, no known taxi node, hearth bound at the inn nearest the start;
  - `areaIds` holds the start area and its sub-areas, i.e. areas whose uiMap equals the start area's uiMap;
  - `targetLevel` is `BUILDER.segmentEndLevel`.
- **Trunk:** starts at the place of taxi node `capitalTaxiNode`, level 10, knows that node, hearth bound at the inn nearest it, `areaIds` null, `targetLevel` 60.
- **Scenario selection:** for each (segment or trunk, variant), build once per scenario. Simulate each candidate under all three scenarios (strict, faction-wide race mask) and keep the lowest average. Any strict violation throws, naming the variant and the step.
- **Race check:** simulate the winner in tolerant mode for each race of the faction, or each race of the start zone for a segment. Store the worst seconds and its skipped count.
- **Return blocks:** for each dungeon with `returnVisit && !accessChain` quests, emit `[accept…, dungeon, turnin…]` steps for those quests in quest-chain order, with places from the world.
- **Parallelism:** none (YAGNI). Run sequentially and log progress per variant to stderr.

- [ ] **Step 1: Write the failing tests** on a small synthetic world with one start zone:
  - `allVariants()` has 16 unique keys, and `variantKey({elites: true, dungeons: false, maxLevelGap: 2}) === "e1d0x2"`;
  - `buildFaction` fills one segment, one trunk entry and the return blocks for every key;
  - the winner's `average` equals the mean of its three scenario times;
  - a race-specific quest in the trunk gives `worstRace.skipped >= 1` for the other race.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: build all route variants with scenario selection`.

---

### Task 9: Route codec, Lua emit and report

**Files:**
- Create: `addon/src/route/format.ts`, `addon/test/routeFormat.test.ts`, `tools/route-builder/emit/emit.ts`, `tools/route-builder/test/emit.test.ts`

**Interfaces:**
- Produces, in `addon/src/route/format.ts`, which is TSTL-safe: no regex, no `Map`/`Set` in the codec, only `split`, `indexOf`, `slice`, `Number(...)` and string concatenation:

```ts
interface EmittedStep {
  type: StepType; uiMapId: number; x: number; y: number;
  questId?: number; objectiveIndex?: number; npcId?: number; taxiNodeId?: number;
  loop?: [number, number][]; targetLevel: number; targetXpIntoLevel: number;
  estCostSeconds: number; estXpGain: number; unlocks?: number[]; races?: number;
}
function encodeSteps(steps: EmittedStep[]): string
function decodeSteps(text: string): EmittedStep[]   // throws on a malformed line, naming the line number
```

  `StepType` stays the one defined in Task 6.

**Format:**
- One step per line. Fields are separated by `;` in the order of the interface. An absent optional field is empty.
- `x` and `y` have 2 decimals. Seconds and XP are integers.
- `loop` is `x:y,x:y`. `unlocks` is `id,id`.
- `type` is one letter: `a` accept, `c` complete, `t` turnin, `f` fly, `h` hearth, `s` setHearth, `p` getFlightPath, `g` grind, `d` dungeon.

**Emit:**
- `emitFaction(routes: FactionRoutes, meta: { build: string; questieDb: string; generatedOn: string; constants: Record<string, number> }): string` writes:

  ```lua
  MinMaxQuestRoutes = MinMaxQuestRoutes or {}
  MinMaxQuestRoutes.<Alliance|Horde> = { meta = {...}, segments = { <zone> = { <key> = [[...]] } }, trunk = { <key> = [[...]] }, returnBlocks = { [<areaId>] = [[...]] } }
  ```

  Long strings use a level-N bracket that is absent from the content.
- **`EmittedStep` fields:**
  - `targetLevel` and `targetXpIntoLevel` are the medium-scenario state after the step;
  - `estCostSeconds` and `estXpGain` are the medium outcome;
  - `unlocks` comes from `addon/src/quests/followUps.ts` if it exposes a pure helper, otherwise from `info.nextInChain` and `children`;
  - `races` is `info.races`, when non-zero.
- `emitReport(all: FactionRoutes[], world: World[], meta): string` writes markdown:
  - one table per faction, with one row per variant key: hours per scenario, average hours, quests turned in, grind share %, steps, worst race hours and skipped;
  - one table per start zone, with the same columns;
  - the excluded-quest counts by reason;
  - the zone-conversion check median offset.

- [ ] **Step 1: Write the failing tests.**
  - `decodeSteps(encodeSteps(steps))` round-trips 3 steps covering every optional field and an empty `loop`. Coordinates are rounded to 2 decimals in the expectation.
  - `decodeSteps("z;1;2")` throws with `/line 1/`.
  - Emitted Lua evaluated in wasmoon gives `MinMaxQuestRoutes.Alliance.trunk.e0d0x0` as a string that decodes back to the input steps.
  - The report contains the header row and one row per variant.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** Check that `npm run build` (TSTL) still compiles. `format.ts` is not imported by `main.ts` yet, so add `addon/src/route/format.ts` to a test-only TSTL compile in the vitest test: compile with `tstl` on that one file to a temp dir and run it in wasmoon to decode one encoded string, the same way `gameLua.test.ts` loads compiled code.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: add route codec, Lua emit and report`.

---

### Task 10: CLI and first real generation

**Files:**
- Create: `tools/route-builder/main.ts`
- Modify: `package.json` (`"gen:routes": "tsx tools/route-builder/main.ts"`)
- Generated, committed: `data/routes/Alliance.lua`, `data/routes/Horde.lua`, `data/routes/report.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Implement `main.ts`.**
  1. Abort if `expiredBuilderValues(today)` is non-empty, listing the names.
  2. `fetchQuestie()`.
  3. Read the cached snapshot, or `loadSnapshot` then write the cache.
  4. `loadZones()`.
  5. Build the world per faction, with the sanity check.
  6. `buildFaction` per faction.
  7. Emit the two Lua files and the report.
  8. Print the total time.

  Wrap all of it in `try/catch`: `console.error(error.message)` and `process.exitCode = 1`. Add `--faction A|H` and `--variant <key>` flags for quick runs. Both default to all.
- [ ] **Step 2: Quick run.** `npm run gen:routes -- --faction A --variant e0d0x0`. Expected:
  - exit 0;
  - the report shows an Alliance trunk 10→60 time between 40 and 200 average hours. Outside that range, inspect the report before going on and record the finding in the commit body;
  - every start zone's segment reaches level 10.
- [ ] **Step 3: Full run.** `npm run gen:routes`. Expected: exit 0, all 16 keys for both factions, total runtime printed. If it takes over 30 min, lower `beamWidth` to 4 and record it.
- [ ] **Step 4: Check the output sizes.** If either Lua file is above 5 MB, note it in the report header (Plan 3 decides on load-on-demand packaging).
- [ ] **Step 5: Run.** `npm test`, expect PASS. The generated files are not loaded by the TOC; confirm `MinMaxQuest_Camelot.toc` is unchanged.
- [ ] **Step 6: Commit.** Code: `feat: add gen:routes CLI`. Data: `chore: generate first routes` (report summary in the body).

---

### Task 11: RXP benchmark

**Files:**
- Create: `tools/route-builder/bench/rxp.ts`, `tools/route-builder/test/rxp.test.ts`
- Modify: `tools/route-builder/main.ts` (`--bench <path to RXPGuides/Guides/forever>`), `emit/emit.ts` (benchmark table)

**Interfaces:**
- Produces: `parseRxpGuide(text: string, world: World): RouteStep[]`, which maps `.accept <id>`, `.complete <id>,<n>` and `.turnin <id>` to steps with world places. Every other directive is ignored. Unknown quest ids are dropped and counted.
- The benchmark only reads the user's local install and never copies guide content into the repo: RXP is CC BY-NC-SA.

- [ ] **Step 1: Write the failing test** on an inline 6-line guide snippet written for the test (not copied from RXP), using the fixture world: 2 accepts, 1 complete, 2 turnins and one unknown id, which gives 5 steps and 1 dropped.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** With `--bench`, parse each Forever start-zone guide file of the user's install, simulate it in tolerant mode under the medium scenario from the matching segment start, and report its time to its final level next to our segment's time to the same level.
- [ ] **Step 4: Run.** `npm test` (PASS), then `npm run gen:routes -- --faction A --variant e0d0x0 --bench "<AddOns>/RXPGuides/Guides/forever"`. The report shows a benchmark table. Record in the commit body whether our segments beat RXP.
- [ ] **Step 5: Commit.** `feat: benchmark start segments against local RXP guides`.

---

## After the plan

Open a PR `feat/route-builder` → `main`, with the report summary in the body. Plan 3 covers:
- the route follower and its loading;
- load-on-demand data addons;
- per-dungeon return toggles and Access insertion;
- in-game kill-time telemetry (`UnitHealthMax` / measured DPS);
- ALNS;
- daily CI regeneration.

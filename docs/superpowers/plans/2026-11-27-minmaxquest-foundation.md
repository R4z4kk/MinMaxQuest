# MinMaxQuest Foundation (Plan 1/3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, installable MinMaxQuest addon for WoW: Forever with the single tabbed window, the movable arrow, the in-game travel graph, the Completion tab (proximity/zone), the Access tab, the quest-log pin, the skip dialog, auto-fly and map pins. The Quest tab shows a "routes not installed" state; precomputed routes come in Plans 2 and 3.

**Architecture:** TypeScript compiled to one Lua 5.1 bundle with TypeScriptToLua (TSTL). Game-agnostic logic lives in pure modules (no WoW globals) tested with vitest in Node; thin adapter modules touch the WoW API and are verified in game. Quest data is read at runtime from the QuestieDB addon (`LibQuestieDB`, contract 4); travel data (taxi nodes, flight times, boats) is generated offline from a vendored copy of Shortest Path Forever into a TS data module.

**Tech Stack:** Node 24, TypeScript 5, TypeScriptToLua, vitest, wasmoon (Lua VM in Node, used for the bundle smoke test and to read vendored Lua data), WoW: Forever client 1.60.1 (Interface 16001).

**Spec:** `docs/superpowers/specs/2026-11-27-minmaxquest-design.md`

**Scope split (from the spec §10):**
- Plan 1 (this one): spec §10 steps 1–3 plus the in-game travel graph (§6.4.1), pin (§6.1), skip dialog (§6.1), auto-fly (§6.7), map pins (§6.6), stale-data banner (§6.9).
- Plan 2: offline route builder (spec §7: ingest, constants, simulator, beam search, variants, emit, quality checks).
- Plan 3: Quest-tab route follower (§6.2), Access-chain insertion, telemetry (§6.8), ALNS, CI publish (§8).

## Global Constraints

- All code, identifiers, file names, commit messages and comments in English; comments minimal. User-facing strings in frFR and enUS.
- TypeScript only (no hand-written Lua except vendored data). No `any`. No explicit `undefined` (type or value); absent values are checked with `== null` / `!= null` (TSTL compiles to `== nil`).
- Never write `Co-Authored-By:` in commits.
- Interface `16001`; TOC file `MinMaxQuest_Forever.toc`; required dependency `QuestieDB`; QuestieDB contract required: `4` (`LibQuestieDB.RequireContract(4)`).
- SavedVariables: `MinMaxQuestDB` (account), `MinMaxQuestCharDB` (per character).
- Theme (exact): background `rgba(8,8,9,.93)` → `0.031, 0.031, 0.035, 0.93`; border `rgba(255,255,255,.07)`; text `#e6e6e6`; secondary text `#8b8b8b`; accent `#c9a75a`; font `Fonts\ARIALN.TTF`.
- Tabs in this order: `Quest | Access | Completion` (frFR: `Quête | Accès | Complétion`), Quest selected by default.
- Arrow refresh capped at 30 Hz; no table allocation in `OnUpdate`.
- Completion target re-sort at most every 2 s; proximity mode sorts by travel time over all continents; zone mode restricts to the chosen zone.
- Kill-loop waypoint advances within 25 yards.
- Every external value (speeds, detour factor, hearthstone, taxi times) carries `source`, `verifiedOn`, `expiresOn`; an expired constant fails the test suite. In game an expired constant or a build mismatch shows a banner and never blocks (user decision, spec §6.9).
- Errors: a failing feature prints one user-visible message (`MinMaxQuest: …`) and disables itself; no repeated Lua errors.
- Never modify Blizzard functions; only `hooksecurefunc`. No frame creation or `Show()` on secure/protected frames during combat (`InCombatLockdown()`); defer to `PLAYER_REGEN_ENABLED`.
- License GPL-3.0.

## Review Focus

1. **Player in an instance, on a taxi, or on a map with no position** (`C_Map.GetBestMapForUnit` nil, `GetPlayerFacing()` nil): the arrow hides, the window still renders, no Lua error. Test: Task 3 `heading returns null when facing is null`, Task 12 `refreshTargets with null player position keeps previous list`.
2. **QuestieDB absent, older, or contract mismatch:** one clear chat message and an in-window notice; no other module runs. Test: Task 4 `createQuestRepository returns error result on contract mismatch`.
3. **Quest data with missing or sentinel coordinates** (`(-1,-1)`, empty spawn list, AreaId without UiMapID): the objective is skipped, never crashes, other targets still sort. Test: Task 6 `clusterSpawns ignores sentinel points`, Task 7 `objective without positions is excluded`.
4. **Unreachable target** (other continent with no known boat/flight path, or unknown flight nodes): travel time is `Infinity`; such targets sort last and display `—`. Test: Task 5 `cross-continent target without dock is unreachable`.
5. **Level 60 character:** quest XP is 0, skip dialog shows 0 XP lost, Completion still works. Test: Task 2 `questXp returns 0 at max level`.

---

## File Structure

```
MinMaxQuest/                         (repo root = the addon folder)
├─ MinMaxQuest_Forever.toc           loads build/MinMaxQuest.lua
├─ package.json  tsconfig.json  vitest.config.ts  .gitignore  LICENSE
├─ addon/
│  ├─ types/wow.d.ts                 minimal hand-written WoW API declarations (only what we call)
│  ├─ types/questiedb.d.ts           LibQuestieDB declarations (from QuestieDB/Types/*.t.lua)
│  ├─ src/main.ts                    bootstrap and event wiring
│  ├─ src/core/constants.ts          dated constants
│  ├─ src/core/questXp.ts            Forever quest XP formula
│  ├─ src/core/geometry.ts           WorldPos, distance, heading, formatting
│  ├─ src/core/report.ts             user-visible errors, feature disabling
│  ├─ src/core/storage.ts            SavedVariables defaults
│  ├─ src/core/l10n.ts               frFR/enUS strings
│  ├─ src/data/questRepository.ts    QuestieDB adapter → domain types
│  ├─ src/data/generated/travel.ts   generated travel data (do not edit)
│  ├─ src/quests/availability.ts     pure availability rules
│  ├─ src/quests/followUps.ts        pure follow-up chain and lost XP
│  ├─ src/travel/graph.ts            pure travel graph and Dijkstra
│  ├─ src/targets/spawns.ts          pure spawn clustering and kill loop
│  ├─ src/targets/completion.ts      pure Completion target selection
│  ├─ src/access/chains.ts           Access chain definitions
│  ├─ src/access/progress.ts         pure chain resolution and progress
│  ├─ src/game/playerState.ts        WoW adapter: player, log, completed quests, position
│  ├─ src/game/engine.ts             refresh loop, current target, pin state
│  ├─ src/arrow/arrowFrame.ts        arrow frame
│  ├─ src/ui/theme.ts  window.ts  completionTab.ts  accessTab.ts  questTab.ts  skipDialog.ts  banner.ts
│  ├─ src/questlog/pinButtons.ts     pin buttons in the Blizzard quest log
│  ├─ src/taxi/match.ts              pure taxi name matching
│  ├─ src/taxi/autoFly.ts            TAXIMAP_OPENED handler, known nodes
│  ├─ src/map/pins.ts                world map and minimap pins
│  └─ test/*.test.ts                 vitest (pure modules + bundle smoke test)
├─ tools/gen-travel/main.ts          builds addon/src/data/generated/travel.ts
└─ vendor/shortest-path-forever/     pinned Taxi.lua, Routes.lua, Transports.lua, LICENSE, VERSION
```

---

### Task 1: Repository, toolchain, TOC and bundle smoke test

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `LICENSE` (GPL-3.0 text), `MinMaxQuest_Forever.toc`, `addon/types/wow.d.ts`, `addon/src/main.ts`, `addon/test/smoke.test.ts`, `addon/test/helpers/wowStubs.ts`

**Interfaces:**
- Produces: `npm run build` → `build/MinMaxQuest.lua`; `npm test` → vitest; global `MinMaxQuest = { version: string }` set by `main.ts`.

- [ ] **Step 1: Init repo and package**

```bash
git init -b main
npm init -y
npm i -D typescript typescript-to-lua lua-types vitest wasmoon tsx
```
`package.json` scripts: `"build": "tstl -p tsconfig.json"`, `"test": "vitest run"`, `"gen:travel": "tsx tools/gen-travel/main.ts"`.
`.gitignore`: `node_modules/`, `build/`, `.superpowers/`.

- [ ] **Step 2: Configure TSTL**

`tsconfig.json`: `strict: true`, `target: "ESNext"`, `lib: ["ESNext"]`, `types: ["lua-types/5.1"]`, `include: ["addon/src", "addon/types"]`, and
```json
"tstl": { "luaTarget": "5.1", "luaBundle": "build/MinMaxQuest.lua", "luaBundleEntry": "addon/src/main.ts", "noImplicitSelf": true }
```
`vitest.config.ts`: `test.include = ["addon/test/**/*.test.ts", "tools/**/*.test.ts"]`.

- [ ] **Step 3: TOC**

`MinMaxQuest_Forever.toc`:
```
## Interface: 16001
## Title: MinMaxQuest
## Notes: Quest guide for WoW Forever
## Version: 0.1.0
## Dependencies: QuestieDB
## SavedVariables: MinMaxQuestDB
## SavedVariablesPerCharacter: MinMaxQuestCharDB

build\MinMaxQuest.lua
```

- [ ] **Step 4: Write the failing smoke test** `addon/test/smoke.test.ts`

```ts
it("bundle loads in a Lua VM with WoW stubs", async () => {
  const lua = await createLuaWithWowStubs(); // helpers/wowStubs.ts
  await lua.doFile("build/MinMaxQuest.lua");
  expect(lua.global.get("MinMaxQuest").version).toBe("0.1.0");
});
```
`helpers/wowStubs.ts` exports `createLuaWithWowStubs(): Promise<LuaEngine>`: wasmoon engine, sets `unpack = table.unpack`, and a recursive stub for `CreateFrame`, `C_Map`, `C_QuestLog`, `C_SuperTrack`, `hooksecurefunc`, `UnitLevel`, `GetBuildInfo`, `LibQuestieDB` (a metatable that returns callable no-op stubs for any key).

- [ ] **Step 5: Run to verify it fails** — `npm test -- smoke` → FAIL (file not found).

- [ ] **Step 6: Implement minimal `addon/src/main.ts`** setting `_G.MinMaxQuest = { version: "0.1.0" }`, and `addon/types/wow.d.ts` with only `declare const _G: ...` for now (later tasks extend it).

- [ ] **Step 7: Build and test** — `npm run build && npm test` → PASS.

- [ ] **Step 8: In game** — `/reload`; `/dump MinMaxQuest.version` prints `"0.1.0"`; no error.

- [ ] **Step 9: Commit** — `git add -A && git commit -m "chore: scaffold TSTL addon with bundle smoke test"` (the first commit also adds existing `docs/`, `reports/`, `research_notes/`).

---

### Task 2: Dated constants, Forever quest XP, source hygiene guard

**Files:**
- Create: `addon/src/core/constants.ts`, `addon/src/core/questXp.ts`, `addon/test/constants.test.ts`, `addon/test/questXp.test.ts`, `addon/test/hygiene.test.ts`

**Interfaces:**
- Produces:
  - `interface DatedValue { value: number; source: string; verifiedOn: string; expiresOn: string }` (ISO dates)
  - `const CONSTANTS: { runSpeed; mountSpeed; epicMountSpeed; detourFactor; hearthCooldownSec; hearthCastSec; taxiSpeed }` each a `DatedValue`
  - `function expiredConstants(today: string): string[]` (names of expired entries)
  - `function questXp(baseXp: number, questLevel: number, charLevel: number, maxLevel: number): number`

Values (all `verifiedOn: "2026-11-27"`, `expiresOn: "2026-12-27"`):
| name | value | source |
|---|---|---|
| runSpeed | 7 | https://warcraft.wiki.gg/wiki/Movement_speed |
| mountSpeed | 11.2 | same |
| epicMountSpeed | 14 | same |
| taxiSpeed | 30.03 | RXP direct flight times vs Forever TaxiPathNode lengths, research_notes/…/missing_data_sources.md |
| detourFactor | 1.25 | Questwarden docs/ROUTE_OPTIMIZATION.md (unvalidated) |
| hearthCooldownSec | 3600 | wago.tools SpellCooldowns build 1.60.1.71139 spell 8690 |
| hearthCastSec | 10 | wago.tools SpellCastTimes build 1.60.1.71139 |

- [ ] **Step 1: Failing tests**

```ts
// questXp.test.ts — mirrors Questie getAdjustedXP (Questie/Database/QuestXP/QuestieXP.lua:59-97), Forever branch, buff multiplier 1
expect(questXp(1000, 10, 10, 60)).toBe(1000);
expect(questXp(1000, 10, 16, 60)).toBe(800);
expect(questXp(1000, 10, 30, 60)).toBe(500);   // Forever floor 50%
expect(questXp(87, 10, 10, 60)).toBe(85);
expect(questXp(1000, 55, 60, 60)).toBe(0);     // "questXp returns 0 at max level"
// constants.test.ts
expect(expiredConstants("2026-12-01")).toEqual([]);
expect(expiredConstants("2027-01-01")).toContain("runSpeed");
it("no constant is expired today", () => expect(expiredConstants(new Date().toISOString().slice(0, 10))).toEqual([]));
// hygiene.test.ts: scans addon/src and tools/**/*.ts (excluding generated/) and fails on /\bany\b/ in type positions or the token `undefined`
```

- [ ] **Step 2: Run** — `npm test` → FAIL (modules missing).
- [ ] **Step 3: Implement** both modules (formula exactly as Questie: multiplier `2*(q-c)+20` clamped to `[5,10]`, `xp*mult/10`, then the 5/10/25/50 rounding bands, `floor`; return 0 when `charLevel == maxLevel`).
- [ ] **Step 4: Run** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: add dated constants and Forever quest XP formula`.

---

### Task 3: Geometry

**Files:** Create `addon/src/core/geometry.ts`, `addon/test/geometry.test.ts`

**Interfaces:**
- Produces:
  - `interface WorldPos { continent: number; x: number; y: number }` (Blizzard world coords, yards)
  - `function distance(a: WorldPos, b: WorldPos): number` (`Infinity` if continents differ)
  - `function heading(player: WorldPos, facing: number | null, target: WorldPos): number | null` — arrow rotation in radians, `null` if facing is null or continents differ
  - `function formatDistance(yards: number, locale: "frFR" | "enUS"): string` (`"142 m"`, `"1,1 km"` frFR / `"1.1 km"` enUS; `"—"` for `Infinity`)
  - `function formatDuration(seconds: number): string` (`"~2 min"`, `"<1 min"`, `"—"`)

- [ ] **Step 1: Failing tests** — `distance` 3-4-5 → 5; cross-continent → `Infinity`; `heading returns null when facing is null`; target due north with facing 0 → 0; target due west with facing 0 → `π/2` (WoW: world x = north, world y = west, facing counter-clockwise from north); `formatDistance(1100,"frFR") === "1,1 km"`; `formatDuration(Infinity) === "—"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: add world geometry helpers`.

---

### Task 4: QuestieDB adapter and availability rules

**Files:**
- Create: `addon/types/questiedb.d.ts`, `addon/src/data/questRepository.ts`, `addon/src/quests/availability.ts`, `addon/test/availability.test.ts`, `addon/test/questRepository.test.ts`

**Interfaces:**
- Consumes: `WorldPos` (Task 3).
- Produces:
```ts
interface QuestInfo {
  id: number; name: string; level: number; requiredLevel: number; requiredMaxLevel: number | null;
  races: number; classes: number;                // 0 = any
  preGroup: number[]; preSingle: number[]; exclusiveTo: number[];
  nextInChain: number | null; children: number[];
  starterNpcs: number[]; starterObjects: number[]; finisherNpcs: number[]; finisherObjects: number[];
  objectives: QuestObjectiveRef[]; baseXp: number;  // 0 when unknown
  hasUnsupportedRequirement: boolean;            // requiredSkill / minRep / maxRep / requiredSpell present
  isElite: boolean;                              // any creature objective NPC with rank 1..3
  zoneAreaId: number | null;
}
type QuestObjectiveRef = { kind: "npc" | "object" | "item"; id: number; required: number; index: number };
interface QuestRepository {
  get(id: number): QuestInfo | null;
  allIds(): number[];
  npcSpawns(npcId: number): AreaPoint[];       // AreaPoint = { areaId: number; x: number; y: number } (percent)
  objectSpawns(objectId: number): AreaPoint[];
  itemSources(itemId: number): { npcs: number[]; objects: number[] };
  uiMapIdForArea(areaId: number): number | null; // Support.Get("ZoneDB").private.areaIdToUiMapId
}
type RepoResult = { ok: true; repo: QuestRepository } | { ok: false; message: string };
function createQuestRepository(lib: LibQuestieDBApi | null): RepoResult;
interface PlayerQuestState { level: number; raceMask: number; classMask: number; completed: Set<number>; inLog: Set<number> }
function isAvailable(q: QuestInfo, p: PlayerQuestState): boolean;
function isTrivial(q: QuestInfo, p: PlayerQuestState, greenRange: number): boolean; // grey quest
function passesMaxLevelOption(q: QuestInfo, p: PlayerQuestState, minLevelGap: number | null): boolean; // spec §6.1: quest level <= player level - X
```
QuestieDB reads: `lib.Quest.Get(id, field)` with field names from `QuestieDB/Types/Quest.t.lua`; XP from `lib.Support.Get("QuestXP").db[id][2]`; rank from `lib.Npc.Get(id, "rank")`; item drops from `lib.Item.Get(id, "npcDrops")` / `"objectDrops"`.

- [ ] **Step 1: Failing tests** (`availability.test.ts`, plain objects, no WoW):
  - available when level ≥ requiredLevel, all `preGroup` completed, any `preSingle` completed, none of `exclusiveTo` completed or in log, not completed, not in log;
  - not available when race mask does not match (`(races & raceMask) == 0` with races ≠ 0);
  - not available when `hasUnsupportedRequirement`;
  - `isTrivial(level 10 quest, player 16, greenRange 5)` → true; player 14 → false;
  - `passesMaxLevelOption(q level 15, player 15, 2)` → false; q level 13 → true; option null → true.
  (`questRepository.test.ts`): `createQuestRepository returns error result on contract mismatch` (fake lib whose `RequireContract` returns `false, "msg"`), and `createQuestRepository(null)` → `{ ok: false }`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `availability.ts` (pure) and `questRepository.ts` (adapter; `RequireContract(4)` first; maps QuestieDB tuples to `QuestInfo`; `isElite` from NPC rank; never throws — invalid rows return `null`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: In game** — temporary `/mmq q 33` prints name, level and objective count for quest 33 (keep the command; it becomes the debug command of Task 12).
- [ ] **Step 6: Commit** — `feat: read quests from QuestieDB with availability rules`.

---

### Task 5: Travel data generator and travel graph

**Files:**
- Create: `vendor/shortest-path-forever/{Taxi.lua,Routes.lua,Transports.lua,LICENSE,VERSION}`, `tools/gen-travel/main.ts`, `tools/gen-travel/main.test.ts`, `addon/src/data/generated/travel.ts`, `addon/src/travel/graph.ts`, `addon/test/graph.test.ts`

**Interfaces:**
- Consumes: `WorldPos`, `distance` (Task 3), `CONSTANTS` (Task 2).
- Produces:
```ts
// generated/travel.ts
interface TravelData {
  source: { name: "Shortest Path Forever"; version: string; build: string; generatedOn: string };
  taxiNodes: { id: number; name: string; pos: WorldPos; faction: "A" | "H" | "AH" }[];
  taxiEdges: { from: number; to: number; seconds: number }[];
  transports: { fromDock: WorldPos; toDock: WorldPos; seconds: number; periodSec: number }[];
}
export const TRAVEL: TravelData;
// travel/graph.ts
interface TravelContext { speed: number; knownTaxiNodes: Set<number>; faction: "A" | "H"; hearth: { ready: boolean; pos: WorldPos | null } }
interface TravelPlan { times: Map<number, number>; via: Map<number, number>; nodePos: Map<number, WorldPos> } // graph node id -> seconds / predecessor
function buildGraph(data: TravelData, ctx: TravelContext): TravelGraph;
function solveFrom(graph: TravelGraph, origin: WorldPos, ctx: TravelContext): TravelPlan;
function travelTime(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): number; // Infinity if unreachable
function firstHop(plan: TravelPlan, graph: TravelGraph, target: WorldPos, ctx: TravelContext): { kind: "walk" | "taxi" | "boat" | "hearth"; pos: WorldPos; taxiNodeId: number | null } | null;
```
Rules: walking edge = `distance * CONSTANTS.detourFactor.value / ctx.speed`; walking across continents is impossible; taxi edges only between nodes in `knownTaxiNodes` and of the player's faction (`"AH"` allowed for both); boat edge cost = `periodSec / 2 + seconds`; hearth edge from origin to `hearth.pos` costs `CONSTANTS.hearthCastSec.value` when `ready`. `travelTime` = min(direct walk, min over the 3 nearest graph nodes on the target's continent of `times[n] + walk(n, target)`) (bounded cost per target).

- [ ] **Step 1: Vendor data** — download the current "Shortest Path Forever" release (CurseForge project by cjber, GPL-3.0), copy `Data/Taxi.lua`, `Data/Routes.lua`, `Data/Transports.lua` and its license into `vendor/shortest-path-forever/`; write the release version and download date into `VERSION`.
- [ ] **Step 2: Failing generator test** (`tools/gen-travel/main.test.ts`): running `generateTravel(vendorDir)` returns ≥ 100 taxi nodes, every edge `seconds > 0`, every node continent in `{0, 1}` or a Forever continent id present in the file, and `source.build === "1.60.1.71139"` (read from the file header line `CSV build 1.60.1.71139`).
- [ ] **Step 3: Implement `tools/gen-travel/main.ts`** — evaluate each vendored Lua file in wasmoon with `...` bound to `("SPF", ns)`, read `ns` tables, map faction flags (TaxiNodes `Flags` bit 1 = Alliance, bit 2 = Horde), write `addon/src/data/generated/travel.ts` with a `// Generated by tools/gen-travel — do not edit` header. `npm run gen:travel` → file written; test PASS.
- [ ] **Step 4: Failing graph tests** (`graph.test.ts`, synthetic `TravelData`):
  - same-continent target, no taxi: time = `d * 1.25 / 7`;
  - known taxi A→B 60 s with target near B: taxi path chosen when faster, `firstHop.kind === "taxi"` and `taxiNodeId === A`;
  - unknown taxi node is ignored;
  - `cross-continent target without dock is unreachable` → `Infinity`, `firstHop` → `null`;
  - with a dock pair (period 300 s, ride 120 s): cross-continent time includes `150 + 120`;
  - hearth ready and home next to target: hearth wins.
- [ ] **Step 5: Run** → FAIL. **Step 6: Implement `graph.ts`** (binary-heap Dijkstra over ≤ ~200 nodes). **Step 7: Run** → PASS.
- [ ] **Step 8: Commit** — `feat: add generated travel data and travel-time graph`.

---

### Task 6: Spawn clustering and kill loop

**Files:** Create `addon/src/targets/spawns.ts`, `addon/test/spawns.test.ts`

**Interfaces:**
- Consumes: `WorldPos`, `distance` (Task 3).
- Produces:
  - `interface SpawnCluster { center: WorldPos; points: WorldPos[] }`
  - `function clusterSpawns(points: WorldPos[], radius: number): SpawnCluster[]` — greedy: take an unassigned point, absorb all unassigned within `radius` (yards), center = mean; sentinel/invalid points are dropped.
  - `function pickCluster(clusters: SpawnCluster[], timeTo: (p: WorldPos) => number): SpawnCluster | null` — min `timeTo(center)`, tie → more points.
  - `function killLoop(cluster: SpawnCluster, start: WorldPos): WorldPos[]` — nearest-neighbour order from `start`.
  - `function nextLoopIndex(loop: WorldPos[], current: number, player: WorldPos, advanceYards: number): number` — advances (wrapping) when within `advanceYards` (25).
  - `const CLUSTER_RADIUS_YARDS = 60` **(choice, tunable)**.

- [ ] **Step 1: Failing tests** — two groups 500 yd apart → 2 clusters; `clusterSpawns ignores sentinel points` (points converted from `(-1,-1)` arrive as `null` and are filtered upstream; pass NaN coordinates → ignored); `pickCluster` picks the faster one; `killLoop` visits every point once; `nextLoopIndex` advances at 20 yd, stays at 30 yd, wraps at the end.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: add spawn clustering and kill loop`.

---

### Task 7: Completion target selection

**Files:** Create `addon/src/targets/completion.ts`, `addon/test/completion.test.ts`

**Interfaces:**
- Consumes: `QuestInfo`, `PlayerQuestState`, `isAvailable`, `isTrivial`, `passesMaxLevelOption` (Task 4); `SpawnCluster`, `clusterSpawns`, `pickCluster` (Task 6).
- Produces:
```ts
type TargetKind = "accept" | "objective" | "turnin";
interface Target { questId: number; kind: TargetKind; objectiveIndex: number | null; pos: WorldPos; cluster: SpawnCluster | null; seconds: number; questLevel: number; trivial: boolean; elite: boolean; zoneAreaId: number | null }
interface CompletionOptions { mode: "proximity" | "zone"; zoneAreaId: number | null; showTrivial: boolean; showElite: boolean; minLevelGap: number | null }
interface CompletionInput {
  quests: QuestInfo[];                                    // candidate quests (already resolved)
  log: Map<number, { complete: boolean; objectivesDone: Set<number> }>;
  player: PlayerQuestState; greenRange: number;
  positionsFor: (q: QuestInfo, kind: TargetKind, objectiveIndex: number | null) => WorldPos[]; // adapter-provided
  timeTo: (p: WorldPos) => number;                        // from travel graph
}
function selectTargets(input: CompletionInput, opts: CompletionOptions): Target[]; // sorted by seconds asc, Infinity last
interface ZoneProgress { done: number; total: number }
function zoneProgress(quests: QuestInfo[], completed: Set<number>, zoneAreaId: number): ZoneProgress;
```
Rules: quests in log → `turnin` if complete, else one `objective` target per unfinished objective (position = picked cluster center); available quests (not in log) → `accept` at nearest starter; blocked quests never returned; `trivial`/`elite` filtered by options; `minLevelGap` applies to `accept` targets; zone mode keeps targets whose position is in the chosen zone (`zoneAreaId` match).

- [ ] **Step 1: Failing tests** — ordering by `seconds`; Infinity last; complete quest yields `turnin`; `objective without positions is excluded`; blocked quest (prereq missing) absent; `showTrivial=false` removes grey; `showElite=false` removes elite; zone mode filters; `minLevelGap=2` at level 15 removes a level-15 accept target; `zoneProgress` counts completed / total of zone quests available to the player's race/class.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: add Completion target selection`.

---

### Task 8: Follow-ups and lost XP for the skip dialog

**Files:** Create `addon/src/quests/followUps.ts`, `addon/test/followUps.test.ts`

**Interfaces:**
- Consumes: `QuestInfo` (Task 4), `questXp` (Task 2).
- Produces:
  - `function followUps(questId: number, get: (id: number) => QuestInfo | null): QuestInfo[]` — transitive closure over `nextInChain` and `children`, cycle-safe, excludes quests reachable through another still-available prerequisite branch (`preSingle` alternative not depending on `questId`).
  - `function lostXp(chain: QuestInfo[], charLevel: number, maxLevel: number): { xp: number; levelFraction: number }` with `levelFraction` = xp / XP needed for the current level, from `XP_PER_LEVEL` (add `XP_PER_LEVEL: number[]` 1–59 to `constants.ts` as a dated table, source https://warcraft.wiki.gg/wiki/Experience_to_level, total 4,084,700).

- [ ] **Step 1: Failing tests** — A→B→C chain returns [B, C]; cycle A→B→A terminates; quest with no follow-ups → []; `lostXp` sums `questXp` per quest at the current level; at level 60 → `{ xp: 0, levelFraction: 0 }`; `XP_PER_LEVEL` sums to 4084700.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: compute quest follow-ups and lost XP`.

---

### Task 9: Access chains

**Files:** Create `addon/src/access/chains.ts`, `addon/src/access/progress.ts`, `addon/test/access.test.ts`

**Interfaces:**
- Consumes: `QuestInfo` (Task 4).
- Produces:
```ts
interface AccessChainDef { id: string; name: { frFR: string; enUS: string }; kind: "dungeon" | "raid" | "key"; levelRange: [number, number];
  start: { A: number[]; H: number[] };      // start quest ids per faction
  explicitSteps?: { A: number[]; H: number[] } } // overrides automatic resolution
const ACCESS_CHAINS: AccessChainDef[];
function resolveSteps(def: AccessChainDef, faction: "A" | "H", get: (id: number) => QuestInfo | null): number[]; // follows nextInChain from start
interface ChainProgress { steps: { questId: number; state: "done" | "current" | "todo" }[]; done: number; total: number }
function chainProgress(steps: number[], completed: Set<number>, inLog: Set<number>): ChainProgress;
```
Spec deviation (simplification, same guarantees): definitions are a typed TS module instead of JSON + schema; the TS type is the schema. Initial content: `dalaran-sewers` key (start 92432 both factions, level 28–33). Other chains are added only after a human checks their ids in game with `/mmq chain <questId>` (Task 12), per spec §6.3.

- [ ] **Step 1: Failing tests** — `resolveSteps` follows a 3-quest chain; `explicitSteps` wins over resolution; `chainProgress` marks first non-completed as `current` (or the one in log), counts done/total; empty chain → `{done:0,total:0}`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: add Access chain definitions and progress`.

---

### Task 10: Storage, l10n and error reporting

**Files:** Create `addon/src/core/storage.ts`, `addon/src/core/l10n.ts`, `addon/src/core/report.ts`, `addon/test/storage.test.ts`, `addon/test/report.test.ts`

**Interfaces:**
- Produces:
```ts
interface AccountDb { version: 1 }
interface CharDb { version: 1; tab: "quest" | "access" | "completion"; window: { x: number; y: number } | null; arrow: { x: number; y: number; locked: boolean } | null;
  completion: { mode: "proximity" | "zone"; zoneAreaId: number | null; showTrivial: boolean; showElite: boolean };
  minLevelGap: number | null; autoFly: boolean; nativeWaypoint: boolean;
  pinnedQuestId: number | null; skippedQuests: number[]; trackedChains: string[]; knownTaxiNodes: number[]; expandedChain: string | null }
function withDefaults<T>(saved: unknown, defaults: T): T;   // fills missing keys, drops wrong types
const CHAR_DEFAULTS: CharDb;                                  // tab "quest", proximity, showTrivial true, showElite true, minLevelGap null, autoFly true, nativeWaypoint true
function t(key: L10nKey): string;                             // GetLocale() frFR → French, else English
function reportOnce(feature: string, message: string): void;  // prints "MinMaxQuest: <message>" once per feature per session, marks it disabled
function isDisabled(feature: string): boolean;
function guard<T>(feature: string, fn: () => T): T | null;    // pcall wrapper: on error reportOnce + null
```
`saved: unknown` is allowed (it is not `any`).

- [ ] **Step 1: Failing tests** — `withDefaults(null, D)` deep-equals `D`; wrong type replaced; extra keys dropped; `guard` returns null and disables the feature after a throw, and `reportOnce` prints once for two failures.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`guard` uses Lua `pcall` via TSTL `pcall` declaration; in vitest, a `try/catch` fallback is selected when `pcall` is not defined). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: add saved variables, localization and error guard`.

---

### Task 11: Arrow frame

**Files:** Create `addon/src/arrow/arrowFrame.ts`, `addon/src/arrow/arrow.tga` (gold arrow texture, 64×64, accent `#c9a75a`, dark 2 px outline); extend `addon/types/wow.d.ts`

**Interfaces:**
- Consumes: `heading`, `formatDistance` (Task 3), `CharDb` (Task 10).
- Produces: `function createArrow(db: CharDb): ArrowApi` with `interface ArrowApi { setTarget(t: { pos: WorldPos; label: string } | null): void; setMoveMode(on: boolean): void }`.
Behaviour: frame `MinMaxQuestArrow`, default anchored top-center; texture rotated with `SetRotation(heading)`; distance line (14 px bold) and label (12 px) below in theme colors; `OnUpdate` accumulates elapsed and recomputes at most every `1/30` s; reads `C_Map.GetBestMapForUnit("player")`, `C_Map.GetPlayerMapPosition`, `C_Map.GetWorldPosFromMapPos`, `GetPlayerFacing()`; hides when any is nil or `heading` is null. Move mode: dashed outline + `⠿` grip, `SetMovable`, `RegisterForDrag("LeftButton")`; on lock, save position to `db.arrow`.
The texture must be authored as TGA (32-bit, power-of-two) and committed; the build copies nothing — the TOC path is `Interface\AddOns\MinMaxQuest\addon\src\arrow\arrow.tga`.

- [ ] **Step 1: Build** — `npm run build` → no TSTL errors; `npm test` → smoke PASS.
- [ ] **Step 2: In game** — `/mmq arrow test` points to a fixed coordinate 100 yd north: arrow points up when facing north, rotates when turning, hides inside an instance; `/mmq arrow move` shows the grip, drag, `/mmq arrow lock`, `/reload` keeps the position. FPS unchanged (`/framerate`).
- [ ] **Step 3: Commit** — `feat: add movable navigation arrow`.

---

### Task 12: Window, tabs, Completion/Access/Quest tabs, skip dialog, banner, engine wiring

**Files:**
- Create: `addon/src/ui/theme.ts`, `addon/src/ui/window.ts`, `addon/src/ui/completionTab.ts`, `addon/src/ui/accessTab.ts`, `addon/src/ui/questTab.ts`, `addon/src/ui/skipDialog.ts`, `addon/src/ui/banner.ts`, `addon/src/game/playerState.ts`, `addon/src/game/engine.ts`, `addon/test/engine.test.ts`
- Modify: `addon/src/main.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
```ts
// game/engine.ts (pure core + injected adapters)
interface EngineDeps { now(): number; readPlayer(): PlayerSnapshot | null; completion: (snap: PlayerSnapshot) => Target[]; onTargets(list: Target[], current: Target | null): void }
interface PlayerSnapshot { pos: WorldPos | null; state: PlayerQuestState; log: CompletionInput["log"]; greenRange: number }
function createEngine(deps: EngineDeps, db: CharDb): { refreshTargets(force: boolean): void; pin(questId: number | null): void; current(): Target | null };
// ui/window.ts
function createWindow(db: CharDb, tabs: Record<CharDb["tab"], TabView>): { setTab(tab: CharDb["tab"]): void; frame: Frame };
interface TabView { height: number; width: number; render(parent: Frame): void; refresh(): void }
// ui/skipDialog.ts
function confirmSkip(quest: QuestInfo, followUps: QuestInfo[], lost: { xp: number; levelFraction: number }, onConfirm: () => void): void;
```
Engine rules: `refreshTargets(false)` is a no-op if called < 2 s after the previous run; `force` (quest/zone events) bypasses the throttle; `refreshTargets with null player position keeps previous list`; a pinned quest makes `current()` the best target of that quest and is cleared automatically when the quest is turned in; skipping a quest with follow-ups opens `confirmSkip`, without follow-ups skips directly; skipped quests stored in `db.skippedQuests` are excluded.

UI rules (maquettes `.superpowers/brainstorm/*/content/window-v3.html`, `completion-v1.html`):
- Window: header `MINMAXQUEST` in accent, gear button, tab bar `Quest | Access | Completion` with 2 px accent underline on the active tab; size per tab (Quest 270×260, Completion 300×480, Access 320×420); draggable; tab and position saved.
- Completion tab: zone header (name, `done / total`, %, bar, `Zone ▾` dropdown + `Proximity / Zone` toggle); "Nearest target" (name, line `objective · ~time · distance`, `Skip` button); "Next"; "Remaining" list sorted by time with level, elite tag, grey rows in `#6f6f6f`; filters `Grey` / `Elite`; footer continent and total progress; a "Pinned · ✕" line when a quest is pinned.
- Access tab: one row per chain with level range and progress bar; click expands steps (done struck through, current `▸` in accent with position, todo); checkbox "Track in route" stored in `db.trackedChains` (route insertion arrives in Plan 3; checkbox only stored now); footer `Active mode` and tracked count.
- Quest tab: empty state "Routes not installed — use Completion meanwhile" with a button switching to Completion; options block (Include elites, Include dungeons, Max quest level: off/1/2/3) stored now.
- Skip dialog: title "Skip this step?", warning line in accent, list of follow-ups with level, "You lose about N XP (F levels)", buttons `Cancel` / `Skip anyway` (accent border).
- Banner: shown on top of the window when `expiredConstants(today)` is non-empty or `GetBuildInfo()` build ≠ `TRAVEL.source.build` ("Data built for build X"); never blocks.
- Slash: `/mmq` toggles the window; `/mmq q <id>`; `/mmq chain <questId>` prints the resolved chain ids and names; `/mmq arrow move|lock|test`.

- [ ] **Step 1: Failing engine tests** — throttle (two calls within 2 s → `completion` called once); force bypasses; `refreshTargets with null player position keeps previous list`; pin selects the pinned quest's target; pin cleared after turn-in; skipped quest excluded.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement engine.** **Step 4: Run** → PASS.
- [ ] **Step 5: Implement `playerState.ts`** — `UnitLevel`, `UnitRace` → race mask via `LibQuestieDB.Enum.raceMaskById`, class mask via `classKeys`, completed via `C_QuestLog.GetAllCompletedQuestIDs()` (fallback `GetQuestsCompleted()`), log via `C_QuestLog.GetNumQuestLogEntries` + `C_QuestLog.GetInfo` + `C_QuestLog.GetQuestObjectives`, `GetQuestGreenRange()`, position via `C_Map` (Task 11 calls), hearth via `GetItemCooldown(6948)` and `GetBindLocation()` (hearth position: the inn nearest to the bind zone is unknown → `pos: null` until the player is seen casting hearth; then the landing position is stored). Events: `QUEST_ACCEPTED`, `QUEST_TURNED_IN`, `QUEST_LOG_UPDATE`, `ZONE_CHANGED_NEW_AREA`, `PLAYER_LEVEL_UP`, `PLAYER_ENTERING_WORLD` → `refreshTargets(true)`; a 0.5 s ticker → `refreshTargets(false)`.
- [ ] **Step 6: Implement UI files and wire `main.ts`** (all feature entry points wrapped in `guard`).
- [ ] **Step 7: Build + tests** — `npm run build && npm test` → PASS.
- [ ] **Step 8: In game checklist** — window opens with `/mmq`, three tabs in order, sizes change per tab; Completion lists targets sorted by `~time`, arrow follows the first; Proximity/Zone toggle works; Grey/Elite filters work; skipping a quest with follow-ups shows the dialog with the list and XP; Access tab shows Dalaran Sewers progress; Quest tab empty state; banner appears when faking an old build via `/mmq debug build 1`.
- [ ] **Step 9: Commit** — `feat: add tabbed window, Completion and Access tabs, skip dialog`.

---

### Task 13: Pin buttons in the quest log

**Files:** Create `addon/src/questlog/pinButtons.ts`

**Interfaces:**
- Consumes: `engine.pin(questId | null)` (Task 12), `CharDb.pinnedQuestId`.
- Produces: `function installPinButtons(onPin: (questId: number) => void, isPinned: (questId: number) => boolean): void`.

- [ ] **Step 1: Discover the frame in game** — open the quest log, `/fstack` over a quest line; note whether the client uses the legacy `QuestLogFrame` (`QuestLog_Update`, `QuestLogTitle1..QUESTS_DISPLAYED`, `FauxScrollFrame_GetOffset(QuestLogListScrollFrame)`) or another list. Write the observed frame names in a one-line comment at the top of `pinButtons.ts`.
- [ ] **Step 2: Implement** — after `PLAYER_LOGIN` (and only when `!InCombatLockdown()`, else on `PLAYER_REGEN_ENABLED`), create one 14×14 button per visible title line, anchored right; `hooksecurefunc` on the list update function to refresh each button's quest id (from `C_QuestLog.GetInfo(index).questID`), hide on headers, show the accent `📌` texture when pinned, dimmed otherwise; click toggles pin. No Blizzard function replaced.
- [ ] **Step 3: In game** — pin a quest: the arrow and the window switch to it, "Pinned · ✕" appears; click ✕ → automatic again; scrolling the log keeps buttons aligned; no taint warning in combat (`/console taintLog 1`, fight, check `Logs\taint.log` has no MinMaxQuest entry).
- [ ] **Step 4: Commit** — `feat: add pin buttons to the quest log`.

---

### Task 14: Auto-fly and known flight nodes

**Files:** Create `addon/src/taxi/match.ts`, `addon/src/taxi/autoFly.ts`, `addon/test/taxiMatch.test.ts`

**Interfaces:**
- Consumes: `firstHop` (Task 5), `TRAVEL.taxiNodes`, `CharDb.knownTaxiNodes`, `CharDb.autoFly`.
- Produces:
  - `function normalizeTaxiName(name: string): string` (lowercase, strip accents and punctuation, collapse spaces)
  - `function findTaxiIndex(names: string[], targetName: string): number | null` (1-based index for `TakeTaxiNode`)
  - `function installAutoFly(getDestination: () => { taxiNodeId: number; name: string } | null, db: CharDb): void`

Behaviour: on `TAXIMAP_OPENED`: record every node whose `TaxiNodeGetType(i)` is `"REACHABLE"` or `"CURRENT"` into `db.knownTaxiNodes` (matched to `TRAVEL.taxiNodes` by normalized name), then if `db.autoFly` and not `IsShiftKeyDown()` and the engine's first hop is a taxi with destination D: find D's index; if found → `TakeTaxiNode(i)`; else print `t("taxiNotKnown")` and do nothing. Name source: the localized `TaxiNodeName(i)` compared with `TRAVEL.taxiNodes[].name` (enUS) — so also match against the localized name learned at the first visit (`db` keeps `nodeId → localizedName`).

- [ ] **Step 1: Failing tests** — `"Stormwind, Elwynn"` matches `"stormwind elwynn"`; accents stripped (`"Hurlevent, Elwynn"` → `"hurlevent elwynn"`); `findTaxiIndex` returns 1-based index; unknown → null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: In game** — target across the continent: arrow goes to the flight master; talking to him takes off to the right node; holding Shift opens the map without flying; with the option off nothing happens; known nodes persist after `/reload`.
- [ ] **Step 6: Commit** — `feat: add auto-fly at flight masters`.

---

### Task 15: Map and minimap pins

**Files:** Create `addon/src/map/pins.ts`; possibly `libs/HereBeDragons/` (see Step 1)

**Interfaces:**
- Consumes: engine `current()` and the next target, `Target.cluster`.
- Produces: `function installMapPins(getPins: () => { current: Target | null; next: Target | null }): { refresh(): void }`.

- [ ] **Step 1: License gate** — download upstream HereBeDragons 2.x (https://github.com/Nevcairiel/HereBeDragons) and read its LICENSE. If GPL-3.0-compatible (MIT/BSD/GPL), embed `HereBeDragons-2.0.lua` and `HereBeDragons-Pins-2.0.lua` under `libs/HereBeDragons/`, add them to the TOC before the bundle, and use `HBDPins:AddWorldMapIconMap` / `AddMinimapIconMap`. If not compatible, use a `MapCanvasDataProviderMixin` data provider for the world map only and skip minimap pins (note it in the commit message).
- [ ] **Step 2: Implement** — exactly two pins (current, next), each at its cluster center (or position), accent-colored dot icon with the step number; tooltip lists other clusters for that objective; `C_Map.SetUserWaypoint` + `C_SuperTrack.SetSuperTrackedUserWaypoint(true)` for the current target when `db.nativeWaypoint`.
- [ ] **Step 3: In game** — world map shows 2 pins only; minimap shows the current pin (if HBD); hover lists alternative clusters; toggling the native waypoint option removes the Blizzard pin.
- [ ] **Step 4: Commit** — `feat: add map and minimap pins for current and next step`.

---

### Task 16: Final verification

- [ ] **Step 1:** `npm run build && npm test` → all PASS, no hygiene violations.
- [ ] **Step 2:** In game with QuestieDB disabled → one chat message "MinMaxQuest: QuestieDB is required…", window shows the notice, no Lua error (`/console scriptErrors 1`).
- [ ] **Step 3:** In game full pass of Review Focus 1–5 (enter an instance, take a taxi, level-60 character, quest in a far continent, a quest with missing spawns via `/mmq q <id>`).
- [ ] **Step 4:** Memory check: `/run UpdateAddOnMemoryUsage() print(GetAddOnMemoryUsage("MinMaxQuest"))` after 10 min of play stays under 5 MB **(target, tune if exceeded)**; `/framerate` unchanged with the window open.
- [ ] **Step 5:** Commit any fixes — `fix: …`.

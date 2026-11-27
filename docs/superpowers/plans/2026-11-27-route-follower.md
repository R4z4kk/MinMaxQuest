# Route Follower (Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Quest tab follows the precomputed routes in game: it loads the character's segment and trunk for the chosen variant, advances through done steps, handles off-route and re-sync, inserts tracked Access chains and dungeon returns, and drives the arrow when it is the active mode.

**Architecture:** Pure TypeScript modules under `addon/src/route/` decide everything: loading, step state, target choice and insertion. They are unit-tested in vitest. The existing engine gains one new target source, `route(snapshot)`, next to `completion(snapshot)`. Which source is used depends on `db.activeMode`. Everything downstream (arrow, loop, pins, map, auto-fly, skip dialog) is reused. The route files are loaded by the TOC as plain Lua tables of strings, and only the chosen variant is decoded.

**Tech Stack:** TypeScript → Lua 5.1 (TypeScriptToLua), vitest, wasmoon with the repo's fake game (`addon/test/helpers/fakeGame.ts`, `wowStubs.ts`).

**Spec:** `docs/superpowers/specs/2026-11-27-route-follower-design.md` (binding for the Quest tab), on top of `docs/superpowers/specs/2026-11-27-minmaxquest-design.md` §6.1, §6.2 and §7.7.

## Global Constraints

- Everything in English: code, names, comments, commits; branch `feat/route-follower`. Comments minimal. UI text goes through `core/l10n.ts` with frFR and enUS.
- TypeScript only. No `any`. No explicit `undefined`: use optional properties or `null`.
- **TSTL-safe code in `addon/src`:**
  - no regex;
  - no `Map` or `Set` keyed by objects across Lua boundaries unless the existing code already does so;
  - `nil` inside Lua arrays ends iteration, so use 0 or sentinels as `ui/questTab.ts` does.
- Robust errors: every new feature goes through `guard`/`reportOnce` (`core/report.ts`). A bad step or quest is skipped and counted, never an error loop. No silent defaults.
- No allocation in per-frame code. Route decoding only at load, on a variant change, out of combat (defer to `PLAYER_REGEN_ENABLED`).
- **Exact values from the design:**
  - off-route window 15 steps;
  - off-route triggers when travel to the current step exceeds 120 s **and** a realizable window step is at least 60 s closer;
  - level banner when |player level − current step `targetLevel`| > 3;
  - re-sync to the first not-done step with `targetLevel` ≥ player level − 1;
  - `fly` / `hearth` done within 150 yd;
  - kill-loop advance 25 yd (existing `LOOP_ADVANCE_YARDS`);
  - default `activeMode` `"quest"`.
- The project README rule applies (`CLAUDE.md`): this plan makes routes user-visible, so the final task updates **Features**, **Commands** if any, and **Roadmap**.
- Conventional commits, no `Co-Authored-By` line.

## Review Focus

- A character whose race matches no segment (or level ≥ 10 at first load): the route is the trunk alone and is auto-re-synced, never stuck at step 0.
- A step that is impossible for good (exclusive taken, class/race excluded, quest missing from QuestieDB): removed with its quest's other steps and follow-ups, reported once, and the current step moves on.
- An abandoned quest: its `accept` step becomes current again. The cursor can move back, and no `complete`/`turnin` step for it is targeted while it is not in the log.
- The routes file for the faction is missing or a variant fails to decode: the Quest tab shows "Routes not installed" with the Completion button, one report line, and the engine falls back to Completion.
- Switching the variant in options while in combat: decoding is deferred to `PLAYER_REGEN_ENABLED`, and the old route stays in use until then.

---

## File Structure

```
addon/src/route/format.ts        (exists) codec; unchanged
addon/src/route/routeData.ts     read MinMaxQuestRoutes global, pick variant + segment, lazy decode cache
addon/src/route/progress.ts      per-step "done" rules, impossible detection, current index, re-sync
addon/src/route/follow.ts        route targets: current, next steps, off-route choice, banner info
addon/src/route/insert.ts        cheapest insertion of Access-chain and dungeon-return blocks
addon/src/game/positions.ts      (modify) + uiMapToWorld
addon/src/targets/completion.ts  (modify) Target gains route variant
addon/src/game/engine.ts         (modify) route source, active mode, route skip
addon/src/core/storage.ts        (modify) activeMode, route state, dungeonReturns
addon/src/ui/questTab.ts         (modify) full Quest tab
addon/src/ui/accessTab.ts        (modify) real active-mode text
addon/src/main.ts                (modify) wiring and events
tools/route-builder/emit/emit.ts (modify) segmentRaces
data/routes/*.lua                regenerated
MinMaxQuest_Camelot.toc, .pkgmeta, README.md, docs/in-game-checklist.md
```

---

### Task 1: Emit segment races and regenerate routes

**Files:**
- Modify: `tools/route-builder/emit/emit.ts`, `tools/route-builder/test/emit.test.ts`
- Regenerated: `data/routes/Alliance.lua`, `data/routes/Horde.lua`, `data/routes/report.md`

**Interfaces:**
- Produces: each faction table gains `segmentRaces = { ["<zoneKey>"] = <raceMask> }`, taken from `World.startZones[].raceMask`, keys sorted. Other fields are unchanged.

- [ ] **Step 1: Write the failing test.** Emitted Lua evaluated in wasmoon gives `MinMaxQuestRoutes.Alliance.segmentRaces["elwynn-forest"]` equal to the fixture world's start-zone mask, for every segment key present.
- [ ] **Step 2: Run.** `npx vitest run tools/route-builder/test/emit.test.ts`, expect FAIL.
- [ ] **Step 3: Implement** in `emitFaction`.
- [ ] **Step 4: Regenerate the data.** `npm test` must PASS. Then run `npm run gen:routes` (full) and confirm that only the `segmentRaces` blocks and `generatedOn` changed: diff, then `git diff --stat`.
- [ ] **Step 5: Commit.** `feat: emit segment race masks with the routes`, then `chore: regenerate routes`.

---

### Task 2: Route data loader

**Files:**
- Create: `addon/src/route/routeData.ts`, `addon/test/routeData.test.ts`
- Modify: `addon/types/wow.d.ts`, to declare the `MinMaxQuestRoutes` global as an optional table

**Interfaces:**
- Consumes: `decodeSteps`, `EmittedStep` and `StepType` from `route/format.ts`; `maskAllows` from `quests/availability.ts`.
- Produces:

```ts
interface RouteOptions { elites: boolean; dungeons: boolean; minLevelGap: number | null }
function variantKey(o: RouteOptions): string                       // "e0d0x0" … same scheme as tools (x0 = off)
interface FactionRoutes { meta: { build: string; questieDb: string; generatedOn: string; constants: Record<string, number> };
  segmentRaces: Record<string, number>; segments: Record<string, Record<string, string>>;
  trunk: Record<string, string>; returnBlocks: Record<number, string> }
type RoutesResult = { ok: true; routes: FactionRoutes } | { ok: false; message: string }
function readRoutes(faction: "A" | "H"): RoutesResult               // validates shape, never throws
interface CharacterRoute { key: string; segmentKey: string | null; steps: EmittedStep[]; segmentLength: number }
function composeRoute(r: FactionRoutes, o: RouteOptions, raceMask: number, level: number, segmentEndLevel: number): CharacterRoute
function decodeReturnBlock(r: FactionRoutes, dungeonAreaId: number): EmittedStep[]
```

**Rules:**
- The segment is the first key, in sorted order, whose `segmentRaces` mask allows `raceMask`. There is no segment when none matches or when `level >= segmentEndLevel`. `segmentEndLevel` is read from `meta.constants.segmentEndLevel` when present, otherwise the call throws.
- Steps whose `races` exclude `raceMask` are removed.
- Decoding is cached by `key` (variant + segment), and the cache holds one entry only.
- A decode error throws an `Error` naming the faction, the variant and the decoder message. Callers wrap it in `guard`.

- [ ] **Step 1: Write the failing tests.** Use a tiny `FactionRoutes` built with `encodeSteps`:
  - `variantKey({elites:true,dungeons:false,minLevelGap:2}) === "e1d0x2"`;
  - level 1 with a matching race gives segment steps plus trunk steps, and `segmentLength` equals the segment's step count;
  - level 12 gives the trunk only;
  - a race not in any mask gives the trunk only;
  - a step with `races` excluding the player is removed;
  - two calls with the same key return the same array (cache), and a different key replaces it;
  - `readRoutes` returns `ok: false` when the global is absent or the faction table is missing `trunk`.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Compiled-Lua check.** Add a test in the style of `addon/test/gameLua.test.ts`:
  - load the real `data/routes/Alliance.lua`, then the bundle;
  - `composeRoute` for a human at level 1 with options `e0d0x0` returns more than 100 steps, and the first segment key is `elwynn-forest`.

  Run `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: load and compose character routes`.

---

### Task 3: Step progress rules

**Files:**
- Create: `addon/src/route/progress.ts`, `addon/test/routeProgress.test.ts`

**Interfaces:**
- Consumes: `EmittedStep`; `QuestInfo` and `isAvailable` (`quests/availability.ts`); `WorldPos`, `distance`.
- Produces:

```ts
interface ProgressContext {
  completed: Set<number>; log: Map<number, { complete: boolean; objectivesDone: Set<number> }>;
  level: number; xpIntoLevel: number; knownTaxi: Set<number>;
  pos: WorldPos | null; bindPos: WorldPos | null; hearthBoundWhileCurrent: boolean;
  toWorld(uiMapId: number, x: number, y: number): WorldPos | null;
  taxiPos(nodeId: number): WorldPos | null;
}
type StepStatus = "done" | "todo" | "impossible";
function stepStatus(steps: EmittedStep[], i: number, ctx: ProgressContext, quest: (id: number) => QuestInfo | null, player: PlayerQuestState): StepStatus
interface RouteCursor { current: number; removed: Set<number> }      // removed = step indexes dropped as impossible or skipped
function advance(steps: EmittedStep[], startIndex: number, skipped: Set<number>, ctx: ProgressContext, quest: …, player: PlayerQuestState): RouteCursor
function resyncIndex(steps: EmittedStep[], level: number, from: number): number
```

**Rules** (design §3.5, one line each in code):
- **Quest steps** use only their own condition:
  - `accept`: in the log or completed;
  - `complete`: the objective is done in the log, or the quest is completed;
  - `turnin`: completed.
- **Non-quest steps** are done by their own condition **or** by any later `turnin` being done:
  - `getFlightPath`: the node is known;
  - `grind`: the level and XP into level are ≥ the step's;
  - `dungeon`: every quest accepted before the step and turned in after it has its objectives done or is completed;
  - `fly`: `pos` is within 150 yd of `taxiPos(taxiNodeId)`;
  - `hearth`: within 150 yd of `bindPos`;
  - `setHearth`: `hearthBoundWhileCurrent`, or `bindPos` within 150 yd of the step place.
- **Impossible for good:**
  - a quest missing from `quest()`;
  - `isAvailable` false for reasons other than level: completed exclusive, race or class mask, or a prerequisite that is itself removed or impossible.

  It removes every step of that quest and of its `unlocks`, transitively.
- **Not in the log yet:** a `complete` or `turnin` whose quest is neither in the log nor completed is `todo`. It is not impossible, and `advance` returns the earliest `todo`, which will be that quest's `accept`.
- `advance` recomputes from `startIndex` on each call and may move backwards. It skips `skipped` and removed steps.
- `resyncIndex` returns the first index ≥ `from` whose `targetLevel` ≥ `level − 1`, or the last index.

- [ ] **Step 1: Write the failing tests.** One test per row of the design's table (§3.5), plus:
  - a later `turnin` makes earlier `fly`/`hearth`/`grind` steps done, but a later `accept` does not;
  - an exclusive quest already completed is removed with its follow-up;
  - an abandoned quest moves the cursor back to its `accept`;
  - a level-locked `accept` stays `todo`, not impossible;
  - `resyncIndex` picks the first step at level − 1;
  - a grind to a level already reached is done.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: decide route step progress`.

---

### Task 4: Route targets, off-route and banner

**Files:**
- Create: `addon/src/route/follow.ts`, `addon/test/routeFollow.test.ts`

**Interfaces:**
- Consumes: `RouteCursor`, `stepStatus`, `EmittedStep`; travel time `timeTo(p: WorldPos): number`; quest availability for realizability.
- Produces:

```ts
const OFF_ROUTE_WINDOW = 15; const OFF_ROUTE_MIN_SECONDS = 120; const OFF_ROUTE_GAIN_SECONDS = 60;
const LEVEL_BANNER_GAP = 3;
interface FollowView {
  target: number | null;          // step index the arrow should aim at
  current: number | null;         // cursor.current (null when the route is finished)
  next: number[];                 // up to 3 following not-done step indexes after `current`
  levelGap: number | null;        // player level − current targetLevel when |gap| > 3, else null
  remainingSeconds: number;       // Σ estCostSeconds of not-done steps from current
  finished: boolean;              // no step left, or level 60
}
function follow(steps: EmittedStep[], cursor: RouteCursor, ctx: ProgressContext, timeTo: (p: WorldPos) => number,
  realizable: (i: number) => boolean, maxLevel: number): FollowView
```

- **Realizable:**
  - `complete` or `turnin`: the quest is in the log;
  - `accept`: available and the log has fewer than 20 quests;
  - non-quest steps: always.
- `target` is `current` unless the off-route rule picks a closer realizable window step. Window steps are taken in route order, and a tie goes to the earliest.

- [ ] **Step 1: Write the failing tests.** Use synthetic steps with a `timeTo` fake:
  - near the current step, target = current;
  - current at 300 s and a window step at 30 s, target = that step;
  - a window step only 40 s closer, target = current;
  - an unrealizable closer step is ignored;
  - a step outside the 15-step window is ignored;
  - `levelGap` is null at a gap of 3 and set at a gap of 4;
  - `remainingSeconds` sums only not-done steps;
  - the finished flag at level 60 and at the end of the route.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: choose route targets with off-route fallback`.

---

### Task 5: Cheapest insertion of chains and dungeon returns

**Files:**
- Create: `addon/src/route/insert.ts`, `addon/test/routeInsert.test.ts`

**Interfaces:**
- Consumes: `EmittedStep`; `resolveSteps` and `ACCESS_CHAINS` (`access/chains.ts`); a world conversion `toWorld(uiMapId, x, y)`.
- Produces:

```ts
interface InsertBlock { steps: EmittedStep[]; minLevel: number }       // steps kept in their own order
function insertBlocks(route: EmittedStep[], from: number, blocks: InsertBlock[], toWorld: (m: number, x: number, y: number) => WorldPos | null): EmittedStep[]
function chainBlock(questIds: number[], quest: (id: number) => QuestInfo | null, place: PlaceFor): InsertBlock   // accept, one complete per objective, turnin per quest, chain order
type PlaceFor = (q: QuestInfo, kind: "accept" | "objective" | "turnin", objectiveIndex: number | null) => { uiMapId: number; x: number; y: number } | null
```

**Rules:**
- Each block is inserted as a contiguous run. Its position is the one, after `from`, where the previous step's `targetLevel` is ≥ `minLevel` and the detour `d(prev, first) + d(last, next) − d(prev, next)` is minimal. The distance `d` is straight-line world distance, and an unknown position counts as Infinity, which is not insertable.
- Blocks are inserted one at a time in the given order. A block with no insertable position is appended at the end.
- Quests already present in the route are left out of chain blocks.
- Inserted steps carry `estCostSeconds` 0 and the neighbour's `targetLevel`.

- [ ] **Step 1: Write the failing tests:**
  - a block placed near two far-apart groups goes next to the nearer group;
  - `minLevel` forbids an earlier, cheaper position;
  - two blocks keep their relative order;
  - chain quests already in the route are skipped;
  - an unconvertible block is appended at the end.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: insert access chains and dungeon returns into the route`.

---

### Task 6: Engine integration, active mode and storage

**Files:**
- Modify:
  - `addon/src/targets/completion.ts` (Target);
  - `addon/src/game/engine.ts`;
  - `addon/src/game/positions.ts` (`uiMapToWorld`);
  - `addon/src/core/storage.ts`;
  - `addon/src/game/playerState.ts` (`xpIntoLevel` via `UnitXP("player")` in the snapshot);
  - `addon/src/main.ts`;
  - `addon/src/ui/window.ts` (the tab switch sets the active mode);
  - `addon/src/map/pins.ts` and `addon/src/ui/viewModel.ts`, wherever `questId` is assumed non-null.
- Test: `addon/test/engine.test.ts`, `addon/test/storage.test.ts`, `addon/test/gameLua.test.ts`

**Interfaces:**
- `Target`:
  - gains `route: { index: number; type: StepType } | null`;
  - `questId` becomes `number | null`, null only for non-quest steps;
  - `TargetKind` gains `"route"`.

  Labels for non-quest steps use new l10n keys:
  - `routeFly` ("Fly to {name}");
  - `routeHearth`;
  - `routeSetHearth`;
  - `routeFlightPath`;
  - `routeGrind` ("Grind to level {n}");
  - `routeDungeon` ("Run {name}").
- `CharDb` gains:
  - `activeMode: "quest" | "completion"` (default `"quest"`);
  - `route: { variant: string | null; startIndex: number; skippedSteps: number[] }` (default `{ variant: null, startIndex: 0, skippedSteps: [] }`);
  - `dungeonReturns: number[]`.

  All are validated in the existing migration function, with invalid values reset to the defaults.
- `EngineDeps` gains `route: (snap: PlayerSnapshot) => Target[]`. The engine uses `db.activeMode === "quest" && routesAvailable` to choose `route` over `completion`.
  - A pinned quest in quest mode comes from `completion`'s target for that quest, as today.
  - `skip` on a route target with `questId == null` adds the step index to `db.route.skippedSteps` and needs no confirmation.
- `window.setTab("quest" | "completion")` sets `db.activeMode`; `"access"` does not.
- A new module-level `createRouteFollower(deps)` in `addon/src/route/follow.ts` or a small `route/follower.ts` (implementer's choice, stated in the report) owns:
  - the decoded route and `RouteCursor`;
  - the first-load auto re-sync: `db.route.variant` null or different → `startIndex = resyncIndex(…)` and the variant is stored;
  - the "hearth bound while current" flag, set on `HEARTHSTONE_BOUND`;
  - the insertion cache, rebuilt when the options, `trackedChains` or `dungeonReturns` change;
  - exposure of `targets(snap)`, `view()` (the `FollowView` plus step texts for the tab) and `resync()`.

  Decoding happens out of combat only: when `InCombatLockdown()` is true, the change is queued until `PLAYER_REGEN_ENABLED`. Register that event.
- The existing stale-data banner (`ui/banner.ts`) also shows "Routes built for build X" when the faction's `meta.build` differs from `GetBuildInfo()`. It never blocks (spec §6.9). Add a test case to the banner tests.

- [ ] **Step 1: Write the failing tests.**
  - TS engine tests:
    - quest mode uses the `route` source and completion mode the `completion` source;
    - a pin wins in quest mode;
    - skipping a non-quest step records it and advances;
    - a non-quest target gets the route label.
  - Storage test: the new fields default and are repaired.
  - Compiled-Lua test, fake game, real Alliance routes file loaded:
    - a level 1 human in quest mode gets an arrow target whose label is the first segment step;
    - clicking the Completion tab switches the source;
    - a variant change during fake combat is applied after `PLAYER_REGEN_ENABLED`.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** Keep `routing.ts`'s graph for `timeTo`. Convert step places with `uiMapToWorld` (`C_Map.GetWorldPosFromMapPos`, same axis convention as `mapToWorld`).
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: drive the arrow from the route in quest mode`.

---

### Task 7: Quest tab and Access tab mode

**Files:**
- Modify: `addon/src/ui/questTab.ts`, `addon/src/ui/accessTab.ts`, `addon/src/core/l10n.ts`, `addon/src/ui/ui.ts` (deps)
- Test: `addon/test/uiLua.test.ts` (or a new `questTabLua.test.ts`)

**Layout** (design §3.9, 270 × 260; Options block as today plus a "Dungeons" list):

```
 ⚠ Off route: level 14, route expects 18   [Re-sync]
 Current step                         [Skip]
 Kill 10 Kobold Vermin   ████░░  6/10
 Next · Turn in "Kobold Camp Cleanup" · 120 m
   Accept "Wolves Across the Border"
   Go to the flight master
 ─────────────
 Options ▸ …   Dungeons ▾ (one checkbox per returnBlocks dungeon, names from C_Map.GetAreaInfo)
 Lvl 12 · step 48/1210 · ~96 h left
```

- **Messages:**
  - "Routes not installed" with the button to Completion when the routes are unavailable;
  - "Route finished" with the same button at level 60 or at the end of the route.
- The Access tab footer shows the real active mode.
- Every new string has frFR and enUS entries.

- [ ] **Step 1: Write the failing compiled-Lua UI tests.**
  - The tab shows the current step text, the next three rows and the footer numbers.
  - The banner appears when the fake level is 4 above the step and disappears after clicking Re-sync.
  - Toggling a dungeon checkbox stores its area id in `dungeonReturns` and changes the route length.
  - The "routes not installed" state appears without a routes global.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement**, reusing the row and bar helpers from `ui/theme.ts` and `ui/completionTab.ts` (export rather than copy).
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: show the route in the quest tab`.

---

### Task 8: Ship the routes

**Files:**
- Modify: `MinMaxQuest_Camelot.toc` (add `data\routes\Alliance.lua` and `data\routes\Horde.lua` before `build\MinMaxQuest.lua`), `.pkgmeta` (stop ignoring `data`, ignore `data/routes/report.md`), `README.md`, `docs/in-game-checklist.md`

- [ ] **Step 1: Packaging dry run.** Run the CI packaging locally if `bash` and the packager are available; otherwise rely on CI. The zip must contain `data/routes/Alliance.lua` and `Horde.lua` and must not contain `report.md`. Add a vitest hygiene check (see `addon/test/hygiene.test.ts`): the TOC lists both route files, and `.pkgmeta` ignores `report.md` and no longer ignores `data`.
- [ ] **Step 2: README.**
  - Features: a new or updated **Quest tab** section covering:
    - routes from 1 to 60 by faction and start zone;
    - the variants (elites, dungeons, max quest level);
    - skipped done steps;
    - the off-route banner and re-sync;
    - Access chains and dungeon returns inserted;
    - the active mode following the last Quest or Completion tab.
  - Remove the shipped items from the Roadmap.
  - Do not touch **Latest update** (release time).
- [ ] **Step 3: In-game checklist.** Add these lines:
  - follow the Elwynn segment;
  - switch the variant;
  - track the Dalaran Sewers chain;
  - tick a dungeon;
  - go off route and re-sync;
  - check that the Completion and Quest tabs switch the arrow.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: load the routes in the addon`, then `docs: describe the quest tab routes`.

---

## After the plan

Open a PR `feat/route-follower` → `main`. The user runs `docs/in-game-checklist.md` live in the AddOns folder before tagging a release. **Plan 3b** (telemetry, kill time, XP/min), **3c** (ALNS) and **3d** (CI regeneration) follow.

# Item-started quests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route quests started by a looted item: the accept step is "loot the item from the mobs or object that drop it".

**Architecture:** cmangos loot rates feed a starter `Task` on `RouteQuest`; the simulator runs it on accept, crediting kills already made on the same mob; the builder defers such accepts while an open task shares the mob. In game, the follower points the accept step at the drop spawns with a loot label.

**Tech Stack:** TypeScript, TypeScriptToLua (Lua 5.1), vitest.

**Spec:** `docs/superpowers/specs/2026-11-28-item-started-quests-design.md`

## Global Constraints

- All code, names and comments in English; minimal comments; no `any`, no `undefined` in new code.
- Drop rate order: QuestieDB `dropRate` first, cmangos loot second, else scenario `questDropChance` (assumed, counted in `countStats.assumedDropRate`).
- cmangos rates only for starter items; objective items keep their current rate sources.
- Lua 5.1 limits (`addon/test/luaLimits.test.ts`) must stay green.
- Labels: enUS `loot {item} to start it`, frFR `ramasser {item} pour la lancer`.

## Review Focus

- `worthIt` probes with `{ ...s }`: a shared `kills` map would leak probe kills into the real state; the probe must copy it.
- cmangos group loot: a chance of 0 inside a group shares the group's remaining chance equally; reference rows (`mincountOrRef < 0`) are ignored, never read as a rate.
- A creature whose `LootId` is 0 has no loot: no rate.
- A start zone must never start on an item-started quest.
- In game, a quest with a starter NPC keeps its current accept target even if it also lists a starter item.

---

### Task 1: cmangos loot rates

**Files:**
- Modify: `tools/route-builder/ingest/cmangos.ts`
- Modify: `tools/route-builder/main.ts`, `tools/route-builder/test/world.integration.test.ts` (load both from one read)
- Test: `tools/route-builder/test/cmangos.test.ts`

**Interfaces:**
- Produces: `interface CmangosLoot { dropRate(itemId: number, npcId: number): number | null }` (fraction 0..1); `parseCmangosLoot(sql: string, file: string): CmangosLoot`; `loadPinnedCmangos(): { counts: CmangosCounts; loot: CmangosLoot }` (one `readSqlFile`).

- [ ] **Step 1: Failing tests** in `cmangos.test.ts`, `describe("parseCmangosLoot")`, with a SQL fixture holding `creature_template (Entry, LootId)` rows `(10, 10), (11, 50), (12, 0)` and `creature_loot_template (entry, item, ChanceOrQuestChance, groupid, mincountOrRef)` rows `(10, 900, 4, 0, 1)`, `(50, 900, -25, 0, 1)`, `(10, 901, 0, 1, 1)`, `(10, 902, 0, 1, 1)`, `(10, 903, 20, 1, 1)`, `(10, 904, 100, 0, -7)`:
  - `dropRate(900, 10)` is `0.04`; `dropRate(900, 11)` is `0.25` (via LootId 50, sign dropped);
  - `dropRate(901, 10)` and `dropRate(902, 10)` are `0.4` ((100 − 20) / 2 / 100);
  - `dropRate(904, 10)`, `dropRate(900, 12)`, `dropRate(900, 99)` are `null`.
- [ ] **Step 2:** `npx vitest run tools/route-builder/test/cmangos.test.ts` → FAIL (not exported).
- [ ] **Step 3:** Implement with `parseSqlTable` on both tables; then `loadPinnedCmangos` and switch `main.ts` and the integration test to it.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat: read creature loot rates from cmangos`.

### Task 2: starter task in the world

**Files:**
- Modify: `addon/src/data/questRepository.ts` (`QuestInfo.starterItems: number[]` from `startedBy` slot 2), every `QuestInfo` literal in tests (`starterItems: []`)
- Modify: `tools/route-builder/model/world.ts`, `tools/route-builder/test/fixtures.ts`, `tools/route-builder/test/world.test.ts`
- Test: `tools/route-builder/test/world.test.ts`, `addon/test/questRepository.test.ts`

**Interfaces:**
- Consumes: `CmangosLoot` (Task 1).
- Produces: `buildWorld(s, zones, faction, travel, instanceTypes, counts, loot: CmangosLoot)`; `RouteQuest.starter: Task | null` (count 1, `objectiveIndex` 0, kind `collect` or `use`); for such quests `accept === starter.cluster.center` and `accept.npcId` is the dropping mob; `info.isElite` is true when the starter mob is elite.

- [ ] **Step 1: Failing tests** in `world.test.ts` (fixture quests started only by item, `startedBy: [[], [], [700]]`):
  - item 700 dropped by spawned npc 200 with cmangos rate 0.04 → `starter.kind === "collect"`, `dropChance === 0.04`, `assumedDropChance === false`, `accept.npcId === 200`;
  - item 701 with a QuestieDB rate and a cmangos rate → QuestieDB rate wins;
  - item 702 with spawned npc source and no rate anywhere → `assumedDropChance === true`;
  - item 703 dropped only by an object → `starter.kind === "use"`;
  - item 704 dropped only by an in-instance npc → excluded `noPosition`; quest with no starter at all → still `noStarter`;
  - elite source mob → `info.isElite === true`; no start zone starts on an item-started quest.
  - `questRepository.test.ts`: `startedBy: [[1], null, [700, 701]]` → `starterItems` `[700, 701]`.
- [ ] **Step 2:** `npx vitest run tools/route-builder/test/world.test.ts addon/test/questRepository.test.ts` → FAIL.
- [ ] **Step 3:** Extract the item-source part of `taskOf` into `itemTask(itemId, count, base, rateOf: (itemId: number, npcId: number) => number | null): Task` (objectives pass QuestieDB only, starters QuestieDB ?? cmangos); `routeQuest` builds the starter from the first starter item that yields a task when the quest has no NPC/object starter; skip such quests in the start-zone pick.
- [ ] **Step 4:** Same command, then `npm run typecheck:tools` → PASS.
- [ ] **Step 5:** Commit `feat: model item-started quests with a loot starter task`.

### Task 3: simulate, build and emit the loot accept

**Files:**
- Modify: `tools/route-builder/sim/simulate.ts`, `tools/route-builder/opt/build.ts`, `tools/route-builder/emit/emit.ts`
- Test: `tools/route-builder/test/simulate.test.ts`, `tools/route-builder/test/build.test.ts`, `tools/route-builder/test/emit.test.ts`

**Interfaces:**
- Consumes: `RouteQuest.starter` (Task 2).
- Produces: `SimState.kills: Map<number, number>` (npc id → kills, copied by `cloneState`); `doTask(s, task, scenario, credit = 0)` where credit lowers the kills still needed (never below 0) and every kill increments `s.kills` for `task.cluster.center.npcId`.

- [ ] **Step 1: Failing tests:**
  - simulate: accepting a quest whose starter is a collect task at 0.5 costs `killsForItems(1, 0.5, COLLECT_QUANTILE)` kills of time and XP; after a kill task on the same npc with that many kills, the accept costs only travel + 0 kills; `cloneState` copies `kills`.
  - build: a loot-starter quest sharing its mob with an in-log kill task is accepted after that task's `complete` step; a 0.01 starter far below the grind rate is not accepted.
  - emit: the accept step of a loot-starter quest carries `npcId` of the mob and the starter loop points.
- [ ] **Step 2:** `npx vitest run tools/route-builder/test` → FAIL.
- [ ] **Step 3:** Implement: `questStep` accept runs `doTask(s, q.starter, scenario, s.kills.get(npc) ?? 0)` before adding to the log; `worthIt` adds the starter cost on a probe with its own `kills` copy; `acceptQuests` skips a loot-starter whose npc is the npc of an open task of a quest in the log; `emittedStep` adds the loop for accept steps with a starter.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat: route loot accepts with kill credit`.

### Task 4: in-game loot accept target

**Files:**
- Modify: `addon/src/game/positions.ts`, `addon/src/route/follower.ts`, `addon/src/targets/completion.ts` (`Target.loot?: string`), `addon/src/game/engine.ts` (`targetAction`), `addon/src/core/l10n.ts`, `addon/src/main.ts`
- Test: `addon/test/routeFollower.test.ts`, `addon/test/positions.test.ts`

**Interfaces:**
- Produces: `type StarterLoot = (q: QuestInfo, npcId: number | null) => { item: string; points: WorldPos[] } | null` and `createStarterLoot(repo: QuestRepository, toWorld: AreaToWorld, itemName: (id: number) => string | null): StarterLoot` in `positions.ts` (null when the quest has a starter NPC/object or no starter item; item = first starter item whose sources include `npcId`, else the first; points = all its npc and object drop spawns); `FollowerDeps.starterLoot?: StarterLoot`; L10n key `targetLootStarter`.

- [ ] **Step 1: Failing tests:**
  - positions: quest with `starterNpcs: []`, `starterItems: [700]`, item 700 sources npc 5 → `{ item: "Book", points: <npc 5 spawns> }`; quest with a starter NPC → `null`.
  - follower: accept step of such a quest → target `cluster` from those points (nearest to the step), `pos` its center, `loot === "Book"`, `describeTarget` text `Quest · loot Book to start it`; the step counts done once the quest is in the log.
- [ ] **Step 2:** `npm test` → the new tests FAIL.
- [ ] **Step 3:** Implement; `main.ts` wires `createStarterLoot(repo, mapToWorld(repo), (id) => clientItemName(id) ?? repo.itemName(id))`; follower caches the clusters under key `${questId}:starter`.
- [ ] **Step 4:** `npm test` → PASS (including `luaLimits`, `l10n`).
- [ ] **Step 5:** Commit `feat: point loot accepts at the drop spawns in game`.

### Task 5: routes, README, PR

- [ ] **Step 1:** `npm run gen:routes` (background, ~5 min); check `data/routes/report.md` `noStarter` dropped and quest counts.
- [ ] **Step 2:** README **Features**: item-started quests are routed (loot step at the dropping mobs, rates from cmangos, kills shared with other quests).
- [ ] **Step 3:** `npm test` → PASS; commit `chore: regenerate routes with item-started quests`; push, open PR.

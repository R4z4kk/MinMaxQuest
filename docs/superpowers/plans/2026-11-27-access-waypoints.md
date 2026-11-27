# Access and Waypoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill and collect objectives get a real waypoint route. The Access tab lists everything that can be unlocked, imported from Attune and checked and completed against QuestieDB.

**Architecture:**
- **Waypoints:** a pure `waypointLoop` in `targets/spawns.ts`, used by Completion and by the route follower.
- **Access data:** an offline importer (`tools/access-import/`, wasmoon like the route builder) reads the local Attune install, cross-checks it against the QuestieDB snapshot, and generates `addon/src/data/generated/access.ts` plus a report.
- **Access tab:** it renders grouped entries with step progress and tracking.

**Tech Stack:** TypeScript → Lua 5.1 (TypeScriptToLua), tsx, vitest, wasmoon.

**Spec:** `docs/superpowers/specs/2026-11-27-access-waypoints-design.md` (binding).

## Global Constraints

- **Language and style:**
  - English for code, names, comments, commits and README.
  - Comments minimal.
  - UI strings go through l10n in frFR and enUS. Entry names come from Attune's enUS/frFR locale, following MinMaxQuest's language.
- **TypeScript:** no `any`, no explicit `undefined`.
- **TSTL-safe in `addon/src`:** no regex, no bitwise ops, and no nil inside arrays.
- **Robustness:**
  - no frame creation in combat;
  - no per-frame allocation;
  - `guard`/`reportOnce`;
  - no silent defaults.
- **Importer:**
  - it fails loudly when the Attune files are missing or their shape changed;
  - its source is dated: Attune version from its TOC, `verifiedOn`, `expiresOn` +30 days, covered by an expiry test like the route builder's;
  - generated output is deterministic.
- **Tests:** need no network or caches. Integration tests on the real Attune install use `skipIf`.
- **README and NOTICE:**
  - `CLAUDE.md` applies: update Features and Credits, and leave Latest update untouched;
  - credit Attune (CixiDelmont) in `NOTICE` and the README.
- **Commits:** conventional, no `Co-Authored-By`. Branch `feat/access-waypoints` (created from `feat/polish-batch`).

## Review Focus

- **Small or sparse spawn sets:** a single spawn point gives a loop of 1 and the arrow stays there, which is correct. Points on another continent are excluded. Spawns beyond 250 yd are excluded.
- **Attune step with an unknown quest or item id:** it is kept, flagged in the report, and shown in the tab. It is not inserted into the route, and nothing crashes.
- **Faction:**
  - "Both" entries appear for both factions;
  - Horde-only entries never appear for an Alliance character;
  - QuestieDB-added dungeon quests respect the quest's race mask.
- **Access tab with 70+ entries:** it scrolls, stays inside the window, and frames are created once.
- **Tracking an entry whose quests are already in the route:** nothing is inserted twice; `present` is honoured.

---

### Task 1: Waypoint loop

**Files:**
- Modify:
  - `addon/src/targets/spawns.ts` (+ `waypointLoop`, `WAYPOINT_RADIUS_YARDS = 250`, `WAYPOINT_MAX = 25`);
  - `addon/src/targets/completion.ts` (target cluster built with the waypoint loop);
  - `addon/src/route/follower.ts` (objective steps build the loop in game from repository positions, the same as Completion, instead of the emitted `loop`);
  - `addon/src/game/engine.ts` if the loop is consumed there;
  - `addon/src/map/pins.ts` (the objective pin follows the current waypoint).
- Test: `addon/test/spawns.test.ts`, `addon/test/completion.test.ts`, `addon/test/routeFollower.test.ts`, `addon/test/engine.test.ts`, `addon/test/pins.test.ts`

**Interfaces:**

```ts
function waypointLoop(points: WorldPos[], cluster: SpawnCluster, start: WorldPos, radius: number, max: number): WorldPos[]
// all points on cluster.center's continent within radius of cluster.center; nearest `max` to the center when more;
// nearest-neighbour order starting from `start`
```

- The engine keeps `nextLoopIndex` with 25 yd and cycles.
- `Target.cluster.points` holds the waypoint list; the loop logic stays where it is.

- [ ] **Step 1: Write the failing tests:**
  - 30 points within 250 yd gives 25, ordered by nearest neighbour;
  - points at 300 yd and on another continent are excluded;
  - a single point gives `[p]`;
  - Completion's objective target carries the extended points;
  - a route objective step's target carries the in-game waypoints (not the emitted loop);
  - the pin follows the current waypoint index.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: route the arrow through spawn waypoints`

---

### Task 2: Attune importer with QuestieDB cross-check

**Files:**
- Create:
  - `tools/access-import/main.ts`, `tools/access-import/attune.ts` (parse), `tools/access-import/crosscheck.ts`;
  - `tools/access-import/test/*.test.ts`;
  - `addon/src/data/generated/access.ts` (generated);
  - `data/access/report.md` (generated).
- Modify:
  - `package.json` (`"gen:access": "tsx tools/access-import/main.ts"`);
  - `tools/route-builder/tsconfig.json` include if needed, so tools are type-checked;
  - `tools/route-builder/sources.ts` or a new `tools/access-import/sources.ts` (`ATTUNE = { version, path, source: "Attune by CixiDelmont, https://warcraftratings.com", verifiedOn, expiresOn }`);
  - the expiry check.

**Interfaces (generated file):**

```ts
export type AccessGroup = "dungeon" | "raid" | "key" | "misc";
export type AccessStepKind = "pickUp" | "turnIn" | "quest" | "item" | "kill" | "level" | "interact" | "click" | "rep" | "prof" | "end";
export interface AccessStep { id: number; kind: AccessStepKind; ref: number; follows: number[]; origin: "attune" | "questiedb" }   // ref = quest/item/npc id or level
export interface AccessEntry { id: string; group: AccessGroup; faction: "A" | "H" | "AH"; levels: [number, number] | null;
  name: { enUS: string; frFR: string }; steps: AccessStep[] }
export const ACCESS: { source: { name: "Attune"; version: string; questieDb: string; verifiedOn: string; expiresOn: string }; entries: AccessEntry[] }
```

**Rules:**
- **Loading Attune:**
  - load `AttuneData.lua` and the `enUS`/`frFR` locale files in wasmoon;
  - `AttuneLang` is the locale table, so names resolve per locale;
  - read `Attune_Data.attunes` and `Attune_Data.steps`;
  - drop `Spacer` steps, and remap `FOLLOWS` across them;
  - map the step `TYPE` to `AccessStepKind`. An unknown TYPE throws, naming it.
- **Cross-check** with the QuestieDB snapshot (`readCachedSnapshot` from the route builder) and the instance types (wago, `loadInstanceTypes`). The report lists:
  - unknown quest or item ids;
  - faction conflicts;
  - party dungeons missing from Attune;
  - dungeon quests (`zoneOrSort` = dungeon area or alt area) missing from Attune's dungeon entry.
- **Completions:**
  - a missing dungeon becomes an entry (group `dungeon`, name from the client area name via QuestieDB `dungeons.lua` name for enUS, with frFR equal to enUS and flagged in the report);
  - a missing dungeon quest is appended as a `quest` step with `origin: "questiedb"`.
- **Dalaran:** keep the existing Dalaran Sewers and Tome of Dalaran chains (from `addon/src/access/chains.ts`) as entries if Attune lacks them.

- [ ] **Step 1: Write the failing tests** on a small inline Attune-shaped fixture written for the test:
  - parse attunes and steps;
  - Spacer removal and FOLLOWS remap;
  - TYPE mapping;
  - an unknown TYPE throws;
  - names per locale;
  - cross-check flags an unknown id and adds a missing dungeon quest;
  - the faction mapping (Horde / Alliance / Both).
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** Run `npm run gen:access` on the real install (`../Attune`). Record in the report:
  - totals per group and faction;
  - unknown ids;
  - completions added.
- [ ] **Step 4: Run.** `npm test`, expect PASS. Add an integration test, skipped if Attune is absent: it imports the real data, finds at least 50 dungeons, the Molten Core entry with quest 7848, and the Onyxia entries for both factions.
- [ ] **Step 5: Commit.** `feat: import access data from Attune with a QuestieDB cross-check`, then `chore: generate access data`

---

### Task 3: Access model and progress

**Files:**
- Modify/Create:
  - `addon/src/access/chains.ts` (replace the hard-coded list with `ACCESS` entries, keeping `resolveSteps`-like helpers);
  - `addon/src/access/progress.ts` (step progress per kind);
  - `addon/src/ui/accessModel.ts`;
  - `addon/src/route/follower.ts` (tracking inserts the quests of an entry through `chainBlock`);
  - `addon/src/core/storage.ts` (`trackedChains` keeps entry ids; drop unknown ids on load).
- Test: `addon/test/access.test.ts`, `addon/test/accessModel.test.ts`, `addon/test/routeFollower.test.ts`

**Progress rules:**
- `pickUp`: the quest is in the log or completed.
- `turnIn` and `quest`: completed.
- `item`: `C_Item.GetItemCount(ref) > 0`.
- `level`: player level ≥ ref.
- `kill`, `interact`, `click`, `rep`, `prof` and `end`: done when any step that follows them is done.

An entry is complete when its `end` step, or else its last step, is done. A step whose id is unknown to QuestieDB shows as todo and is never inserted.

**Tracking:** the quests of an entry (`pickUp`, `turnIn` and `quest` refs, deduplicated, in step order) go to `chainBlock` with `present`. A `quest`-only dungeon entry inserts each quest's accept, objectives and turn-in.

- [ ] **Step 1: Write the failing tests:**
  - each progress rule;
  - entry completion;
  - faction filter;
  - tracking inserts only quests and skips present ones;
  - stored unknown tracked ids are dropped.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: track every access entry`

---

### Task 4: Access tab UI

**Files:**
- Modify: `addon/src/ui/accessTab.ts`, `addon/src/ui/theme.ts` if a scroll helper is needed, `addon/src/core/l10n.ts`
- Test: `addon/test/uiLua.test.ts`

**Layout:**
- Collapsible groups: Dungeons / Raids / Keys / Misc, each with a count.
- One row per entry: name, level range and a progress bar. Clicking expands the steps: done steps struck through, the current one with ▸, later ones plain.
- Step labels:
  - a quest name from the client, falling back to QuestieDB;
  - an item name from `C_Item.GetItemNameByID`, falling back to `#id`;
  - "Reach level N";
  - "Kill" / "Talk to" / "Use" with the npc or object name when known.
- A "Track in route" checkbox per entry.
- A scroll frame (`UIPanelScrollFrameTemplate` or a manual offset), with all frames created once.
- The tab keeps its size.

- [ ] **Step 1: Write the failing compiled-Lua tests:**
  - the groups render with counts for an Alliance character, with no Horde-only entry;
  - expanding an entry shows its steps with states;
  - the list scrolls when entries exceed the visible area;
  - "Track in route" stores the id and refreshes the targets.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: list every access entry in the access tab`

---

### Task 5: Docs and credits

**Files:** `README.md` (Access tab, waypoints, Credits), `NOTICE` (Attune credit), `docs/in-game-checklist.md`

- [ ] **Step 1: README Features.**
  - Access tab: groups, steps, tracking, and that the data comes from Attune plus QuestieDB.
  - Guide arrow: waypoint route through the spawns.
  - Credits: Attune.
- [ ] **Step 2: NOTICE.** Add the Attune credit.
- [ ] **Step 3: Checklist.** Add lines for the waypoints and the Access entries.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `docs: describe access entries and waypoints`

### Task 6: Arrow follows the window, eye button, hover-only outline

**Files:** `addon/src/ui/window.ts` (eye button left of the gear; visibility), `addon/src/main.ts` (`toggleWindow` also hides or shows the arrow and the item holder; the arrow sync respects window visibility), `addon/src/arrow/arrowFrame.ts` (outline and grip on `OnEnter`/`OnLeave` while unlocked, and while dragging), `addon/src/arrow/itemButton.ts` (hidden with the window, out of combat only, else queued), `addon/src/core/storage.ts` (`CharDb.hidden: boolean`), `addon/src/core/l10n.ts`, README.
**Rules:**
- `/mmq` toggles the window, the arrow and the item button together.
- The eye hides all three and sets `hidden`; `/mmq` clears it.
- While hidden, `syncArrow` hides the arrow.
- Item holder Show/Hide only out of combat (queue otherwise).
- The outline and grip are visible only while hovered or dragged when unlocked.
- [ ] Compiled-Lua tests:
  - `/mmq` hides and shows all three;
  - the eye button hides them and the state survives reload;
  - in combat the item holder change is deferred;
  - the outline is hidden by default, shown on hover when unlocked, and never shown when locked.
- [ ] Implement. `npm test` PASS.
- [ ] Commit `feat: hide the arrow with the window and add an eye button`.

### Task 7: Proximity limited to current and neighbouring zones

**Files:** `addon/src/targets/completion.ts` (proximity filter by a set of uiMap ids), a new pure `addon/src/game/neighbours.ts` (`neighbourMaps(current: number, rects: MapRect[], marginYards = 300): Set<number>`), `addon/src/game/routing.ts` or `main.ts` (rects read once from HereBeDragons `mapData` / `C_Map.GetMapWorldSize` fallback and the zone maps of the current continent), `addon/src/ui/completionTab.ts` (counts), README.
**Rules:** see the design §2bis.4. Quests whose zone map is unknown are excluded from Proximity only.
- [ ] Tests:
  - `neighbourMaps`: touching rects, a 250 yd gap, a 400 yd gap, another continent;
  - Proximity returns only quests in those maps;
  - Zone and Log are unchanged.
- [ ] Implement. `npm test` PASS.
- [ ] Commit `feat: limit proximity to the current and neighbouring zones`.

### Task 8: Completion mode sub-tabs

**Files:** `addon/src/ui/completionTab.ts` (a second tab row Proximity | Zone | Log in the same style as the window tabs, reusing the tab helper from `ui/window.ts`/`theme.ts` by export; the zone picker shown in Zone only; the cycle button removed), `addon/src/ui/viewModel.ts`, `addon/src/core/l10n.ts`, tests (replace the cycle tests with tab tests; keep the header-fit layout test for all modes and both locales), README.
- [ ] Tests:
  - clicking each sub-tab sets the mode and highlights it;
  - the zone picker is visible only in Zone;
  - the layout fits in enUS and frFR.
- [ ] Implement. `npm test` PASS.
- [ ] Commit `feat: switch completion modes with sub-tabs`.

## After the plan

Open a PR `feat/access-waypoints`. Its base is `feat/polish-batch` until PR #6 merges, then `main`.

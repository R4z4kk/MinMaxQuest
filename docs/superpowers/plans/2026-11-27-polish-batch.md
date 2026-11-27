# Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six improvements from the first in-game test:
1. the arrow can be dragged and locked;
2. the label under the arrow turns white;
3. the arrow points to the corpse when the player is dead;
4. the language can be chosen;
5. a movable button uses the quest item;
6. Completion gains a "Log" mode that only targets quests already in the log.

**Architecture:** Small, local changes in the existing addon modules. The quest item button is a new secure frame next to the arrow, updated only out of combat. The pure decisions (corpse priority, item choice, log mode) live in testable functions.

**Tech Stack:** TypeScript → Lua 5.1 (TypeScriptToLua), vitest, wasmoon with the repo's fake game (`addon/test/helpers/fakeGame.ts`, `wowStubs.ts`).

**Spec:** `docs/superpowers/specs/2026-11-27-polish-batch-design.md` (binding).

## Global Constraints

- **Language and style:**
  - English for code, names, comments, commits and README.
  - Comments minimal.
  - Every UI string goes through `core/l10n.ts` in both frFR and enUS.
- **Types:** TypeScript only. No `any`. No explicit `undefined`.
- **TSTL-safe:**
  - no regex, no bitwise ops;
  - a nil inside a Lua array ends iteration.
- **Combat rules:**
  - no frame creation in combat;
  - secure frames (the item button) are created once out of combat;
  - their attributes, Show/Hide and movement change only out of combat; a change requested in combat is queued until `PLAYER_REGEN_ENABLED`.
- **Robustness:**
  - no allocation in per-frame code;
  - every feature runs behind `guard`/`reportOnce`;
  - no silent defaults.
- **README:** `CLAUDE.md` applies. Update Features for every user-visible change. Do not touch Latest update.
- **Commits:** conventional, no `Co-Authored-By` line. Branch `feat/polish-batch` (already created).

## Review Focus

- **Dead without a known corpse position** (corpse in an instance): the arrow hides, there is one report line, and no error loop. When the player resurrects, the normal target returns.
- **Item button and combat:**
  - The target changes in combat to a quest with a different item: the button keeps its old item until combat ends, then updates, with no taint error.
  - Dragging the button in combat does nothing.
- **Locked arrow:** it does not capture the mouse, so clicks pass through to the world. When unlocked, dragging saves the position.
- **Language set to a value other than the client's:** UI strings switch after reload. Quest and NPC names stay in the client's language, and nothing crashes on a missing key.
- **Log mode with an empty quest log:** "0 quests in log", no target, and no error.

---

### Task 1: Draggable, lockable arrow with a white label

**Files:**
- Modify:
  - `addon/src/arrow/arrowFrame.ts`;
  - `addon/src/core/storage.ts` (`arrow.locked` default `false` when `db.arrow` is null);
  - `addon/src/ui/questTab.ts` (Options checkbox "Lock arrow");
  - `addon/src/game/commands.ts` (`/mmq arrow move|lock` drive the same lock);
  - `addon/src/core/l10n.ts`.
- Test: `addon/test/arrowFrame.test.ts`, `addon/test/uiLua.test.ts`

**Interfaces:**
- `ArrowApi` gains `setLocked(locked: boolean): void` and `isLocked(): boolean`. `setMoveMode(on)` becomes `setLocked(!on)`, and the dotted outline and grip show while unlocked.
- When unlocked:
  - `EnableMouse(true)`, `SetMovable(true)`, left-button drag;
  - `OnDragStop` saves `db.arrow = { x: GetLeft(), y: GetTop(), locked: false }`.
- When locked: `EnableMouse(false)`.
- Label color is `(0.902, 0.902, 0.902)`, the same as the distance.

- [ ] **Step 1: Write the failing tests:**
  - unlocked arrow: mouse enabled, a drag saves the position;
  - locked arrow: mouse disabled;
  - the checkbox toggles `db.arrow.locked`;
  - `/mmq arrow lock` checks the box;
  - a fresh character (`db.arrow == null`) starts unlocked;
  - the label color equals the distance color.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: drag and lock the arrow from the quest tab`

---

### Task 2: Arrow to the corpse

**Files:**
- Create: `addon/src/arrow/corpse.ts`, `addon/test/corpse.test.ts`
- Modify:
  - `addon/src/main.ts` (arrow update: the corpse overrides the engine target);
  - `addon/types/wow.d.ts` (`C_DeathInfo.GetCorpseMapPosition`, `UnitIsDeadOrGhost`, `C_Map.GetBestMapForUnit`, `C_Map.GetMapInfo` if needed for the parent);
  - `addon/test/helpers/wowStubs.ts`;
  - `addon/src/core/l10n.ts` (`corpse` "Your corpse" / "Ton corps"; `corpseUnknown`).

**Interfaces:**

```ts
interface CorpseDeps { isDead(): boolean; corpseOnMap(uiMapId: number): { x: number; y: number } | null;
  playerMap(): number | null; parentMap(uiMapId: number): number | null; toWorld(uiMapId: number, x: number, y: number): WorldPos | null }
type CorpseTarget = { kind: "none" } | { kind: "unknown" } | { kind: "corpse"; target: ArrowTarget }
function corpseTarget(deps: CorpseDeps, label: string): CorpseTarget
```

**Behaviour:**
- Not dead: `none`, and the normal target is used.
- Dead: try the player's map, then its parent map.
  - Found: `corpse`, and the arrow uses it, overriding route, Completion and pin.
  - Not found: `unknown`. The arrow hides and one `reportOnce("corpse", t("corpseUnknown"))` is printed.
- Positions are converted with `uiMapToWorld` from `game/positions.ts`.

- [ ] **Step 1: Write the failing tests:** the four cases above, plus a compiled-Lua test where a fake death makes the arrow label "Your corpse".
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** Also force an arrow refresh on `PLAYER_DEAD`, `PLAYER_ALIVE` and `PLAYER_UNGHOST`, and register those events.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: point the arrow to the corpse when dead`

---

### Task 3: Language setting

**Files:**
- Modify:
  - `addon/src/core/storage.ts` (`AccountDb` gains `locale: "auto" | "enUS" | "frFR"`, default `"auto"`, validated);
  - `addon/src/core/l10n.ts` (`setLocale` applied at load from the account setting; `"auto"` uses `GetLocale()` as today);
  - `addon/src/main.ts`;
  - `addon/src/ui/questTab.ts` (Options: a "Language" row with three buttons Auto / English / Français, plus a "Reload" button shown when the stored value differs from the active locale, calling `ReloadUI()`);
  - `addon/types/wow.d.ts` (`ReloadUI`);
  - stubs.
- Test: `addon/test/storage.test.ts`, `addon/test/l10n.test.ts` (or existing), `addon/test/uiLua.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - the account default is `auto`, and an invalid value is repaired;
  - with `frFR` stored on an enUS client, the strings are French after load;
  - the Language buttons store the value;
  - Reload shows only when the value differs and calls `ReloadUI` (stub counter).
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.** Apply the locale before any UI string is read.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: choose the addon language`

---

### Task 4: Log mode in Completion

**Files:**
- Modify:
  - `addon/src/targets/completion.ts` (`CompletionOptions.mode` gains `"log"`);
  - `addon/src/core/storage.ts` (mode validation);
  - `addon/src/ui/completionTab.ts` (the mode button cycles Proximity → Zone → Log; the zone picker is hidden in Log; the header shows "N quests in log");
  - `addon/src/ui/viewModel.ts` if it builds the header;
  - `addon/src/core/l10n.ts`.
- Test: `addon/test/completion.test.ts`, `addon/test/storage.test.ts`, `addon/test/uiLua.test.ts`

**Rules in `"log"` mode:**
- Only quests in `input.log`: objective targets for unfinished objectives, turn-in targets for complete quests. No accept targets.
- Grey and elite filters are ignored, and the zone is ignored.
- The pin still works as today.

- [ ] **Step 1: Write the failing tests:**
  - log mode returns no accept targets;
  - a grey quest in the log is still targeted;
  - an empty log gives `[]`;
  - the mode button cycles through the three modes;
  - the header text shows the count;
  - storage keeps `"log"` and repairs an unknown mode.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: add a log mode to completion`

---

### Task 5: Movable quest item button

**Files:**
- Create: `addon/src/arrow/questItem.ts` (pure choice), `addon/src/arrow/itemButton.ts` (frames), `addon/test/questItem.test.ts`
- Modify:
  - `addon/src/data/questRepository.ts` (`QuestInfo` gains `sourceItemId: number | null` and `requiredSourceItems: number[]`, read from QuestieDB fields `sourceItemId` and `requiredSourceItems`);
  - `addon/types/questiedb.d.ts` if typed;
  - `addon/src/core/storage.ts` (`CharDb.itemButton: { x: number; y: number } | null`);
  - `addon/src/main.ts` (wiring, `PLAYER_REGEN_ENABLED`, `BAG_UPDATE_DELAYED`);
  - `addon/types/wow.d.ts` (`C_Item.GetItemCount`, `GetItemSpell`, `GetItemIconByID`, `GetItemCooldown`, `SecureActionButtonTemplate` usage, `InCombatLockdown`);
  - stubs.
- Test: `addon/test/questItem.test.ts`, `addon/test/questRepository.test.ts`, `addon/test/uiLua.test.ts`
- The tools snapshot (`tools/route-builder/ingest/questie.ts` `QUEST_FIELDS`) must carry the two new fields if the repository reads them, so the offline world stays consistent. Add them and keep `npm test` green; no route regeneration is needed.

**Interfaces:**

```ts
interface ItemDeps { count(itemId: number): number; usable(itemId: number): boolean }
function questItemFor(q: QuestInfo | null, deps: ItemDeps): number | null   // sourceItemId first, then requiredSourceItems in order; only if count > 0 and usable
interface ItemButtonApi { want(itemId: number | null): void; setLocked(locked: boolean): void; onCombatEnd(): void }
function createItemButton(db: CharDb, anchor: () => Frame): ItemButtonApi
```

**Frames:**
- A non-secure holder frame named `MinMaxQuestItemHolder` with a thin grip border.
- A child `MinMaxQuestItemButton` created with `CreateFrame("Button", name, holder, "SecureActionButtonTemplate")`:
  - attributes `type = "item"` and `item = "item:<id>"`;
  - an icon texture from `GetItemIconByID`;
  - a count FontString;
  - a cooldown frame (`CooldownFrameTemplate`) updated from `C_Item.GetItemCooldown`;
  - a tooltip via `GameTooltip:SetItemByID` on enter.

**Placement and movement:**
- The first position is to the right of the arrow (`anchor()`).
- Once dragged, the position is `db.itemButton`.
- The holder is draggable by its grip only while `db.arrow.locked` is false and `!InCombatLockdown()`.

**Combat:**
- `want(id)` stores the wish. If out of combat, it applies the attributes and Show/Hide at once. In combat it waits for `onCombatEnd()`.
- Never call `SetAttribute`, `Show`, `Hide`, `SetPoint` or `StartMoving` on these frames in combat.

- [ ] **Step 1: Write the failing tests:**
  - `questItemFor`: source item first; skipped when not in the bags or not usable; then required items; null when none.
  - Repository: the fields are read; their absence gives `null` / `[]`.
  - Compiled Lua:
    - the button shows with the right attribute when the target's quest has a usable bag item;
    - in fake combat, a change is deferred and applied after `PLAYER_REGEN_ENABLED`;
    - the grip drag saves `db.itemButton` when unlocked and is ignored when locked or in combat.
- [ ] **Step 2: Run.** It fails.
- [ ] **Step 3: Implement.**
  - The target's quest is `engine.current()?.questId`, in both modes.
  - Refresh the wish on target change and on `BAG_UPDATE_DELAYED`.
- [ ] **Step 4: Run.** `npm test`, expect PASS.
- [ ] **Step 5: Commit.** `feat: add a movable quest item button`

---

### Task 6: README and in-game checklist

**Files:**
- Modify: `README.md`, `docs/in-game-checklist.md`

- [ ] **Step 1: Update the README Features.** Cover:
  - arrow drag and lock, and the white label;
  - the corpse arrow;
  - the Language option, and that quest and NPC names follow the client;
  - the quest item button (movable, out-of-combat updates);
  - the Completion Log mode.

  Commands: update the `/mmq arrow` line if needed. Do not touch Latest update.
- [ ] **Step 2: Add one checklist line per feature.**
- [ ] **Step 3: Run.** `npm test`, expect PASS.
- [ ] **Step 4: Commit.** `docs: describe the polish batch features`

## After the plan

Open a PR `feat/polish-batch` → `main`. The user checks the new checklist lines in game.

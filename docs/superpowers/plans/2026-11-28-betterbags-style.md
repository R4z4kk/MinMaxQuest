# BetterBags-style Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the MinMaxQuest window after BetterBags: a violet panel, a Friz Quadrata title, sections with a count and a thin line, and rows that start with a small gold-bordered type icon. Every tab is 320 × 480.

**Architecture:**
- `ui/theme.ts` gains the palette, the title font, two shared widgets (`createSectionHeader`, `createKindIcon`) and the fixed window size.
- Each tab builds a fixed pool of line frames once. Each line shows either a section header or a row. Pure view-model functions decide the lines: `completionLines` in `viewModel.ts`, and the existing `accessLines` in `accessModel.ts`, extended.

**Tech Stack:** TypeScript → Lua 5.1 (TypeScriptToLua), vitest, wasmoon fake game (`addon/test/helpers/fakeGame.ts`).

**Spec:** `docs/superpowers/specs/2026-11-28-betterbags-style-design.md` (binding).

## Global Constraints

- **Language and style:**
  - English for code, names, comments and commits; comments minimal.
  - UI strings go through l10n in enUS and frFR.
- **TypeScript:** no `any`, no explicit `undefined`.
- **TSTL-safe in `addon/src`:** no regex, no bitwise ops, no nil inside arrays.
- **Frames and robustness:**
  - frames are created once and never in combat;
  - no allocation per frame;
  - use `guard` / `reportOnce`;
  - no silent defaults.
- **Palette:**

  | Token | Value |
  |---|---|
  | bg | `#1b1830`, alpha 0.93 |
  | line | `#3a3360` |
  | title | `#f1e7c8` |
  | sub | `#9d95c4` |
  | done | `#8f8aa8` |
  | rowText | `#dddddd` |
  | iconBg | `#2a2446` |
  | accent (kept) | `#c9a75a` |

- **Fonts:**
  - window title and section headers: `Fonts\\FRIZQT__.TTF`, size 16 for the title and 13 for section headers;
  - rows, tabs and counts stay `Fonts\\ARIALN.TTF`.
- **Window:** every tab is **320 × 480**; the title reads "MinMaxQuest" in normal case.
- **Kind icons:** a 16 px square with a 1 px gold border and a `#2a2446` fill.

  | Kind | Icon |
  |---|---|
  | accept | `Interface\\GossipFrame\\AvailableQuestIcon` |
  | turnin | `Interface\\GossipFrame\\ActiveQuestIcon` |
  | kill | `Interface\\CURSOR\\Attack` |
  | collect | `Interface\\CURSOR\\Pickup` |
  | fly | `Interface\\CURSOR\\Taxi` |
  | hearth | `Interface\\Icons\\INV_Misc_Rune_01` |
  | done | `Interface\\RAIDFRAME\\ReadyCheck-Ready` |
  | progress | the text `»`, no texture |
  | empty | no texture |

- **Not in scope:** the arrow, the item button, any icon grid, a quest-items section.
- **README and checklist:** README Features describes the look; "Latest update" stays untouched. `docs/in-game-checklist.md` (French) gets one line per visual element.
- **Commits:** conventional, no `Co-Authored-By`. Branch `feat/betterbags-style`.

## Review Focus

- **frFR labels in 320 px:** section names, counts and the longest tab labels must not overlap. Every layout test runs in both locales.
- **No targets at all** (empty Completion, finished route): the empty-state text shows and no stray section header remains.
- **More targets than slots:** the list ends with the "+N more" line inside the last slot; section counts stay the real totals.
- **The arrow target is not first in its section:** its row is still highlighted, and no other row is.
- **First open during combat:** the line pools of every tab are created out of combat, or creation waits for `PLAYER_REGEN_ENABLED` as the other tabs do. No new frame-in-combat path is added.

---

### Task 1: Theme, window chrome and shared widgets

**Files:**
- Modify: `addon/src/ui/theme.ts`, `addon/src/ui/window.ts`, every tab's `width` / `height` (`questTab.ts`, `accessTab.ts`, `completionTab.ts`)
- Test: `addon/test/uiLua.test.ts`, `addon/test/theme.test.ts` (create if absent)

**Interfaces:**
- Produces, in `theme.ts`:
  - `COLOR` keys: `bg`, `line`, `title`, `sub`, `done`, `rowText`, `iconBg`, `accent`. Keep the existing keys used elsewhere, mapped to the closest new value.
  - `FONT_TITLE = "Fonts\\FRIZQT__.TTF"`;
  - `SIZE.title = 16`, `SIZE.section = 13`;
  - `WINDOW_WIDTH = 320`, `WINDOW_HEIGHT = 480`;
  - `type IconKind = "accept" | "turnin" | "kill" | "collect" | "fly" | "hearth" | "done" | "progress" | "empty"`;
  - `interface KindIcon { frame: WowFrame; set(kind: IconKind): void }` and `createKindIcon(parent: WowFrame): KindIcon`;
  - `interface SectionHeader { frame: WowFrame; set(label: string, count: string): void }` and `createSectionHeader(parent: WowFrame, width: number): SectionHeader`. The line starts after the count and ends at the right edge.

- [ ] **Step 1: Failing tests**
  - `it("sizes the window 320 x 480 on every tab")`: clicking each of Quest, Access and Completion leaves `SetSize|320|480` as the window's last size.
  - `it("titles the window in Friz Quadrata")`: the title font string has `SetFont|Fonts\FRIZQT__.TTF|16` and the text "MinMaxQuest".
  - `it("draws a section header with its count and a line to the edge")`: the header label and count are set, and a line texture is anchored to the header's right edge.
  - `it("sets each kind icon texture")`: one assertion per `IconKind` against the table in Global Constraints. `progress` shows "»" with no texture, and `empty` shows neither.
  - Run in enUS and frFR.
- [ ] **Step 2:** Run `npx vitest run addon/test/uiLua.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - The palette and fonts above.
  - `panel()` uses the new `bg` and `line`.
  - Active tab: text `title` and the gold underline. Inactive tabs: text `sub`.
  - The window ignores per-tab sizes and always uses `WINDOW_WIDTH` × `WINDOW_HEIGHT`. Remove the per-tab `width`/`height` from `TabView`, or set them all to these constants.
- [ ] **Step 4:** Run `npm test`. Expect PASS. Update the existing layout tests that pinned the old sizes.
- [ ] **Step 5: Commit** `feat: give the window a BetterBags-style frame`

### Task 2: Completion in sections

**Files:**
- Modify: `addon/src/ui/viewModel.ts`, `addon/src/ui/completionTab.ts`, `addon/src/core/l10n.ts`
- Test: `addon/test/viewModel.test.ts` (or the existing completion view test file), `addon/test/uiLua.test.ts`

**Interfaces:**
- Consumes `createSectionHeader`, `createKindIcon`, `IconKind`, `WINDOW_*` and `COLOR` from Task 1.
- Produces, in `viewModel.ts`:
  - `type CompletionLine = { kind: "section"; label: string; count: number } | { kind: "row"; icon: IconKind; level: string; name: string; time: string; tone: "normal" | "grey" | "target" | "more" }`
  - `completionLines(targets: Target[], current: Target | null, getQuest: QuestGetter, slots: number): CompletionLine[]`
- l10n keys:

  | Key | enUS | frFR |
  |---|---|---|
  | `sectionTurnIn` | "To turn in" | "À rendre" |
  | `sectionObjectives` | "Objectives" | "Objectifs" |
  | `sectionPickUp` | "To pick up" | "À prendre" |

**Rules:**
- **Sections:** order is turnin, objective, accept. Target kind `"route"` never appears here.
- **Within a section:** keep the input order, which is travel time; one row per quest per section, as today.
- **Counts:** each count is the section's real total, not only the visible rows. An empty section is omitted.
- **Icons:**
  - an objective row is `kill` when the quest objective at `objectiveIndex` is an npc, and `collect` otherwise;
  - an accept row is `accept`;
  - a turnin row is `turnin`.
- **The arrow target:** the row matching `current` has tone `"target"` and its name starts with `GLYPH.current`. Every other row is `"normal"`, or `"grey"` when trivial.
- **Slots:** the lines are truncated to `slots`. When rows were cut, the last slot is a `"more"` row with `moreRows`. The elite tag stays.
- **Tab layout:**
  - the nearest and next cards are removed: the list is the view;
  - header, sub-tabs, zone picker (Zone only), filters and footer stay, in the new style;
  - one pool of line frames is created once. Each line holds a section header and a row (icon, level, name, time), and only the one in use is shown.

- [ ] **Step 1: Failing tests** for `completionLines`:
  - `orders sections turn-in, objectives, pick-up and omits empty ones`;
  - `counts every target of a section even when truncated`;
  - `marks only the arrow target row, even when it is not first`;
  - `uses kill for npc objectives and collect for item or object ones`;
  - `ends with a more row when rows are cut`;
  - `returns no lines for no targets`.

  Plus a uiLua test: `shows Completion sections with counts in enUS and frFR within 320 px`. It extends the header-fit test to every line in all three modes.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm test`. Expect PASS. Remove the tests of the deleted nearest/next cards, and keep the behaviour they guarded where it still exists (skip, pin).
- [ ] **Step 5: Commit** `feat: group completion targets in sections`

### Task 3: Access in sections

**Files:**
- Modify: `addon/src/ui/accessModel.ts`, `addon/src/ui/accessTab.ts`
- Test: `addon/test/accessModel.test.ts`, `addon/test/uiLua.test.ts`

**Interfaces:**
- Consumes the Task 1 widgets.
- Extends the existing access line model: group lines render through `createSectionHeader` with count `"done / total"`.
- Entry lines get an `icon: IconKind`: `done` when complete, `progress` when started, `empty` otherwise. The right side shows the level range, or a progress bar (`bar()`) when the entry is started and not complete.

**Rules:**
- Expanded steps stay indented: done steps in `COLOR.done`, the current step with `GLYPH.current`.
- Scrolling, the row pool, tracking and collapsing (click on a section header) are unchanged.

- [ ] **Step 1: Failing tests**:
  - `gives finished, started and untouched entries done, progress and empty icons`;
  - `shows a bar for started entries and the level range otherwise`;
  - uiLua `renders Access groups as section headers with done / total`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm test`. Expect PASS.
- [ ] **Step 5: Commit** `feat: show access groups as sections`

### Task 4: Quest tab in sections

**Files:**
- Modify: `addon/src/ui/questTab.ts`, `addon/src/core/l10n.ts`
- Test: `addon/test/uiLua.test.ts`

**Interfaces:**
- Consumes the Task 1 widgets.
- Produces `stepIcon(type: StepType): IconKind`, exported from `questTab.ts`:

  | `StepType` | Icon |
  |---|---|
  | `accept` | `accept` |
  | `turnin` | `turnin` |
  | `complete`, `grind`, `dungeon` | `kill` |
  | `fly`, `getFlightPath` | `fly` |
  | `hearth`, `setHearth` | `hearth` |

- l10n keys: reuse the existing current-step label key, and add `sectionNext`, "Next" / "Ensuite".

**Rules:**
- The tab shows a "Current step" section (one row with icon and progress), a "Next" section (the next steps, with icons) and collapsible "Options" and "Dungeons" sections built with `createSectionHeader`. A click toggles a section, as today.
- The off-route banner and Re-sync, Skip, the footer and every option keep their behaviour and fit in 320 × 480 in both locales.

- [ ] **Step 1: Failing tests**:
  - `maps every step type to its icon`, one assertion per row of the table;
  - uiLua `shows the current and next steps as sections with icons`;
  - uiLua `fits the Quest tab in 320 x 480 with Options and Dungeons open, enUS and frFR`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm test`. Expect PASS. Adjust the existing Quest tab tests to the new structure, without weakening what they assert.
- [ ] **Step 5: Commit** `feat: show the route as sections in the quest tab`

### Task 5: Side windows, README and checklist

**Files:**
- Modify: `addon/src/ui/zonePicker.ts`, `addon/src/ui/skipDialog.ts`, `addon/src/ui/banner.ts`, `README.md`, `docs/in-game-checklist.md`
- Test: `addon/test/uiLua.test.ts`

**Rules:**
- The side windows take the palette only (`panel()`, `COLOR.title` / `COLOR.sub`), with no layout change.
- README Features:
  - describes the BetterBags-style window (violet panel, sections with counts, type icons, fixed size);
  - updates the Completion lines, since the nearest/next cards are gone and the target row is highlighted;
  - leaves "Latest update" untouched.
- Checklist, in French, one line each:
  - Friz Quadrata title and sections;
  - every kind icon visible (no green square);
  - violet panel;
  - 320 × 480 on every tab;
  - Completion sections and the highlighted target;
  - Access sections and bars;
  - Quest tab sections;
  - side windows in the palette.

- [ ] **Step 1: Failing test:** uiLua `paints the zone picker and skip dialog with the panel colors`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3: Implement**, then update the README and the checklist.
- [ ] **Step 4:** Run `npm test`. Expect PASS.
- [ ] **Step 5: Commit** `feat: restyle side windows and describe the new look`

## After the plan

Final whole-branch review, then a PR `feat/betterbags-style` → `main`.

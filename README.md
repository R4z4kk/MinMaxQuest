# MinMaxQuest

**One clean, fast quest guide for WoW: Forever.** An arrow that takes you exactly where you need to go, a to-do list sorted by real travel time, and dungeon / raid access tracking, in a single window.

> **Alpha.** Precomputed level 1-60 routes, Completion and Access tabs all work today.

## Latest update

**0.1.0-alpha**: first public alpha.
- Guide arrow.
- Completion and Access tabs.
- Quest log pin button.
- Skip with a follow-up warning.
- Auto-fly at flight masters.
- Map pins.

## Why MinMaxQuest

- **No more map clutter.** Only your current step and the next one are shown on the map, not every possible drop location.
- **Real travel time, not straight lines.** Targets are sorted by how long it actually takes to get there, counting flight paths, boats and your hearthstone.
- **One addon instead of three.** You get guidance, a completion list and access tracking in one window.

## Features

### Window
- A single window with three tabs: **Quest**, **Access** and **Completion**.
- Each tab resizes the window to fit its content.
- The window and the last opened tab are remembered across sessions.
- **Eye button** left of the gear: hides the window, the arrow and the quest item button together. `/mmq` brings them back. The hidden state is saved per character.
- Black background with a muted gold accent and simple fonts.
- Available in English and French. The **Language** row in the Quest tab Options (Auto, English, Français) is saved account-wide; Auto follows the game client. A **Reload** button appears when a change needs a UI reload. Quest, NPC and zone names always follow the game client language.

### Guide arrow
- **What it points to:** quest givers, quest items, objects and mob areas, with the distance and the step label as white text under the arrow.
- **Kill and collect objectives:** it walks a loop through the spawn points around the chosen area (up to 25 within 250 yards), nearest first, and moves on to the next waypoint within 25 yards. The loop repeats until the objective is done, in the Quest and Completion tabs. The map and minimap pins follow the current waypoint. It doesn't send you to a single spot.
- **Many spawn locations:** it targets the closest group and shows "+N other spots" for the rest.
- **Objectives:** it follows them in quest log order, honouring QuestieDB ordering hints.
- **Moving it:** drag it with the left mouse button while it is unlocked (the default on a new character). The position is saved. Tick **Lock arrow** in the Options (or `/mmq arrow lock`) to freeze it; a locked arrow lets clicks through. `/mmq arrow move` unlocks it. The dotted frame and the grip only show while the mouse is over an unlocked arrow, or while you drag it. An unlocked arrow with no target stays hidden until you untick **Lock arrow** or use `/mmq arrow move`, which also shows everything again.
- **Quest item button:** when the arrow's quest has a usable item in your bags (the item the quest giver hands you, then the items the quest requires), a square button with its icon, count, cooldown and tooltip appears to the right of the arrow. Click it to use the item. Works in the Quest and Completion tabs. It is movable on its own: drag it by its thin gold border while the arrow is unlocked, out of combat; its position is saved per character. **Lock arrow** locks it too. A change asked for in combat (new item, lock) is applied when combat ends.
- **Corpse run:** while dead at your body the arrow hides, silently. Once you release as a ghost it points to your corpse, overriding every other target. If the corpse position is unknown it hides and says so once.
- **When it hides:** in instances, during flights, and when there is no target.
- **Performance:** at most 30 updates per second. Route refreshes are batched: at most one every 2 seconds, skipped while standing still or flying, and immediate when an objective changes.

### Targeting
- **Automatic by default:** the nearest useful step is chosen for you. That can be picking up a quest, an objective or a turn-in.
- **Only quests you can take:** level, race, class, faction, prerequisites and exclusive quests are all taken into account.
- **Travel:** the route goes through flight masters, boats and your hearthstone when that is faster (the hearthstone only when it saves at least about 5 minutes, or 15 minutes in Completion). The arrow then says "Go to the flight master", "Take the boat" or "Use Hearthstone".
- **Travel times:** walking or mount speed is assumed from your level: on foot below 40, mount at 40, epic mount at 60.

### Completion tab
- Lists every quest you can still do, at any level, and keeps working past level 60.
- Three sub-tabs under the main tabs choose the mode: **Proximity**, **Zone** and **Log**.
- **Proximity** mode covers the current zone and neighbouring zones (same continent, within about 300 yards of it), sorted by real travel time. Quests without a known zone are left out; with no zone known for your position, the list stays empty.
- **Zone** mode shows one zone, picked from a zone list (the picker only appears in this mode).
- **Log** mode only targets quests already in your quest log: objectives and turn-ins, sorted by travel time. No new quests; the Grey and Elite filters and the zone are ignored.
- Shows the nearest target, the next one, and the remaining quests with their estimated travel time.
- Progress counters for the zone and in total.
- **Grey** and **Elite** filters. Quests you can't take yet are never shown.

### Access tab
- Lists every unlockable for your faction (70 entries in total, 39 for each faction) in four collapsible groups (**Dungeons**, **Raids**, **Keys**, **Misc**), each header showing done / total.
- Each entry shows its level range and progress. Click it to expand its steps: done steps are struck through and greyed, the current one is marked ».
- **Steps:** quests (names from the game client), items, "Reach level N", Kill / Talk to / Use with the NPC or object name, reputation and profession steps.
- **Progress:** quests turned in or in your log, items in your bags with their count, level and reputation earned. A step that can't be checked counts as done once a later step is.
- **Track in route:** tick it to insert the entry's quests into your route at the cheapest spot, without duplicates.
- The list scrolls with the mouse wheel. Entry names follow MinMaxQuest's language (English, French); quest, NPC, object and item names follow the game client.
- Data comes from the [Attune](https://warcraftratings.com) addon, cross-checked and completed with QuestieDB (see Credits).

### Quest tab
- Precomputed routes from level 1 to 60, by faction and starting zone. The arrow follows your current route step.
- **Current step:** what to do now, with the objective progress (for example 6/10) and a **Skip** button.
- **Next:** the following step with its distance, plus the two steps after it.
- **Footer:** your level, the step number out of the route total, and the estimated time left.
- **Variants:** include elite quests, include dungeons, and a max quest level (only quests at least X levels below yours, off by default).
- **Done steps are skipped:** quests you already did or turned in never show up.
- **Closer steps first:** when the current step is more than 2 minutes away and one of the next 15 steps is at least 1 minute closer, or when the current step can't be done yet (level too low, quest log full), the arrow points to that closer step. The current step stays the same and the route picks up again once it is done.
- **Off-route banner:** if your level is far from what the route expects, a banner says so and a **Re-sync** button puts you back on the right step.
- **Steps your character can't do** (wrong race or class, exclusive quest already taken, missing prerequisite) are removed, with a single chat line saying how many.
- **Skipped travel and grind steps** stay skipped: `/mmq unskip` only brings back quests.
- **Access entries:** tracked Access tab entries have their quests inserted into the route.
- **Dungeons:** a named list with one checkbox per dungeon that has a return trip. Tick one to add its return trip to the route. All are unticked by default.
- **Active mode:** the arrow follows whichever of the Quest or Completion tabs you opened last.
- **Options** (variants, auto-fly, Blizzard map waypoint, lock arrow) and **Dungeons** are sections you open with a click, closed by default. The window grows while one is open.
- **Route finished** shows at level 60, with a button to open the Completion tab.
- If the route files are missing or can't be read, a message says so and offers a button to open the Completion tab.

### Quest log pin
- A small pin button next to each quest in the Blizzard quest log.
- Click it and MinMaxQuest guides you to that quest, even if the filters would hide it. A **Pinned** tag shows in the window.
- Click it again, or the × in the window, to go back to automatic targeting.
- A pinned quest is unpinned automatically once it is turned in.

### Skip
- **Skip** any step from the window or with `/mmq skip`.
- If the quest opens a chain, a dialog lists the follow-ups and the XP you would lose, and you confirm or cancel.
- `/mmq skipped` lists skipped quests and `/mmq unskip <id>|all` brings them back.

### Flight paths
- The flight paths you know are recorded when you talk to a flight master and used for routing.
- **Auto-fly:** open the flight map and you take off to the right destination.
  - Hold **Shift** to stay on the ground.
  - Turn it off in the Quest tab options.
  - If the destination isn't reachable from there, you get a message and nothing happens.

### Map
- World map pins for the current and next step only.
- A minimap pin for the current step, with a tooltip.
- Optional native Blizzard waypoint. A waypoint you placed yourself is never cleared or replaced.

### Data and safety
- Quest, NPC, object and item data come from **QuestieDB**, which is required.
- **Travel data:** flight paths, boats and flight times are versioned and dated. A banner warns you, without blocking anything, when the data was built for another game build or has expired.
- **Errors:**
  - every feature is isolated: an error disables only that feature, with a single chat message;
  - QuestieDB read errors are reported.
- **No taint:** nothing is created during combat, and Blizzard functions are only hooked securely.

## Commands

| Command | Action |
|---|---|
| `/mmq` | Show / hide the window, the arrow and the quest item button together |
| `/mmq help` | List all commands |
| `/mmq targets` | Print the current targets |
| `/mmq q <id>` | Show a quest's info |
| `/mmq chain <id>` | Show a quest chain |
| `/mmq pin <id>` / `/mmq unpin` | Force a quest / back to automatic (`/mmq pin` alone also unpins) |
| `/mmq skip [confirm]` | Skip the current step |
| `/mmq skipped` / `/mmq unskip <id>\|all` | List / re-activate skipped quests |
| `/mmq arrow move` / `lock` / `test` | Unlock, lock or test the arrow |
| `/mmq debug build <n>` | Simulate a build mismatch (shows the banner) |
| `/mmq debug prof` | Show refresh timings |

## Requirements

- WoW: Forever (Interface 16001)
- [QuestieDB](https://github.com/Questie/QuestieDB)

## Roadmap

- Daily data refresh and automatic releases.
- Class quests are not planned for now.

## Development

- **Source:** TypeScript compiled to a single Lua 5.1 file with TypeScriptToLua.
- **Build and test:** `npm ci` then `npm test`. This compiles `build/MinMaxQuest.lua` and runs the unit tests plus the compiled addon in a Lua VM.
- **Release:** push a tag `vX.Y.Z` for a release, or `vX.Y.Z-beta.N` / `vX.Y.Z-alpha.N` for a test version. CI packages the addon and uploads it to CurseForge, Wago and GitHub Releases.

## Credits and license

MinMaxQuest is free software under the **GPL-3.0** license.

- Travel graph from [Shortest Path Forever](https://github.com/cjber/shortest-path-forever) (GPL-3.0), including flight timings from InFlight (MIT)
- [HereBeDragons](https://github.com/Nevcairiel/HereBeDragons) (BSD) for map pins
- Quest data from [QuestieDB](https://github.com/Questie/QuestieDB)
- Access entries imported from [Attune](https://warcraftratings.com) by CixiDelmont (version 16001-46). Attune declares no license; its data is reused with credit

Source code and issues: https://github.com/R4z4kk/MinMaxQuest

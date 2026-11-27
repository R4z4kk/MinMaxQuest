# MinMaxQuest

**One clean, fast quest guide for WoW: Forever.** An arrow that takes you exactly where you need to go, a to-do list sorted by real travel time, and dungeon / raid access tracking, in a single window.

> **Alpha.** The Completion and Access tabs work today. Precomputed level 1-60 routes for the Quest tab come in the next releases.

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
- Black background with a muted gold accent and simple fonts.
- Available in English and French (frFR).

### Guide arrow
- **What it points to:** quest givers, quest items, objects and mob areas, with the distance and the step label.
- **Kill objectives:** it loops through the mob spawn points of the area and moves on to the next point when you reach one. It doesn't send you to a single spot.
- **Many spawn locations:** it targets the closest group and shows "+N other spots" for the rest.
- **Objectives:** it follows them in quest log order, honouring QuestieDB ordering hints.
- **Moving it:** `/mmq arrow move`, then `/mmq arrow lock`. The position is saved.
- **When it hides:** in instances, during flights, and when there is no target.
- **Performance:** at most 30 updates per second. Route refreshes are batched: at most one every 2 seconds, skipped while standing still or flying, and immediate when an objective changes.

### Targeting
- **Automatic by default:** the nearest useful step is chosen for you. That can be picking up a quest, an objective or a turn-in.
- **Only quests you can take:** level, race, class, faction, prerequisites and exclusive quests are all taken into account.
- **Travel:** the route goes through flight masters, boats and your hearthstone when that is faster. The arrow then says "Go to the flight master", "Take the boat" or "Use Hearthstone".
- **Travel times:** walking or mount speed is assumed from your level: on foot below 40, mount at 40, epic mount at 60.

### Completion tab
- Lists every quest you can still do, at any level, and keeps working past level 60.
- **Proximity** mode sorts quests by real travel time.
- **Zone** mode shows one zone, picked from a zone list.
- Shows the nearest target, the next one, and the remaining quests with their estimated travel time.
- Progress counters for the zone and in total.
- **Grey** and **Elite** filters. Quests you can't take yet are never shown.

### Access tab
- Tracks dungeon, raid and key chains step by step, with your progress.
- **Track in route:** check a chain to bring its steps into your route.
- Starts with the Dalaran Sewers key chain. More chains will follow.

### Quest tab
- Options for the upcoming routes:
  - include elite quests;
  - include dungeons;
  - max quest level: only quests at least X levels below yours, off by default.
- Options that already apply:
  - auto-fly;
  - Blizzard map waypoint.
- Until routes are installed, a shortcut sends you to the Completion tab.

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
| `/mmq` | Open / close the window |
| `/mmq help` | List all commands |
| `/mmq targets` | Print the current targets |
| `/mmq q <id>` | Show a quest's info |
| `/mmq chain <id>` | Show a quest chain |
| `/mmq pin <id>` / `/mmq unpin` | Force a quest / back to automatic (`/mmq pin` alone also unpins) |
| `/mmq skip [confirm]` | Skip the current step |
| `/mmq skipped` / `/mmq unskip <id>\|all` | List / re-activate skipped quests |
| `/mmq arrow move` / `lock` / `test` | Move, lock or test the arrow |
| `/mmq debug build <n>` | Simulate a build mismatch (shows the banner) |
| `/mmq debug prof` | Show refresh timings |

## Requirements

- WoW: Forever (Interface 16001)
- [QuestieDB](https://github.com/Questie/QuestieDB)

## Roadmap

- **Quest tab:** optimized level 1-60 routes, precomputed offline.
  - Each starting zone gets its own start segment, then a common route per faction.
  - Elite quests and dungeons are optional.
- Tracked access chains will be inserted into the route.
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

Source code and issues: https://github.com/R4z4kk/MinMaxQuest

# Prior art: WoW Classic leveling route design and optimization (researched 2026-11-27)

## 1. How do RestedXP, Zygor, Joana, Questie-based helpers, Guidelime and speedrunners design routes? Hand-crafted, data-driven or algorithmic? Which principles?

### Takeaway
The big commercial guides (RestedXP, Zygor, Joana) are hand-written by experienced players and speedrunners. Their "intelligence" is runtime conditions that skip steps; they do not search for an order. The only public tool found that optimizes routes offline is Questwarden (GPL-3.0, alpha, Nov 2026). It uses greedy local reorder passes over a hand-built route, checked against an XP model. No published route comes from a global solver.

### Cited Findings
- RestedXP says its level 60 routes are "hand-crafted" and maintained by top Classic speedrunners. The addon is free and open source, and users can write their own guides. — [CurseForge RestedXP Guide](https://www.curseforge.com/wow/addons/restedxp-guide); [restedxp.com/method](https://www.restedxp.com/method)
- RestedXP speedrun routes skip low-reward quests, including some dungeon quests. They are pitched at speedrunners more than at completionists. — [alucare.fr Zygor vs RestedXP (2026)](https://www.alucare.fr/en/zygor-vs-restedxp/)
- Local RXPGuides install (v4.11.35-10-g1518bcc, changelog dated 2026-11-11): directive counts across all Guides/*.lua and Guides/forever/*.lua show how a hand-written guide is built. The counts are: `.goto` 106,846; `.target` 35,884; `.turnin` 19,678; `.accept` 19,323; `.mob` 17,768; `.complete` 17,706; `#completewith` 16,438; `#label` 7,579; `.isOnQuest` 7,295; `.collect` 7,089; `.train` 6,713; `#optional` 6,625; `.xp` 5,550; `.dungeon` 4,944; `#xprate` 4,802; `.zoneskip` 4,351; `.isQuestTurnedIn` 4,064; `#loop` 2,973; `.fly` 2,374; `.hs` 960; `.deathskip` 422; `.home` 495; `.fp` 587. — local file `D:\Jeux\Battle.net\World of Warcraft\_forever_\Interface\AddOns\RXPGuides\Guides\` (counted with grep, read only)
- RXP has hearthstone "batching" code (`HSBatching.lua`). It re-binds the hearthstone at the end of the HS cast so the player teleports back to the old location while the new inn is saved. It relies on server batch timing ("<10ms as of patch 1.14"), with a configurable 6 ms window. — local file `RXPGuides\HSBatching.lua`
- Questwarden route rules: a planned zone order per race and class. Quests or chains are added where the route would leave the player short of the next zone's level. Grind steps target the densest mob group near the player's level and current position. Quests whose targets are far above the player's level come after easier ones. Same-area quests are batched before travelling back. The guide suggests a hearthstone location and says when hearthing is faster than walking. Speed and Hardcore variants exist; Hardcore avoids risky pulls. — [CurseForge Questwarden](https://www.curseforge.com/wow/addons/questwarden)
- Questwarden data: bundled QuestieDB (GPL-3.0), "What's Training?" trainer data (MIT), and the game client's own tables. Source is at github.com/GREYsaurus/Questwarden. It targets Classic Era 1.15.9 and TBC Anniversary 2.5.6. Last update Nov 3, 2026; alpha, 62 downloads. — [CurseForge Questwarden](https://www.curseforge.com/wow/addons/questwarden); [GitHub Questwarden](https://github.com/GREYsaurus/Questwarden)
- Other Nov 2026 addons in the same space, from CurseForge search snippets only (not verified in depth):
  - AutoQuestLearner (GitHub DrB85) suggests an order for active quests, clustering nearby ones.
  - Trailwright (GPL-3.0) plans from the current position, using travel routing from "Shortest Path Forever" by cjber.
  - Questworthy ranks quests by minutes, XP and risk, and needs QuestieDB. Its page returned 404 when fetched.
  - Also listed: "Forever Quest Routes", "Levelwise", "QuestXPAdvisor", "Alenya's Guides", "Azeroth Pilot Reloaded".
  — [GitHub AutoQuestLearner](https://github.com/DrB85/AutoQuestLearner); [CurseForge Trailwright](https://www.curseforge.com/wow/addons/trailwright); [CurseForge Questworthy](https://www.curseforge.com/wow/addons/questworthy); [CurseForge Forever Quest Routes](https://www.curseforge.com/wow/addons/forever-quest-routes)
- Joana reached 60 in 4 days 20 hours /played in vanilla. He drew on years of private-server experience, and his guide documents the methods from that run, with videos and map coordinates. The guide is paid. A source says the creator died on 2024-04-29 (per the CurseForge page). — [CurseForge Joana's Guides](https://www.curseforge.com/wow/addons/joanasguides); [TenTonHammer review](https://www.tentonhammer.com/articles/joana-s-world-of-warcraft-leveling-guide-review)
- Speedrunner methods, record runs (2020):
  - TommySalami, solo: solo dungeon runs, AoE farming at hidden spots, and the hidden troll village in Darkshore near the end.
  - Zeegers, aided: mob tagging by group members, lots of Zul'Gurub, and the last two levels from ZG coin and bijou turn-ins.
  - Jokerd (mage, about 4 days): AoE farming plus layer switching to skip respawn waits.
  — [Mein-MMO, 2020-06-08](https://mein-mmo.de/en/player-levels-incredibly-fast-in-wow-classic-this-is-how-he-did-it,512624/)
- Guidelime is a step-list guide addon. Progress auto-advances where possible (quest accepted or completed, item looted, mob killed). Some steps, such as resupply and training, need manual confirmation. It ships with an in-game editor for writing and importing guides. — [GitHub Guidelime](https://github.com/max-ri/Guidelime)

### Inferences
- Principles shared across RXP, Questwarden and speedrunners:
  1. Batch the accept, complete and turn-in steps of one area.
  2. Do quest objectives on the way (`#completewith`, sticky steps).
  3. Use the hearthstone and set hearth strategically, plus hearth batching.
  4. Death-skip back to a graveyard when it is faster than walking.
  5. Use level gates with grind fill (`.xp`) when quests run short.
  6. Skip low-XP or far-away quests and defer quests far above the player's level.
  7. Pick up flight paths along the way.
  8. Make dungeon versus no-dungeon a route variant.
  9. Branch by class, race and XP rate (`<<`, `#xprate`, `#season`, `#hardcore`).
  These are the obvious objective and constraint terms for our optimizer.
- The fastest record runs (sub-50 h) are mostly AoE and dungeon grinding, not questing. A quest-only route will be far slower than records, so compare against questing guides, not speedrun records.

### Gaps
- Joana's specific batching and grinding rules are behind a paywall. No free, detailed breakdown was found.
- Zygor's route-authoring process is not documented publicly; only user complaints and FAQ statements are available.
- RXP's internal authoring process (any tooling, playtest loops) is not documented beyond "hand-crafted by speedrunners".

## 2. Reported times-to-60 (benchmarks)

### Takeaway
Classic records:
- Solo, unaided: about 48 h /played (TommySalami, 2020).
- Aided: about 36 h (Zeegers, 2020).
- Hardcore: about 69.9 h (Vitochie, 2023).
- Vanilla legend: Joana, 4 d 20 h.

Typical players with good routes take about 100-150 h. On WoW Forever (launched 2026-11-04), no measured 1-60 time was found as of the latest source checked. Pre-launch estimates range from 50 to 200 h.

### Cited Findings
- TommySalami, solo: 48 h 17 min. Zeegers, aided: 36 h. — [Mein-MMO, 2020-06-08](https://mein-mmo.de/en/player-levels-incredibly-fast-in-wow-classic-this-is-how-he-did-it,512624/); [Wowhead news on Zeegers](https://it.classic.wowhead.com/news/zeegers-sets-new-speedrun-world-record-for-leveling-1-60-in-wow-classic-real-316363); [Icy Veins forum: aided 36 h](https://www.icy-veins.com/forums/topic/50032-wow-classic-aided-1-60-speedrun-in-36-hours-1-sitting/); [Icy Veins forum: solo 48 h](https://www.icy-veins.com/forums/topic/49976-wow-classic-1-60-solo-speedrun-leveling-record-48-hours/)
- Hardcore: Vitochie, 69 h 53 min 34 s (search-result summary; the leaderboard page itself lists names without times). — [Warcraft Tavern HC leaderboards, 2023-08-26](https://www.warcrafttavern.com/wow-classic/news/wow-classic-hardcore-1-60-speedrunning-leaderboards/)
- speedrun.com 1-60 rules require /played to be shown at the start and end of each session. — [speedrun.com post](https://www.speedrun.com/posts/8pjdv)
- Joana: 4 days 20 hours (vanilla). — [TenTonHammer](https://www.tentonhammer.com/articles/joana-s-world-of-warcraft-leveling-guide-review)
- WoW Forever estimates (Kami Labs, 2026-10-09, updated 2026-11-02 and 2026-11-04). The article states "Nobody has timed a full 1-60", and the beta was capped at level 30.
  - LFCarry: about 150 h (20 h for 1-20, 50 h for 20-40, 80 h for 40-60).
  - wowforever.games: 100-120 h for a first character, 60-80 h experienced, 50-65 h for a dungeon speedrun. Kami Labs judges this optimistic because dungeon XP was cut.
  - ExpCarry: 80-130 h for an experienced solo player.
  - Good Classic players: 100-150 h, with mages and hunters about 8% faster and warriors about 12% slower than average.
  — [Kami Labs: how long to 60 on Forever](https://kami-labs.fr/en/wow-forever/combien-de-temps-monter-niveau-60-wow-forever/)
- Forever XP facts that affect a route model (single aggregator, which cites secondary sources):
  - The 1-60 XP curve is the same as Classic.
  - Food gives +5% XP on mobs only.
  - The sleeping bag (level 14+) gives up to 3% rest bonus.
  - The leatherworker tent fills rest up to 5% of a level.
  - The Applejack Still turn-in exploit was removed.
  - Dungeon quest XP was halved in beta.
  - Respawns are faster in many areas (Nov 2 dev notes).
  - Solo fights take about 10-15 s per mob.
  — [Kami Labs](https://kami-labs.fr/en/wow-forever/combien-de-temps-monter-niveau-60-wow-forever/)
- An Icy Veins article titled "Three mages, a paladin and a shaman hit level 60 first in WoW Forever" exists, but fetching it returned 403, so no times could be extracted. — [Icy Veins](https://www.icy-veins.com/wow-forever/news/three-mages-a-paladin-and-a-shaman-hit-level-60-first-in-wow-forever/)

### Inferences
- A realistic benchmark for an optimized solo quest route on Forever is likely 80-120 h /played. This is an estimate, not a measured value. Record runs (36-70 h) use AoE, dungeons or group help and are not comparable to a quest route.
- Forever XP numbers (food, tent, dungeon XP) can be rebalanced. Per the project rules they must be dated, sourced from Blizzard patch notes, and fail loudly when stale.

### Gaps
- No verified WoW Forever first-60 /played time (Icy Veins blocked).
- No current (2026) speedrun.com leaderboard data retrieved.
- RXP publishes no claimed time-to-60 on its pages that I could find.

## 3. Open-source projects that auto-generate or optimize routes; analogous tools in other games and their algorithms

### Takeaway
Questwarden is the only concrete open-source WoW route optimizer found. It runs iterative greedy local-search passes ("keep the move only if the modeled walk shrinks"), not a global solver. In academic terms the problem is a TSP with precedence constraints (Sequential Ordering Problem) with state-dependent costs. Standard methods are precedence-aware insertion heuristics, local search, and MIP or CP-SAT solvers such as Google OR-Tools. OSRS "optimal quest order" tools are mostly static lists or opaque planners.

### Cited Findings
- Questwarden `docs/ROUTE_OPTIMIZATION.md`:
  - **Audit.** `tools/build.ps1 routes` checks impossible quest order, quest-log overflow (Classic Era cap 20), pickups never turned in, level gates and travel.
  - **XP model.**
    - Progress is measured in "levels of grinding".
    - Level gates insert grind steps when the model is short.
    - A reduced-XP rule is applied, so grinding early devalues later quests.
    - Rested, discovery and group XP are ignored.
  - **Travel model.**
    - Distance is measured in map percent; mobs within 8 map % count as no walk.
    - Timed quests use straight-line yards × 1.25 at 7 yd/s plus 10 s per step.
    - Hearthstones, flights, boats and dungeons count as route breaks.
  - **Tools.**
    - `cluster_objectives.py` moves nearby objectives before a distant turn-in, keeping a move only if the walk shrinks.
    - `npc_order.py` reorders runs of pickups and turn-ins. It keeps a new order only if it saves at least 2 map % and repeats until nothing changes.
    - `timed_order.py` checks each timed quest's walk against half its time limit.
    - `kill_packs.py` groups kill steps whose mobs are within 8 map %, rejecting a move that adds more than 1 map % of walk.
    - `grind_spots.py` adds a grind step when the model is at least 0.75 levels short. It targets the densest spawn cluster (points within 6 map %) near the last 25 steps.
    - `quest_insert.py` / `chain_insert.py` add quests to the route.
  - **Constraints.** No pickup before its prerequisite's turn-in. No pickup above the modeled level. No move across a step that changes zone. Elite and escort quests are excluded from several moves.
  - **Results (2026-11-01).** Classic Era went from 50.31 to 49.98 "levels of grinding" and TBC from 53.47 to 40.10. There were 88 reorders in Classic Era and 103 in TBC.
  - **Known limits.** Several passes are needed. Only one timed quest is fixed per run. Escorts and cross-zone turn-ins need hand edits. The Classic Era route "has no usable quests left to fill zones".
  — [Questwarden ROUTE_OPTIMIZATION.md](https://raw.githubusercontent.com/GREYsaurus/Questwarden/main/docs/ROUTE_OPTIMIZATION.md)
- Questwarden also documents `docs/DATA_PIPELINE.md`, `docs/DATA_POLICY.md`, `docs/GUIDE_FORMAT.md` and `docs/DATA_GAPS.md`. — [GitHub Questwarden](https://github.com/GREYsaurus/Questwarden)
- A forum thread describes a genetic-algorithm prototype for a short Classic quest path for Season of Mastery. The page returned 403, so details could not be verified. — [Escapist forums thread](https://forums.escapistmagazine.com/threads/wow-season-of-mastery-genetic-algorithm.287615/)
- Trailwright's travel routing comes from "Shortest Path Forever" by cjber (GitHub). This is a possible reuse source for a travel-time graph covering flights, boats and zeppelins. — [CurseForge Trailwright](https://www.curseforge.com/wow/addons/trailwright)
- TSP with precedence constraints (Sequential Ordering Problem): a route is feasible only if each parent is visited before its children.
  - Heuristics: nearest neighbor, and precedence-aware convex-hull cheapest insertion (insert only into feasible segments), used to warm-start exact solvers.
  - Exact methods: MIP branch-and-cut (Gurobi) and CP-SAT (OR-Tools).
  - Deep RL has also been applied to TSP-PC.
  - A 2020 paper found no prior work combining precedence constraints with tour-dependent edge costs, which is exactly the leveling case: costs depend on the player's level and the travel options unlocked.
  — [arXiv 2405.03774](https://arxiv.org/html/2405.03774v3); [arXiv 2207.01443 TSP-PC via DRL](https://arxiv.org/pdf/2207.01443); [DFKI CTW 2020 preprint](https://www.dfki.de/fileadmin/user_upload/import/11331_CTW-PreprintVersion-July2020.pdf); [Google OR-Tools TSP](https://developers.google.com/optimization/routing/tsp)
- OSRS:
  - The wiki's quest order page says its entries are not a recommended order.
  - Planners (calcosrs, osrstoolkit) claim an optimal order without documenting the algorithm.
  - Ironquest (Overwolf) says it orders actions (quests, XP lamps, skill training) "in an optimal way", method unverified.
  - Static guides use the rule "no-requirement quests first, then use their XP rewards for the next tier".
  — [OSRS Wiki Quest order](https://oldschool.runescape.wiki/w/Quest_order); [calcosrs Quest Planner](https://calcosrs.com/tools/quest-planner/); [osrstoolkit optimal order](https://osrstoolkit.com/quests/optimal-order/); [Overwolf: what is Ironquest](https://support.overwolf.com/de/support/solutions/articles/9000183152-what-is-ironquest-); [tonsofxp OSRS quest order](https://www.tonsofxp.com/blog/osrs-quest-order-guide)

### Inferences
- A practical design: start from a heuristic route (zone order plus cluster batching), then improve it with local search (2-opt / or-opt / relocate moves), checking feasibility (prerequisites, level gates, 20-quest log cap, timed quests) and evaluating cost with a simulation of XP and time. Questwarden confirms that local moves work, and also that greedy passes plateau: Classic Era gained only 0.33 grind-levels. A global objective (simulated total time to 60, including grind time from the XP shortfall) evaluated by simulated annealing or a genetic algorithm over the whole sequence is the natural next step. Splitting the problem by zone or segment with fixed boundary states keeps it tractable.
- Questwarden's numeric constants (8 / 6 / 4 map %, 7 yd/s, ×1.25 path factor, 10 s per step, 0.75-level grind threshold) are useful starting calibrations but are unvalidated heuristics. Per the project rules, cite and date them, and replace them with measured values (movement speed, mount speed, flight times from client data).
- QuestieDB (GPL-3.0) is the de-facto open quest, NPC and object coordinate data source. Reusing it imposes GPL-3.0 on the addon. RXP's local `DB/forever/` folder (quest.lua, flightData.lua, dangerousMobs.lua, rares.lua, StatWeights.lua) shows Forever-specific data exists. Check its license (the RXP folder has a LICENSE file) before reusing anything.

### Gaps
- Questwarden's script language is presumably Python, judging by the `.py` names; the internals were not read. Neither was its `GUIDE_FORMAT.md`.
- Genetic-algorithm SoM thread unreachable (403).
- The algorithms of AutoQuestLearner, Questworthy, Levelwise and Forever Quest Routes were not verified.
- No academic paper specifically on MMO leveling route optimization was found.
- Pokémon and other speedrun routing tools were not researched (out of tool budget).

## 4. Known complaints about guides and how dynamic guides handle deviation

### Takeaway
The main complaints are rigidity (outleveling quests or skipping ahead breaks the flow), wasted time on low-XP quests (Zygor), wrong or outdated steps, and UI clutter (RXP). Dynamic handling today is condition-based skipping, not re-planning. RXP auto-skips steps whose conditions fail (quest already done, level reached, zone mismatch), and Guidelime auto-advances on quest and loot events. Neither re-optimizes the remaining route.

### Cited Findings
- Zygor Classic complaints:
  - Slow around levels 30-40 because it does every quest in an area, including low-XP ones that speed guides skip.
  - Players outlevel the assigned quests, and skipping ahead breaks the flow.
  - The guide sends players to grind already-outleveled mobs, then to a distant zone for low-level quests.
  - A hand-in step was removed because the player was ahead in levels, although the item had already been bought.
  — Zygor forum threads [21618](https://zygorguides.com/forum/forum/general/general-guide-discussion/21618-classic-guide-is-horribly-sluggish), [20726](https://zygorguides.com/forum/forum/world-of-warcraft-classic-version/classic-leveling-guides/20726-classic-zygor-is-a-little-disappointing), [20885](https://zygorguides.com/forum/forum/world-of-warcraft-classic-version/classic-leveling-guides/20885-anyone-here-have-anything-positive-to-say) and [185091](https://zygorguides.com/forum/forum/world-of-warcraft-classic-version/classic-leveling-guides/185091-various-errors-in-the-horde-leveling-guide)
- Zygor's Classic FAQ says Classic does not allow retail-style freedom to skip quests and zones. Skipping is possible but not what the guide is designed for. — [Zygor Classic Questions and Issues Tracker](https://zygorguides.com/blog/zygor-classic-guide-questions-and-issues-tracker/)
- One user found RXP marketing-heavy with a cluttered UI. Another said RXP "recalculates" when the player skips or outlevels a step (anecdotal). — [Blizzard forums: so many leveling guides](https://us.forums.blizzard.com/en/wow/t/so-many-leveling-guides-which-to-choose/2010734?page=2)
- RXP's adaptive mechanics in the local files:
  - **Conditional skips.** `.isOnQuest`, `.isQuestTurnedIn`, `.isQuestComplete`, `.isQuestAvailable`, `.zoneskip`, `.subzoneskip`, `.maxlevel`, `.itemcount` and `.cooldown item,6948,>0` (skip the HS step if the hearthstone is on cooldown).
  - **XP rate variants.** `#xprate >1.499` selects steps by XP-rate setting, parsed in `RXPGuides.lua` around line 2628.
  - **Fractional level targets.** `.xp 4-610` ("grind until 610 xp from level 4") and `.xp 3+1110`.
  - **Background objectives.** `#completewith next`, `#sticky`, `#optional` and `#loop` mark objectives done in the background or optional.
  - **Mode and season filters.** `#hardcore`, `#softcore`, `#season`, `#era`, `#som`, `#forever`, `#disabledungeons`.
  - **Chaining.** `#next` chains guides, and `#displayname ... << Class` changes the label by class.
  — local `RXPGuides\Guides\forever\Horde-12-22_Barrens.lua`, `RXPGuides\RXPGuides.lua`
- RXP Forever coverage (Kami Labs, 2026-10-09; sponsored by RestedXP):
  - 1-35 is done for both factions, adding 125 new quests, the Skyborne starter zone and six new race/class pairs.
  - Forever 35-60 routes are planned post-launch with no date; Era routes are used after 35 meanwhile.
  - The Dungeon Leveling Guide is in progress.
  - Blizzard cut dungeon XP in beta, which affects dungeon routes.
  — [Kami Labs RXP update](https://kami-labs.fr/en/wow-forever/mise-a-jour-restedxp-wow-forever/)
- Local install check: `GuideList-forever.xml` loads Forever guides up to roughly 22 (Skyborne, 1-14 starters, 11-20 Alliance, 12-22 Barrens, mage variants, dungeon variants, Survival guides up to about 23). The latest changelog entry (2026-11-11) mentions "Minor fixes/improvements 1-22 Forever" and "Set forever to pre-naxx patch". — local `RXPGuides\Guides\GuideList-forever.xml`, `RXPGuides\CHANGELOG.md`

### Inferences
- There is a clear gap: no tool combines a precomputed optimal route with a cheap re-plan when the player deviates (skips a quest, dies, outlevels, has rested XP or a different XP rate). Precompute route variants offline, and at runtime re-select or skip using conditions like RXP's. A lightweight local repair (drop now-grey quests, re-insert grind with `.xp`-style targets) is a feasible differentiator.
- On Forever, 35-60 is not covered by Forever-specific RXP routes (Era routes are used instead), and the local install has Forever routes only to about 22. An optimized 1-60 Forever route has a real coverage gap to fill.
- Data drift is a known failure mode (wrong steps, removed or new Forever quests). The route data needs a versioned source (QuestieDB or client data dated to client 1.60.1) and CI audits like Questwarden's.

### Gaps
- RXP's runtime "recalculation" claim is anecdotal. No official doc describes re-planning, and the local code shows only conditional skipping (full code not audited).
- No RXP-specific complaint threads on Reddit were retrieved (Reddit not fetched).

## 5. Guide file formats (RXP, Guidelime) as inspiration for our step format

### Takeaway
Both formats are line-based DSLs. A guide is a list of steps; each step holds actions keyed by quest, NPC or item ID, plus conditional filters for class, race, faction and mode. RXP is richer: skip predicates, XP-rate gating, labels and `#requires`, and background completion. Guidelime is inline bracket codes inside prose. A machine-generated route should use a structured typed format (data, not prose) and render to such text.

### Cited Findings
- RXP guide structure (local files):
  - **Container.** `RXPGuides.RegisterGuide([[ ... ]])` wraps the guide text.
  - **Header.** `#forever`, `<< Horde`, `#name 12-17 The Barrens`, `#version 11`, `#group`, `#subgroup Speedrun Guide 1-22`, `#next 17-22 Stonetalon/Barrens/Ashenvale`.
  - **Steps.** Each begins with `step << <class/race filter>`, followed by actions:
    - `.goto <mapId/floor or zone name>,x,y[,radius]`
    - `.accept <questId>`, `.turnin <questId>`, `.complete <questId>,<objectiveIndex>`
    - `.target`, `.mob`, `.collect`, `.train`, `.fly`, `.fp`, `.home`, `.hs`, `.deathskip`, `.vendor`, `.xp <level>[+/-xp]`
  - **Step modifiers.** `#completewith <label|next>`, `#label`, `#requires`, `#sticky`, `#optional`, `#xprate`.
  - **Text.** Text after `>>` is the display line. Forever guides use `.goto 1411/1,-4648.55,271.43` (UiMapID/floor with world coordinates) instead of zone percentages.
  — local `RXPGuides\Guides\forever\Horde-12-22_Barrens.lua` and `RXPGuides\Guides\RestedXP Horde 13-23 Barrens.lua`
- Guidelime syntax: bracket codes inline in step text.
  - **Quests.** `[QA123]` accept, `[QC123]` complete, `[QT123]` turn in.
  - **Travel.** `[G12,34 Stormwind City]` go to, `[H Thelsamar]` hearth to, `[S Goldshire]` set hearth, `[F Thelsamar]` fly to, `[P Thelsamar]` get flight path.
  - **Level and services.** `[XP18]` reach level, `[T]` train, `[V]` vendor, `[R]` repair.
  - **Filters.** `[A Rogue]` step filter, `[GA Mage]` guide filter.
  - **Items and NPCs.** `[CI11515,6 ...]` collect item, `[REP ...]`, `[UI ...]`, `[TAR ...]`, `[SP ...]`, `[SK ...]`, `[LE ...]`.
  — [Guidelime WriteAGuide cheat sheet](https://github.com/max-ri/Guidelime/wiki/WriteAGuide-CheatSheet)
- Guidelime auto-completes steps from events and ships an editor. — [GitHub Guidelime](https://github.com/max-ri/Guidelime)
- Questwarden step types: pick up, kill, turn in, fly, train, object-click quests, item-started quests (start item and droppers recorded), dungeon steps, and grind steps with level targets such as "until level 16 (20% through)". Steps are gated by class and race, and complete from quest-log state, quest flags, level, HS or FP data, or manually. — [GitHub Questwarden](https://github.com/GREYsaurus/Questwarden)

### Inferences
- Recommended step model for MinMaxQuest, synthesized from all three:
  - Fields: `{ type: accept|complete|turnin|grind|fly|hearth|setHearth|getFP|train|vendor|deathskip, questId?, objectiveIndex?, npcId?, mapId, x, y, radius?, filters: {race, class, faction, mode}, skipIf: [predicates], completeWith?, targetXp: {level, xpIntoLevel}, estCostSeconds, estXpGain }`.
  - The two optimizer-specific fields are `estCostSeconds` and `estXpGain`, so the addon can show how far the player is from the plan and can re-plan locally.
  - Using quest IDs rather than names avoids localization issues, which RXP and Guidelime both do.
  - Use UiMapID plus world coordinates, as RXP Forever does.
- Exporting to RXP's text format is cheap. It would let RXP users load our route through RXP's custom-guide import (RXP has `Guides/Import.lua`). Interop beats inventing a third DSL for display.

### Gaps
- Not read: the full Guidelime WriteAGuide page (optional steps, skip behavior) and Questwarden's GUIDE_FORMAT.md.
- RXP's official guide-writing docs were not fetched; the format was inferred from local guide files.

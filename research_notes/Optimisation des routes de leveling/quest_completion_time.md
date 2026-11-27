# Quest completion time — data sources (researched 2026-11-27)

Scope: per-quest / per-objective time cost (accept → objectives → turn-in) for Classic Era and WoW Forever (1.60.1, Interface 16001). Map sizes, flight paths, mob TTK and respawns are covered elsewhere.

Tags: **[V]** verified (file read or page fetched), **[I]** inference.

## Verdict

**No usable per-quest duration dataset exists, public or private-but-accessible.** The closest thing is the raw QuestieTrace corpus, which holds everything needed but is only available to the Questie team. **In-game measurement is required.** Questie's own "My Journey" log on this PC already gives a usable but rough seed: 1,216 accept→turn-in pairs over two characters, levels 1–60.

## 1. QuestieTrace (local addon, v1.14.0, GPL-3.0)

- **[V]** It records full session traces with session-relative timestamps (`t` = `GetTime()`, `tp` = `GetTimePreciseSec()`) on every event and API stream. Schema: `SessionRecord{events[], functions{}, functionsDelta{}, startedAt, duration}` (`Modules/globals.lua`).
- **[V]** Quest coverage (`Modules/Trackers/QuestLog.lua`, `CompletedQuests.lua`, `QuestDialog.lua`):
  - events `QUEST_ACCEPTED`, `QUEST_TURNED_IN`, `QUEST_REMOVED`, `QUEST_LOG_UPDATE`, `QUEST_WATCH_UPDATE`, `QUEST_LOG_CRITERIA_UPDATE`
  - change-only streams of `C_QuestLog.GetQuestObjectives(questID)` (per-objective progress), `IsComplete`, `GetInfo`
  - delta stream of `GetAllCompletedQuestIDs`
  - quest dialog events (`QUEST_DETAIL`, `QUEST_PROGRESS`, `QUEST_COMPLETE`, `QUEST_FINISHED`)
- **[V]** Other trackers:
  - position: `C_Map.GetPlayerMapPosition` every 0.20 s, change-only, 4 decimals, plus zone, subzone and indoors (`Position.lua`)
  - XP and money streams (`PlayerProgress.lua`)
  - target/mouseover `UnitAffectingCombat`, level and reaction (`UnitState.lua`)
  - loot with source GUIDs (`Loot.lua`), NPC interactions, group state
- **[V]** There is **no combat-log capture** (no `COMBAT_LOG_EVENT_UNFILTERED` or `PARTY_KILL`). Kills can only be inferred from XP ticks, loot GUIDs and objective-count changes.
- **[I]** So the raw traces can measure, per quest: accept→turn-in time, time from each objective's first progress to its completion, time spent near the objective area (from positions), and time between kills (from XP ticks and objective increments).
- **[V]** Data flow (`github.com/Questie/QuestieTrace` `docs/data-flow.md`, ADR 0002): `/qlt export` → questie.dev/trace → OVH bucket `trace-intake-ovh`, which is the only raw copy (~141 GB mirror, 2026-11-09). It is reached through the team's rclone remote. **Not public.** The repo it mentions, `Questie/trace-data`, does not resolve publicly (gh: "Could not resolve").
- **[V]** The aggregator `tools/corrections-extractor` has quest observers for `name`, `questLevel`, `requiredLevel`, `objectives`, `objectiveCount`, `startedBy`, `finishedBy`, `questXp`, `turnInPoi`, `zoneOrSort`, `reputationReward` and others. **There is no duration or timing observer.** Observations carry `t` (seconds into the session) and are queryable with DuckDB (`views.sql`). A duration observer would be cheap for the Questie team to add.
- **[V]** The published output `QuestieDB/support/Forever/QuestXP/xpDB-traces.lua` (475,220 trace files, 2,512,170 sessions, generated 2026-11-24T10:38Z) holds only `{questLevel, xp}`. No time fields exist anywhere in `support/Forever/`.
- **[V]** Local SavedVariables: `QuestieTraceCharacter.sessions` is empty on both characters and `dataCollectionConsent = false`. Only the `map_hierarchy` dump exists (already noted in `missing_data_sources.md`). Nothing usable locally.
- **[I]** Path to the real data: ask the Questie team on Discord (README badge) for a duration observer or a DuckDB export of `QUEST_ACCEPTED`/`QUEST_TURNED_IN` deltas per quest. License and consent are their call: users consented to "improve Questie", so a third-party release is not guaranteed.

## 2. Local saved data (this PC, structure only)

### Questie "My Journey" — best local source
- **[V]** Location: `WTF/Account/<acct>/SavedVariables/Questie.lua`, under `char.<name>.journey[]`.
- **[V]** Entry format: `{Event="Quest", SubType="Accept"|"Complete"|"Abandon", Quest=<id>, Level=<playerLevel>, Timestamp=<time()>}` and `{Event="Level", NewLevel=<n>, Timestamp=...}`. Written by `Questie/Modules/Journey/QuestieJourney.lua` lines 238–298. Timestamps are wall-clock epoch seconds.
- **[V]** Counts: 1,377 Accept, 1,340 Complete, 97 Abandon, 69 Level events across 2 characters (max level 16 and 60).
- **[V]** Quick aggregate (script in the session scratchpad; no per-quest data copied here):

  | | Character A (1–16) | Character B (1–60) |
  |---|---|---|
  | Accept→Complete pairs | 99 | 1,117 |
  | Median accept→complete | 872 s | 3,593 s |
  | p10 accept→complete | 53 s | 35 s |
  | p90 accept→complete | 3.9 h | 23 h |
  | Pairs under 60 s (talk-to/delivery quests) | 10% | 13% |
  | Active time (gaps over 30 min dropped as offline) | 8.3 h | 101.1 h |
  | Active time per turn-in | ~303 s | ~293 s |

- **[I]** Limits:
  - Wall clock, so logouts inflate durations, and p90 is meaningless.
  - Quests run in parallel, so accept→complete is not attributable time.
  - No objective-progress timestamps, no positions.
- **[I]** Still useful for:
  - calibrating the global "seconds per quest" scale (about 5 min of active time per turn-in, grind, travel and dungeons included)
  - classifying instant quests (under 60 s)
  - ranking quests by elapsed time within one dense session

### RXPGuides (CC BY-NC-SA 4.0)
- **[V]** `RXPCTrackingData.profiles.<char>.levels[lvl]` holds, per level:
  - `timestamp.started` and `.finished` (from `/played`, via `TIME_PLAYED_MSG` in `LevelingTracker.lua`)
  - `mobs[zone] = {xp, count}`
  - `quests[zone][questId] = xp`
  - `deaths`, `groupExperience`
- **[I]** That gives per-level time and a quest vs mob XP split per zone, but **no per-quest time**. It is a good calibration target for a simulator: predicted versus actual seconds per level.
- **[V]** `players[name].timePlayed` is party-sync time. `guideProgress` and `completedWaypoints` have no times.
- **[V]** The RXP guide files carry fixed RP/event waits as `.timer <seconds>,<label>` steps. There are 62 unique ones in `Guides/forever/`, for example `.timer 124,The Attack! RP`. These are true fixed time costs for escort and RP quests, usable directly.
- **[V]** The Forever guides have 42,010 `.goto` steps, 8,076 `.accept` and 8,058 `.turnin`, all without durations.

### Zygor (ZygorGuidesViewerForever.lua, account-wide)
- **[V]** `timeperlevel` (total, totalplayed, per level in seconds), an empty `taxitimes["1.60.1"]`, and step `timestamp`s.
- **[I]** Per-level data only.

## 3. Public sources

- **[V]** No public dataset of per-quest completion time was found for Classic or Forever. Searches covered quest time datasets, RXP step timers, speedrun splits and quest-timer addons. — [Warcraft Tavern speedrunning](https://www.warcrafttavern.com/wow-classic/guides/speedrunning/) gives only qualitative respawn notes (3–5 min on most kill-quest mobs).
- **[V]** Forever route addons claim time-aware quest selection but publish no data or formula:
  - [Forever Quest Routes](https://www.curseforge.com/wow/addons/forever-quest-routes) (MIT; "skips quests that give less XP per minute than killing mobs"; learned data stays local; no repository linked)
  - [Field Guide](https://www.curseforge.com/wow/addons/field-guide) (All Rights Reserved; weighs XP against "time it takes to walk there and do it")
  - [Trailwright](https://www.curseforge.com/wow/addons/trailwright) (GPL-3.0; "slow quests drop out; quests on the same mobs share the kills"; travel via [shortest-path-forever](https://github.com/cjber/shortest-path-forever))
  - [Levelwise](https://www.curseforge.com/wow/addons/levelwise)
  - **[I]** All of these look model-based. Their code (MIT/GPL ones) could be read for their cost formulas; not done here.
- **[V]** XP/hour addons ([Experience Plus](https://www.curseforge.com/wow/addons/experience-plus), [XPLedger](https://www.curseforge.com/wow/addons/xpledger), XPTracker+, ClassicLeveling) track session or zone XP/hour and per-quest XP, not per-quest duration. Nothing is shared.
- **[V]** [Questwarden](https://github.com/GREYsaurus/Questwarden) (GPL-3.0) uses the model: straight-line yards × 1.25 ÷ 7 yd/s + 10 s per step (`docs/ROUTE_OPTIMIZATION.md`). Its `docs/DATA_GAPS.md` assumes kill XP = 0.5 × quest XP and marks it "measure in game". It is unvalidated; see `prior_art.md`.

## 4. Proxy model (when no measured value exists)

**[I]** This is synthesized from the above; the constants must be measured. A quest's cost is the sum of these terms:

- **Fixed overhead per NPC interaction:** about 5–10 s per accept or turn-in. Questwarden uses 10 s per step. Measure it with the QuestieTrace `QUEST_DETAIL` → `QUEST_ACCEPTED` and `QUEST_COMPLETE` → `QUEST_TURNED_IN` spans.
- **Travel:** from the travel model (other researcher).
- **Per-objective work:**
  - kill N of a mob: `N × (TTK + loot/reposition)`, plus respawn waiting when `N > live spawns in the area`
  - collect N drops: `(N / dropRate) × (TTK + loot)`, with drop rate from `QuestieDB support/Forever/DropTables`
  - object clicks: `N × (click cast + walk between spawns)`, using spawn density from QuestieDB object spawns
  - escort and RP: fixed duration (RXP `.timer` values, the quest timer if any)
- **Shared-kill discount:** objectives on the same mobs or area as other active quests share kill time (Trailwright and Questwarden kill packs).
- **Calibration:** scale the constants so simulated seconds per level match RXP `levels[].timestamp` per level and the ~290–300 s of active time per turn-in seen in the Journey data.

## 5. What MinMaxQuest should record (in-game measurement)

Each record is per quest, per character, using session-relative `GetTime()` plus an epoch `time()` to join sessions:

1. Times of `QUEST_ACCEPTED` and `QUEST_TURNED_IN`, plus `questID`, player level and XP gained.
2. For each objective index: the time of the first progress (`QUEST_WATCH_UPDATE` / objective count change) and the time it completes, with the counts.
3. **Active time inside the window:** sum the in-game time while the client is not AFK. Subtract time spent in other quests' objective areas, or split overlapping time evenly across the active quests. Logouts must break the window (`PLAYER_LOGOUT` / `PLAYER_ENTERING_WORLD`).
4. Kill events from `COMBAT_LOG_EVENT_UNFILTERED` `PARTY_KILL` / `UNIT_DIED`, with the NPC id, linked to the objective whose count moved within ~1 s.
5. Sparse position samples (every 1–2 s) between the objective start and end, to separate travel from work.
6. Context flags: grouped or solo, mounted, class, level minus quest level, layer or crowding if detectable.

Store raw events, aggregate offline, and mark each value with its sample size, date and client build. Measured values must expire when the client build changes, per project rules. Only accept → objective → turn-in spans from solo, ungrouped play should feed the per-objective cost table.

## Sources (local)

- `Interface/AddOns/QuestieTrace/Modules/globals.lua`, `Modules/Trackers/{QuestLog,CompletedQuests,QuestDialog,Position,UnitState,PlayerProgress,Loot}.lua`, `Modules/Export/ExportUI.lua` (questie.dev/trace), `LICENSE.md`
- `Interface/AddOns/QuestieDB/support/Forever/QuestXP/xpDB-traces.lua` (header)
- `Interface/AddOns/Questie/Modules/Journey/QuestieJourney.lua`
- `Interface/AddOns/RXPGuides/LevelingTracker.lua`, `Guides/forever/*.lua`, `LICENSE`
- `WTF/Account/<acct>/SavedVariables/{Questie,QuestieTrace,RXPGuides,ZygorGuidesViewerForever}.lua` and the per-character `RXPGuides.lua`/`QuestieTrace.lua` (structure only)
- GitHub `Questie/QuestieTrace` (README, `docs/data-flow.md`, `docs/adr/0002-*`, `tools/corrections-extractor/README.md`, observer list), fetched 2026-11-27, last push 2026-11-26

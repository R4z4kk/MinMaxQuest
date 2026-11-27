# Missing data sources: map sizes, travel, combat time

Researched 2026-11-27. Target: WoW Forever 1.60.1 (Interface 16001). Labels: **[V]** = verified (file read, data downloaded, or numbers recomputed); **[I]** = inference.

## TL;DR

| Input | Best source | Measure in game? |
|---|---|---|
| Zone sizes (yards) | wago.tools `UiMapAssignment` CSV for product `wowf` (Forever), build 1.60.1.71139 | No |
| Taxi nodes, connections, flight times | wago.tools `TaxiNodes`/`TaxiPath`/`TaxiPathNode` (wowf) + Shortest Path Forever `Data/Taxi.lua` (InFlight-measured times) | Only the ~8% of paths with no measured time, and only to check them |
| Boats/zeppelins/tram | Shortest Path Forever `Data/Routes.lua` + `Data/Transports.lua` | Spot-check the new routes |
| Hearthstone | wago.tools `SpellCooldowns`/`SpellMisc` (wowf): 60 min cooldown, 10 s cast | No |
| Mob HP/armor/damage | cmangos classic-db `creature_template` (vanilla 1.12, not Forever) | Yes, a calibration sample |
| Respawn timers | cmangos classic-db `creature.spawntimesecsmin/max` (vanilla) | **Yes.** Forever changed respawns |
| Time-to-kill, XP/hour | No dataset found | **Yes.** Model it, then calibrate with telemetry |

## 1. Map / zone world sizes

### wago.tools DB2 CSV exports (best source)
- **[V]** wago.tools carries Forever as product **`wowf`**. Latest build is **1.60.1.71139** (2026-11-25), per `https://wago.tools/api/builds`. A plain `curl` of `https://wago.tools/db2/<Table>/csv?build=1.60.1.71139` returns CSV (HTTP 200). This corrects the earlier note that wago.tools returned 403: that was the WebFetch client, not curl.
- **[V]** `UiMapAssignment` has 61 rows. The columns that matter are `UiMapID`, `MapID` (continent), `AreaID`, and `Region_0..5` (world min X/Y/Z, max X/Y/Z, in yards). Zone size = `(Region_4 - Region_1)` wide by `(Region_3 - Region_0)` high, using the row with `UiMin=(0,0)`, `UiMax=(1,1)` and `OrderIndex=0`.
- **[V]** Recomputed Forever vs Era (1.15.9.70576):

| UiMapID | Zone | Forever W x H (yd) | Era W x H (yd) |
|---|---|---|---|
| 1411 | Durotar (unchanged control) | 5287.5 x 3525.0 | same |
| 1412 | Mulgore | 6154.2 x 4102.1 | 5137.5 x 3425.0 |
| 1423 | Eastern Plaguelands | 4302.1 x 2866.7 | 3870.8 x 2581.2 |
| 1433 | Redridge Mountains | 2170.8 x 1447.9 (offset changed only) | 2170.8 x 1447.9 |
| 1453 | Stormwind City | 1737.5 x 1158.3 | 1344.3 x 896.4 |
| 2482 | Mount Hyjal (new) | 3472.9 x 2314.6 | n/a |
| 2548 | Riverglades (new) | 4850.0 x 3233.3 | n/a |
| 2652 | Shen'dralas (new) | 2050.0 x 1366.7 | n/a |
| 2521/2665 | Zephras Isle (new, map 2991) | 5562.5 x 3708.3 | n/a |
| 2524 | Darkspear Islands (new, map 2997) | 1925.0 x 1283.3 | n/a |

- **[V]** Cross-check: Era/Forever Mulgore width is 5137.5 / 6154.2 = 0.8348. That equals the Mulgore scale in QuestieDB `src/support/eraToForever.lua` (0.8348002, generated from "DBC bounds: 1.15.9.69722 -> 1.60.1.69893").
- License: Blizzard client data, redistributed by wago.tools (no explicit license). Fresh: rebuilt on every client build. Confidence for Forever: **high**. It is the client's own data. Pin the build number and fail if the client build differs.

### Other candidates
- **[V]** Shortest Path Forever `Data/Zones.lua` (GPL-3.0) already contains these regions, generated from UiMapAssignment 1.60.1.71139 (for example Mulgore `minX=-3835, maxX=267, minY=-3675, maxY=2479`, the same as above), plus level ranges.
- **[V]** HereBeDragons-2.0 (Questie copy `Libs/HereBeDragons`, v2.16; also in RXP and SilverDragon) has **no static table**. `processMap` builds `{width, height, left, top}` at runtime from `C_Map.GetWorldPosFromMapPos`. It is useful as an in-game cross-check only.
- **[V]** QuestieTrace dump `QuestieTraceDumps.dumps.map_hierarchy` (local, `WTF/Account/<acct>/SavedVariables/QuestieTrace.lua`, written 2026-11-27) holds 57 Forever maps, including 2482 and 2548. It stores `C_Map.GetMapRectOnMap` rects, which are **normalized to the parent continent, not yards**. Useful only for checking the hierarchy.
- **[V]** QuestieDB `eraToForever.lua` holds coordinate transforms only (4 AreaIDs), not sizes.
- **[I]** HBD-1.0, Astrolabe and Carbonite static tables are Era/old-client only and superseded by the DB2 data. Not inspected.

**Recommendation:** generate a `zoneSizes` table from the wowf `UiMapAssignment` CSV, record the build in the file, and check it against `C_Map.GetWorldPosFromMapPos` once in game with a one-line debug command. No manual measuring is needed.

## 2. Flight paths and transport

### wago.tools taxi DB2 (Forever 1.60.1.71139)
- **[V]** `TaxiNodes` has 101 rows: `ID, Name_lang, ContinentID, Pos_0..2` (world yards), `Flags`, `MountCreatureID_0/1`. Faction is the `Flags` bit: 0x1 = Alliance, 0x2 = Horde. This matches RXP `taxiPos.flag`, and Rog'mar (Horde wyvern only) has 1026 while Farholde Keep (gryphon only) has 1025.
- **[V]** `TaxiPath` has 328 rows (`FromTaxiNode, ToTaxiNode, Cost`). `TaxiPathNode` has 10,965 rows (`PathID, NodeIndex, ContinentID, Loc_0..2, Delay`).
- **[V]** New Forever nodes include 559 Summit of Eternity and 3242 Tainted Foothills (Mount Hyjal), 3203 Rog'mar (H) and 3276 Farholde Keep (A) (Riverglades), 3274/3275 Powderfuse Port, and 3205 Tidegear Coast. Paths exist for Hyjal and Rog'mar/Farholde. None were found for Powderfuse Port or Tidegear Coast (**[I]** probably a boat, a quest flight, or unfinished).
- **[V]** Forever vs Era `TaxiPathNode`: 23 regular paths changed (for example everything out of Stormwind, and Camp Taurajo to Thunder Bluff), but path lengths moved by at most 207 yd (about 7 s, Undercity to Kargath). 34 paths are new.

### Flight-time model, calibrated by me
- **[V]** RXP's FPDB has 787 times, 261 of them on direct paths. Fitting them against Forever 3D polyline length gives **t = 0.38 s + length / 30.03 yd/s**, residual SD 0.7 s, max 6.4 s.
- **[V]** Multi-hop times are, at the median, the sum of the legs (extra time about 0 s). But the shortest-length route guess was off by an SD of 25-50 s, so the route the server actually picks is not simply the shortest. **[I]** Use measured multi-hop times where they exist, or capture the in-game route (`GetNumRoutes`/`TaxiGetDestX`) once.
- Note: cmangos `TAXI_FLIGHT_SPEED` is 32 yd/s (as cited by SPF), but measured times fit 30 yd/s on the raw polyline. Use the empirical 30.03.

### Shortest Path Forever by cjber (best ready-made source)
- **[V]** https://github.com/cjber/shortest-path-forever, GPL-3.0. Last push 2026-11-27. CurseForge game version 1.60.1.
- **[V]** `Data/Taxi.lua` (167 KB):
  - `ns.TaxiNodes` with map, x, y, z, name and faction.
  - `ns.TaxiPaths` with `{from, to, seconds, points}`.
  - Sources: wago.tools 1.60.1.71139 and cmangos classic-db, plus **InFlight Classic measured durations for 266/288 paths (92.4%)**. The rest are estimated at 32 yd/s.
- **[V]** `Data/Routes.lua`: boat and zeppelin timetables (`period` ms, stops with arrive/depart ms, frames). Example: path 241 Booty Bay-Ratchet boat, period 350,818 ms. Built from TaxiPathNode with the cmangos `TransportMgr` model (30 yd/s, 1 yd/s²) and "stretched onto the sniffed CMaNGOS classic-db periods". New routes use a mean correction (**[I]** lower confidence).
- **[V]** `Data/Transports.lua`: lifts and Deeprun Tram from `TransportAnimation` plus classic-db spawns. In the DB2, tram cars 176080-176085 have a 143,333 ms loop; lifts run 30,000 ms.
- **[V]** It also ships a walking navmesh grid (`Nav/*.lua`, baked from the local wowf 1.60.1.71037 client with TrinityCore tools) and `Data/Walks.lua`. These are a strong reuse candidate for walking times between quest points.
- Reuse needs MinMaxQuest to be GPL-3.0-compatible.

### InFlight (the source of the measured times)
- **[V]** https://github.com/LudiusMaximus/InFlight, MIT. `Defaults.lua` is 475 KB. Last push 2026-11-15. The times are crowd-sourced from players' flights and are Classic (Era) times.
- **[I]** WoWInterface threads report a few bad entries from interrupted flights.

### RXPGuides (local)
- **[V]** `DB/forever/flightData.lua` (`addon.FPDB[faction][src][dst] = seconds`, 63 nodes) is **byte-identical to `DB/classic/flightData.lua`** except for the game guard. `DB/forever/db.lua` `addon.taxiPos` (62 nodes, world x/y and a faction flag) is the same as Classic.
- No Riverglades, Hyjal or other new Forever nodes.
- License **CC BY-NC-SA 4.0** (`RXPGuides/LICENSE`). Use it only as a cross-check.

### AllTheThings (local)
- **[V]** `db/Camelot/Categories/Zones.lua` (Camelot = Forever) has 71 `fp(id,{coords={[uiMap]={{x,y}}}})` entries, including the new 559, 3203, 3242 and 3276.
- License "All Rights Reserved". Cross-check only.

### Other candidates
- **[V]** QuestieDB/Questie have no taxi tables.
- **[I]** vmangos/cmangos load taxi data from DBC, so they have no `taxi_*` SQL tables worth using. cmangos `mangos.sql` does have `transports.period` **[V]**.
- Not checked: FlightMap, Leatrix Maps, Zygor.
- **[V]** LibTaxiData (WoWInterface, updated 2026-11-13) provides node metadata and names, not times.

### Hearthstone
- **[V]** Spell 8690 in wowf 1.60.1.71139: `SpellCooldowns.CategoryRecoveryTime = 3,600,000 ms` (60 min), `SpellCategories.Category = 89`, `SpellMisc.CastingTimeIndex = 7`, which `SpellCastTimes` gives as 10,000 ms. Era 1.15.9.70576 has the same 3,600,000 ms.
- This replaces the "[RE-VERIFY FOREVER]" note in `game_mechanics_data.md`.

**Recommendation:** build the taxi graph from the wowf DB2 CSVs (faction from Flags), and take per-edge seconds from SPF `Data/Taxi.lua`. Fall back to `0.38 + len/30.03` if needed. Take boats, zeppelins and tram from SPF `Routes.lua`/`Transports.lua`. In game, only spot-check the new routes (Riverglades, Hyjal), the 22 estimated paths, and multi-hop routing.

## 3. Combat time: HP, damage, respawn, TTK

### QuestieTrace (local, read only)
- **[V]** v1.14.0, GPL-3.0, Interface 16001. Every sample is timestamped (`GetTime`/`GetTimePreciseSec`). It records:
  - Position: `C_Map.GetPlayerMapPosition` every 0.20 s plus zone events.
  - Combat state: `PLAYER_REGEN_DISABLED/ENABLED`, and `UnitLevel`, `UnitClassification`, `UnitReaction`, `UnitAffectingCombat` and `UnitGUID` for the target and mouseover.
  - XP: `UnitXP`/`UnitXPMax`, `PLAYER_XP_UPDATE`.
  - Loot: `GetLootSourceInfo`, which gives the corpse GUID, so the mob ID and spawn.
  - Quest, gossip, merchant and `TAXIMAP_OPENED/CLOSED` events.
- **[V]** It does **not** record the combat log, `UnitHealth`/`UnitHealthMax`, damage, or `UnitOnTaxi`.
- **[I]** Kill durations, respawns and flight times could be derived from the raw traces (combat windows, then an XP tick and a loot GUID; position samples during a flight). But the raw traces go to the Questie team and are not published.
- **[V]** The local SavedVariables have `dataCollectionConsent = false`, so no local trace stream exists, only the map dump.

### QuestieDB Forever aggregated output
- **[V]** The only trace-derived file is `support/Forever/QuestXP/xpDB-traces.lua`: quest XP and level, 475,220 traces and 2,512,170 sessions, generated 2026-11-24.
- **[V]** The rest of `support/Forever/` is zones, dungeons, faction templates (DB2), and drops (Wowhead-derived plus manual corrections).
- **[V]** No kill times, respawns, mob HP or flight data.
- **[V]** NPC fields `minLevelHealth`/`maxLevelHealth` are **deprecated placeholders** (0/1, per `src/meta/npcMeta.lua`). NPC data is baked as CBOR in `QuestieDB_Forever.toc` metadata (33,610 `X-Npc-*` keys).

### cmangos classic-db and mangos-classic (best stat source, but vanilla)
- **[V]** https://github.com/cmangos/classic-db, GPL-3.0, last push 2026-11-26. The schema is in `mangos-classic/sql/base/mangos.sql`.
- **[V]** `creature_template` has `MinLevel`, `HealthMultiplier`, `DamageMultiplier`, `ArmorMultiplier`, `MinLevelHealth`, `MaxLevelHealth` and related columns. `creature` has `spawntimesecsmin`/`spawntimesecsmax` (default 120).
- Coverage: vanilla 1.12 content, not Forever.
- **[I]** Forever reworked several zones and added new ones (Riverglades, Hyjal), so new NPCs are missing. Dev notes and hotfixes mention faster respawns and spawn changes, so respawn values are **not trustworthy for Forever**.
- **[V]** vmangos/core is GPL-2.0, last push 2026-11-26, with the world DB in its `db_latest` release. **[I]** It has similar per-creature health, damage and spawn-time columns; the column names were not verified.

### Published TTK / XP-per-hour datasets
- **[V]** None found. A web search turned up only calculators, a community XP%/mob-count spreadsheet, and Hardcore death telemetry.
- **[V]** The local Details! SavedVariables are small (≤83 KB) and do not keep a usable history of kills.

### Client-side
- **[V]** Creature HP and damage are server-side. There is no Forever DB2 for them.
- **[I]** Respawn could be measured passively: an addon logs `UNIT_DIED` per creature GUID and the next sighting of the same spawn (nameplate or target).

**Recommendation:** in-game measurement is **required** for time-to-kill and respawn on Forever.
- Model TTK as `mobHP(level, rank) / playerDPS(class, level, gear) + pull/loot overhead`, seeded from cmangos `creature_template` and dated as vanilla.
- Calibrate with a small MinMaxQuest telemetry module: combat-log kill time per mob ID, plus respawn and XP/hour.
- Treat cmangos respawn timers only as a prior.

## Sources
- wago.tools builds API and CSV: https://wago.tools/api/builds, `https://wago.tools/db2/{TaxiNodes,TaxiPath,TaxiPathNode,UiMapAssignment,UiMap,SpellCooldowns,SpellCategories,SpellMisc,SpellCastTimes,TransportAnimation}/csv?build=1.60.1.71139` (and `1.15.9.70576` for Era). Fetched 2026-11-27.
- Shortest Path Forever: https://github.com/cjber/shortest-path-forever, https://www.curseforge.com/wow/addons/shortest-path-forever
- InFlight: https://github.com/LudiusMaximus/InFlight
- cmangos: https://github.com/cmangos/classic-db, https://github.com/cmangos/mangos-classic (sql/base/mangos.sql). vmangos: https://github.com/vmangos/core
- LibTaxiData: https://wowinterface.com/downloads/info27178-LibTaxiData.html
- Local files (AddOns root):
  - `QuestieTrace/` (QuestieTrace.lua, Modules/Trackers/*, Modules/Dumps/MapHierarchy.lua)
  - `QuestieDB/support/Forever/*`, `QuestieDB/src/support/eraToForever.lua`, `QuestieDB/src/meta/npcMeta.lua`
  - `RXPGuides/DB/{classic,forever}/{flightData,db}.lua`, `RXPGuides/Timers.lua`, `RXPGuides/LICENSE`
  - `Questie/Libs/HereBeDragons/HereBeDragons-2.0.lua`
  - `AllTheThings/db/Camelot/Categories/Zones.lua`
  - `WTF/Account/<acct>/SavedVariables/QuestieTrace.lua`

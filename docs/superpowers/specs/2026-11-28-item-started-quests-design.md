# Item-started quests

## Intent

Quests started by a looted item (QuestieDB `startedBy[3]`) are excluded as `noStarter`; RestedXP routes them. Make them routable: the accept step becomes "loot the item from the mobs (or object) that drop it".

## Goals / non-goals

- Goal: route item-started quests whose starter drops from an outdoor mob or object, costed honestly.
- Goal: kills made on the same mobs for other quests count toward the drop.
- Non-goal: proximity/zone completion mode (outside a route) stays unchanged.
- Non-goal: cmangos rates for objective items (follow-up), "use {item}" once in bags (follow-up).
- Anti-goal: routing 1 % drops as if they were certain; the existing worthIt filter must drop them.

## Approaches

1. Standalone loot step: farm the best-rate mob until it drops, `killsForItems(1, rate)`. Simple, ignores overlap with kill tasks.
2. Loot step + kill credit (chosen): as 1, but the simulator counts kills per mob and the starter only needs the kills not already made; the builder defers a loot accept while an open task in the log targets the same mob.
3. Drop as side effect of other tasks only: no dedicated step. Rejected: non-deterministic, nothing to follow in game.

## Design

- Drop rates: cmangos classic-db (pinned dump) `creature_loot_template` via `creature_template.LootId`; group entries with chance 0 share the group's remaining chance; reference rows and conditions ignored. QuestieDB rate first, cmangos second, else the scenario's `questDropChance` (user choice, 2026-11-28), counted as assumed.
- World: `RouteQuest.starter: Task | null` (count 1, kind collect or use) built by the item-source logic shared with collect objectives; accept place = its cluster center (npcId = mob). Instance-only sources excluded (`noPosition`); elite source mob marks the quest elite for the variant filter.
- Simulator: `SimState.kills` per npc; `doTask` adds kills; accept of an item-started quest runs the starter task minus credited kills.
- Builder: worthIt includes the starter cost; acceptQuests skips a loot accept while an in-log open task shares its mob.
- Addon: `QuestInfo.starterItems`; the follower's accept target for such a quest uses the drop spawns cluster and the label "loot {item} to start it" / "ramasser {item} pour la lancer". Done when the quest is in the log (existing rule). Format unchanged.
- README Features updated; routes regenerated.

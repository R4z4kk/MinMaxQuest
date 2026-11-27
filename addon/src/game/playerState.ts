import { playerPosition } from "../arrow/arrowFrame";
import type { CharDb } from "../core/storage";
import type { CompletionInput } from "../targets/completion";
import type { PlayerSnapshot } from "./engine";

export const HEARTHSTONE_ITEM_ID = 6948;
export const HEARTHSTONE_SPELL_ID = 8690;
const HEARTH_LANDING_WINDOW_SEC = 60;

export interface PlayerStateReader {
  read(): PlayerSnapshot | null;
  refreshLog(): boolean;
  markCompletedDirty(): void;
  levelUp(level: number): void;
  markTurnedIn(questId: number): void;
  hearthCast(): void;
  enteredWorld(): void;
  hearthBound(): void;
}

export interface QuestLogState {
  entries: CompletionInput["log"];
  ids: Set<number>;
}

export function readCompleted(): Set<number> {
  const completed = new Set<number>();
  const getAll = C_QuestLog.GetAllCompletedQuestIDs;
  if (getAll != null) {
    for (const id of getAll()) completed.add(id);
    return completed;
  }
  if (GetQuestsCompleted == null) throw new Error("no completed-quest API");
  const flags = GetQuestsCompleted();
  for (const key of Object.keys(flags)) {
    const id = Number(key);
    if (flags[id] === true) completed.add(id);
  }
  return completed;
}

export function readLog(): QuestLogState {
  const entries: CompletionInput["log"] = new Map();
  const ids = new Set<number>();
  const isComplete = C_QuestLog.IsComplete;
  const [count] = C_QuestLog.GetNumQuestLogEntries();
  for (let index = 1; index <= count; index++) {
    const info = C_QuestLog.GetInfo(index);
    if (info == null || info.isHeader) continue;
    const objectives = C_QuestLog.GetQuestObjectives(info.questID);
    const objectivesDone = new Set<number>();
    const counts: { have: number; need: number }[] = [];
    if (objectives != null) {
      for (let i = 0; i < objectives.length; i++) {
        if (objectives[i].finished) objectivesDone.add(i + 1);
        counts.push({ have: objectives[i].numFulfilled ?? 0, need: objectives[i].numRequired ?? 0 });
      }
    }
    // As Questie QuestLogCache: a quest without objective rows (delivery) counts as complete; nil rows are not loaded yet.
    const allDone = objectives != null && objectivesDone.size === objectives.length;
    const complete = allDone || (isComplete != null && isComplete(info.questID) === true);
    entries.set(info.questID, { complete, objectivesDone, counts });
    ids.add(info.questID);
  }
  return { entries, ids };
}

function sameCounts(a?: { have: number; need: number }[], b?: { have: number; need: number }[]): boolean {
  if (a == null || b == null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].have !== b[i].have || a[i].need !== b[i].need) return false;
  return true;
}

function sameLog(a: QuestLogState, b: QuestLogState): boolean {
  if (a.ids.size !== b.ids.size) return false;
  for (const [id, entry] of b.entries) {
    const old = a.entries.get(id);
    if (old == null || old.complete !== entry.complete || old.objectivesDone.size !== entry.objectivesDone.size) {
      return false;
    }
    if (!sameCounts(old.counts, entry.counts)) return false;
    for (const index of entry.objectivesDone) if (!old.objectivesDone.has(index)) return false;
  }
  return true;
}

// Same order as Questie QuestieCompat.GetQuestGreenRange: Forever's C_QuestLog.GetTrivialRange first.
function greenRange(): number {
  const trivialRange = C_QuestLog.GetTrivialRange;
  if (trivialRange != null) return trivialRange();
  if (GetQuestGreenRange != null) return GetQuestGreenRange();
  throw new Error("no green-range API");
}

// Same order as Questie QuestieCompat.GetItemCount.
function itemCount(itemId: number): number {
  const count = C_Item?.GetItemCount ?? GetItemCount;
  if (count == null) throw new Error("no item-count API");
  return count(itemId);
}

// Same order as Questie QuestieCompat.GetItemCooldown.
export function hearthReady(): boolean {
  if (!(itemCount(HEARTHSTONE_ITEM_ID) > 0)) return false;
  const getter = C_Container?.GetItemCooldown ?? C_Item?.GetItemCooldown ?? GetItemCooldown;
  if (getter == null) throw new Error("no item-cooldown API");
  const [start, duration] = getter(HEARTHSTONE_ITEM_ID);
  return start === 0 || start + duration <= GetTime();
}

export function playerFaction(): "A" | "H" | null {
  const [group] = UnitFactionGroup("player");
  if (group === "Alliance") return "A";
  if (group === "Horde") return "H";
  return null;
}

export function createPlayerState(lib: LibQuestieDBApi, db: CharDb): PlayerStateReader {
  let completed: Set<number> | null = null;
  let log: QuestLogState | null = null;
  let hearthCastAt: number | null = null;
  let eventLevel: number | null = null;

  const recordHearth = (): void => {
    const pos = playerPosition();
    if (pos != null) db.hearthPos = pos;
  };

  return {
    read() {
      const side = playerFaction();
      if (side == null) return null;
      const [, , raceId] = UnitRace("player");
      const [, classToken] = UnitClass("player");
      const raceMask = lib.Enum.raceMaskById[raceId];
      const classMask = lib.Enum.classKeys[classToken === "DEATHKNIGHT" ? "DEATH_KNIGHT" : classToken];
      if (raceMask == null || classMask == null) throw new Error(`unknown race ${raceId} or class ${classToken}`);
      if (completed == null) completed = readCompleted();
      if (log == null) log = readLog();
      // UnitLevel can still return the old level during PLAYER_LEVEL_UP.
      const level = eventLevel == null ? UnitLevel("player") : Math.max(eventLevel, UnitLevel("player"));
      eventLevel = null;
      const xpIntoLevel = UnitXP("player");
      if (typeof xpIntoLevel !== "number") throw new Error("UnitXP returned no number");
      return {
        pos: playerPosition(),
        state: { level, raceMask, classMask, completed, inLog: log.ids },
        log: log.entries,
        greenRange: greenRange(),
        faction: side,
        hearth: { ready: hearthReady(), pos: db.hearthPos },
        maxLevel: GetMaxPlayerLevel(),
        xpIntoLevel,
      };
    },
    refreshLog() {
      const next = readLog();
      const changed = log == null || !sameLog(log, next);
      log = next;
      return changed;
    },
    markCompletedDirty() {
      completed = null;
    },
    markTurnedIn(questId) {
      if (completed != null) completed.add(questId);
    },
    levelUp(level) {
      eventLevel = level;
    },
    hearthCast() {
      hearthCastAt = GetTime();
    },
    enteredWorld() {
      if (hearthCastAt != null && GetTime() - hearthCastAt <= HEARTH_LANDING_WINDOW_SEC) recordHearth();
      hearthCastAt = null;
    },
    hearthBound: () => recordHearth(),
  };
}

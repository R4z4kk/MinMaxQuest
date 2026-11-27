import type { ArrowTarget } from "../arrow/arrowFrame";
import { distance, type WorldPos } from "../core/geometry";
import { t, type L10nKey } from "../core/l10n";
import type { CharDb } from "../core/storage";
import type { QuestInfo } from "../data/questRepository";
import type { PlayerQuestState } from "../quests/availability";
import { followUps, lostXp } from "../quests/followUps";
import { zoneProgress, type CompletionInput, type Target, type ZoneProgress } from "../targets/completion";
import { killLoop, nextLoopIndex } from "../targets/spawns";
import type { TravelHop } from "../travel/graph";

export const REFRESH_INTERVAL_SEC = 2;
export const LOOP_ADVANCE_YARDS = 25;
export const IDLE_YARDS = 10;

const HOP_LABEL: Record<"taxi" | "boat" | "hearth", L10nKey> = {
  taxi: "goFlightMaster",
  boat: "goBoat",
  hearth: "useHearth",
};

export interface PlayerSnapshot {
  pos: WorldPos | null;
  state: PlayerQuestState;
  log: CompletionInput["log"];
  greenRange: number;
  faction: "A" | "H";
  hearth: { ready: boolean; pos: WorldPos | null };
  maxLevel: number;
}

export interface EngineDeps {
  now(): number;
  readPlayer(): PlayerSnapshot | null;
  readPosition(): WorldPos | null;
  completion: (snap: PlayerSnapshot) => Target[];
  firstHop(target: Target): TravelHop | null;
  getQuest(id: number): QuestInfo | null;
  allQuests(): QuestInfo[];
  onTargets(list: Target[], current: Target | null): void;
  onTaxi(): boolean;
  clockMs(): number;
}

export interface RefreshProfile {
  first: number | null;
  last: number | null;
}

export interface SkipResult {
  needsConfirm: boolean;
  followUps: QuestInfo[];
  lost: { xp: number; levelFraction: number } | null;
}

type Listener = (list: Target[], current: Target | null) => void;

export interface Engine {
  refreshTargets(force: boolean): void;
  pin(questId: number | null): void;
  current(): Target | null;
  targets(): Target[];
  arrowTarget(): ArrowTarget | null;
  skip(questId: number, confirmed: boolean): SkipResult;
  skipped(): number[];
  unskip(questId: number): boolean;
  unskipAll(): number;
  onChange(cb: Listener): void;
  zoneProgress(zoneAreaId: number): ZoneProgress | null;
  snapshot(): PlayerSnapshot | null;
  profile(): RefreshProfile;
}

export function targetAction(target: Target): string {
  if (target.kind === "accept") return t("targetAccept");
  if (target.kind === "turnin") return t("targetTurnin");
  return `${t("targetObjective")} ${target.objectiveIndex ?? ""}`;
}

export function questLabel(questId: number, quest: QuestInfo | null): string {
  return quest == null ? `#${questId}` : quest.name;
}

export function describeTarget(target: Target, quest: QuestInfo | null): string {
  return `${questLabel(target.questId, quest)} · ${targetAction(target)}`;
}

export function sameKey(a: Target | null, b: Target | null): boolean {
  if (a == null || b == null) return a === b;
  return a.questId === b.questId && a.kind === b.kind && a.objectiveIndex === b.objectiveIndex;
}

function sameTargets(a: Target[], b: Target[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sameKey(a[i], b[i]) || Math.round(a[i].seconds) !== Math.round(b[i].seconds)) return false;
  }
  return true;
}

function sameArrow(a: ArrowTarget | null, b: ArrowTarget | null): boolean {
  if (a == null || b == null) return a === b;
  return a.label === b.label && a.pos.continent === b.pos.continent && a.pos.x === b.pos.x && a.pos.y === b.pos.y;
}

export function createEngine(deps: EngineDeps, db: CharDb): Engine {
  let list: Target[] = [];
  let currentTarget: Target | null = null;
  let hop: TravelHop | null = null;
  let snapshot: PlayerSnapshot | null = null;
  let lastRun: number | null = null;
  let lastRunPos: WorldPos | null = null;
  const profile: RefreshProfile = { first: null, last: null };
  let arrow: ArrowTarget | null = null;
  let label = "";
  let loop: WorldPos[] | null = null;
  let loopIndex = 0;
  let loopKey = "";
  const listeners: Listener[] = [];

  const pick = (): Target | null => {
    const pinned = db.pinnedQuestId;
    if (pinned != null) for (const target of list) if (target.questId === pinned) return target;
    return list.length > 0 ? list[0] : null;
  };

  const showArrow = (pos: WorldPos, text: string): void => {
    const next = { pos, label: text };
    if (!sameArrow(arrow, next)) arrow = next;
  };

  // Runs once per refresh; ticks only advance the loop index.
  const retarget = (pos: WorldPos | null): void => {
    const target = currentTarget;
    if (target == null || (hop != null && hop.kind !== "walk")) {
      loop = null;
      loopKey = "";
      if (target == null) arrow = null;
      else if (hop != null && hop.kind !== "walk") showArrow(hop.pos, t(HOP_LABEL[hop.kind]));
      return;
    }
    label = describeTarget(target, deps.getQuest(target.questId));
    if (target.cluster == null) {
      loop = null;
      loopKey = "";
      showArrow(target.pos, label);
      return;
    }
    const center = target.cluster.center;
    const key = `${target.questId}:${target.objectiveIndex}:${center.continent}:${center.x}:${center.y}`;
    if (loop == null || key !== loopKey) {
      loopKey = key;
      loop = killLoop(target.cluster, pos ?? target.pos);
      loopIndex = 0;
    } else if (pos != null) {
      loopIndex = nextLoopIndex(loop, loopIndex, pos, LOOP_ADVANCE_YARDS);
    }
    showArrow(loop.length > 0 ? loop[loopIndex] : target.pos, label);
  };

  const advanceLoop = (pos: WorldPos | null): void => {
    if (loop == null || loop.length === 0 || pos == null) return;
    const next = nextLoopIndex(loop, loopIndex, pos, LOOP_ADVANCE_YARDS);
    if (next === loopIndex) return;
    loopIndex = next;
    arrow = { pos: loop[next], label };
  };

  const notifyListeners = (): void => {
    for (const listener of listeners) listener(list, currentTarget);
  };

  const apply = (listChanged: boolean, pos: WorldPos | null): boolean => {
    const previous = currentTarget;
    currentTarget = pick();
    hop = currentTarget == null ? null : deps.firstHop(currentTarget);
    retarget(pos);
    if (!listChanged && sameKey(previous, currentTarget)) return false;
    deps.onTargets(list, currentTarget);
    notifyListeners();
    return true;
  };

  // Returns true when listeners were notified.
  const fullRefresh = (): boolean => {
    const snap = deps.readPlayer();
    if (snap == null) return false;
    snapshot = snap;
    const pinned = db.pinnedQuestId;
    if (pinned != null && snap.state.completed.has(pinned)) db.pinnedQuestId = null;
    if (snap.pos == null) return apply(false, null);
    lastRunPos = snap.pos;
    const skipped = new Set(db.skippedQuests);
    const next = deps.completion(snap).filter((target) => !skipped.has(target.questId));
    const changed = !sameTargets(list, next);
    list = next;
    return apply(changed, snap.pos);
  };

  const refreshTargets = (force: boolean): boolean => {
    if (!force && deps.onTaxi()) return false;
    const now = deps.now();
    if (!force && lastRun != null && now - lastRun < REFRESH_INTERVAL_SEC) {
      advanceLoop(deps.readPosition());
      return false;
    }
    if (!force && lastRunPos != null) {
      const pos = deps.readPosition();
      if (pos != null && distance(pos, lastRunPos) < IDLE_YARDS) {
        advanceLoop(pos);
        return false;
      }
    }
    lastRun = now;
    const started = deps.clockMs();
    const notified = fullRefresh();
    const elapsed = deps.clockMs() - started;
    profile.last = elapsed;
    if (profile.first == null) profile.first = elapsed;
    return notified;
  };

  return {
    refreshTargets: (force) => {
      refreshTargets(force);
    },
    pin(questId) {
      db.pinnedQuestId = questId;
      if (!apply(false, deps.readPosition())) notifyListeners();
    },
    current: () => currentTarget,
    targets: () => list,
    arrowTarget: () => arrow,
    skip(questId, confirmed) {
      const quest = deps.getQuest(questId);
      const chain = quest == null ? [] : followUps(questId, (id) => deps.getQuest(id));
      const snap = snapshot ?? deps.readPlayer();
      const lost = snap == null || quest == null ? null : lostXp([quest, ...chain], snap.state.level, snap.maxLevel);
      if (chain.length > 0 && !confirmed) return { needsConfirm: true, followUps: chain, lost };
      if (!db.skippedQuests.includes(questId)) db.skippedQuests.push(questId);
      const wasPinned = db.pinnedQuestId === questId;
      if (wasPinned) db.pinnedQuestId = null;
      refreshTargets(true);
      if (wasPinned) notifyListeners();
      return { needsConfirm: false, followUps: chain, lost };
    },
    skipped: () => db.skippedQuests.slice(),
    unskip(questId) {
      if (!db.skippedQuests.includes(questId)) return false;
      db.skippedQuests = db.skippedQuests.filter((id) => id !== questId);
      refreshTargets(true);
      return true;
    },
    unskipAll() {
      const count = db.skippedQuests.length;
      db.skippedQuests = [];
      if (count > 0) refreshTargets(true);
      return count;
    },
    onChange(cb) {
      listeners.push(cb);
    },
    zoneProgress(zoneAreaId) {
      if (snapshot == null) return null;
      return zoneProgress(deps.allQuests(), snapshot.state.completed, zoneAreaId, snapshot.state);
    },
    snapshot: () => snapshot,
    profile: () => profile,
  };
}

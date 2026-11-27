import type { ArrowTarget } from "../arrow/arrowFrame";
import type { WorldPos } from "../core/geometry";
import { t } from "../core/l10n";
import type { CharDb } from "../core/storage";
import type { QuestInfo } from "../data/questRepository";
import type { PlayerQuestState } from "../quests/availability";
import { followUps, lostXp } from "../quests/followUps";
import { zoneProgress, type CompletionInput, type Target, type ZoneProgress } from "../targets/completion";
import { killLoop, nextLoopIndex } from "../targets/spawns";
import type { TravelHop } from "../travel/graph";

export const REFRESH_INTERVAL_SEC = 2;
export const LOOP_ADVANCE_YARDS = 25;

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
  onChange(cb: Listener): void;
  zoneProgress(zoneAreaId: number): ZoneProgress | null;
}

export function describeTarget(target: Target, quest: QuestInfo | null): string {
  const name = quest == null ? `#${target.questId}` : quest.name;
  if (target.kind === "accept") return `${name} · ${t("targetAccept")}`;
  if (target.kind === "turnin") return `${name} · ${t("targetTurnin")}`;
  return `${name} · ${t("targetObjective")} ${target.objectiveIndex ?? ""}`;
}

function sameKey(a: Target | null, b: Target | null): boolean {
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
    if (target == null || (hop != null && (hop.kind === "taxi" || hop.kind === "boat"))) {
      loop = null;
      loopKey = "";
      if (target == null) arrow = null;
      else if (hop != null) showArrow(hop.pos, t(hop.kind === "taxi" ? "goFlightMaster" : "goBoat"));
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

  const apply = (listChanged: boolean, pos: WorldPos | null): void => {
    const previous = currentTarget;
    currentTarget = pick();
    hop = currentTarget == null ? null : deps.firstHop(currentTarget);
    retarget(pos);
    if (!listChanged && sameKey(previous, currentTarget)) return;
    deps.onTargets(list, currentTarget);
    for (const listener of listeners) listener(list, currentTarget);
  };

  const refreshTargets = (force: boolean): void => {
    const now = deps.now();
    if (!force && lastRun != null && now - lastRun < REFRESH_INTERVAL_SEC) {
      advanceLoop(deps.readPosition());
      return;
    }
    lastRun = now;
    const snap = deps.readPlayer();
    if (snap == null) return;
    snapshot = snap;
    const pinned = db.pinnedQuestId;
    if (pinned != null && snap.state.completed.has(pinned)) db.pinnedQuestId = null;
    if (snap.pos == null) {
      apply(false, null);
      return;
    }
    const skipped = new Set(db.skippedQuests);
    const next = deps.completion(snap).filter((target) => !skipped.has(target.questId));
    const changed = !sameTargets(list, next);
    list = next;
    apply(changed, snap.pos);
  };

  return {
    refreshTargets: (force) => refreshTargets(force),
    pin(questId) {
      db.pinnedQuestId = questId;
      apply(false, deps.readPosition());
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
      if (db.pinnedQuestId === questId) db.pinnedQuestId = null;
      refreshTargets(true);
      return { needsConfirm: false, followUps: chain, lost };
    },
    onChange(cb) {
      listeners.push(cb);
    },
    zoneProgress(zoneAreaId) {
      if (snapshot == null) return null;
      return zoneProgress(deps.allQuests(), snapshot.state.completed, zoneAreaId, snapshot.state);
    },
  };
}

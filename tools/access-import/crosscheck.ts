import type { Denylist } from "./denylist";
import type { AccessChainDef } from "./legacyChains";
import { maskAllows } from "../../addon/src/quests/availability";
import { INSTANCE_PARTY } from "../route-builder/ingest/instances";
import { hasFlag, type QuestieSnapshot } from "../route-builder/ingest/snapshot";
import { FACTION_RACES, raceUnion } from "../route-builder/model/world";
import type { AccessEntry, AccessGroup, AccessStep, AccessStepKind } from "./types";

type Side = "A" | "H";
type QuestFaction = "A" | "H" | "AH" | "none";

export interface StepRef {
  entry: string;
  step: number;
  ref: number;
}

export interface CrossCheckReport {
  unknownQuests: StepRef[];
  unknownItems: StepRef[];
  factionConflicts: (StepRef & { questFaction: QuestFaction })[];
  oneSidedInBoth: (StepRef & { questFaction: Side })[];
  unmatchedAttuneDungeons: string[];
  missingDungeons: { areaId: number; name: string; faction: Side; entry: string }[];
  questlessDungeons: { areaId: number; name: string }[];
  addedQuests: { entry: string; quest: number }[];
  skippedClassQuests: { areaId: number; quest: number }[];
  skippedFlaggedQuests: { areaId: number; quest: number; flag: "repeatable" | "event" }[];
  chains: { id: string; mergedInto: string[] }[];
  excludedQuests: { quest: number; reason: string; removed: number }[];
  excludedSteps: { entry: string; step: number; ref: number; reason: string; rewired: number[] }[];
}

export interface CrossCheckInput {
  entries: AccessEntry[];
  snapshot: QuestieSnapshot;
  instanceTypes: Map<number, number>;
  chains: AccessChainDef[];
  denylist: Denylist;
}

const SIDES: Side[] = ["A", "H"];
const QUEST_KINDS = new Set<AccessStepKind>(["pickUp", "turnIn", "quest"]);
const GROUP_ORDER: AccessGroup[] = ["dungeon", "raid", "key", "misc"];
// specialFlags bits, QuestieDB v1.1.6 data/Forever/foreverQuestDB.lua questKeys: 1 = Repeatable, 2 = Needs event.
const REPEATABLE_FLAG = 1;
const EVENT_FLAG = 2;

// QuestieDB leaves a field nil when it does not restrict (requiredRaces, requiredClasses) or is unknown (zoneOrSort).
function questNumber(s: QuestieSnapshot, id: number, field: string): number {
  const value = s.quests[id]?.[field] ?? null;
  if (value === null) return 0;
  if (typeof value !== "number") throw new Error(`QuestieDB quest ${id}: ${field} is not a number`);
  return value;
}

function sidesOf(faction: AccessEntry["faction"]): Side[] {
  return faction === "AH" ? SIDES : [faction];
}

function questRefs(entry: AccessEntry): number[] {
  return entry.steps.filter((step) => QUEST_KINDS.has(step.kind)).map((step) => step.ref);
}

function questStep(id: number, ref: number, follows: number[]): AccessStep {
  return { id, kind: "quest", ref, follows, origin: "questiedb" };
}

function compareLevels(a: AccessEntry["levels"], b: AccessEntry["levels"]): number {
  if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
  return a[0] - b[0] || a[1] - b[1];
}

export function sortEntries(entries: AccessEntry[]): AccessEntry[] {
  return [...entries].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      compareLevels(a.levels, b.levels) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function chainEntry(def: AccessChainDef, s: QuestieSnapshot): AccessEntry {
  const steps: AccessStep[] = [];
  const seen = new Set<number>();
  for (const start of [...new Set([...def.start.A, ...def.start.H])]) {
    let previous: number | null = null;
    let current = start;
    while (current !== 0 && !seen.has(current)) {
      if (s.quests[current] == null) throw new Error(`access chain ${def.id}: quest ${current} is not in QuestieDB`);
      seen.add(current);
      const id = steps.length + 1;
      steps.push(questStep(id, current, previous == null ? [] : [previous]));
      previous = id;
      current = questNumber(s, current, "nextQuestInChain");
    }
  }
  const faction = def.start.A.length > 0 && def.start.H.length > 0 ? "AH" : def.start.A.length > 0 ? "A" : "H";
  return { id: def.id, group: def.kind, faction, levels: def.levelRange, name: { enUS: def.name.enUS, frFR: def.name.frFR }, steps };
}

// Removes denied steps; follows pointing at a removed step now point at its own follows, keeping the chain connected.
function applyDenylist(entries: AccessEntry[], list: Denylist, report: CrossCheckReport, denied: Map<number, { removed: number }>): void {
  for (const entry of entries) {
    const removed = new Map<number, AccessStep>();
    for (const step of entry.steps) {
      const quest = QUEST_KINDS.has(step.kind) ? denied.get(step.ref) : null;
      const scoped = list.steps.find((x) => x.entry === entry.id && x.quest === step.ref && x.steps.includes(step.id));
      if (quest != null) {
        quest.removed++;
        removed.set(step.id, step);
      } else if (scoped != null) {
        removed.set(step.id, step);
        report.excludedSteps.push({ entry: entry.id, step: step.id, ref: step.ref, reason: scoped.reason, rewired: [] });
      }
    }
    if (removed.size === 0) continue;
    const resolve = (ids: number[], seen: Set<number>): number[] =>
      ids.flatMap((id) => {
        const gone = removed.get(id);
        if (gone == null) return [id];
        if (seen.has(id)) return [];
        return resolve(gone.follows, new Set([...seen, id]));
      });
    entry.steps = entry.steps
      .filter((step) => !removed.has(step.id))
      .map((step) => {
        if (!step.follows.some((id) => removed.has(id))) return step;
        const follows = [...new Set(resolve(step.follows, new Set()))];
        for (const x of report.excludedSteps) if (x.entry === entry.id && step.follows.includes(x.step)) x.rewired.push(step.id);
        return { ...step, follows };
      });
  }
}

export function crossCheck(input: CrossCheckInput): { entries: AccessEntry[]; report: CrossCheckReport } {
  const s = input.snapshot;
  const masks: Record<Side, number> = { A: raceUnion(s, FACTION_RACES.A), H: raceUnion(s, FACTION_RACES.H) };
  const allows = (quest: number, side: Side): boolean => maskAllows(questNumber(s, quest, "requiredRaces"), masks[side]);
  const questFaction = (quest: number): QuestFaction => {
    const a = allows(quest, "A");
    const h = allows(quest, "H");
    return a && h ? "AH" : a ? "A" : h ? "H" : "none";
  };
  const entries = input.entries.map((entry) => ({ ...entry, steps: [...entry.steps] }));
  const report: CrossCheckReport = {
    unknownQuests: [],
    unknownItems: [],
    factionConflicts: [],
    oneSidedInBoth: [],
    unmatchedAttuneDungeons: [],
    missingDungeons: [],
    questlessDungeons: [],
    addedQuests: [],
    skippedClassQuests: [],
    skippedFlaggedQuests: [],
    chains: [],
    excludedQuests: input.denylist.quests.map((x) => ({ ...x, removed: 0 })),
    excludedSteps: [],
  };
  const denied = new Map(report.excludedQuests.map((x) => [x.quest, x]));
  applyDenylist(entries, input.denylist, report, denied);

  for (const entry of entries) {
    for (const step of entry.steps) {
      const ref = { entry: entry.id, step: step.id, ref: step.ref };
      if (step.kind === "item" && s.items[step.ref] == null) report.unknownItems.push(ref);
      if (!QUEST_KINDS.has(step.kind)) continue;
      if (s.quests[step.ref] == null) {
        report.unknownQuests.push(ref);
        continue;
      }
      const faction = questFaction(step.ref);
      if (!sidesOf(entry.faction).some((side) => faction === "AH" || faction === side)) report.factionConflicts.push({ ...ref, questFaction: faction });
      else if (entry.faction === "AH" && (faction === "A" || faction === "H")) report.oneSidedInBoth.push({ ...ref, questFaction: faction });
    }
  }

  const party = Object.entries(s.dungeons)
    .map(([key, dungeon]) => ({ areaId: Number(key), ...dungeon }))
    .filter((dungeon) => input.instanceTypes.get(dungeon.areaId) === INSTANCE_PARTY);
  const dungeonOfArea = new Map<number, number>();
  for (const dungeon of party) for (const area of [dungeon.areaId, ...dungeon.altAreaIds]) dungeonOfArea.set(area, dungeon.areaId);
  const questsByDungeon = new Map<number, number[]>();
  for (const key of Object.keys(s.quests)) {
    const quest = Number(key);
    const dungeon = dungeonOfArea.get(questNumber(s, quest, "zoneOrSort"));
    if (dungeon != null) questsByDungeon.set(dungeon, [...(questsByDungeon.get(dungeon) ?? []), quest]);
  }
  const questsIn = (entry: AccessEntry, dungeon: number): number =>
    new Set(questRefs(entry).filter((quest) => s.quests[quest] != null && dungeonOfArea.get(questNumber(s, quest, "zoneOrSort")) === dungeon)).size;
  const attuneDungeons = entries.filter((entry) => entry.group === "dungeon");
  report.unmatchedAttuneDungeons = attuneDungeons.filter((entry) => party.every((d) => questsIn(entry, d.areaId) === 0)).map((entry) => entry.id);

  for (const dungeon of party) {
    const quests = questsByDungeon.get(dungeon.areaId) ?? [];
    if (quests.length === 0) {
      report.questlessDungeons.push({ areaId: dungeon.areaId, name: dungeon.name });
      continue;
    }
    const referenced = new Set(entries.flatMap(questRefs));
    const eligible = quests.filter((quest) => {
      const block = denied.get(quest);
      if (block != null) {
        block.removed++;
        return false;
      }
      const flags = questNumber(s, quest, "specialFlags");
      const flag = hasFlag(flags, REPEATABLE_FLAG) ? "repeatable" : hasFlag(flags, EVENT_FLAG) ? "event" : null;
      const classQuest = questNumber(s, quest, "requiredClasses") !== 0;
      if (!referenced.has(quest) && flag != null) report.skippedFlaggedQuests.push({ areaId: dungeon.areaId, quest, flag });
      else if (!referenced.has(quest) && classQuest) report.skippedClassQuests.push({ areaId: dungeon.areaId, quest });
      return flag == null && !classQuest;
    });
    for (const side of SIDES) {
      const present = new Set(entries.filter((entry) => sidesOf(entry.faction).includes(side)).flatMap(questRefs));
      const missing = eligible.filter((quest) => allows(quest, side) && !present.has(quest));
      if (missing.length === 0) continue;
      let best: AccessEntry | null = null;
      let bestCount = 0;
      for (const entry of attuneDungeons) {
        const count = sidesOf(entry.faction).includes(side) ? questsIn(entry, dungeon.areaId) : 0;
        if (count > bestCount) [best, bestCount] = [entry, count];
      }
      if (best == null) {
        const id = `questie-${dungeon.areaId}-${side.toLowerCase()}`;
        const steps = missing.map((quest, index) => questStep(index + 1, quest, []));
        entries.push({ id, group: "dungeon", faction: side, levels: null, name: { enUS: dungeon.name, frFR: dungeon.name }, steps });
        report.missingDungeons.push({ areaId: dungeon.areaId, name: dungeon.name, faction: side, entry: id });
        continue;
      }
      const target = best;
      for (const quest of missing) {
        target.steps.push(questStep(Math.max(0, ...target.steps.map((step) => step.id)) + 1, quest, []));
        report.addedQuests.push({ entry: target.id, quest });
      }
    }
  }

  for (const def of input.chains) {
    const starts = new Set([...def.start.A, ...def.start.H]);
    const mergedInto = input.entries.filter((entry) => questRefs(entry).some((quest) => starts.has(quest))).map((entry) => entry.id);
    report.chains.push({ id: def.id, mergedInto });
    if (mergedInto.length === 0) entries.push(chainEntry(def, s));
  }

  return { entries: sortEntries(entries), report };
}

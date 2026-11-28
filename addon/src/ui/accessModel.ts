import { entryProgress, type AccessContext as ProgressContext, type StepState } from "../access/progress";
import { currentLocale, t, type L10nKey } from "../core/l10n";
import type { AccessEntry, AccessGroup, AccessStep } from "../data/generated/access";
import type { QuestInfo } from "../data/questRepository";
import { questLabel } from "../game/engine";
import type { IconKind } from "./theme";

export interface StepView {
  text: string;
  state: StepState;
}

export interface ChainView {
  id: string;
  group: AccessGroup;
  name: string;
  range: string | null;
  fraction: number;
  expanded: boolean;
  tracked: boolean;
  complete: boolean;
  started: boolean;
  count: string;
  steps: StepView[];
}

export type AccessLine =
  | { kind: "group"; group: AccessGroup; label: string; count: string; open: boolean }
  | { kind: "entry"; view: ChainView; icon: IconKind }
  | { kind: "step"; step: StepView }
  | { kind: "track"; view: ChainView };

export interface AccessContext extends Omit<ProgressContext, "knownQuest"> {
  getQuest(id: number): QuestInfo | null;
  questTitle(id: number): string | null;
  itemName(id: number): string | null;
  factionName(id: number): string | null;
  npcName(id: number): string | null;
  objectName(id: number): string | null;
  zoneName(areaId: number): string | null;
  expanded: string | null;
  tracked: string[];
}

export const GROUP_ORDER: AccessGroup[] = ["dungeon", "raid", "key", "misc"];
const GROUP_LABEL: Record<AccessGroup, L10nKey> = { dungeon: "dungeons", raid: "groupRaid", key: "groupKey", misc: "groupMisc" };

function withName(key: L10nKey, ref: number, name: string | null): string {
  return t(key).replace("{name}", name ?? `#${ref}`);
}

function stepText(step: AccessStep, ctx: AccessContext): string {
  const times = step.count != null && step.count > 1 ? ` ×${step.count}` : "";
  switch (step.kind) {
    case "pickUp":
    case "turnIn":
    case "quest":
      return ctx.questTitle(step.ref) ?? questLabel(step.ref, ctx.getQuest(step.ref));
    case "item":
      return (ctx.itemName(step.ref) ?? `#${step.ref}`) + times;
    case "level":
      return t("stepLevel").replace("{n}", String(step.ref));
    case "kill":
      return withName("stepKill", step.ref, ctx.npcName(step.ref)) + times;
    case "interact":
      return step.ref > 0 ? withName("stepTalk", step.ref, ctx.npcName(step.ref)) : t("stepTalkAny");
    case "click":
      return step.ref > 0 ? withName("stepUse", step.ref, ctx.objectName(step.ref)) : t("stepUseAny");
    case "rep":
      return t("stepRep").replace("{faction}", ctx.factionName(step.ref) ?? `#${step.ref}`).replace("{n}", String(step.count ?? 0));
    case "prof":
      return withName("stepProf", step.ref, null);
    case "end":
      return t("stepEnd");
  }
}

export function accessView(entries: AccessEntry[], ctx: AccessContext): ChainView[] {
  return entries.map((entry) => {
    const progress = entryProgress(entry, { ...ctx, knownQuest: (id) => ctx.getQuest(id) != null });
    const expanded = ctx.expanded === entry.id;
    const steps = (expanded ? progress.steps : []).map(({ step, state }): StepView => {
      const name = stepText(step, ctx);
      const isQuest = step.kind === "pickUp" || step.kind === "turnIn" || step.kind === "quest";
      const areaId = state === "current" && isQuest ? ctx.getQuest(step.ref)?.zoneAreaId : null;
      const zone = areaId == null ? null : ctx.zoneName(areaId);
      return { text: zone == null ? name : `${name} · ${zone}`, state };
    });
    return {
      id: entry.id,
      group: entry.group,
      name: entry.name[currentLocale()],
      range: entry.levels == null ? null : `${entry.levels[0]}-${entry.levels[1]}`,
      fraction: progress.total > 0 ? progress.done / progress.total : 0,
      expanded,
      tracked: ctx.tracked.includes(entry.id),
      complete: progress.complete,
      started: progress.done > 0 && !progress.complete,
      count: t("stepsCount").replace("{done}", String(progress.done)).replace("{total}", String(progress.total)),
      steps,
    };
  });
}

// Groups in display order; empty groups are left out, closed groups keep only their header.
export function accessLines(views: ChainView[], open: Set<AccessGroup>): AccessLine[] {
  const lines: AccessLine[] = [];
  for (const group of GROUP_ORDER) {
    const members = views.filter((view) => view.group === group);
    if (members.length === 0) continue;
    const done = members.filter((view) => view.complete).length;
    const isOpen = open.has(group);
    lines.push({ kind: "group", group, label: t(GROUP_LABEL[group]), count: `${done} / ${members.length}`, open: isOpen });
    if (!isOpen) continue;
    for (const view of members) {
      lines.push({ kind: "entry", view, icon: view.complete ? "done" : view.started ? "progress" : "empty" });
      if (!view.expanded) continue;
      for (const step of view.steps) lines.push({ kind: "step", step });
      lines.push({ kind: "track", view });
    }
  }
  return lines;
}

export function trackedGroups(views: ChainView[]): Set<AccessGroup> {
  const groups = new Set<AccessGroup>();
  for (const view of views) if (view.tracked) groups.add(view.group);
  return groups;
}

export function trackedText(n: number): string {
  return t(n > 1 ? "trackedMany" : "trackedOne").replace("{n}", String(n));
}

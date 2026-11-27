import { forFaction } from "../access/chains";
import { entryProgress, type AccessContext as ProgressContext } from "../access/progress";
import { currentLocale, t } from "../core/l10n";
import type { AccessEntry } from "../data/generated/access";
import type { QuestInfo } from "../data/questRepository";
import { questLabel } from "../game/engine";

export interface StepView {
  text: string;
  state: "done" | "current" | "todo";
}

export interface ChainView {
  id: string;
  name: string;
  range: string;
  fraction: number;
  expanded: boolean;
  tracked: boolean;
  count: string;
  steps: StepView[];
}

export interface AccessContext extends Omit<ProgressContext, "knownQuest"> {
  faction: "A" | "H";
  getQuest(id: number): QuestInfo | null;
  zoneName(areaId: number): string | null;
  expanded: string | null;
  tracked: string[];
}

function stepText(kind: string, ref: number, quest: QuestInfo | null): string {
  if (kind === "pickUp" || kind === "turnIn" || kind === "quest") return questLabel(ref, quest);
  return `${kind} ${ref}`;
}

export function accessView(entries: AccessEntry[], ctx: AccessContext): ChainView[] {
  const visible = entries.filter((entry) => forFaction(entry, ctx.faction));
  return visible.map((entry) => {
    const progress = entryProgress(entry, { ...ctx, knownQuest: (id) => ctx.getQuest(id) != null });
    const expanded = ctx.expanded === entry.id;
    const steps = (expanded ? progress.steps : []).map(({ step, state }): StepView => {
      const quest = ctx.getQuest(step.ref);
      const name = stepText(step.kind, step.ref, quest);
      const zone = state === "current" && quest?.zoneAreaId != null ? ctx.zoneName(quest.zoneAreaId) : null;
      return { text: zone == null ? name : `${name} · ${zone}`, state };
    });
    return {
      id: entry.id,
      name: entry.name[currentLocale()],
      range: entry.levels == null ? "" : `${entry.levels[0]}-${entry.levels[1]}`,
      fraction: progress.total > 0 ? progress.done / progress.total : 0,
      expanded,
      tracked: ctx.tracked.includes(entry.id),
      count: t("stepsCount").replace("{done}", String(progress.done)).replace("{total}", String(progress.total)),
      steps,
    };
  });
}

export function trackedText(n: number): string {
  return t(n > 1 ? "trackedMany" : "trackedOne").replace("{n}", String(n));
}

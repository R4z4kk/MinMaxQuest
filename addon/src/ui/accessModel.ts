import { resolveSteps, type AccessChainDef } from "../access/chains";
import { chainProgress } from "../access/progress";
import { currentLocale, t } from "../core/l10n";
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

export interface AccessContext {
  faction: "A" | "H";
  completed: Set<number>;
  inLog: Set<number>;
  getQuest(id: number): QuestInfo | null;
  zoneName(areaId: number): string | null;
  expanded: string | null;
  tracked: string[];
}

export function accessView(defs: AccessChainDef[], ctx: AccessContext): ChainView[] {
  return defs.map((def) => {
    const progress = chainProgress(resolveSteps(def, ctx.faction, (id) => ctx.getQuest(id)), ctx.completed, ctx.inLog);
    const steps = progress.steps.map(({ questId, state }): StepView => {
      const quest = ctx.getQuest(questId);
      const name = questLabel(questId, quest);
      const zone = state === "current" && quest?.zoneAreaId != null ? ctx.zoneName(quest.zoneAreaId) : null;
      return { text: zone == null ? name : `${name} · ${zone}`, state };
    });
    return {
      id: def.id,
      name: def.name[currentLocale()],
      range: `${def.levelRange[0]}-${def.levelRange[1]}`,
      fraction: progress.total > 0 ? progress.done / progress.total : 0,
      expanded: ctx.expanded === def.id,
      tracked: ctx.tracked.includes(def.id),
      count: t("stepsCount").replace("{done}", String(progress.done)).replace("{total}", String(progress.total)),
      steps,
    };
  });
}

export function trackedText(n: number): string {
  return t(n > 1 ? "trackedMany" : "trackedOne").replace("{n}", String(n));
}

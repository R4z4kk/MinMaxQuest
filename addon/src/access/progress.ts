import type { AccessEntry, AccessStep } from "../data/generated/access";
import { visibleSteps } from "./chains";

export interface AccessContext {
  level: number;
  raceMask: number;
  completed: Set<number>;
  inLog: Set<number>;
  itemCount(itemId: number): number;
  // Reputation earned from Neutral, null when the faction is unknown.
  repEarned(factionId: number): number | null;
  knownQuest(questId: number): boolean;
}

export type StepState = "done" | "current" | "todo";

export interface EntryProgress {
  steps: { step: AccessStep; state: StepState }[];
  done: number;
  total: number;
  complete: boolean;
}

function directlyDone(step: AccessStep, c: AccessContext): boolean {
  switch (step.kind) {
    case "pickUp":
      return c.knownQuest(step.ref) && (c.inLog.has(step.ref) || c.completed.has(step.ref));
    case "turnIn":
    case "quest":
      return c.knownQuest(step.ref) && c.completed.has(step.ref);
    case "item":
      return c.itemCount(step.ref) >= (step.count ?? 1);
    case "level":
      return c.level >= step.ref;
    case "rep": {
      const earned = c.repEarned(step.ref);
      return earned != null && earned >= (step.count ?? 0);
    }
    case "kill":
    case "interact":
    case "click":
    case "prof":
    case "end":
      return false;
  }
}

const FOLLOW_DONE: Record<AccessStep["kind"], boolean> = {
  pickUp: false, turnIn: false, quest: false, level: false, end: false,
  item: true, kill: true, interact: true, click: true, rep: true, prof: true,
};

function resolveDone(steps: AccessStep[], c: AccessContext): Set<number> {
  const done = new Set<number>();
  for (const step of steps) if (directlyDone(step, c)) done.add(step.id);
  let changed = true;
  while (changed) {
    changed = false;
    const add = (id: number): void => {
      if (!done.has(id)) {
        done.add(id);
        changed = true;
      }
    };
    for (const step of steps) {
      if (done.has(step.id)) continue;
      if (FOLLOW_DONE[step.kind] && steps.some((other) => done.has(other.id) && other.follows.includes(step.id))) {
        add(step.id);
      } else if (step.kind === "end") {
        const before = step.follows.filter((id) => steps.some((other) => other.id === id));
        const met = step.followsAny === true ? before.some((id) => done.has(id)) : before.every((id) => done.has(id));
        if (before.length > 0 && met) add(step.id);
      }
    }
    if (steps.some((s) => s.orGroup === true && !done.has(s.id) && steps.some((o) => o.orGroup === true && done.has(o.id)))) {
      for (const step of steps) if (step.orGroup === true) add(step.id);
    }
  }
  return done;
}

export function entryProgress(entry: AccessEntry, c: AccessContext): EntryProgress {
  const steps = visibleSteps(entry, c.raceMask);
  const done = resolveDone(steps, c);
  const ready = (step: AccessStep): boolean => {
    const before = step.follows.filter((id) => steps.some((other) => other.id === id));
    return step.followsAny === true && before.length > 0 ? before.some((id) => done.has(id)) : before.every((id) => done.has(id));
  };
  const pending = steps.filter((step) => !done.has(step.id) && step.optional !== true);
  const inLog = (step: AccessStep): boolean => (step.kind === "pickUp" || step.kind === "turnIn" || step.kind === "quest") && c.inLog.has(step.ref);
  const current = pending.find((step) => ready(step) && inLog(step)) ?? pending.find((step) => ready(step)) ?? pending[0];
  const counted = steps.filter((step) => step.optional !== true);
  const groups = counted.filter((step) => step.orGroup === true);
  const single = counted.filter((step) => step.orGroup !== true);
  const groupDone = groups.some((step) => done.has(step.id));
  const total = single.length + (groups.length > 0 ? 1 : 0);
  const doneCount = single.filter((step) => done.has(step.id)).length + (groupDone ? 1 : 0);
  const end = steps.find((step) => step.kind === "end");
  const last = end ?? counted[counted.length - 1];
  return {
    steps: steps.map((step) => ({ step, state: done.has(step.id) ? "done" : step === current ? "current" : "todo" })),
    done: doneCount,
    total,
    complete: last != null && done.has(last.id),
  };
}

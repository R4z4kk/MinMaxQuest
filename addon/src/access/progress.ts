export interface ChainProgress {
  steps: { questId: number; state: "done" | "current" | "todo" }[];
  done: number;
  total: number;
}

export function chainProgress(steps: number[], completed: Set<number>, inLog: Set<number>): ChainProgress {
  const pending = steps.filter((id) => !completed.has(id));
  const currentId = pending.find((id) => inLog.has(id)) ?? pending[0];
  const out: ChainProgress["steps"] = steps.map((questId) => ({
    questId,
    state: completed.has(questId) ? "done" : questId === currentId ? "current" : "todo",
  }));
  return { steps: out, done: steps.length - pending.length, total: steps.length };
}

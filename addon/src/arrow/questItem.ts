import type { QuestInfo } from "../data/questRepository";

export interface ItemDeps {
  count(itemId: number): number;
  usable(itemId: number): boolean;
}

function ready(itemId: number, deps: ItemDeps): boolean {
  return deps.count(itemId) > 0 && deps.usable(itemId);
}

export function questItemFor(q: QuestInfo | null, deps: ItemDeps): number | null {
  if (q == null) return null;
  if (q.sourceItemId != null && ready(q.sourceItemId, deps)) return q.sourceItemId;
  for (const itemId of q.requiredSourceItems) if (ready(itemId, deps)) return itemId;
  return null;
}

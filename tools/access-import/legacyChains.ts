import { walkChain } from "../../addon/src/access/chains";
import type { QuestInfo } from "../../addon/src/data/questRepository";

export interface AccessChainDef {
  id: string;
  name: { frFR: string; enUS: string };
  kind: "dungeon" | "raid" | "key";
  levelRange: [number, number];
  start: { A: number[]; H: number[] };
  explicitSteps?: { A: number[]; H: number[] };
}

export const ACCESS_CHAINS: AccessChainDef[] = [
  {
    id: "dalaran-sewers",
    name: { frFR: "Égouts de Dalaran", enUS: "Dalaran Sewers" },
    kind: "key",
    levelRange: [28, 33],
    start: { A: [92432], H: [92432] },
  },
];

export function resolveSteps(
  def: AccessChainDef,
  faction: "A" | "H",
  get: (id: number) => QuestInfo | null,
): number[] {
  if (def.explicitSteps != null) return def.explicitSteps[faction];
  return walkChain(def.start[faction], get);
}

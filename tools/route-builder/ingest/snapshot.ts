import { maskAllows } from "../../../addon/src/quests/availability";

export interface QuestieSnapshot {
  tag: string;
  contract: number;
  quests: Record<number, Record<string, unknown>>;
  npcs: Record<number, { spawns: unknown; rank: number | null; friendlyToFaction: string | null; minLevel: number | null; maxLevel: number | null; npcFlags: number | null }>;
  objects: Record<number, { spawns: unknown }>;
  items: Record<number, { npcDrops: number[]; objectDrops: number[] }>;
  questXp: Record<number, [number, number]>;
  areaIdToUiMapId: Record<number, number>;
  objectiveFirst: Record<string, Record<number, boolean>>;
  dropRates: Record<number, Record<number, number>>;
  dungeons: Record<number, { name: string; altAreaIds: number[]; parentZone: number; entrances: { areaId: number; x: number; y: number }[] }>;
  npcFlagValues: { innkeeper: number; flightMaster: number };
  raceMaskById: Record<number, number>;
}

const REQUIRED_CONTRACT_LABEL = "QuestieDB snapshot contract";
const HINT_KEYS = ["killCreditObjectiveFirst", "objectObjectiveFirst", "itemObjectiveFirst", "eventObjectiveFirst", "spellObjectiveFirst"] as const;

export function hasFlag(flags: number, bit: number): boolean {
  return bit !== 0 && maskAllows(bit, flags);
}

export function npcInfo(s: QuestieSnapshot, npcId: number): { minLevel: number; maxLevel: number; flags: number } | null {
  const npc = s.npcs[npcId];
  if (npc == null || npc.minLevel == null || npc.maxLevel == null) return null;
  return { minLevel: npc.minLevel, maxLevel: npc.maxLevel, flags: npc.npcFlags ?? 0 };
}

export function dropRate(s: QuestieSnapshot, itemId: number, npcId: number): number | null {
  const percent = s.dropRates[itemId]?.[npcId];
  return percent == null ? null : percent / 100;
}

function hints(s: QuestieSnapshot): LibQuestieDBApi["ObjectiveFirst"] {
  const out = {} as LibQuestieDBApi["ObjectiveFirst"];
  for (const key of HINT_KEYS) out[key] = s.objectiveFirst[key] ?? {};
  return out;
}

export function snapshotLib(s: QuestieSnapshot): LibQuestieDBApi {
  return {
    RequireContract: (required: number) =>
      (s.contract === required
        ? [true]
        : [false, `${REQUIRED_CONTRACT_LABEL} ${s.contract} (tag ${s.tag}) does not match required contract ${required}`]) as unknown as ReturnType<LibQuestieDBApi["RequireContract"]>,
    Enum: { raceMaskById: s.raceMaskById, classKeys: {} },
    Quest: {
      Get: (id, field) => s.quests[id]?.[field] ?? null,
      GetAllIds: () => Object.keys(s.quests).map(Number),
    },
    Npc: { Get: (id, field) => s.npcs[id]?.[field] ?? null },
    Item: { Get: (id, field) => s.items[id]?.[field] ?? null },
    Object: { Get: (id, field) => s.objects[id]?.[field] ?? null },
    ObjectiveFirst: hints(s),
    Support: {
      Get: ((name: string) =>
        name === "QuestXP" ? { db: s.questXp } : { private: { areaIdToUiMapId: s.areaIdToUiMapId } }) as LibQuestieDBApi["Support"]["Get"],
    },
  };
}

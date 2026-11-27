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

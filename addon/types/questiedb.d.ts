/// <reference types="typescript-to-lua/language-extensions" />

type QuestieDBIdMap<T> = { [id: number]: T };
type QuestieDBSpawnList = QuestieDBIdMap<[number, number, number?][]>;
type QuestieDBPair = [number, number];
// Lua source "return {...}" in QuestieDB Forever support/Forever/Zones/areaIdToUiMapId.lua; a table is accepted too.
type QuestieDBEncodedMap = string | QuestieDBIdMap<number>;
type QuestieDBZonePrivate = {
  areaIdToUiMapId: QuestieDBEncodedMap;
  areaIdToUiMapIdOverride: QuestieDBEncodedMap;
};
type QuestieDBObjectiveFirst = {
  killCreditObjectiveFirst: QuestieDBIdMap<boolean>;
  objectObjectiveFirst: QuestieDBIdMap<boolean>;
  itemObjectiveFirst: QuestieDBIdMap<boolean>;
  eventObjectiveFirst: QuestieDBIdMap<boolean>;
  spellObjectiveFirst: QuestieDBIdMap<boolean>;
};

interface LibQuestieDBApi {
  RequireContract(this: void, required: number): LuaMultiReturn<[boolean, string?]>;
  Enum: { raceMaskById: QuestieDBIdMap<number>; classKeys: { [token: string]: number } };
  Quest: {
    Get(this: void, id: number, field: string): unknown;
    GetAllIds(this: void): number[];
  };
  Npc: { Get(this: void, id: number, field: "spawns" | "rank" | "friendlyToFaction" | "name"): unknown };
  Item: { Get(this: void, id: number, field: "name" | "npcDrops" | "objectDrops"): unknown };
  Object: { Get(this: void, id: number, field: "spawns" | "name"): unknown };
  ObjectiveFirst: QuestieDBObjectiveFirst;
  Support: {
    Get(this: void, name: "QuestXP"): { db: QuestieDBIdMap<QuestieDBPair> };
    Get(this: void, name: "ZoneDB"): { private: QuestieDBZonePrivate };
  };
}

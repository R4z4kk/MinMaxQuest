/// <reference types="typescript-to-lua/language-extensions" />

type QuestieDBIdMap<T> = { [id: number]: T };
type QuestieDBSpawnList = QuestieDBIdMap<[number, number, number?][]>;
type QuestieDBPair = [number, number];
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
  Npc: { Get(this: void, id: number, field: "spawns" | "rank" | "friendlyToFaction"): unknown };
  Item: { Get(this: void, id: number, field: "npcDrops" | "objectDrops"): unknown };
  Object: { Get(this: void, id: number, field: "spawns"): unknown };
  ObjectiveFirst: QuestieDBObjectiveFirst;
  Support: {
    Get(this: void, name: "QuestXP"): { db: QuestieDBIdMap<QuestieDBPair> };
    Get(this: void, name: "ZoneDB"): { private: { areaIdToUiMapId: QuestieDBIdMap<number> } };
  };
}

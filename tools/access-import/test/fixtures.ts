import type { QuestieSnapshot } from "../../route-builder/ingest/snapshot";

export const ATTUNE_DATA = String.raw`
Attune_Data.attunes = {
  {ID="160",NAME=AttuneLang["Ragefire Chasm"],SHORT="RFC",GROUP=AttuneLang['DUNGEONS'],FACTION="Horde",DESC=AttuneLang["DungeonQuest_Desc"].."\n\n"..AttuneLang["Dal_Desc"],GROUPSIZE=5,LEVELS="13-18"},
  {ID="20",NAME=AttuneLang["Molten Core"],SHORT="MC",GROUP=AttuneLang['RAIDS'],FACTION="Both",GROUPSIZE=40},
  {ID="154",NAME=AttuneLang["Dalaran Sewer Key"],GROUP=AttuneLang['KEYS'],FACTION="Alliance"},
}
Attune_Data.steps = {
  {ID_ATTUNE="160",ID="10",TYPE="Level",STEP=AttuneLang["Reach level"].." 9",LOCATION="",ID_WOWHEAD="9",FOLLOWS="0",STAGE="10"},
  {ID_ATTUNE="160",ID="20",TYPE="Pick Up",STEP="",LOCATION=AttuneLang["Orgrimmar"],ID_WOWHEAD="5722",FOLLOWS="10",STAGE="20"},
  {ID_ATTUNE="160",ID="30",TYPE="Spacer",STEP="Spacer",LOCATION="",ID_WOWHEAD="",FOLLOWS="20",STAGE="30"},
  {ID_ATTUNE="160",ID="35",TYPE="Spacer",STEP="Spacer",LOCATION="",ID_WOWHEAD="",FOLLOWS="30",STAGE="35"},
  {ID_ATTUNE="160",ID="50",TYPE="Turn In",STEP="",LOCATION="",ID_WOWHEAD="5722",FOLLOWS="40&35",STAGE="50"},
  {ID_ATTUNE="160",ID="40",TYPE="Item",STEP="",LOCATION="",ID_WOWHEAD="14544",FOLLOWS="35",STAGE="40",COUNT=20},
  {ID_ATTUNE="160",ID="60",TYPE="Quest",STEP="",LOCATION="",ID_WOWHEAD="99999",FOLLOWS="5.0",STAGE="60",SIDE=true},
  {ID_ATTUNE="160",ID="70",TYPE="Kill",STEP="",LOCATION="",ID_WOWHEAD="11520",FOLLOWS="50",STAGE="60",NORACE="Scourge|Orc"},
  {ID_ATTUNE="160",ID="80",TYPE="Interact",STEP="",LOCATION="",ID_WOWHEAD="ambermill",FOLLOWS="70",STAGE="70"},
  {ID_ATTUNE="160",ID="85",TYPE="Click",STEP="",LOCATION="",ID_WOWHEAD="1",FOLLOWS="80",STAGE="75",FOLLOW=true},
  {ID_ATTUNE="160",ID="90",TYPE="End",STEP="Attuned",LOCATION="",ID_WOWHEAD="",FOLLOWS="85|60",STAGE="80"},
  {ID_ATTUNE="20",ID="10",TYPE="Rep",STEP="",LOCATION="749",ID_WOWHEAD="9000",FOLLOWS="0",STAGE="10",OR=true},
  {ID_ATTUNE="20",ID="15",TYPE="Attune",STEP=AttuneLang["Blackrock Depths"],LOCATION="",ID_WOWHEAD="120",FOLLOWS="10",STAGE="15"},
  {ID_ATTUNE="20",ID="20",TYPE="Prof",STEP="",LOCATION="",ID_WOWHEAD="0",FOLLOWS="15",STAGE="20"},
  {ID_ATTUNE="20",ID="30",TYPE="Pick Up",STEP="",LOCATION="",ID_WOWHEAD="7848",FOLLOWS="20&99",STAGE="30"},
  {ID_ATTUNE="154",ID="10",TYPE="Quest",STEP="",LOCATION="",ID_WOWHEAD="92432",FOLLOWS="0",STAGE="10"},
}
do
  local insertAt = #Attune_Data.attunes + 1
  table.insert(Attune_Data.attunes, insertAt, {ID="500",NAME=AttuneLang["Initiate"],GROUP=AttuneLang["CHARACTER"],FACTION="Both",LEVELS="20"})
  Attune_Data.steps[#Attune_Data.steps + 1] = {ID_ATTUNE="500",ID="20",TYPE="Stat",STEP="",LOCATION="",ID_WOWHEAD="1198",FOLLOWS="0",STAGE="10"}
end
`;

export const ATTUNE_EN = String.raw`
local Lang = LibStub("AceLocale-3.0"):NewLocale("Attune", "enUS", true, true)
if (not Lang) then
  return;
end
Lang["Ragefire Chasm"] = "Ragefire Chasm"
Lang["Molten Core"] = "Molten Core"
Lang["Dalaran Sewer Key"] = "Dalaran Sewer Key"
Lang["Initiate"] = "Initiate"
`;

export const ATTUNE_FR = String.raw`
local Lang = LibStub("AceLocale-3.0"):NewLocale("Attune", "frFR");
if (not Lang) then
  return;
end
Lang["Ragefire Chasm"] = "Gouffre de Ragefeu"
Lang["Dalaran Sewer Key"] = "Clé des égouts de Dalaran"
`;

export const ATTUNE_FILES = { data: ATTUNE_DATA, enUS: ATTUNE_EN, frFR: ATTUNE_FR };
export const RACE_MASKS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64, 8: 128, 95: 4294967296, 96: 8589934592 };

const HORDE_RACES = 2 + 16 + 32 + 128 + 8589934592;
const ALLIANCE_RACES = 1 + 4 + 8 + 64 + 4294967296;

function quest(name: string, zoneOrSort: number, requiredRaces: number, requiredClasses = 0, specialFlags = 0): Record<string, unknown> {
  return { name, zoneOrSort, requiredRaces, requiredClasses, specialFlags, nextQuestInChain: 0 };
}

export function snapshotFixture(): QuestieSnapshot {
  return {
    tag: "v-test",
    contract: 4,
    quests: {
      5722: quest("Searching for the Lost Satchel", 2437, HORDE_RACES),
      5761: quest("Slaying the Beast", 2437, HORDE_RACES),
      5728: quest("Hidden Enemies", 2437, HORDE_RACES, 1),
      5723: quest("Alliance Intruder", 2437, ALLIANCE_RACES),
      5800: quest("Repeatable Satchel", 2437, HORDE_RACES, 0, 1),
      5801: quest("Festival Satchel", 2437, HORDE_RACES, 0, 2),
      7848: quest("Attunement to the Core", 2717, 0),
      914: quest("Leaders of the Fang", 10021, 0),
      92432: { ...quest("An Alarming Request", 36, ALLIANCE_RACES), nextQuestInChain: 92458 },
      92458: quest("Heart of Disruption", 16544, ALLIANCE_RACES),
    },
    npcs: {},
    objects: {},
    items: { 14544: { name: "Lieutenant's Insignia", class: 12, npcDrops: [], objectDrops: [] } },
    questXp: {},
    areaIdToUiMapId: {},
    objectiveFirst: {},
    dropRates: {},
    dungeons: {
      2437: { name: "Ragefire Chasm", altAreaIds: [], parentZone: 1637, entrances: [] },
      719: { name: "Blackfathom Deeps", altAreaIds: [10021], parentZone: 331, entrances: [] },
      206: { name: "Utgarde Keep", altAreaIds: [], parentZone: 495, entrances: [] },
      2717: { name: "Molten Core", altAreaIds: [], parentZone: 46, entrances: [] },
    },
    npcFlagValues: { innkeeper: 65536, flightMaster: 8192, auctioneer: 4096 },
    raceMaskById: RACE_MASKS,
  };
}

export const INSTANCE_TYPES = new Map<number, number>([
  [2437, 1],
  [719, 1],
  [206, 1],
  [2717, 2],
]);

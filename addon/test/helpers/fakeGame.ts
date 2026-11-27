import { readFileSync } from "node:fs";
import { createLuaWithWowStubs } from "./wowStubs";

export const GAME_FAKES = `
math.atan2 = math.atan2 or math.atan
printed = {}
print = function(line) table.insert(printed, line) end
calls = {}
created = 0
scripts = {}
local VALUES = { GetStringWidth = 40, GetLeft = 100, GetTop = 700, GetFrameLevel = 1 }
local function fake(name)
  name = name or "anon"
  local shown = true
  return setmetatable({}, {
    __index = function(t, method)
      if method == "SetScript" then
        return function(self, event, fn) scripts[name .. "." .. event] = fn end
      end
      if method == "CreateTexture" then return function() created = created + 1; return fake("texture") end end
      if method == "CreateFontString" then return function() created = created + 1; return fake("font") end end
      if method == "IsShown" or method == "IsVisible" then return function() return shown end end
      if VALUES[method] ~= nil then return function() return VALUES[method] end end
      return function(self, ...)
        if method == "Show" then shown = true elseif method == "Hide" then shown = false end
        local parts = { name, method }
        for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
        calls[#calls + 1] = table.concat(parts, "|")
      end
    end,
  })
end
CreateFrame = function(kind, name) created = created + 1; return fake(name) end
UIParent = {}
GetLocale = function() return "enUS" end
MinMaxQuestCharDB = {}
now = 100
GetTime = function() return now end
player = { 1000, 2000 }
UnitPosition = function() return player[1], player[2], 0, 0 end
GetPlayerFacing = function() return 0 end
UnitLevel = function() return 10 end
raceCalls = 0
UnitRace = function() raceCalls = raceCalls + 1; return "Human", "Human", 1 end
UnitClass = function() return "Warrior", "WARRIOR", 1 end
UnitFactionGroup = function() return "Alliance", "Alliance" end
GetMaxPlayerLevel = function() return 60 end
C_Container = { GetItemCooldown = function() return 0, 0, 1 end }
logQuests = {}
objectives = {}
C_QuestLog = {
  GetAllCompletedQuestIDs = function() return {} end,
  GetNumQuestLogEntries = function() return #logQuests, #logQuests end,
  GetInfo = function(i) return { questID = logQuests[i], isHeader = false } end,
  GetQuestObjectives = function(id) return objectives[id] end,
  IsComplete = function() return false end,
  GetTrivialRange = function() return 5 end,
}
CreateVector2D = function(x, y) return { x = x, y = y } end
C_Map = {
  GetWorldPosFromMapPos = function(map, v) return 0, { x = 1000 + v.x * 100, y = 2000 + v.y * 100 } end,
}
C_Timer = { NewTicker = function(seconds, fn) ticker = fn end }
quests = {
  [100] = { name = "Test Quest", questLevel = 10, requiredLevel = 1, startedBy = { { 500 } } },
  [101] = { name = "Second", questLevel = 10, requiredLevel = 1, startedBy = { { 501 } } },
  [102] = { name = "Later", questLevel = 11, requiredLevel = 11, startedBy = { { 501 } } },
}
spawns = { [500] = { [12] = { { 10, 20 } } }, [501] = { [12] = { { 90, 90 } } } }
LibQuestieDB = {
  RequireContract = function() return true end,
  Enum = { raceMaskById = { [1] = 1 }, classKeys = { WARRIOR = 1 } },
  Quest = {
    GetAllIds = function() return { 100, 101, 102 } end,
    Get = function(id, field) return quests[id] and quests[id][field] end,
  },
  Npc = { Get = function(id, field) if field == "spawns" then return spawns[id] end end },
  Object = { Get = function() end },
  Item = { Get = function() end },
  Support = {
    Get = function(name)
      if name == "QuestXP" then return { db = {} } end
      return { private = { areaIdToUiMapId = { [12] = 1429 } } }
    end,
  },
}
`;

export async function session(setup = "") {
  const lua = await createLuaWithWowStubs();
  await lua.doString(GAME_FAKES + setup);
  await lua.doString(readFileSync("build/MinMaxQuest.lua", "utf8"));
  return {
    cmd: (command: string) => lua.doString(`SlashCmdList.MMQ("${command}")`),
    tick: () => lua.doString("ticker()"),
    event: (args: string) => lua.doString(`scripts["MinMaxQuestEvents.OnEvent"](nil, ${args})`),
    run: (code: string) => lua.doString(code),
    printed: async () => {
      const out = (await lua.doString(`local s = table.concat(printed, "\\n"); printed = {}; return s`)) as string;
      return out;
    },
    calls: async () => ((await lua.doString(`return table.concat(calls, ";")`)) as string).split(";"),
    clearCalls: () => lua.doString("calls = {}"),
    close: () => lua.global.close(),
  };
}

export async function loggedIn(setup = "") {
  const s = await session(setup);
  await s.event(`"PLAYER_LOGIN"`);
  await s.event(`"PLAYER_ENTERING_WORLD"`);
  await s.tick();
  return s;
}

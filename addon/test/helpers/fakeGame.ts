import { readFileSync } from "node:fs";
import { createLuaWithWowStubs } from "./wowStubs";

export const GAME_FAKES = `
math.atan2 = math.atan2 or math.atan
printed = {}
routeNotices = {}
print = function(line)
  if string.find(line, "Route data missing", 1, true) then table.insert(routeNotices, line) else table.insert(printed, line) end
end
calls = {}
created = 0
scripts = {}
local VALUES = { GetStringWidth = 40, GetLeft = 100, GetTop = 700, GetRight = 156, GetFrameLevel = 1 }
-- Layout state is kept per object. Set CHAR_WIDTH to a number to size GetStringWidth by text length
-- (colour codes dropped, a |T..|t icon counts as two characters); otherwise it stays 40.
CHAR_WIDTH = false
layout = {}
function textWidth(text)
  text = string.gsub(text, "|c%x%x%x%x%x%x%x%x", "")
  text = string.gsub(text, "|r", "")
  text = string.gsub(text, "|T.-|t", "ii")
  text = string.gsub(text, "[\\128-\\191]", "")
  return #text * CHAR_WIDTH
end
local function fake(name)
  name = name or "anon"
  local shown = true
  local rec = { name = name, points = {}, text = "", shown = true }
  layout[#layout + 1] = rec
  return setmetatable({}, {
    __index = function(t, method)
      if method == "__rec" then return rec end
      if method == "GetWidth" then return function() return rec.width end end
      if method == "GetStringWidth" and type(CHAR_WIDTH) == "number" then return function() return textWidth(rec.text) end end
      if method == "SetScript" then
        return function(self, event, fn) scripts[name .. "." .. event] = fn end
      end
      if method == "CreateTexture" then return function() created = created + 1; local child = fake("texture"); child.__rec.parent = name; return child end end
      if method == "CreateFontString" then return function() created = created + 1; local child = fake("font"); child.__rec.parent = name; return child end end
      if method == "IsShown" or method == "IsVisible" then return function() return shown end end
      if VALUES[method] ~= nil then return function() return VALUES[method] end end
      return function(self, ...)
        if method == "Show" then shown = true elseif method == "Hide" then shown = false end
        if method == "Show" or method == "Hide" then rec.shown = shown end
        if method == "SetText" then rec.text = (...) or ""
        elseif method == "SetColorTexture" then rec.colored = true
        elseif method == "SetWidth" then rec.width = (...)
        elseif method == "ClearAllPoints" then rec.points = {}
        elseif method == "SetPoint" then local point, rel, relPoint, x = ...; rec.points[#rec.points + 1] = { point, rel, relPoint, x } end
        local parts = { name, method }
        for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
        calls[#calls + 1] = table.concat(parts, "|")
      end
    end,
  })
end
-- Number of shown outline edges and grip glyphs under the named frame.
function shownOutline(parent)
  local n = 0
  for _, r in ipairs(layout) do
    if r.parent == parent and (r.colored or r.text == "::") and r.shown then n = n + 1 end
  end
  return n
end
templates = {}
CreateFrame = function(kind, name, parent, template)
  created = created + 1
  if name ~= nil then templates[name] = template or false end
  return fake(name)
end
UIParent = {}
GetLocale = function() return "enUS" end
MinMaxQuestDB = {}
MinMaxQuestCharDB = {}
reloads = 0
ReloadUI = function() reloads = reloads + 1 end
-- No route file installed: quest mode falls back to completion. QUEST_MODE loads the real one.
MinMaxQuestRoutes = false
now = 100
GetTime = function() return now end
profileMs = 0
debugprofilestop = function() return profileMs end
onTaxi = false
UnitOnTaxi = function() return onTaxi end
UnitIsDeadOrGhost = function() return false end
UnitIsGhost = function() return false end
hearthCount = 1
-- Bag counts and item spells by item id; the hearthstone count stays hearthCount.
bags = {}
itemSpells = {}
C_Item = {
  GetItemCount = function(id) if id == 6948 then return hearthCount end return bags[id] or 0 end,
  GetItemSpell = function(id) if itemSpells[id] then return itemSpells[id], 1 end end,
  GetItemIconByID = function(id) return 1000 + id end,
}
-- Earned reputation by faction id; unknown factions return nothing.
reps = {}
C_Reputation = { GetFactionDataByID = function(id) if reps[id] then return { name = "F" .. id, currentStanding = reps[id] } end end }
GetFactionInfoByID = function() end
player = { 1000, 2000 }
UnitPosition = function() return player[1], player[2], 0, 0 end
GetPlayerFacing = function() return 0 end
UnitLevel = function() return 10 end
UnitXP = function() return 0 end
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
QuestLog_Update = function() end
QuestLogTitle1 = fake("QuestLogTitle1")
QuestLogTitle1.GetID = function() return 1 end
QUESTS_DISPLAYED = 1
hooksecurefunc = function() end
inCombat = false
InCombatLockdown = function() return inCombat end
GameTooltip = fake("GameTooltip")
FauxScrollFrame_GetOffset = function() return 0 end
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
zonePrivate = {
  areaIdToUiMapId = "return { [12] = 1429, [14] = 1 }",
  areaIdToUiMapIdOverride = "return { [0] = 0, [14] = 1411 }",
}
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
  ObjectiveFirst = { killCreditObjectiveFirst = {}, objectObjectiveFirst = {}, itemObjectiveFirst = {}, eventObjectiveFirst = {}, spellObjectiveFirst = {} },
  Support = {
    Get = function(name)
      if name == "QuestXP" then return { db = {} } end
      return { private = zonePrivate }
    end,
  },
}
`;

// Level 1 human in quest mode with the real Alliance routes; only the first Elwynn quest and the one unlocking it exist in the fake QuestieDB.
export const QUEST_MODE = `${readFileSync("data/routes/Alliance.lua", "utf8")}
UnitLevel = function() return 1 end
quests[33] = { name = "Wolves Across the Border", questLevel = 2, requiredLevel = 1, startedBy = { { 196 } } }
quests[5261] = { name = "Eagan Peltskinner", questLevel = 1, requiredLevel = 1, startedBy = { { 196 } } }
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

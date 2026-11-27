import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createLuaWithWowStubs } from "./helpers/wowStubs";

const FAKES = `
math.atan2 = math.atan2 or math.atan
printed = {}
print = function(line) table.insert(printed, line) end
calls = {}
scripts = {}
local function fake(name)
  return setmetatable({}, {
    __index = function(t, method)
      if method == "SetScript" then
        return function(self, event, fn) scripts[name .. "." .. event] = fn end
      end
      if method == "CreateTexture" then return function() return fake("texture") end end
      if method == "CreateFontString" then return function() return fake("font") end end
      return function(self, ...)
        local parts = { name, method }
        for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
        calls[#calls + 1] = table.concat(parts, "|")
      end
    end,
  })
end
CreateFrame = function(kind, name) return fake(name) end
UIParent = {}
GetLocale = function() return "enUS" end
MinMaxQuestCharDB = {}
now = 100
GetTime = function() return now end
player = { 1000, 2000 }
UnitPosition = function() return player[1], player[2], 0, 0 end
GetPlayerFacing = function() return 0 end
UnitLevel = function() return 10 end
UnitRace = function() return "Human", "Human", 1 end
UnitClass = function() return "Warrior", "WARRIOR", 1 end
UnitFactionGroup = function() return "Alliance", "Alliance" end
GetMaxPlayerLevel = function() return 60 end
C_Container = { GetItemCooldown = function() return 0, 0, 1 end }
C_QuestLog = {
  GetAllCompletedQuestIDs = function() return {} end,
  GetNumQuestLogEntries = function() return 0, 0 end,
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
}
spawns = { [500] = { [12] = { { 10, 20 } } }, [501] = { [12] = { { 90, 90 } } } }
LibQuestieDB = {
  RequireContract = function() return true end,
  Enum = { raceMaskById = { [1] = 1 }, classKeys = { WARRIOR = 1 } },
  Quest = {
    GetAllIds = function() return { 100, 101 } end,
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

async function session() {
  const lua = await createLuaWithWowStubs();
  await lua.doString(FAKES);
  await lua.doString(readFileSync("build/MinMaxQuest.lua", "utf8"));
  return {
    cmd: (command: string) => lua.doString(`SlashCmdList.MMQ("${command}")`),
    event: (args: string) => lua.doString(`scripts["MinMaxQuestEvents.OnEvent"](nil, ${args})`),
    run: (code: string) => lua.doString(code),
    printed: async () => {
      const out = (await lua.doString(`local s = table.concat(printed, "\\n"); printed = {}; return s`)) as string;
      return out;
    },
    calls: async () => ((await lua.doString(`return table.concat(calls, ";")`)) as string).split(";"),
    close: () => lua.global.close(),
  };
}

async function loggedIn() {
  const s = await session();
  await s.event(`"PLAYER_LOGIN"`);
  await s.event(`"PLAYER_ENTERING_WORLD"`);
  return s;
}

it("lists targets after login and points the arrow at the nearest", async () => {
  const s = await loggedIn();
  try {
    await s.cmd("targets");
    expect(await s.printed()).toBe(
      "MinMaxQuest: [100] Test Quest · pick up · <1 min\nMinMaxQuest: [101] Second · pick up · <1 min",
    );
    expect(await s.calls()).toContain("font|SetText|Test Quest · pick up");
    expect(await s.run("return ticker ~= nil")).toBe(true);
  } finally {
    s.close();
  }
});

it("skips, pins and unpins through slash commands", async () => {
  const s = await loggedIn();
  try {
    await s.cmd("pin 101");
    await s.cmd("targets");
    await s.printed();
    expect(await s.calls()).toContain("font|SetText|Second · pick up");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId")).toBe(101);
    await s.cmd("unpin");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
    await s.cmd("skip");
    expect(await s.printed()).toContain("[100] Test Quest");
    expect(await s.run("return MinMaxQuestCharDB.skippedQuests[1]")).toBe(100);
    await s.cmd("targets");
    expect(await s.printed()).toBe("MinMaxQuest: [101] Second · pick up · <1 min");
  } finally {
    s.close();
  }
});

it("records the hearth landing position after a hearthstone cast", async () => {
  const s = await loggedIn();
  try {
    await s.event(`"UNIT_SPELLCAST_SUCCEEDED", "player", "guid", 8690`);
    await s.run("player = { 5000, 6000 }; now = 110");
    await s.event(`"PLAYER_ENTERING_WORLD"`);
    expect(await s.run("local h = MinMaxQuestCharDB.hearthPos; return { h.continent, h.x, h.y }")).toEqual([0, 5000, 6000]);
  } finally {
    s.close();
  }
});

it("prints the resolved chain", async () => {
  const s = await session();
  try {
    await s.run("quests[100].nextQuestInChain = 101");
    await s.cmd("chain 100");
    expect(await s.printed()).toBe("MinMaxQuest: [100] Test Quest > [101] Second");
  } finally {
    s.close();
  }
});

it("prints help for a bare command and keeps the quest lookup", async () => {
  const s = await session();
  try {
    await s.cmd("");
    expect(await s.printed()).toContain("targets | skip [confirm] | pin <id>");
    await s.cmd("q 100");
    expect(await s.printed()).toBe("MinMaxQuest: [100] Test Quest level 10, 0 objective(s)");
  } finally {
    s.close();
  }
});

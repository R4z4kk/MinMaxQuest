import { expect, it } from "vitest";
import { loggedIn } from "./helpers/fakeGame";

const PIN_FAKES = `
log = {}
ids = {}
idCount = 0
local function num(v) return string.format("%g", v) end
local function idOf(icon)
  if ids[icon] == nil then idCount = idCount + 1; ids[icon] = idCount end
  return ids[icon]
end
local lib = {}
function lib.AddWorldMapIconWorld(self, ref, icon, inst, x, y, flag)
  log[#log + 1] = table.concat({ "world", idOf(icon), inst, num(x), num(y), flag }, "|")
  return true
end
function lib.AddMinimapIconWorld(self, ref, icon, inst, x, y, edge)
  log[#log + 1] = table.concat({ "mini", idOf(icon), inst, num(x), num(y), tostring(edge) }, "|")
  return true
end
function lib.RemoveWorldMapIcon(self, ref, icon) log[#log + 1] = "unworld|" .. idOf(icon) end
function lib.RemoveMinimapIcon(self, ref, icon) log[#log + 1] = "unmini|" .. idOf(icon) end
local baseStub = LibStub
LibStub = function(name, silent)
  if name == "HereBeDragons-Pins-2.0" then return lib end
  return baseStub(name, silent)
end

UISpecialFrames = {}
Enum = { UIMapType = { Continent = 2 } }
GetBuildInfo = function() return "1.60.1", "71139", "Nov 1 2026", 16001 end
date = function() return "2026-11-27" end

tips = {}
GameTooltip = {
  SetOwner = function(self, owner, anchor) tips[#tips + 1] = "owner|" .. anchor end,
  SetText = function(self, text) tips[#tips + 1] = "text|" .. text end,
  AddLine = function(self, text) tips[#tips + 1] = "line|" .. text end,
  Show = function() tips[#tips + 1] = "show" end,
  Hide = function() tips[#tips + 1] = "hide" end,
}

way = {}
C_Map.GetMapPosFromWorldPos = function(continent, vec) return 1429, { x = 0.25, y = 0.75 } end
C_Map.CanSetUserWaypointOnMap = function() return true end
C_Map.SetUserWaypoint = function(point) way[#way + 1] = "set|" .. point.map .. "|" .. point.x .. "|" .. point.y end
C_Map.ClearUserWaypoint = function() way[#way + 1] = "clear" end
UiMapPoint = { CreateFromCoordinates = function(map, x, y) return { map = map, x = x, y = y } end }
C_SuperTrack = { SetSuperTrackedUserWaypoint = function(on) way[#way + 1] = "track|" .. tostring(on) end }
`;

async function pins(setup = "") {
  const s = await loggedIn(PIN_FAKES + setup);
  const list = async (name: string) => ((await s.run(`return table.concat(${name}, ";")`)) as string).split(";").filter((l) => l !== "");
  const refresh = async (code = "") => {
    await s.run(`now = now + 10; ${code}`);
    await s.tick();
  };
  return { ...s, list, refresh };
}

it("places current and next on the world map with swapped world coordinates and the current on the minimap", async () => {
  const s = await pins();
  try {
    expect(await s.list("log")).toEqual([
      "world|1|0|2020|1010|3",
      "mini|2|0|2020|1010|true",
      "world|3|0|2090|1090|3",
    ]);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("reuses the pin frames, re-places them on change and skips unchanged refreshes", async () => {
  const s = await pins();
  try {
    await s.run("log = {}");
    await s.refresh();
    expect(await s.list("log")).toEqual([]);
    await s.refresh("player = { 1090, 2090 }");
    const placed = await s.list("log");
    expect(placed).toEqual([
      "world|1|0|2090|1090|3",
      "mini|2|0|2090|1090|true",
      "world|3|0|2020|1010|3",
    ]);
    expect(await s.run("return idCount")).toBe(3);
    const creations = (await s.calls()).filter((c) => c.endsWith("|SetSize|12|12"));
    expect(creations).toHaveLength(3);
  } finally {
    s.close();
  }
});

it("removes the pins when no target is left", async () => {
  const s = await pins();
  try {
    await s.run("log = {}");
    await s.run("MinMaxQuestCharDB.skippedQuests = { 100, 101 }");
    await s.event(`"QUEST_ACCEPTED"`);
    await s.tick();
    expect(await s.list("log")).toEqual(["unworld|1", "unmini|2", "unworld|3"]);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

const OBJECTIVE_QUEST = `
quests[101].objectives = { { { 600, "Wolf", 1 } } }
spawns[600] = { [12] = { { 10, 10 }, { 90, 90 } } }
logQuests = { 101 }
objectives[101] = { { finished = false } }
`;

it("shows the quest label and the number of other spots in the tooltip", async () => {
  const s = await pins(OBJECTIVE_QUEST);
  try {
    await s.cmd("pin 101");
    await s.run(`scripts["MinMaxQuestPin1.OnEnter"](nil)`);
    const tips = await s.list("tips");
    expect(tips[0]).toBe("owner|ANCHOR_RIGHT");
    expect(tips[1]).toMatch(/^text\|Second/);
    expect(tips[2]).toBe("line|+1 other spots");
    expect(tips[3]).toBe("show");
    await s.run(`scripts["MinMaxQuestPin1.OnLeave"](nil)`);
    expect((await s.list("tips")).pop()).toBe("hide");
  } finally {
    s.close();
  }
});

it("adds no extra tooltip line for a single spot", async () => {
  const s = await pins();
  try {
    await s.run(`scripts["MinMaxQuestPin1.OnEnter"](nil)`);
    expect((await s.list("tips")).filter((l) => l.startsWith("line|"))).toEqual([]);
  } finally {
    s.close();
  }
});

it("sets the Blizzard waypoint for the current target once", async () => {
  const s = await pins();
  try {
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true"]);
    await s.refresh();
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true"]);
  } finally {
    s.close();
  }
});

it("clears the Blizzard waypoint when the option is turned off", async () => {
  const s = await pins();
  try {
    await s.cmd("");
    await s.run(`scripts["MinMaxQuestNativeWaypoint.OnClick"](nil, "LeftButton")`);
    expect(await s.run("return MinMaxQuestCharDB.nativeWaypoint")).toBe(false);
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true", "clear"]);
    await s.refresh();
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true", "clear"]);
  } finally {
    s.close();
  }
});

const LIVE_WAYPOINT = `
live = false
C_Map.HasUserWaypoint = function() return live ~= false end
C_Map.GetUserWaypoint = function() return live or nil end
C_Map.SetUserWaypoint = function(point)
  way[#way + 1] = "set|" .. point.map .. "|" .. point.x .. "|" .. point.y
  live = { uiMapID = point.map, position = { x = point.x, y = point.y } }
end
C_Map.ClearUserWaypoint = function() way[#way + 1] = "clear"; live = false end
`;

it("does not clear a waypoint the user set after ours", async () => {
  const s = await pins(LIVE_WAYPOINT);
  try {
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true"]);
    await s.refresh("live = { uiMapID = 1429, position = { x = 0.9, y = 0.9 } }; MinMaxQuestCharDB.nativeWaypoint = false");
    await s.cmd("");
    await s.run(`scripts["MinMaxQuestNativeWaypoint.OnClick"](nil, "LeftButton")`);
    await s.run(`scripts["MinMaxQuestNativeWaypoint.OnClick"](nil, "LeftButton")`);
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true"]);
    expect(await s.run("return live.position.x")).toBe(0.9);
  } finally {
    s.close();
  }
});

it("clears the waypoint when it is still ours", async () => {
  const s = await pins(LIVE_WAYPOINT);
  try {
    await s.cmd("");
    await s.run(`scripts["MinMaxQuestNativeWaypoint.OnClick"](nil, "LeftButton")`);
    expect(await s.list("way")).toEqual(["set|1429|0.25|0.75", "track|true", "clear"]);
  } finally {
    s.close();
  }
});

it("does not overwrite a waypoint the user already set", async () => {
  const s = await pins(`${LIVE_WAYPOINT}
    live = { uiMapID = 1429, position = { x = 0.9, y = 0.9 } }
  `);
  try {
    await s.refresh();
    expect(await s.list("way")).toEqual([]);
    expect(await s.run("return live.position.x")).toBe(0.9);
  } finally {
    s.close();
  }
});

it("sets no Blizzard waypoint when the option starts off", async () => {
  const s = await pins("MinMaxQuestCharDB.nativeWaypoint = false");
  try {
    await s.refresh();
    expect(await s.list("way")).toEqual([]);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("clears the Blizzard waypoint when the map does not allow one", async () => {
  const s = await pins("C_Map.CanSetUserWaypointOnMap = function() return false end");
  try {
    await s.refresh();
    expect(await s.list("way")).toEqual([]);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("skips the Blizzard waypoint silently when the target is on another continent or the API is missing", async () => {
  const other = await pins("UnitPosition = function() return 1000, 2000, 0, 1 end");
  try {
    await other.refresh();
    expect(await other.list("way")).toEqual([]);
    expect(await other.printed()).toBe("");
  } finally {
    other.close();
  }
  const missing = await pins("C_Map.SetUserWaypoint = nil");
  try {
    await missing.refresh();
    expect(await missing.list("way")).toEqual([]);
    expect(await missing.printed()).toBe("");
  } finally {
    missing.close();
  }
});

it("reports once and disables itself when HereBeDragons is missing", async () => {
  const s = await loggedIn(PIN_FAKES + "LibStub = function() return nil end");
  try {
    await s.run("now = now + 10");
    await s.tick();
    const printed = await s.printed();
    expect(printed.split("\n")).toHaveLength(1);
    expect(printed).toContain("MinMaxQuest: mapPins disabled");
  } finally {
    s.close();
  }
});

it("falls back to the player's map when the world position has no map of its own", async () => {
  const s = await pins(`
    C_Map.GetBestMapForUnit = function() return 1429 end
    C_Map.GetMapPosFromWorldPos = function(continent, vec, override)
      if override == nil then return nil end
      return 1429, { x = 0.5, y = 0.5 }
    end
  `);
  try {
    await s.refresh();
    expect(await s.list("way")).toEqual(["set|1429|0.5|0.5", "track|true"]);
  } finally {
    s.close();
  }
});

it("moves the objective pin to the current waypoint as the player advances", async () => {
  const s = await pins(OBJECTIVE_QUEST);
  try {
    await s.cmd("pin 101");
    const placed = (await s.list("log")).filter((l) => l.startsWith("world|1|"));
    expect(placed).toEqual(["world|1|0|2010|1010|3", "world|1|0|2090|1090|3"]);
    await s.run("log = {}");
    await s.refresh("player = { 1090, 2090 }");
    expect((await s.list("log")).filter((l) => l.startsWith("world|1|"))).toEqual(["world|1|0|2010|1010|3"]);
  } finally {
    s.close();
  }
});

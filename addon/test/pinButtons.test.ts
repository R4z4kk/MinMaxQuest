import { expect, it } from "vitest";
import { loggedIn } from "./helpers/fakeGame";

const LOG = `
questLog = { [1] = { questID = 100, isHeader = false }, [2] = { questID = 0, isHeader = true }, [3] = { questID = 101, isHeader = false } }
logQuests = { 100, 101 }
offset = 0
QUESTS_DISPLAYED = 3
inCombat = false
hooks = {}
pins = {}
waiters = {}
tooltip = nil
GameTooltip = { SetOwner = function() end, SetText = function(_, text) tooltip = text end, Show = function() end, Hide = function() end }
QuestLogListScrollFrame = {}
InCombatLockdown = function() return inCombat end
FauxScrollFrame_GetOffset = function() return offset end
hooksecurefunc = function(name, fn) hooks[name] = fn end
C_QuestLog.GetInfo = function(i) return questLog[i] end
local function title(id)
  local f = { shown = true }
  f.GetID = function() return id end
  f.IsShown = function() return f.shown end
  f.GetFrameLevel = function() return 1 end
  return f
end
QuestLogTitle1, QuestLogTitle2, QuestLogTitle3 = title(1), title(2), title(3)
local noop = function() end
local function pinFake(id)
  local tex = { alpha = nil }
  tex.SetColorTexture = function(_, r, g, b, a) tex.alpha = a end
  setmetatable(tex, { __index = function() return noop end })
  local p = { shown = false, scripts = {}, tex = tex }
  p.Show = function() p.shown = true end
  p.Hide = function() p.shown = false end
  p.SetScript = function(_, event, fn) p.scripts[event] = fn end
  p.CreateTexture = function() return tex end
  setmetatable(p, { __index = function() return noop end })
  return p
end
local base = CreateFrame
CreateFrame = function(kind, name, parent)
  if kind == "Button" and parent and rawget(parent, "GetID") then
    local p = pinFake(parent.GetID())
    pins[parent.GetID()] = p
    return p
  end
  local f = base(kind, name, parent)
  if kind == "Frame" and name == nil then
    local w = { scripts = {}, events = {} }
    w.RegisterEvent = function(_, e) w.events[e] = true end
    w.UnregisterEvent = function(_, e) w.events[e] = nil end
    waiters[#waiters + 1] = w
    w.SetScript = function(_, event, fn) w.scripts[event] = fn end
    setmetatable(w, { __index = function(_, k) return function(_, ...) return f[k](f, ...) end end })
    return w
  end
  return f
end
`;

const UI_FAKES = `
quests[100].zoneOrSort = 12
quests[101].zoneOrSort = 12
UISpecialFrames = {}
Enum = { UIMapType = { Continent = 2 } }
C_Map.GetAreaInfo = function(id) if id == 12 then return "Elwynn Forest" end end
C_Map.GetBestMapForUnit = function() return 1429 end
C_Map.GetMapInfo = function() return nil end
GetBuildInfo = function() return "1.60.1", "71139", "Nov 1 2026", 16001 end
date = function() return "2026-11-27" end
`;

const shown = (s: { run(code: string): Promise<unknown> }, id: number) => s.run(`return pins[${id}].shown`);
const alpha = (s: { run(code: string): Promise<unknown> }, id: number) => s.run(`return pins[${id}].tex.alpha`);

it("creates one pin per title line and hides the pin on headers", async () => {
  const s = await loggedIn(LOG);
  try {
    expect(await s.run("return #pins")).toBe(3);
    expect(await shown(s, 1)).toBe(true);
    expect(await shown(s, 2)).toBe(false);
    expect(await shown(s, 3)).toBe(true);
    expect(await alpha(s, 1)).toBe(0.35);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("pins on click, unpins on second click and restyles through engine changes", async () => {
  const s = await loggedIn(LOG);
  try {
    await s.run("pins[1].scripts.OnClick()");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId")).toBe(100);
    expect(await alpha(s, 1)).toBe(1);
    expect(await alpha(s, 3)).toBe(0.35);
    await s.run("pins[3].scripts.OnClick()");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId")).toBe(101);
    expect(await alpha(s, 1)).toBe(0.35);
    expect(await alpha(s, 3)).toBe(1);
    await s.run("pins[3].scripts.OnClick()");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
    expect(await alpha(s, 3)).toBe(0.35);
    await s.run("pins[2].scripts.OnClick()");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("follows the scroll offset and hidden lines on QuestLog_Update", async () => {
  const s = await loggedIn(LOG);
  try {
    await s.run("offset = 1; hooks.QuestLog_Update()");
    expect(await shown(s, 1)).toBe(false);
    expect(await shown(s, 2)).toBe(true);
    expect(await s.run("questLog[4] = { questID = 102, isHeader = false }; offset = 1; hooks.QuestLog_Update(); pins[3].scripts.OnClick(); return MinMaxQuestCharDB.pinnedQuestId")).toBe(102);
    await s.run("QuestLogTitle2.shown = false; hooks.QuestLog_Update()");
    expect(await shown(s, 2)).toBe(false);
  } finally {
    s.close();
  }
});

it("defers creation to PLAYER_REGEN_ENABLED while in combat and unregisters it", async () => {
  const s = await loggedIn("inCombat = true;" + LOG.replace("inCombat = false", ""));
  try {
    expect(await s.run("return #pins")).toBe(0);
    expect(await s.run("return waiters[1].events.PLAYER_REGEN_ENABLED")).toBe(true);
    await s.run("inCombat = false; waiters[1].scripts.OnEvent(waiters[1], 'PLAYER_REGEN_ENABLED')");
    expect(await s.run("return #pins")).toBe(3);
    expect(await s.run("return waiters[1].events.PLAYER_REGEN_ENABLED == nil")).toBe(true);
    await s.run("waiters[1].scripts.OnEvent(waiters[1], 'PLAYER_REGEN_ENABLED')");
    expect(await s.run("return #pins")).toBe(3);
    expect(await shown(s, 1)).toBe(true);
  } finally {
    s.close();
  }
});

it("guards the tooltip handlers", async () => {
  const s = await loggedIn(LOG);
  try {
    await s.run("GameTooltip.SetOwner = function() error('tooltip broken') end; GameTooltip.Hide = function() error('hide broken') end");
    await s.run("pins[1].scripts.OnEnter(pins[1])");
    await s.run("pins[1].scripts.OnLeave(pins[1])");
    expect(await s.printed()).toContain("MinMaxQuest: pinButtons disabled:");
  } finally {
    s.close();
  }
});

it("shows the unpin tooltip only for the pinned quest", async () => {
  const s = await loggedIn(LOG);
  try {
    await s.run("pins[1].scripts.OnEnter(pins[1])");
    expect(await s.run("return tooltip")).toBe("Pin with MinMaxQuest");
    await s.run("pins[1].scripts.OnClick()");
    await s.run("pins[1].scripts.OnEnter(pins[1])");
    expect(await s.run("return tooltip")).toBe("Unpin");
  } finally {
    s.close();
  }
});

it("restyles pins when the window unpin leaves the current target unchanged", async () => {
  const s = await loggedIn(LOG + UI_FAKES);
  try {
    await s.cmd("");
    await s.run(`scripts["MinMaxQuestTabcompletion.OnClick"](nil, "LeftButton")`);
    await s.run("pins[1].scripts.OnClick()");
    expect(await alpha(s, 1)).toBe(1);
    await s.run(`scripts["MinMaxQuestCompletionUnpin.OnClick"](nil, "LeftButton")`);
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
    expect(await alpha(s, 1)).toBe(0.35);
  } finally {
    s.close();
  }
});

it.each([
  "QuestLog_Update = false",
  "QuestLogTitle1 = false",
  "QuestLogListScrollFrame = false",
  "FauxScrollFrame_GetOffset = false",
])("retries once on the next event then reports once when the log is missing (%s)", async (missing) => {
  const s = await loggedIn(LOG + missing);
  try {
    await s.tick();
    expect(await s.printed()).toBe("");
    expect(await s.run("return waiters[1].events.ADDON_LOADED and waiters[1].events.QUEST_LOG_UPDATE")).toBe(true);
    await s.run("waiters[1].scripts.OnEvent(waiters[1], 'ADDON_LOADED')");
    await s.run("waiters[1].scripts.OnEvent(waiters[1], 'QUEST_LOG_UPDATE')");
    expect((await s.printed()).split("\n")).toEqual([
      "MinMaxQuest: quest log pin buttons unavailable (quest log frame not found)",
    ]);
    expect(await s.run("return #pins")).toBe(0);
  } finally {
    s.close();
  }
});

it("builds on the retry event when the quest log loads late", async () => {
  const s = await loggedIn(LOG + "late = QuestLogTitle1; QuestLogTitle1 = false");
  try {
    expect(await s.run("return #pins")).toBe(0);
    await s.run("QuestLogTitle1 = late; waiters[1].scripts.OnEvent(waiters[1], 'ADDON_LOADED')");
    expect(await s.run("return #pins")).toBe(3);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

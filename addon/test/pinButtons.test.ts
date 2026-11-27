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
regen = nil
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
  if kind == "Button" and parent and parent.GetID then
    local p = pinFake(parent.GetID())
    pins[parent.GetID()] = p
    return p
  end
  local f = base(kind, name, parent)
  if kind == "Frame" and name == nil then
    local w = { scripts = {} }
    w.RegisterEvent = function(_, e) if e == "PLAYER_REGEN_ENABLED" then regen = w end end
    w.SetScript = function(_, event, fn) w.scripts[event] = fn end
    setmetatable(w, { __index = function(_, k) return function(_, ...) return f[k](f, ...) end end })
    return w
  end
  return f
end
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

it("defers creation to PLAYER_REGEN_ENABLED while in combat", async () => {
  const s = await loggedIn("inCombat = true\n" + LOG.replace("inCombat = false\n", ""));
  try {
    expect(await s.run("return #pins")).toBe(0);
    await s.run("inCombat = false; regen.scripts.OnEvent(regen, 'PLAYER_REGEN_ENABLED')");
    expect(await s.run("return #pins")).toBe(3);
    await s.run("regen.scripts.OnEvent(regen, 'PLAYER_REGEN_ENABLED')");
    expect(await s.run("return #pins")).toBe(3);
    expect(await shown(s, 1)).toBe(true);
  } finally {
    s.close();
  }
});

it.each(["QuestLog_Update = false", "QuestLogTitle1 = false"])("reports once when the quest log is missing (%s)", async (missing) => {
  const s = await loggedIn(LOG + missing);
  try {
    await s.tick();
    await s.event(`"QUEST_LOG_UPDATE"`);
    await s.tick();
    const out = await s.printed();
    expect(out.split("\n")).toEqual(["MinMaxQuest: quest log pin buttons unavailable (quest log frame not found)"]);
    expect(await s.run("return #pins")).toBe(0);
  } finally {
    s.close();
  }
});

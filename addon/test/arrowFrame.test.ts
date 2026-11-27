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
      if method == "GetLeft" then return function() return 100 end end
      if method == "GetTop" then return function() return 700 end end
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
CreateFrame = function(kind, name) return fake(name == "MinMaxQuestArrow" and "frame" or "driver") end
UIParent = {}
GetLocale = function() return "enUS" end
MinMaxQuestCharDB = {}
UnitPosition = function() return 1000, 2000, 0, 1 end
GetPlayerFacing = function() return 0 end
`;

async function session(setup = "") {
  const lua = await createLuaWithWowStubs();
  await lua.doString(FAKES + setup);
  await lua.doString(readFileSync("build/MinMaxQuest.lua", "utf8"));
  const text = async (code: string) => (await lua.doString(code)) as string;
  return {
    cmd: (command: string) => lua.doString(`SlashCmdList.MMQ("${command}")`),
    tick: () => lua.doString(`scripts["driver.OnUpdate"](nil, 1)`),
    run: (code: string) => lua.doString(code),
    calls: async () => (await text(`return table.concat(calls, ";")`)).split(";"),
    printed: () => text(`return table.concat(printed, " ")`),
    clear: () => lua.doString("calls = {}"),
    close: () => lua.global.close(),
  };
}

const lastWith = (calls: string[], prefix: string) => calls.filter((c) => c.startsWith(prefix)).pop();

it("hides itself once disabled by a failing refresh", async () => {
  const s = await session();
  try {
    await s.cmd("arrow test");
    await s.tick();
    await s.run("GetPlayerFacing = function() error('no facing') end");
    await s.clear();
    await s.tick();
    expect(await s.printed()).toContain("MinMaxQuest: arrow disabled:");
    expect(lastWith(await s.calls(), "frame|")).toBe("frame|Hide");
    await s.clear();
    await s.tick();
    expect(await s.calls()).not.toContain("frame|Show");
  } finally {
    s.close();
  }
});

it("points straight up and shows the distance when the target is ahead", async () => {
  const s = await session();
  try {
    await s.cmd("arrow test");
    await s.tick();
    const calls = await s.calls();
    expect(await s.printed()).toBe("");
    expect(calls).toContain("texture|SetRotation|0.0");
    expect(calls).toContain("font|SetText|100 m");
    expect(calls).toContain("font|SetText|Test");
    expect(calls).toContain("texture|SetTexture|Interface\\AddOns\\MinMaxQuest\\addon\\src\\arrow\\arrow.tga");
    expect(lastWith(calls, "frame|Show")).toBe("frame|Show");
  } finally {
    s.close();
  }
});

it("rotates counter-clockwise from the facing", async () => {
  const s = await session(`GetPlayerFacing = function() return ${Math.PI / 2} end`);
  try {
    await s.cmd("arrow test");
    await s.tick();
    expect((await s.calls()).some((c) => c.startsWith("texture|SetRotation|4.71238898"))).toBe(true);
  } finally {
    s.close();
  }
});

it("hides when the position is nil and shows again once it is valid", async () => {
  const s = await session();
  try {
    await s.cmd("arrow test");
    await s.run("UnitPosition = function() end");
    await s.tick();
    expect(lastWith(await s.calls(), "frame|")).toBe("frame|Hide");
    await s.run("UnitPosition = function() return 1000, 2000, 0, 1 end");
    await s.tick();
    expect(lastWith(await s.calls(), "frame|")).toBe("frame|Show");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("hides when the facing is nil and recovers", async () => {
  const s = await session();
  try {
    await s.cmd("arrow test");
    await s.run("GetPlayerFacing = function() end");
    await s.tick();
    expect(lastWith(await s.calls(), "frame|")).toBe("frame|Hide");
    await s.run("GetPlayerFacing = function() return 0 end");
    await s.tick();
    expect(lastWith(await s.calls(), "frame|")).toBe("frame|Show");
  } finally {
    s.close();
  }
});

it("never puts OnUpdate on the hideable frame", async () => {
  const s = await session();
  try {
    await s.cmd("arrow test");
    expect(await s.run(`return scripts["frame.OnUpdate"] == nil and scripts["driver.OnUpdate"] ~= nil`)).toBe(true);
  } finally {
    s.close();
  }
});

it("reports once and disables the arrow when a refresh fails", async () => {
  const s = await session();
  try {
    await s.cmd("arrow test");
    await s.run("UnitPosition = function() error('boom') end");
    await s.tick();
    await s.tick();
    expect((await s.printed()).match(/arrow disabled/g)?.length).toBe(1);
  } finally {
    s.close();
  }
});

it("restores the saved position", async () => {
  const s = await session(`MinMaxQuestCharDB = { arrow = { x = 50, y = 60, locked = true } }`);
  try {
    await s.cmd("arrow test");
    const point = (await s.calls()).find((c) => c.startsWith("frame|SetPoint|TOPLEFT"));
    expect(point?.endsWith("|BOTTOMLEFT|50|60")).toBe(true);
  } finally {
    s.close();
  }
});

it("is movable only in move mode and saves the position on lock", async () => {
  const s = await session();
  try {
    await s.cmd("arrow move");
    await s.cmd("arrow lock");
    const calls = await s.calls();
    expect(calls.indexOf("frame|SetMovable|true")).toBeLessThan(calls.indexOf("frame|SetMovable|false"));
    expect(calls).toContain("frame|EnableMouse|false");
    expect(await s.run("return { MinMaxQuestCharDB.arrow.x, MinMaxQuestCharDB.arrow.y, MinMaxQuestCharDB.arrow.locked }")).toEqual([
      100, 700, true,
    ]);
  } finally {
    s.close();
  }
});

it("does not save a position when lock is used outside move mode", async () => {
  const s = await session();
  try {
    await s.cmd("arrow lock");
    expect(await s.run("return MinMaxQuestCharDB.arrow == nil")).toBe(true);
  } finally {
    s.close();
  }
});

it("prints usage for a bare or unknown arrow command", async () => {
  const s = await session();
  try {
    await s.cmd("arrow");
    await s.cmd("arrow nope");
    expect(await s.printed()).toBe("MinMaxQuest: usage: /mmq arrow move|lock|test MinMaxQuest: usage: /mmq arrow move|lock|test");
  } finally {
    s.close();
  }
});

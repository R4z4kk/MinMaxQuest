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
      return function(self, ...) calls[#calls + 1] = { name, method, ... } end
    end,
  })
end
CreateFrame = function() return fake("frame") end
UIParent = {}
GetLocale = function() return "enUS" end
MinMaxQuestCharDB = {}
`;

function setup(position: string, facing: string): string {
  return `
UnitPosition = function() ${position} end
GetPlayerFacing = function() return ${facing} end
`;
}

async function run(position: string, facing: string, commands: string[]) {
  const lua = await createLuaWithWowStubs();
  try {
    await lua.doString(FAKES + setup(position, facing));
    await lua.doString(readFileSync("build/MinMaxQuest.lua", "utf8"));
    for (const command of commands) await lua.doString(`SlashCmdList.MMQ("${command}")`);
    await lua.doString(`if scripts["frame.OnUpdate"] then scripts["frame.OnUpdate"](nil, 1) end`);
    return (await lua.doString(`
      local out = { printed = table.concat(printed, " "), calls = {} }
      for i, c in ipairs(calls) do out.calls[i] = table.concat({ tostring(c[1]), tostring(c[2]), tostring(c[3]) }, "|") end
      return out
    `)) as { printed: string; calls: string[] };
  } finally {
    lua.global.close();
  }
}

it("points straight up and shows the distance when the target is ahead", async () => {
  const { printed, calls } = await run("return 1000, 2000, 0, 1", "0", ["arrow test"]);
  expect(printed).toBe("");
  expect(calls).toContain("texture|SetRotation|0.0");
  expect(calls).toContain("font|SetText|100 m");
  expect(calls).toContain("font|SetText|Test");
  expect(calls).toContain("texture|SetTexture|Interface\\AddOns\\MinMaxQuest\\addon\\src\\arrow\\arrow.tga");
  expect(calls).toContain("frame|Show|nil");
});

it("rotates counter-clockwise from the facing", async () => {
  const { calls } = await run("return 1000, 2000, 0, 1", String(Math.PI / 2), ["arrow test"]);
  expect(calls.some((call) => call.startsWith("texture|SetRotation|4.71238898"))).toBe(true);
});

it("hides without error when the position is unavailable", async () => {
  const { printed, calls } = await run("return nil", "0", ["arrow move", "arrow lock"]);
  expect(printed).toBe("");
  expect(calls[calls.length - 1]).toBe("frame|Hide|nil");
});

it("saves the position on lock", async () => {
  const lua = await createLuaWithWowStubs();
  try {
    await lua.doString(FAKES + setup("return 1, 2, 0, 1", "0"));
    await lua.doString(readFileSync("build/MinMaxQuest.lua", "utf8"));
    await lua.doString(`SlashCmdList.MMQ("arrow move") SlashCmdList.MMQ("arrow lock")`);
    const saved = (await lua.doString(
      "return { MinMaxQuestCharDB.arrow.x, MinMaxQuestCharDB.arrow.y, MinMaxQuestCharDB.arrow.locked }",
    )) as unknown[];
    expect(saved).toEqual([100, 700, true]);
  } finally {
    lua.global.close();
  }
});

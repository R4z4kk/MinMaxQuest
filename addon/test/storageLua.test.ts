import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { transpileString, LuaTarget, LuaLibImportKind } from "typescript-to-lua";
import { createLuaWithWowStubs } from "./helpers/wowStubs";

it("loadCharDb keeps nullable saved fields when run as Lua", async () => {
  const source = readFileSync("addon/src/core/storage.ts", "utf8");
  const result = transpileString(source, {
    luaTarget: LuaTarget.Lua51,
    luaLibImport: LuaLibImportKind.Inline,
    noImplicitSelf: true,
    strict: true,
  });
  expect(result.diagnostics.filter((d) => d.category === 1)).toEqual([]);
  const lua = await createLuaWithWowStubs();
  try {
    const out = await lua.doString(`
      local m = load(${JSON.stringify(result.file?.lua ?? "")})()
      local db = m.loadCharDb({
        window = { x = 1, y = 2 }, pinnedQuestId = 5, minLevelGap = 3,
        completion = { zoneAreaId = 12 }, expandedChain = "c",
        arrow = { x = 1, y = 2, locked = true }, hearthPos = { continent = 1, x = 7, y = 8 },
      })
      return table.concat({ db.window.x, db.window.y, db.pinnedQuestId, db.minLevelGap,
        db.completion.zoneAreaId, db.expandedChain, tostring(db.arrow.locked), db.hearthPos.continent, db.hearthPos.x, db.hearthPos.y }, ",")
    `);
    expect(out).toBe("1,2,5,3,12,c,true,1,7,8");
  } finally {
    lua.global.close();
  }
});

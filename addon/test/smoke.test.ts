import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createLuaWithWowStubs } from "./helpers/wowStubs";

const BUNDLE_PATH = "build/MinMaxQuest.lua";

it("bundle loads in a Lua VM with WoW stubs", async () => {
  const lua = await createLuaWithWowStubs();
  try {
    await lua.doString(readFileSync(BUNDLE_PATH, "utf8"));
    const addon = lua.global.get("MinMaxQuest") as { version: string };
    expect(addon.version).toBe("0.1.0");
  } finally {
    lua.global.close();
  }
});

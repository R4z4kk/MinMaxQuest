import { LuaEngine, LuaFactory } from "wasmoon";

const PRELUDE = `
unpack = unpack or table.unpack
loadstring = loadstring or load
local function newStub()
  local stub = {}
  setmetatable(stub, {
    __index = function(t, k)
      local child = newStub()
      rawset(t, k, child)
      return child
    end,
    __call = function() return newStub() end,
  })
  return stub
end
setmetatable(_G, {
  __index = function(t, k)
    local stub = newStub()
    rawset(t, k, stub)
    return stub
  end,
})
`;

export async function createLuaWithWowStubs(): Promise<LuaEngine> {
  const lua = await new LuaFactory().createEngine();
  try {
    await lua.doString(PRELUDE);
  } catch (error) {
    lua.global.close();
    throw error;
  }
  return lua;
}

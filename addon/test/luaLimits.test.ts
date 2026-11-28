import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LUA51_MAX_LOCALS, LUA51_MAX_UPVALUES, luaFunctionLimits } from "./helpers/luaLimits";

const locals = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `local ${prefix}${i} = ${i}`).join("\n");
const uses = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" + ");

describe("luaFunctionLimits", () => {
  it("counts upvalues, including those a nested function pulls through its parent", () => {
    const source = `${locals(3, "a")}\nlocal function outer()\n  local b = 1\n  return function() return ${uses(3, "a")} + b + c end\nend`;
    const [inner, outer] = luaFunctionLimits(source);
    expect(inner.upvalues).toBe(4);
    expect(outer.upvalues).toBe(3);
  });

  it("does not count globals, fields or shadowed locals", () => {
    const source = `local a = 1\nlocal t = {}\nlocal function f(a) local x = { a = a } return t.a + print + x.a end`;
    expect(luaFunctionLimits(source)[0].upvalues).toBe(1);
  });

  it("flags a function past the Lua 5.1 upvalue limit", () => {
    const source = `${locals(61, "v")}\nlocal function f() return ${uses(61, "v")} end`;
    expect(luaFunctionLimits(source)[0].upvalues).toBe(61);
  });

  it("counts the most locals active at once, not every local ever declared", () => {
    const source = `local function f()\n  do ${locals(5, "x")} end\n  do ${locals(3, "y")} end\nend`;
    expect(luaFunctionLimits(source)[0].locals).toBe(5);
  });
});

describe("compiled addon", () => {
  it("stays within the Lua 5.1 upvalue and local limits WoW enforces", () => {
    const over = luaFunctionLimits(readFileSync("build/MinMaxQuest.lua", "utf8")).filter(
      (f) => f.upvalues > LUA51_MAX_UPVALUES || f.locals > LUA51_MAX_LOCALS,
    );
    expect(over).toEqual([]);
  });
});

// TSTL calls an interface method as obj:name(...), passing obj first; a self-less function stored there
// then gets obj as its first argument (0.2.0-beta.1: C_Item.GetItemCount received a table in game).
describe("self arguments in the compiled addon", () => {
  it("never stores a self-less function in a field that is called with ':'", () => {
    const source = readFileSync("build/MinMaxQuest.lua", "utf8");
    const selfless = new Set<string>();
    const firstParam = (params: string) => params.split(",")[0].trim();
    for (const m of source.matchAll(/local function (\w+)\(([^)]*)\)/g)) if (!["self", "____"].includes(firstParam(m[2]))) selfless.add(m[1]);
    for (const m of source.matchAll(/function ____exports\.(\w+)\(([^)]*)\)/g)) if (!["self", "____"].includes(firstParam(m[2]))) selfless.add(m[1]);
    for (const m of source.matchAll(/^local (\w+) = ____\w+\.(\w+)$/gm)) selfless.add(m[1]);
    const colonCalled = new Set([...source.matchAll(/:(\w+)\(/g)].map((m) => m[1]));
    const wrong = [...source.matchAll(/^\s+(\w+) = (\w+),?$/gm)]
      .filter((m) => colonCalled.has(m[1]) && selfless.has(m[2]))
      .map((m) => `${m[1]} = ${m[2]}`);
    expect(wrong).toEqual([]);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { decodeSteps, encodeSteps, type EmittedStep } from "../src/route/format";
import { composeRoute, decodeReturnBlock, readRoutes, variantKey, type FactionRoutes, type RouteOptions } from "../src/route/routeData";

const step = (questId: number, extra: Partial<EmittedStep> = {}): EmittedStep => ({
  type: "accept", uiMapId: 1429, x: 10, y: 20, questId, targetLevel: 1, targetXpIntoLevel: 0, estCostSeconds: 5, estXpGain: 0, ...extra,
});
const OFF: RouteOptions = { elites: false, dungeons: false, minLevelGap: null };
const ON: RouteOptions = { elites: true, dungeons: false, minLevelGap: 2 };

const routes: FactionRoutes = {
  faction: "A",
  meta: { build: "b", questieDb: "q", generatedOn: "2026-01-01", constants: { segmentEndLevel: 10 } },
  segmentRaces: { zebra: 2, alpha: 1 },
  segments: {
    alpha: { e0d0x0: encodeSteps([step(1), step(2, { races: 4 }), step(3)]), e1d0x2: encodeSteps([step(4)]) },
    zebra: { e0d0x0: encodeSteps([step(5)]) },
  },
  trunk: { e0d0x0: encodeSteps([step(100), step(101)]), e1d0x2: encodeSteps([step(102)]) },
  returnBlocks: { 7: encodeSteps([step(50)]) },
};
const ids = (steps: EmittedStep[]): (number | undefined)[] => steps.map((s) => s.questId);

afterEach(() => {
  delete (globalThis as Record<string, unknown>).MinMaxQuestRoutes;
});

it("builds the variant key", () => {
  expect(variantKey(ON)).toBe("e1d0x2");
  expect(variantKey(OFF)).toBe("e0d0x0");
  expect(variantKey({ elites: false, dungeons: true, minLevelGap: 3 })).toBe("e0d1x3");
});

it("puts segment steps before trunk steps at level 1", () => {
  const r = composeRoute(routes, OFF, 1, 1, 10);
  expect(r.segmentKey).toBe("alpha");
  expect(ids(r.steps)).toEqual([1, 3, 100, 101]);
  expect(r.segmentLength).toBe(2);
});

it("keeps steps whose races include the player", () => {
  const r = composeRoute(routes, OFF, 5, 1, 10);
  expect(ids(r.steps)).toEqual([1, 2, 3, 100, 101]);
  expect(r.segmentLength).toBe(3);
});

it("picks the first matching segment in sorted key order", () => {
  expect(composeRoute(routes, OFF, 3, 1, 10).segmentKey).toBe("alpha");
  expect(composeRoute(routes, OFF, 2, 1, 10).segmentKey).toBe("zebra");
});

it("gives the trunk only at the segment end level or for an unlisted race", () => {
  const late = composeRoute(routes, OFF, 1, 12, 10);
  expect(late.segmentKey).toBeNull();
  expect(ids(late.steps)).toEqual([100, 101]);
  expect(late.segmentLength).toBe(0);
  expect(composeRoute(routes, OFF, 64, 1, 10).segmentKey).toBeNull();
});

it("caches one entry by key", () => {
  const a = composeRoute(routes, OFF, 1, 1, 10);
  expect(composeRoute(routes, OFF, 1, 2, 10).steps).toBe(a.steps);
  const b = composeRoute(routes, ON, 1, 1, 10);
  expect(b.steps).not.toBe(a.steps);
  expect(composeRoute(routes, OFF, 1, 1, 10).steps).not.toBe(a.steps);
});

it("names faction, variant and decoder message on a decode error", () => {
  const bad: FactionRoutes = { ...routes, trunk: { e0d0x0: "z;1;2" } };
  expect(() => composeRoute(bad, OFF, 64, 1, 10)).toThrow(/A.*e0d0x0.*line 1/);
});

it("throws naming a missing variant", () => {
  expect(() => composeRoute(routes, { elites: false, dungeons: true, minLevelGap: null }, 64, 1, 10)).toThrow(/A.*e0d1x0/);
});

it("decodes a return block, empty when the dungeon has none", () => {
  expect(ids(decodeReturnBlock(routes, 7))).toEqual([50]);
  expect(decodeReturnBlock(routes, 8)).toEqual([]);
});

it("reads valid routes from the global", () => {
  const { faction: _faction, ...table } = routes;
  (globalThis as Record<string, unknown>).MinMaxQuestRoutes = { Alliance: table };
  const result = readRoutes("A");
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.routes.faction).toBe("A");
});

it("reports a missing global, faction or trunk", () => {
  expect(readRoutes("A")).toEqual({ ok: false, message: expect.stringContaining("Alliance") });
  (globalThis as Record<string, unknown>).MinMaxQuestRoutes = { Horde: {} };
  expect(readRoutes("A").ok).toBe(false);
  const { faction: _faction, trunk: _trunk, ...noTrunk } = routes;
  (globalThis as Record<string, unknown>).MinMaxQuestRoutes = { Alliance: noTrunk };
  const result = readRoutes("A");
  expect(result).toEqual({ ok: false, message: expect.stringContaining("trunk") });
});

let dir: string;
let luaCode: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "mmq-routedata-"));
  const tstl = join(process.cwd(), "node_modules", "typescript-to-lua", "dist", "tstl.js");
  const entry = join(process.cwd(), "addon", "src", "route", "routeData.ts");
  execFileSync(process.execPath, [
    tstl, "--luaTarget", "5.1", "--noImplicitSelf", "--target", "ESNext", "--lib", "ESNext",
    "--module", "ESNext", "--moduleResolution", "Bundler", "--types", "lua-types/5.1", "--strict", "--skipLibCheck",
    "--luaBundle", join(dir, "routeData.lua"), "--luaBundleEntry", entry, "--rootDir", join(process.cwd(), "addon", "src"), "--outDir", dir, entry,
  ], { stdio: "pipe" });
  luaCode = readFileSync(join(dir, "routeData.lua"), "utf8");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("composes the real Alliance route in compiled Lua", async () => {
  const lua = await new LuaFactory().createEngine();
  try {
    await lua.doString("unpack = unpack or table.unpack");
    await lua.doString(readFileSync("data/routes/Alliance.lua", "utf8"));
    await lua.doString(`function loadRouteData(...) ${luaCode}\nend`);
    const out = await lua.doString(`
      local m = loadRouteData()
      local read = m.readRoutes("A")
      if not read.ok then return "read failed: " .. tostring(read.message) end
      local r = m.composeRoute(read.routes, { elites = false, dungeons = false }, 1, 1, read.routes.meta.constants.segmentEndLevel)
      return tostring(r.segmentKey) .. "|" .. #r.steps .. "|" .. r.segmentLength
    `);
    const [key, count, segment] = String(out).split("|");
    expect(key).toBe("elwynn-forest");
    expect(Number(count)).toBeGreaterThan(100);
    expect(Number(segment)).toBeGreaterThan(0);
  } finally {
    lua.global.close();
  }
});

it("decodes every variant and return block of the shipped routes", async () => {
  const lua = await new LuaFactory().createEngine();
  try {
    for (const file of ["data/routes/Alliance.lua", "data/routes/Horde.lua"]) await lua.doString(readFileSync(file, "utf8"));
    const flat = (await lua.doString(`
      local out = {}
      local function add(name, text) out[#out + 1] = name; out[#out + 1] = text end
      for faction, r in pairs(MinMaxQuestRoutes) do
        for variant, text in pairs(r.trunk) do add(faction .. " trunk " .. variant, text) end
        for key, variants in pairs(r.segments) do
          for variant, text in pairs(variants) do add(faction .. " segment " .. key .. " " .. variant, text) end
        end
        for areaId, text in pairs(r.returnBlocks) do add(faction .. " return " .. areaId, text) end
      end
      return out
    `)) as string[];
    const counts = new Map<string, number>();
    for (let i = 0; i < flat.length; i += 2) {
      const [faction, kind] = flat[i].split(" ");
      counts.set(`${faction} ${kind}`, (counts.get(`${faction} ${kind}`) ?? 0) + 1);
      let steps: EmittedStep[] = [];
      expect(() => { steps = decodeSteps(flat[i + 1]); }, flat[i]).not.toThrow();
      expect(steps.length, flat[i]).toBeGreaterThan(0);
    }
    for (const faction of ["Alliance", "Horde"]) {
      expect(counts.get(`${faction} trunk`)).toBe(16);
      expect(counts.get(`${faction} segment`) ?? 0).toBeGreaterThanOrEqual(16);
      expect(counts.get(`${faction} return`) ?? 0).toBeGreaterThan(0);
    }
  } finally {
    lua.global.close();
  }
});

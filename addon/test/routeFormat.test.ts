import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LuaFactory } from "wasmoon";
import { afterAll, beforeAll, expect, it } from "vitest";
import { decodeSteps, encodeSteps, type EmittedStep } from "../src/route/format";

const steps: EmittedStep[] = [
  { type: "accept", uiMapId: 1429, x: 12.345, y: 67.891, questId: 10, npcId: 1, targetLevel: 1, targetXpIntoLevel: 0, estCostSeconds: 40, estXpGain: 0, races: 77 },
  { type: "complete", uiMapId: 1429, x: 10, y: 20.5, questId: 10, objectiveIndex: 2, loop: [[1.234, 2.5], [3, 4.999]], targetLevel: 2, targetXpIntoLevel: 150, estCostSeconds: 300, estXpGain: 250 },
  { type: "turnin", uiMapId: 1436, x: 0, y: 99.999, questId: 10, taxiNodeId: 5, loop: [], targetLevel: 3, targetXpIntoLevel: 10, estCostSeconds: 12, estXpGain: 900, unlocks: [11, 12] },
  { type: "fly", uiMapId: 1, x: 1, y: 2, taxiNodeId: 6, targetLevel: 3, targetXpIntoLevel: 10, estCostSeconds: 0, estXpGain: 0 },
];
const { loop: _emptyLoop, ...turnin } = steps[2];
const expected: EmittedStep[] = [
  { ...steps[0], x: 12.35, y: 67.89 },
  { ...steps[1], loop: [[1.23, 2.5], [3, 5]] },
  { ...turnin, y: 100 },
  steps[3],
];

it("round-trips steps covering every optional field and an empty loop", () => {
  expect(decodeSteps(encodeSteps(steps))).toEqual(expected);
});

it("round-trips an empty list", () => {
  expect(decodeSteps(encodeSteps([]))).toEqual([]);
});

it("names the line number of a malformed line", () => {
  expect(() => decodeSteps("z;1;2")).toThrow(/line 1/);
  const good = encodeSteps([steps[3]]);
  expect(() => decodeSteps(`${good}\n${good.replace("f;", "q;")}`)).toThrow(/line 2.*unknown step type/);
  expect(() => decodeSteps(good.replace(";1;", ";x;"))).toThrow(/line 1.*uiMapId/);
});

it("rejects a non-integer id when encoding", () => {
  expect(() => encodeSteps([{ ...steps[3], questId: 1.5 }])).toThrow(/step 1 questId/);
});

let dir: string;
let luaCode: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "mmq-format-"));
  const tstl = join(process.cwd(), "node_modules", "typescript-to-lua", "dist", "tstl.js");
  execFileSync(process.execPath, [
    tstl, "--luaTarget", "5.1", "--noImplicitSelf", "--luaLibImport", "inline", "--target", "ESNext", "--lib", "ESNext",
    "--module", "ESNext", "--moduleResolution", "Bundler", "--types", "lua-types/5.1", "--strict", "--skipLibCheck",
    "--outDir", dir, join(process.cwd(), "addon", "src", "route", "format.ts"),
  ], { stdio: "pipe" });
  const file = readdirSync(dir).find((name) => name.endsWith(".lua"));
  if (file == null) throw new Error("TSTL produced no Lua file for format.ts");
  luaCode = readFileSync(join(dir, file), "utf8");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("decodes in compiled Lua what Node encoded", async () => {
  const lua = await new LuaFactory().createEngine();
  try {
    await lua.doString(`function loadFormat() ${luaCode}\nend`);
    lua.global.set("encoded", encodeSteps(steps));
    expect(await lua.doString("return loadFormat().decodeSteps(encoded)")).toEqual(expected);
    lua.global.set("bad", "z;1;2");
    const message = await lua.doString("local ok, err = pcall(function() return loadFormat().decodeSteps(bad) end) return tostring(err)");
    expect(message).toMatch(/line 1/);
  } finally {
    lua.global.close();
  }
});

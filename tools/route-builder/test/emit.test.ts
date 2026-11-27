import { LuaFactory } from "wasmoon";
import { describe, expect, it } from "vitest";
import { decodeSteps } from "../../../addon/src/route/format";
import { emitFaction, emitReport, luaLongString } from "../emit/emit";
import { allVariants, variantKey, type Evaluated, type FactionRoutes } from "../opt/variants";
import type { RouteStep } from "../sim/simulate";
import { kill, place, quest, travel, worldOf } from "./fixtures";

const RACE = 1;
const data = travel({ taxiNodes: [{ id: 2, name: "Capital", pos: { continent: 0, x: 5, y: 5 }, faction: "A" }] });

const withXy = (x: number, y: number, uiMapId: number) => ({ ...place(x, 0, uiMapId), x: x / 10, y });
const q10 = quest(10, withXy(0, 5, 1), { baseXp: 900, level: 1, nextInChain: 11 }, [kill(withXy(0, 30, 1), 1)]);
q10.tasks[0].cluster.loop = [withXy(0, 30, 1), withXy(10, 31, 1), withXy(20, 32, 2)];
const q11 = quest(11, withXy(5, 5, 1), { baseXp: 900, level: 1, races: RACE });
const t100 = quest(100, withXy(40, 1, 2), { baseXp: 9000, level: 10, requiredLevel: 10 }, [kill(withXy(40, 30, 2), 10)]);
const q301 = { ...quest(301, withXy(7, 7, 2), { level: 20, requiredLevel: 20 }), dungeonAreaId: 99, returnVisit: true };

const w = worldOf([q10, q11, t100, q301], {
  raceMask: RACE,
  raceMasks: [RACE],
  inns: [{ place: withXy(2, 0, 1) }],
  taxiPlaces: new Map([[2, place(5, 5, 2)]]),
  areaUiMap: new Map([[12, 1]]),
  startZones: [{ key: "start-zone", faction: "A", raceMask: RACE, areaId: 12, start: place(0, 0, 1) }],
  dungeons: [{ areaId: 99, name: "Test", entrance: place(500, 0, 2), questIds: [301] }],
  conversionOffsetYards: 3.4567,
  unlearnableTaxiNodes: [7, 9],
  excluded: new Map([["noXp", 4], ["class", 2]]),
});

const accept = (q: typeof q10): RouteStep => ({ type: "accept", place: q.accept, questId: q.id });
const done = (q: typeof q10): RouteStep => ({ type: "complete", place: q.tasks[0].cluster.center, questId: q.id, objectiveIndex: 0 });
const turnin = (q: typeof q10): RouteStep => ({ type: "turnin", place: q.turnin, questId: q.id });
const segmentSteps: RouteStep[] = [accept(q10), done(q10), turnin(q10), accept(q11), turnin(q11)];
const trunkSteps: RouteStep[] = [accept(t100), done(t100), turnin(t100)];

function evaluated(steps: RouteStep[], average: number): Evaluated {
  return {
    steps,
    secondsByScenario: { fast: average - 60, medium: average, slow: average + 60 },
    levelByScenario: { fast: 60, medium: 60, slow: 60 },
    average,
    worstRace: { raceMask: RACE, seconds: average + 5, skipped: 1, level: 9, reached: false },
    discardedCandidates: [],
  };
}
const keys = allVariants().filter((v) => v.maxLevelGap == null).map(variantKey);
const routes: FactionRoutes = {
  faction: "A",
  segments: { "start-zone": Object.fromEntries(keys.map((k, i) => [k, evaluated(segmentSteps, 3600 + i)])) },
  trunk: Object.fromEntries(keys.map((k, i) => [k, evaluated(trunkSteps, 7200 + i)])),
  returnBlocks: { 99: [accept(q301), { type: "dungeon", place: place(500, 0, 2), dungeonAreaId: 99 }, turnin(q301)] },
};
const meta = { build: "1.14.4", questieDb: "v1.1.6", generatedOn: "2026-11-27", constants: { "fast.killSec": 20, beamWidth: 8 } };

async function evalLua(code: string): Promise<{ run: (expr: string) => Promise<unknown>; close: () => void }> {
  const lua = await new LuaFactory().createEngine();
  await lua.doString(code);
  return { run: (expr) => lua.doString(`return ${expr}`), close: () => lua.global.close() };
}

describe("luaLongString", () => {
  it("picks a bracket level absent from the content", () => {
    expect(luaLongString("abc")).toBe("[[abc]]");
    expect(luaLongString("a]]b")).toBe("[=[a]]b]=]");
    expect(luaLongString("a]]b]=]c")).toBe("[==[a]]b]=]c]==]");
    expect(luaLongString("end]")).toBe("[=[end]]=]");
  });
});

describe("emitFaction", () => {
  const lua = emitFaction(routes, w, meta, data);

  it("evaluates to decodable step strings", async () => {
    const g = await evalLua(lua);
    try {
      const text = (await g.run("MinMaxQuestRoutes.Alliance.trunk.e0d0x0")) as string;
      const steps = decodeSteps(text);
      expect(steps.map((s) => [s.type, s.questId])).toEqual([["accept", 100], ["complete", 100], ["turnin", 100]]);
      expect(steps[0]).toMatchObject({ uiMapId: 2, x: 4, y: 1, targetLevel: 10, targetXpIntoLevel: 0, estXpGain: 0 });
      expect(steps[1].estCostSeconds).toBeGreaterThan(0);
      expect(steps[2].estXpGain).toBeGreaterThan(0);
      expect(steps[2].targetLevel).toBeGreaterThanOrEqual(10);
      expect(await g.run("MinMaxQuestRoutes.Alliance.meta.build")).toBe("1.14.4");
      expect(await g.run("MinMaxQuestRoutes.Alliance.meta.constants['fast.killSec']")).toBe(20);
    } finally {
      g.close();
    }
  });

  it("emits loops in the step's uiMap only, unlocks on turn-ins and races", async () => {
    const g = await evalLua(lua);
    try {
      const steps = decodeSteps((await g.run("MinMaxQuestRoutes.Alliance.segments['start-zone'].e1d1x0")) as string);
      expect(steps).toHaveLength(5);
      expect(steps[1].loop).toEqual([[0, 30], [1, 31]]);
      expect(steps[2].unlocks).toEqual([11]);
      expect(steps[0].unlocks).toBeUndefined();
      expect(steps[3].races).toBe(RACE);
      expect(steps[0].races).toBeUndefined();
    } finally {
      g.close();
    }
  });

  it("emits return blocks keyed by area id", async () => {
    const g = await evalLua(lua);
    try {
      const steps = decodeSteps((await g.run("MinMaxQuestRoutes.Alliance.returnBlocks[99]")) as string);
      expect(steps.map((s) => s.type)).toEqual(["accept", "dungeon", "turnin"]);
      expect(steps.every((s) => s.targetLevel === 0 && s.targetXpIntoLevel === 0)).toBe(true);
    } finally {
      g.close();
    }
  });

  it("fails naming the segment when a winner breaks a strict rule", () => {
    const broken: FactionRoutes = { ...routes, trunk: { ...routes.trunk, e0d0x0: evaluated([turnin(t100)], 1) } };
    expect(() => emitFaction(broken, w, meta, data)).toThrow(/trunk e0d0x0.*turnin 100/);
  });
});

describe("emitReport", () => {
  const report = emitReport([routes], [w], meta, data);

  it("has a header and one row per variant for the faction and the zone", () => {
    expect(report).toContain("| Variant | Fast h | Medium h | Slow h | Average h | Quests | Grind % | Steps | Worst race h | Skipped | Worst race level |");
    const rows = report.split("\n").filter((l) => /^\| e\dd\dx\d /.test(l));
    expect(rows).toHaveLength(2 * keys.length);
    expect(report).toContain("| e0d0x0 | 0.98 | 1.00 | 1.02 | 1.00 | 2 | 0.0 | 5 | 1.00 | 1 | 9 (short) |");
  });

  it("adds a benchmark table only when rows are given", () => {
    const row = { faction: "A" as const, zone: "start-zone", file: "g.lua", level: 10, rxpSeconds: 5400, rxpLevel: 10, reached: true, oursSeconds: 3600, variant: "e0d0x0", steps: 40, dropped: 3, skipped: 1 };
    expect(report).not.toContain("RXP benchmark");
    const withBench = emitReport([routes], [w], meta, data, [row]);
    expect(withBench).toContain("## Alliance RXP benchmark");
    expect(withBench).toContain("| start-zone | 10 | 1.50 | 1.00 | e0d0x0 | 40 | 3 | 1 |");
  });

  it("lists exclusions and the conversion offset", () => {
    expect(report).toContain("| noXp | 4 |");
    expect(report).toContain("| class | 2 |");
    expect(report).toMatch(/median offset 3\.46 yards/i);
    expect(report).toContain("Unlearnable taxi nodes (no flight master within 100 yards): 7, 9.");
  });
});

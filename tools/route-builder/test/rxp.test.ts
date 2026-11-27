import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { EOL, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../model/constants";
import { initialState } from "../sim/simulate";
import { RXP_GUIDES, benchmarkRxp, parseRxpGuide, runRxp } from "../bench/rxp";
import type { FactionRoutes, Evaluated } from "../opt/variants";
import { kill, place, quest, travel, worldOf } from "./fixtures";

const medium = SCENARIOS[1];
const task = { ...kill(place(50), 1), objectiveIndex: 1 };
const q1 = quest(1, place(10), { baseXp: 100000, level: 1 }, [task]);
const q2 = quest(2, place(20), { baseXp: 100000, level: 1 });
const w = worldOf([q1, q2]);

const SNIPPET = [".accept 1", ".accept 2", ".complete 1,1", ".turnin 1", ".turnin 2", ".accept 999"].join("\n");

describe("parseRxpGuide", () => {
  it("maps accept, complete and turnin to world steps and drops unknown ids", () => {
    const parsed = parseRxpGuide(SNIPPET, w, "snippet");
    expect(parsed.steps.map((s) => [s.type, s.questId])).toEqual([
      ["accept", 1],
      ["accept", 2],
      ["complete", 1],
      ["turnin", 1],
      ["turnin", 2],
    ]);
    expect(parsed.steps[2].objectiveIndex).toBe(1);
    expect(parsed.dropped).toBe(1);
    expect(parsed.steps[2].place).toBe(task.cluster.center);
    expect(parsed.steps[3].place).toBe(q1.turnin);
  });

  it("ignores other directives and repeated class or race variants", () => {
    const text = ["step", "    .goto 1438/1,1,2", ".accept 1 >> text", "\t.accept 1", ".turnin 2,3 >> reward"].join("\n");
    expect(parseRxpGuide(text, w, "g").steps.map((s) => s.type)).toEqual(["accept", "turnin"]);
  });

  it("drops a complete directive that has no task", () => {
    const parsed = parseRxpGuide(".complete 2,1", w, "g");
    expect(parsed.steps).toEqual([]);
    expect(parsed.dropped).toBe(1);
  });

  it("names the file and line of a malformed directive", () => {
    expect(() => parseRxpGuide("step\n.accept x", w, "Guide.lua")).toThrow("Guide.lua:2");
  });
});

describe("runRxp", () => {
  const start = () => initialState(place(0), 1, [], null);
  const steps = parseRxpGuide(SNIPPET, w, "g").steps;

  it("stops at the first step that reaches the target level", () => {
    const result = runRxp(steps, start(), w, medium, 2, 0, travel());
    expect(result.reached).toBe(true);
    expect(result.level).toBeGreaterThanOrEqual(2);
    const all = runRxp(steps, start(), w, medium, 99, 0, travel());
    expect(all.reached).toBe(false);
    expect(result.seconds).toBeLessThan(all.seconds);
  });

  it("counts quests skipped by the tolerant simulator", () => {
    const result = runRxp([...steps, ...steps.slice(0, 1)], start(), w, medium, 99, 0, travel());
    expect(result.skipped).toBe(1);
  });
});

describe("parseRxpGuide signed ids", () => {
  it("reads a plus sign as part of the id and drops negative ids", () => {
    const parsed = parseRxpGuide(".accept +1 >> x\n.turnin -2 >> y", w, "g");
    expect(parsed.steps.map((s) => s.questId)).toEqual([1]);
    expect(parsed.dropped).toBe(1);
  });
});

describe("benchmarkRxp", () => {
  const zoneKey = "teldrassil";
  const ALLIANCE_ZONES = RXP_GUIDES.filter((g) => g.faction === "A").map((g) => g.zone);
  const startPlace = { ...place(0, 0, 1), x: 0, y: 0 };
  const q3 = quest(3, place(30), { baseXp: 1, level: 1 });
  const bw = worldOf([q1, q2, q3], {
    raceMask: 1,
    raceMasks: [1],
    inns: [],
    taxiPlaces: new Map([[2, place(5, 5, 1)]]),
    areaUiMap: new Map([[12, 1]]),
    startZones: ALLIANCE_ZONES.map((key) => ({ key, faction: "A" as const, raceMask: 1, areaId: 12, start: startPlace })),
  });
  const evaluated = (seconds: number, level = 10): Evaluated => ({
    steps: [],
    secondsByScenario: { fast: seconds, medium: seconds, slow: seconds },
    levelByScenario: { fast: level, medium: level, slow: level },
    average: seconds,
    worstRace: { raceMask: 1, seconds, skipped: 0, level, reached: level >= 10 },
    discardedCandidates: [],
  });
  const routesOf = (segmentsByZone: FactionRoutes["segments"]): FactionRoutes => ({ faction: "A", segments: segmentsByZone, trunk: {}, returnBlocks: {} });
  const allZones = (variants: Record<string, Evaluated>): FactionRoutes["segments"] => Object.fromEntries(ALLIANCE_ZONES.map((z) => [z, variants]));
  const guide = RXP_GUIDES.find((g) => g.zone === zoneKey);
  if (guide == null) throw new Error("test: guide table has no teldrassil entry");
  const data = travel();

  function withDir(text: string, run: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "rxp-"));
    try {
      if (text !== "") for (const g of RXP_GUIDES) writeFileSync(join(dir, g.file), text);
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("assembles a row and ignores guides of the other faction", () => {
    withDir(`${SNIPPET}\n.accept 3`, (dir) => {
      const rows = benchmarkRxp(dir, bw, routesOf(allZones({ e0d0x0: evaluated(1000), e1d0x0: evaluated(900) })), data);
      expect(rows.map((r) => r.faction)).toEqual(ALLIANCE_ZONES.map(() => "A"));
      const row = rows.find((r) => r.zone === zoneKey);
      expect(row).toMatchObject({ faction: "A", zone: zoneKey, file: guide.file, level: 10, oursSeconds: 900, variant: "e1d0x0", dropped: 0 });
    });
  });

  it("compares only our routes that reach the benchmark level", () => {
    withDir(SNIPPET, (dir) => {
      const rows = benchmarkRxp(dir, bw, routesOf(allZones({ e0d0x0: evaluated(1000), e1d0x0: evaluated(500, 9) })), data);
      expect(rows.find((r) => r.zone === zoneKey)).toMatchObject({ level: 10, oursSeconds: 1000, variant: "e0d0x0" });
      expect(() => benchmarkRxp(dir, bw, routesOf(allZones({ e1d0x0: evaluated(500, 9) })), data)).toThrow(/teldrassil.*level 10/);
    });
  });

  it("throws naming zone and file when the zone has no segment or variants", () => {
    withDir(SNIPPET, (dir) => {
      const noTeldrassil = Object.fromEntries(Object.entries(allZones({ e0d0x0: evaluated(1) })).filter(([z]) => z !== zoneKey));
      expect(() => benchmarkRxp(dir, bw, routesOf(noTeldrassil), data)).toThrow(`zone ${zoneKey}`);
      expect(() => benchmarkRxp(dir, bw, routesOf({ ...noTeldrassil, [zoneKey]: {} }), data)).toThrow(`zone ${zoneKey}`);
    });
  });

  it("throws naming the path when the guide file is missing", () => {
    withDir("", (dir) => {
      expect(() => benchmarkRxp(dir, bw, routesOf(allZones({ e0d0x0: evaluated(1) })), data)).toThrow(guide.file);
    });
  });

  it("counts a drop right after the level-reaching step only when the level was not reached", () => {
    const text = [".accept 1", ".complete 1,1", ".turnin 1", ".accept 999"].join("\n");
    withDir(text, (dir) => {
      const rows = benchmarkRxp(dir, bw, routesOf(allZones({ e0d0x0: evaluated(1) })), data);
      const row = rows.find((r) => r.zone === zoneKey);
      expect(row?.reached).toBe(true);
      expect(row?.steps).toBe(3);
      expect(row?.dropped).toBe(0);
    });
  });

  it("counts a trailing drop when the guide ends before the level is reached", () => {
    withDir([".accept 3", ".turnin 3", ".accept 999"].join(EOL), (dir) => {
      const row = benchmarkRxp(dir, bw, routesOf(allZones({ e0d0x0: evaluated(1) })), data).find((r) => r.zone === zoneKey);
      expect(row?.reached).toBe(false);
      expect(row?.steps).toBe(2);
      expect(row?.dropped).toBe(1);
    });
  });
});

import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../model/constants";
import { initialState } from "../sim/simulate";
import { parseRxpGuide, runRxp } from "../bench/rxp";
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

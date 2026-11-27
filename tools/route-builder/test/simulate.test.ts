import { describe, expect, it } from "vitest";
import { CONSTANTS, XP_PER_LEVEL } from "../../../addon/src/core/constants";
import { distance } from "../../../addon/src/core/geometry";
import { questXp } from "../../../addon/src/core/questXp";
import { travelSpeed } from "../../../addon/src/game/routing";
import { BUILDER, COLLECT_QUANTILE, SCENARIOS } from "../model/constants";
import { killsForItems } from "../model/drops";
import { mobXp } from "../model/mobXp";
import type { Place, RouteQuest, Task } from "../model/world";
import { doTask, grindSecondsPerKill, initialState, simulate, type RouteStep, type SimOptions, type SimState } from "../sim/simulate";
import { info, place, quest, travel, world } from "./fixtures";

const scenario = SCENARIOS[1];
const NPC = BUILDER.npcInteractSec.value;
const STRICT: SimOptions = { maxLevelGap: null, tolerant: false, raceMask: 0 };
const TOLERANT: SimOptions = { ...STRICT, tolerant: true };
const RUN = CONSTANTS.runSpeed.value;
const data = travel();

function walk(a: Place, b: Place, speed = RUN): number {
  return (distance(a.pos, b.pos) * CONSTANTS.detourFactor.value) / speed;
}

function spacingWalk(loop: Place[], times: number, speed = RUN): number {
  let total = 0;
  for (let i = 1; i < loop.length; i++) total += walk(loop[i - 1], loop[i], speed);
  return (times * total) / (loop.length - 1);
}

function worldOf(quests: RouteQuest[]) {
  return world({ quests: new Map(quests.map((q) => [q.id, q])) });
}

function start(level = 1): SimState {
  return initialState(place(0), level, [], null);
}

function accept(q: RouteQuest): RouteStep {
  return { type: "accept", place: q.accept, questId: q.id };
}

function turnin(q: RouteQuest): RouteStep {
  return { type: "turnin", place: q.turnin, questId: q.id };
}

function total(seconds: number[]): number {
  return seconds.reduce((a, b) => a + b, 0);
}

describe("simulate", () => {
  it("charges travel, kills and turn-in by the formula", () => {
    const loop = [place(70, 100), place(90, 100), place(90, 130)];
    const task: Task = { kind: "kill", objectiveIndex: 0, count: 3, cluster: { center: loop[0], loop }, mobLevel: 5, elite: false, dropChance: 1, assumedDropChance: false };
    const q = quest(10, place(70), { level: 3 }, [task]);
    const steps: RouteStep[] = [accept(q), { type: "complete", place: loop[0], questId: q.id, objectiveIndex: 0 }, turnin(q)];
    const result = simulate(steps, start(), worldOf([q]), scenario, STRICT, data);

    const perKill = scenario.killSec.value + BUILDER.lootSec.value;
    const expectedSeconds =
      walk(place(0), q.accept) + NPC + walk(q.accept, loop[0]) + 3 * perKill + spacingWalk(loop, 3) + walk(loop[0], q.turnin) + NPC;
    const expectedXp = 3 * mobXp(1, 5, false) + questXp(100, 3, 1, 60);
    expect(expectedXp).toBeLessThan(XP_PER_LEVEL.values[0]);
    expect(result.violations).toEqual([]);
    expect(result.state.seconds).toBeCloseTo(expectedSeconds, 9);
    expect(result.state.xp).toBe(expectedXp);
    expect(result.state.level).toBe(1);
    expect(result.state.completed.has(q.id)).toBe(true);
    expect(result.state.inLog.has(q.id)).toBe(false);
    expect(total(result.outcomes.map((o) => o.seconds))).toBeCloseTo(expectedSeconds, 9);
  });

  it("uses the scenario drop chance for a collect task with an assumed rate", () => {
    const loop = [place(0, 50), place(0, 80)];
    const task: Task = { kind: "collect", objectiveIndex: 1, count: 3, cluster: { center: loop[0], loop }, mobLevel: 1, elite: false, dropChance: 0, assumedDropChance: true };
    const s = start();
    doTask(s, task, scenario);
    const kills = killsForItems(3, scenario.questDropChance.value, COLLECT_QUANTILE);
    expect(s.seconds).toBeCloseTo(kills * (scenario.killSec.value + BUILDER.lootSec.value) + spacingWalk(loop, kills), 9);
    const slow = start();
    doTask(slow, task, SCENARIOS[2]);
    expect(slow.seconds).toBeGreaterThan(s.seconds);
  });

  it("applies elite factor, collect quantile, object use and dungeon time", () => {
    const loop = [place(0, 50), place(0, 80)];
    const cluster = { center: loop[0], loop };
    const tasks: Task[] = [
      { kind: "kill", objectiveIndex: 0, count: 2, cluster, mobLevel: 1, elite: true, dropChance: 1, assumedDropChance: false },
      { kind: "collect", objectiveIndex: 1, count: 3, cluster, mobLevel: 1, elite: false, dropChance: 0.4, assumedDropChance: false },
      { kind: "use", objectiveIndex: 2, count: 4, cluster, mobLevel: 0, elite: false, dropChance: 1, assumedDropChance: false },
    ];
    const q = quest(20, place(0), {}, tasks);
    const d = { ...quest(21, place(0)), dungeonAreaId: 99 };
    d.info = info(21, { objectives: [{ index: 0, kind: "npc", id: 1, required: 1 }] });
    const w = world({
      quests: new Map([[q.id, q], [d.id, d]]),
      dungeons: [{ areaId: 99, name: "Test", entrance: place(0), questIds: [21] }],
    });
    const steps: RouteStep[] = [
      accept(q),
      accept(d),
      ...tasks.map((t): RouteStep => ({ type: "complete", place: loop[0], questId: q.id, objectiveIndex: t.objectiveIndex })),
      { type: "dungeon", place: place(0), dungeonAreaId: 99 },
      turnin(q),
      turnin(d),
    ];
    const result = simulate(steps, start(), w, scenario, STRICT, data);
    expect(result.violations).toEqual([]);
    const killSec = scenario.killSec.value;
    const loot = BUILDER.lootSec.value;
    const [kill, collect, use, dungeon] = result.outcomes.slice(2, 6);
    expect(kill.seconds).toBeCloseTo(walk(place(0), loop[0]) + 2 * (killSec * scenario.eliteFactor.value + loot) + spacingWalk(loop, 2), 9);
    expect(kill.xp).toBe(2 * mobXp(1, 1, true));
    const kills = killsForItems(3, 0.4, COLLECT_QUANTILE);
    expect(collect.seconds).toBeCloseTo(kills * (killSec + loot) + spacingWalk(loop, kills), 9);
    expect(use.seconds).toBeCloseTo(4 * BUILDER.objectUseSec.value + spacingWalk(loop, 4), 9);
    expect(use.xp).toBe(0);
    expect(dungeon.seconds).toBeCloseTo(walk(loop[0], place(0)) + scenario.dungeonSec.value, 9);
    expect(dungeon.xp).toBe(0);
    expect(result.state.completed).toEqual(new Set([20, 21]));
  });

  it("uses the mount speed after levelling to 40 mid-route", () => {
    const a = quest(30, place(0), { level: 39 });
    const b = quest(31, place(70), { level: 39, requiredLevel: 30 });
    const s = start(39);
    s.xp = XP_PER_LEVEL.values[38] - 1;
    const result = simulate([accept(a), turnin(a), accept(b)], s, worldOf([a, b]), scenario, STRICT, data);
    expect(result.state.level).toBe(40);
    expect(travelSpeed(40)).toBe(CONSTANTS.mountSpeed.value);
    expect(result.outcomes[2].seconds).toBeCloseTo(walk(place(0), place(70), CONSTANTS.mountSpeed.value) + NPC, 9);
  });

  it("rejects an accept below the required level, strictly or tolerantly", () => {
    const q = quest(40, place(0), { requiredLevel: 5 });
    const steps = [accept(q), turnin(q)];
    const strict = simulate(steps, start(), worldOf([q]), scenario, STRICT, data);
    expect(strict.violations).toHaveLength(2);
    expect(strict.violations[0]).toContain("accept 40");
    expect(strict.state.inLog.size).toBe(0);
    expect(strict.state.completed.size).toBe(0);

    const tolerant = simulate(steps, start(), worldOf([q]), scenario, TOLERANT, data);
    expect(tolerant.violations).toEqual([]);
    expect(tolerant.outcomes).toEqual([
      { seconds: 0, xp: 0, violation: null },
      { seconds: 0, xp: 0, violation: null },
    ]);
    expect(tolerant.state.skipped).toEqual(new Set([40]));
    expect(tolerant.state.completed.size).toBe(0);
  });

  it("reports logFull on the 21st accept", () => {
    const quests = Array.from({ length: 21 }, (_, i) => quest(100 + i, place(0)));
    const result = simulate(quests.map(accept), start(), worldOf(quests), scenario, STRICT, data);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("logFull");
    expect(result.state.inLog.size).toBe(20);
  });

  it("rejects the second of two exclusive quests", () => {
    const a = quest(50, place(0), { exclusiveTo: [51] });
    const b = quest(51, place(0), { exclusiveTo: [50] });
    const result = simulate([accept(a), accept(b)], start(), worldOf([a, b]), scenario, STRICT, data);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("accept 51");
    expect(result.state.inLog).toEqual(new Set([50]));
  });

  it("applies the max level gap option", () => {
    const nine = quest(60, place(0), { level: 9 });
    const eight = quest(61, place(0), { level: 8 });
    const opts: SimOptions = { ...STRICT, maxLevelGap: 2 };
    const result = simulate([accept(nine), accept(eight)], start(10), worldOf([nine, eight]), scenario, opts, data);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("accept 60");
    expect(result.state.inLog).toEqual(new Set([61]));
  });

  it("hearths when the stone is ready and walks during the cooldown", () => {
    const a = place(0);
    const b = place(3000);
    const steps: RouteStep[] = [
      { type: "setHearth", place: a },
      { type: "getFlightPath", place: b, taxiNodeId: 7 },
      { type: "hearth", place: a },
      { type: "setHearth", place: a },
      { type: "getFlightPath", place: b, taxiNodeId: 7 },
      { type: "hearth", place: a },
      { type: "setHearth", place: a },
    ];
    const result = simulate(steps, start(), worldOf([]), scenario, STRICT, data);
    const o = result.outcomes.map((x) => x.seconds);
    expect(o[1]).toBeCloseTo(walk(a, b) + NPC, 9);
    expect(o[2] + o[3]).toBeCloseTo(CONSTANTS.hearthCastSec.value + NPC, 9);
    expect(result.state.hearth.readyAt).toBeCloseTo(NPC + o[1] + CONSTANTS.hearthCooldownSec.value, 9);
    expect(o[5]).toBe(0);
    expect(o[6]).toBeCloseTo(walk(b, a) + NPC, 9);
    expect(result.state.knownTaxi).toEqual(new Set([7]));
  });

  it("does not charge the hearth penalty as simulated time", () => {
    const a = place(0);
    const b = place(3000);
    const steps: RouteStep[] = [{ type: "setHearth", place: a }, { type: "getFlightPath", place: b, taxiNodeId: 7 }, { type: "hearth", place: a }];
    const o = simulate(steps, start(), worldOf([]), scenario, STRICT, data).outcomes.map((x) => x.seconds);
    expect(o[2]).toBeCloseTo(CONSTANTS.hearthCastSec.value, 9);
  });

  function grindSeconds(from: number, xpStart: number, to: number, mobLevel: number, spacing: number) {
    let level = from;
    let xp = xpStart;
    let gained = 0;
    let seconds = 0;
    while (level < to) {
      const k = mobXp(level, mobLevel, false);
      seconds += scenario.killSec.value + BUILDER.lootSec.value + (spacing * CONSTANTS.detourFactor.value) / travelSpeed(level);
      xp += k;
      gained += k;
      while (level < to && xp >= XP_PER_LEVEL.values[level - 1]) {
        xp -= XP_PER_LEVEL.values[level - 1];
        level += 1;
      }
    }
    return { xp, gained, seconds };
  }

  it("prices one grind kill as kill, loot and the walk of the spacing", () => {
    const s = start();
    const walking = (40 * CONSTANTS.detourFactor.value) / travelSpeed(s.level);
    expect(grindSecondsPerKill(s, 40, scenario)).toBeCloseTo(scenario.killSec.value + BUILDER.lootSec.value + walking, 9);
    expect(grindSecondsPerKill(s, 0, scenario)).toBe(scenario.killSec.value + BUILDER.lootSec.value);
  });

  it("grinds to the target level with per-level XP and walks the spacing per kill", () => {
    const step: RouteStep = { type: "grind", place: place(0), grindToLevel: 3, grindMobLevel: 2, grindSpacingYards: 15 };
    const result = simulate([step], start(), worldOf([]), scenario, STRICT, data);
    const expected = grindSeconds(1, 0, 3, 2, 15);
    expect(result.state.level).toBe(3);
    expect(result.state.xp).toBe(expected.xp);
    expect(result.outcomes[0].xp).toBe(expected.gained);
    expect(result.outcomes[0].seconds).toBeCloseTo(expected.seconds, 9);
  });

  it("recomputes grind walking speed when the mount level is reached", () => {
    const s = start(39);
    s.xp = XP_PER_LEVEL.values[38] - 100;
    const step: RouteStep = { type: "grind", place: place(0), grindToLevel: 41, grindMobLevel: 39, grindSpacingYards: 40 };
    const result = simulate([step], s, worldOf([]), scenario, STRICT, data);
    expect(travelSpeed(40)).not.toBe(travelSpeed(39));
    expect(result.outcomes[0].seconds).toBeCloseTo(grindSeconds(39, s.xp, 41, 39, 40).seconds, 9);
  });

  it("rejects a grind step without spacing", () => {
    expect(() => simulate([{ type: "grind", place: place(0), grindToLevel: 3, grindMobLevel: 2 }], start(), worldOf([]), scenario, STRICT, data)).toThrow(
      /step 0 \(grind\).*grindSpacingYards/,
    );
  });

  it("stops XP at level 60", () => {
    const q = quest(70, place(0), { level: 60 });
    const s = start(60);
    const result = simulate([accept(q), turnin(q)], s, worldOf([q]), scenario, STRICT, data);
    expect(result.state.level).toBe(60);
    expect(result.state.xp).toBe(0);
    expect(result.outcomes[1].xp).toBe(0);
  });

  it("names the step and quest of an unknown quest id", () => {
    expect(() => simulate([{ type: "accept", place: place(0), questId: 999 }], start(), worldOf([]), scenario, STRICT, data)).toThrow(
      /step 0.*999/,
    );
  });

  it("does not mutate the start state", () => {
    const q = quest(80, place(70));
    const s = start();
    simulate([accept(q)], s, worldOf([q]), scenario, STRICT, data);
    expect(s.seconds).toBe(0);
    expect(s.inLog.size).toBe(0);
  });
});

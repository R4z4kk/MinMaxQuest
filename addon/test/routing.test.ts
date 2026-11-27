import { describe, expect, it } from "vitest";
import { CONSTANTS } from "../src/core/constants";
import type { WorldPos } from "../src/core/geometry";
import { loadCharDb } from "../src/core/storage";
import type { TravelData } from "../src/data/generated/travel";
import type { QuestInfo, QuestRepository } from "../src/data/questRepository";
import type { PlayerSnapshot } from "../src/game/engine";
import { createRouting, travelSpeed } from "../src/game/routing";

const at = (x: number): WorldPos => ({ continent: 0, x, y: 0 });

function quest(id: number, over: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id, name: `Q${id}`, level: 10, requiredLevel: 1, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
    ...over,
  };
}

const QUESTS = [quest(1, { zoneAreaId: 12 }), quest(2, { zoneAreaId: 12 }), quest(3, { zoneAreaId: 40 })];

const repo: QuestRepository = {
  get: (id) => QUESTS.find((q) => q.id === id) ?? null,
  allIds: () => [1, 2, 3, 404],
  npcSpawns: () => [],
  objectSpawns: () => [],
  itemSources: () => ({ npcs: [], objects: [] }),
  uiMapIdForArea: () => null,
  lastError: () => null,
};

const NO_TRAVEL: TravelData = {
  source: { name: "Shortest Path Forever", version: "test", build: "test", generatedOn: "2026-11-27" },
  taxiNodes: [],
  taxiEdges: [],
  transports: [],
};

const snapshot = (pos: WorldPos | null): PlayerSnapshot => ({
  pos,
  state: { level: 10, raceMask: 1, classMask: 1, completed: new Set(), inLog: new Set() },
  log: new Map(),
  greenRange: 5,
  faction: "A",
  hearth: { ready: false, pos: null },
  maxLevel: 60,
});

function setup() {
  const db = loadCharDb(null);
  const routing = createRouting(repo, db, (q) => [at(q.id * 70)], NO_TRAVEL);
  return { db, routing };
}

describe("travelSpeed", () => {
  it("runs below 40, mounts from 40 and uses the epic mount at 60", () => {
    expect(travelSpeed(39)).toBe(CONSTANTS.runSpeed.value);
    expect(travelSpeed(40)).toBe(CONSTANTS.mountSpeed.value);
    expect(travelSpeed(59)).toBe(CONSTANTS.mountSpeed.value);
    expect(travelSpeed(60)).toBe(CONSTANTS.epicMountSpeed.value);
  });
});

describe("routing", () => {
  it("lists every known quest sorted by walking time", () => {
    const { routing } = setup();
    const targets = routing.completion(snapshot(at(0)));
    expect(targets.map((t) => t.questId)).toEqual([1, 2, 3]);
    expect(targets[0].seconds).toBeCloseTo((70 * CONSTANTS.detourFactor.value) / CONSTANTS.runSpeed.value, 6);
    expect(routing.quests().map((q) => q.id)).toEqual([1, 2, 3]);
  });

  it("excludes skipped quests and applies the zone option", () => {
    const { db, routing } = setup();
    db.skippedQuests.push(2);
    expect(routing.completion(snapshot(at(0))).map((t) => t.questId)).toEqual([1, 3]);
    db.completion.mode = "zone";
    db.completion.zoneAreaId = 12;
    expect(routing.completion(snapshot(at(0))).map((t) => t.questId)).toEqual([1]);
  });

  it("returns nothing without a position", () => {
    expect(setup().routing.completion(snapshot(null))).toEqual([]);
  });

  it("gives the first hop of the last solved plan", () => {
    const { routing } = setup();
    const [first] = routing.completion(snapshot(at(0)));
    expect(routing.firstHop(first)).toEqual({ kind: "walk", pos: at(70), taxiNodeId: null });
  });

  it("has no first hop before any plan", () => {
    const solvedElsewhere = setup().routing.completion(snapshot(at(0)))[0];
    expect(setup().routing.firstHop(solvedElsewhere)).toBeNull();
  });
});

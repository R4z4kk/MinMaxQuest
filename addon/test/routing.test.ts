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
    objectives: [], baseXp: 0, hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false, isElite: false, zoneAreaId: null,
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
  npcFriendlyTo: () => null,
  npcName: () => null,
  objectName: () => null,
  lastError: () => null,
};

const NO_TRAVEL: TravelData = {
  source: { name: "Shortest Path Forever", version: "test", build: "test", cmangosCommit: "test", wagoBuild: "test", commit: "test", verifiedOn: "2026-11-27", expiresOn: "2026-12-27" },
  taxiNodes: [],
  taxiEdges: [],
  transports: [],
  portals: [],
  walkPlaces: [],
  walks: [],
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

const FLIGHT: TravelData = {
  ...NO_TRAVEL,
  taxiNodes: [
    { id: 1, name: "A", pos: at(100), faction: "AH" },
    { id: 2, name: "B", pos: at(10000), faction: "AH" },
  ],
  taxiEdges: [{ from: 1, to: 2, seconds: 60 }],
};

describe("routing caches", () => {
  it("clusters each objective once across refreshes", () => {
    let reads = 0;
    const db = loadCharDb(null);
    const q = quest(1, { objectives: [{ kind: "npc", id: 5, required: 1, index: 1 }] });
    const local: QuestRepository = { ...repo, get: (id) => (id === 1 ? q : null), allIds: () => [1] };
    const routing = createRouting(local, db, () => (reads++, [at(70)]), NO_TRAVEL);
    const inLog = { ...snapshot(at(0)), log: new Map([[1, { complete: false, objectivesDone: new Set<number>() }]]) };
    const first = routing.completion(inLog);
    const second = routing.completion(inLog);
    expect(reads).toBe(1);
    expect(second[0].cluster).toBe(first[0].cluster);
  });

  it("uses fresh nearest nodes after the graph is rebuilt", () => {
    const db = loadCharDb(null);
    const spot = at(10050);
    const routing = createRouting({ ...repo, get: (id) => (id === 1 ? quest(1) : null), allIds: () => [1] }, db, () => [spot], FLIGHT);
    const walk = CONSTANTS.detourFactor.value / CONSTANTS.runSpeed.value;
    expect(routing.completion(snapshot(at(0)))[0].seconds).toBeCloseTo(10050 * walk, 6);
    db.knownTaxiNodes = [1, 2];
    expect(routing.completion(snapshot(at(0)))[0].seconds).toBeCloseTo(150 * walk + 60, 6);
  });
});

describe("routing proximity perimeter", () => {
  const withMaps = (nearby: Set<number>, zones: Record<number, number> = {}) => {
    const db = loadCharDb(null);
    const local: QuestRepository = { ...repo, uiMapIdForArea: (areaId) => (areaId === 12 ? 100 : 200) };
    const scope = { maps: () => nearby, zoneOf: (id: number) => zones[id] ?? id };
    return { db, routing: createRouting(local, db, (q) => [at(q.id * 70)], NO_TRAVEL, scope) };
  };

  it("keeps only nearby zone maps in proximity, leaving zone mode alone", () => {
    const { db, routing } = withMaps(new Set([100]));
    expect(routing.completion(snapshot(at(0))).map((t) => t.questId)).toEqual([1, 2]);
    db.completion.mode = "zone";
    db.completion.zoneAreaId = 40;
    expect(routing.completion(snapshot(at(0))).map((t) => t.questId)).toEqual([3]);
  });

  it("lists nothing in proximity when no zone can be resolved", () => {
    expect(withMaps(new Set<number>()).routing.completion(snapshot(at(0)))).toEqual([]);
  });

  it("keeps a dungeon quest whose parent zone is nearby and drops one whose parent is far", () => {
    const kept = withMaps(new Set([100]), { 200: 100 }).routing.completion(snapshot(at(0)));
    expect(kept.map((t) => t.questId)).toEqual([1, 2, 3]);
    const dropped = withMaps(new Set([100]), { 200: 300 }).routing.completion(snapshot(at(0)));
    expect(dropped.map((t) => t.questId)).toEqual([1, 2]);
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

  it("applies the zone option", () => {
    const { db, routing } = setup();
    db.completion.mode = "zone";
    db.completion.zoneAreaId = 12;
    expect(routing.completion(snapshot(at(0))).map((t) => t.questId)).toEqual([1, 2]);
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

describe("hearth penalty by mode", () => {
  const home = at(20000);
  const withHearth = (): PlayerSnapshot => ({ ...snapshot(at(0)), hearth: { ready: true, pos: home } });

  it("uses the quest-mode penalty in quest mode", () => {
    const { db, routing } = setup();
    db.activeMode = "quest";
    expect(routing.timeTo(withHearth())?.(home)).toBeCloseTo(CONSTANTS.hearthCastSec.value + CONSTANTS.hearthPenaltySec.value);
  });

  it("uses the larger completion penalty in completion mode", () => {
    const { db, routing } = setup();
    db.activeMode = "completion";
    expect(routing.timeTo(withHearth())?.(home)).toBeCloseTo(
      CONSTANTS.hearthCastSec.value + CONSTANTS.completionHearthPenaltySec.value,
    );
  });
});

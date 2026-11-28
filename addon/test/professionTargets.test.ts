import { beforeAll, describe, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import { setLocale } from "../src/core/l10n";
import type { AreaPoint, QuestInfo, QuestRepository } from "../src/data/questRepository";
import { describeTarget } from "../src/game/engine";
import { createPlaceFor, createPositions } from "../src/game/positions";
import type { ObtainHow, ObtainPlan, PlanFor } from "../src/game/professions";
import { chainBlock } from "../src/route/insert";
import { selectTargets, type CompletionInput, type Target } from "../src/targets/completion";

const at = (x: number, y = 0): WorldPos => ({ continent: 0, x, y });

function quest(over: Partial<QuestInfo> = {}): QuestInfo {
  return {
    id: 4201, name: "The Love Potion", level: 58, requiredLevel: 50, requiredMaxLevel: null, races: 0, classes: 0,
    preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
    starterNpcs: [1], starterObjects: [], starterItems: [], finisherNpcs: [1], finisherObjects: [],
    objectives: [
      { kind: "item", id: 8846, required: 4, index: 1 },
      { kind: "npc", id: 5, required: 1, index: 2 },
    ],
    baseXp: 0, hasUnsupportedRequirement: false, repeatable: false, seasonal: false, clothDonation: false, isElite: false, zoneAreaId: null,
    sourceItemId: null, requiredSourceItems: [],
    ...over,
  };
}

function plan(how: ObtainHow, npcs: number[] = [], objects: number[] = []): ObtainPlan {
  return { how, itemId: 8846, item: "Gromsblood", npcs, objects, key: `${how}:` };
}

const planFor = (how: ObtainHow | null): PlanFor => (q, index) => (q.objectives.find((o) => o.index === index)?.kind === "item" && how != null ? plan(how) : null);

function input(q: QuestInfo, positions: Record<string, WorldPos[]>, over: Partial<CompletionInput> = {}): CompletionInput {
  return {
    quests: [q],
    log: new Map([[q.id, { complete: false, objectivesDone: new Set<number>(), counts: [{ have: 1, need: 4 }, { have: 0, need: 1 }] }]]),
    player: { level: 58, raceMask: 1, classMask: 1, completed: new Set(), inLog: new Set([q.id]) },
    greenRange: 5,
    positionsFor: (quest, kind, index) => positions[`${quest.id}:${kind}:${index}`] ?? [],
    timeTo: (p) => p.x,
    clusters: new Map(),
    ...over,
  };
}

const opts = { mode: "log" as const, zoneAreaId: null, showTrivial: true, showElite: true, minLevelGap: null, pinnedQuestId: null, maxLevel: 60 };

beforeAll(() => setLocale("enUS"));

describe("profession objectives in completion", () => {
  it("lists a craft objective without a position, with the remaining count", () => {
    const targets = selectTargets(input(quest(), { "4201:objective:2": [at(50)] }, { planFor: planFor("craft") }), opts);
    const craft = targets.find((t) => t.objectiveIndex === 1);
    expect(craft).toMatchObject({ pos: null, cluster: null, seconds: Infinity, obtain: { how: "craft", item: "Gromsblood", count: 3 } });
    expect(targets.map((t) => t.objectiveIndex)).toEqual([2, 1]);
    expect(describeTarget(craft as Target, quest())).toBe("The Love Potion · Craft Gromsblood ×3");
  });

  it("targets the auction house for a bought item and labels it", () => {
    const targets = selectTargets(input(quest(), { "4201:objective:1": [at(30)] }, { planFor: planFor("buy") }), opts);
    expect(targets[0]).toMatchObject({ pos: at(30), seconds: 30, obtain: { how: "buy", count: 3 } });
    expect(describeTarget(targets[0], quest())).toBe("The Love Potion · Buy Gromsblood ×3 at the Auction House");
  });

  it("labels fishing, and keeps the objective label for gathering", () => {
    const fish = selectTargets(input(quest(), {}, { planFor: planFor("fish") }), opts);
    expect(describeTarget(fish[0], quest())).toBe("The Love Potion · Fish Gromsblood ×3");
    const gather = selectTargets(input(quest(), { "4201:objective:1": [at(30)] }, { planFor: planFor("gather") }), opts);
    expect(describeTarget(gather[0], quest())).toBe("The Love Potion · objective 1");
  });

  it("uses the required count without log counts", () => {
    const q = quest();
    const log = new Map([[q.id, { complete: false, objectivesDone: new Set<number>() }]]);
    const targets = selectTargets(input(q, {}, { planFor: planFor("craft"), log }), opts);
    expect(targets[0].obtain?.count).toBe(4);
  });

  it("recomputes cached clusters when the plan changes", () => {
    const clusters = new Map();
    const positions = { "4201:objective:1": [at(30)] };
    selectTargets(input(quest(), positions, { planFor: planFor(null), clusters }), opts);
    const moved = { "4201:objective:1": [at(80)] };
    const targets = selectTargets(input(quest(), moved, { planFor: planFor("buy"), clusters }), opts);
    expect(targets.find((t) => t.objectiveIndex === 1)?.pos).toEqual(at(80));
  });
});

const SPAWNS: Record<number, AreaPoint[]> = {
  12258: [{ areaId: 1, x: 900, y: 0 }],
  142145: [{ areaId: 1, x: 400, y: 0 }],
  8670: [{ areaId: 1, x: 100, y: 0 }],
  8671: [{ areaId: 1, x: 200, y: 0 }],
  9000: [{ areaId: 1, x: 10, y: 0 }],
};

function repo(): QuestRepository {
  return {
    get: () => null,
    allIds: () => [],
    npcSpawns: (id) => SPAWNS[id] ?? [],
    objectSpawns: (id) => SPAWNS[id] ?? [],
    itemSources: () => ({ npcs: [12258], objects: [142145] }),
    uiMapIdForArea: () => 7,
    npcFriendlyTo: () => null,
    npcName: () => null,
    objectName: () => null,
    itemName: () => null,
    lastError: () => null,
  };
}

const AUCTIONEERS = [{ npcId: 8670, faction: "A" as const }, { npcId: 8671, faction: "AH" as const }, { npcId: 9000, faction: "H" as const }];
const toPos = (p: AreaPoint): WorldPos => at(p.x);
const xs = (points: WorldPos[]) => points.map((p) => p.x);

describe("profession objectives in positions", () => {
  it("drops mob drops: friendly auctioneers to buy, plan sources to gather, none to craft", () => {
    const q = quest();
    const positions = (how: ObtainHow | null) => createPositions(repo(), toPos, () => "A", planFor(how), AUCTIONEERS);
    expect(xs(positions(null)(q, "objective", 1))).toEqual([900, 400]);
    expect(xs(positions("buy")(q, "objective", 1))).toEqual([100, 200]);
    expect(xs(positions("craft")(q, "objective", 1))).toEqual([]);
    const gather = createPositions(repo(), toPos, () => "A", () => plan("gather", [], [142145]), AUCTIONEERS);
    expect(xs(gather(q, "objective", 1))).toEqual([400]);
  });

  it("places a bought objective at the nearest friendly auctioneer and a crafted one anywhere", () => {
    const toWorld = (_m: number, x: number, y: number): WorldPos => ({ continent: 0, x, y });
    const place = (how: ObtainHow) => createPlaceFor(repo(), () => "A", () => at(190), toWorld, planFor(how), AUCTIONEERS);
    expect(place("buy")(quest(), "objective", 1)).toEqual({ uiMapId: 7, x: 200, y: 0 });
    expect(place("craft")(quest(), "objective", 1)).toBe("anywhere");
  });

  it("skips an objective that needs no place when inserting a chain", () => {
    const q = quest({ objectives: [{ kind: "item", id: 8846, required: 4, index: 1 }] });
    const { block, unplaceable } = chainBlock([q.id], () => q, (_q, kind) => (kind === "objective" ? "anywhere" : { uiMapId: 7, x: 1, y: 1 }));
    expect(unplaceable).toBe(0);
    expect(block.steps.map((s) => s.type)).toEqual(["accept", "turnin"]);
  });
});

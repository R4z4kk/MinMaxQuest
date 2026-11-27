import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { WorldPos } from "../src/core/geometry";
import { setLocale } from "../src/core/l10n";
import { resetReports, setReportSink } from "../src/core/report";
import { loadCharDb, type CharDb } from "../src/core/storage";
import type { QuestInfo } from "../src/data/questRepository";
import type { PlayerSnapshot } from "../src/game/engine";
import { encodeSteps, type EmittedStep, type StepType } from "../src/route/format";
import { createRouteFollower } from "../src/route/follower";

const grind = (targetLevel: number, x: number, type: StepType = "grind"): EmittedStep => ({
  type, uiMapId: 1, x, y: 0, targetLevel, targetXpIntoLevel: 0, estCostSeconds: 10, estXpGain: 0,
});
const SEGMENT = [grind(2, 0), grind(3, 1)];
const TRUNK = [grind(10, 10), grind(11, 20), grind(12, 30), grind(13, 40)];
const quest: QuestInfo = {
  id: 900, name: "Back to the dungeon", level: 12, requiredLevel: 11, requiredMaxLevel: null, races: 0, classes: 0,
  preGroup: [], preSingle: [], exclusiveTo: [], nextInChain: null, children: [],
  starterNpcs: [], starterObjects: [], finisherNpcs: [], finisherObjects: [],
  objectives: [], baseXp: null, hasUnsupportedRequirement: false, isElite: false, zoneAreaId: null,
};

const locked: QuestInfo = { ...quest, id: 901, name: "Later on", requiredLevel: 15 };

function install(constants: Record<string, number> = { segmentEndLevel: 10 }, trunk: EmittedStep[] = TRUNK): void {
  (globalThis as Record<string, unknown>).MinMaxQuestRoutes = {
    Alliance: {
      meta: { build: "1.60.1.71139", questieDb: "v", generatedOn: "2026-11-27", constants },
      segmentRaces: { seg: 1 },
      segments: { seg: { e0d0x0: encodeSteps(SEGMENT), e1d0x0: encodeSteps(SEGMENT) } },
      trunk: { e0d0x0: encodeSteps(trunk), e1d0x0: encodeSteps(trunk) },
      returnBlocks: { 7: encodeSteps([{ ...grind(0, 25, "accept"), questId: 900 }]) },
    },
  };
}

function snapshot(level: number, x = 0): PlayerSnapshot {
  return {
    pos: { continent: 0, x, y: 0 },
    state: { level, raceMask: 1, classMask: 1, completed: new Set(), inLog: new Set() },
    log: new Map(),
    greenRange: 5,
    faction: "A",
    hearth: { ready: true, pos: null },
    maxLevel: 60,
    xpIntoLevel: 0,
  };
}

function follower(db: CharDb, combat = { on: false }) {
  return createRouteFollower({
    db,
    faction: () => "A",
    quest: (id) => (id === 900 ? quest : id === 901 ? locked : null),
    toWorld: (_m, x, y): WorldPos => ({ continent: 0, x, y }),
    place: () => null,
    timeTo: () => () => 1,
    inCombat: () => combat.on,
    taxiNodes: [
      { id: 18, name: "Booty Bay (Horde)", pos: { continent: 0, x: 1990, y: 0 }, faction: "H" },
      { id: 19, name: "Booty Bay", pos: { continent: 0, x: 2050, y: 0 }, faction: "A" },
      { id: 5, name: "Lakeshire", pos: { continent: 0, x: 5000, y: 0 }, faction: "A" },
    ],
  });
}

const reports: string[] = [];
beforeAll(() => setLocale("enUS"));
beforeEach(() => {
  reports.length = 0;
  resetReports();
  setReportSink((line) => reports.push(line));
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).MinMaxQuestRoutes;
});

it("follows segment then trunk from step 0 at level 1", () => {
  install();
  const db = loadCharDb(null);
  const f = follower(db);
  const list = f.targets(snapshot(1));
  expect(list?.[0]).toMatchObject({ questId: null, kind: "route", route: { index: 0, type: "grind", label: "Grind to level 2" } });
  expect(db.route).toMatchObject({ variant: "e0d0x0:seg:1@2026-11-27", startIndex: 0 });
  expect(f.view()).toMatchObject({ current: 0, total: 6, currentText: "Grind to level 2" });
});

it("starts on the trunk, re-synced, when first loaded at level 12, and keeps a segment once chosen", () => {
  install();
  const late = loadCharDb(null);
  follower(late).targets(snapshot(12));
  expect(late.route).toMatchObject({ variant: "e0d0x0::1@2026-11-27", startIndex: 1 });

  const early = loadCharDb(null);
  follower(early).targets(snapshot(1));
  const reloaded = follower(early);
  reloaded.targets(snapshot(12));
  expect(early.route.variant).toBe("e0d0x0:seg:1@2026-11-27");
  expect(reloaded.view()?.total).toBe(6);
});

it("re-syncs to the first step at the player's level minus one", () => {
  install();
  const db = loadCharDb(null);
  const f = follower(db);
  f.targets(snapshot(1));
  f.targets(snapshot(12));
  f.resync();
  f.targets(snapshot(12));
  expect(db.route.startIndex).toBe(3);
  expect(f.view()?.current).toBe(5);
});

it("keeps a skipped step on the same step when a dungeon return is inserted before it", () => {
  install();
  const db = loadCharDb(null);
  const f = follower(db);
  f.targets(snapshot(11));
  db.route.skippedSteps = [3];
  db.dungeonReturns = [7];
  f.targets(snapshot(11));
  expect(f.view()?.total).toBe(5);
  expect(db.route.skippedSteps).toEqual([4]);
  expect(f.view()).toMatchObject({ current: 2, next: [3], currentText: "Back to the dungeon · pick up" });
});

it("waits for the end of combat to change the variant", () => {
  install();
  const db = loadCharDb(null);
  const combat = { on: false };
  const f = follower(db, combat);
  f.targets(snapshot(1));
  combat.on = true;
  db.routeElites = true;
  expect(f.targets(snapshot(1))?.[0].route?.index).toBe(0);
  expect(db.route.variant).toBe("e0d0x0:seg:1@2026-11-27");
  combat.on = false;
  f.targets(snapshot(1));
  expect(db.route.variant).toBe("e1d0x0:seg:1@2026-11-27");
});

it("completes a setHearth step on HEARTHSTONE_BOUND only while it is current", () => {
  install({ segmentEndLevel: 10 }, [grind(10, 10, "setHearth"), grind(11, 20)]);
  const db = loadCharDb(null);
  const f = follower(db);
  f.hearthBound();
  f.targets(snapshot(10));
  expect(f.view()?.current).toBe(0);
  f.hearthBound();
  f.targets(snapshot(10));
  expect(f.view()?.current).toBe(1);
});

it("is unavailable, reported once, without segmentEndLevel", () => {
  install({});
  const f = follower(loadCharDb(null));
  expect(f.targets(snapshot(1))).toBeNull();
  expect(f.targets(snapshot(1))).toBeNull();
  expect(reports).toEqual(["MinMaxQuest: Routes not installed - use Completion meanwhile (meta.constants.segmentEndLevel missing)"]);
  expect(f.unavailable()).toBe("meta.constants.segmentEndLevel missing");
});

it("reports once when no route file is loaded", () => {
  const f = follower(loadCharDb(null));
  expect(f.targets(snapshot(1))).toBeNull();
  expect(f.targets(snapshot(1))).toBeNull();
  expect(reports).toEqual(["MinMaxQuest: Routes not installed - use Completion meanwhile (Route data missing: MinMaxQuestRoutes is not loaded (Alliance))"]);
  expect(f.routesBuild()).toBeNull();
});

it("flies from the nearest node of the player's faction", () => {
  install({ segmentEndLevel: 10 }, [{ ...grind(11, 2000, "fly"), taxiNodeId: 5 }]);
  const f = follower(loadCharDb(null));
  const target = f.targets(snapshot(10))?.[0];
  expect(target?.route?.type).toBe("fly");
  expect(target == null ? null : f.taxiLeg(target)).toEqual({ from: 19, to: 5 });
});

it("lets completion drive the arrow when first loaded in combat", () => {
  install();
  const combat = { on: true };
  const f = follower(loadCharDb(null), combat);
  expect(f.targets(snapshot(1))).toBeNull();
  combat.on = false;
  expect(f.targets(snapshot(1))?.[0].route?.index).toBe(0);
});

it("never falls back to a travel step once it was done", () => {
  install({ segmentEndLevel: 10 }, [grind(10, 10), { ...grind(11, 20, "fly"), taxiNodeId: 5 }, grind(12, 30)]);
  const db = loadCharDb(null);
  const f = follower(db);
  f.targets(snapshot(10, 0));
  expect(f.view()?.current).toBe(1);
  f.targets(snapshot(10, 5000));
  expect(f.view()?.current).toBe(2);
  expect(db.route.skippedSteps).toEqual([1]);
  f.targets(snapshot(10, 6000));
  expect(f.view()?.current).toBe(2);
  const reloaded = follower(db);
  reloaded.targets(snapshot(10, 6000));
  expect(reloaded.view()?.current).toBe(2);
});

it("labels a dungeon step without naming the entrance zone", () => {
  const around = (type: StepType, x: number): EmittedStep => ({ ...grind(11, x, type), questId: 900 });
  install({ segmentEndLevel: 10 }, [around("accept", 5), grind(11, 10, "dungeon"), around("turnin", 15)]);
  const f = follower(loadCharDb(null));
  f.targets(snapshot(11));
  expect(f.view()?.nextTexts[0]).toBe("Run the dungeon");
});

it("exposes the displayed step identity, objective progress and next distance", () => {
  install({ segmentEndLevel: 10 }, [
    { ...grind(10, 10, "complete"), questId: 900, objectiveIndex: 1 },
    grind(11, 20),
  ]);
  const db = loadCharDb(null);
  const f = follower(db);
  const snap = snapshot(10);
  snap.log.set(900, { complete: false, objectivesDone: new Set(), counts: [{ have: 6, need: 10 }] });
  snap.state.inLog.add(900);
  f.targets(snap);
  const view = f.view();
  expect(view?.currentQuestId).toBe(900);
  expect(view?.currentIndex).toBe(view?.current);
  expect(view?.currentProgress).toEqual({ have: 6, need: 10 });
  expect(view?.nextDistance).toBe(20);
});

it("aims past a level-locked accept to the next doable step", () => {
  install({ segmentEndLevel: 10 }, [{ ...grind(10, 30, "accept"), questId: 901 }, grind(11, 50)]);
  const f = follower(loadCharDb(null));
  const list = f.targets(snapshot(10));
  expect(f.view()).toMatchObject({ current: 0, target: 1 });
  expect(list?.map((t) => t.route?.index)).toEqual([1, 0]);
});

it("is unavailable while the wanted variant fails to decode", () => {
  install();
  const routes = (globalThis as Record<string, { Alliance: { trunk: Record<string, string> } }>).MinMaxQuestRoutes;
  routes.Alliance.trunk.e1d0x0 = "z;1;2";
  const db = loadCharDb(null);
  const f = follower(db);
  expect(f.targets(snapshot(1))).not.toBeNull();
  expect(f.unavailable()).toBeNull();
  db.routeElites = true;
  expect(f.targets(snapshot(1))).toBeNull();
  expect(f.unavailable()).toContain("e1d0x0");
  db.routeElites = false;
  expect(f.unavailable()).toBeNull();
  expect(f.targets(snapshot(1))).not.toBeNull();
});

it("is unavailable when the first variant fails to decode", () => {
  install();
  const routes = (globalThis as Record<string, { Alliance: { trunk: Record<string, string> } }>).MinMaxQuestRoutes;
  routes.Alliance.trunk.e0d0x0 = "z;1;2";
  const f = follower(loadCharDb(null));
  expect(f.targets(snapshot(12))).toBeNull();
  expect(f.unavailable()).toContain("e0d0x0");
});

import { describe, expect, it } from "vitest";
import { ACCOUNT_DEFAULTS, CHAR_DEFAULTS, type CharDb, loadAccountDb, loadCharDb, withDefaults } from "../src/core/storage";

const D = { a: 1, b: "x", c: { d: true, e: [] as number[] }, f: null as number | null };

describe("withDefaults", () => {
  it("returns defaults for null and non-object input", () => {
    expect(withDefaults(null, D)).toEqual(D);
    expect(withDefaults(5, D)).toEqual(D);
  });
  it("does not share references with defaults", () => {
    const out = withDefaults(null, D);
    out.c.e.push(1);
    expect(D.c.e).toEqual([]);
  });
  it("fills missing keys", () => expect(withDefaults({ a: 7 }, D)).toEqual({ ...D, a: 7 }));
  it("replaces wrong primitive types", () =>
    expect(withDefaults({ a: "no", b: 3, c: { d: "no" } }, D)).toEqual(D));
  it("drops extra keys", () => expect(withDefaults({ z: 1, c: { y: 2 } }, D)).toEqual(D));
  it("keeps saved arrays", () => expect(withDefaults({ c: { e: [1, 2] } }, D).c.e).toEqual([1, 2]));
  it("keeps saved map-like tables for empty defaults", () =>
    expect(withDefaults({ m: { 5: "x" } }, { m: {} as Record<number, string> }).m).toEqual({ 5: "x" }));
  it("null default without shape accepts anything", () => expect(withDefaults({ f: 9 }, D).f).toBe(9));
});

describe("loadCharDb", () => {
  it("returns CHAR_DEFAULTS values for nothing saved", () => expect(loadCharDb(null)).toEqual(CHAR_DEFAULTS));
  it("accepts documented shapes in nullable fields", () => {
    const saved: Partial<CharDb> = {
      window: { x: 1, y: 2 },
      arrow: { x: 3, y: 4, locked: true },
      minLevelGap: 3,
      pinnedQuestId: 99,
      expandedChain: "chain",
      hearthPos: { continent: 1, x: 5, y: 6 },
      completion: { mode: "zone", zoneAreaId: 12, showTrivial: false, showElite: true },
    };
    const db = loadCharDb(saved);
    expect(db.window).toEqual({ x: 1, y: 2 });
    expect(db.arrow).toEqual({ x: 3, y: 4, locked: true });
    expect(db.minLevelGap).toBe(3);
    expect(db.pinnedQuestId).toBe(99);
    expect(db.expandedChain).toBe("chain");
    expect(db.hearthPos).toEqual({ continent: 1, x: 5, y: 6 });
    expect(db.completion.zoneAreaId).toBe(12);
    expect(db.completion.mode).toBe("zone");
  });
  it("resets wrong shapes in nullable fields to null", () => {
    const db = loadCharDb({ window: "bad", arrow: 5, minLevelGap: "x", pinnedQuestId: {}, expandedChain: 3, hearthPos: 4 });
    expect(db.window).toBeNull();
    expect(db.arrow).toBeNull();
    expect(db.minLevelGap).toBeNull();
    expect(db.pinnedQuestId).toBeNull();
    expect(db.expandedChain).toBeNull();
    expect(db.hearthPos).toBeNull();
  });
  it("keeps explicit null", () => expect(loadCharDb({ window: null }).window).toBeNull());
  it("keeps route options and defaults them to false", () => {
    expect([CHAR_DEFAULTS.routeElites, CHAR_DEFAULTS.routeDungeons]).toEqual([false, false]);
    const db = loadCharDb({ routeElites: true, routeDungeons: "x" });
    expect([db.routeElites, db.routeDungeons]).toEqual([true, false]);
  });
  it("has empty taxiNames by default", () => expect(loadCharDb(null).taxiNames).toEqual({}));
  it("rejects an unknown tab or mode", () => {
    expect(loadCharDb({ tab: "nope" }).tab).toBe("quest");
    expect(loadCharDb({ completion: { mode: "nope" } }).completion.mode).toBe("proximity");
  });
});

describe("nil-valued defaults (Lua drops null keys)", () => {
  it("still merges saved values for keys omitted from defaults", () => {
    const defaults = { a: 1, inner: { n: 1 } } as { a: number; inner: { n: number; z?: number | null }; w?: { x: number } | null };
    const out = withDefaults({ w: { x: 4 }, inner: { z: 2 } }, defaults, { w: { x: 0 }, inner: { z: 0 } });
    expect(out.w).toEqual({ x: 4 });
    expect(out.inner.z).toBe(2);
  });
});

describe("route state", () => {
  it("defaults the active mode, the route state and the dungeon returns", () => {
    const db = loadCharDb(null);
    expect(db.activeMode).toBe("quest");
    expect(db.route).toEqual({ variant: null, startIndex: 0, skippedSteps: [] });
    expect(db.dungeonReturns).toEqual([]);
  });
  it("keeps valid saved values", () => {
    const db = loadCharDb({
      activeMode: "completion",
      route: { variant: "e0d0x0:elwynn-forest:1", startIndex: 12, skippedSteps: [3, 7] },
      dungeonReturns: [1584],
    });
    expect(db.activeMode).toBe("completion");
    expect(db.route).toEqual({ variant: "e0d0x0:elwynn-forest:1", startIndex: 12, skippedSteps: [3, 7] });
    expect(db.dungeonReturns).toEqual([1584]);
  });
  it("repairs invalid values to the defaults", () => {
    const db = loadCharDb({
      activeMode: "access",
      route: { variant: 5, startIndex: -2, skippedSteps: [1, "x"] },
      dungeonReturns: [1.5],
    });
    expect(db.activeMode).toBe("quest");
    expect(db.route).toEqual({ variant: null, startIndex: 0, skippedSteps: [] });
    expect(db.dungeonReturns).toEqual([]);
    expect(loadCharDb({ route: { startIndex: 2.5, skippedSteps: "x" } }).route).toEqual({ variant: null, startIndex: 0, skippedSteps: [] });
    expect(loadCharDb({ dungeonReturns: { a: 1 } }).dungeonReturns).toEqual([]);
  });
});

describe("loadAccountDb", () => {
  it("defaults the language to auto", () => {
    expect(ACCOUNT_DEFAULTS.locale).toBe("auto");
    expect(loadAccountDb(null).locale).toBe("auto");
  });
  it("keeps a valid language", () => {
    expect(loadAccountDb({ locale: "frFR" }).locale).toBe("frFR");
    expect(loadAccountDb({ locale: "enUS" }).locale).toBe("enUS");
  });
  it("repairs an invalid language", () => {
    expect(loadAccountDb({ locale: "deDE" }).locale).toBe("auto");
    expect(loadAccountDb({ locale: 3 }).locale).toBe("auto");
  });
});

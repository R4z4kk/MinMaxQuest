import { describe, expect, it } from "vitest";
import { expiredBuilderValues, SCENARIOS } from "../model/constants";
import { killsForItems } from "../model/drops";
import { mobXp } from "../model/mobXp";

describe("model", () => {
  it("matches known equal-level kill XP", () => {
    expect(mobXp(10, 10, false)).toBe(95);
    expect(mobXp(30, 30, false)).toBe(195);
    expect(mobXp(59, 59, false)).toBe(340);
  });
  it("scales above, below and grey", () => {
    expect(mobXp(10, 11, false)).toBe(100);
    expect(mobXp(10, 14, false)).toBe(114);
    expect(mobXp(10, 20, false)).toBe(114);
    expect(mobXp(10, 8, false)).toBe(68);
    expect(mobXp(10, 4, false)).toBe(0);
    expect(mobXp(10, 10, true)).toBe(190);
  });
  it("rejects invalid levels", () => {
    expect(() => mobXp(0, 10, false)).toThrow("playerLevel");
    expect(() => mobXp(10, 1.5, false)).toThrow("mobLevel");
  });
  it("plans collect objectives at the quantile", () => {
    expect(killsForItems(1, 1, 0.8)).toBe(1);
    expect(killsForItems(1, 0.5, 0.8)).toBe(3);
    expect(killsForItems(2, 0.5, 0.8)).toBe(5);
    expect(() => killsForItems(1, 0, 0.8)).toThrow("chance");
    expect(() => killsForItems(1, 1.1, 0.8)).toThrow("chance");
    expect(() => killsForItems(0, 0.5, 0.8)).toThrow("needed");
    expect(() => killsForItems(1, 0.5, 1)).toThrow("quantile");
  });
  it("defines the three scenarios", () => {
    expect(SCENARIOS.map((s) => s.name)).toEqual(["fast", "medium", "slow"]);
    expect(SCENARIOS.map((s) => s.questDropChance.value)).toEqual([0.6, 0.4, 0.25]);
  });
  it("has no expired builder value today", () => {
    expect(expiredBuilderValues(new Date().toISOString().slice(0, 10))).toEqual([]);
  });
  it("reports an expired value by name", () => {
    const expired = expiredBuilderValues("2999-01-01");
    expect(expired).toContain("npcInteractSec");
    expect(expired).toContain("slow.dungeonSec");
    expect(expired).toContain("QUESTIE_DB");
    expect(expired).toContain("WAGO_DB2");
    expect(expired).toContain("CMANGOS_CLASSIC_DB");
    expect(expired).toContain("slow.questDropChance");
  });
});

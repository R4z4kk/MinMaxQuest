import { describe, expect, it } from "vitest";
import { createQuestRepository } from "../../../addon/src/data/questRepository";
import { dropRate, hasFlag, npcInfo, snapshotLib } from "../ingest/snapshot";
import { snapshot } from "./fixtures";

const NPCS = {
  100: { spawns: { 12: [[40, 50]] }, rank: 0, friendlyToFaction: "A", minLevel: 5, maxLevel: 5, npcFlags: 2 },
  200: { spawns: { 12: [[45, 55]] }, rank: 1, friendlyToFaction: null, minLevel: 6, maxLevel: 7, npcFlags: 0 },
};

describe("snapshotLib", () => {
  it("feeds createQuestRepository the same way the game lib does", () => {
    const s = snapshot({
      quests: { 7: { name: "Wolves", questLevel: 5, requiredLevel: 3, startedBy: [[100]], finishedBy: [[100]], objectives: [[[200, null, 8]]] } },
      npcs: NPCS,
      questXp: { 7: [5, 450] },
      areaIdToUiMapId: { 12: 1429 },
    });
    const result = createQuestRepository(snapshotLib(s));
    if (!result.ok) throw new Error(result.message);
    const q = result.repo.get(7)!;
    expect(q.baseXp).toBe(450);
    expect(q.isElite).toBe(true);
    expect(q.objectives[0]).toEqual({ kind: "npc", id: 200, required: 8, index: 1 });
    expect(result.repo.uiMapIdForArea(12)).toBe(1429);
  });

  it("rejects a snapshot from another contract", () => {
    const result = createQuestRepository(snapshotLib(snapshot({ contract: 3, tag: "old" })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("contract");
  });
});

describe("accessors", () => {
  it("returns drop rates as fractions and null when unknown", () => {
    const s = snapshot({ dropRates: { 9: { 200: 35 } } });
    expect(dropRate(s, 9, 200)).toBeCloseTo(0.35);
    expect(dropRate(s, 9, 201)).toBeNull();
    expect(dropRate(s, 8, 200)).toBeNull();
  });

  it("reads npc levels and flags", () => {
    const s = snapshot({ npcs: { ...NPCS, 300: { ...NPCS[100], minLevel: null, npcFlags: null } } });
    expect(npcInfo(s, 100)).toEqual({ minLevel: 5, maxLevel: 5, flags: 2 });
    expect(npcInfo(s, 300)).toBeNull();
    expect(npcInfo(s, 999)).toBeNull();
  });

  it("tests flag bits", () => {
    expect(hasFlag(2 + 128, 128)).toBe(true);
    expect(hasFlag(2, 128)).toBe(false);
    expect(hasFlag(2, 0)).toBe(false);
  });
});

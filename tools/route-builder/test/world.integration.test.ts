import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCachedSnapshot, snapshotPath } from "../ingest/questie";
import { loadZones } from "../ingest/zones";
import { buildWorld } from "../model/world";

const TIMEOUT_MS = 300000;

describe("world from the real QuestieDB snapshot", () => {
  it.skipIf(!existsSync(snapshotPath()))(
    "builds both factions",
    async () => {
      const s = readCachedSnapshot();
      if (s == null) throw new Error(`${snapshotPath()} is missing`);
      const zones = await loadZones();
      let startZones = 0;
      for (const faction of ["A", "H"] as const) {
        const w = buildWorld(s, zones, faction);
        console.log(
          faction,
          `candidates ${w.quests.size}`,
          `offset ${w.conversionOffsetYards.toFixed(2)} yd`,
          `start ${w.startZones.map((z) => z.key).join(",")}`,
          `excluded ${JSON.stringify(Object.fromEntries(w.excluded))}`,
        );
        expect(w.quests.size).toBeGreaterThan(1000);
        expect(w.startZones.map((z) => z.key)).toContain("zephras-isle");
        startZones += w.startZones.length;
      }
      expect(startZones).toBeGreaterThanOrEqual(6);
    },
    TIMEOUT_MS,
  );
});

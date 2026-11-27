import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCachedSnapshot, snapshotPath } from "../ingest/questie";
import { loadZones } from "../ingest/zones";
import { buildWorld } from "../model/world";

const TIMEOUT_MS = 300000;
const START_ZONES = {
  A: ["elwynn-forest", "dun-morogh", "teldrassil", "zephras-isle"],
  H: ["durotar", "tirisfal-glades", "mulgore", "zephras-isle"],
};
// Quests whose starter or finisher spawns inside the instance as a [-1, -1] sentinel.
const IN_DUNGEON_GIVERS = [1144, 2904, 3523, 4201];

describe("world from the real QuestieDB snapshot", () => {
  it.skipIf(!existsSync(snapshotPath()))(
    "builds both factions",
    async () => {
      const s = readCachedSnapshot();
      if (s == null) throw new Error(`${snapshotPath()} is missing`);
      const zones = await loadZones();
      const givers: Record<number, number | null> = {};
      for (const faction of ["A", "H"] as const) {
        const w = buildWorld(s, zones, faction);
        console.log(
          faction,
          `candidates ${w.quests.size}`,
          `offset ${w.conversionOffsetYards.toFixed(2)} yd`,
          `dungeons ${w.dungeons.length}: ${w.dungeons.map((d) => `${d.name}:${d.questIds.length}`).join(",")}`,
          `start ${w.startZones.map((z) => z.key).join(",")}`,
          `excluded ${JSON.stringify(Object.fromEntries(w.excluded))}`,
        );
        expect(w.quests.size).toBeGreaterThan(1000);
        expect(w.startZones.map((z) => z.key)).toEqual(START_ZONES[faction]);
        for (const id of IN_DUNGEON_GIVERS) givers[id] ??= w.quests.get(id)?.dungeonAreaId ?? null;
      }
      console.log("in-dungeon givers", JSON.stringify(givers));
      for (const id of IN_DUNGEON_GIVERS) expect(givers[id]).not.toBeNull();
    },
    TIMEOUT_MS,
  );
});

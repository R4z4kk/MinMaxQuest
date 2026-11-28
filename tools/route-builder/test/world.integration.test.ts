import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRAVEL } from "../../../addon/src/data/generated/travel";
import { loadPinnedCmangos } from "../ingest/cmangos";
import { questieDir } from "../ingest/fetchQuestie";
import { loadInstanceTypes } from "../ingest/instances";
import { cachedSnapshot, snapshotPath } from "../ingest/questie";
import { loadZones } from "../ingest/zones";
import { buildWorld } from "../model/world";

const TIMEOUT_MS = 300000;
const START_ZONES = {
  A: ["elwynn-forest", "dun-morogh", "teldrassil", "zephras-isle"],
  H: ["durotar", "tirisfal-glades", "mulgore", "zephras-isle"],
};
// Quests whose starter or finisher spawns inside the instance as a [-1, -1] sentinel.
const IN_DUNGEON_GIVERS = [1144, 2904, 3523, 4201];
const KOBOLD_CAMP_CLEANUP = 7;
const MAX_DISAGREEMENT_SHARE = 0.1;

describe("world from the real QuestieDB snapshot", () => {
  it.skipIf(!existsSync(snapshotPath()) && !existsSync(questieDir()))(
    "builds both factions",
    async () => {
      const s = await cachedSnapshot();
      const zones = await loadZones();
      const { counts, loot } = loadPinnedCmangos();
      const instanceTypes = loadInstanceTypes();
      const givers: Record<number, number | null> = {};
      for (const faction of ["A", "H"] as const) {
        const w = buildWorld(s, zones, faction, TRAVEL, instanceTypes, counts, loot);
        console.log(
          faction,
          `candidates ${w.quests.size}`,
          `offset ${w.conversionOffsetYards.toFixed(2)} yd`,
          `dungeons ${w.dungeons.length}: ${w.dungeons.map((d) => `${d.name}:${d.questIds.length}`).join(",")}`,
          `start ${w.startZones.map((z) => z.key).join(",")}`,
          `excluded ${JSON.stringify(Object.fromEntries(w.excluded))}`,
          `counts ${JSON.stringify(w.countStats)}`,
          `unlearnable taxi nodes ${w.unlearnableTaxiNodes.join(",")}`,
        );
        expect(w.countStats.disagreements).toBeLessThanOrEqual(w.countStats.bothSources * MAX_DISAGREEMENT_SHARE);
        expect(w.quests.size).toBeGreaterThan(1000);
        expect(w.startZones.map((z) => z.key)).toEqual(START_ZONES[faction]);
        if (faction === "A") expect(w.quests.get(KOBOLD_CAMP_CLEANUP)?.tasks[0]).toMatchObject({ kind: "kill", count: 10 });
        for (const id of IN_DUNGEON_GIVERS) givers[id] ??= w.quests.get(id)?.dungeonAreaId ?? null;
      }
      console.log("in-dungeon givers", JSON.stringify(givers));
      for (const id of IN_DUNGEON_GIVERS) expect(givers[id]).not.toBeNull();
    },
    TIMEOUT_MS,
  );
});

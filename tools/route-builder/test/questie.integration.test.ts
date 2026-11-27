import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { questieDir } from "../ingest/fetchQuestie";
import { loadSnapshot } from "../ingest/questie";

const SHADOWFANG_KEEP = 209;
const DALARAN_SEWER_KEY = 92432;
const LOAD_TIMEOUT_MS = 300000;

describe("QuestieDB offline load", () => {
  it.skipIf(!existsSync(questieDir()))(
    "loads the Forever snapshot through the emulator",
    async () => {
      const snapshot = await loadSnapshot(questieDir());
      expect(Object.keys(snapshot.quests).length).toBeGreaterThan(3000);
      expect(Object.keys(snapshot.questXp).length).toBeGreaterThan(3000);
      expect(typeof snapshot.quests[DALARAN_SEWER_KEY]?.name).toBe("string");
      expect(snapshot.npcFlagValues.innkeeper).toBeGreaterThan(0);
      expect(snapshot.dungeons[SHADOWFANG_KEEP]?.name).toBe("Shadowfang Keep");
      expect(snapshot.contract).toBe(4);
    },
    LOAD_TIMEOUT_MS,
  );
});

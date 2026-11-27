import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESS_CHAINS } from "../../../addon/src/access/chains";
import { loadInstanceTypes } from "../../route-builder/ingest/instances";
import { readCachedSnapshot, snapshotPath } from "../../route-builder/ingest/questie";
import { ATTUNE } from "../../route-builder/sources";
import { parseAttune, readAttuneFiles } from "../attune";
import { crossCheck } from "../crosscheck";

const MOLTEN_CORE_ATTUNEMENT = 7848;
const LOAD_TIMEOUT_MS = 120000;

describe("Attune import on the installed addon", () => {
  it.skipIf(!existsSync(join(ATTUNE.path, "AttuneData.lua")) || !existsSync(snapshotPath()))(
    "imports dungeons, Molten Core and both Onyxia entries",
    async () => {
      const snapshot = readCachedSnapshot();
      if (snapshot == null) throw new Error(`${snapshotPath()} is stale, run npm run gen:routes`);
      const { entries: attune } = await parseAttune(readAttuneFiles(ATTUNE.path), snapshot.raceMaskById);
      const { entries } = crossCheck({ entries: attune, snapshot, instanceTypes: loadInstanceTypes(), chains: ACCESS_CHAINS });
      expect(entries.filter((e) => e.group === "dungeon").length).toBeGreaterThanOrEqual(50);
      const moltenCore = entries.find((e) => e.name.enUS === "Molten Core");
      expect(moltenCore?.steps.some((s) => s.ref === MOLTEN_CORE_ATTUNEMENT)).toBe(true);
      const onyxia = entries.filter((e) => e.name.enUS === "Onyxia's Lair").map((e) => e.faction);
      expect(onyxia.sort()).toEqual(["A", "H"]);
      const scarletHorde = entries.find((e) => e.id === "270");
      expect(scarletHorde?.steps.filter((s) => s.excludedRaces === snapshot.raceMaskById[5]).length).toBeGreaterThan(0);
    },
    LOAD_TIMEOUT_MS,
  );
});

import { expiredConstants, expiredRecords, type DatedValue } from "../../../addon/src/core/constants";
import { QUESTIE_DB, SPF_ZONES } from "../sources";

const VERIFIED_ON = "2026-11-27";
const EXPIRES_ON = "2026-12-27";
const SPEC = "unverified estimate, MinMaxQuest spec §7.7";
const KILL_SOURCE =
  "user's own figures and Kami Labs https://kami-labs.fr/en/wow-forever/combien-de-temps-monter-niveau-60-wow-forever/ (unverified scenario)";
const DUNGEON_SOURCE = "unverified estimate, MinMaxQuest spec §7.7 (player-dependent scenario)";

function dated(value: number, source: string): DatedValue {
  return { value, source, verifiedOn: VERIFIED_ON, expiresOn: EXPIRES_ON };
}

export const BUILDER = {
  npcInteractSec: dated(7, "MinMaxQuest spec §7.2 (5 to 10 s), unverified"),
  objectUseSec: dated(3, SPEC),
  lootSec: dated(3, SPEC),
  objectYield: dated(1, `${SPEC} (items per object use)`),
  segmentEndLevel: dated(10, "MinMaxQuest spec §7.7"),
};

export const COLLECT_QUANTILE = 0.8;

export interface Scenario {
  name: "fast" | "medium" | "slow";
  killSec: DatedValue;
  eliteFactor: DatedValue;
  dungeonSec: DatedValue;
}

function scenario(name: Scenario["name"], killSec: number, eliteFactor: number, dungeonSec: number): Scenario {
  return {
    name,
    killSec: dated(killSec, KILL_SOURCE),
    eliteFactor: dated(eliteFactor, KILL_SOURCE),
    dungeonSec: dated(dungeonSec, DUNGEON_SOURCE),
  };
}

export const SCENARIOS: Scenario[] = [
  scenario("fast", 20, 1.5, 1800),
  scenario("medium", 30, 2, 2700),
  scenario("slow", 50, 3, 3600),
];

export function expiredBuilderValues(today: string): string[] {
  const scenarioRecords: Record<string, DatedValue> = {};
  for (const s of SCENARIOS) {
    scenarioRecords[`${s.name}.killSec`] = s.killSec;
    scenarioRecords[`${s.name}.eliteFactor`] = s.eliteFactor;
    scenarioRecords[`${s.name}.dungeonSec`] = s.dungeonSec;
  }
  return [
    ...expiredRecords({ ...BUILDER, ...scenarioRecords, QUESTIE_DB, SPF_ZONES }, today),
    ...expiredConstants(today),
  ];
}

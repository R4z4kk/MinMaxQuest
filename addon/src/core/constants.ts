import { TRAVEL } from "../data/generated/travel";

export interface DatedValue {
  value: number;
  source: string;
  verifiedOn: string;
  expiresOn: string;
}

const VERIFIED_ON = "2026-11-27";
const EXPIRES_ON = "2026-12-27";
const MOVEMENT_SPEED_SOURCE = "https://warcraft.wiki.gg/wiki/Movement_speed";
const RIDING_SOURCE = "https://warcraft.wiki.gg/wiki/Riding (Classic riding at 40); epic mount at 60 per Task 12a ruling";
const SPELL_BUILD = "build 1.60.1.71139";

function dated(value: number, source: string): DatedValue {
  return { value, source, verifiedOn: VERIFIED_ON, expiresOn: EXPIRES_ON };
}

export const CONSTANTS = {
  runSpeed: dated(7, MOVEMENT_SPEED_SOURCE),
  mountSpeed: dated(11.2, MOVEMENT_SPEED_SOURCE),
  epicMountSpeed: dated(14, MOVEMENT_SPEED_SOURCE),
  mountLevel: dated(40, RIDING_SOURCE),
  epicMountLevel: dated(60, RIDING_SOURCE),
  taxiSpeed: dated(
    30.03,
    "RXP direct flight times vs Forever TaxiPathNode lengths, research_notes/Optimisation des routes de leveling/missing_data_sources.md",
  ),
  detourFactor: dated(1.25, "Questwarden docs/ROUTE_OPTIMIZATION.md (unvalidated)"),
  hearthCooldownSec: dated(3600, `wago.tools SpellCooldowns ${SPELL_BUILD} spell 8690`),
  hearthCastSec: dated(10, `wago.tools SpellCastTimes ${SPELL_BUILD}`),
};

export const XP_PER_LEVEL = {
  values: [400,900,1400,2100,2800,3600,4500,5400,6500,7600,8800,10100,11400,12900,14400,16000,17700,19400,21300,23200,25200,27300,29400,31700,34000,36400,38900,41400,44300,47400,50800,54500,58600,62800,67100,71600,76100,80800,85700,90700,95800,101000,106300,111800,117500,123200,129100,135100,141200,147500,153900,160400,167100,173900,180800,187900,195000,202300,209800],
  source: "https://warcraft.wiki.gg/wiki/Experience_to_level",
  verifiedOn: VERIFIED_ON,
  expiresOn: EXPIRES_ON,
};

export interface Expirable {
  expiresOn: string;
}

export function expiredRecords(records: Record<string, Expirable>, today: string): string[] {
  const expired: string[] = [];
  for (const [name, entry] of Object.entries(records)) if (entry.expiresOn < today) expired.push(name);
  return expired;
}

export function expiredConstants(today: string): string[] {
  return expiredRecords({ ...CONSTANTS, XP_PER_LEVEL, TRAVEL: TRAVEL.source }, today);
}

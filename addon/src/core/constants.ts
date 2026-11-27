export interface DatedValue {
  value: number;
  source: string;
  verifiedOn: string;
  expiresOn: string;
}

const VERIFIED_ON = "2026-11-27";
const EXPIRES_ON = "2026-12-27";
const MOVEMENT_SPEED_SOURCE = "https://warcraft.wiki.gg/wiki/Movement_speed";
const SPELL_BUILD = "build 1.60.1.71139";

function dated(value: number, source: string): DatedValue {
  return { value, source, verifiedOn: VERIFIED_ON, expiresOn: EXPIRES_ON };
}

export const CONSTANTS = {
  runSpeed: dated(7, MOVEMENT_SPEED_SOURCE),
  mountSpeed: dated(11.2, MOVEMENT_SPEED_SOURCE),
  epicMountSpeed: dated(14, MOVEMENT_SPEED_SOURCE),
  taxiSpeed: dated(
    30.03,
    "RXP direct flight times vs Forever TaxiPathNode lengths, research_notes/missing_data_sources.md",
  ),
  detourFactor: dated(1.25, "Questwarden docs/ROUTE_OPTIMIZATION.md (unvalidated)"),
  hearthCooldownSec: dated(3600, `wago.tools SpellCooldowns ${SPELL_BUILD} spell 8690`),
  hearthCastSec: dated(10, `wago.tools SpellCastTimes ${SPELL_BUILD}`),
};

interface Expirable {
  expiresOn: string;
}

function isExpirable(entry: object): entry is Expirable {
  return typeof (entry as Partial<Expirable>).expiresOn === "string";
}

export function expiredConstants(today: string): string[] {
  const expired: string[] = [];
  for (const [name, entry] of Object.entries(CONSTANTS as Record<string, object>)) {
    if (isExpirable(entry) && entry.expiresOn < today) expired.push(name);
  }
  return expired;
}

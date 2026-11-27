export const QUESTIE_DB = {
  repo: "https://github.com/Questie/QuestieDB.git",
  tag: "v1.1.6",
  source: "https://github.com/Questie/QuestieDB/releases/tag/v1.1.6",
  verifiedOn: "2026-11-27",
  expiresOn: "2026-12-27",
} as const;

export const WAGO_DB2 = {
  build: "1.60.1.71139",
  source: "https://wago.tools/db2/<Table>/csv?build=1.60.1.71139",
  verifiedOn: "2026-11-27",
  expiresOn: "2026-12-27",
} as const;

export const SPF_ZONES = {
  version: "v1.48.0",
  source: "https://github.com/cjber/shortest-path-forever/blob/v1.48.0/Data/Zones.lua",
  verifiedOn: "2026-11-27",
  expiresOn: "2026-12-27",
} as const;

export const CMANGOS_CLASSIC_DB = {
  repo: "https://github.com/cmangos/classic-db",
  commit: "64adf9f62008df8d530e5d88e3c89aa85e42dc38",
  file: "Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
  source: "https://raw.githubusercontent.com/cmangos/classic-db/64adf9f62008df8d530e5d88e3c89aa85e42dc38/Full_DB/ClassicDB_1_12_1_z2815.sql.gz",
  license: "GPL-3.0",
  verifiedOn: "2026-11-27",
  expiresOn: "2026-12-27",
} as const;

// Read from the locally installed addon; the user chose to reuse its data (no license declared).
export const ATTUNE = {
  version: "16001-46",
  path: "../Attune",
  source: "Attune by CixiDelmont, https://warcraftratings.com",
  verifiedOn: "2026-11-27",
  expiresOn: "2026-12-27",
} as const;

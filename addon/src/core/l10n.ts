export type L10nKey =
  | "questieMissing"
  | "questNotFound"
  | "tabQuest"
  | "tabAccess"
  | "tabCompletion"
  | "positionUnavailable"
  | "arrowUsage"
  | "help"
  | "targetAccept"
  | "targetObjective"
  | "targetTurnin"
  | "goFlightMaster"
  | "goBoat"
  | "noTarget"
  | "skipConfirm"
  | "lostXp"
  | "lostXpUnknown"
  | "skipped"
  | "pinned"
  | "unpinned"
  | "buildOverride"
  | "nearestTarget"
  | "nextTarget"
  | "remainingNearby"
  | "remainingInZone"
  | "levelOne"
  | "levelMany"
  | "moreRows"
  | "skip"
  | "zonePicker"
  | "modeProximity"
  | "modeZone"
  | "questsCount"
  | "percent"
  | "showFilters"
  | "filterGrey"
  | "filterElite"
  | "eliteTag"
  | "totalProgress"
  | "pinnedTag"
  | "pinTooltip"
  | "unpinTooltip"
  | "pinUnavailable"
  | "unknownZone"
  | "stepsCount"
  | "trackInRoute"
  | "activeMode"
  | "trackedOne"
  | "trackedMany"
  | "routesMissing"
  | "openCompletion"
  | "options"
  | "includeElites"
  | "includeDungeons"
  | "maxQuestLevel"
  | "off"
  | "skipTitle"
  | "skipWarning"
  | "skipFollowUps"
  | "followUpLine"
  | "skipLost"
  | "skipLostUnknown"
  | "cancel"
  | "skipAnyway"
  | "bannerBuild"
  | "bannerExpired";

const EN: Record<L10nKey, string> = {
  questieMissing: "QuestieDB is required",
  questNotFound: "quest not found",
  tabQuest: "Quest",
  tabAccess: "Access",
  tabCompletion: "Completion",
  positionUnavailable: "position unavailable",
  arrowUsage: "usage: /mmq arrow move|lock|test",
  help: "commands: /mmq (window) | help | q <id> | chain <questId> | targets | skip [confirm] | pin <id> | unpin | arrow move|lock|test | debug build <n>",
  targetAccept: "pick up",
  targetObjective: "objective",
  targetTurnin: "turn in",
  goFlightMaster: "Go to the flight master",
  goBoat: "Take the boat",
  noTarget: "no target",
  skipConfirm: "{quest}: {n} follow-up quest(s) would be lost ({xp}): type /mmq skip confirm",
  lostXp: "about {xp} XP",
  lostXpUnknown: "XP unknown",
  skipped: "skipped",
  pinned: "pinned",
  unpinned: "unpinned",
  buildOverride: "build override",
  nearestTarget: "Nearest target",
  nextTarget: "Next",
  remainingNearby: "Remaining nearby · {n}",
  remainingInZone: "Remaining in zone · {n}",
  levelOne: "level",
  levelMany: "levels",
  moreRows: "+{n} more...",
  skip: "Skip",
  zonePicker: "Zone",
  modeProximity: "Proximity",
  modeZone: "Zone",
  questsCount: "{done} / {total} quests",
  percent: "{p}%",
  showFilters: "Show:",
  filterGrey: "Grey",
  filterElite: "Elite",
  eliteTag: "Elite",
  totalProgress: "Total · {count}",
  pinnedTag: "Pinned",
  pinTooltip: "Pin with MinMaxQuest",
  unpinTooltip: "Unpin",
  pinUnavailable: "quest log pin buttons unavailable (quest log frame not found)",
  unknownZone: "Unknown zone",
  stepsCount: "{done}/{total} steps",
  trackInRoute: "Track in route",
  activeMode: "Active mode: Quest",
  trackedOne: "{n} chain tracked",
  trackedMany: "{n} chains tracked",
  routesMissing: "Routes not installed - use Completion meanwhile",
  openCompletion: "Open Completion",
  options: "Options",
  includeElites: "Include elites",
  includeDungeons: "Include dungeons",
  maxQuestLevel: "Max quest level (below yours)",
  off: "Off",
  skipTitle: "Skip this step?",
  skipWarning: "\"{quest}\" opens a quest chain",
  skipFollowUps: "Skipping it also removes its {n} follow-up(s):",
  followUpLine: "· {name} (level {level})",
  skipLost: "You lose about {xp} XP ({f} {levels}).",
  skipLostUnknown: "Lost XP unknown.",
  cancel: "Cancel",
  skipAnyway: "Skip anyway",
  bannerBuild: "Data built for build {build}",
  bannerExpired: "Expired data: {names}",
};

const FR: Record<L10nKey, string> = {
  questieMissing: "QuestieDB est requis",
  questNotFound: "quête introuvable",
  tabQuest: "Quête",
  tabAccess: "Accès",
  tabCompletion: "Complétion",
  positionUnavailable: "position indisponible",
  arrowUsage: "usage : /mmq arrow move|lock|test",
  help: "commandes : /mmq (fenêtre) | help | q <id> | chain <questId> | targets | skip [confirm] | pin <id> | unpin | arrow move|lock|test | debug build <n>",
  targetAccept: "prendre",
  targetObjective: "objectif",
  targetTurnin: "rendre",
  goFlightMaster: "Aller au maître de vol",
  goBoat: "Prendre le bateau",
  noTarget: "aucune cible",
  skipConfirm: "{quest} : {n} quête(s) de suite seraient perdues ({xp}) : tapez /mmq skip confirm",
  lostXp: "environ {xp} XP",
  lostXpUnknown: "XP inconnue",
  skipped: "ignorée",
  pinned: "épinglée",
  unpinned: "désépinglée",
  buildOverride: "build forcé",
  nearestTarget: "Cible la plus proche",
  nextTarget: "Ensuite",
  remainingNearby: "Restant à proximité · {n}",
  remainingInZone: "Restant dans la zone · {n}",
  levelOne: "niveau",
  levelMany: "niveaux",
  moreRows: "+ {n} autres...",
  skip: "Passer",
  zonePicker: "Zone",
  modeProximity: "Proximité",
  modeZone: "Zone",
  questsCount: "{done} / {total} quêtes",
  percent: "{p} %",
  showFilters: "Afficher :",
  filterGrey: "Grises",
  filterElite: "Élites",
  eliteTag: "Élite",
  totalProgress: "Total · {count}",
  pinnedTag: "Épinglée",
  pinTooltip: "Épingler avec MinMaxQuest",
  unpinTooltip: "Désépingler",
  pinUnavailable: "boutons d'épinglage indisponibles (journal de quêtes introuvable)",
  unknownZone: "Zone inconnue",
  stepsCount: "{done}/{total} étapes",
  trackInRoute: "Suivre dans la route",
  activeMode: "Mode actif : Quête",
  trackedOne: "{n} chaîne suivie",
  trackedMany: "{n} chaînes suivies",
  routesMissing: "Routes non installées - utilise Complétion en attendant",
  openCompletion: "Ouvrir Complétion",
  options: "Options",
  includeElites: "Inclure les élites",
  includeDungeons: "Inclure les donjons",
  maxQuestLevel: "Niveau max des quêtes (sous le tien)",
  off: "Non",
  skipTitle: "Passer cette étape ?",
  skipWarning: "« {quest} » ouvre une chaîne de quêtes",
  skipFollowUps: "La passer retire aussi ses {n} suite(s) :",
  followUpLine: "· {name} (niv {level})",
  skipLost: "Tu perds environ {xp} XP, soit {f} {levels}.",
  skipLostUnknown: "XP perdue inconnue.",
  cancel: "Annuler",
  skipAnyway: "Passer quand même",
  bannerBuild: "Données générées pour le build {build}",
  bannerExpired: "Données expirées : {names}",
};

let french: boolean | null = null;

export function setLocale(locale: string): void {
  french = locale === "frFR";
}

function isFrench(): boolean {
  if (french == null) french = typeof GetLocale === "function" && GetLocale() === "frFR";
  return french;
}

export function currentLocale(): "frFR" | "enUS" {
  return isFrench() ? "frFR" : "enUS";
}

export function t(key: L10nKey): string {
  return (isFrench() ? FR : EN)[key];
}

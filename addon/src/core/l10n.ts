import type { LanguageSetting } from "./storage";

export type L10nKey =
  | "questieMissing"
  | "questNotFound"
  | "tabQuest"
  | "tabAccess"
  | "tabCompletion"
  | "positionUnavailable"
  | "arrowUsage"
  | "hideAll"
  | "help"
  | "targetAccept"
  | "targetObjective"
  | "targetTurnin"
  | "obtainBuy"
  | "obtainCraft"
  | "obtainFish"
  | "skillsUnknown"
  | "goFlightMaster"
  | "goBoat"
  | "takePortal"
  | "noTarget"
  | "skipConfirm"
  | "lostXp"
  | "lostXpUnknown"
  | "skipped"
  | "pinned"
  | "unpinned"
  | "buildOverride"
  | "sectionNext"
  | "levelOne"
  | "levelMany"
  | "moreRows"
  | "sectionTurnIn"
  | "sectionObjectives"
  | "sectionPickUp"
  | "skip"
  | "zonePicker"
  | "modeProximity"
  | "modeZone"
  | "modeLog"
  | "questsInLogOne"
  | "questsInLogMany"
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
  | "routeFinished"
  | "routeOff"
  | "resync"
  | "currentStep"
  | "routeFooter"
  | "dungeons"
  | "trackedOne"
  | "trackedMany"
  | "routesMissing"
  | "openCompletion"
  | "options"
  | "includeElites"
  | "includeDungeons"
  | "autoFly"
  | "nativeWaypoint"
  | "lockArrow"
  | "otherSpots"
  | "taxiNotKnown"
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
  | "bannerExpired"
  | "featureDisabled"
  | "repositoryReadFailed"
  | "repositoryLastError"
  | "questInfo"
  | "useHearth"
  | "profile"
  | "profileNone"
  | "noSkipped"
  | "skippedList"
  | "unskipped"
  | "unskippedAll"
  | "notSkipped"
  | "unskipUsage"
  | "routeFly"
  | "routeHearth"
  | "routeSetHearth"
  | "routeFlightPath"
  | "routeGrind"
  | "routeDungeon"
  | "routeStepsRemoved"
  | "routeStepUnplaced"
  | "routeChainUnplaceable"
  | "routeReturnUnreadable"
  | "routeChainUnknown"
  | "bannerRoutesBuild"
  | "corpse"
  | "corpseUnknown"
  | "language"
  | "languageAuto"
  | "reload"
  | "groupRaid"
  | "groupKey"
  | "groupMisc"
  | "stepLevel"
  | "stepKill"
  | "stepTalk"
  | "stepUse"
  | "stepTalkAny"
  | "stepUseAny"
  | "stepRep"
  | "stepProf"
  | "stepEnd";

const EN: Record<L10nKey, string> = {
  questieMissing: "QuestieDB is required",
  questNotFound: "quest not found",
  tabQuest: "Quest",
  tabAccess: "Access",
  tabCompletion: "Completion",
  positionUnavailable: "position unavailable",
  arrowUsage: "usage: /mmq arrow move|lock|test",
  hideAll: "Hide MinMaxQuest (/mmq to show)",
  help: "commands: /mmq (show/hide all) | help | q <id> | chain <questId> | targets | skip [confirm] | pin <id> | unpin | skipped | unskip <id>|all | arrow move|lock|test | debug build <n> | debug prof",
  targetAccept: "pick up",
  targetObjective: "objective",
  targetTurnin: "turn in",
  obtainBuy: "Buy {item} ×{n} at the Auction House",
  obtainCraft: "Craft {item} ×{n}",
  obtainFish: "Fish {item} ×{n}",
  skillsUnknown: "professions cannot be read on this client: profession items keep their usual sources",
  goFlightMaster: "Go to the flight master",
  goBoat: "Take the boat",
  takePortal: "Take the portal",
  noTarget: "no target",
  skipConfirm: "{quest}: {n} follow-up quest(s) would be lost ({xp}): type /mmq skip confirm",
  lostXp: "about {xp} XP",
  lostXpUnknown: "XP unknown",
  skipped: "skipped",
  pinned: "pinned",
  unpinned: "unpinned",
  buildOverride: "build override",
  sectionNext: "Next",
  levelOne: "level",
  levelMany: "levels",
  moreRows: "+{n} more...",
  sectionTurnIn: "To turn in",
  sectionObjectives: "Objectives",
  sectionPickUp: "To pick up",
  skip: "Skip",
  zonePicker: "Zone",
  modeProximity: "Proximity",
  modeZone: "Zone",
  modeLog: "Log",
  questsInLogOne: "{n} quest in log",
  questsInLogMany: "{n} quests in log",
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
  activeMode: "Active mode: {mode}",
  routeFinished: "Route finished",
  routeOff: "Off route: level {level}, route expects {expected}",
  resync: "Re-sync",
  currentStep: "Current step",
  routeFooter: "Lvl {level} · step {step}/{total} · {left} left",
  dungeons: "Dungeons",
  trackedOne: "{n} chain tracked",
  trackedMany: "{n} chains tracked",
  routesMissing: "Routes not installed - use Completion meanwhile",
  openCompletion: "Open Completion",
  options: "Options",
  includeElites: "Include elites",
  includeDungeons: "Include dungeons",
  autoFly: "Auto-fly at flight masters",
  nativeWaypoint: "Blizzard map waypoint",
  lockArrow: "Lock arrow",
  otherSpots: "+{n} other spots",
  taxiNotKnown: "flight destination not available from this flight master",
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
  featureDisabled: "{feature} disabled: {error}",
  repositoryReadFailed: "QuestieDB read failed ({method}): {error}",
  repositoryLastError: "last QuestieDB error: {error}",
  questInfo: "[{id}] {name} level {level}, {n} objective(s)",
  useHearth: "Use Hearthstone",
  profile: "refresh: last {last} ms, first {first} ms",
  profileNone: "no refresh measured yet",
  noSkipped: "no skipped quest",
  skippedList: "skipped quests: {list}",
  unskipped: "re-activated",
  unskippedAll: "{n} quest(s) re-activated",
  notSkipped: "{quest} is not skipped",
  unskipUsage: "usage: /mmq unskip <id>|all",
  routeFly: "Fly to {name}",
  routeHearth: "Use your Hearthstone",
  routeSetHearth: "Make this inn your home",
  routeFlightPath: "Get the flight path",
  routeGrind: "Grind to level {n}",
  routeDungeon: "Run the dungeon",
  routeStepsRemoved: "{n} route step(s) removed: not doable by this character",
  routeStepUnplaced: "route step {n} has no usable position, skipped",
  routeChainUnplaceable: "{name}: {n} quest(s) could not be placed in the route",
  routeReturnUnreadable: "Dungeon return #{id} could not be read and is left out of the route",
  routeChainUnknown: "tracked chain {id} is unknown",
  bannerRoutesBuild: "Routes built for build {build}",
  corpse: "Your corpse",
  corpseUnknown: "corpse position unknown",
  language: "Language",
  languageAuto: "Auto",
  reload: "Reload",
  groupRaid: "Raids",
  groupKey: "Keys",
  groupMisc: "Misc",
  stepLevel: "Reach level {n}",
  stepKill: "Kill {name}",
  stepTalk: "Talk to {name}",
  stepUse: "Use {name}",
  stepTalkAny: "Talk to the NPC",
  stepUseAny: "Use the object",
  stepRep: "{faction}: {n} reputation",
  stepProf: "Profession {name}",
  stepEnd: "Access unlocked",
};

const FR: Record<L10nKey, string> = {
  questieMissing: "QuestieDB est requis",
  questNotFound: "quête introuvable",
  tabQuest: "Quête",
  tabAccess: "Accès",
  tabCompletion: "Complétion",
  positionUnavailable: "position indisponible",
  arrowUsage: "usage : /mmq arrow move|lock|test",
  hideAll: "Masquer MinMaxQuest (/mmq pour réafficher)",
  help: "commandes : /mmq (afficher/masquer tout) | help | q <id> | chain <questId> | targets | skip [confirm] | pin <id> | unpin | skipped | unskip <id>|all | arrow move|lock|test | debug build <n> | debug prof",
  targetAccept: "prendre",
  targetObjective: "objectif",
  targetTurnin: "rendre",
  obtainBuy: "Achète {item} ×{n} à l'hôtel des ventes",
  obtainCraft: "Fabrique {item} ×{n}",
  obtainFish: "Pêche {item} ×{n}",
  skillsUnknown: "métiers illisibles sur ce client : les objets de métier gardent leurs sources habituelles",
  goFlightMaster: "Aller au maître de vol",
  goBoat: "Prendre le bateau",
  takePortal: "Prends le portail",
  noTarget: "aucune cible",
  skipConfirm: "{quest} : {n} quête(s) de suite seraient perdues ({xp}) : tapez /mmq skip confirm",
  lostXp: "environ {xp} XP",
  lostXpUnknown: "XP inconnue",
  skipped: "ignorée",
  pinned: "épinglée",
  unpinned: "désépinglée",
  buildOverride: "build forcé",
  sectionNext: "Ensuite",
  levelOne: "niveau",
  levelMany: "niveaux",
  moreRows: "+ {n} autres...",
  sectionTurnIn: "À rendre",
  sectionObjectives: "Objectifs",
  sectionPickUp: "À prendre",
  skip: "Passer",
  zonePicker: "Zone",
  modeProximity: "Proximité",
  modeZone: "Zone",
  modeLog: "Journal",
  questsInLogOne: "{n} quête dans le journal",
  questsInLogMany: "{n} quêtes dans le journal",
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
  activeMode: "Mode actif : {mode}",
  routeFinished: "Route terminée",
  routeOff: "Hors route : niveau {level}, route prévue {expected}",
  resync: "Recaler",
  currentStep: "Étape en cours",
  routeFooter: "Niv. {level} · étape {step}/{total} · reste {left}",
  dungeons: "Donjons",
  trackedOne: "{n} chaîne suivie",
  trackedMany: "{n} chaînes suivies",
  routesMissing: "Routes non installées - utilise Complétion en attendant",
  openCompletion: "Ouvrir Complétion",
  options: "Options",
  includeElites: "Inclure les élites",
  includeDungeons: "Inclure les donjons",
  autoFly: "Vol automatique aux maîtres de vol",
  nativeWaypoint: "Repère de la carte Blizzard",
  lockArrow: "Verrouiller la flèche",
  otherSpots: "+{n} autres zones",
  taxiNotKnown: "destination de vol indisponible depuis ce maître de vol",
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
  featureDisabled: "{feature} désactivé : {error}",
  repositoryReadFailed: "lecture QuestieDB échouée ({method}) : {error}",
  repositoryLastError: "dernière erreur QuestieDB : {error}",
  questInfo: "[{id}] {name} niveau {level}, {n} objectif(s)",
  useHearth: "Utilise ta pierre de foyer",
  profile: "rafraîchissement : dernier {last} ms, premier {first} ms",
  profileNone: "aucun rafraîchissement mesuré",
  noSkipped: "aucune quête ignorée",
  skippedList: "quêtes ignorées : {list}",
  unskipped: "réactivée",
  unskippedAll: "{n} quête(s) réactivée(s)",
  notSkipped: "{quest} n'est pas ignorée",
  unskipUsage: "usage : /mmq unskip <id>|all",
  routeFly: "Vole vers {name}",
  routeHearth: "Utilise ta pierre de foyer",
  routeSetHearth: "Lie ta pierre de foyer à cette auberge",
  routeFlightPath: "Découvre le point de vol",
  routeGrind: "Grind jusqu'au niveau {n}",
  routeDungeon: "Fais le donjon",
  routeStepsRemoved: "{n} étape(s) de route retirée(s) : impossibles pour ce personnage",
  routeStepUnplaced: "étape de route {n} sans position utilisable, sautée",
  routeChainUnplaceable: "{name} : {n} quête(s) impossibles à placer dans la route",
  routeReturnUnreadable: "Le retour en donjon #{id} est illisible et reste hors de la route",
  routeChainUnknown: "chaîne suivie {id} inconnue",
  bannerRoutesBuild: "Routes générées pour le build {build}",
  corpse: "Ton corps",
  corpseUnknown: "position du corps inconnue",
  language: "Langue",
  languageAuto: "Auto",
  reload: "Recharger",
  groupRaid: "Raids",
  groupKey: "Clés",
  groupMisc: "Divers",
  stepLevel: "Atteins le niveau {n}",
  stepKill: "Tue {name}",
  stepTalk: "Parle à {name}",
  stepUse: "Utilise {name}",
  stepTalkAny: "Parle au PNJ",
  stepUseAny: "Utilise l'objet",
  stepRep: "{faction} : réputation {n}",
  stepProf: "Métier {name}",
  stepEnd: "Accès débloqué",
};

let french: boolean | null = null;

export function setLocale(locale: string): void {
  french = locale === "frFR";
}

function clientLocale(): "frFR" | "enUS" {
  return typeof GetLocale === "function" && GetLocale() === "frFR" ? "frFR" : "enUS";
}

export function resolveLanguage(setting: LanguageSetting): "frFR" | "enUS" {
  return setting === "auto" ? clientLocale() : setting;
}

export function applyLanguage(setting: LanguageSetting): void {
  setLocale(resolveLanguage(setting));
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

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
  | "buildOverride";

const EN: Record<L10nKey, string> = {
  questieMissing: "QuestieDB is required",
  questNotFound: "quest not found",
  tabQuest: "Quest",
  tabAccess: "Access",
  tabCompletion: "Completion",
  positionUnavailable: "position unavailable",
  arrowUsage: "usage: /mmq arrow move|lock|test",
  help: "commands: /mmq q <id> | chain <questId> | targets | skip [confirm] | pin <id> | unpin | arrow move|lock|test | debug build <n>",
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
};

const FR: Record<L10nKey, string> = {
  questieMissing: "QuestieDB est requis",
  questNotFound: "quête introuvable",
  tabQuest: "Quête",
  tabAccess: "Accès",
  tabCompletion: "Complétion",
  positionUnavailable: "position indisponible",
  arrowUsage: "usage : /mmq arrow move|lock|test",
  help: "commandes : /mmq q <id> | chain <questId> | targets | skip [confirm] | pin <id> | unpin | arrow move|lock|test | debug build <n>",
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

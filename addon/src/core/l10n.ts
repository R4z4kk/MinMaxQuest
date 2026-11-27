export type L10nKey = "questieMissing" | "questNotFound" | "tabQuest" | "tabAccess" | "tabCompletion";

const EN: Record<L10nKey, string> = {
  questieMissing: "QuestieDB is required",
  questNotFound: "quest not found",
  tabQuest: "Quest",
  tabAccess: "Access",
  tabCompletion: "Completion",
};

const FR: Record<L10nKey, string> = {
  questieMissing: "QuestieDB est requis",
  questNotFound: "quête introuvable",
  tabQuest: "Quête",
  tabAccess: "Accès",
  tabCompletion: "Complétion",
};

let french: boolean | null = null;

export function setLocale(locale: string): void {
  french = locale === "frFR";
}

export function t(key: L10nKey): string {
  if (french == null) french = typeof GetLocale === "function" && GetLocale() === "frFR";
  return (french ? FR : EN)[key];
}

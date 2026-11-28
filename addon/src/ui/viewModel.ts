import { formatDuration } from "../core/geometry";
import { currentLocale, t } from "../core/l10n";
import type { QuestInfo } from "../data/questRepository";
import type { CharDb } from "../core/storage";
import { sameKey, targetName } from "../game/engine";
import type { Target, TargetKind, ZoneProgress } from "../targets/completion";
import type { ZoneIndex } from "./maps";
import { reportOnce } from "../core/report";
import { COLOR, colorCode, GLYPH, type IconKind } from "./theme";

export type CompletionLine =
  | { kind: "section"; label: string; count: number }
  | { kind: "row"; icon: IconKind; level: string; name: string; time: string; tone: "normal" | "grey" | "target" | "more"; questId: number | null };

type QuestGetter = (id: number) => QuestInfo | null;
export type Mode = CharDb["completion"]["mode"];
export const MODES: Mode[] = ["proximity", "zone", "log"];

export function formatCount(n: number): string {
  const digits = String(Math.round(Math.abs(n)));
  const separator = currentLocale() === "frFR" ? " " : ",";
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits.charAt(i);
  }
  return n < 0 ? `-${out}` : out;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatDecimal(value: number): string {
  const text = String(roundTenth(value));
  return currentLocale() === "frFR" ? text.replace(".", ",") : text;
}

export function progressText(p: ZoneProgress): string {
  return t("questsCount").replace("{done}", formatCount(p.done)).replace("{total}", formatCount(p.total));
}

export function percentText(p: ZoneProgress): string {
  return t("percent").replace("{p}", String(p.total > 0 ? Math.floor((p.done * 100) / p.total) : 0));
}

export function countText(p: ZoneProgress): string {
  return `${formatCount(p.done)} / ${formatCount(p.total)}`;
}

export function lostText(lost: { xp: number; levelFraction: number } | null): string {
  if (lost == null) return t("skipLostUnknown");
  return t("skipLost")
    .replace("{xp}", formatCount(lost.xp))
    .replace("{f}", formatDecimal(lost.levelFraction))
    .replace("{levels}", t(roundTenth(lost.levelFraction) >= 2 ? "levelMany" : "levelOne"));
}

export function sumProgress(totals: Map<number, ZoneProgress>, keep: (areaId: number) => boolean): ZoneProgress {
  const sum = { done: 0, total: 0 };
  for (const [areaId, zone] of totals) {
    if (!keep(areaId)) continue;
    sum.done += zone.done;
    sum.total += zone.total;
  }
  return sum;
}

export function bannerText(
  expired: string[], clientBuild: string | null, dataBuild: string, routesBuild: string | null = null,
): string | null {
  const parts: string[] = [];
  if (clientBuild != null && clientBuild !== dataBuild) parts.push(t("bannerBuild").replace("{build}", dataBuild));
  if (clientBuild != null && routesBuild != null && clientBuild !== routesBuild) {
    parts.push(t("bannerRoutesBuild").replace("{build}", routesBuild));
  }
  if (expired.length > 0) parts.push(t("bannerExpired").replace("{names}", expired.join(", ")));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function headerZone(mode: Mode, stored: number | null, current: number | null): number | null {
  return mode === "zone" ? stored : current;
}

export function zoneLabel(index: ZoneIndex | null, areaId: number | null): string {
  return (areaId == null || index == null ? null : index.name(areaId)) ?? t("unknownZone");
}

export function footerTexts(
  totals: Map<number, ZoneProgress>,
  zoneId: number | null,
  index: ZoneIndex | null,
): { continent: string; total: string } {
  const total = t("totalProgress").replace("{count}", countText(sumProgress(totals, () => true)));
  const continent = zoneId == null || index == null ? null : index.continentOf(zoneId);
  if (continent == null || index == null) return { continent: "", total };
  const sum = sumProgress(totals, (id) => index.continentOf(id)?.id === continent.id);
  return { continent: `${continent.name} · ${countText(sum)}`, total };
}

export function logHeader(n: number): string {
  const singular = n === 1 || (n === 0 && currentLocale() === "frFR");
  return t(singular ? "questsInLogOne" : "questsInLogMany").replace("{n}", String(n));
}

export function modeText(mode: Mode): string {
  return t(mode === "zone" ? "modeZone" : mode === "log" ? "modeLog" : "modeProximity");
}

const SECTIONS: { kind: TargetKind; label: "sectionTurnIn" | "sectionObjectives" | "sectionPickUp" }[] = [
  { kind: "turnin", label: "sectionTurnIn" },
  { kind: "objective", label: "sectionObjectives" },
  { kind: "accept", label: "sectionPickUp" },
];

function rowIcon(target: Target, getQuest: QuestGetter): IconKind {
  if (target.kind === "turnin") return "turnin";
  if (target.kind === "accept") return "accept";
  const quest = target.questId == null ? null : getQuest(target.questId);
  const objective = quest?.objectives.find((o) => o.index === target.objectiveIndex);
  if (objective == null) reportOnce(`completionIcon${target.questId}`, `quest ${target.questId} objective ${target.objectiveIndex} not found`);
  return objective?.kind === "npc" ? "kill" : "collect";
}

function rowLine(target: Target, isCurrent: boolean, getQuest: QuestGetter): CompletionLine {
  const tag = target.elite ? `  ${colorCode(COLOR.sub)}${t("eliteTag")}|r` : "";
  return {
    kind: "row",
    icon: rowIcon(target, getQuest),
    level: String(target.questLevel),
    name: (isCurrent ? GLYPH.current : "") + targetName(target, getQuest) + tag,
    time: formatDuration(target.seconds - target.penaltySec),
    tone: isCurrent ? "target" : target.trivial ? "grey" : "normal",
    questId: target.questId,
  };
}

export function completionLines(targets: Target[], current: Target | null, getQuest: QuestGetter, slots: number): CompletionLine[] {
  const lines: CompletionLine[] = [];
  for (const section of SECTIONS) {
    const picked: Target[] = [];
    const byQuest = new Map<number, number>();
    for (const target of targets) {
      if (target.kind !== section.kind) continue;
      const known = target.questId == null ? null : (byQuest.get(target.questId) ?? null);
      if (known == null) {
        if (target.questId != null) byQuest.set(target.questId, picked.length);
        picked.push(target);
      } else if (sameKey(target, current)) picked[known] = target;
    }
    if (picked.length === 0) continue;
    lines.push({ kind: "section", label: t(section.label), count: picked.length });
    for (const target of picked) lines.push(rowLine(target, sameKey(target, current), getQuest));
  }
  if (lines.length <= slots) return lines;
  const kept = cutLines(lines, current, slots - 1);
  const total = lines.filter((l) => l.kind === "row").length;
  const shown = kept.filter((l) => l.kind === "row").length;
  if (slots > 0) kept.push({ kind: "row", icon: "empty", level: "", name: t("moreRows").replace("{n}", String(total - shown)), time: "", tone: "more", questId: null });
  return kept;
}

function trimOrphan(lines: CompletionLine[]): void {
  if (lines.length > 0 && lines[lines.length - 1].kind === "section") lines.pop();
}

function cutLines(lines: CompletionLine[], current: Target | null, room: number): CompletionLine[] {
  const kept = lines.slice(0, Math.max(room, 0));
  trimOrphan(kept);
  if (current == null) return kept;
  const at = lines.findIndex((l) => l.kind === "row" && l.tone === "target");
  if (at < kept.length) return kept;
  let header = at - 1;
  while (lines[header].kind !== "section") header--;
  const prefix = lines.slice(0, Math.max(room - 1, 0));
  trimOrphan(prefix);
  if (header >= prefix.length) {
    const shorter = lines.slice(0, Math.max(room - 2, 0));
    trimOrphan(shorter);
    shorter.push(lines[header]);
    shorter.push(lines[at]);
    return shorter;
  }
  prefix.push(lines[at]);
  return prefix;
}

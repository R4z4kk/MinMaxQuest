import { distance, formatDistance, formatDuration, type WorldPos } from "../core/geometry";
import { currentLocale, t } from "../core/l10n";
import type { QuestInfo } from "../data/questRepository";
import type { CharDb } from "../core/storage";
import { sameKey, targetAction, targetName } from "../game/engine";
import type { Target, ZoneProgress } from "../targets/completion";
import type { ZoneIndex } from "./maps";
import { COLOR, colorCode } from "./theme";

export interface TargetView {
  questId: number | null;
  name: string;
  line: string;
}

export interface RowView {
  level: string;
  name: string;
  time: string;
  grey: boolean;
  elite: boolean;
}

export interface CompletionView {
  nearest: TargetView | null;
  next: TargetView | null;
  rows: RowView[];
  remaining: number;
  more: number;
}

export interface RowLine {
  level: string;
  name: string;
  time: string;
  tone: "normal" | "grey" | "more";
}

type QuestGetter = (id: number) => QuestInfo | null;
type Mode = CharDb["completion"]["mode"];

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

export function remainingLabel(mode: Mode, n: number): string {
  return t(mode === "zone" ? "remainingInZone" : "remainingNearby").replace("{n}", String(n));
}

export function modeText(mode: Mode): string {
  const tone = (on: boolean): string => colorCode(on ? COLOR.text : COLOR.sub);
  return `${tone(mode === "proximity")}${t("modeProximity")}|r | ${tone(mode === "zone")}${t("modeZone")}|r`;
}

export function rowLines(view: CompletionView, slots: number): RowLine[] {
  const lines: RowLine[] = [];
  for (let i = 0; i < slots; i++) {
    const row = view.rows[i];
    if (row != null) {
      const tag = row.elite ? `  ${colorCode(COLOR.sub)}${t("eliteTag")}|r` : "";
      lines.push({ level: row.level, name: row.name + tag, time: row.time, tone: row.grey ? "grey" : "normal" });
    } else if (i === view.rows.length && view.more > 0) {
      lines.push({ level: "", name: t("moreRows").replace("{n}", String(view.more)), time: "", tone: "more" });
    } else {
      lines.push({ level: "", name: "", time: "", tone: "normal" });
    }
  }
  return lines;
}

function targetView(target: Target, getQuest: QuestGetter, player: WorldPos | null): TargetView {
  const yards = player == null ? Infinity : distance(player, target.pos);
  const line = `${targetAction(target)} · ${formatDuration(target.seconds)} · ${formatDistance(yards, currentLocale())}`;
  return { questId: target.questId, name: targetName(target, getQuest), line };
}

export function completionView(
  targets: Target[],
  current: Target | null,
  getQuest: QuestGetter,
  player: WorldPos | null,
  maxRows: number,
): CompletionView {
  let next: Target | null = null;
  const rows: RowView[] = [];
  const listed = new Set<number>();
  let remaining = 0;
  for (const target of targets) {
    if (current != null && sameKey(target, current)) continue;
    if (next == null) {
      next = target;
      continue;
    }
    const id = target.questId;
    if (id != null) {
      if (listed.has(id)) continue;
      listed.add(id);
    }
    remaining++;
    if (rows.length >= maxRows) continue;
    rows.push({
      level: String(target.questLevel),
      name: targetName(target, getQuest),
      time: formatDuration(target.seconds),
      grey: target.trivial,
      elite: target.elite,
    });
  }
  return {
    nearest: current == null ? null : targetView(current, getQuest, player),
    next: next == null ? null : targetView(next, getQuest, player),
    rows,
    remaining,
    more: remaining - rows.length,
  };
}

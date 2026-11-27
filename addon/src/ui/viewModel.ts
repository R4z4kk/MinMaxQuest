import { distance, formatDistance, formatDuration, type WorldPos } from "../core/geometry";
import { currentLocale, t } from "../core/l10n";
import type { QuestInfo } from "../data/questRepository";
import { questLabel, targetAction } from "../game/engine";
import type { Target, ZoneProgress } from "../targets/completion";

export interface TargetView {
  questId: number;
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

type QuestGetter = (id: number) => QuestInfo | null;

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

function formatDecimal(value: number): string {
  const text = String(Math.round(value * 10) / 10);
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
  return t("skipLost").replace("{xp}", formatCount(lost.xp)).replace("{f}", formatDecimal(lost.levelFraction));
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

export function bannerText(expired: string[], clientBuild: string | null, dataBuild: string): string | null {
  const parts: string[] = [];
  if (clientBuild != null && clientBuild !== dataBuild) parts.push(t("bannerBuild").replace("{build}", dataBuild));
  if (expired.length > 0) parts.push(t("bannerExpired").replace("{names}", expired.join(", ")));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function sameTarget(a: Target, b: Target): boolean {
  return a.questId === b.questId && a.kind === b.kind && a.objectiveIndex === b.objectiveIndex;
}

function targetView(target: Target, getQuest: QuestGetter, player: WorldPos | null): TargetView {
  const yards = player == null ? Infinity : distance(player, target.pos);
  const line = `${targetAction(target)} · ${formatDuration(target.seconds)} · ${formatDistance(yards, currentLocale())}`;
  return { questId: target.questId, name: questLabel(target.questId, getQuest(target.questId)), line };
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
    if (current != null && sameTarget(target, current)) continue;
    if (next == null) {
      next = target;
      continue;
    }
    if (listed.has(target.questId)) continue;
    listed.add(target.questId);
    remaining++;
    if (rows.length >= maxRows) continue;
    rows.push({
      level: String(target.questLevel),
      name: questLabel(target.questId, getQuest(target.questId)),
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

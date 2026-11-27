import { playerPosition } from "../arrow/arrowFrame";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import type { Engine } from "../game/engine";
import { zoneTotals, type ZoneProgress } from "../targets/completion";
import { createZoneIndex, zoneEntries, type MapDeps, type ZoneIndex } from "./maps";
import { confirmSkip } from "./skipDialog";
import {
  bar, button, checkbox, COLOR, GLYPH, hline, label, paint, PAD, setLabel, SIZE, text, type Bar, type Button,
  type Checkbox, UI_FEATURE,
} from "./theme";
import type { TabView } from "./window";
import { completionView, countText, percentText, progressText, sumProgress } from "./viewModel";
import { createZonePicker } from "./zonePicker";

export interface CompletionDeps {
  db: CharDb;
  engine: Engine;
  repo: QuestRepository;
  quests(): QuestInfo[];
  maps: MapDeps;
}

const WIDTH = 300;
const HEIGHT = 480;
const MAX_ROWS = 10;
const ROW_HEIGHT = 15;
const INNER = WIDTH - 2 * PAD;

interface Row {
  level: WowFontString;
  name: WowFontString;
  time: WowFontString;
}

interface Widgets {
  zoneName: WowFontString;
  zoneCount: WowFontString;
  zonePercent: WowFontString;
  zoneBar: Bar;
  mode: Button;
  pinned: Button;
  nearestName: WowFontString;
  nearestLine: WowFontString;
  skip: Button;
  nextName: WowFontString;
  nextLine: WowFontString;
  remaining: WowFontString;
  rows: Row[];
  grey: Checkbox;
  elite: Checkbox;
  continent: WowFontString;
  total: WowFontString;
}

function at(fontString: WowFontString, parent: WowFrame, y: number, right = false): WowFontString {
  fontString.SetPoint(right ? "TOPRIGHT" : "TOPLEFT", parent, right ? "TOPRIGHT" : "TOPLEFT", right ? -PAD : PAD, y);
  return fontString;
}

export function createCompletionTab(deps: CompletionDeps): TabView {
  const { db, engine, repo } = deps;
  let root: WowFrame | null = null;
  let ui: Widgets | null = null;
  let index: ZoneIndex | null = null;
  let totals = new Map<number, ZoneProgress>();
  let totalsKey = "";

  const loadTotals = (): void => {
    const snap = engine.snapshot();
    if (snap == null) return;
    const quests = deps.quests();
    const { completed, raceMask, classMask } = snap.state;
    const key = `${completed.size}:${raceMask}:${classMask}:${quests.length}`;
    if (key === totalsKey) return;
    totalsKey = key;
    totals = zoneTotals(quests, completed, snap.state);
    if (index == null) index = createZoneIndex([...totals.keys()], deps.maps);
  };

  const currentZone = (): number | null => {
    const uiMap = C_Map.GetBestMapForUnit("player");
    return uiMap == null || index == null ? null : index.zoneOfMap(uiMap);
  };

  const applyOptions = (): void => {
    engine.refreshTargets(true);
    draw();
  };

  const onSkip = (): void => {
    const current = engine.current();
    if (current == null) return;
    const id = current.questId;
    const result = engine.skip(id, false);
    const quest = repo.get(id);
    if (result.needsConfirm && quest != null) {
      confirmSkip(quest, result.followUps, result.lost, () => {
        engine.skip(id, true);
        draw();
      });
    }
    draw();
  };

  const build = (parent: WowFrame): Widgets => {
    const picker = createZonePicker(parent);
    const zoneButton = button(parent, "MinMaxQuestCompletionZone", `${t("zonePicker")} ${GLYPH.dropdown}`, () => {
      if (index == null) return;
      picker.toggle(zoneButton.frame, zoneEntries(totals, index), (areaId) => {
        db.completion.zoneAreaId = areaId;
        db.completion.mode = "zone";
        applyOptions();
      });
    });
    zoneButton.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -7);
    const mode = button(parent, "MinMaxQuestCompletionMode", "", () => {
      const toZone = db.completion.mode !== "zone";
      if (toZone && db.completion.zoneAreaId == null) db.completion.zoneAreaId = currentZone();
      db.completion.mode = toZone ? "zone" : "proximity";
      applyOptions();
    });
    mode.frame.SetPoint("RIGHT", zoneButton.frame, "LEFT", -4, 0);
    setLabel(label(parent, PAD, -60), t("nearestTarget"));
    const pinned = button(parent, "MinMaxQuestCompletionUnpin", `${t("pinnedTag")} · ${GLYPH.close}`, () => {
      engine.pin(null);
      draw();
    });
    pinned.setPrimary(true);
    pinned.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -56);
    const skip = button(parent, "MinMaxQuestCompletionSkip", t("skip"), onSkip);
    skip.setPrimary(true);
    skip.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -74);
    hline(parent, -52);
    hline(parent, -108);
    setLabel(label(parent, PAD, -116), t("nextTarget"));
    hline(parent, -162);
    const rows: Row[] = [];
    for (let i = 0; i < MAX_ROWS + 1; i++) {
      const y = -186 - i * ROW_HEIGHT;
      const row = {
        level: at(text(parent, SIZE.small, COLOR.sub), parent, y),
        name: text(parent, SIZE.body, COLOR.rowText),
        time: at(text(parent, SIZE.small, COLOR.sub, "RIGHT"), parent, y, true),
      };
      row.name.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + 24, y);
      row.name.SetWidth(INNER - 24 - 48);
      rows.push(row);
    }
    const filterY = -(HEIGHT - 50) + 46;
    hline(parent, filterY + 6);
    const show = at(text(parent, SIZE.small, COLOR.sub), parent, filterY);
    show.SetText(t("showFilters"));
    const toggle = (key: "showTrivial" | "showElite") => () => {
      db.completion[key] = !db.completion[key];
      applyOptions();
    };
    const grey = checkbox(parent, "MinMaxQuestFilterGrey", t("filterGrey"), toggle("showTrivial"));
    grey.frame.SetPoint("LEFT", show, "RIGHT", 8, 0);
    const elite = checkbox(parent, "MinMaxQuestFilterElite", t("filterElite"), toggle("showElite"));
    elite.frame.SetPoint("LEFT", grey.frame, "RIGHT", 10, 0);
    hline(parent, filterY - 14);
    const w: Widgets = {
      zoneName: at(text(parent, SIZE.body, COLOR.text), parent, -9),
      zoneCount: at(text(parent, SIZE.small, COLOR.sub), parent, -27),
      zonePercent: at(text(parent, SIZE.small, COLOR.sub, "RIGHT"), parent, -27, true),
      zoneBar: bar(parent, INNER, PAD, -42),
      mode,
      pinned,
      nearestName: at(text(parent, SIZE.body, COLOR.text), parent, -76),
      nearestLine: at(text(parent, SIZE.small, COLOR.sub), parent, -92),
      skip,
      nextName: at(text(parent, SIZE.body, COLOR.nextText), parent, -130),
      nextLine: at(text(parent, SIZE.small, COLOR.sub), parent, -146),
      remaining: label(parent, PAD, -170),
      rows,
      grey,
      elite,
      continent: at(text(parent, SIZE.small, COLOR.sub), parent, filterY - 22),
      total: at(text(parent, SIZE.small, COLOR.accent, "RIGHT"), parent, filterY - 22, true),
    };
    w.nearestName.SetWidth(INNER - 60);
    return w;
  };

  const drawRows = (w: Widgets, view: ReturnType<typeof completionView>): void => {
    w.rows.forEach((row, i) => {
      const data = view.rows[i];
      const more = data == null && i === view.rows.length && view.more > 0;
      row.level.SetText(data == null ? "" : data.level);
      row.time.SetText(data == null ? "" : data.time);
      const tag = data != null && data.elite ? `  |cff8b8b8b${t("eliteTag")}|r` : "";
      row.name.SetText(data != null ? data.name + tag : more ? t("moreRows").replace("{n}", String(view.more)) : "");
      const grey = data != null && data.grey;
      paint(row.name, grey ? COLOR.grey : more ? COLOR.sub : COLOR.rowText);
      paint(row.level, grey ? COLOR.grey : COLOR.sub);
      paint(row.time, grey ? COLOR.grey : COLOR.sub);
    });
  };

  const draw = (): void => {
    const w = ui;
    if (w == null) return;
    loadTotals();
    const options = db.completion;
    const zoneId = options.mode === "zone" ? options.zoneAreaId : currentZone();
    const zone = (zoneId == null ? null : totals.get(zoneId)) ?? { done: 0, total: 0 };
    const zoneName = zoneId == null || index == null ? null : index.name(zoneId);
    w.zoneName.SetText(zoneName ?? t("unknownZone"));
    w.zoneCount.SetText(progressText(zone));
    w.zonePercent.SetText(percentText(zone));
    w.zoneBar.setFraction(zone.total > 0 ? zone.done / zone.total : 0);
    w.mode.setText(t(options.mode === "zone" ? "modeZone" : "modeProximity"));
    if (db.pinnedQuestId != null) w.pinned.frame.Show();
    else w.pinned.frame.Hide();

    const view = completionView(engine.targets(), engine.current(), (id) => repo.get(id), playerPosition(), MAX_ROWS);
    w.nearestName.SetText(view.nearest == null ? t("noTarget") : view.nearest.name);
    w.nearestLine.SetText(view.nearest == null ? "" : view.nearest.line);
    if (view.nearest == null) w.skip.frame.Hide();
    else w.skip.frame.Show();
    w.nextName.SetText(view.next == null ? "" : view.next.name);
    w.nextLine.SetText(view.next == null ? "" : view.next.line);
    setLabel(w.remaining, t("remaining").replace("{n}", String(view.remaining)));
    drawRows(w, view);
    w.grey.set(options.showTrivial);
    w.elite.set(options.showElite);

    const continent = zoneId == null || index == null ? null : index.continentOf(zoneId);
    const zones = index;
    w.continent.SetText(
      continent == null || zones == null
        ? ""
        : `${continent.name} · ${countText(sumProgress(totals, (id) => zones.continentOf(id)?.id === continent.id))}`,
    );
    w.total.SetText(t("totalProgress").replace("{count}", countText(sumProgress(totals, () => true))));
  };

  const refresh = (): void => {
    if (root != null && root.IsVisible()) draw();
  };
  engine.onChange(() => guard(UI_FEATURE, refresh));

  return {
    width: WIDTH,
    height: HEIGHT,
    render(parent) {
      root = parent;
      ui = build(parent);
    },
    refresh: () => refresh(),
  };
}

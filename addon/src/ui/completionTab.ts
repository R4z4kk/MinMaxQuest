import { playerPosition } from "../arrow/arrowFrame";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import { questLabel, type Engine } from "../game/engine";
import { zoneTotals, type ZoneProgress } from "../targets/completion";
import { createZoneIndex, zoneEntries, type MapDeps, type ZoneIndex } from "./maps";
import { confirmSkip } from "./skipDialog";
import {
  bar, button, checkbox, COLOR, GLYPH, hline, label, paint, PAD, setLabel, SIZE, text, UI_FEATURE,
} from "./theme";
import type { TabView } from "./window";
import {
  completionView, footerTexts, headerZone, modeText, percentText, progressText, remainingLabel, rowLines, zoneLabel,
  type RowLine,
} from "./viewModel";
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
const EMPTY: ZoneProgress = { done: 0, total: 0 };

interface Row {
  level: WowFontString;
  name: WowFontString;
  time: WowFontString;
}

function at(fontString: WowFontString, parent: WowFrame, y: number, right = false): WowFontString {
  fontString.SetPoint(right ? "TOPRIGHT" : "TOPLEFT", parent, right ? "TOPRIGHT" : "TOPLEFT", right ? -PAD : PAD, y);
  return fontString;
}

function paintRow(row: Row, line: RowLine): void {
  row.level.SetText(line.level);
  row.name.SetText(line.name);
  row.time.SetText(line.time);
  const grey = line.tone === "grey";
  paint(row.name, grey ? COLOR.grey : line.tone === "more" ? COLOR.sub : COLOR.rowText);
  paint(row.level, grey ? COLOR.grey : COLOR.sub);
  paint(row.time, grey ? COLOR.grey : COLOR.sub);
}

export function skipCurrent(engine: Engine, repo: QuestRepository, redraw: () => void): void {
  const current = engine.current();
  if (current == null) return;
  const id = current.questId;
  if (id == null) {
    if (current.route != null) engine.skipStep(current.route.index);
    redraw();
    return;
  }
  const result = engine.skip(id, false);
  if (result.needsConfirm) {
    confirmSkip({ name: questLabel(id, repo.get(id)) }, result.followUps, result.lost, () => {
      engine.skip(id, true);
      redraw();
    });
  }
  redraw();
}

export function createCompletionTab(deps: CompletionDeps): TabView {
  const { db, engine, repo } = deps;
  let root: WowFrame | null = null;
  let ui: ReturnType<typeof build> | null = null;
  let index: ZoneIndex | null = null;
  let totals = new Map<number, ZoneProgress>();
  let totalsKey = "";
  let notified = false;

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

  // A forced refresh that changes the list already redraws through onChange.
  const applyOptions = (): void => {
    notified = false;
    engine.refreshTargets(true);
    if (!notified) draw();
  };

  const onSkip = (): void => skipCurrent(engine, repo, draw);

  const build = (parent: WowFrame) => {
    const picker = createZonePicker(parent);
    let anchor: WowFrame = parent;
    const openPicker = (): void => {
      if (index == null) return;
      picker.toggle(anchor, zoneEntries(totals, index), (areaId) => {
        db.completion.zoneAreaId = areaId;
        db.completion.mode = "zone";
        applyOptions();
      });
    };
    const zoneButton = button(parent, "MinMaxQuestCompletionZone", "", openPicker);
    zoneButton.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -7);
    anchor = zoneButton.frame;
    const mode = button(parent, "MinMaxQuestCompletionMode", "", () => {
      const toZone = db.completion.mode !== "zone";
      if (toZone && db.completion.zoneAreaId == null) {
        const here = currentZone();
        if (here == null) {
          openPicker();
          return;
        }
        db.completion.zoneAreaId = here;
      }
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
    const w = {
      zoneName: at(text(parent, SIZE.body, COLOR.text), parent, -9),
      zoneCount: at(text(parent, SIZE.small, COLOR.sub), parent, -27),
      zonePercent: at(text(parent, SIZE.small, COLOR.sub, "RIGHT"), parent, -27, true),
      zoneBar: bar(parent, INNER, PAD, -42),
      mode,
      zoneButton,
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
    w.zoneName.SetWidth(INNER - 180);
    w.nearestName.SetWidth(INNER - 60);
    return w;
  };

  const draw = (): void => {
    const w = ui;
    if (w == null) return;
    loadTotals();
    const options = db.completion;
    const zoneId = headerZone(options.mode, options.zoneAreaId, currentZone());
    const zone = (zoneId == null ? null : totals.get(zoneId)) ?? EMPTY;
    w.zoneName.SetText(zoneLabel(index, zoneId));
    w.zoneCount.SetText(progressText(zone));
    w.zonePercent.SetText(percentText(zone));
    w.zoneBar.setFraction(zone.total > 0 ? zone.done / zone.total : 0);
    w.mode.setText(modeText(options.mode));
    w.zoneButton.setText(`${zoneLabel(index, options.zoneAreaId ?? zoneId)} ${GLYPH.dropdown}`);
    if (db.pinnedQuestId != null) w.pinned.frame.Show();
    else w.pinned.frame.Hide();

    const view = completionView(engine.targets(), engine.current(), (id) => repo.get(id), playerPosition(), MAX_ROWS);
    w.nearestName.SetText(view.nearest == null ? t("noTarget") : view.nearest.name);
    w.nearestLine.SetText(view.nearest == null ? "" : view.nearest.line);
    if (view.nearest == null) w.skip.frame.Hide();
    else w.skip.frame.Show();
    w.nextName.SetText(view.next == null ? "" : view.next.name);
    w.nextLine.SetText(view.next == null ? "" : view.next.line);
    setLabel(w.remaining, remainingLabel(options.mode, view.remaining));
    rowLines(view, w.rows.length).forEach((line, i) => paintRow(w.rows[i], line));
    w.grey.set(options.showTrivial);
    w.elite.set(options.showElite);
    const footer = footerTexts(totals, zoneId, index);
    w.continent.SetText(footer.continent);
    w.total.SetText(footer.total);
  };

  const refresh = (): void => {
    if (root != null && root.IsVisible()) draw();
  };
  engine.onChange(() => {
    notified = true;
    guard(UI_FEATURE, refresh);
  });

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

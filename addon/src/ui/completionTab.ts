import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import { questLabel, type Engine } from "../game/engine";
import { zoneTotals, type ZoneProgress } from "../targets/completion";
import { createZoneIndex, zoneEntries, type MapDeps, type ZoneIndex } from "./maps";
import { confirmSkip } from "./skipDialog";
import {
  bar, button, checkbox, COLOR, createKindIcon, createSectionHeader, GLYPH, hline, onClick, paint, PAD, SIZE, text, UI_FEATURE, WINDOW_HEIGHT,
  WINDOW_WIDTH, type KindIcon, type SectionHeader,
} from "./theme";
import { CONTENT_TOP, createTabButton, placeTabs, TAB_HEIGHT, type TabButton, type TabView } from "./window";
import {
  completionLines, footerTexts, formatCount, headerZone, logHeader, modeText, MODES, percentText, progressText, zoneLabel,
  type CompletionLine, type Mode,
} from "./viewModel";
import { createZonePicker } from "./zonePicker";

export interface CompletionDeps {
  db: CharDb;
  engine: Engine;
  repo: QuestRepository;
  quests(): QuestInfo[];
  maps: MapDeps;
}

const LINE_HEIGHT = 18;
const INNER = WINDOW_WIDTH - 2 * PAD;
const ZONE_HEADER_WIDTH = INNER - 180;
const BODY_HEIGHT = WINDOW_HEIGHT - CONTENT_TOP - TAB_HEIGHT;
const ACTIONS_Y = -58;
const LIST_TOP = -84;
const FILTER_Y = -BODY_HEIGHT + 46;
const SLOTS = Math.floor((LIST_TOP - FILTER_Y - 4) / LINE_HEIGHT);
const ICON_X = PAD;
const LEVEL_X = PAD + 22;
const NAME_X = PAD + 44;
const TIME_WIDTH = 48;
const EMPTY: ZoneProgress = { done: 0, total: 0 };

interface Line {
  hit: WowFrame;
  questId: number | null;
  header: SectionHeader;
  icon: KindIcon;
  level: WowFontString;
  name: WowFontString;
  time: WowFontString;
}

function at(fontString: WowFontString, parent: WowFrame, y: number, right = false): WowFontString {
  fontString.SetPoint(right ? "TOPRIGHT" : "TOPLEFT", parent, right ? "TOPRIGHT" : "TOPLEFT", right ? -PAD : PAD, y);
  return fontString;
}

function showIf(frame: WowFrame | WowFontString, on: boolean): void {
  if (on) frame.Show();
  else frame.Hide();
}

export function togglePin(engine: Engine, db: CharDb, questId: number): void {
  engine.pin(db.pinnedQuestId === questId ? null : questId);
}

function paintLine(line: Line, data: CompletionLine | null): void {
  const section = data != null && data.kind === "section";
  const row = data != null && data.kind === "row";
  line.questId = data != null && data.kind === "row" ? data.questId : null;
  showIf(line.hit, line.questId != null);
  showIf(line.header.frame, section);
  showIf(line.icon.frame, row && data.tone !== "more");
  showIf(line.level, row);
  showIf(line.name, row);
  showIf(line.time, row);
  if (data == null) return;
  if (data.kind === "section") {
    line.header.set(data.label, formatCount(data.count));
    return;
  }
  line.icon.set(data.icon);
  line.level.SetText(data.level);
  line.name.SetText(data.name);
  line.time.SetText(data.time);
  const grey = data.tone === "grey";
  paint(line.name, grey ? COLOR.grey : data.tone === "more" ? COLOR.sub : data.tone === "target" ? COLOR.title : COLOR.rowText);
  paint(line.level, grey ? COLOR.grey : COLOR.sub);
  paint(line.time, grey ? COLOR.grey : COLOR.sub);
}

export function skipCurrent(engine: Engine, repo: QuestRepository, redraw: () => void): void {
  const current = engine.current();
  if (current == null) return;
  skipStepOrQuest(engine, repo, redraw, current.questId, current.route?.index ?? null);
}

export function skipStepOrQuest(engine: Engine, repo: QuestRepository, redraw: () => void, id: number | null, index: number | null): void {
  if (id == null) {
    if (index != null) engine.skipStep(index);
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
  let laidOutMode = "";

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

  const selectMode = (mode: Mode, askZone: () => void): void => {
    db.completion.mode = mode;
    const needsZone = mode === "zone" && db.completion.zoneAreaId == null;
    if (needsZone) db.completion.zoneAreaId = currentZone();
    applyOptions();
    if (needsZone && db.completion.zoneAreaId == null) askZone();
  };

  const onSkip = (): void => skipCurrent(engine, repo, draw);

  const build = (content: WowFrame) => {
    const picker = createZonePicker(content);
    const parent = CreateFrame("Frame", null, content);
    parent.SetPoint("TOPLEFT", content, "TOPLEFT", 0, -TAB_HEIGHT);
    parent.SetPoint("BOTTOMRIGHT", content, "BOTTOMRIGHT", 0, 0);
    hline(content, -TAB_HEIGHT);
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
    const modeTabs: TabButton[] = MODES.map((mode) =>
      createTabButton(content, `MinMaxQuestCompletionTab${mode}`, modeText(mode), () => {
        picker.hide();
        selectMode(mode, openPicker);
      }),
    );
    placeTabs(content, modeTabs, WINDOW_WIDTH, 0);
    const pinned = button(parent, "MinMaxQuestCompletionUnpin", `${t("pinnedTag")} · ${GLYPH.close}`, () => {
      engine.pin(null);
      draw();
    });
    pinned.setPrimary(true);
    pinned.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, ACTIONS_Y);
    const skip = button(parent, "MinMaxQuestCompletionSkip", t("skip"), onSkip);
    skip.setPrimary(true);
    skip.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, ACTIONS_Y);
    hline(parent, -52);
    hline(parent, ACTIONS_Y - 20);
    const empty = at(text(parent, SIZE.body, COLOR.sub), parent, LIST_TOP);
    const lines: Line[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const y = LIST_TOP - i * LINE_HEIGHT;
      const header = createSectionHeader(parent, INNER);
      header.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, y);
      const icon = createKindIcon(parent);
      icon.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", ICON_X, y - 1);
      const hit = CreateFrame("Button", `MinMaxQuestCompletionLine${i + 1}`, parent);
      hit.SetSize(INNER, LINE_HEIGHT);
      hit.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, y);
      const line: Line = {
        hit,
        questId: null,
        header,
        icon,
        level: text(parent, SIZE.small, COLOR.sub),
        name: text(parent, SIZE.body, COLOR.rowText),
        time: at(text(parent, SIZE.small, COLOR.sub, "RIGHT"), parent, y - 2, true),
      };
      line.level.SetPoint("TOPLEFT", parent, "TOPLEFT", LEVEL_X, y - 2);
      line.name.SetPoint("TOPLEFT", parent, "TOPLEFT", NAME_X, y - 2);
      line.name.SetWidth(INNER - (NAME_X - PAD) - TIME_WIDTH);
      onClick(hit, () => {
        if (line.questId == null) return;
        togglePin(engine, db, line.questId);
        draw();
      });
      paintLine(line, null);
      lines.push(line);
    }
    const filterY = FILTER_Y;
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
      modeTabs,
      zoneButton,
      pinned,
      skip,
      empty,
      lines,
      grey,
      elite,
      continent: at(text(parent, SIZE.small, COLOR.sub), parent, filterY - 22),
      total: at(text(parent, SIZE.small, COLOR.accent, "RIGHT"), parent, filterY - 22, true),
    };
    return w;
  };

  const draw = (): void => {
    const w = ui;
    if (w == null) return;
    loadTotals();
    const options = db.completion;
    const zoneId = headerZone(options.mode, options.zoneAreaId, currentZone());
    const zone = (zoneId == null ? null : totals.get(zoneId)) ?? EMPTY;
    const inLog = options.mode === "log";
    const inZone = options.mode === "zone";
    if (inLog) {
      w.zoneName.SetText(logHeader(engine.snapshot()?.state.inLog.size ?? 0));
      w.zoneCount.SetText("");
      w.zonePercent.SetText("");
      w.zoneBar.setFraction(0);
    } else {
      w.zoneName.SetText(zoneLabel(index, zoneId));
      w.zoneCount.SetText(progressText(zone));
      w.zonePercent.SetText(percentText(zone));
      w.zoneBar.setFraction(zone.total > 0 ? zone.done / zone.total : 0);
      w.zoneButton.setText(`${zoneLabel(index, options.zoneAreaId ?? zoneId)} ${GLYPH.dropdown}`);
    }
    if (inZone) w.zoneButton.frame.Show();
    else w.zoneButton.frame.Hide();
    if (options.mode !== laidOutMode) {
      laidOutMode = options.mode;
      w.zoneName.SetWidth(inZone ? ZONE_HEADER_WIDTH : INNER);
    }
    MODES.forEach((mode, i) => w.modeTabs[i].setActive(mode === options.mode));
    if (db.pinnedQuestId != null) w.pinned.frame.Show();
    else w.pinned.frame.Hide();

    const lines = completionLines(engine.targets(), engine.current(), (id) => repo.get(id), SLOTS);
    showIf(w.skip.frame, engine.current() != null);
    w.empty.SetText(lines.length === 0 ? t("noTarget") : "");
    w.lines.forEach((line, i) => paintLine(line, lines[i] ?? null));
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
    render(parent) {
      root = parent;
      ui = build(parent);
    },
    refresh: () => refresh(),
  };
}

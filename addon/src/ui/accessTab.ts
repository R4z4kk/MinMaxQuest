import { entriesFor } from "../access/chains";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { AccessGroup } from "../data/generated/access";
import type { QuestRepository } from "../data/questRepository";
import type { Engine } from "../game/engine";
import { clientFactionName, clientItemName, clientQuestTitle, itemCount, repEarned } from "../game/playerState";
import { accessLines, accessView, trackedGroups, trackedText, type AccessLine } from "./accessModel";
import {
  bar, checkbox, COLOR, fill, GLYPH, hline, onClick, paint, PAD, SIZE, text, UI_FEATURE, type Bar, type Checkbox,
} from "./theme";
import { CONTENT_TOP, type TabView } from "./window";

export interface AccessDeps {
  db: CharDb;
  engine: Engine;
  repo: QuestRepository;
  areaName(areaId: number): string | null;
}

const WIDTH = 320;
const HEIGHT = 420;
const FOOTER = 28;
const LIST_HEIGHT = HEIGHT - CONTENT_TOP - FOOTER;
const ROW = 20;
const POOL = Math.floor(LIST_HEIGHT / ROW);
const GUTTER = 6;
const ROW_WIDTH = WIDTH - GUTTER;
const INNER = ROW_WIDTH - 2 * PAD;
const STEP_INDENT = 12;
const RANGE_ROOM = 44;
const WHEEL_LINES = 3;

interface Row {
  frame: WowFrame;
  highlight: WowTexture;
  left: WowFontString;
  right: WowFontString;
  strike: WowTexture;
  bar: Bar;
  track: Checkbox;
  line: AccessLine | null;
}

export function createAccessTab(deps: AccessDeps): TabView {
  const { db, engine, repo } = deps;
  let root: WowFrame | null = null;
  const rows: Row[] = [];
  let thumb: WowTexture | null = null;
  let lines: AccessLine[] = [];
  let offset = 0;
  // Null until the first draw, which opens the groups holding a tracked entry.
  let openGroups: Set<AccessGroup> | null = null;
  let footerTracked: WowFontString | null = null;
  let footerMode: WowFontString | null = null;

  const toggleTracked = (id: string): void => {
    const at = db.trackedChains.indexOf(id);
    if (at < 0) db.trackedChains.push(id);
    else db.trackedChains.splice(at, 1);
    // The route rebuilds its chain insertions.
    engine.refreshTargets(true);
    draw();
  };

  const clickRow = (row: Row): void => {
    const line = row.line;
    if (line == null) return;
    if (line.kind === "group" && openGroups != null) {
      if (openGroups.has(line.group)) openGroups.delete(line.group);
      else openGroups.add(line.group);
      draw();
    } else if (line.kind === "entry") {
      db.expandedChain = db.expandedChain === line.view.id ? null : line.view.id;
      draw();
    }
  };

  const bind = (row: Row, line: AccessLine | null): void => {
    row.line = line;
    if (line == null) {
      row.frame.Hide();
      return;
    }
    row.frame.Show();
    row.strike.Hide();
    row.bar.setShown(false);
    row.track.frame.Hide();
    row.right.Hide();
    row.left.ClearAllPoints();
    const inBlock = line.kind === "step" || line.kind === "track" || (line.kind === "entry" && line.view.expanded);
    if (inBlock) row.highlight.Show();
    else row.highlight.Hide();
    if (line.kind === "group") {
      row.left.SetPoint("LEFT", row.frame, "LEFT", PAD, 0);
      row.left.SetWidth(INNER);
      row.left.SetText(`${line.text} ${line.open ? GLYPH.dropdown : GLYPH.current}`);
      paint(row.left, COLOR.accent);
    } else if (line.kind === "entry") {
      const view = line.view;
      row.left.SetPoint("TOPLEFT", row.frame, "TOPLEFT", PAD, -3);
      row.left.SetWidth(INNER - RANGE_ROOM);
      row.left.SetText(view.name);
      paint(row.left, view.tracked ? COLOR.accent : COLOR.text);
      if (view.range != null) {
        row.right.SetText(view.range);
        row.right.Show();
      }
      row.bar.setShown(true);
      row.bar.setFraction(view.fraction);
    } else if (line.kind === "step") {
      const { state } = line.step;
      row.left.SetPoint("LEFT", row.frame, "LEFT", PAD + STEP_INDENT, 0);
      row.left.SetWidth(INNER - STEP_INDENT);
      row.left.SetText((state === "current" ? GLYPH.current : "") + line.step.text);
      paint(row.left, state === "done" ? COLOR.sub : state === "current" ? COLOR.accent : COLOR.stepText);
      if (state === "done") {
        row.strike.SetWidth(Math.min(row.left.GetStringWidth(), INNER - STEP_INDENT));
        row.strike.Show();
      }
    } else {
      row.left.SetPoint("LEFT", row.frame, "LEFT", PAD, 0);
      row.left.SetWidth(INNER / 2);
      row.left.SetText(line.view.count);
      paint(row.left, COLOR.sub);
      row.track.set(line.view.tracked);
      row.track.frame.Show();
    }
  };

  const bindAll = (): void => {
    rows.forEach((row, i) => bind(row, lines[offset + i] ?? null));
    const list = root;
    if (thumb == null || list == null) return;
    if (lines.length <= POOL) {
      thumb.Hide();
      return;
    }
    thumb.SetHeight(Math.max(ROW, (LIST_HEIGHT * POOL) / lines.length));
    thumb.ClearAllPoints();
    thumb.SetPoint("TOPRIGHT", list, "TOPRIGHT", -2, -(LIST_HEIGHT * offset) / lines.length);
    thumb.Show();
  };

  const clampOffset = (value: number): number => Math.max(0, Math.min(value, lines.length - POOL));

  const scroll = (delta: number): void => {
    offset = clampOffset(offset - delta * WHEEL_LINES);
    bindAll();
  };

  const draw = (): void => {
    footerMode?.SetText(t("activeMode").replace("{mode}", t(db.activeMode === "quest" ? "tabQuest" : "tabCompletion")));
    const snap = engine.snapshot();
    if (root == null || snap == null) return;
    const views = accessView(entriesFor(snap.faction), {
      level: snap.state.level,
      raceMask: snap.state.raceMask,
      completed: snap.state.completed,
      inLog: snap.state.inLog,
      itemCount,
      repEarned,
      getQuest: (id) => repo.get(id),
      questTitle: (id) => clientQuestTitle(id),
      itemName: (id) => clientItemName(id),
      factionName: (id) => clientFactionName(id),
      zoneName: (areaId) => deps.areaName(areaId),
      expanded: db.expandedChain,
      tracked: db.trackedChains,
    });
    if (openGroups == null) openGroups = trackedGroups(views);
    lines = accessLines(views, openGroups);
    offset = clampOffset(offset);
    bindAll();
    footerTracked?.SetText(trackedText(db.trackedChains.length));
  };

  const onWheel = (frame: WowFrame): void => {
    frame.EnableMouseWheel(true);
    frame.SetScript("OnMouseWheel", (_, delta) => {
      guard(UI_FEATURE, () => scroll(delta));
    });
  };

  const createRow = (list: WowFrame, index: number): Row => {
    const name = `MinMaxQuestAccessRow${index + 1}`;
    const frame = CreateFrame("Button", name, list);
    frame.SetSize(ROW_WIDTH, ROW);
    frame.SetPoint("TOPLEFT", list, "TOPLEFT", 0, -index * ROW);
    const highlight = frame.CreateTexture(null, "BACKGROUND");
    fill(highlight, COLOR.openRow);
    highlight.SetPoint("TOPLEFT", frame, "TOPLEFT", 1, 0);
    highlight.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 0, 0);
    const left = text(frame, SIZE.body, COLOR.text);
    const right = text(frame, SIZE.small, COLOR.sub, "RIGHT");
    right.SetPoint("TOPRIGHT", frame, "TOPRIGHT", -PAD, -3);
    const strike = frame.CreateTexture(null, "OVERLAY");
    fill(strike, COLOR.sub);
    strike.SetHeight(1);
    strike.SetPoint("LEFT", left, "LEFT", 0, 0);
    const row: Row = {
      frame, highlight, left, right, strike,
      bar: bar(frame, INNER, PAD, -15),
      track: checkbox(frame, `${name}Track`, t("trackInRoute"), () => {
        const line = row.line;
        if (line != null && line.kind === "track") toggleTracked(line.view.id);
      }),
      line: null,
    };
    row.track.frame.SetPoint("RIGHT", frame, "RIGHT", -PAD, 0);
    row.track.frame.SetFrameLevel(frame.GetFrameLevel() + 2);
    onClick(frame, () => clickRow(row));
    onWheel(frame);
    return row;
  };

  const refresh = (): void => {
    if (root != null && root.IsVisible()) draw();
  };
  engine.onChange(() => guard(UI_FEATURE, refresh));

  return {
    width: WIDTH,
    height: HEIGHT,
    render(parent) {
      const list = CreateFrame("Frame", "MinMaxQuestAccessList", parent);
      list.SetSize(WIDTH, LIST_HEIGHT);
      list.SetPoint("TOPLEFT", parent, "TOPLEFT", 0, 0);
      onWheel(list);
      for (let i = 0; i < POOL; i++) rows.push(createRow(list, i));
      thumb = list.CreateTexture(null, "OVERLAY");
      fill(thumb, COLOR.buttonLine);
      thumb.SetWidth(2);
      thumb.Hide();
      root = list;
      hline(parent, FOOTER, "BOTTOM");
      footerMode = text(parent, SIZE.small, COLOR.sub);
      footerMode.SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", PAD, 9);
      footerTracked = text(parent, SIZE.small, COLOR.accent, "RIGHT");
      footerTracked.SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT", -PAD, 9);
    },
    refresh: () => refresh(),
  };
}

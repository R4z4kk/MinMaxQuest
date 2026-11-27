import { ACCESS_CHAINS } from "../access/chains";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { QuestRepository } from "../data/questRepository";
import type { Engine } from "../game/engine";
import { accessView, trackedText, type ChainView } from "./accessModel";
import {
  bar, checkbox, COLOR, fill, GLYPH, hline, onClick, paint, PAD, SIZE, text, UI_FEATURE, type Bar, type Checkbox,
} from "./theme";
import type { TabView } from "./window";

export interface AccessDeps {
  db: CharDb;
  engine: Engine;
  repo: QuestRepository;
  areaName(areaId: number): string | null;
}

const WIDTH = 320;
const HEIGHT = 420;
const INNER = WIDTH - 2 * PAD;
const STEP_HEIGHT = 15;
const COLLAPSED = 36;
const FOOTER = 28;

interface Block {
  frame: WowFrame;
  highlight: WowTexture;
  name: WowFontString;
  range: WowFontString;
  bar: Bar;
  rail: WowTexture;
  steps: WowFontString[];
  count: WowFontString;
  track: Checkbox;
}

export function createAccessTab(deps: AccessDeps): TabView {
  const { db, engine, repo } = deps;
  let root: WowFrame | null = null;
  const blocks: Block[] = [];
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

  const block = (parent: WowFrame, id: string, name: string): Block => {
    const frame = CreateFrame("Button", name, parent);
    frame.SetWidth(WIDTH);
    const highlight = frame.CreateTexture(null, "BACKGROUND");
    fill(highlight, COLOR.openRow);
    highlight.SetPoint("TOPLEFT", frame, "TOPLEFT", 1, 0);
    highlight.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -1, 0);
    const title = text(frame, SIZE.body, COLOR.text);
    title.SetPoint("TOPLEFT", frame, "TOPLEFT", PAD, -8);
    const range = text(frame, SIZE.small, COLOR.sub, "RIGHT");
    range.SetPoint("TOPRIGHT", frame, "TOPRIGHT", -PAD, -8);
    const rail = frame.CreateTexture(null, "BORDER");
    fill(rail, COLOR.line);
    rail.SetWidth(1);
    const count = text(frame, SIZE.small, COLOR.sub);
    const track = checkbox(frame, `${name}Track`, t("trackInRoute"), () => toggleTracked(id));
    track.frame.SetFrameLevel(frame.GetFrameLevel() + 2);
    hline(frame, 0, "BOTTOM");
    onClick(frame, () => {
      db.expandedChain = db.expandedChain === id ? null : id;
      draw();
    });
    return { frame, highlight, name: title, range, bar: bar(frame, INNER, PAD, -26), rail, steps: [], count, track };
  };

  const drawBlock = (parent: WowFrame, b: Block, view: ChainView, y: number): number => {
    b.frame.ClearAllPoints();
    b.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", 0, y);
    b.name.SetText(view.name);
    b.range.SetText(view.range);
    b.bar.setFraction(view.fraction);
    const shown = view.expanded ? view.steps.length : 0;
    while (b.steps.length < shown) {
      const step = text(b.frame, SIZE.body, COLOR.stepText);
      step.SetPoint("TOPLEFT", b.frame, "TOPLEFT", PAD + 12, -COLLAPSED - b.steps.length * STEP_HEIGHT);
      step.SetWidth(INNER - 12);
      b.steps.push(step);
    }
    b.steps.forEach((step, i) => {
      const data = i < shown ? view.steps[i] : null;
      if (data == null) {
        step.SetText("");
        return;
      }
      const prefix = data.state === "done" ? GLYPH.check : data.state === "current" ? GLYPH.current : "";
      step.SetText(prefix + data.text);
      paint(step, data.state === "done" ? COLOR.sub : data.state === "current" ? COLOR.accent : COLOR.stepText);
    });
    if (!view.expanded) {
      b.highlight.Hide();
      b.rail.Hide();
      b.count.SetText("");
      b.track.frame.Hide();
      b.frame.SetHeight(COLLAPSED);
      return COLLAPSED;
    }
    const stepsBottom = -COLLAPSED - shown * STEP_HEIGHT;
    b.highlight.Show();
    b.rail.ClearAllPoints();
    b.rail.SetPoint("TOPLEFT", b.frame, "TOPLEFT", PAD + 2, -COLLAPSED + 2);
    b.rail.SetHeight(Math.max(1, shown * STEP_HEIGHT));
    b.rail.Show();
    b.count.ClearAllPoints();
    b.count.SetPoint("TOPLEFT", b.frame, "TOPLEFT", PAD, stepsBottom - 6);
    b.count.SetText(view.count);
    b.track.set(view.tracked);
    b.track.frame.ClearAllPoints();
    b.track.frame.SetPoint("TOPRIGHT", b.frame, "TOPRIGHT", -PAD, stepsBottom - 5);
    b.track.frame.Show();
    const height = -stepsBottom + 26;
    b.frame.SetHeight(height);
    return height;
  };

  const draw = (): void => {
    const parent = root;
    footerMode?.SetText(t("activeMode").replace("{mode}", t(db.activeMode === "quest" ? "tabQuest" : "tabCompletion")));
    const snap = engine.snapshot();
    if (parent == null || snap == null) return;
    const views = accessView(ACCESS_CHAINS, {
      faction: snap.faction,
      completed: snap.state.completed,
      inLog: snap.state.inLog,
      getQuest: (id) => repo.get(id),
      zoneName: (areaId) => deps.areaName(areaId),
      expanded: db.expandedChain,
      tracked: db.trackedChains,
    });
    let y = 0;
    views.forEach((view, i) => {
      if (blocks[i] == null) blocks[i] = block(parent, view.id, `MinMaxQuestChain${i + 1}`);
      y -= drawBlock(parent, blocks[i], view, y);
    });
    footerTracked?.SetText(trackedText(db.trackedChains.length));
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
      hline(parent, FOOTER, "BOTTOM");
      footerMode = text(parent, SIZE.small, COLOR.sub);
      footerMode.SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", PAD, 9);
      footerTracked = text(parent, SIZE.small, COLOR.accent, "RIGHT");
      footerTracked.SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT", -PAD, 9);
    },
    refresh: () => refresh(),
  };
}

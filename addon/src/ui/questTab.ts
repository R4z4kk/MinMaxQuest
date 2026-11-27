import { formatDistance, formatDuration } from "../core/geometry";
import { currentLocale, resolveLanguage, t } from "../core/l10n";
import { guard } from "../core/report";
import type { AccountDb, CharDb, LanguageSetting } from "../core/storage";
import type { QuestRepository } from "../data/questRepository";
import type { ArrowApi } from "../arrow/arrowFrame";
import type { Engine } from "../game/engine";
import type { RouteFollower, RouteView } from "../route/follower";
import { skipStepOrQuest } from "./completionTab";
import { bar, button, BUTTON_HEIGHT, checkbox, COLOR, GLYPH, hline, label, PAD, setLabel, SIZE, text, UI_FEATURE, type Button, type Bar, type Checkbox } from "./theme";
import { formatCount } from "./viewModel";
import { CONTENT_TOP, type TabView } from "./window";

export interface QuestDeps {
  db: CharDb;
  account: AccountDb;
  engine: Engine;
  arrow(): ArrowApi;
  repo: QuestRepository;
  follower: RouteFollower;
  areaName(areaId: number): string | null;
  refreshTargets(): void;
  refreshPins(): void;
  openCompletion(): void;
  resize(height: number): void;
}

// 0 stands for "off" (null): a nil inside a Lua array would end iteration.
const GAPS = [0, 1, 2, 3];
const WIDTH = 270;
const HEIGHT = 262;
const NEXT_SLOTS = 3;
const DUNGEON_COLUMNS = 2;
const DUNGEON_COLUMN = (WIDTH - 2 * PAD) / DUNGEON_COLUMNS;
const SECTION_Y = -154;
const LINE = 16;
const CHECK_HEIGHT = 14;
const FOOTER_ROOM = 26;
const GAP_ROW_Y = SECTION_Y - 5 * LINE - 20;
const LANGUAGE_ROW_Y = GAP_ROW_Y - BUTTON_HEIGHT - 22;
const OPTIONS_HEIGHT = CONTENT_TOP - LANGUAGE_ROW_Y + BUTTON_HEIGHT + FOOTER_ROOM;
const LANGUAGES: { value: LanguageSetting; caption: string | null }[] = [
  { value: "auto", caption: null },
  { value: "enUS", caption: "English" },
  { value: "frFR", caption: "Français" },
];
const SECONDS_PER_HOUR = 3600;

type Section = "options" | "dungeons";

function remainingText(seconds: number): string {
  return seconds >= SECONDS_PER_HOUR ? `~${formatCount(seconds / SECONDS_PER_HOUR)} h` : formatDuration(seconds);
}

export function createQuestTab(deps: QuestDeps): TabView {
  const { db, account, follower } = deps;
  let root: WowFrame | null = null;
  // Both sections start closed so the tab opens at its 270 x 262 size.
  let open: Section | null = null;
  const checks: Checkbox[] = [];
  const gapButtons: Button[] = [];
  const languageButtons: Button[] = [];
  let reloadButton: Button | null = null;
  const optionWidgets: WowRegion[] = [];
  const dungeonBoxes = new Map<number, Checkbox>();
  const routeWidgets: WowRegion[] = [];
  let message: WowFontString | null = null;
  let openCompletion: Button | null = null;
  let banner: WowFontString | null = null;
  let resync: Button | null = null;
  let currentText: WowFontString | null = null;
  let nextTexts: WowFontString[] = [];
  let footer: WowFontString | null = null;
  let progressText: WowFontString | null = null;
  let progressBar: Bar | null = null;
  let nextDistance: WowFontString | null = null;
  let viewed: RouteView | null = null;
  let optionsToggle: Button | null = null;
  let dungeonsToggle: Button | null = null;
  let dungeonsHeight = HEIGHT;
  const stored: (() => boolean)[] = [() => db.routeElites, () => db.routeDungeons, () => db.autoFly, () => db.nativeWaypoint, () => deps.arrow().isLocked()];

  const toggleDungeon = (areaId: number): void => {
    const at = db.dungeonReturns.indexOf(areaId);
    if (at < 0) db.dungeonReturns.push(areaId);
    else db.dungeonReturns.splice(at, 1);
    deps.refreshTargets();
    draw();
  };

  const setShown = (widget: WowRegion, on: boolean): void => {
    if (on) widget.Show();
    else widget.Hide();
  };

  const drawOptions = (): void => {
    checks.forEach((box, i) => box.set(stored[i]()));
    gapButtons.forEach((gapButton, i) => gapButton.setPrimary(GAPS[i] === (db.minLevelGap ?? 0)));
    languageButtons.forEach((languageButton, i) => languageButton.setPrimary(LANGUAGES[i].value === account.locale));
    for (const widget of optionWidgets) setShown(widget, open === "options");
    if (reloadButton != null) setShown(reloadButton.frame, open === "options" && resolveLanguage(account.locale) !== currentLocale());
    dungeonBoxes.forEach((box, areaId) => {
      box.set(db.dungeonReturns.includes(areaId));
      setShown(box.frame, open === "dungeons");
    });
    optionsToggle?.setText(`${t("options")} ${open === "options" ? GLYPH.dropdown : GLYPH.current}`);
    dungeonsToggle?.setText(`${t("dungeons")} ${open === "dungeons" ? GLYPH.dropdown : GLYPH.current}`);
  };

  const drawRoute = (view: RouteView): void => {
    const level = deps.engine.snapshot()?.state.level ?? 0;
    const off = view.levelGap != null;
    banner?.SetText(off ? t("routeOff").replace("{level}", String(level)).replace("{expected}", String(level - (view.levelGap ?? 0))) : "");
    if (resync != null) setShown(resync.frame, off);
    viewed = view;
    currentText?.SetText(view.currentText ?? "");
    const progress = view.currentProgress != null && view.currentProgress.need > 0 ? view.currentProgress : null;
    progressText?.SetText(progress == null ? "" : `${progress.have}/${progress.need}`);
    progressBar?.setShown(progress != null);
    progressBar?.setFraction(progress == null ? 0 : progress.have / progress.need);
    nextDistance?.SetText(view.nextDistance == null ? "" : formatDistance(view.nextDistance, currentLocale()));
    nextTexts.forEach((line, i) => line.SetText(view.nextTexts[i] ?? ""));
    footer?.SetText(
      t("routeFooter")
        .replace("{level}", String(level))
        .replace("{step}", formatCount((view.current ?? 0) + 1))
        .replace("{total}", formatCount(view.total))
        .replace("{left}", remainingText(view.remainingSeconds)),
    );
  };

  const draw = (): void => {
    const view = follower.view();
    const missing = follower.unavailable() != null;
    const finished = !missing && view != null && view.finished;
    const active = !missing && view != null && !view.finished;
    for (const widget of routeWidgets) setShown(widget, active);
    if (message != null) setShown(message, missing || finished);
    if (openCompletion != null) setShown(openCompletion.frame, missing || finished);
    if (missing || finished) message?.SetText(t(missing ? "routesMissing" : "routeFinished"));
    if (active && view != null) drawRoute(view);
    else {
      banner?.SetText("");
      progressBar?.setShown(false);
      if (resync != null) setShown(resync.frame, false);
    }
    drawOptions();
  };

  const refresh = (): void => {
    if (root != null && root.IsVisible()) draw();
  };
  deps.engine.onChange(() => guard(UI_FEATURE, refresh));

  const section = (parent: WowFrame, which: Section, name: string, x: number): Button => {
    const toggle = button(parent, name, "", () => {
      open = open === which ? null : which;
      view.height = open === "dungeons" ? dungeonsHeight : open === "options" ? OPTIONS_HEIGHT : HEIGHT;
      deps.resize(view.height);
      draw();
    });
    toggle.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", x, -132);
    return toggle;
  };

  const view: TabView = {
    width: WIDTH,
    height: HEIGHT,
    render(parent) {
      root = parent;
      const inner = WIDTH - 2 * PAD;
      message = text(parent, SIZE.body, COLOR.sub);
      message.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -30);
      message.SetWidth(inner);
      message.SetWordWrap(true);
      openCompletion = button(parent, "MinMaxQuestOpenCompletion", t("openCompletion"), () => deps.openCompletion());
      openCompletion.setPrimary(true);
      openCompletion.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -66);

      banner = text(parent, SIZE.small, COLOR.accent);
      banner.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -8);
      banner.SetWidth(inner - 60);
      resync = button(parent, "MinMaxQuestResync", t("resync"), () => {
        follower.resync();
        deps.refreshTargets();
        draw();
      });
      resync.setPrimary(true);
      resync.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -6);
      const header = label(parent, PAD, -30);
      setLabel(header, t("currentStep"));
      const skip = button(parent, "MinMaxQuestRouteSkip", t("skip"), () => {
        const view = viewed;
        if (view != null) skipStepOrQuest(deps.engine, deps.repo, draw, view.currentQuestId, view.currentIndex);
      });
      skip.setPrimary(true);
      skip.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -26);
      currentText = text(parent, SIZE.body, COLOR.text);
      currentText.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -46);
      currentText.SetWidth(inner - 40);
      progressText = text(parent, SIZE.small, COLOR.accent, "RIGHT");
      progressText.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -47);
      progressBar = bar(parent, inner, PAD, -61);
      nextDistance = text(parent, SIZE.small, COLOR.sub, "RIGHT");
      nextDistance.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, -67);
      const nextHeader = label(parent, PAD, -66);
      setLabel(nextHeader, t("nextTarget"));
      nextTexts = [];
      for (let i = 0; i < NEXT_SLOTS; i++) {
        const line = text(parent, SIZE.small, COLOR.nextText);
        line.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + 8, -82 - i * 14);
        line.SetWidth(inner - 8);
        nextTexts.push(line);
      }
      footer = text(parent, SIZE.small, COLOR.sub);
      footer.SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", PAD, 9);
      routeWidgets.push(skip.frame, header, currentText, progressText, nextDistance, nextHeader, footer, ...nextTexts);
      hline(parent, -126);

      optionsToggle = section(parent, "options", "MinMaxQuestSectionOptions", PAD);
      dungeonsToggle = section(parent, "dungeons", "MinMaxQuestSectionDungeons", 100);

      const option = (name: string, caption: string, row: number, toggle: () => void): void => {
        const box = checkbox(parent, name, caption, () => {
          toggle();
          draw();
        });
        box.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, SECTION_Y - row * LINE);
        checks.push(box);
        optionWidgets.push(box.frame);
      };
      option("MinMaxQuestRouteElites", t("includeElites"), 0, () => {
        db.routeElites = !db.routeElites;
        deps.refreshTargets();
      });
      option("MinMaxQuestRouteDungeons", t("includeDungeons"), 1, () => {
        db.routeDungeons = !db.routeDungeons;
        deps.refreshTargets();
      });
      option("MinMaxQuestAutoFly", t("autoFly"), 2, () => {
        db.autoFly = !db.autoFly;
      });
      option("MinMaxQuestNativeWaypoint", t("nativeWaypoint"), 3, () => {
        db.nativeWaypoint = !db.nativeWaypoint;
        deps.refreshPins();
      });
      option("MinMaxQuestLockArrow", t("lockArrow"), 4, () => {
        const arrow = deps.arrow();
        arrow.setLocked(!arrow.isLocked());
      });
      const gapLabel = text(parent, SIZE.small, COLOR.sub);
      gapLabel.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, GAP_ROW_Y + 16);
      gapLabel.SetText(t("maxQuestLevel"));
      optionWidgets.push(gapLabel);
      let previous: WowFrame | null = null;
      for (const gap of GAPS) {
        const gapButton = button(parent, `MinMaxQuestGap${gap}`, gap === 0 ? t("off") : `-${gap}`, () => {
          db.minLevelGap = gap === 0 ? null : gap;
          deps.refreshTargets();
          draw();
        });
        if (previous == null) gapButton.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, GAP_ROW_Y);
        else gapButton.frame.SetPoint("LEFT", previous, "RIGHT", 4, 0);
        previous = gapButton.frame;
        gapButtons.push(gapButton);
        optionWidgets.push(gapButton.frame);
      }

      const languageLabel = text(parent, SIZE.small, COLOR.sub);
      languageLabel.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, LANGUAGE_ROW_Y + 16);
      languageLabel.SetText(t("language"));
      optionWidgets.push(languageLabel);
      let previousLanguage: WowFrame | null = null;
      for (const language of LANGUAGES) {
        const languageButton = button(parent, `MinMaxQuestLanguage${language.value}`, language.caption ?? t("languageAuto"), () => {
          account.locale = language.value;
          draw();
        });
        if (previousLanguage == null) languageButton.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, LANGUAGE_ROW_Y);
        else languageButton.frame.SetPoint("LEFT", previousLanguage, "RIGHT", 4, 0);
        previousLanguage = languageButton.frame;
        languageButtons.push(languageButton);
        optionWidgets.push(languageButton.frame);
      }
      reloadButton = button(parent, "MinMaxQuestReload", t("reload"), () => ReloadUI());
      reloadButton.setPrimary(true);
      reloadButton.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, LANGUAGE_ROW_Y + 18);

      const dungeons = follower.returnDungeons();
      dungeons.forEach((areaId, i) => {
        const box = checkbox(parent, `MinMaxQuestDungeon${areaId}`, deps.areaName(areaId) ?? `#${areaId}`, () => toggleDungeon(areaId));
        box.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + (i % DUNGEON_COLUMNS) * DUNGEON_COLUMN, SECTION_Y - Math.floor(i / DUNGEON_COLUMNS) * LINE);
        dungeonBoxes.set(areaId, box);
      });
      const rows = Math.ceil(dungeons.length / DUNGEON_COLUMNS);
      dungeonsHeight = Math.max(HEIGHT, CONTENT_TOP - SECTION_Y + (rows - 1) * LINE + CHECK_HEIGHT + FOOTER_ROOM);
    },
    refresh: () => refresh(),
  };
  return view;
}

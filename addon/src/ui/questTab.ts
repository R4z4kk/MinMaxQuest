import { formatDistance, formatDuration } from "../core/geometry";
import { currentLocale, resolveLanguage, t } from "../core/l10n";
import { guard } from "../core/report";
import type { AccountDb, CharDb, LanguageSetting } from "../core/storage";
import type { QuestRepository } from "../data/questRepository";
import type { ArrowApi } from "../arrow/arrowFrame";
import type { Engine } from "../game/engine";
import type { RouteFollower, RouteView } from "../route/follower";
import { skipStepOrQuest } from "./completionTab";
import type { StepType } from "../route/format";
import {
  bar, button, BUTTON_HEIGHT, checkbox, COLOR, createKindIcon, createSectionHeader, GLYPH, onClick, PAD, SIZE, text, UI_FEATURE, WINDOW_WIDTH,
  type Bar, type Button, type Checkbox, type IconKind, type KindIcon, type SectionHeader,
} from "./theme";
import { formatCount } from "./viewModel";
import type { TabView } from "./window";

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
}

// 0 stands for "off" (null): a nil inside a Lua array would end iteration.
const GAPS = [0, 1, 2, 3];
const INNER = WINDOW_WIDTH - 2 * PAD;
const NEXT_SLOTS = 3;
const DUNGEON_COLUMNS = 2;
const DUNGEON_COLUMN = INNER / DUNGEON_COLUMNS;
const ICON_ROOM = 22;
const SKIP_ROOM = 46;
const DISTANCE_ROOM = 50;
const LINE = 16;
const HEADER = 18;
const BODY_GAP = 4;
const BANNER_Y = -4;
const CURRENT_Y = -24;
const CURRENT_ROW_Y = -46;
const PROGRESS_Y = -64;
const NEXT_Y = -82;
const NEXT_ROW_Y = -104;
const NEXT_PITCH = 18;
const OPTIONS_Y = -162;
const OPTION_ROWS = 5;
const OPTIONS_BODY_Y = OPTIONS_Y - HEADER - BODY_GAP;
const GAP_ROW_OFFSET = OPTION_ROWS * LINE + 18;
const LANGUAGE_ROW_OFFSET = GAP_ROW_OFFSET + BUTTON_HEIGHT + 18;
const OPTIONS_BODY_HEIGHT = LANGUAGE_ROW_OFFSET + BUTTON_HEIGHT;
const LANGUAGES: { value: LanguageSetting; caption: string | null }[] = [
  { value: "auto", caption: null },
  { value: "enUS", caption: "English" },
  { value: "frFR", caption: "Français" },
];
const SECONDS_PER_HOUR = 3600;

type Section = "options" | "dungeons";

const STEP_ICON: Record<StepType, IconKind> = {
  accept: "accept",
  turnin: "turnin",
  complete: "kill",
  grind: "kill",
  dungeon: "kill",
  fly: "fly",
  getFlightPath: "fly",
  hearth: "hearth",
  setHearth: "hearth",
};

export function stepIcon(type: StepType): IconKind {
  return STEP_ICON[type];
}

interface NextRow {
  icon: KindIcon;
  text: WowFontString;
}

function remainingText(seconds: number): string {
  return seconds >= SECONDS_PER_HOUR ? `~${formatCount(seconds / SECONDS_PER_HOUR)} h` : formatDuration(seconds);
}

export function createQuestTab(deps: QuestDeps): TabView {
  const { db, account, follower } = deps;
  let root: WowFrame | null = null;
  // Both sections start closed so the route stays in view.
  const opened: Record<Section, boolean> = { options: false, dungeons: false };
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
  let currentIcon: KindIcon | null = null;
  let currentText: WowFontString | null = null;
  let nextRows: NextRow[] = [];
  let nextHeader: SectionHeader | null = null;
  let footer: WowFontString | null = null;
  let progressText: WowFontString | null = null;
  let progressBar: Bar | null = null;
  let nextDistance: WowFontString | null = null;
  let viewed: RouteView | null = null;
  let optionsHeader: SectionHeader | null = null;
  let dungeonsHeader: SectionHeader | null = null;
  let dungeonsToggle: WowFrame | null = null;
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

  const marker = (on: boolean): string => (on ? GLYPH.dropdown : GLYPH.current);

  const placeDungeons = (): void => {
    const parent = root;
    if (parent == null || dungeonsToggle == null) return;
    const headerY = opened.options ? OPTIONS_BODY_Y - OPTIONS_BODY_HEIGHT - BODY_GAP : OPTIONS_BODY_Y;
    dungeonsToggle.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, headerY);
    const bodyY = headerY - HEADER - BODY_GAP;
    let i = 0;
    dungeonBoxes.forEach((box) => {
      box.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + (i % DUNGEON_COLUMNS) * DUNGEON_COLUMN, bodyY - Math.floor(i / DUNGEON_COLUMNS) * LINE);
      i++;
    });
  };

  const drawOptions = (): void => {
    checks.forEach((box, i) => box.set(stored[i]()));
    gapButtons.forEach((gapButton, i) => gapButton.setPrimary(GAPS[i] === (db.minLevelGap ?? 0)));
    languageButtons.forEach((languageButton, i) => languageButton.setPrimary(LANGUAGES[i].value === account.locale));
    for (const widget of optionWidgets) setShown(widget, opened.options);
    if (reloadButton != null) setShown(reloadButton.frame, opened.options && resolveLanguage(account.locale) !== currentLocale());
    dungeonBoxes.forEach((box, areaId) => {
      box.set(db.dungeonReturns.includes(areaId));
      setShown(box.frame, opened.dungeons);
    });
    optionsHeader?.set(t("options"), marker(opened.options));
    dungeonsHeader?.set(t("dungeons"), `${dungeonBoxes.size} ${marker(opened.dungeons)}`);
  };

  const drawRoute = (view: RouteView): void => {
    const level = deps.engine.snapshot()?.state.level ?? 0;
    const off = view.levelGap != null;
    banner?.SetText(off ? t("routeOff").replace("{level}", String(level)).replace("{expected}", String(level - (view.levelGap ?? 0))) : "");
    if (resync != null) setShown(resync.frame, off);
    viewed = view;
    currentIcon?.set(view.currentType == null ? "empty" : stepIcon(view.currentType));
    currentText?.SetText(view.currentText ?? "");
    const progress = view.currentProgress != null && view.currentProgress.need > 0 ? view.currentProgress : null;
    progressText?.SetText(progress == null ? "" : `${progress.have}/${progress.need}`);
    progressBar?.setShown(progress != null);
    progressBar?.setFraction(progress == null ? 0 : progress.have / progress.need);
    nextDistance?.SetText(view.nextDistance == null ? "" : formatDistance(view.nextDistance, currentLocale()));
    nextHeader?.set(t("sectionNext"), String(view.nextTexts.length));
    nextRows.forEach((row, i) => {
      const type = view.nextTypes[i];
      setShown(row.icon.frame, type != null);
      if (type != null) row.icon.set(stepIcon(type));
      row.text.SetText(view.nextTexts[i] ?? "");
    });
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

  const section = (parent: WowFrame, which: Section, name: string, y: number): { frame: WowFrame; header: SectionHeader } => {
    const frame = CreateFrame("Button", name, parent);
    frame.SetSize(INNER, HEADER);
    frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, y);
    const header = createSectionHeader(frame, INNER);
    header.frame.SetPoint("TOPLEFT", frame, "TOPLEFT", 0, 0);
    onClick(frame, () => {
      opened[which] = !opened[which];
      placeDungeons();
      draw();
    });
    return { frame, header };
  };

  const view: TabView = {
    render(parent) {
      root = parent;
      message = text(parent, SIZE.body, COLOR.sub);
      message.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -30);
      message.SetWidth(INNER);
      message.SetWordWrap(true);
      openCompletion = button(parent, "MinMaxQuestOpenCompletion", t("openCompletion"), () => deps.openCompletion());
      openCompletion.setPrimary(true);
      openCompletion.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -66);

      banner = text(parent, SIZE.small, COLOR.accent);
      banner.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, BANNER_Y - 3);
      banner.SetWidth(INNER - 60);
      resync = button(parent, "MinMaxQuestResync", t("resync"), () => {
        follower.resync();
        deps.refreshTargets();
        draw();
      });
      resync.setPrimary(true);
      resync.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, BANNER_Y);

      const currentHeader = createSectionHeader(parent, INNER);
      currentHeader.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, CURRENT_Y);
      currentHeader.set(t("currentStep"), "");
      currentIcon = createKindIcon(parent);
      currentIcon.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, CURRENT_ROW_Y);
      currentText = text(parent, SIZE.body, COLOR.text);
      currentText.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + ICON_ROOM, CURRENT_ROW_Y - 2);
      currentText.SetWidth(INNER - ICON_ROOM - SKIP_ROOM);
      const skip = button(parent, "MinMaxQuestRouteSkip", t("skip"), () => {
        const view = viewed;
        if (view != null) skipStepOrQuest(deps.engine, deps.repo, draw, view.currentQuestId, view.currentIndex);
      });
      skip.setPrimary(true);
      skip.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, CURRENT_ROW_Y);
      progressText = text(parent, SIZE.small, COLOR.accent);
      progressText.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + ICON_ROOM, PROGRESS_Y);
      progressText.SetWidth(40);
      progressBar = bar(parent, INNER - ICON_ROOM - 44, PAD + ICON_ROOM + 44, PROGRESS_Y - 4);

      nextHeader = createSectionHeader(parent, INNER);
      nextHeader.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, NEXT_Y);
      nextRows = [];
      for (let i = 0; i < NEXT_SLOTS; i++) {
        const y = NEXT_ROW_Y - i * NEXT_PITCH;
        const icon = createKindIcon(parent);
        icon.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, y);
        const line = text(parent, SIZE.small, COLOR.nextText);
        line.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD + ICON_ROOM, y - 2);
        line.SetWidth(INNER - ICON_ROOM - DISTANCE_ROOM);
        nextRows.push({ icon, text: line });
      }
      nextDistance = text(parent, SIZE.small, COLOR.sub, "RIGHT");
      nextDistance.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, NEXT_ROW_Y - 2);
      nextDistance.SetWidth(DISTANCE_ROOM);
      footer = text(parent, SIZE.small, COLOR.sub);
      footer.SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", PAD, 9);
      routeWidgets.push(
        currentHeader.frame, currentIcon.frame, currentText, skip.frame, progressText, nextHeader.frame, nextDistance, footer,
        ...nextRows.map((row) => row.text),
      );

      optionsHeader = section(parent, "options", "MinMaxQuestSectionOptions", OPTIONS_Y).header;
      const dungeonsSection = section(parent, "dungeons", "MinMaxQuestSectionDungeons", OPTIONS_BODY_Y);
      dungeonsHeader = dungeonsSection.header;
      dungeonsToggle = dungeonsSection.frame;

      const option = (name: string, caption: string, row: number, toggle: () => void): void => {
        const box = checkbox(parent, name, caption, () => {
          toggle();
          draw();
        });
        box.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, OPTIONS_BODY_Y - row * LINE);
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
      const gapRowY = OPTIONS_BODY_Y - GAP_ROW_OFFSET;
      const languageRowY = OPTIONS_BODY_Y - LANGUAGE_ROW_OFFSET;
      const gapLabel = text(parent, SIZE.small, COLOR.sub);
      gapLabel.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, gapRowY + 14);
      gapLabel.SetText(t("maxQuestLevel"));
      optionWidgets.push(gapLabel);
      let previous: WowFrame | null = null;
      for (const gap of GAPS) {
        const gapButton = button(parent, `MinMaxQuestGap${gap}`, gap === 0 ? t("off") : `-${gap}`, () => {
          db.minLevelGap = gap === 0 ? null : gap;
          deps.refreshTargets();
          draw();
        });
        if (previous == null) gapButton.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, gapRowY);
        else gapButton.frame.SetPoint("LEFT", previous, "RIGHT", 4, 0);
        previous = gapButton.frame;
        gapButtons.push(gapButton);
        optionWidgets.push(gapButton.frame);
      }

      const languageLabel = text(parent, SIZE.small, COLOR.sub);
      languageLabel.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, languageRowY + 14);
      languageLabel.SetText(t("language"));
      optionWidgets.push(languageLabel);
      let previousLanguage: WowFrame | null = null;
      for (const language of LANGUAGES) {
        const languageButton = button(parent, `MinMaxQuestLanguage${language.value}`, language.caption ?? t("languageAuto"), () => {
          account.locale = language.value;
          draw();
        });
        if (previousLanguage == null) languageButton.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, languageRowY);
        else languageButton.frame.SetPoint("LEFT", previousLanguage, "RIGHT", 4, 0);
        previousLanguage = languageButton.frame;
        languageButtons.push(languageButton);
        optionWidgets.push(languageButton.frame);
      }
      reloadButton = button(parent, "MinMaxQuestReload", t("reload"), () => ReloadUI());
      reloadButton.setPrimary(true);
      reloadButton.frame.SetPoint("TOPRIGHT", parent, "TOPRIGHT", -PAD, languageRowY);

      for (const areaId of follower.returnDungeons()) {
        const box = checkbox(parent, `MinMaxQuestDungeon${areaId}`, deps.areaName(areaId) ?? `#${areaId}`, () => toggleDungeon(areaId));
        dungeonBoxes.set(areaId, box);
      }
      placeDungeons();
    },
    refresh: () => refresh(),
  };
  return view;
}

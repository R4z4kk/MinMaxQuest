import type { ArrowApi } from "../arrow/arrowFrame";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { AccountDb, CharDb } from "../core/storage";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import type { Engine } from "../game/engine";
import type { RouteFollower } from "../route/follower";
import { createAccessTab } from "./accessTab";
import { createBanner, type Banner } from "./banner";
import { createCompletionTab } from "./completionTab";
import { wowMapDeps } from "./maps";
import { createQuestTab } from "./questTab";
import { COLOR, PAD, SIZE, text, UI_FEATURE } from "./theme";
import { createWindow, type TabId, type TabView, type WindowApi } from "./window";

export interface UiGame {
  engine: Engine;
  repo: QuestRepository;
  follower: RouteFollower;
  quests(): QuestInfo[];
  refreshPins(): void;
}

export interface UiContext {
  db(): CharDb;
  account(): AccountDb;
  game(): UiGame | null;
  arrow(): ArrowApi;
  hideAll(): void;
}

export interface Ui {
  isShown(): boolean;
  setShown(shown: boolean): void;
  // Redraws the Access tab if it is shown, e.g. once item names reach the client cache.
  refreshAccess(): void;
}

function noticeTab(message: string): TabView {
  return {
    render(parent) {
      const line = text(parent, SIZE.body, COLOR.sub);
      line.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -14);
      line.SetText(message);
    },
    refresh() {},
  };
}

function gameTabs(db: CharDb, account: AccountDb, game: UiGame, arrow: UiContext["arrow"], setTab: (tab: TabId) => void): Record<TabId, TabView> {
  const { engine, repo } = game;
  const maps = wowMapDeps(repo);
  return {
    quest: createQuestTab({
      db,
      account,
      engine,
      arrow,
      repo,
      follower: game.follower,
      areaName: (areaId) => maps.areaName(areaId),
      refreshTargets: () => engine.refreshTargets(true),
      refreshPins: () => game.refreshPins(),
      openCompletion: () => setTab("completion"),
    }),
    access: createAccessTab({ db, engine, repo, areaName: (areaId) => maps.areaName(areaId) }),
    completion: createCompletionTab({ db, engine, repo, quests: () => game.quests(), maps }),
  };
}

export function createUi(ctx: UiContext): Ui {
  let built: { window: WindowApi; banner: Banner; access: TabView } | null = null;

  const build = (): { window: WindowApi; banner: Banner; access: TabView } => {
    const db = ctx.db();
    const game = ctx.game();
    let window: WindowApi | null = null;
    const notice = noticeTab(t("questieMissing"));
    const tabs =
      game == null
        ? { quest: notice, access: notice, completion: notice }
        : gameTabs(db, ctx.account(), game, () => ctx.arrow(), (tab) => window?.setTab(tab));
    window = createWindow(db, tabs, () => ctx.hideAll(), () => {
      if (game == null) return true;
      const snap = game.engine.snapshot();
      return snap == null ? null : snap.state.level < snap.maxLevel;
    });
    const shown = window;
    game?.engine.onChange(() => guard(UI_FEATURE, () => shown.syncQuestTab()));
    return { window, banner: createBanner(window.frame, () => (game == null ? null : game.follower.routesBuild())), access: tabs.access };
  };

  return {
    isShown: () => built?.window.isShown() ?? false,
    setShown(shown) {
      guard(UI_FEATURE, () => {
        if (!shown && built == null) return;
        const ui = built ?? build();
        built = ui;
        ui.window.setShown(shown);
        if (shown) ui.banner.update();
      });
    },
    refreshAccess() {
      const ui = built;
      if (ui != null) guard(UI_FEATURE, () => ui.access.refresh());
    },
  };
}

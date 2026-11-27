import type { ArrowApi } from "../arrow/arrowFrame";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
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
  game(): UiGame | null;
  arrow(): ArrowApi;
}

export interface Ui {
  toggle(): void;
}

function noticeTab(message: string): TabView {
  return {
    width: 270,
    height: 90,
    render(parent) {
      const line = text(parent, SIZE.body, COLOR.sub);
      line.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -14);
      line.SetText(message);
    },
    refresh() {},
  };
}

function gameTabs(db: CharDb, game: UiGame, arrow: UiContext["arrow"], setTab: (tab: TabId) => void, resize: (height: number) => void): Record<TabId, TabView> {
  const { engine, repo } = game;
  const maps = wowMapDeps(repo);
  return {
    quest: createQuestTab({
      db,
      engine,
      arrow,
      repo,
      follower: game.follower,
      areaName: (areaId) => maps.areaName(areaId),
      refreshTargets: () => engine.refreshTargets(true),
      refreshPins: () => game.refreshPins(),
      openCompletion: () => setTab("completion"),
      resize: (height) => resize(height),
    }),
    access: createAccessTab({ db, engine, repo, areaName: (areaId) => maps.areaName(areaId) }),
    completion: createCompletionTab({ db, engine, repo, quests: () => game.quests(), maps }),
  };
}

export function createUi(ctx: UiContext): Ui {
  let built: { window: WindowApi; banner: Banner } | null = null;

  const build = (): { window: WindowApi; banner: Banner } => {
    const db = ctx.db();
    const game = ctx.game();
    let window: WindowApi | null = null;
    const notice = noticeTab(t("questieMissing"));
    const tabs =
      game == null
        ? { quest: notice, access: notice, completion: notice }
        : gameTabs(db, game, () => ctx.arrow(), (tab) => window?.setTab(tab), (height) => window?.frame.SetHeight(height));
    window = createWindow(db, tabs);
    return { window, banner: createBanner(window.frame, () => (game == null ? null : game.follower.routesBuild())) };
  };

  return {
    toggle() {
      guard(UI_FEATURE, () => {
        const ui = built ?? build();
        built = ui;
        if (ui.window.toggle()) ui.banner.update();
      });
    },
  };
}

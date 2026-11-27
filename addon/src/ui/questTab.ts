import { t } from "../core/l10n";
import type { CharDb } from "../core/storage";
import { button, checkbox, COLOR, hline, label, PAD, setLabel, SIZE, text, type Button, type Checkbox } from "./theme";
import type { TabView } from "./window";

export interface QuestDeps {
  db: CharDb;
  refreshTargets(): void;
  openCompletion(): void;
}

// 0 stands for "off" (null): a nil inside a Lua array would end iteration.
const GAPS = [0, 1, 2, 3];

export function createQuestTab(deps: QuestDeps): TabView {
  const { db } = deps;
  let elites: Checkbox | null = null;
  let dungeons: Checkbox | null = null;
  let autoFly: Checkbox | null = null;
  const gapButtons: Button[] = [];

  const draw = (): void => {
    elites?.set(db.routeElites);
    dungeons?.set(db.routeDungeons);
    autoFly?.set(db.autoFly);
    gapButtons.forEach((gapButton, i) => gapButton.setPrimary(GAPS[i] === (db.minLevelGap ?? 0)));
  };

  return {
    width: 270,
    height: 260,
    render(parent) {
      const message = text(parent, SIZE.body, COLOR.sub);
      message.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -14);
      message.SetWidth(270 - 2 * PAD);
      message.SetWordWrap(true);
      message.SetText(t("routesMissing"));
      const open = button(parent, "MinMaxQuestOpenCompletion", t("openCompletion"), () => deps.openCompletion());
      open.setPrimary(true);
      open.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -50);
      hline(parent, -78);
      setLabel(label(parent, PAD, -86), t("options"));
      elites = checkbox(parent, "MinMaxQuestRouteElites", t("includeElites"), () => {
        db.routeElites = !db.routeElites;
        draw();
      });
      elites.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -102);
      dungeons = checkbox(parent, "MinMaxQuestRouteDungeons", t("includeDungeons"), () => {
        db.routeDungeons = !db.routeDungeons;
        draw();
      });
      dungeons.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -120);
      autoFly = checkbox(parent, "MinMaxQuestAutoFly", t("autoFly"), () => {
        db.autoFly = !db.autoFly;
        draw();
      });
      autoFly.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -138);
      const gapLabel = text(parent, SIZE.small, COLOR.sub);
      gapLabel.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -160);
      gapLabel.SetText(t("maxQuestLevel"));
      let previous: WowFrame | null = null;
      for (const gap of GAPS) {
        const gapButton = button(parent, `MinMaxQuestGap${gap}`, gap === 0 ? t("off") : `-${gap}`, () => {
          db.minLevelGap = gap === 0 ? null : gap;
          deps.refreshTargets();
          draw();
        });
        if (previous == null) gapButton.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", PAD, -176);
        else gapButton.frame.SetPoint("LEFT", previous, "RIGHT", 4, 0);
        previous = gapButton.frame;
        gapButtons.push(gapButton);
      }
    },
    refresh: () => draw(),
  };
}

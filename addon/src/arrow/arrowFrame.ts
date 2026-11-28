import { type CharDb } from "../core/storage";
import { currentLocale, t } from "../core/l10n";
import { formatDistance, distance, heading, type WorldPos } from "../core/geometry";
import { isDisabled, reportOnce } from "../core/report";

// pos null: a step without a place (craft, fish); only the label shows.
export interface ArrowTarget {
  pos: WorldPos | null;
  label: string;
}

export interface ArrowApi {
  frame: WowFrame;
  setTarget(target: ArrowTarget | null): void;
  setLocked(locked: boolean): void;
  setHidden(hidden: boolean): void;
  isLocked(): boolean;
}

const FRAME_NAME = "MinMaxQuestArrow";
export const ARROW_TEXTURE = "Interface\\AddOns\\MinMaxQuest\\media\\arrow.tga";
const FONT_PATH = "Fonts\\ARIALN.TTF";
const REFRESH_INTERVAL = 1 / 30;
const ARROW_SIZE = 44;
const KM_MARKER = 1e9;

export function playerPosition(): WorldPos | null {
  const [x, y, , instance] = UnitPosition("player");
  if (x == null || y == null || instance == null) return null;
  return { continent: instance, x, y };
}

export function createArrow(db: CharDb): ArrowApi {
  const locale = currentLocale();
  const frame = CreateFrame("Frame", FRAME_NAME, UIParent);
  frame.SetSize(56, 80);
  frame.SetClampedToScreen(true);
  if (db.arrow != null) frame.SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", db.arrow.x, db.arrow.y);
  else frame.SetPoint("TOP", UIParent, "TOP", 0, -80);

  const arrow = frame.CreateTexture(null, "ARTWORK");
  arrow.SetSize(ARROW_SIZE, ARROW_SIZE);
  arrow.SetPoint("TOP", frame, "TOP", 0, 0);
  arrow.SetTexture(ARROW_TEXTURE);

  const distanceText = frame.CreateFontString(null, "OVERLAY");
  distanceText.SetFont(FONT_PATH, 14, "OUTLINE");
  distanceText.SetTextColor(0.902, 0.902, 0.902);
  distanceText.SetPoint("TOP", arrow, "BOTTOM", 0, -2);

  const labelText = frame.CreateFontString(null, "OVERLAY");
  labelText.SetFont(FONT_PATH, 12, "");
  labelText.SetTextColor(0.902, 0.902, 0.902);
  labelText.SetPoint("TOP", distanceText, "BOTTOM", 0, -2);

  let target: ArrowTarget | null = null;
  let locked = db.arrow?.locked ?? false;
  let hidden = db.hidden;
  let placing = false;
  let elapsedSum = 0;
  let lastKey = -1;
  const player: WorldPos = { continent: 0, x: 0, y: 0 };

  function applyVisibility(visible: boolean): void {
    if (visible) frame.Show();
    else frame.Hide();
  }

  function refresh(): void {
    if (hidden) {
      frame.Hide();
      return;
    }
    if (target == null) {
      applyVisibility(placing);
      return;
    }
    const goal = target.pos;
    if (goal == null) {
      frame.Show();
      return;
    }
    const [x, y, , instance] = UnitPosition("player");
    const facing = GetPlayerFacing();
    if (x == null || y == null || instance == null || facing == null) {
      applyVisibility(placing);
      return;
    }
    player.continent = instance;
    player.x = x;
    player.y = y;
    const angle = heading(player, facing, goal);
    if (angle == null) {
      applyVisibility(placing);
      return;
    }
    const yards = distance(player, goal);
    const key = yards < 1000 ? Math.round(yards) : KM_MARKER + Math.round(yards / 100);
    if (key !== lastKey) {
      lastKey = key;
      distanceText.SetText(formatDistance(yards, locale));
    }
    arrow.SetRotation(angle);
    frame.Show();
  }

  let stopped = false;

  function tick(): void {
    if (stopped) return;
    if (!isDisabled("arrow")) {
      const [ok, error] = pcall(refresh);
      if (!ok) reportOnce("arrow", t("featureDisabled").replace("{feature}", "arrow").replace("{error}", String(error)));
    }
    if (!isDisabled("arrow")) return;
    stopped = true;
    target = null;
    frame.Hide();
  }

  function savePosition(): void {
    const left = frame.GetLeft();
    const top = frame.GetTop();
    if (left != null && top != null) db.arrow = { x: left, y: top, locked };
  }

  function applyLock(next: boolean): void {
    locked = next;
    frame.SetMovable(!locked);
    frame.EnableMouse(!locked);
    if (locked) {
      frame.SetScript("OnDragStart", null);
      frame.SetScript("OnDragStop", null);
    } else {
      frame.RegisterForDrag("LeftButton");
      frame.SetScript("OnDragStart", () => {
        frame.StartMoving();
      });
      frame.SetScript("OnDragStop", () => {
        frame.StopMovingOrSizing();
        savePosition();
      });
    }
    refresh();
  }

  applyLock(locked);

  const driver = CreateFrame("Frame", FRAME_NAME + "Driver", UIParent);
  driver.SetScript("OnUpdate", (_, elapsed) => {
    elapsedSum += elapsed;
    if (elapsedSum < REFRESH_INTERVAL) return;
    elapsedSum = 0;
    tick();
  });

  return {
    frame,
    setTarget(next) {
      target = next;
      lastKey = -1;
      labelText.SetText(next == null ? "" : next.label);
      if (next != null && next.pos == null) {
        arrow.Hide();
        distanceText.SetText("");
      } else arrow.Show();
      refresh();
    },
    setLocked(next) {
      placing = !next;
      applyLock(next);
      savePosition();
    },
    setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      refresh();
    },
    isLocked: () => locked,
  };
}

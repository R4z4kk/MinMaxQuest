import { type CharDb } from "../core/storage";
import { currentLocale, t } from "../core/l10n";
import { formatDistance, distance, heading, type WorldPos } from "../core/geometry";
import { isDisabled, reportOnce } from "../core/report";

export interface ArrowTarget {
  pos: WorldPos;
  label: string;
}

export interface ArrowApi {
  setTarget(target: ArrowTarget | null): void;
  setMoveMode(on: boolean): void;
}

const FRAME_NAME = "MinMaxQuestArrow";
const TEXTURE_PATH = "Interface\\AddOns\\MinMaxQuest\\addon\\src\\arrow\\arrow.tga";
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
  arrow.SetTexture(TEXTURE_PATH);

  const distanceText = frame.CreateFontString(null, "OVERLAY");
  distanceText.SetFont(FONT_PATH, 14, "OUTLINE");
  distanceText.SetTextColor(0.902, 0.902, 0.902);
  distanceText.SetPoint("TOP", arrow, "BOTTOM", 0, -2);

  const labelText = frame.CreateFontString(null, "OVERLAY");
  labelText.SetFont(FONT_PATH, 12, "");
  labelText.SetTextColor(0.545, 0.545, 0.545);
  labelText.SetPoint("TOP", distanceText, "BOTTOM", 0, -2);

  const grip = frame.CreateFontString(null, "OVERLAY");
  grip.SetFont(FONT_PATH, 14, "OUTLINE");
  grip.SetTextColor(0.788, 0.655, 0.353);
  grip.SetPoint("TOPLEFT", frame, "TOPLEFT", 0, 0);
  grip.SetText("::");
  grip.Hide();

  const outline: WowTexture[] = [];
  const edges: [string, number, number][] = [
    ["TOPLEFT", 56, 1],
    ["BOTTOMLEFT", 56, 1],
    ["TOPLEFT", 1, 80],
    ["TOPRIGHT", 1, 80],
  ];
  for (const [point, width, height] of edges) {
    const edge = frame.CreateTexture(null, "BORDER");
    edge.SetColorTexture(1, 1, 1, 0.5);
    edge.SetSize(width, height);
    edge.SetPoint(point, frame, point, 0, 0);
    edge.Hide();
    outline.push(edge);
  }

  let target: ArrowTarget | null = null;
  let moveMode = false;
  let elapsedSum = 0;
  let lastKey = -1;
  const player: WorldPos = { continent: 0, x: 0, y: 0 };

  function applyVisibility(visible: boolean): void {
    if (visible) frame.Show();
    else frame.Hide();
  }

  function refresh(): void {
    if (target == null) {
      applyVisibility(moveMode);
      return;
    }
    const [x, y, , instance] = UnitPosition("player");
    const facing = GetPlayerFacing();
    if (x == null || y == null || instance == null || facing == null) {
      applyVisibility(moveMode);
      return;
    }
    player.continent = instance;
    player.x = x;
    player.y = y;
    const angle = heading(player, facing, target.pos);
    if (angle == null) {
      applyVisibility(moveMode);
      return;
    }
    const yards = distance(player, target.pos);
    const key = yards < 1000 ? Math.round(yards) : KM_MARKER + Math.round(yards / 100);
    if (key !== lastKey) {
      lastKey = key;
      distanceText.SetText(formatDistance(yards, locale));
    }
    arrow.SetRotation(angle);
    frame.Show();
  }

  function tick(): void {
    if (isDisabled("arrow")) return;
    const [ok, error] = pcall(refresh);
    if (!ok) reportOnce("arrow", t("featureDisabled").replace("{feature}", "arrow").replace("{error}", String(error)));
  }

  const driver = CreateFrame("Frame", FRAME_NAME + "Driver", UIParent);
  driver.SetScript("OnUpdate", (_, elapsed) => {
    elapsedSum += elapsed;
    if (elapsedSum < REFRESH_INTERVAL) return;
    elapsedSum = 0;
    tick();
  });

  return {
    setTarget(next) {
      target = next;
      lastKey = -1;
      labelText.SetText(next == null ? "" : next.label);
      refresh();
    },
    setMoveMode(on) {
      const wasOn = moveMode;
      moveMode = on;
      for (const edge of outline) {
        if (on) edge.Show();
        else edge.Hide();
      }
      if (on) grip.Show();
      else grip.Hide();
      frame.SetMovable(on);
      frame.EnableMouse(on);
      if (on) {
        frame.RegisterForDrag("LeftButton");
        frame.SetScript("OnDragStart", (f) => f.StartMoving());
        frame.SetScript("OnDragStop", (f) => f.StopMovingOrSizing());
      } else {
        frame.SetScript("OnDragStart", null);
        frame.SetScript("OnDragStop", null);
        const left = frame.GetLeft();
        const top = frame.GetTop();
        if (wasOn && left != null && top != null) db.arrow = { x: left, y: top, locked: true };
      }
      refresh();
    },
  };
}

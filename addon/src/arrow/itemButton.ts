import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import { itemCooldown, itemCount } from "../game/playerState";

export interface ItemButtonApi {
  want(itemId: number | null): void;
  setLocked(locked: boolean): void;
  setHidden(hidden: boolean): void;
  onCombatStart(): void;
  onCombatEnd(): void;
}

const HOLDER_NAME = "MinMaxQuestItemHolder";
const BUTTON_NAME = "MinMaxQuestItemButton";
const FONT_PATH = "Fonts\\ARIALN.TTF";
const UNKNOWN_ICON = "Interface\\Icons\\INV_Misc_QuestionMark";
const BUTTON_SIZE = 32;
const GRIP = 3;
const HOLDER_SIZE = BUTTON_SIZE + 2 * GRIP;
const GAP = 4;
// Right of the arrow's default spot in arrowFrame.ts (TOP of UIParent, 80 below, 56 wide).
const FALLBACK_X = 28 + GAP;
const FALLBACK_Y = -80;

export function itemUsable(itemId: number): boolean {
  const getSpell = C_Item?.GetItemSpell ?? GetItemSpell;
  if (getSpell == null) throw new Error("no item-spell API");
  const [spell] = getSpell(itemId);
  return spell != null;
}

function itemIcon(itemId: number): number | null {
  const getIcon = C_Item?.GetItemIconByID;
  if (getIcon == null) throw new Error("no item-icon API");
  return getIcon(itemId);
}

// The secure button and its holder are only shown, hidden, moved or given attributes out of combat.
export function createItemButton(db: CharDb, anchor: () => WowFrame): ItemButtonApi {
  const holder = CreateFrame("Frame", HOLDER_NAME, UIParent);
  holder.SetSize(HOLDER_SIZE, HOLDER_SIZE);
  holder.SetClampedToScreen(true);
  holder.SetMovable(true);
  holder.RegisterForDrag("LeftButton");
  holder.Hide();

  const grip: WowTexture[] = [];
  const edges: [string, number, number][] = [
    ["TOPLEFT", HOLDER_SIZE, GRIP],
    ["BOTTOMLEFT", HOLDER_SIZE, GRIP],
    ["TOPLEFT", GRIP, HOLDER_SIZE],
    ["TOPRIGHT", GRIP, HOLDER_SIZE],
  ];
  for (const [point, width, height] of edges) {
    const edge = holder.CreateTexture(null, "BORDER");
    edge.SetColorTexture(0.788, 0.655, 0.353, 0.8);
    edge.SetSize(width, height);
    edge.SetPoint(point, holder, point, 0, 0);
    grip.push(edge);
  }

  const button = CreateFrame("Button", BUTTON_NAME, holder, "SecureActionButtonTemplate");
  button.SetSize(BUTTON_SIZE, BUTTON_SIZE);
  button.SetPoint("CENTER", holder, "CENTER", 0, 0);
  // Both: with ActionButtonUseKeyDown on (the default), a secure button registered for up only never fires.
  // useOnKeyDown false asks the template to act on release so a drag does not use the item.
  button.RegisterForClicks("AnyUp", "AnyDown");
  button.SetAttribute("useOnKeyDown", false);
  button.RegisterForDrag("LeftButton");
  // A macro: the "item" type did not use some quest items (Nagmara's Vial 11412) that work from the bags.
  button.SetAttribute("type", "macro");

  const icon = button.CreateTexture(null, "ARTWORK");
  icon.SetAllPoints(button);

  const countText = button.CreateFontString(null, "OVERLAY");
  countText.SetFont(FONT_PATH, 12, "OUTLINE");
  countText.SetTextColor(1, 1, 1);
  countText.SetPoint("BOTTOMRIGHT", button, "BOTTOMRIGHT", -2, 2);

  const cooldown = CreateFrame("Cooldown", BUTTON_NAME + "Cooldown", button, "CooldownFrameTemplate");
  cooldown.SetAllPoints(button);

  let wish: number | null = null;
  let applied: number | null = null;
  let locked = db.arrow?.locked ?? false;
  let hidden = db.hidden;
  let placing = false;
  let moving = false;
  let placePending = true;

  button.SetScript("OnEnter", () => {
    guard("itemButton", () => {
      if (applied == null) return;
      GameTooltip.SetOwner(button, "ANCHOR_RIGHT");
      GameTooltip.SetItemByID(applied);
      GameTooltip.Show();
    });
  });
  button.SetScript("OnLeave", () => GameTooltip.Hide());

  function place(): void {
    holder.ClearAllPoints();
    const saved = db.itemButton;
    if (saved != null) {
      holder.SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", saved.x, saved.y);
      return;
    }
    const arrow = anchor();
    const right = arrow.GetRight();
    const top = arrow.GetTop();
    if (right != null && top != null) holder.SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", right + GAP, top);
    else holder.SetPoint("TOPLEFT", UIParent, "TOP", FALLBACK_X, FALLBACK_Y);
  }

  function paint(): void {
    if (applied == null) {
      countText.SetText("");
      cooldown.SetCooldown(0, 0);
      return;
    }
    const count = itemCount(applied);
    countText.SetText(count > 1 ? String(count) : "");
    const [start, duration] = itemCooldown(applied);
    cooldown.SetCooldown(start, duration);
  }

  function apply(): void {
    if (wish !== applied) {
      const texture = wish == null ? null : (itemIcon(wish) ?? UNKNOWN_ICON);
      button.SetAttribute("macrotext", wish == null ? null : `/use item:${wish}`);
      icon.SetTexture(texture);
      applied = wish;
    }
    if (placePending) {
      placePending = false;
      place();
    }
    for (const edge of grip) {
      if (locked) edge.Hide();
      else edge.Show();
    }
    holder.EnableMouse(!locked);
    paint();
    if (!hidden && (applied != null || placing)) holder.Show();
    else holder.Hide();
  }

  function stopMoving(): void {
    moving = false;
    holder.StopMovingOrSizing();
    const left = holder.GetLeft();
    const top = holder.GetTop();
    if (left != null && top != null) db.itemButton = { x: left, y: top };
  }

  const dragStart = (): void => {
    if (locked || InCombatLockdown()) return;
    moving = true;
    holder.StartMoving();
  };
  const dragStop = (): void => {
    if (moving && !InCombatLockdown()) stopMoving();
  };
  holder.SetScript("OnDragStart", dragStart);
  holder.SetScript("OnDragStop", dragStop);
  button.SetScript("OnDragStart", dragStart);
  button.SetScript("OnDragStop", dragStop);

  apply();

  return {
    want(itemId) {
      wish = itemId;
      if (InCombatLockdown()) paint();
      else apply();
    },
    setLocked(next) {
      locked = next;
      placing = !next;
      if (db.itemButton == null) placePending = true;
      if (!InCombatLockdown()) apply();
    },
    setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      if (!InCombatLockdown()) apply();
    },
    onCombatStart() {
      if (moving) stopMoving();
    },
    onCombatEnd() {
      if (moving) stopMoving();
      apply();
    },
  };
}

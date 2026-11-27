import { t, type L10nKey } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import { COLOR, fill, hline, onClick, paint, panel, PAD, SIZE, text, UI_FEATURE } from "./theme";

export type TabId = CharDb["tab"];

export interface TabView {
  width: number;
  height: number;
  render(parent: WowFrame): void;
  refresh(): void;
}

export interface WindowApi {
  frame: WowFrame;
  setTab(tab: TabId): void;
  isShown(): boolean;
  setShown(shown: boolean): void;
}

const TAB_ORDER: TabId[] = ["quest", "access", "completion"];
const TAB_LABEL: Record<TabId, L10nKey> = { quest: "tabQuest", access: "tabAccess", completion: "tabCompletion" };
const HEADER_HEIGHT = 26;
const TAB_HEIGHT = 24;
export const CONTENT_TOP = HEADER_HEIGHT + TAB_HEIGHT;
const GEAR_TEXTURE = "Interface\\Buttons\\UI-OptionsButton";
const EYE_TEXTURE = "Interface\\Icons\\INV_Misc_Eye_01";

interface TabButton {
  id: TabId;
  frame: WowFrame;
  caption: WowFontString;
  underline: WowTexture;
}

export function createWindow(db: CharDb, tabs: Record<TabId, TabView>, hideAll: () => void): WindowApi {
  const frame = CreateFrame("Frame", "MinMaxQuestWindow", UIParent);
  frame.SetFrameStrata("MEDIUM");
  frame.SetClampedToScreen(true);
  panel(frame);
  if (db.window != null) frame.SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", db.window.x, db.window.y);
  else frame.SetPoint("TOPRIGHT", UIParent, "RIGHT", -40, 200);
  frame.SetMovable(true);
  frame.EnableMouse(true);
  frame.RegisterForDrag("LeftButton");
  frame.SetScript("OnDragStart", (f) => {
    guard(UI_FEATURE, () => f.StartMoving());
  });
  frame.SetScript("OnDragStop", (f) => {
    guard(UI_FEATURE, () => {
      f.StopMovingOrSizing();
      const left = f.GetLeft();
      const top = f.GetTop();
      if (left != null && top != null) db.window = { x: left, y: top };
    });
  });

  const title = text(frame, SIZE.small, COLOR.accent);
  title.SetPoint("TOPLEFT", frame, "TOPLEFT", PAD, -8);
  title.SetText("MINMAXQUEST");

  const gear = CreateFrame("Button", null, frame);
  gear.SetSize(14, 14);
  gear.SetPoint("TOPRIGHT", frame, "TOPRIGHT", -8, -6);
  const gearIcon = gear.CreateTexture(null, "ARTWORK");
  gearIcon.SetTexture(GEAR_TEXTURE);
  gearIcon.SetSize(14, 14);
  gearIcon.SetPoint("CENTER", gear, "CENTER", 0, 0);
  onClick(gear, () => print(`MinMaxQuest: ${t("help")}`));

  const eye = CreateFrame("Button", "MinMaxQuestEye", frame);
  eye.SetSize(14, 14);
  eye.SetPoint("TOPRIGHT", gear, "TOPLEFT", -6, 0);
  const eyeIcon = eye.CreateTexture(null, "ARTWORK");
  eyeIcon.SetTexture(EYE_TEXTURE);
  eyeIcon.SetSize(14, 14);
  eyeIcon.SetPoint("CENTER", eye, "CENTER", 0, 0);
  onClick(eye, hideAll);
  eye.SetScript("OnEnter", () => {
    guard(UI_FEATURE, () => {
      GameTooltip.SetOwner(eye, "ANCHOR_BOTTOM");
      GameTooltip.SetText(t("hideAll"));
      GameTooltip.Show();
    });
  });
  eye.SetScript("OnLeave", () => GameTooltip.Hide());
  hline(frame, -HEADER_HEIGHT);
  hline(frame, -CONTENT_TOP);

  const contents: Partial<Record<TabId, WowFrame>> = {};
  const buttons: TabButton[] = [];
  let api: WindowApi | null = null;

  for (const id of TAB_ORDER) {
    const tabFrame = CreateFrame("Button", `MinMaxQuestTab${id}`, frame);
    const caption = text(tabFrame, SIZE.small, COLOR.sub);
    caption.SetPoint("CENTER", tabFrame, "CENTER", 0, 0);
    caption.SetText(t(TAB_LABEL[id]));
    const underline = tabFrame.CreateTexture(null, "OVERLAY");
    fill(underline, COLOR.accent);
    underline.SetHeight(2);
    underline.SetPoint("BOTTOMLEFT", tabFrame, "BOTTOMLEFT", 0, 0);
    underline.SetPoint("BOTTOMRIGHT", tabFrame, "BOTTOMRIGHT", 0, 0);
    onClick(tabFrame, () => api?.setTab(id));
    buttons.push({ id, frame: tabFrame, caption, underline });
  }

  const content = (id: TabId): WowFrame => {
    const existing = contents[id];
    if (existing != null) return existing;
    const created = CreateFrame("Frame", null, frame);
    created.SetPoint("TOPLEFT", frame, "TOPLEFT", 0, -CONTENT_TOP);
    created.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 0, 0);
    contents[id] = created;
    tabs[id].render(created);
    return created;
  };

  const setTab = (tab: TabId): void => {
    db.tab = tab;
    if (tab !== "access") db.activeMode = tab;
    const view = tabs[tab];
    frame.SetSize(view.width, view.height);
    const tabWidth = view.width / TAB_ORDER.length;
    buttons.forEach((button, i) => {
      const active = button.id === tab;
      button.frame.SetSize(tabWidth, TAB_HEIGHT);
      button.frame.ClearAllPoints();
      button.frame.SetPoint("TOPLEFT", frame, "TOPLEFT", i * tabWidth, -HEADER_HEIGHT);
      paint(button.caption, active ? COLOR.text : COLOR.sub);
      if (active) button.underline.Show();
      else button.underline.Hide();
      const existing = contents[button.id];
      if (!active && existing != null) existing.Hide();
    });
    content(tab).Show();
    view.refresh();
  };

  frame.Hide();
  api = {
    frame,
    setTab: (tab) => setTab(tab),
    isShown: () => frame.IsShown(),
    setShown(shown) {
      if (!shown) {
        frame.Hide();
        return;
      }
      frame.Show();
      setTab(db.tab);
    },
  };
  return api;
}

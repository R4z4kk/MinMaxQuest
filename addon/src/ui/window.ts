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
export const TAB_HEIGHT = 24;
export const CONTENT_TOP = HEADER_HEIGHT + TAB_HEIGHT;
const GEAR_TEXTURE = "Interface\\Buttons\\UI-OptionsButton";
const EYE_TEXTURE = "Interface\\Icons\\INV_Misc_Eye_01";

export interface TabButton {
  frame: WowFrame;
  setActive(active: boolean): void;
}

export function createTabButton(parent: WowFrame, name: string, value: string, handler: () => void): TabButton {
  const frame = CreateFrame("Button", name, parent);
  const caption = text(frame, SIZE.small, COLOR.sub);
  caption.SetPoint("CENTER", frame, "CENTER", 0, 0);
  caption.SetText(value);
  const underline = frame.CreateTexture(null, "OVERLAY");
  fill(underline, COLOR.accent);
  underline.SetHeight(2);
  underline.SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 0, 0);
  underline.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 0, 0);
  onClick(frame, handler);
  return {
    frame,
    setActive(active) {
      paint(caption, active ? COLOR.text : COLOR.sub);
      if (active) underline.Show();
      else underline.Hide();
    },
  };
}

export function placeTabs(parent: WowFrame, tabs: TabButton[], width: number, y: number): void {
  const each = width / tabs.length;
  tabs.forEach((tab, i) => {
    tab.frame.SetSize(each, TAB_HEIGHT);
    tab.frame.ClearAllPoints();
    tab.frame.SetPoint("TOPLEFT", parent, "TOPLEFT", i * each, y);
  });
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
  let api: WindowApi | null = null;
  const buttons = TAB_ORDER.map((id) => createTabButton(frame, `MinMaxQuestTab${id}`, t(TAB_LABEL[id]), () => api?.setTab(id)));

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
    placeTabs(frame, buttons, view.width, -HEADER_HEIGHT);
    TAB_ORDER.forEach((id, i) => {
      const active = id === tab;
      buttons[i].setActive(active);
      const existing = contents[id];
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

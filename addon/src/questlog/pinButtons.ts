// Legacy quest log (from Questie's Forever compat code; confirm in game): QuestLog_Update, QuestLogTitle1..N, QuestLogListScrollFrame.
import { t } from "../core/l10n";
import { guard, reportOnce } from "../core/report";
import { COLOR, fill, type Color } from "../ui/theme";

const FEATURE = "pinButtons";
const BUTTON_SIZE = 14;
const MARK_SIZE = 8;
const DIM_ALPHA = 0.35;
const MAX_LINES = 50;
const DEFAULT_LINES = 6;

type PinTitle = WowFrame & { GetID(): number };

interface PinButton {
  frame: WowFrame;
  mark: WowTexture;
  title: PinTitle;
  questId: number | null;
}

function isTitleButton(value: unknown): value is PinTitle {
  return typeof value === "object" && value != null && typeof (value as { GetID?: unknown }).GetID === "function";
}

function lineCount(): number {
  const displayed = _G.QUESTS_DISPLAYED;
  return typeof displayed === "number" ? Math.min(displayed, MAX_LINES) : DEFAULT_LINES;
}

function tint(mark: WowTexture, pinned: boolean): void {
  const accent: Color = COLOR.accent;
  fill(mark, [accent[0], accent[1], accent[2], pinned ? 1 : DIM_ALPHA]);
}

function createPin(
  title: PinTitle,
  onClick: (questId: number) => void,
  isPinned: (questId: number) => boolean,
): PinButton {
  const frame = CreateFrame("Button", null, title);
  frame.SetSize(BUTTON_SIZE, BUTTON_SIZE);
  frame.SetPoint("RIGHT", title, "RIGHT", -2, 0);
  frame.SetFrameLevel(title.GetFrameLevel() + 2);
  frame.EnableMouse(true);
  const mark = frame.CreateTexture(null, "OVERLAY");
  mark.SetSize(MARK_SIZE, MARK_SIZE);
  mark.SetPoint("CENTER", frame, "CENTER", 0, 0);
  mark.SetRotation(math.pi / 4);
  const pin: PinButton = { frame, mark, title, questId: null };
  frame.SetScript("OnClick", () => {
    guard(FEATURE, () => {
      if (pin.questId != null) onClick(pin.questId);
    });
  });
  frame.SetScript("OnEnter", () => {
    GameTooltip.SetOwner(frame, "ANCHOR_RIGHT");
    GameTooltip.SetText(t(pin.questId != null && isPinned(pin.questId) ? "unpinTooltip" : "pinTooltip"));
    GameTooltip.Show();
  });
  frame.SetScript("OnLeave", () => GameTooltip.Hide());
  frame.Hide();
  return pin;
}

function questIdAt(title: PinTitle): number | null {
  const index = title.GetID() + FauxScrollFrame_GetOffset(_G.QuestLogListScrollFrame);
  const info = C_QuestLog.GetInfo(index);
  if (info == null || info.isHeader) return null;
  return info.questID;
}

function refreshPin(pin: PinButton, isPinned: (questId: number) => boolean): void {
  const questId = pin.title.IsShown() ? questIdAt(pin.title) : null;
  pin.questId = questId;
  if (questId == null) {
    pin.frame.Hide();
    return;
  }
  tint(pin.mark, isPinned(questId));
  pin.frame.Show();
}

function logAvailable(): boolean {
  return (
    typeof _G.QuestLog_Update === "function" &&
    typeof FauxScrollFrame_GetOffset === "function" &&
    typeof _G.QuestLogListScrollFrame === "object" &&
    isTitleButton(_G.QuestLogTitle1)
  );
}

export function installPinButtons(
  onPin: (questId: number) => void,
  isPinned: (questId: number) => boolean,
): () => void {
  const pins: PinButton[] = [];

  const refresh = (): void => {
    guard(FEATURE, () => {
      for (const pin of pins) refreshPin(pin, isPinned);
    });
  };

  const onClick = (questId: number): void => {
    onPin(questId);
    refresh();
  };

  const build = (final: boolean): boolean => {
    if (!logAvailable()) {
      if (final) reportOnce(FEATURE, t("pinUnavailable"));
      return false;
    }
    const lines = lineCount();
    for (let i = 1; i <= lines; i++) {
      const title = _G[`QuestLogTitle${i}`];
      if (isTitleButton(title)) pins.push(createPin(title, onClick, isPinned));
    }
    hooksecurefunc("QuestLog_Update", refresh);
    refresh();
    return true;
  };

  const once = (events: string[], fn: () => void): void => {
    const waiter = CreateFrame("Frame", null, UIParent);
    let done = false;
    for (const event of events) waiter.RegisterEvent(event);
    waiter.SetScript("OnEvent", () => {
      if (done) return;
      done = true;
      for (const event of events) waiter.UnregisterEvent(event);
      guard(FEATURE, fn);
    });
  };

  const start = (): void => {
    if (!build(false)) once(["ADDON_LOADED", "QUEST_LOG_UPDATE"], () => build(true));
  };

  guard(FEATURE, () => {
    if (InCombatLockdown()) once(["PLAYER_REGEN_ENABLED"], start);
    else start();
  });
  return refresh;
}

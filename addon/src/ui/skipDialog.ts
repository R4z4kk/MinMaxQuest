import { t } from "../core/l10n";
import type { QuestInfo } from "../data/questRepository";
import { button, COLOR, hline, panel, PAD, SIZE, text, type Color } from "./theme";
import { lostText } from "./viewModel";

const NAME = "MinMaxQuestSkipDialog";
const WIDTH = 330;
const MAX_LINES = 8;
const LINE_HEIGHT = 15;
const HEADER_HEIGHT = 26;
const BODY_TOP = HEADER_HEIGHT + 12;
const ACTIONS_HEIGHT = 32;

interface Dialog {
  frame: WowFrame;
  warning: WowFontString;
  intro: WowFontString;
  lines: WowFontString[];
  lost: WowFontString;
  confirm: (() => void) | null;
}

let dialog: Dialog | null = null;

function line(frame: WowFrame, c: Color): WowFontString {
  const fontString = text(frame, SIZE.body, c);
  fontString.SetWidth(WIDTH - 2 * PAD - 4);
  return fontString;
}

function build(): Dialog {
  const frame = CreateFrame("Frame", NAME, UIParent);
  frame.SetFrameStrata("DIALOG");
  frame.SetWidth(WIDTH);
  frame.SetPoint("CENTER", UIParent, "CENTER", 0, 0);
  frame.EnableMouse(true);
  panel(frame);
  const title = text(frame, SIZE.small, COLOR.accent);
  title.SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + 4, -8);
  title.SetText(t("skipTitle"));
  hline(frame, -HEADER_HEIGHT);
  const created: Dialog = {
    frame,
    warning: line(frame, COLOR.accent),
    intro: line(frame, COLOR.text),
    lines: [],
    lost: line(frame, COLOR.text),
    confirm: null,
  };
  created.warning.SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + 4, -BODY_TOP);
  created.intro.SetPoint("TOPLEFT", created.warning, "BOTTOMLEFT", 0, -6);
  for (let i = 0; i < MAX_LINES; i++) {
    const entry = line(frame, COLOR.stepText);
    entry.SetPoint("TOPLEFT", created.intro, "BOTTOMLEFT", 8, -4 - i * LINE_HEIGHT);
    created.lines.push(entry);
  }
  hline(frame, ACTIONS_HEIGHT, "BOTTOM");
  const confirm = button(frame, `${NAME}Confirm`, t("skipAnyway"), () => {
    frame.Hide();
    const run = created.confirm;
    created.confirm = null;
    if (run != null) run();
  });
  confirm.setPrimary(true);
  confirm.frame.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -PAD, 8);
  const cancel = button(frame, `${NAME}Cancel`, t("cancel"), () => {
    created.confirm = null;
    frame.Hide();
  });
  cancel.frame.SetPoint("RIGHT", confirm.frame, "LEFT", -6, 0);
  UISpecialFrames.push(NAME);
  return created;
}

export function confirmSkip(
  quest: QuestInfo,
  followUps: QuestInfo[],
  lost: { xp: number; levelFraction: number } | null,
  onConfirm: () => void,
): void {
  const d = dialog ?? build();
  dialog = d;
  d.confirm = onConfirm;
  d.warning.SetText(t("skipWarning").replace("{quest}", quest.name));
  d.intro.SetText(t("skipFollowUps").replace("{n}", String(followUps.length)));
  const overflow = followUps.length > MAX_LINES;
  const shown = overflow ? MAX_LINES - 1 : followUps.length;
  d.lines.forEach((entry, i) => {
    if (i < shown) {
      const next = followUps[i];
      entry.SetText(t("followUpLine").replace("{name}", next.name).replace("{level}", String(next.level)));
    } else if (i === shown && overflow) {
      entry.SetText(t("moreRows").replace("{n}", String(followUps.length - shown)));
    } else {
      entry.SetText("");
    }
  });
  const listed = overflow ? MAX_LINES : shown;
  d.lost.SetText(lostText(lost));
  d.lost.ClearAllPoints();
  d.lost.SetPoint("TOPLEFT", d.intro, "BOTTOMLEFT", 0, -8 - listed * LINE_HEIGHT);
  d.frame.SetHeight(BODY_TOP + 3 * LINE_HEIGHT + 20 + listed * LINE_HEIGHT + ACTIONS_HEIGHT + 8);
  d.frame.Show();
}

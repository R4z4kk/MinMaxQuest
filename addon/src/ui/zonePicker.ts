import { COLOR, onClick, panel, PAD, SIZE, text } from "./theme";

export interface ZoneEntry {
  areaId: number;
  name: string;
}

export interface ZonePicker {
  toggle(anchor: WowFrame, entries: ZoneEntry[], onSelect: (areaId: number) => void): void;
}

const NAME = "MinMaxQuestZonePicker";
const VISIBLE_ROWS = 14;
const ROW_HEIGHT = 16;
const WIDTH = 180;
const WHEEL_STEP = 3;

// Plain list frame instead of UIDropDownMenu, which taints.
export function createZonePicker(parent: WowFrame): ZonePicker {
  let frame: WowFrame | null = null;
  const captions: WowFontString[] = [];
  let entries: ZoneEntry[] = [];
  let offset = 0;
  let chosen: ((areaId: number) => void) | null = null;

  const draw = (): void => {
    captions.forEach((caption, i) => {
      const entry = entries[offset + i];
      caption.SetText(entry == null ? "" : entry.name);
    });
  };

  const build = (): WowFrame => {
    const created = CreateFrame("Frame", NAME, parent);
    created.SetFrameStrata("DIALOG");
    created.SetWidth(WIDTH);
    created.EnableMouse(true);
    created.EnableMouseWheel(true);
    panel(created);
    created.SetScript("OnMouseWheel", (_, delta) => {
      const last = Math.max(0, entries.length - VISIBLE_ROWS);
      offset = Math.min(last, Math.max(0, offset - delta * WHEEL_STEP));
      draw();
    });
    for (let i = 0; i < VISIBLE_ROWS; i++) {
      // TSTL shares one loop variable across iterations in Lua: closures need their own copy.
      const slot = i;
      const row = CreateFrame("Button", `${NAME}Row${i + 1}`, created);
      row.SetSize(WIDTH - 2, ROW_HEIGHT);
      row.SetPoint("TOPLEFT", created, "TOPLEFT", 1, -4 - i * ROW_HEIGHT);
      const caption = text(row, SIZE.small, COLOR.text);
      caption.SetPoint("LEFT", row, "LEFT", PAD - 2, 0);
      captions.push(caption);
      onClick(row, () => {
        const entry = entries[offset + slot];
        if (entry == null || chosen == null) return;
        created.Hide();
        chosen(entry.areaId);
      });
    }
    UISpecialFrames.push(NAME);
    return created;
  };

  return {
    toggle(anchor, list, onSelect) {
      const picker = frame ?? build();
      frame = picker;
      if (picker.IsShown() && chosen != null) {
        picker.Hide();
        chosen = null;
        return;
      }
      entries = list;
      offset = 0;
      chosen = onSelect;
      picker.ClearAllPoints();
      picker.SetPoint("TOPRIGHT", anchor, "BOTTOMRIGHT", 0, -2);
      picker.SetHeight(Math.max(1, Math.min(VISIBLE_ROWS, list.length)) * ROW_HEIGHT + 8);
      draw();
      picker.Show();
    },
  };
}

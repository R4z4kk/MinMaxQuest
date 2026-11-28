import { guard } from "../core/report";

export type Color = [number, number, number, number];

function hex(value: number, alpha = 1): Color {
  return [Math.floor(value / 65536) / 255, (Math.floor(value / 256) % 256) / 255, (value % 256) / 255, alpha];
}

export const COLOR = {
  bg: hex(0x1b1830, 0.75),
  line: hex(0x3a3360),
  title: hex(0xf1e7c8),
  done: hex(0x8f8aa8),
  rowText: hex(0xdddddd),
  iconBg: hex(0x2a2446),
  buttonLine: [1, 1, 1, 0.12] as Color,
  track: [1, 1, 1, 0.08] as Color,
  openRow: [1, 1, 1, 0.025] as Color,
  text: hex(0xdddddd),
  sub: hex(0x9d95c4),
  accent: hex(0xc9a75a),
  grey: hex(0x6f6f6f),
  nextText: hex(0xcfcfcf),
  stepText: hex(0xbdbdbd),
};

export const FONT = "Fonts\\ARIALN.TTF";
export const FONT_TITLE = "Fonts\\FRIZQT__.TTF";
export const SIZE = { body: 12, small: 11, label: 10, title: 16, section: 13 };
export const WINDOW_WIDTH = 320;
export const WINDOW_HEIGHT = 480;
export const PAD = 10;
export const UI_FEATURE = "window";
// ARIALN lacks most symbol glyphs: textures or Latin-1 characters only.
export const GLYPH = {
  check: "|TInterface\\RAIDFRAME\\ReadyCheck-Ready:0|t ",
  current: "» ",
  close: "×",
  dropdown: "|TInterface\\ChatFrame\\UI-ChatIcon-ScrollDown-Up:12|t",
};
const CHECK_TEXTURE = "Interface\\Buttons\\UI-CheckBox-Check";
export const BUTTON_HEIGHT = 16;
const BUTTON_PADDING = 12;
const BAR_HEIGHT = 3;
const ICON_FRAME = 16;
const ICON_GLYPH = 12;
const HEADER_HEIGHT = 18;
const HEADER_GAP = 6;

const HEX = "0123456789abcdef";

function hexByte(value: number): string {
  const byte = Math.min(255, Math.max(0, Math.round(value * 255)));
  return HEX.charAt(Math.floor(byte / 16)) + HEX.charAt(byte % 16);
}

export function colorCode(c: Color): string {
  return `|cff${hexByte(c[0])}${hexByte(c[1])}${hexByte(c[2])}`;
}

export function fill(texture: WowTexture, c: Color): void {
  texture.SetColorTexture(c[0], c[1], c[2], c[3]);
}

export function paint(fontString: WowFontString, c: Color): void {
  fontString.SetTextColor(c[0], c[1], c[2]);
}

export function border(frame: WowFrame, c: Color): WowTexture[] {
  const edges: [string, string, boolean][] = [
    ["TOPLEFT", "TOPRIGHT", true],
    ["BOTTOMLEFT", "BOTTOMRIGHT", true],
    ["TOPLEFT", "BOTTOMLEFT", false],
    ["TOPRIGHT", "BOTTOMRIGHT", false],
  ];
  return edges.map(([from, to, horizontal]) => {
    const edge = frame.CreateTexture(null, "BORDER");
    fill(edge, c);
    edge.SetPoint(from, frame, from, 0, 0);
    edge.SetPoint(to, frame, to, 0, 0);
    if (horizontal) edge.SetHeight(1);
    else edge.SetWidth(1);
    return edge;
  });
}

export function panel(frame: WowFrame): void {
  const bg = frame.CreateTexture(null, "BACKGROUND");
  fill(bg, COLOR.bg);
  bg.SetPoint("TOPLEFT", frame, "TOPLEFT", 0, 0);
  bg.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 0, 0);
  border(frame, COLOR.line);
}

export function hline(parent: WowFrame, y: number, edge: "TOP" | "BOTTOM" = "TOP"): WowTexture {
  const line = parent.CreateTexture(null, "BORDER");
  fill(line, COLOR.line);
  line.SetHeight(1);
  line.SetPoint(`${edge}LEFT`, parent, `${edge}LEFT`, 0, y);
  line.SetPoint(`${edge}RIGHT`, parent, `${edge}RIGHT`, 0, y);
  return line;
}

export function text(parent: WowFrame, size: number, c: Color, justify: "LEFT" | "RIGHT" = "LEFT", font: string = FONT): WowFontString {
  const fontString = parent.CreateFontString(null, "OVERLAY");
  fontString.SetFont(font, size, "");
  paint(fontString, c);
  fontString.SetJustifyH(justify);
  fontString.SetWordWrap(false);
  return fontString;
}

export function onClick(frame: WowFrame, handler: () => void): void {
  frame.SetScript("OnClick", () => {
    guard(UI_FEATURE, handler);
  });
}

export interface Button {
  frame: WowFrame;
  setText(value: string): void;
  setPrimary(on: boolean): void;
}

export function button(parent: WowFrame, name: string | null, value: string, handler: () => void): Button {
  const frame = CreateFrame("Button", name, parent);
  frame.SetHeight(BUTTON_HEIGHT);
  const edges = border(frame, COLOR.buttonLine);
  const caption = text(frame, SIZE.small, COLOR.sub);
  caption.SetPoint("CENTER", frame, "CENTER", 0, 0);
  onClick(frame, handler);
  const api: Button = {
    frame,
    setText(next) {
      caption.SetText(next);
      frame.SetWidth(caption.GetStringWidth() + BUTTON_PADDING);
    },
    setPrimary(on) {
      for (const edge of edges) fill(edge, on ? COLOR.accent : COLOR.buttonLine);
      paint(caption, on ? COLOR.text : COLOR.sub);
    },
  };
  api.setText(value);
  return api;
}

export interface Bar {
  setFraction(fraction: number): void;
  setShown(on: boolean): void;
}

export function bar(parent: WowFrame, width: number, x: number, y: number): Bar {
  const track = parent.CreateTexture(null, "ARTWORK");
  fill(track, COLOR.track);
  track.SetSize(width, BAR_HEIGHT);
  track.SetPoint("TOPLEFT", parent, "TOPLEFT", x, y);
  const filled = parent.CreateTexture(null, "OVERLAY");
  fill(filled, COLOR.accent);
  filled.SetPoint("TOPLEFT", track, "TOPLEFT", 0, 0);
  return {
    setShown(on) {
      if (on) track.Show();
      else {
        track.Hide();
        filled.Hide();
      }
    },
    setFraction(fraction) {
      const clamped = Math.min(1, Math.max(0, fraction));
      if (clamped <= 0) {
        filled.Hide();
        return;
      }
      filled.SetSize(width * clamped, BAR_HEIGHT);
      filled.Show();
    },
  };
}

export interface Checkbox {
  frame: WowFrame;
  set(on: boolean): void;
}

export function checkbox(parent: WowFrame, name: string, value: string, handler: () => void): Checkbox {
  const frame = CreateFrame("Button", name, parent);
  const box = CreateFrame("Frame", null, frame);
  box.SetSize(10, 10);
  box.SetPoint("LEFT", frame, "LEFT", 0, 0);
  border(box, COLOR.buttonLine);
  const check = box.CreateTexture(null, "OVERLAY");
  check.SetTexture(CHECK_TEXTURE);
  check.SetSize(14, 14);
  check.SetPoint("CENTER", box, "CENTER", 0, 0);
  const caption = text(frame, SIZE.small, COLOR.sub);
  caption.SetPoint("LEFT", box, "RIGHT", 4, 0);
  caption.SetText(value);
  frame.SetSize(caption.GetStringWidth() + 14, 14);
  onClick(frame, handler);
  return {
    frame,
    set(on) {
      if (on) check.Show();
      else check.Hide();
      paint(caption, on ? COLOR.accent : COLOR.sub);
    },
  };
}

export type IconKind = "accept" | "turnin" | "kill" | "collect" | "fly" | "hearth" | "done" | "progress" | "empty";

const KIND_TEXTURE: Record<IconKind, string | null> = {
  accept: "Interface\\GossipFrame\\AvailableQuestIcon",
  turnin: "Interface\\GossipFrame\\ActiveQuestIcon",
  kill: "Interface\\CURSOR\\Attack",
  collect: "Interface\\CURSOR\\Pickup",
  fly: "Interface\\CURSOR\\Taxi",
  hearth: "Interface\\Icons\\INV_Misc_Rune_01",
  done: "Interface\\RAIDFRAME\\ReadyCheck-Ready",
  progress: null,
  empty: null,
};

export interface KindIcon {
  frame: WowFrame;
  set(kind: IconKind): void;
}

export function createKindIcon(parent: WowFrame): KindIcon {
  const frame = CreateFrame("Frame", null, parent);
  frame.SetSize(ICON_FRAME, ICON_FRAME);
  const background = frame.CreateTexture(null, "BACKGROUND");
  fill(background, COLOR.iconBg);
  background.SetPoint("TOPLEFT", frame, "TOPLEFT", 0, 0);
  background.SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 0, 0);
  border(frame, COLOR.accent);
  const glyph = frame.CreateTexture(null, "ARTWORK");
  glyph.SetSize(ICON_GLYPH, ICON_GLYPH);
  glyph.SetPoint("CENTER", frame, "CENTER", 0, 0);
  const mark = text(frame, SIZE.body, COLOR.accent);
  mark.SetPoint("CENTER", frame, "CENTER", 0, 0);
  mark.SetText("»");
  const api: KindIcon = {
    frame,
    set(kind) {
      const path = KIND_TEXTURE[kind];
      if (path != null) {
        glyph.SetTexture(path);
        glyph.Show();
      } else glyph.Hide();
      if (kind === "progress") mark.Show();
      else mark.Hide();
    },
  };
  api.set("empty");
  return api;
}

export interface SectionHeader {
  frame: WowFrame;
  set(label: string, count: string): void;
}

export function createSectionHeader(parent: WowFrame, width: number): SectionHeader {
  const frame = CreateFrame("Frame", null, parent);
  frame.SetSize(width, HEADER_HEIGHT);
  const caption = text(frame, SIZE.section, COLOR.title, "LEFT", FONT_TITLE);
  caption.SetPoint("LEFT", frame, "LEFT", 0, 0);
  const total = text(frame, SIZE.small, COLOR.sub);
  total.SetPoint("LEFT", caption, "RIGHT", HEADER_GAP, 0);
  const rule = frame.CreateTexture(null, "BORDER");
  fill(rule, COLOR.line);
  rule.SetHeight(1);
  rule.SetPoint("LEFT", total, "RIGHT", HEADER_GAP, 0);
  rule.SetPoint("RIGHT", frame, "RIGHT", 0, 0);
  return {
    frame,
    set(label, count) {
      caption.SetText(label);
      total.SetText(count);
    },
  };
}

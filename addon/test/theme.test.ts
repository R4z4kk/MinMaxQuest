import { afterEach, beforeEach, expect, it } from "vitest";
import { COLOR, createKindIcon, createSectionHeader, FONT_TITLE, SIZE, WINDOW_HEIGHT, WINDOW_WIDTH, type IconKind } from "../src/ui/theme";

interface Fake {
  name: string;
  calls: string[];
  children: Fake[];
  api: WowFrame;
}

const all: Fake[] = [];

function fake(name: string, log: string[]): Fake {
  const self: Fake = { name, calls: log, children: [], api: null as unknown as WowFrame };
  const make = (childName: string) => {
    const child = fake(childName, log);
    self.children.push(child);
    return child.api;
  };
  self.api = new Proxy({}, {
    get: (_, method: string) => {
      if (method === "CreateTexture") return () => make("texture");
      if (method === "CreateFontString") return () => make("font");
      if (method === "GetStringWidth") return () => 40;
      return (...args: unknown[]) => {
        log.push(`${name}|${method}|${args.map((a) => (typeof a === "object" && a != null ? "obj" : String(a))).join("|")}`);
      };
    },
  }) as WowFrame;
  all.push(self);
  return self;
}

const globals = globalThis as unknown as { CreateFrame: (kind: string, name: string | null, parent: WowFrame) => WowFrame };
let log: string[] = [];
let created: Fake[] = [];

beforeEach(() => {
  log = [];
  all.length = 0;
  globals.CreateFrame = () => fake("frame", log).api;
  created = all;
});

afterEach(() => {
  delete (globals as { CreateFrame?: unknown }).CreateFrame;
});

const ICONS: [IconKind, string][] = [
  ["accept", "Interface\\GossipFrame\\AvailableQuestIcon"],
  ["turnin", "Interface\\GossipFrame\\ActiveQuestIcon"],
  ["kill", "Interface\\CURSOR\\Attack"],
  ["collect", "Interface\\CURSOR\\Pickup"],
  ["fly", "Interface\\CURSOR\\Taxi"],
  ["hearth", "Interface\\Icons\\INV_Misc_Rune_01"],
  ["done", "Interface\\RAIDFRAME\\ReadyCheck-Ready"],
];

it("exposes the BetterBags constants", () => {
  expect(FONT_TITLE).toBe("Fonts\\FRIZQT__.TTF");
  expect([SIZE.title, SIZE.section, WINDOW_WIDTH, WINDOW_HEIGHT]).toEqual([16, 13, 320, 480]);
  expect(COLOR.sub[0]).toBeCloseTo(0x9d / 255);
});

it("builds a 16 px kind icon with a 12 px glyph", () => {
  const icon = createKindIcon(new Proxy({}, {}) as WowFrame);
  expect(icon.frame).toBeDefined();
  expect(log).toContain("frame|SetSize|16|16");
  expect(log).toContain("texture|SetSize|12|12");
});

for (const [kind, path] of ICONS) {
  it(`sets the ${kind} kind icon texture`, () => {
    const icon = createKindIcon(new Proxy({}, {}) as WowFrame);
    log.length = 0;
    icon.set(kind);
    expect(log).toContain(`texture|SetTexture|${path}`);
    expect(log).toContain("texture|Show|");
    expect(log).toContain("font|Hide|");
  });
}

it("shows » with no texture for progress", () => {
  const icon = createKindIcon(new Proxy({}, {}) as WowFrame);
  expect(log).toContain("font|SetText|»");
  log.length = 0;
  icon.set("progress");
  expect(log).toContain("font|Show|");
  expect(log).toContain("texture|Hide|");
  expect(log.some((c) => c.startsWith("texture|SetTexture|"))).toBe(false);
});

it("shows neither glyph nor text for empty", () => {
  const icon = createKindIcon(new Proxy({}, {}) as WowFrame);
  log.length = 0;
  icon.set("empty");
  expect(log).toContain("texture|Hide|");
  expect(log).toContain("font|Hide|");
});

it("draws a section header with its count and a line to the edge", () => {
  const header = createSectionHeader(new Proxy({}, {}) as WowFrame, 300);
  expect(header.frame).toBeDefined();
  header.set("KEYS", "3/5");
  expect(log).toContain("font|SetText|KEYS");
  expect(log).toContain("font|SetText|3/5");
  const frames = created.filter((f) => f.name === "frame");
  expect(frames.length).toBe(1);
  expect(log).toContain("frame|SetSize|300|18");
  const fonts = created.filter((f) => f.name === "font");
  expect(fonts.length).toBe(2);
  expect(log).toContain(`font|SetFont|${FONT_TITLE}|13|`);
  expect(log.some((c) => c.startsWith("texture|SetPoint|LEFT|obj|RIGHT"))).toBe(true);
  expect(log.some((c) => c.startsWith("texture|SetPoint|RIGHT|obj|RIGHT|0"))).toBe(true);
});

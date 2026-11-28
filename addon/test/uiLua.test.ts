import { expect, it } from "vitest";
import { entriesFor, visibleSteps } from "../src/access/chains";
import { loggedIn, QUEST_MODE } from "./helpers/fakeGame";

const UI_FAKES = `
quests[100].zoneOrSort = 12
quests[101].zoneOrSort = 12
UISpecialFrames = {}
Enum = { UIMapType = { Continent = 2 } }
mapInfo = {
  [1429] = { name = "Elwynn Forest", mapType = 3, parentMapID = 1415 },
  [1415] = { name = "Eastern Kingdoms", mapType = 2, parentMapID = 947 },
}
C_Map.GetAreaInfo = function(id) if id == 12 then return "Elwynn Forest" end end
C_Map.GetBestMapForUnit = function() return 1429 end
C_Map.GetMapInfo = function(id) return mapInfo[id] end
GetBuildInfo = function() return "1.60.1", "71139", "Nov 1 2026", 16001 end
date = function() return "2026-11-27" end
`;

async function ui(setup = "") {
  const s = await loggedIn(UI_FAKES + setup);
  const click = (name: string) => s.run(`scripts["${name}.OnClick"](nil, "LeftButton")`);
  const texts = async () => (await s.calls()).filter((c) => c.startsWith("font|SetText|")).map((c) => c.slice(13));
  const last = async (prefix: string) => (await s.calls()).filter((c) => c.startsWith(prefix)).pop();
  const visibilityOf = async (name: string) =>
    (await s.calls()).filter((c) => c === `${name}|Show` || c === `${name}|Hide`).pop();
  const visibility = () => visibilityOf("MinMaxQuestWindow");
  return { ...s, click, texts, last, visibility, visibilityOf };
}

it("toggles the window with /mmq and opens the Quest tab by default", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    expect(await s.visibility()).toBe("MinMaxQuestWindow|Show");
    expect(await s.calls()).toContain("MinMaxQuestWindow|SetSize|320|480");
    const texts = await s.texts();
    expect(texts).toContain("MinMaxQuest");
    expect(texts.slice(texts.indexOf("MinMaxQuest"), texts.indexOf("MinMaxQuest") + 4)).toEqual([
      "MinMaxQuest", "Quest", "Access", "Completion",
    ]);
    expect(texts).toContain("Routes not installed - use Completion meanwhile");
    await s.cmd("");
    expect(await s.visibility()).toBe("MinMaxQuestWindow|Hide");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("sizes the window 320 x 480 on every tab", async () => {
  for (const locale of ["enUS", "frFR"]) {
    const s = await ui(`GetLocale = function() return "${locale}" end`);
    try {
      await s.cmd("");
      for (const tab of ["completion", "access", "quest"]) {
        await s.click(`MinMaxQuestTab${tab}`);
        expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|320|480");
      }
    } finally {
      s.close();
    }
  }
});

it("titles the window in Friz Quadrata", async () => {
  for (const locale of ["enUS", "frFR"]) {
    const s = await ui(`GetLocale = function() return "${locale}" end`);
    try {
      await s.cmd("");
      expect(await s.calls()).toContain("font|SetFont|Fonts\\FRIZQT__.TTF|16|");
      expect(await s.texts()).toContain("MinMaxQuest");
    } finally {
      s.close();
    }
  }
});

it("switches the three tabs and saves the tab", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|320|480");
    expect(await s.run("return MinMaxQuestCharDB.tab")).toBe("completion");
    const texts = await s.texts();
    expect(texts).toContain("Elwynn Forest");
    expect(texts).toContain("0 / 3 quests");
    expect(texts).toContain("» Test Quest");
    expect(texts).toContain("To pick up");
    expect(texts).toContain("Eastern Kingdoms · 0 / 3");
    await s.click("MinMaxQuestTabaccess");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|320|480");
    expect((await s.texts()).some((line) => line.startsWith("0 / "))).toBe(true);
    await s.click("MinMaxQuestTabquest");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|320|480");
    expect(await s.run("return MinMaxQuestCharDB.tab")).toBe("quest");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("opens the skip dialog for a quest with follow-ups and skips on confirm", async () => {
  const s = await ui("quests[100].nextQuestInChain = 101");
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    await s.click("MinMaxQuestCompletionSkip");
    const texts = await s.texts();
    expect(texts).toContain("Skip this step?");
    expect(texts).toContain("· Second (level 10)");
    expect(await s.run("return #MinMaxQuestCharDB.skippedQuests")).toBe(0);
    expect(await s.run("return UISpecialFrames[1]")).toBe("MinMaxQuestSkipDialog");
    await s.click("MinMaxQuestSkipDialogConfirm");
    expect(await s.run("return MinMaxQuestCharDB.skippedQuests[1]")).toBe(100);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("shows the build banner after a build override", async () => {
  const s = await ui();
  try {
    await s.cmd("debug build 1");
    await s.cmd("");
    expect(await s.texts()).toContain("Data built for build 1.60.1.71139");
  } finally {
    s.close();
  }
});

it("shows a notice instead of the tabs when QuestieDB is unusable", async () => {
  const s = await ui(`LibQuestieDB = { RequireContract = function() return false, "old" end }; ticker = function() end`);
  try {
    await s.printed();
    await s.cmd("");
    expect(await s.texts()).toContain("QuestieDB is required");
    await s.click("MinMaxQuestTabcompletion");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("switches Completion modes with sub-tabs, picks a zone, filters and unpins from the window", async () => {
  const s = await ui();
  const completion = () => s.run("local c = MinMaxQuestCharDB.completion; return { c.mode, c.zoneAreaId or 0, c.showTrivial, c.showElite }");
  const lit = async () => {
    const out: string[] = [];
    for (const mode of ["proximity", "zone", "log"]) {
      const on = await s.run(
        `for _, r in ipairs(layout) do if r.name == "texture" and r.parent == "MinMaxQuestCompletionTab${mode}" and r.colored then return r.shown end end`,
      );
      if (on === true) out.push(mode);
    }
    return out;
  };
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    expect(await lit()).toEqual(["proximity"]);
    await s.click("MinMaxQuestCompletionTabzone");
    expect(await completion()).toEqual(["zone", 12, true, true]);
    expect(await lit()).toEqual(["zone"]);
    await s.click("MinMaxQuestCompletionTablog");
    expect(await completion()).toEqual(["log", 12, true, true]);
    expect(await lit()).toEqual(["log"]);
    expect((await s.texts()).some((line) => line.endsWith("in log"))).toBe(true);
    await s.click("MinMaxQuestCompletionTabproximity");
    expect(await completion()).toEqual(["proximity", 12, true, true]);
    expect(await lit()).toEqual(["proximity"]);
    await s.click("MinMaxQuestFilterGrey");
    await s.click("MinMaxQuestFilterElite");
    expect(await completion()).toEqual(["proximity", 12, false, false]);
    await s.run("MinMaxQuestCharDB.completion.zoneAreaId = nil");
    await s.click("MinMaxQuestCompletionTabzone");
    await s.click("MinMaxQuestCompletionZone");
    expect(await s.texts()).toContain("Elwynn Forest");
    await s.click("MinMaxQuestZonePickerRow1");
    expect(await completion()).toEqual(["zone", 12, false, false]);
    await s.cmd("pin 101");
    await s.click("MinMaxQuestCompletionUnpin");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
    expect(await s.printed()).toBe("MinMaxQuest: pinned: [101] Second");
  } finally {
    s.close();
  }
});

it("shows the zone picker button only in Zone mode and has no mode cycle button", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    expect(await s.visibilityOf("MinMaxQuestCompletionZone")).toBe("MinMaxQuestCompletionZone|Hide");
    expect(await s.run("return scripts['MinMaxQuestCompletionMode.OnClick'] == nil")).toBe(true);
    await s.click("MinMaxQuestCompletionTabzone");
    expect(await s.visibilityOf("MinMaxQuestCompletionZone")).toBe("MinMaxQuestCompletionZone|Show");
    await s.click("MinMaxQuestCompletionTablog");
    expect(await s.visibilityOf("MinMaxQuestCompletionZone")).toBe("MinMaxQuestCompletionZone|Hide");
    await s.click("MinMaxQuestCompletionTabproximity");
    expect(await s.visibilityOf("MinMaxQuestCompletionZone")).toBe("MinMaxQuestCompletionZone|Hide");
  } finally {
    s.close();
  }
});

it("labels the Completion sub-tabs in both locales", async () => {
  for (const [locale, labels] of [["enUS", ["Proximity", "Zone", "Log"]], ["frFR", ["Proximité", "Zone", "Journal"]]] as const) {
    const s = await ui(`MinMaxQuestDB = { locale = "${locale}" }`);
    try {
      await s.cmd("");
      await s.click("MinMaxQuestTabcompletion");
      const texts = await s.texts();
      for (const label of labels) expect(texts).toContain(label);
      const calls = await s.calls();
      for (const mode of ["proximity", "zone", "log"]) expect(calls.some((c) => c.startsWith(`MinMaxQuestCompletionTab${mode}|SetSize|106.6`) && c.endsWith("|24"))).toBe(true);
    } finally {
      s.close();
    }
  }
});

const ALLIANCE_DUNGEONS = entriesFor("A").filter((entry) => entry.group === "dungeon");
const ROW_POOL = 22;

async function accessTab(setup = "") {
  const s = await ui(setup);
  await s.cmd("");
  await s.click("MinMaxQuestTabaccess");
  return s;
}

it("renders Access groups as section headers with done / total for an Alliance character and no Horde-only entry", async () => {
  const s = await accessTab();
  try {
    const all = await s.texts();
    const headers = all.flatMap((line, i) => {
      const match = /^0 \/ (\d+)/.exec(line);
      return match == null ? [] : [{ label: all[i - 1], total: Number(match[1]) }];
    });
    const total = (group: string) => entriesFor("A").filter((entry) => entry.group === group).length;
    expect(headers.map((header) => header.label)).toEqual(["Dungeons", "Raids", "Keys", "Misc"]);
    expect(headers.map((header) => header.total)).toEqual([total("dungeon"), total("raid"), total("key"), total("misc")]);
    expect(await s.texts()).not.toContain(ALLIANCE_DUNGEONS[0].name.enUS);
    await s.click("MinMaxQuestAccessRow1");
    const texts = await s.texts();
    expect(texts).toContain(ALLIANCE_DUNGEONS[0].name.enUS);
    expect(texts).not.toContain("Ragefire Chasm");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|320|480");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("expands an access entry with its step states and collapses it again", async () => {
  const s = await accessTab(`C_QuestLog.GetTitleForQuestID = function(id) return "Client " .. id end`);
  try {
    await s.click("MinMaxQuestAccessRow1");
    await s.clearCalls();
    await s.click("MinMaxQuestAccessRow2");
    expect(await s.run("return MinMaxQuestCharDB.expandedChain")).toBe(ALLIANCE_DUNGEONS[0].id);
    const texts = await s.texts();
    expect(texts).toContain("Reach level 10");
    expect(texts.some((line) => line.endsWith(`Client ${ALLIANCE_DUNGEONS[0].steps[1].ref}`))).toBe(true);
    expect(texts.filter((line) => line.startsWith("» "))).toHaveLength(1);
    expect(texts.some((line) => /^1\/\d+ steps$/.test(line))).toBe(true);
    await s.click("MinMaxQuestAccessRow2");
    expect(await s.run("return MinMaxQuestCharDB.expandedChain == nil")).toBe(true);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("scrolls the access list without creating frames", async () => {
  const s = await accessTab();
  const created = async () => (await s.run("return created")) as number;
  const last = ALLIANCE_DUNGEONS[ALLIANCE_DUNGEONS.length - 1].name.enUS;
  try {
    await s.click("MinMaxQuestAccessRow1");
    expect(await s.texts()).not.toContain(last);
    const before = await created();
    await s.clearCalls();
    for (let i = 0; i < 20; i++) await s.run(`scripts["MinMaxQuestAccessList.OnMouseWheel"](nil, -1)`);
    expect(await s.texts()).toContain(last);
    expect(await created()).toBe(before);
    expect(await s.run(`return scripts["MinMaxQuestAccessRow${ROW_POOL + 1}.OnClick"] == nil`)).toBe(true);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("stores a tracked access entry and refreshes the targets", async () => {
  const s = await accessTab(QUEST_MODE);
  const reads = async () => (await s.run("return raceCalls")) as number;
  const track = `MinMaxQuestAccessRow${2 + visibleSteps(ALLIANCE_DUNGEONS[0], 1).length + 1}Track`;
  try {
    await s.click("MinMaxQuestAccessRow1");
    await s.click("MinMaxQuestAccessRow2");
    expect(await s.visibilityOf(track)).toBe(`${track}|Show`);
    const before = await reads();
    await s.click(track);
    expect(await s.run("return MinMaxQuestCharDB.trackedChains[1]")).toBe(ALLIANCE_DUNGEONS[0].id);
    expect(await reads()).toBe(before + 1);
    expect(await s.texts()).toContain("1 chain tracked");
    await s.click(track);
    expect(await s.run("return #MinMaxQuestCharDB.trackedChains")).toBe(0);
    expect(await reads()).toBe(before + 2);
  } finally {
    s.close();
  }
});

it("redraws a visible Access tab on the next tick once an item name is received", async () => {
  const s = await accessTab(`itemNames = {}; C_Item.GetItemNameByID = function(id) return itemNames[id] end`);
  const named = async () => (await s.texts()).some((line) => line.startsWith("Ancient Rune"));
  try {
    expect(await s.calls()).toContain("MinMaxQuestEvents|RegisterEvent|GET_ITEM_INFO_RECEIVED");
    await s.click("MinMaxQuestAccessRow1");
    await s.click("MinMaxQuestAccessRow2");
    expect(await s.texts()).toContain("#274286");
    await s.run("itemNames[274286] = 'Ancient Rune'");
    await s.clearCalls();
    await s.event(`"GET_ITEM_INFO_RECEIVED", 274286, true`);
    expect(await named()).toBe(false);
    await s.tick();
    expect(await named()).toBe(true);
    await s.click("MinMaxQuestTabquest");
    await s.run("itemNames[274286] = 'Ancient Rune 2'");
    await s.clearCalls();
    await s.event(`"GET_ITEM_INFO_RECEIVED", 274286, true`);
    await s.tick();
    expect(await named()).toBe(false);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("opens the group of a tracked entry and keeps the others collapsed", async () => {
  const s = await accessTab(`MinMaxQuestCharDB = { trackedChains = { "154" } }`);
  try {
    const texts = await s.texts();
    expect(texts).toContain("Dalaran Sewer Key");
    expect(texts).not.toContain(ALLIANCE_DUNGEONS[0].name.enUS);
  } finally {
    s.close();
  }
});

it("stores the Quest tab options and opens Completion from the empty state", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    await s.click("MinMaxQuestRouteElites");
    await s.click("MinMaxQuestRouteDungeons");
    await s.click("MinMaxQuestAutoFly");
    await s.click("MinMaxQuestGap2");
    expect(
      await s.run("local d = MinMaxQuestCharDB; return { d.routeElites, d.routeDungeons, d.autoFly, d.minLevelGap }"),
    ).toEqual([true, true, false, 2]);
    await s.click("MinMaxQuestGap0");
    expect(await s.run("return MinMaxQuestCharDB.minLevelGap == nil")).toBe(true);
    await s.click("MinMaxQuestOpenCompletion");
    expect(await s.run("return MinMaxQuestCharDB.tab")).toBe("completion");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("shows the Quest tab in French when French is stored on an English client", async () => {
  const s = await ui(`MinMaxQuestDB = { locale = "frFR" }`);
  try {
    await s.cmd("");
    const texts = await s.texts();
    expect(texts).toContain("Quête");
    expect(texts).not.toContain("Quest");
  } finally {
    s.close();
  }
});

it("stores the language from the Options buttons and offers a reload only when it differs", async () => {
  const s = await ui();
  const reloadShown = async () => (await s.visibilityOf("MinMaxQuestReload")) === "MinMaxQuestReload|Show";
  try {
    await s.cmd("");
    await s.click("MinMaxQuestSectionOptions");
    expect(await s.run("return MinMaxQuestDB.locale")).toBe("auto");
    expect(await reloadShown()).toBe(false);
    await s.click("MinMaxQuestLanguagefrFR");
    expect(await s.run("return MinMaxQuestDB.locale")).toBe("frFR");
    expect(await reloadShown()).toBe(true);
    await s.click("MinMaxQuestLanguageenUS");
    expect(await s.run("return MinMaxQuestDB.locale")).toBe("enUS");
    expect(await reloadShown()).toBe(false);
    await s.click("MinMaxQuestLanguagefrFR");
    expect(await s.run("return reloads")).toBe(0);
    await s.click("MinMaxQuestReload");
    expect(await s.run("return reloads")).toBe(1);
    await s.click("MinMaxQuestLanguageauto");
    expect(await reloadShown()).toBe(false);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("repairs an invalid stored language", async () => {
  const s = await ui(`MinMaxQuestDB = { locale = "xx" }`);
  try {
    await s.cmd("");
    expect(await s.run("return MinMaxQuestDB.locale")).toBe("auto");
    expect(await s.texts()).toContain("Quest");
  } finally {
    s.close();
  }
});

it("locks the arrow from the Options checkbox and from the slash commands", async () => {
  const s = await ui();
  const locked = () => s.run("return MinMaxQuestCharDB.arrow and MinMaxQuestCharDB.arrow.locked");
  try {
    expect(await s.run("return MinMaxQuestCharDB.arrow == nil")).toBe(true);
    await s.cmd("");
    await s.click("MinMaxQuestLockArrow");
    expect(await locked()).toBe(true);
    await s.click("MinMaxQuestLockArrow");
    expect(await locked()).toBe(false);
    await s.cmd("arrow lock");
    expect(await locked()).toBe(true);
    await s.click("MinMaxQuestLockArrow");
    expect(await locked()).toBe(false);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("draws the Lock arrow checkbox from the arrow itself", async () => {
  const s = await ui();
  try {
    await s.cmd("arrow lock");
    await s.run("MinMaxQuestCharDB.arrow.locked = false");
    await s.clearCalls();
    await s.cmd("");
    const marks = (await s.calls()).filter((c) => /^texture\|(Show|Hide)$/.test(c));
    expect(marks.pop()).toBe("texture|Show");
  } finally {
    s.close();
  }
});

it("creates no frame, texture or font string when the engine redraws an open tab", async () => {
  const s = await ui();
  const created = async () => (await s.run("return created")) as number;
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    const before = await created();
    const times = async () => (await s.texts()).filter((line) => line.endsWith("min")).pop();
    const first = await times();
    await s.clearCalls();
    for (const x of [1500, 1800]) {
      await s.run(`player = { ${x}, 2000 }; now = now + 3`);
      await s.tick();
    }
    expect(await s.texts()).toContain("» Second");
    expect(await times()).not.toBe(first);
    expect(await created()).toBe(before);
    await s.click("MinMaxQuestTabaccess");
    const access = await created();
    await s.run("player = { 1000, 2000 }; now = now + 3");
    await s.tick();
    await s.tick();
    expect(await created()).toBe(access);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("shows expired constants in the banner", async () => {
  const s = await ui(`date = function() return "2099-01-01" end`);
  try {
    await s.cmd("");
    const banner = (await s.texts()).find((line) => line.startsWith("Expired data: "));
    expect(banner).toContain("runSpeed");
    expect(banner).toContain("XP_PER_LEVEL");
    expect(banner?.startsWith("Data built")).toBe(false);
  } finally {
    s.close();
  }
});

it("opens the zone picker when the Zone sub-tab has no zone to use", async () => {
  const s = await ui("C_Map.GetBestMapForUnit = function() return nil end");
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    await s.clearCalls();
    await s.click("MinMaxQuestCompletionTabzone");
    expect(await s.run("return MinMaxQuestCharDB.completion.mode")).toBe("zone");
    expect(await s.visibilityOf("MinMaxQuestZonePicker")).toBe("MinMaxQuestZonePicker|Show");
  } finally {
    s.close();
  }
});

it("uppercases accented French labels", async () => {
  const s = await ui(`GetLocale = function() return "frFR" end`);
  try {
    await s.cmd("");
    expect(await s.texts()).toContain("ÉTAPE EN COURS");
  } finally {
    s.close();
  }
});

it("drives the arrow from the last of the Quest and Completion tabs", async () => {
  const s = await ui(QUEST_MODE);
  const firstTarget = async () => {
    await s.printed();
    await s.cmd("targets");
    return (await s.printed()).split("\n")[0];
  };
  try {
    expect(await firstTarget()).toBe("MinMaxQuest: [33] Wolves Across the Border · pick up · <1 min");
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    expect(await s.run("return MinMaxQuestCharDB.activeMode")).toBe("completion");
    await s.tick();
    expect(await firstTarget()).toBe("MinMaxQuest: [100] Test Quest · pick up · <1 min");
    await s.click("MinMaxQuestTabaccess");
    await s.tick();
    expect(await s.run("return MinMaxQuestCharDB.activeMode")).toBe("completion");
    await s.click("MinMaxQuestTabquest");
    await s.tick();
    expect(await firstTarget()).toBe("MinMaxQuest: [33] Wolves Across the Border · pick up · <1 min");
  } finally {
    s.close();
  }
});

const ROUTE_FAKES = `${QUEST_MODE}
C_Map.GetAreaInfo = function(id) if id == 721 then return "Gnomeregan" end if id == 12 then return "Elwynn Forest" end end
`;

async function routeTab(setup = "") {
  const s = await ui(ROUTE_FAKES + setup);
  await s.cmd("");
  await s.tick();
  return s;
}

const footerOf = (texts: string[]) => texts.filter((line) => line.startsWith("Lvl ")).pop() ?? "";

it("shows the followed route in the Quest tab", async () => {
  const s = await routeTab();
  try {
    const texts = await s.texts();
    expect(texts).toContain("CURRENT STEP");
    expect(texts).toContain("Wolves Across the Border · pick up");
    expect(texts.filter((line) => line.includes(" · pick up") || line.includes("Fly to") || line.includes("flight")).length).toBeGreaterThan(1);
    expect(footerOf(texts)).toMatch(/^Lvl 1 · step 1\/\d+ · (~\d+ h|~\d+ min|<1 min) left$/);
    expect(texts).not.toContain("Routes not installed - use Completion meanwhile");
  } finally {
    s.close();
  }
});

it("shows the off-route banner and clears it on Re-sync", async () => {
  const s = await routeTab();
  try {
    await s.run("UnitLevel = function() return 6 end; player = { 1500, 2000 }; now = now + 3");
    await s.event('"PLAYER_LEVEL_UP", 6');
    await s.tick();
    const banner = (await s.texts()).filter((line) => line.startsWith("Off route: level 6")).pop();
    expect(banner).toMatch(/^Off route: level 6, route expects \d+$/);
    expect(await s.visibilityOf("MinMaxQuestResync")).toBe("MinMaxQuestResync|Show");
    await s.click("MinMaxQuestResync");
    expect(await s.visibilityOf("MinMaxQuestResync")).toBe("MinMaxQuestResync|Hide");
    expect(await s.run("return MinMaxQuestCharDB.route.startIndex > 0")).toBe(true);
  } finally {
    s.close();
  }
});

it("stores a toggled return dungeon and changes the route length", async () => {
  const s = await routeTab();
  try {
    expect(await s.texts()).toContain("Gnomeregan");
    const total = async () => Number(footerOf(await s.texts()).match(/step \d+\/(\d+)/)?.[1]);
    const before = await total();
    await s.click("MinMaxQuestDungeon721");
    expect(await s.run("return MinMaxQuestCharDB.dungeonReturns[1]")).toBe(721);
    await s.tick();
    expect(await total()).toBeGreaterThan(before);
    await s.click("MinMaxQuestDungeon721");
    expect(await s.run("return #MinMaxQuestCharDB.dungeonReturns")).toBe(0);
  } finally {
    s.close();
  }
});

it("shows Routes not installed without a routes global", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    expect(await s.texts()).toContain("Routes not installed - use Completion meanwhile");
    expect(await s.run("return table.concat(routeNotices, \"|\")")).toContain("Routes not installed - use Completion meanwhile (Route data missing");
    expect(await s.visibilityOf("MinMaxQuestOpenCompletion")).not.toBe("MinMaxQuestOpenCompletion|Hide");
  } finally {
    s.close();
  }
});

it("shows Routes not installed when the variant fails to decode", async () => {
  const s = await routeTab(`MinMaxQuestRoutes.Alliance.trunk.e0d0x0 = "z;1;2"`);
  try {
    await s.run("now = now + 3");
    await s.tick();
    expect(await s.texts()).toContain("Routes not installed - use Completion meanwhile");
    expect(await s.visibilityOf("MinMaxQuestOpenCompletion")).not.toBe("MinMaxQuestOpenCompletion|Hide");
    expect(await s.visibilityOf("MinMaxQuestRouteSkip")).toBe("MinMaxQuestRouteSkip|Hide");
  } finally {
    s.close();
  }
});

it("shows Route finished at the maximum level", async () => {
  const s = await routeTab("UnitLevel = function() return 60 end");
  try {
    await s.run("now = now + 3");
    await s.tick();
    expect(await s.texts()).toContain("Route finished");
  } finally {
    s.close();
  }
});

it("shows the real active mode in the Access tab footer", async () => {
  const s = await routeTab();
  try {
    await s.click("MinMaxQuestTabcompletion");
    await s.click("MinMaxQuestTabaccess");
    expect((await s.texts()).filter((line) => line.startsWith("Active mode")).pop()).toBe("Active mode: Completion");
    await s.click("MinMaxQuestTabquest");
    await s.click("MinMaxQuestTabaccess");
    expect((await s.texts()).filter((line) => line.startsWith("Active mode")).pop()).toBe("Active mode: Quest");
  } finally {
    s.close();
  }
});

it("shows objective progress and the distance to the next step", async () => {
  const s = await routeTab(`
    logQuests = { 33 }
    objectives[33] = { { finished = false, numFulfilled = 6, numRequired = 10 } }
    player = { 1500, 2000 }
  `);
  try {
    await s.event('"QUEST_ACCEPTED"');
    await s.run("now = now + 3; player = { 1600, 2000 }");
    await s.tick();
    await s.tick();
    const texts = await s.texts();
    expect(texts).toContain("6/10");
    expect(texts).toContain("560 m");
  } finally {
    s.close();
  }
});

it("skips the displayed step, not the arrow target, from the Quest tab", async () => {
  const s = await routeTab("quests[33].requiredLevel = 5");
  try {
    await s.run("now = now + 3");
    await s.tick();
    expect(await s.texts()).toContain("Wolves Across the Border · pick up");
    await s.printed();
    await s.cmd("targets");
    expect((await s.printed()).split("\n")[0]).not.toContain("[33]");
    const before = await s.run("return #MinMaxQuestCharDB.route.skippedSteps + #MinMaxQuestCharDB.skippedQuests");
    await s.click("MinMaxQuestRouteSkip");
    expect(await s.run("return MinMaxQuestCharDB.skippedQuests[1]")).toBe(33);
    expect(before).toBe(0);
  } finally {
    s.close();
  }
});

it("shows no progress for an objective without a required count", async () => {
  const s = await routeTab(`
    logQuests = { 33 }
    objectives[33] = { { finished = false } }
  `);
  try {
    await s.event('"QUEST_ACCEPTED"');
    await s.run("now = now + 3");
    await s.tick();
    expect(await s.texts()).not.toContain("0/0");
  } finally {
    s.close();
  }
});

it("prints route decode errors, unlike the missing route file notice", async () => {
  const s = await routeTab(`MinMaxQuestRoutes.Alliance.trunk.e0d0x0 = "z;1;2"`);
  try {
    expect(await s.printed()).toContain("Routes not installed - use Completion meanwhile (Error: Route data A e0d0x0 (trunk)");
  } finally {
    s.close();
  }
});

it("fits eleven dungeons in the fixed window", async () => {
  const s = await routeTab(`
    local text = MinMaxQuestRoutes.Alliance.returnBlocks[721]
    local blocks = {}
    for i = 1, 11 do blocks[5000 + i] = text end
    MinMaxQuestRoutes.Alliance.returnBlocks = blocks
  `);
  try {
    await s.click("MinMaxQuestSectionDungeons");
    const height = 480;
    const calls = await s.calls();
    for (let i = 1; i <= 11; i++) {
      const name = `MinMaxQuestDungeon${5000 + i}`;
      const point = calls.filter((c) => c.startsWith(`${name}|SetPoint|`)).pop()?.split("|") ?? [];
      const size = calls.filter((c) => c.startsWith(`${name}|SetSize|`)).pop()?.split("|") ?? [];
      const [x, y, width, boxHeight] = [Number(point[5]), Number(point[6]), Number(size[2]), Number(size[3])];
      expect(x + width).toBeLessThanOrEqual(320);
      expect(50 - y + boxHeight).toBeLessThanOrEqual(height);
    }
    expect(calls.some((c) => c.startsWith("MinMaxQuestWindow|SetHeight|"))).toBe(false);
  } finally {
    s.close();
  }
});

it("fits every option above the footer in the fixed window while Options is open", async () => {
  const s = await routeTab();
  const FOOTER_TOP = 9 + 11;
  try {
    expect(await s.last("MinMaxQuestWindow|SetSize|")).toBe("MinMaxQuestWindow|SetSize|320|480");
    await s.click("MinMaxQuestSectionOptions");
    const height = 480;
    const calls = await s.calls();
    const lastCall = (prefix: string) => calls.filter((c) => c.startsWith(prefix)).pop()?.split("|") ?? [];
    const inside = (x: number, y: number, width: number, boxHeight: number) => {
      expect(x + width).toBeLessThanOrEqual(320);
      expect(50 - y + boxHeight).toBeLessThanOrEqual(height - FOOTER_TOP);
    };
    for (const name of ["MinMaxQuestRouteElites", "MinMaxQuestRouteDungeons", "MinMaxQuestAutoFly", "MinMaxQuestNativeWaypoint", "MinMaxQuestLockArrow"]) {
      const point = lastCall(`${name}|SetPoint|`);
      const size = lastCall(`${name}|SetSize|`);
      inside(Number(point[5]), Number(point[6]), Number(size[2]), Number(size[3]));
    }
    const first = lastCall("MinMaxQuestGap0|SetPoint|");
    const y = Number(first[6]);
    let x = Number(first[5]);
    for (const gap of [0, 1, 2, 3]) {
      const width = Number(lastCall(`MinMaxQuestGap${gap}|SetWidth|`)[2]);
      const buttonHeight = Number(lastCall(`MinMaxQuestGap${gap}|SetHeight|`)[2]);
      inside(x, y, width, buttonHeight);
      x += width + 4;
    }
    const language = lastCall("MinMaxQuestLanguageauto|SetPoint|");
    let languageX = Number(language[5]);
    for (const code of ["auto", "enUS", "frFR"]) {
      const width = Number(lastCall(`MinMaxQuestLanguage${code}|SetWidth|`)[2]);
      const buttonHeight = Number(lastCall(`MinMaxQuestLanguage${code}|SetHeight|`)[2]);
      inside(languageX, Number(language[6]), width, buttonHeight);
      languageX += width + 4;
    }
    const reload = lastCall("MinMaxQuestReload|SetPoint|");
    const reloadWidth = Number(lastCall("MinMaxQuestReload|SetWidth|")[2]);
    inside(320 + Number(reload[5]) - reloadWidth, Number(reload[6]), reloadWidth, 16);
    expect(320 + Number(reload[5]) - reloadWidth).toBeGreaterThan(0);
    await s.click("MinMaxQuestSectionOptions");
    expect((await s.calls()).some((c) => c.startsWith("MinMaxQuestWindow|SetHeight|"))).toBe(false);
  } finally {
    s.close();
  }
});

const LAYOUT_LUA = `
local function edge(rec, side)
  local p = rec.points[1]
  local rel = p[2].__rec
  local anchor
  if rel.width == nil then
    anchor = (p[3] == "LEFT" or p[3] == "TOPLEFT") and 0 or 320
  else
    local l, r = (function() local a, b = extentOf(rel) return a, b end)()
    anchor = (p[3] == "LEFT" or p[3] == "TOPLEFT") and l or r
  end
  local x = anchor + p[4]
  if p[1] == "TOPLEFT" or p[1] == "LEFT" then return x, x + rec.width end
  return x - rec.width, x
end
extentOf = edge
local function named(name)
  for i = #layout, 1, -1 do if layout[i].name == name then return layout[i] end end
end
local zone = named("MinMaxQuestCompletionZone")
local header
for i = #layout, 1, -1 do
  local r = layout[i]
  if r.name == "font" and r.width ~= nil and r.text == HEADER then header = r break end
end
local zl, zr = edge(zone)
local hl, hr = edge(header)
return { zone.shown and 1 or 0, zl, zr, hl, hr, textWidth(header.text), header.width }
`;

const HEADERS = {
  enUS: { proximity: "Elwynn Forest", zone: "Elwynn Forest", log: "2 quests in log" },
  frFR: { proximity: "Elwynn Forest", zone: "Elwynn Forest", log: "2 quêtes dans le journal" },
} as const;

for (const locale of ["enUS", "frFR"] as const) {
  for (const mode of ["proximity", "zone", "log"] as const) {
    it(`keeps the Completion header controls apart and inside the window (${locale}, ${mode})`, async () => {
      const setup = `CHAR_WIDTH = 6; logQuests = { 100, 101 }
        MinMaxQuestDB = { locale = "${locale}" }
        MinMaxQuestCharDB = { completion = { mode = "${mode}", zoneAreaId = 12 } }`;
      const s = await ui(setup);
      try {
        await s.cmd("");
        await s.click("MinMaxQuestTabcompletion");
        const [zoneShown, zl, zr, hl, hr, textW, headerW] = (await s.run(
          `HEADER = ${JSON.stringify(HEADERS[locale][mode])}
${LAYOUT_LUA}`,
        )) as number[];
        const boxes = [[hl, hr], ...(zoneShown === 1 ? [[zl, zr]] : [])];
        for (const [l, r] of boxes) expect(l >= 0 && r <= 320).toBe(true);
        boxes.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1][1] <= boxes[i][0]).toBe(true);
        expect(textW <= headerW).toBe(true);
        expect(zoneShown).toBe(mode === "zone" ? 1 : 0);
      } finally {
        s.close();
      }
    });
  }
}

const SECTION_LABELS = {
  enUS: ["To turn in", "Objectives", "To pick up"],
  frFR: ["À rendre", "Objectifs", "À prendre"],
} as const;

for (const locale of ["enUS", "frFR"] as const) {
  it(`shows Completion sections with counts in ${locale} within 320 px`, async () => {
    for (const mode of ["proximity", "zone", "log"] as const) {
      const setup = `CHAR_WIDTH = 6
        MinMaxQuestDB = { locale = "${locale}" }`;
      const s = await ui(setup);
      try {
        await s.cmd("");
        await s.click("MinMaxQuestTabcompletion");
        await s.click(`MinMaxQuestCompletionTab${mode}`);
        const labels = SECTION_LABELS[locale];
        const found = (await s.run(
          `local labels = { ${labels.map((l) => JSON.stringify(l)).join(", ")} }
local out = {}
for i, r in ipairs(layout) do
  if r.name == "font" and r.shown then
    for _, label in ipairs(labels) do
      if r.text == label then
        local count = layout[i + 1]
        out[#out + 1] = label .. "|" .. count.text .. "|" .. (textWidth(label) + textWidth(count.text) + 12)
      end
    end
  end
end
return table.concat(out, ";")`,
        )) as string;
        const sections = found.split(";").filter((entry) => entry !== "");
        expect([mode, sections.length > 0]).toEqual([mode, true]);
        for (const entry of sections) {
          const [, count, width] = entry.split("|");
          expect(Number(count)).toBeGreaterThan(0);
          expect(Number(width) <= 300).toBe(true);
        }
        const texts = await s.texts();
        expect(texts).not.toContain("Nearest target");
      } finally {
        s.close();
      }
    }
  });
}

const ITEM_FAKES = `quests[100].sourceItemId = 900
quests[100].requiredSourceItems = { 901 }
bags[900] = 2
itemSpells[900] = "Use"
itemSpells[901] = "Use"`;
const SECURE_CALL = /^MinMaxQuestItem(Holder|Button)\|(SetAttribute|Show|Hide|SetPoint|ClearAllPoints|StartMoving|StopMovingOrSizing|EnableMouse)\b/;

it("shows the quest item button for the target's usable bag item, right of the arrow", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    expect(await s.run(`return templates.MinMaxQuestItemButton`)).toBe("SecureActionButtonTemplate");
    expect(await s.run(`return templates.MinMaxQuestItemButtonCooldown`)).toBe("CooldownFrameTemplate");
    const calls = await s.calls();
    expect(calls).toContain("MinMaxQuestItemButton|SetAttribute|type|item");
    expect(calls.filter((c) => c.startsWith("MinMaxQuestItemButton|SetAttribute|item|")).pop()).toBe(
      "MinMaxQuestItemButton|SetAttribute|item|item:900",
    );
    expect(calls.filter((c) => c.startsWith("MinMaxQuestItemHolder|SetPoint|")).pop()).toMatch(/\|TOPLEFT\|.*\|BOTTOMLEFT\|160\|700$/);
    expect(await s.visibilityOf("MinMaxQuestItemHolder")).toBe("MinMaxQuestItemHolder|Show");
    expect(calls).toContain("font|SetText|2");
    await s.run("bags[900] = 0; bags[901] = 0");
    await s.event(`"BAG_UPDATE_DELAYED"`);
    expect(await s.visibilityOf("MinMaxQuestItemHolder")).toBe("MinMaxQuestItemHolder|Hide");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("defers an item change in combat until PLAYER_REGEN_ENABLED", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    await s.clearCalls();
    await s.run("inCombat = true; bags[900] = 0; bags[901] = 1");
    await s.event(`"BAG_UPDATE_DELAYED"`);
    await s.cmd("arrow lock");
    expect((await s.calls()).filter((c) => SECURE_CALL.test(c))).toEqual([]);
    await s.run("inCombat = false");
    await s.event(`"PLAYER_REGEN_ENABLED"`);
    const calls = await s.calls();
    expect(calls).toContain("MinMaxQuestItemButton|SetAttribute|item|item:901");
    expect(await s.visibilityOf("MinMaxQuestItemHolder")).toBe("MinMaxQuestItemHolder|Show");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("drags the item holder by its grip only while unlocked and out of combat", async () => {
  const s = await ui(ITEM_FAKES);
  const drag = async () => {
    await s.clearCalls();
    await s.run(`scripts["MinMaxQuestItemHolder.OnDragStart"](nil); scripts["MinMaxQuestItemHolder.OnDragStop"](nil)`);
    return (await s.calls()).includes("MinMaxQuestItemHolder|StartMoving");
  };
  try {
    await s.cmd("arrow lock");
    expect(await drag()).toBe(false);
    expect(await s.run("return MinMaxQuestCharDB.itemButton == nil")).toBe(true);
    await s.cmd("arrow move");
    await s.run("inCombat = true");
    expect(await drag()).toBe(false);
    expect(await s.run("return MinMaxQuestCharDB.itemButton == nil")).toBe(true);
    await s.run("inCombat = false");
    expect(await drag()).toBe(true);
    expect(await s.run("return MinMaxQuestCharDB.itemButton.x .. ',' .. MinMaxQuestCharDB.itemButton.y")).toBe("100,700");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("places the item holder at its saved position", async () => {
  const s = await ui(`${ITEM_FAKES}
MinMaxQuestCharDB = { itemButton = { x = 300, y = 400 } }`);
  try {
    expect((await s.calls()).filter((c) => c.startsWith("MinMaxQuestItemHolder|SetPoint|")).pop()).toMatch(/\|TOPLEFT\|.*\|BOTTOMLEFT\|300\|400$/);
  } finally {
    s.close();
  }
});

it("stops dragging the item holder when combat starts and leaves it alone afterwards", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    await s.cmd("arrow move");
    await s.run(`scripts["MinMaxQuestItemHolder.OnDragStart"](nil)`);
    await s.clearCalls();
    await s.run("inCombat = true");
    await s.event(`"PLAYER_REGEN_DISABLED"`);
    expect(await s.run("return MinMaxQuestCharDB.itemButton.x .. ',' .. MinMaxQuestCharDB.itemButton.y")).toBe("100,700");
    expect((await s.calls()).filter((c) => c === "MinMaxQuestItemHolder|StopMovingOrSizing")).toHaveLength(1);
    await s.clearCalls();
    await s.run(`scripts["MinMaxQuestItemHolder.OnDragStop"](nil)`);
    await s.event(`"PLAYER_REGEN_DISABLED"`);
    expect((await s.calls()).filter((c) => /^MinMaxQuestItemHolder\|/.test(c))).toEqual([]);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("clears the item icon when the item goes away and sets no attribute when the icon lookup fails", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    await s.clearCalls();
    await s.run("bags[900] = 0; bags[901] = 0");
    await s.event(`"BAG_UPDATE_DELAYED"`);
    expect(await s.calls()).toContain("texture|SetTexture|nil");
    await s.run("bags[901] = 1; C_Item.GetItemIconByID = nil");
    await s.clearCalls();
    await s.event(`"BAG_UPDATE_DELAYED"`);
    expect((await s.calls()).filter((c) => c.startsWith("MinMaxQuestItemButton|SetAttribute|item|"))).toEqual([]);
  } finally {
    s.close();
  }
});

const ARROW = "MinMaxQuestArrow";
const HOLDER = "MinMaxQuestItemHolder";
const WINDOW = "MinMaxQuestWindow";

it("hides and shows the window, the arrow and the item button together with /mmq", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Show`);
    await s.cmd("");
    expect(await s.visibility()).toBe(`${WINDOW}|Show`);
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Show`);
    expect(await s.visibilityOf(HOLDER)).toBe(`${HOLDER}|Show`);
    await s.cmd("");
    expect(await s.visibility()).toBe(`${WINDOW}|Hide`);
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Hide`);
    expect(await s.visibilityOf(HOLDER)).toBe(`${HOLDER}|Hide`);
    expect(await s.run("return MinMaxQuestCharDB.hidden")).toBe(true);
    await s.tick();
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Hide`);
    await s.cmd("");
    expect(await s.visibility()).toBe(`${WINDOW}|Show`);
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Show`);
    expect(await s.visibilityOf(HOLDER)).toBe(`${HOLDER}|Show`);
    expect(await s.run("return MinMaxQuestCharDB.hidden")).toBe(false);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("hides everything with the eye button, keeps it hidden after a reload and /mmq brings it back", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    await s.cmd("");
    expect(await s.calls()).toContain("MinMaxQuestEye|SetSize|14|14");
    await s.click("MinMaxQuestEye");
    expect(await s.visibility()).toBe(`${WINDOW}|Hide`);
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Hide`);
    expect(await s.visibilityOf(HOLDER)).toBe(`${HOLDER}|Hide`);
    expect(await s.run("return MinMaxQuestCharDB.hidden")).toBe(true);
  } finally {
    s.close();
  }
  const reloaded = await ui(`${ITEM_FAKES}
MinMaxQuestCharDB = { hidden = true }`);
  try {
    const calls = await reloaded.calls();
    expect(calls).not.toContain(`${ARROW}|Show`);
    expect(calls).not.toContain(`${HOLDER}|Show`);
    expect(calls).not.toContain(`${WINDOW}|Show`);
    await reloaded.cmd("");
    expect(await reloaded.visibility()).toBe(`${WINDOW}|Show`);
    expect(await reloaded.visibilityOf(ARROW)).toBe(`${ARROW}|Show`);
    expect(await reloaded.visibilityOf(HOLDER)).toBe(`${HOLDER}|Show`);
    expect(await reloaded.run("return MinMaxQuestCharDB.hidden")).toBe(false);
    expect(await reloaded.printed()).toBe("");
  } finally {
    reloaded.close();
  }
});

it("defers the item holder visibility to PLAYER_REGEN_ENABLED when hidden in combat", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    await s.cmd("");
    await s.clearCalls();
    await s.run("inCombat = true");
    await s.cmd("");
    expect(await s.visibility()).toBe(`${WINDOW}|Hide`);
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Hide`);
    expect((await s.calls()).filter((c) => SECURE_CALL.test(c))).toEqual([]);
    await s.run("inCombat = false");
    await s.event(`"PLAYER_REGEN_ENABLED"`);
    expect(await s.visibilityOf(HOLDER)).toBe(`${HOLDER}|Hide`);
    await s.run("inCombat = true");
    await s.clearCalls();
    await s.cmd("");
    expect((await s.calls()).filter((c) => SECURE_CALL.test(c))).toEqual([]);
    await s.run("inCombat = false");
    await s.event(`"PLAYER_REGEN_ENABLED"`);
    expect(await s.visibilityOf(HOLDER)).toBe(`${HOLDER}|Show`);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("shows the arrow outline and grip only on hover or drag while unlocked", async () => {
  const s = await ui();
  const outline = () => s.run(`return shownOutline("${ARROW}")`);
  const fire = (event: string) => s.run(`scripts["${ARROW}.${event}"](nil)`);
  try {
    expect(await outline()).toBe(0);
    await fire("OnEnter");
    expect(await outline()).toBe(5);
    await fire("OnLeave");
    expect(await outline()).toBe(0);
    await fire("OnEnter");
    await fire("OnDragStart");
    await fire("OnLeave");
    expect(await outline()).toBe(5);
    await fire("OnDragStop");
    expect(await outline()).toBe(0);
    await fire("OnEnter");
    await s.cmd("arrow lock");
    expect(await outline()).toBe(0);
    expect(await s.run(`return scripts["${ARROW}.OnEnter"] == nil`)).toBe(true);
    await s.cmd("arrow move");
    expect(await outline()).toBe(0);
    await fire("OnEnter");
    expect(await outline()).toBe(5);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("forces the arrow and the window visible while placing the arrow", async () => {
  const s = await ui(ITEM_FAKES);
  try {
    await s.cmd("");
    await s.cmd("");
    expect(await s.run("return MinMaxQuestCharDB.hidden")).toBe(true);
    await s.cmd("arrow move");
    expect(await s.run("return MinMaxQuestCharDB.hidden")).toBe(false);
    expect(await s.visibility()).toBe(`${WINDOW}|Show`);
    expect(await s.visibilityOf(ARROW)).toBe(`${ARROW}|Show`);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("resets the arrow outline when the arrow is hidden while hovered", async () => {
  const s = await ui();
  try {
    await s.run(`scripts["${ARROW}.OnEnter"](nil)`);
    expect(await s.run(`return shownOutline("${ARROW}")`)).toBe(5);
    await s.run(`scripts["${ARROW}.OnHide"](nil)`);
    expect(await s.run(`return shownOutline("${ARROW}")`)).toBe(0);
    await s.run(`scripts["${ARROW}.OnDragStart"](nil)`);
    await s.run(`scripts["${ARROW}.OnHide"](nil)`);
    expect(await s.run(`return shownOutline("${ARROW}")`)).toBe(0);
  } finally {
    s.close();
  }
});

it("does not redraw the open window when unlocking the arrow", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    await s.cmd("arrow lock");
    await s.clearCalls();
    await s.cmd("arrow move");
    expect((await s.calls()).filter((c) => c.startsWith(`${WINDOW}|SetSize`))).toEqual([]);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

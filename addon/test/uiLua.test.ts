import { expect, it } from "vitest";
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
    expect(await s.calls()).toContain("MinMaxQuestWindow|SetSize|270|262");
    const texts = await s.texts();
    expect(texts).toContain("MINMAXQUEST");
    expect(texts.slice(texts.indexOf("MINMAXQUEST"), texts.indexOf("MINMAXQUEST") + 4)).toEqual([
      "MINMAXQUEST", "Quest", "Access", "Completion",
    ]);
    expect(texts).toContain("Routes not installed - use Completion meanwhile");
    await s.cmd("");
    expect(await s.visibility()).toBe("MinMaxQuestWindow|Hide");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("switches the three tabs, resizing the window and saving the tab", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|300|480");
    expect(await s.run("return MinMaxQuestCharDB.tab")).toBe("completion");
    const texts = await s.texts();
    expect(texts).toContain("Elwynn Forest");
    expect(texts).toContain("0 / 2 quests");
    expect(texts).toContain("Test Quest");
    expect(texts).toContain("pick up · <1 min · 22 m");
    expect(texts).toContain("Eastern Kingdoms · 0 / 2");
    await s.click("MinMaxQuestTabaccess");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|320|420");
    expect(await s.texts()).toContain("Dalaran Sewers");
    await s.click("MinMaxQuestTabquest");
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|270|262");
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

it("changes Completion mode, zone and filters and unpins from the window", async () => {
  const s = await ui();
  const completion = () => s.run("local c = MinMaxQuestCharDB.completion; return { c.mode, c.zoneAreaId or 0, c.showTrivial, c.showElite }");
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    await s.click("MinMaxQuestCompletionMode");
    expect(await completion()).toEqual(["zone", 12, true, true]);
    await s.click("MinMaxQuestCompletionMode");
    expect(await completion()).toEqual(["proximity", 12, true, true]);
    await s.click("MinMaxQuestFilterGrey");
    await s.click("MinMaxQuestFilterElite");
    expect(await completion()).toEqual(["proximity", 12, false, false]);
    await s.run("MinMaxQuestCharDB.completion.zoneAreaId = nil");
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

it("expands a chain and tracks it from the Access tab", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabaccess");
    await s.click("MinMaxQuestChain1");
    expect(await s.run("return MinMaxQuestCharDB.expandedChain")).toBe("dalaran-sewers");
    await s.click("MinMaxQuestChain1Track");
    expect(await s.run("return MinMaxQuestCharDB.trackedChains[1]")).toBe("dalaran-sewers");
    expect(await s.texts()).toContain("1 chain tracked");
    await s.click("MinMaxQuestChain1");
    expect(await s.run("return MinMaxQuestCharDB.expandedChain == nil")).toBe(true);
    expect(await s.printed()).toBe("");
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

it("creates no frame, texture or font string when the engine redraws an open tab", async () => {
  const s = await ui();
  const created = async () => (await s.run("return created")) as number;
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    const before = await created();
    for (const x of [1500, 1800]) {
      await s.run(`player = { ${x}, 2000 }; now = now + 3`);
      await s.tick();
    }
    expect((await s.texts()).some((line) => line.startsWith("pick up · ") && line.endsWith(" · 790 m"))).toBe(true);
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

it("opens the zone picker when Zone mode has no zone to use", async () => {
  const s = await ui("C_Map.GetBestMapForUnit = function() return nil end");
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    await s.clearCalls();
    await s.click("MinMaxQuestCompletionMode");
    expect(await s.run("return MinMaxQuestCharDB.completion.mode")).toBe("proximity");
    expect(await s.visibilityOf("MinMaxQuestZonePicker")).toBe("MinMaxQuestZonePicker|Show");
  } finally {
    s.close();
  }
});

it("uppercases accented French labels", async () => {
  const s = await ui(`GetLocale = function() return "frFR" end`);
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabcompletion");
    expect(await s.texts()).toContain("RESTANT À PROXIMITÉ · 0");
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

it("refreshes the targets when a chain is tracked or untracked", async () => {
  const s = await ui(QUEST_MODE);
  const reads = async () => (await s.run("return raceCalls")) as number;
  try {
    await s.cmd("");
    await s.click("MinMaxQuestTabaccess");
    await s.click("MinMaxQuestChain1");
    const before = await reads();
    await s.click("MinMaxQuestChain1Track");
    expect(await reads()).toBe(before + 1);
    await s.click("MinMaxQuestChain1Track");
    expect(await reads()).toBe(before + 2);
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
  const s = await routeTab();
  try {
    await s.run("player = { 900000, 2000 }; now = now + 3");
    await s.tick();
    const before = await s.run("return #MinMaxQuestCharDB.route.skippedSteps + #MinMaxQuestCharDB.skippedQuests");
    await s.click("MinMaxQuestRouteSkip");
    expect(await s.run("return MinMaxQuestCharDB.skippedQuests[1]")).toBe(33);
    expect(before).toBe(0);
  } finally {
    s.close();
  }
});

it("fits eleven dungeons in the window and grows it only while the list is open", async () => {
  const s = await routeTab(`
    local text = MinMaxQuestRoutes.Alliance.returnBlocks[721]
    local blocks = {}
    for i = 1, 11 do blocks[5000 + i] = text end
    MinMaxQuestRoutes.Alliance.returnBlocks = blocks
  `);
  try {
    await s.click("MinMaxQuestSectionDungeons");
    const height = Number((await s.last("MinMaxQuestWindow|SetHeight|"))?.split("|")[2]);
    const calls = await s.calls();
    for (let i = 1; i <= 11; i++) {
      const name = `MinMaxQuestDungeon${5000 + i}`;
      const point = calls.filter((c) => c.startsWith(`${name}|SetPoint|`)).pop()?.split("|") ?? [];
      const size = calls.filter((c) => c.startsWith(`${name}|SetSize|`)).pop()?.split("|") ?? [];
      const [x, y, width, boxHeight] = [Number(point[5]), Number(point[6]), Number(size[2]), Number(size[3])];
      expect(x + width).toBeLessThanOrEqual(270);
      expect(50 - y + boxHeight).toBeLessThanOrEqual(height);
    }
    expect(height).toBeGreaterThan(262);
    await s.click("MinMaxQuestSectionOptions");
    expect(await s.last("MinMaxQuestWindow|SetHeight|")).toBe("MinMaxQuestWindow|SetHeight|262");
    await s.click("MinMaxQuestSectionDungeons");
    await s.click("MinMaxQuestTabcompletion");
    await s.click("MinMaxQuestTabquest");
    expect(await s.last("MinMaxQuestWindow|SetSize|")).toBe(`MinMaxQuestWindow|SetSize|270|${height}`);
  } finally {
    s.close();
  }
});

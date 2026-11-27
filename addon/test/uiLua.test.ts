import { expect, it } from "vitest";
import { loggedIn } from "./helpers/fakeGame";

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
  const visibility = async () =>
    (await s.calls()).filter((c) => c === "MinMaxQuestWindow|Show" || c === "MinMaxQuestWindow|Hide").pop();
  return { ...s, click, texts, last, visibility };
}

it("toggles the window with /mmq and opens the Quest tab by default", async () => {
  const s = await ui();
  try {
    await s.cmd("");
    expect(await s.visibility()).toBe("MinMaxQuestWindow|Show");
    expect(await s.calls()).toContain("MinMaxQuestWindow|SetSize|270|260");
    const texts = await s.texts();
    expect(texts).toContain("MINMAXQUEST");
    expect(texts.slice(texts.indexOf("MINMAXQUEST"), texts.indexOf("MINMAXQUEST") + 4)).toEqual([
      "MINMAXQUEST", "Quest", "Access", "Completion",
    ]);
    expect(texts).toContain("Routes not installed — use Completion meanwhile");
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
    expect(await s.last("MinMaxQuestWindow|SetSize")).toBe("MinMaxQuestWindow|SetSize|270|260");
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
    expect(texts).toContain("• Second (level 10)");
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
    await s.click("MinMaxQuestGap2");
    expect(await s.run("local d = MinMaxQuestCharDB; return { d.routeElites, d.routeDungeons, d.minLevelGap }")).toEqual([
      true, true, 2,
    ]);
    await s.click("MinMaxQuestGap0");
    expect(await s.run("return MinMaxQuestCharDB.minLevelGap == nil")).toBe(true);
    await s.click("MinMaxQuestOpenCompletion");
    expect(await s.run("return MinMaxQuestCharDB.tab")).toBe("completion");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

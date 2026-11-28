import { expect, it } from "vitest";
import { PROFESSIONS } from "../src/data/generated/professions";
import { loggedIn, QUEST_MODE, session } from "./helpers/fakeGame";

it("lists targets after login and points the arrow at the nearest", async () => {
  const s = await loggedIn();
  try {
    await s.cmd("targets");
    expect(await s.printed()).toBe(
      "MinMaxQuest: [100] Test Quest · pick up · <1 min\nMinMaxQuest: [101] Second · pick up · <1 min",
    );
    expect(await s.calls()).toContain("font|SetText|Test Quest · pick up");
    expect(await s.run("return ticker ~= nil")).toBe(true);
  } finally {
    s.close();
  }
});

it("skips, pins and unpins through slash commands", async () => {
  const s = await loggedIn();
  try {
    await s.cmd("pin 101");
    await s.cmd("targets");
    await s.printed();
    expect(await s.calls()).toContain("font|SetText|Second · pick up");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId")).toBe(101);
    await s.cmd("unpin");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
    await s.cmd("skip");
    expect(await s.printed()).toContain("[100] Test Quest");
    expect(await s.run("return MinMaxQuestCharDB.skippedQuests[1]")).toBe(100);
    await s.cmd("targets");
    expect(await s.printed()).toBe("MinMaxQuest: [101] Second · pick up · <1 min");
  } finally {
    s.close();
  }
});

it("coalesces quest log events into at most one forced refresh per tick", async () => {
  const s = await loggedIn();
  const reads = async () => (await s.run("return raceCalls")) as number;
  try {
    expect(await reads()).toBe(1);
    await s.run("logQuests = { 101 }; objectives[101] = { { finished = false } }");
    await s.event(`"QUEST_LOG_UPDATE"`);
    await s.tick();
    expect(await reads()).toBe(2);
    for (let i = 0; i < 5; i++) await s.event(`"QUEST_LOG_UPDATE"`);
    await s.tick();
    expect(await reads()).toBe(2);
    await s.run("objectives[101][1].finished = true");
    for (let i = 0; i < 3; i++) await s.event(`"QUEST_LOG_UPDATE"`);
    await s.tick();
    await s.tick();
    expect(await reads()).toBe(3);
  } finally {
    s.close();
  }
});

it("uses the level from PLAYER_LEVEL_UP on the next tick", async () => {
  const s = await loggedIn();
  try {
    await s.event(`"PLAYER_LEVEL_UP", 11`);
    await s.tick();
    await s.cmd("targets");
    expect(await s.printed()).toContain("[102] Later");
  } finally {
    s.close();
  }
});

it("asks to confirm a skip with follow-ups and forgets it when the target changes", async () => {
  const s = await session();
  try {
    await s.run("quests[100].nextQuestInChain = 101");
    await s.event(`"PLAYER_LOGIN"`);
    await s.tick();
    await s.cmd("skip");
    expect(await s.printed()).toBe(
      "MinMaxQuest: [100] Test Quest: 1 follow-up quest(s) would be lost (XP unknown): type /mmq skip confirm",
    );
    await s.cmd("pin 101");
    await s.cmd("skip confirm");
    expect(await s.run("return MinMaxQuestCharDB.skippedQuests[1]")).toBe(101);
  } finally {
    s.close();
  }
});

it("records the hearth landing position after a hearthstone cast", async () => {
  const s = await loggedIn();
  try {
    await s.event(`"UNIT_SPELLCAST_SUCCEEDED", "player", "guid", 8690`);
    await s.run("player = { 5000, 6000 }; now = 110");
    await s.event(`"PLAYER_ENTERING_WORLD"`);
    expect(await s.run("local h = MinMaxQuestCharDB.hearthPos; return { h.continent, h.x, h.y }")).toEqual([0, 5000, 6000]);
  } finally {
    s.close();
  }
});

it("refreshes after binding the hearthstone without moving", async () => {
  const s = await loggedIn();
  const reads = async () => (await s.run("return raceCalls")) as number;
  try {
    await s.run("now = 110");
    await s.tick();
    expect(await reads()).toBe(1);
    await s.event(`"HEARTHSTONE_BOUND"`);
    await s.tick();
    expect(await reads()).toBe(2);
  } finally {
    s.close();
  }
});

it("hides the arrow on a taxi and shows it again after landing", async () => {
  const s = await loggedIn();
  try {
    await s.clearCalls();
    await s.run("onTaxi = true");
    await s.tick();
    expect((await s.calls()).filter((c) => c.startsWith("MinMaxQuestArrow|")).pop()).toBe("MinMaxQuestArrow|Hide");
    await s.clearCalls();
    await s.run("onTaxi = false");
    await s.tick();
    expect(await s.calls()).toContain("font|SetText|Test Quest · pick up");
  } finally {
    s.close();
  }
});

it("prints the refresh durations", async () => {
  const s = await session();
  try {
    await s.cmd("debug prof");
    expect(await s.printed()).toBe("MinMaxQuest: no refresh measured yet");
    await s.event(`"PLAYER_LOGIN"`);
    await s.run("local n = 0; debugprofilestop = function() n = n + 1; return n * 2.5 end");
    await s.tick();
    await s.cmd("debug prof");
    expect(await s.printed()).toBe("MinMaxQuest: refresh: last 2.5 ms, first 2.5 ms");
  } finally {
    s.close();
  }
});

it("lists and re-activates skipped quests", async () => {
  const s = await loggedIn();
  try {
    await s.cmd("skipped");
    expect(await s.printed()).toBe("MinMaxQuest: no skipped quest");
    await s.cmd("skip");
    await s.cmd("pin 101");
    await s.cmd("skip");
    await s.printed();
    await s.cmd("skipped");
    expect(await s.printed()).toBe("MinMaxQuest: skipped quests: [100] Test Quest, [101] Second");
    await s.cmd("unskip 100");
    expect(await s.printed()).toBe("MinMaxQuest: re-activated: [100] Test Quest");
    await s.cmd("unskip 100");
    expect(await s.printed()).toBe("MinMaxQuest: [100] Test Quest is not skipped");
    await s.cmd("unskip");
    expect(await s.printed()).toBe("MinMaxQuest: usage: /mmq unskip <id>|all");
    await s.cmd("unskip all");
    expect(await s.printed()).toBe("MinMaxQuest: 1 quest(s) re-activated");
    await s.cmd("targets");
    expect(await s.printed()).toContain("[101] Second");
  } finally {
    s.close();
  }
});

it("unpins with a bare /mmq pin", async () => {
  const s = await loggedIn();
  try {
    await s.cmd("pin 101");
    await s.printed();
    await s.cmd("pin");
    expect(await s.printed()).toBe("MinMaxQuest: unpinned");
    expect(await s.run("return MinMaxQuestCharDB.pinnedQuestId == nil")).toBe(true);
  } finally {
    s.close();
  }
});

it("hides the arrow once the engine is disabled", async () => {
  const s = await loggedIn();
  try {
    await s.clearCalls();
    await s.run("UnitRace = function() error('race unavailable') end");
    await s.event(`"QUEST_ACCEPTED", 101`);
    await s.tick();
    expect(await s.printed()).toContain("MinMaxQuest: engine disabled:");
    expect((await s.calls()).filter((c) => c.startsWith("MinMaxQuestArrow|")).pop()).toBe("MinMaxQuestArrow|Hide");
    await s.tick();
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("prints the resolved chain", async () => {
  const s = await session();
  try {
    await s.run("quests[100].nextQuestInChain = 101");
    await s.cmd("chain 100");
    expect(await s.printed()).toBe("MinMaxQuest: [100] Test Quest > [101] Second");
  } finally {
    s.close();
  }
});

it("prints help and keeps the quest lookup", async () => {
  const s = await session();
  try {
    await s.cmd("help");
    expect(await s.printed()).toContain("targets | skip [confirm] | pin <id>");
    await s.cmd("q 100");
    expect(await s.printed()).toBe("MinMaxQuest: [100] Test Quest level 10, 0 objective(s)");
    await s.run(`LibQuestieDB.Quest.Get = function() error("broken") end`);
    await s.cmd("q 101");
    const out = await s.printed();
    expect(out).toContain("QuestieDB read failed (get)");
    expect(out).toContain("MinMaxQuest: quest not found");
    expect(out).toContain("last QuestieDB error: get:");
  } finally {
    s.close();
  }
});

it("numbers objectives like the quest log, ObjectiveFirst hints included", async () => {
  const s = await loggedIn(`
    quests[100].objectives = { { { 500 } }, nil, nil, nil, { { { 501 }, 501 } } }
    LibQuestieDB.ObjectiveFirst.killCreditObjectiveFirst[100] = true
    logQuests = { 100 }
    objectives[100] = { { finished = false }, { finished = true } }
  `);
  try {
    await s.cmd("pin 100");
    await s.cmd("targets");
    expect(await s.printed()).toContain("[100] Test Quest · objective 1");
    expect(await s.calls()).toContain("font|SetText|127 m");
  } finally {
    s.close();
  }
});

const ONLY_ELWYNN = `
local worldPos = C_Map.GetWorldPosFromMapPos
C_Map.GetWorldPosFromMapPos = function(map, v) if map == 1429 then return worldPos(map, v) end end
`;

it("decodes the QuestieDB zone map strings with the override on top", async () => {
  const s = await loggedIn(`${ONLY_ELWYNN}
zonePrivate.areaIdToUiMapId = "return { [12] = 9999 }"
zonePrivate.areaIdToUiMapIdOverride = "return { [12] = 1429 }"`);
  try {
    await s.cmd("targets");
    expect(await s.printed()).toBe(
      "MinMaxQuest: [100] Test Quest · pick up · <1 min\nMinMaxQuest: [101] Second · pick up · <1 min",
    );
  } finally {
    s.close();
  }
});

it("reports a zone map string that does not compile", async () => {
  const s = await loggedIn(`${ONLY_ELWYNN}
zonePrivate.areaIdToUiMapId = "return {"`);
  try {
    await s.cmd("targets");
    const printed = await s.printed();
    expect(printed).toContain("QuestieDB read failed (ZoneDB)");
    expect(printed).toContain("ZoneDB.private.areaIdToUiMapId does not compile");
    expect(printed).not.toContain("<1 min");
  } finally {
    s.close();
  }
});

it("points a level 1 human in quest mode at the first Elwynn step", async () => {
  const s = await loggedIn(QUEST_MODE);
  try {
    expect(await s.calls()).toContain("font|SetText|Wolves Across the Border · pick up");
    expect(await s.run("return MinMaxQuestCharDB.route.variant")).toMatch(/^e0d0x0:elwynn-forest:1@/);
    expect(await s.run("return MinMaxQuestCharDB.route.startIndex")).toBe(0);
    await s.printed();
    await s.cmd("targets");
    expect(await s.printed()).toContain("MinMaxQuest: [33] Wolves Across the Border · pick up");
  } finally {
    s.close();
  }
});

it("applies a variant change made in combat once combat ends", async () => {
  const s = await loggedIn(QUEST_MODE);
  const variant = async () => (await s.run("return MinMaxQuestCharDB.route.variant")) as string;
  try {
    await s.run("InCombatLockdown = function() return true end; MinMaxQuestCharDB.routeElites = true");
    await s.event(`"ZONE_CHANGED_NEW_AREA"`);
    await s.tick();
    expect(await variant()).toMatch(/^e0d0x0:/);
    await s.run("InCombatLockdown = function() return false end");
    await s.event(`"PLAYER_REGEN_ENABLED"`);
    await s.tick();
    expect(await variant()).toMatch(/^e1d0x0:elwynn-forest:1@/);
  } finally {
    s.close();
  }
});

// Design 2026-11-28-professions: The Love Potion without Herbalism buys its Gromsblood; with it, picks the herb.
const LOVE_POTION = `
quests[4201] = { name = "The Love Potion", questLevel = 10, requiredLevel = 1, zoneOrSort = 12, startedBy = { { 500 } }, finishedBy = { { 500 } }, objectives = { nil, nil, { { 8846, nil, 4 } } } }
LibQuestieDB.Quest.GetAllIds = function() return { 100, 101, 102, 4201 } end
items[8846] = { name = "Gromsblood", npcDrops = { 12258 }, objectDrops = { 142145 } }
spawns[12258] = { [12] = { { 50, 50 } } }
objectSpawns[142145] = { [12] = { { 30, 30 } } }
spawns[${PROFESSIONS.auctioneers.find((a) => a.faction === "A")?.npcId}] = { [12] = { { 70, 70 } } }
logQuests = { 4201 }
objectives[4201] = { { finished = false, numFulfilled = 1, numRequired = 4 } }
`;

it("sends a player without Herbalism to the auction house for Gromsblood, and one with it to the herb", async () => {
  const s = await loggedIn(LOVE_POTION);
  try {
    await s.cmd("pin 4201");
    await s.cmd("targets");
    expect(await s.printed()).toContain("[4201] The Love Potion · Buy Gromsblood ×3 at the Auction House");
    expect(await s.calls()).toContain("font|SetText|99 m");
    await s.clearCalls();
    await s.run(`knownSpells[${PROFESSIONS.skillSpells.herbalism[0]}] = true`);
    await s.event(`"SKILL_LINES_CHANGED"`);
    await s.tick();
    await s.cmd("targets");
    expect(await s.printed()).toContain("[4201] The Love Potion · objective 1");
    expect(await s.calls()).toContain("font|SetText|42 m");
  } finally {
    s.close();
  }
});

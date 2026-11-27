import { expect, it } from "vitest";
import { loggedIn, session } from "./helpers/fakeGame";

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

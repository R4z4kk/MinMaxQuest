import { afterEach, describe, expect, it } from "vitest";
import { hearthReady, readCompleted, readLog } from "../src/game/playerState";

type Objective = { finished: boolean };
const globals = globalThis as Record<string, unknown>;

function questLog(objectives: Record<number, Objective[] | null>, complete: number[] = []) {
  const ids = Object.keys(objectives).map(Number);
  globals.C_QuestLog = {
    GetNumQuestLogEntries: () => [ids.length + 1, ids.length],
    GetInfo: (index: number) => (index === 1 ? { questID: 0, isHeader: true } : { questID: ids[index - 2], isHeader: false }),
    GetQuestObjectives: (id: number) => objectives[id],
    IsComplete: (id: number) => complete.includes(id),
  };
}

afterEach(() => {
  delete globals.C_QuestLog;
  delete globals.GetQuestsCompleted;
  delete globals.C_Container;
  delete globals.C_Item;
  delete globals.GetItemCount;
  delete globals.GetItemCooldown;
  delete globals.GetTime;
});

describe("hearthReady", () => {
  const setup = (count: number, start: number) => {
    globals.GetTime = () => 100;
    globals.C_Container = { GetItemCooldown: () => [start, 3600, 1] };
    globals.C_Item = { GetItemCount: () => count };
  };

  it("needs a Hearthstone in the bags", () => {
    setup(0, 0);
    expect(hearthReady()).toBe(false);
    setup(1, 0);
    expect(hearthReady()).toBe(true);
  });

  it("is not ready while on cooldown", () => {
    setup(1, 50);
    expect(hearthReady()).toBe(false);
  });

  it("falls back to the global GetItemCount and fails loudly without any count API", () => {
    setup(1, 0);
    globals.C_Item = null;
    globals.GetItemCount = () => 1;
    expect(hearthReady()).toBe(true);
    globals.GetItemCount = null;
    globals.GetItemCooldown = () => [0, 0, 1];
    expect(() => hearthReady()).toThrow("no item-count API");
  });
});

describe("readLog", () => {
  it("records finished objective indexes and skips headers", () => {
    questLog({ 1: [{ finished: true }, { finished: false, numFulfilled: 6, numRequired: 10 }] });
    const log = readLog();
    expect([...log.ids]).toEqual([1]);
    expect(log.entries.get(1)).toEqual({
      complete: false,
      objectivesDone: new Set([1]),
      counts: [{ have: 0, need: 0 }, { have: 6, need: 10 }],
    });
  });

  it("is complete when every objective is finished or the game says so", () => {
    questLog({ 1: [{ finished: true }], 2: [{ finished: false }], 3: [] }, [2]);
    const log = readLog();
    expect(log.entries.get(1)?.complete).toBe(true);
    expect(log.entries.get(2)?.complete).toBe(true);
    expect(log.entries.get(3)?.complete).toBe(true);
  });

  it("does not infer completion when objectives are not loaded", () => {
    questLog({ 1: null, 2: null }, [2]);
    const log = readLog();
    expect(log.entries.get(1)?.complete).toBe(false);
    expect(log.entries.get(2)?.complete).toBe(true);
  });
});

describe("readCompleted", () => {
  it("reads all completed ids", () => {
    globals.C_QuestLog = { GetAllCompletedQuestIDs: () => [4, 5] };
    expect([...readCompleted()]).toEqual([4, 5]);
  });

  it("falls back to GetQuestsCompleted", () => {
    globals.C_QuestLog = {};
    globals.GetQuestsCompleted = () => ({ 7: true, 8: false });
    expect([...readCompleted()]).toEqual([7]);
  });

  it("throws without any completed-quest API", () => {
    globals.C_QuestLog = {};
    globals.GetQuestsCompleted = null;
    expect(() => readCompleted()).toThrow("no completed-quest API");
  });
});

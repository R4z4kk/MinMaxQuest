import { describe, expect, it } from "vitest";
import { loggedIn } from "./helpers/fakeGame";

// Thelsamar to a point near the Ironforge road, with both flight masters known: we walk (275 s), a flight is the other way.
const WALK_TRIP = `
player = { -5401.9, -2930 }
C_Map.GetWorldPosFromMapPos = function(map, v) needNumber("GetWorldPosFromMapPos", map) return 0, { x = -5121.85, y = -2042.7 } end
C_Map.GetMapPosFromWorldPos = function(continent, v, override) return 1432, { x = 0.5, y = 0.5 } end
MinMaxQuestCharDB = { knownTaxiNodes = { 8, 6 } }
estimateCalls = 0
estimateArgs = nil
function fakeSpf(version, ...)
  local answer = { ... }
  ShortestPathForever = { API = { version = version, Estimate = function(...)
    estimateCalls = estimateCalls + 1
    estimateArgs = { ... }
    return unpack(answer)
  end } }
end
`;

const WALK = "font|SetText|Test Quest · pick up";
const FLIGHT = "font|SetText|Go to the flight master";

async function arrowText(setup: string) {
  const s = await loggedIn(WALK_TRIP + setup);
  const calls = await s.calls();
  return { s, walks: calls.includes(WALK), flies: calls.includes(FLIGHT), estimates: (await s.run("return estimateCalls")) as number };
}

describe("Shortest Path Forever", () => {
  it("walks without SPF and never calls it", async () => {
    const { s, walks, flies, estimates } = await arrowText("");
    try {
      expect([walks, flies, estimates]).toEqual([true, false, 0]);
    } finally {
      s.close();
    }
  });

  it("ignores an unsupported API version", async () => {
    const { s, walks, flies, estimates } = await arrowText("fakeSpf(9, 900)");
    try {
      expect([walks, flies, estimates]).toEqual([true, false, 0]);
    } finally {
      s.close();
    }
  });

  it("points at the flight master when SPF finds the walk long", async () => {
    const { s, walks, flies, estimates } = await arrowText("fakeSpf(2, 900)");
    try {
      expect([walks, flies, estimates]).toEqual([false, true, 1]);
      expect(await s.run("return #estimateArgs")).toBe(6);
      expect(await s.run("return estimateArgs[1]")).toBe(1432);
    } finally {
      s.close();
    }
  });

  it("accepts API version 1", async () => {
    const { s, flies } = await arrowText("fakeSpf(1, 900)");
    try {
      expect(flies).toBe(true);
    } finally {
      s.close();
    }
  });

  it("keeps walking when SPF agrees", async () => {
    const { s, walks, flies, estimates } = await arrowText("fakeSpf(2, 260)");
    try {
      expect([walks, flies, estimates]).toEqual([true, false, 1]);
    } finally {
      s.close();
    }
  });

  it("points at the flight master when SPF finds no way on foot", async () => {
    const { s, flies } = await arrowText(`fakeSpf(2, nil, "unreachable")`);
    try {
      expect(flies).toBe(true);
    } finally {
      s.close();
    }
  });

  it("keeps walking in combat, loading or after an invalid trip, saying so once for invalid", async () => {
    for (const reason of ["combat", "loading", "invalid"]) {
      const { s, walks, flies } = await arrowText(`fakeSpf(2, nil, "${reason}")`);
      try {
        expect([reason, walks, flies]).toEqual([reason, true, false]);
        const printed = await s.printed();
        expect(printed.includes("refused") ).toBe(reason === "invalid");
      } finally {
        s.close();
      }
    }
  });

  it("asks at most once per refresh and not again for the same target while standing", async () => {
    const s = await loggedIn(`${WALK_TRIP}fakeSpf(2, 900)`);
    try {
      const calls = async () => (await s.run("return estimateCalls")) as number;
      expect(await calls()).toBe(1);
      await s.run("logQuests = { 101 }; objectives[101] = { { finished = false } }");
      await s.event(`"QUEST_LOG_UPDATE"`);
      await s.tick();
      expect(await calls()).toBe(1);
      await s.run("player = { -5401.9 + 100, -2930 }; now = now + 10");
      await s.tick();
      expect(await calls()).toBe(2);
    } finally {
      s.close();
    }
  });

  it("stays off after SPF raises an error, without touching the arrow", async () => {
    const { s, walks, estimates } = await arrowText(`ShortestPathForever = { API = { version = 2, Estimate = function() estimateCalls = estimateCalls + 1 error("boom") end } }`);
    try {
      expect([walks, estimates]).toEqual([true, 1]);
      expect(await s.printed()).toContain("spf disabled");
    } finally {
      s.close();
    }
  });
});

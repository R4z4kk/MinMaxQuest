import { expect, it } from "vitest";
import { corpseTarget, type CorpseDeps } from "../src/arrow/corpse";
import { loggedIn } from "./helpers/fakeGame";

const world = { continent: 0, x: 5, y: 6 };

function deps(over: Partial<CorpseDeps>): CorpseDeps {
  return {
    isDead: () => true,
    isGhost: () => true,
    corpseOnMap: () => null,
    playerMap: () => 10,
    parentMap: () => null,
    toWorld: () => world,
    ...over,
  };
}

it("is none when alive", () => {
  expect(corpseTarget(deps({ isDead: () => false }), "Your corpse")).toEqual({ kind: "none" });
});

it("is atBody when dead but not yet a ghost, without looking up the corpse", () => {
  const result = corpseTarget(
    deps({ isGhost: () => false, corpseOnMap: () => { throw new Error("lookup"); } }),
    "Your corpse",
  );
  expect(result).toEqual({ kind: "atBody" });
});

it("targets the corpse on the player map", () => {
  const result = corpseTarget(deps({ corpseOnMap: (id) => (id === 10 ? { x: 0.5, y: 0.25 } : null) }), "Your corpse");
  expect(result).toEqual({ kind: "corpse", target: { pos: world, label: "Your corpse" } });
});

it("falls back to the parent map", () => {
  const seen: number[] = [];
  const result = corpseTarget(
    deps({
      parentMap: () => 20,
      corpseOnMap: (id) => (id === 20 ? { x: 0.1, y: 0.2 } : null),
      toWorld: (id, x, y) => {
        seen.push(id, x, y);
        return world;
      },
    }),
    "Your corpse",
  );
  expect(result.kind).toBe("corpse");
  expect(seen).toEqual([20, 10, 20]);
});

it("is unknown when no map has a corpse or the position cannot convert", () => {
  expect(corpseTarget(deps({ parentMap: () => 20 }), "x")).toEqual({ kind: "unknown" });
  expect(corpseTarget(deps({ playerMap: () => null }), "x")).toEqual({ kind: "unknown" });
  expect(corpseTarget(deps({ corpseOnMap: () => ({ x: 0.1, y: 0.2 }), toWorld: () => null }), "x")).toEqual({ kind: "unknown" });
});

it("reuses the same target object while the corpse does not move", () => {
  const d = deps({ corpseOnMap: () => ({ x: 0.1, y: 0.2 }) });
  const a = corpseTarget(d, "Your corpse");
  const b = corpseTarget(d, "Your corpse");
  expect(a.kind === "corpse" && b.kind === "corpse" && a.target === b.target).toBe(true);
});

const DEAD = `
dead = true
C_Map.GetBestMapForUnit = function() return 1429 end
C_Map.GetMapInfo = function() return nil end
UnitIsDeadOrGhost = function() return dead end
ghost = true
UnitIsGhost = function() return ghost end
corpse = { x = 0.5, y = 0.5 }
C_DeathInfo = { GetCorpseMapPosition = function(id) if id == 1429 then return corpse or nil end end }
`;

it("labels the arrow Your corpse when dead, and goes back after release", async () => {
  const s = await loggedIn(`${DEAD}\ndead = false`);
  try {
    await s.run("dead = true");
    await s.event(`"PLAYER_DEAD"`);
    await s.clearCalls();
    await s.tick();
    expect(await s.calls()).toContain("font|SetText|Your corpse");
    await s.run("dead = false");
    await s.event(`"PLAYER_ALIVE"`);
    await s.clearCalls();
    await s.tick();
    expect(await s.calls()).toContain("font|SetText|Test Quest · pick up");
  } finally {
    s.close();
  }
});

it("hides the arrow silently when dead but not released", async () => {
  const s = await loggedIn(`${DEAD}
dead = false
corpse = false`);
  try {
    await s.run("dead = true; ghost = false");
    await s.event(`"PLAYER_DEAD"`);
    await s.clearCalls();
    await s.tick();
    expect((await s.calls()).filter((c) => c.startsWith("MinMaxQuestArrow|")).pop()).toBe("MinMaxQuestArrow|Hide");
    expect(await s.printed()).toBe("");
    await s.run("ghost = true; corpse = { x = 0.5, y = 0.5 }");
    await s.event(`"PLAYER_UNGHOST"`);
    await s.clearCalls();
    await s.tick();
    expect(await s.calls()).toContain("font|SetText|Your corpse");
  } finally {
    s.close();
  }
});

it("hides the arrow and reports once when the corpse is unknown", async () => {
  const s = await loggedIn(`${DEAD}\ncorpse = false\ndead = false`);
  try {
    await s.run("dead = true");
    await s.event(`"PLAYER_DEAD"`);
    await s.clearCalls();
    await s.tick();
    await s.tick();
    expect((await s.calls()).filter((c) => c.startsWith("MinMaxQuestArrow|")).pop()).toBe("MinMaxQuestArrow|Hide");
    expect(await s.printed()).toBe("MinMaxQuest: corpse position unknown");
  } finally {
    s.close();
  }
});

import { expect, it } from "vitest";
import { loggedIn } from "./helpers/fakeGame";

const FAKES = `
C_Map.GetWorldPosFromMapPos = function() return 0, { x = -10600, y = 1036 } end
player = { -8830, 480 }
Enum = { UIMapType = { Continent = 2 }, FlightPathState = { Current = 0, Reachable = 1, Unreachable = 2 } }
shift = false
IsShiftKeyDown = function() return shift end
taken = {}
TakeTaxiNode = function(slot) table.insert(taken, slot) end
GetTaxiMapID = function() return 1414 end
mapNodes = {
  { nodeID = 2, slotIndex = 1, state = 0, name = "Stormwind, Elwynn" },
  { nodeID = 6, slotIndex = 2, state = 2, name = "Ironforge, Dun Morogh" },
  { nodeID = 4, slotIndex = 3, state = 1, name = "Sentinel Hill, Westfall" },
}
C_TaxiMap = { GetAllTaxiNodes = function() return mapNodes end }
`;

async function fly(setup = "") {
  const s = await loggedIn(FAKES + setup);
  const open = () => s.run(`scripts["MinMaxQuestTaxi.OnEvent"](nil, "TAXIMAP_OPENED")`);
  const taken = async () => (await s.run(`return table.concat(taken, ",")`)) as string;
  return { ...s, open, taken };
}

it("records reachable and current nodes with their names", async () => {
  const s = await fly();
  try {
    await s.open();
    expect(await s.run(`return table.concat(MinMaxQuestCharDB.knownTaxiNodes, ",")`)).toBe("2,4");
    expect(await s.run(`return MinMaxQuestCharDB.taxiNames[4]`)).toBe("Sentinel Hill, Westfall");
    await s.open();
    expect(await s.run(`return #MinMaxQuestCharDB.knownTaxiNodes`)).toBe(2);
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("takes the slot of the planned destination", async () => {
  const s = await fly();
  try {
    await s.open();
    expect(await s.taken()).toBe("3");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("does not fly while Shift is held", async () => {
  const s = await fly("shift = true");
  try {
    await s.open();
    expect(await s.taken()).toBe("");
    expect(await s.run(`return #MinMaxQuestCharDB.knownTaxiNodes`)).toBe(2);
  } finally {
    s.close();
  }
});

it("does not fly when the option is off", async () => {
  const s = await fly("MinMaxQuestCharDB.autoFly = false");
  try {
    await s.open();
    expect(await s.taken()).toBe("");
  } finally {
    s.close();
  }
});

it("does not fly from another flight master", async () => {
  const s = await fly();
  try {
    await s.open();
    await s.run(`taken = {}; mapNodes[1].state = 1; mapNodes[3].state = 0`);
    await s.open();
    expect(await s.taken()).toBe("");
    expect(await s.printed()).toBe("");
  } finally {
    s.close();
  }
});

it("prints once and does not fly when the destination is not available", async () => {
  const s = await fly();
  try {
    await s.open();
    await s.run(`taken = {}; mapNodes[3].state = 2`);
    await s.open();
    expect(await s.taken()).toBe("");
    expect(await s.printed()).toBe("MinMaxQuest: flight destination not available from this flight master");
  } finally {
    s.close();
  }
});

it("falls back to slot names when the taxi map API returns nothing", async () => {
  const s = await fly(`
    C_TaxiMap = { GetAllTaxiNodes = function() return nil end }
    local types = { "CURRENT", "DISTANT", "REACHABLE" }
    local names = { "Stormwind, Elwynn", "Ironforge, Dun Morogh", "Sentinel Hill, Westfall" }
    NumTaxiNodes = function() return 3 end
    TaxiNodeName = function(i) return names[i] end
    TaxiNodeGetType = function(i) return types[i] end
  `);
  try {
    await s.open();
    expect(await s.run(`return table.concat(MinMaxQuestCharDB.knownTaxiNodes, ",")`)).toBe("2,4");
    expect(await s.taken()).toBe("3");
  } finally {
    s.close();
  }
});

it("matches localized names learned earlier, ignoring accents and case", async () => {
  const s = await fly(`
    MinMaxQuestCharDB = { taxiNames = { [2] = "Hurlevent, Élwynn", [4] = "Colline de la Sentinelle, Marche de l'Ouest" } }
    C_TaxiMap = { GetAllTaxiNodes = function() return nil end }
    local types = { "REACHABLE", "CURRENT", "DISTANT" }
    local names = { "Colline de la Sentinelle, Marche de l'Ouest", "HURLEVENT, ÉLWYNN", "Forgefer, Dun Morogh" }
    NumTaxiNodes = function() return 3 end
    TaxiNodeName = function(i) return names[i] end
    TaxiNodeGetType = function(i) return types[i] end
  `);
  try {
    await s.open();
    expect(await s.run(`return table.concat(MinMaxQuestCharDB.knownTaxiNodes, ",")`)).toBe("4,2");
    expect(await s.taken()).toBe("1");
  } finally {
    s.close();
  }
});

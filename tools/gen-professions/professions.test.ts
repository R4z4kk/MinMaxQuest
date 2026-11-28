import { describe, expect, it } from "vitest";
import { PROFESSIONS } from "../../addon/src/data/generated/professions";
import { snapshot } from "../route-builder/test/fixtures";
import { buildProfessions, type ProfessionInputs } from "./professions";

const HERBALISM = 182;
const MINING = 186;
const ALCHEMY = 171;
const SKINNING = 393;
const FISHING = 356;
const ALCHEMY_CHILD = 2937;

const csv = (rows: Record<string, string | number>[]): Record<string, string>[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)])));

function line(id: number, name: string, parent = 0): Record<string, string | number> {
  return { ID: id, DisplayName_lang: name, ParentSkillLineID: parent };
}

function lock(id: number, type: number, index: number): Record<string, string | number> {
  const row: Record<string, string | number> = { ID: id };
  for (let i = 0; i < 8; i++) {
    row[`Type_${i}`] = i === 0 ? type : 0;
    row[`_Index_${i}`] = i === 0 ? index : 0;
  }
  return row;
}

function effect(spell: number, kind: number, item: number, misc: number): Record<string, string | number> {
  return { SpellID: spell, Effect: kind, EffectItemType: item, EffectMiscValue_0: misc };
}

function inputs(overrides: Partial<ProfessionInputs> = {}): ProfessionInputs {
  const names = ["Herbalism", "Mining", "Skinning", "Fishing", "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring", "Cooking", "First Aid"];
  const ids = [HERBALISM, MINING, SKINNING, FISHING, ALCHEMY, 164, 333, 202, 165, 197, 185, 129];
  return {
    skillLines: csv([...names.map((name, i) => line(ids[i], name)), line(ALCHEMY_CHILD, "Alchemy", ALCHEMY), line(6, "Frost")]),
    abilities: csv([
      { SkillLine: HERBALISM, Spell: 2366 },
      { SkillLine: HERBALISM, Spell: 2368 },
      { SkillLine: MINING, Spell: 2575 },
      { SkillLine: MINING, Spell: 2657 },
      { SkillLine: ALCHEMY, Spell: 2259 },
      { SkillLine: ALCHEMY_CHILD, Spell: 3170 },
      { SkillLine: SKINNING, Spell: 8613 },
      { SkillLine: FISHING, Spell: 7620 },
      { SkillLine: 6, Spell: 587 },
    ]),
    effects: csv([
      effect(2366, 33, 0, 2),
      effect(2366, 118, 0, HERBALISM),
      effect(2368, 118, 0, HERBALISM),
      effect(2575, 33, 0, 3),
      effect(2575, 118, 0, MINING),
      effect(2657, 24, 2840, 0),
      effect(2259, 118, 0, ALCHEMY),
      effect(3170, 24, 3382, 0),
      effect(8613, 118, 0, SKINNING),
      effect(7620, 118, 0, FISHING),
      effect(587, 24, 5349, 0),
    ]),
    locks: csv([lock(29, 2, 2), lock(38, 2, 3), lock(57, 1, 0)]),
    gameObjects: [
      { entry: 142145, type: 3, data0: 29, name: "Gromsblood" },
      { entry: 1731, type: 3, data0: 38, name: "Copper Vein" },
      { entry: 2843, type: 3, data0: 57, name: "Battered Chest" },
    ],
    creatures: [
      { entry: 1, skinningLootId: 100 },
      { entry: 2, skinningLootId: 0 },
    ],
    skinningLoot: [{ entry: 100, item: 0, ref: 500 }],
    fishingLoot: [{ entry: 1, item: 6303, ref: 0 }],
    referenceLoot: [{ entry: 500, item: 2318, ref: 0 }],
    bonding: new Map([[8846, 0], [2770, 0], [2840, 0], [3382, 0], [2318, 0], [6303, 0], [2589, 0], [11405, 4], [5349, 0], [7000, 1], [723, 0], [769, 0]]),
    tbcSubclasses: new Map([[2589, 5], [7000, 5], [723, 8], [769, 8], [2318, 6], [8846, 9]]),
    snapshot: snapshot({
      quests: {
        4201: { name: "The Love Potion", objectives: [null, null, [[8846, null, 4], [11405, null, 1]]] },
        1: { name: "Ores", objectives: [null, null, [[2770, null, 10], [2840, null, 5], [3382, null, 2]]] },
        2: { name: "Hides", objectives: [null, null, [[2318, null, 6], [6303, null, 3], [2589, null, 2], [5349, null, 1], [7000, null, 1], [723, null, 8], [769, null, 4]]] },
      },
      items: {
        8846: { name: "Gromsblood", class: 7, npcDrops: [12258], objectDrops: [142145, 657382, 657383] },
        11405: { name: "Giant Silver Vein", class: 12, npcDrops: [9], objectDrops: [] },
        2770: { name: "Copper Ore", class: 7, npcDrops: [], objectDrops: [1731, 2843] },
        2840: { name: "Copper Bar", class: 7, npcDrops: [], objectDrops: [] },
        3382: { name: "Weak Troll's Blood Potion", class: 0, npcDrops: [], objectDrops: [] },
        2318: { name: "Light Leather", class: 7, npcDrops: [], objectDrops: [] },
        6303: { name: "Raw Slitherskin Mackerel", class: 0, npcDrops: [], objectDrops: [] },
        2589: { name: "Linen Cloth", class: 7, npcDrops: [3], objectDrops: [2843] },
        5349: { name: "Conjured Muffin", class: 0, npcDrops: [], objectDrops: [] },
        7000: { name: "Bound Cloth", class: 7, npcDrops: [4], objectDrops: [] },
        723: { name: "Goretusk Liver", class: 7, npcDrops: [157], objectDrops: [] },
        769: { name: "Chunk of Boar Meat", class: 7, npcDrops: [113], objectDrops: [] },
      },
      npcs: {
        15659: { name: "Auctioneer Jaxon", spawns: { 1519: [[61, 70]] }, rank: 0, friendlyToFaction: "A", minLevel: 40, maxLevel: 40, npcFlags: 4096 + 1 },
        8670: { name: "Auctioneer Chilton", spawns: { 1519: [[61, 71]] }, rank: 0, friendlyToFaction: null, minLevel: 40, maxLevel: 40, npcFlags: 4096 },
        9999: { name: "Hidden Auctioneer", spawns: null, rank: 0, friendlyToFaction: "H", minLevel: 40, maxLevel: 40, npcFlags: 4096 },
        12258: { name: "Razorlash", spawns: { 405: [[50, 50]] }, rank: 0, friendlyToFaction: null, minLevel: 40, maxLevel: 40, npcFlags: 0 },
      },
      npcFlagValues: { innkeeper: 128, flightMaster: 8, auctioneer: 4096 },
    }),
    ...overrides,
  };
}

describe("buildProfessions", () => {
  it("marks an herb gathered from a herbalism node and ignores its mob drop", () => {
    const { data } = buildProfessions(inputs());
    expect(data.items[8846]).toEqual({ gather: ["herbalism"], craft: [], cloth: false });
    expect(data.nodes[142145]).toBe("herbalism");
  });

  it("classifies a node unknown to cmangos by the name of a cmangos node", () => {
    const base = inputs();
    const objects = { 657382: { name: "Gromsblood", spawns: null }, 657383: { name: "Dented Chest", spawns: null } };
    const { data, notes } = buildProfessions({ ...base, snapshot: { ...base.snapshot, objects } });
    expect(data.nodes[657382]).toBe("herbalism");
    expect(data.nodes[657383]).toBeUndefined();
    expect(notes.nodesByName).toEqual([657382]);
  });

  it("leaves a non-profession item out", () => {
    expect(buildProfessions(inputs()).data.items[11405]).toBeUndefined();
  });

  it("finds ores, smelted bars and potions crafted through a child skill line", () => {
    const { data } = buildProfessions(inputs());
    expect(data.items[2770]).toEqual({ gather: ["mining"], craft: [], cloth: false });
    expect(data.nodes[1731]).toBe("mining");
    expect(data.nodes[2843]).toBeUndefined();
    expect(data.items[2840]).toEqual({ gather: [], craft: ["mining"], cloth: false });
    expect(data.items[3382]).toEqual({ gather: [], craft: ["alchemy"], cloth: false });
  });

  it("resolves skinning and fishing loot through reference tables", () => {
    const { data } = buildProfessions(inputs());
    expect(data.items[2318]).toEqual({ gather: ["skinning"], craft: [], cloth: false });
    expect(data.skinned[2318]).toEqual([1]);
    expect(data.items[6303]).toEqual({ gather: ["fishing"], craft: [], cloth: false });
  });

  it("keeps cloth without a gathering or craft source and ignores other skill lines", () => {
    const { data } = buildProfessions(inputs());
    expect(data.items[2589]).toEqual({ gather: [], craft: [], cloth: true });
    expect(data.items[5349]).toBeUndefined();
  });

  it("leaves other trade goods without a gathering or craft source out: mob meat is no profession item", () => {
    const { data } = buildProfessions(inputs());
    expect(data.items[723]).toBeUndefined();
    expect(data.items[769]).toBeUndefined();
  });

  it("leaves bound items out: they cannot be bought", () => {
    const { data, notes } = buildProfessions(inputs());
    expect(data.items[7000]).toBeUndefined();
    expect(notes.bound).toEqual([7000]);
  });

  it("lists auctioneers with spawns, nil friendlyToFaction as both factions", () => {
    const { data, notes } = buildProfessions(inputs());
    expect(data.auctioneers).toEqual([
      { npcId: 8670, faction: "AH" },
      { npcId: 15659, faction: "A" },
    ]);
    expect(notes.auctioneersWithoutSpawns).toEqual([9999]);
  });

  it("derives the rank spells of each profession from SkillLineAbility and the skill effect", () => {
    const { data } = buildProfessions(inputs());
    expect(data.skillSpells.herbalism).toEqual([2366, 2368]);
    expect(data.skillSpells.alchemy).toEqual([2259]);
    expect(data.skillSpells.tailoring).toEqual([]);
  });

  it("fails loudly when a profession skill line is missing", () => {
    const base = inputs();
    expect(() => buildProfessions({ ...base, skillLines: base.skillLines.filter((r) => r.DisplayName_lang !== "Tailoring") })).toThrow("Tailoring");
  });

  it("reports and leaves out an item without a known bonding", () => {
    const base = inputs();
    const bonding = new Map(base.bonding);
    bonding.delete(2318);
    const { notes, data } = buildProfessions({ ...base, bonding });
    expect(data.items[2318]).toBeUndefined();
    expect(notes.unknownBonding).toEqual([2318]);
  });
});

describe("generated professions", () => {
  it("makes Gromsblood a herbalism resource and Giant Silver Vein no profession item", () => {
    expect(PROFESSIONS.items[8846].gather).toContain("herbalism");
    expect(PROFESSIONS.items[11405]).toBeUndefined();
  });

  it("leaves raw meat and animal parts out and keeps cloth to buy", () => {
    expect(PROFESSIONS.items[723]).toBeUndefined();
    expect(PROFESSIONS.items[769]).toBeUndefined();
    expect(PROFESSIONS.items[2589]).toEqual({ gather: [], craft: [], cloth: true });
    expect(PROFESSIONS.items[4306]).toEqual({ gather: [], craft: [], cloth: true });
  });

  it("knows a crafted item and a skinned one", () => {
    expect(PROFESSIONS.items[2840]?.craft).toContain("mining");
    expect(PROFESSIONS.items[2318]?.gather).toContain("skinning");
    expect(PROFESSIONS.skinned[2318]?.length).toBeGreaterThan(0);
  });

  it("has rank spells for every profession and auctioneers for both factions", () => {
    for (const spells of Object.values(PROFESSIONS.skillSpells)) expect(spells.length).toBeGreaterThan(0);
    expect(PROFESSIONS.auctioneers.some((a) => a.faction !== "H")).toBe(true);
    expect(PROFESSIONS.auctioneers.some((a) => a.faction !== "A")).toBe(true);
  });
});

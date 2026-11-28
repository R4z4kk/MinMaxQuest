import type { ProfessionData, ProfessionItem, Skill } from "../../addon/src/data/generated/professions";
import type { QuestieSnapshot } from "../route-builder/ingest/snapshot";

type CsvRow = Record<string, string>;

export interface LootRow {
  entry: number;
  item: number;
  // reference_loot_template entry when mincountOrRef < 0, else 0.
  ref: number;
}

export interface ProfessionInputs {
  skillLines: CsvRow[];
  abilities: CsvRow[];
  effects: CsvRow[];
  locks: CsvRow[];
  gameObjects: { entry: number; type: number; data0: number; name: string }[];
  creatures: { entry: number; skinningLootId: number }[];
  skinningLoot: LootRow[];
  fishingLoot: LootRow[];
  referenceLoot: LootRow[];
  bonding: Map<number, number>;
  snapshot: QuestieSnapshot;
}

export interface ProfessionNotes {
  objectiveItems: number;
  bound: number[];
  unknownBonding: number[];
  auctioneersWithoutSpawns: number[];
  neutralAuctioneers: number[];
  droppedObjects: { itemId: number; objects: number[] }[];
  // QuestieDB objects absent from cmangos, named like a cmangos node (Forever re-spawned nodes).
  nodesByName: number[];
  lockTypes: Record<string, Skill>;
}

export const SKILL_NAMES: Record<Skill, string> = {
  herbalism: "Herbalism",
  mining: "Mining",
  skinning: "Skinning",
  fishing: "Fishing",
  alchemy: "Alchemy",
  blacksmithing: "Blacksmithing",
  enchanting: "Enchanting",
  engineering: "Engineering",
  leatherworking: "Leatherworking",
  tailoring: "Tailoring",
  cooking: "Cooking",
  firstAid: "First Aid",
};
const SKILLS = Object.keys(SKILL_NAMES) as Skill[];

// cmangos classic SharedDefines.h: SPELL_EFFECT_CREATE_ITEM, SPELL_EFFECT_OPEN_LOCK, SPELL_EFFECT_SKILL;
// LockKeyType LOCK_KEY_SKILL; GAMEOBJECT_TYPE_CHEST; ITEM_CLASS_TRADE_GOODS. Checked against the data in professions.test.ts.
const EFFECT_CREATE_ITEM = 24;
const EFFECT_OPEN_LOCK = 33;
const EFFECT_SKILL = 118;
const LOCK_KEY_SKILL = 2;
const GAMEOBJECT_CHEST = 3;
const LOCK_SLOTS = 8;
const TRADE_GOODS = 7;
// cmangos item_template.bonding: 1 = bind on pickup, 4 = quest item (https://github.com/cmangos/issues/wiki/Item_template#bonding).
const BOUND = new Set([1, 4]);
// QuestieDB objectives: [creatures, objects, items, reputation, kill credits, spells]; each item entry is [id, text, count].
const ITEM_OBJECTIVES = 2;

function int(row: CsvRow, column: string, label: string): number {
  const value = Number(row[column]);
  if (row[column] == null || row[column].trim() === "" || !Number.isInteger(value)) throw new Error(`${label}: no integer ${column} in ${JSON.stringify(row).slice(0, 120)}`);
  return value;
}

function add<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (set == null) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function sorted(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

function inOrder(skills: Set<Skill> | null): Skill[] {
  return skills == null ? [] : SKILLS.filter((skill) => skills.has(skill));
}

export function objectiveItems(s: QuestieSnapshot): number[] {
  const ids = new Set<number>();
  for (const quest of Object.values(s.quests)) {
    const objectives = quest.objectives;
    const items = Array.isArray(objectives) ? (objectives as unknown[])[ITEM_OBJECTIVES] : null;
    if (!Array.isArray(items)) continue;
    for (const entry of items as unknown[]) {
      const id = Array.isArray(entry) ? (entry as unknown[])[0] : null;
      if (typeof id === "number") ids.add(id);
    }
  }
  return sorted(ids);
}

// Profession skill lines: the top-level line named after each profession, plus its child lines.
function skillOfLines(rows: CsvRow[]): Map<number, Skill> {
  const out = new Map<number, Skill>();
  for (const skill of SKILLS) {
    const tops = rows.filter((r) => r.DisplayName_lang === SKILL_NAMES[skill] && int(r, "ParentSkillLineID", "SkillLine") === 0);
    if (tops.length !== 1) throw new Error(`SkillLine: ${tops.length} top-level lines named ${SKILL_NAMES[skill]}`);
    const top = int(tops[0], "ID", "SkillLine");
    out.set(top, skill);
    for (const r of rows) if (int(r, "ParentSkillLineID", "SkillLine") === top) out.set(int(r, "ID", "SkillLine"), skill);
  }
  return out;
}

function lootItems(rows: LootRow[], references: Map<number, LootRow[]>): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const expand = (entry: number, row: LootRow, seen: Set<number>): void => {
    if (row.ref === 0) {
      add(out, entry, row.item);
      return;
    }
    if (seen.has(row.ref)) throw new Error(`reference_loot_template: cycle through ${row.ref}`);
    const refRows = references.get(row.ref);
    if (refRows == null) throw new Error(`reference_loot_template: no entry ${row.ref}`);
    const next = new Set(seen).add(row.ref);
    for (const r of refRows) expand(entry, r, next);
  };
  for (const row of rows) expand(row.entry, row, new Set());
  return out;
}

export function buildProfessions(input: ProfessionInputs): { data: Omit<ProfessionData, "source">; notes: ProfessionNotes } {
  const s = input.snapshot;
  const lineSkill = skillOfLines(input.skillLines);
  const spellSkill = new Map<number, Skill>();
  for (const r of input.abilities) {
    const skill = lineSkill.get(int(r, "SkillLine", "SkillLineAbility"));
    if (skill != null) spellSkill.set(int(r, "Spell", "SkillLineAbility"), skill);
  }

  const skillSpells = new Map<Skill, Set<number>>();
  const lockTypes = new Map<number, Skill>();
  const crafts = new Map<number, Set<Skill>>();
  for (const r of input.effects) {
    const spell = int(r, "SpellID", "SpellEffect");
    const skill = spellSkill.get(spell);
    if (skill == null) continue;
    const kind = int(r, "Effect", "SpellEffect");
    if (kind === EFFECT_SKILL && lineSkill.get(int(r, "EffectMiscValue_0", "SpellEffect")) === skill) add(skillSpells, skill, spell);
    if (kind === EFFECT_CREATE_ITEM) add(crafts, int(r, "EffectItemType", "SpellEffect"), skill);
  }
  for (const r of input.effects) {
    const spell = int(r, "SpellID", "SpellEffect");
    const skill = spellSkill.get(spell);
    if (skill == null || int(r, "Effect", "SpellEffect") !== EFFECT_OPEN_LOCK || !skillSpells.get(skill)?.has(spell)) continue;
    const type = int(r, "EffectMiscValue_0", "SpellEffect");
    const known = lockTypes.get(type);
    if (known != null && known !== skill) throw new Error(`SpellEffect: lock type ${type} opened by ${known} and ${skill}`);
    lockTypes.set(type, skill);
  }
  for (const skill of ["herbalism", "mining"] as const) {
    if (![...lockTypes.values()].includes(skill)) throw new Error(`SpellEffect: no lock type opened by the ${skill} rank spells`);
  }

  const lockSkill = new Map<number, Skill>();
  for (const r of input.locks) {
    for (let i = 0; i < LOCK_SLOTS; i++) {
      if (int(r, `Type_${i}`, "Lock") !== LOCK_KEY_SKILL) continue;
      const skill = lockTypes.get(int(r, `_Index_${i}`, "Lock"));
      if (skill != null) lockSkill.set(int(r, "ID", "Lock"), skill);
    }
  }
  const objectSkill = new Map<number, Skill>();
  const cmangosObjects = new Set<number>();
  const nameSkill = new Map<string, Skill | null>();
  for (const o of input.gameObjects) {
    cmangosObjects.add(o.entry);
    const skill = o.type === GAMEOBJECT_CHEST ? lockSkill.get(o.data0) : null;
    if (skill == null) continue;
    objectSkill.set(o.entry, skill);
    const named = nameSkill.has(o.name) ? nameSkill.get(o.name) : skill;
    nameSkill.set(o.name, named === skill ? skill : null);
  }
  const byName: number[] = [];
  const nodeSkill = (objectId: number): Skill | null => {
    const known = objectSkill.get(objectId);
    if (known != null || cmangosObjects.has(objectId)) return known ?? null;
    const name = s.objects[objectId]?.name;
    const skill = name == null ? null : (nameSkill.get(name) ?? null);
    if (skill != null && !byName.includes(objectId)) byName.push(objectId);
    return skill;
  };

  const references = new Map<number, LootRow[]>();
  for (const r of input.referenceLoot) references.set(r.entry, [...(references.get(r.entry) ?? []), r]);
  const skinLoot = lootItems(input.skinningLoot, references);
  const fished = new Set<number>();
  for (const items of lootItems(input.fishingLoot, references).values()) for (const item of items) fished.add(item);
  const skinners = new Map<number, Set<number>>();
  for (const c of input.creatures) {
    if (c.skinningLootId === 0) continue;
    for (const item of skinLoot.get(c.skinningLootId) ?? []) add(skinners, item, c.entry);
  }

  const items: Record<number, ProfessionItem> = {};
  const nodes: Record<number, Skill> = {};
  const skinned: Record<number, number[]> = {};
  const notes: ProfessionNotes = {
    objectiveItems: 0,
    bound: [],
    unknownBonding: [],
    auctioneersWithoutSpawns: [],
    neutralAuctioneers: [],
    droppedObjects: [],
    nodesByName: byName,
    lockTypes: Object.fromEntries([...lockTypes].map(([type, skill]) => [String(type), skill])),
  };
  const ids = objectiveItems(s);
  notes.objectiveItems = ids.length;
  for (const id of ids) {
    const item = s.items[id];
    const objects = item?.objectDrops ?? [];
    const gather = new Set<Skill>();
    for (const o of objects) {
      const skill = nodeSkill(o);
      if (skill != null) gather.add(skill);
    }
    if (skinners.has(id)) gather.add("skinning");
    if (fished.has(id)) gather.add("fishing");
    const craft = inOrder(crafts.get(id) ?? null);
    const tradeGood = item?.class === TRADE_GOODS;
    if (gather.size === 0 && craft.length === 0 && !tradeGood) continue;
    const bonding = input.bonding.get(id);
    if (bonding == null) {
      notes.unknownBonding.push(id);
      continue;
    }
    if (BOUND.has(bonding)) {
      notes.bound.push(id);
      continue;
    }
    items[id] = { gather: inOrder(gather), craft, tradeGood };
    const dropped: number[] = [];
    for (const o of objects) {
      const skill = nodeSkill(o);
      if (skill != null) nodes[o] = skill;
      else dropped.push(o);
    }
    if (dropped.length > 0) notes.droppedObjects.push({ itemId: id, objects: dropped });
    const creatures = skinners.get(id);
    if (creatures != null) skinned[id] = sorted(creatures);
  }

  const auctioneers: ProfessionData["auctioneers"] = [];
  for (const key of Object.keys(s.npcs)) {
    const npcId = Number(key);
    const npc = s.npcs[npcId];
    const flags = npc.npcFlags ?? 0;
    if (Math.floor(flags / s.npcFlagValues.auctioneer) % 2 !== 1) continue;
    const spawns = npc.spawns;
    if (spawns == null || typeof spawns !== "object" || Object.keys(spawns).length === 0) {
      notes.auctioneersWithoutSpawns.push(npcId);
      continue;
    }
    const faction = npc.friendlyToFaction;
    if (faction !== null && faction !== "A" && faction !== "H" && faction !== "AH") throw new Error(`npc ${npcId}: friendlyToFaction "${faction}"`);
    // As Questie IsFriendlyToPlayer: nil friendlyToFaction is friendly to both.
    if (faction === null) notes.neutralAuctioneers.push(npcId);
    auctioneers.push({ npcId, faction: faction ?? "AH" });
  }
  auctioneers.sort((a, b) => a.npcId - b.npcId);

  const spells = {} as Record<Skill, number[]>;
  for (const skill of SKILLS) spells[skill] = sorted(skillSpells.get(skill) ?? []);
  return { data: { items, nodes, skinned, auctioneers, skillSpells: spells }, notes };
}

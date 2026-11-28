import { PROFESSIONS, type ProfessionData, type Skill } from "../data/generated/professions";
import type { QuestInfo } from "../data/questRepository";

export type ObtainHow = "gather" | "craft" | "fish" | "buy";

export interface ObtainSources {
  how: ObtainHow;
  npcs: number[];
  objects: number[];
}

export interface ObtainPlan extends ObtainSources {
  itemId: number;
  item: string;
  // Changes with the player's skills: cached spawn clusters are keyed by it.
  key: string;
}

export type PlanFor = (q: QuestInfo, objectiveIndex: number) => ObtainPlan | null;
export type SpellKnown = (spellId: number) => boolean;

const NONE: number[] = [];
const SKILLS: Skill[] = [
  "herbalism", "mining", "skinning", "fishing", "alchemy", "blacksmithing",
  "enchanting", "engineering", "leatherworking", "tailoring", "cooking", "firstAid",
];

// Design 2026-11-28-professions §1: a profession item is never farmed from mobs.
export function obtainPlan(itemId: number, objects: number[], skills: ReadonlySet<Skill>, data: ProfessionData = PROFESSIONS): ObtainSources | null {
  const item = data.items[itemId];
  if (item == null) return null;
  const nodes: number[] = [];
  for (const id of objects) {
    const skill = data.nodes[id];
    if (skill != null && skills.has(skill)) nodes.push(id);
  }
  const npcs = skills.has("skinning") ? (data.skinned[itemId] ?? NONE) : NONE;
  if (nodes.length > 0 || npcs.length > 0) return { how: "gather", npcs, objects: nodes };
  if (skills.has("fishing") && item.gather.includes("fishing")) return { how: "fish", npcs: NONE, objects: NONE };
  for (const skill of item.craft) if (skills.has(skill)) return { how: "craft", npcs: NONE, objects: NONE };
  return { how: "buy", npcs: NONE, objects: NONE };
}

// Null when the client has no way to tell known spells.
export function playerSkills(isKnown: SpellKnown | null, data: ProfessionData = PROFESSIONS): Set<Skill> | null {
  if (isKnown == null) return null;
  const out = new Set<Skill>();
  for (const skill of SKILLS) {
    for (const spell of data.skillSpells[skill]) {
      if (isKnown(spell)) {
        out.add(skill);
        break;
      }
    }
  }
  return out;
}

export function clientSpellKnown(): SpellKnown | null {
  const isPlayerSpell = IsPlayerSpell;
  if (isPlayerSpell != null) return (id) => isPlayerSpell(id) === true;
  const isSpellKnown = IsSpellKnown;
  if (isSpellKnown != null) return (id) => isSpellKnown(id) === true;
  return null;
}

export interface PlayerSkills {
  // Null until read, or when the client cannot tell: today's behaviour then.
  current(): ReadonlySet<Skill> | null;
  markDirty(): void;
  // Rereads when dirty; true when the set changed.
  refresh(): boolean;
}

export function createPlayerSkills(known: () => SpellKnown | null, data: ProfessionData = PROFESSIONS): PlayerSkills {
  let skills: Set<Skill> | null = null;
  let dirty = true;
  let read = false;
  const same = (a: Set<Skill> | null, b: Set<Skill> | null): boolean => {
    if (a == null || b == null) return a === b;
    if (a.size !== b.size) return false;
    for (const skill of a) if (!b.has(skill)) return false;
    return true;
  };
  return {
    current: () => skills,
    markDirty: () => {
      dirty = true;
    },
    refresh: () => {
      if (!dirty) return false;
      dirty = false;
      const next = playerSkills(known(), data);
      const changed = !read || !same(skills, next);
      read = true;
      if (changed) skills = next;
      return changed;
    },
  };
}

export function createPlanFor(
  itemSources: (itemId: number) => { npcs: number[]; objects: number[] },
  skills: () => ReadonlySet<Skill> | null,
  itemName: (itemId: number) => string | null,
  data: ProfessionData = PROFESSIONS,
): PlanFor {
  let cachedFor: ReadonlySet<Skill> | null = null;
  let signature = "";
  let plans: Record<number, ObtainPlan | false> = {};
  return (q, objectiveIndex) => {
    const current = skills();
    if (current == null) return null;
    const objective = q.objectives.find((o) => o.index === objectiveIndex);
    if (objective == null || objective.kind !== "item" || data.items[objective.id] == null) return null;
    if (current !== cachedFor) {
      cachedFor = current;
      const names: string[] = [];
      for (const skill of SKILLS) if (current.has(skill)) names.push(skill);
      signature = names.join(",");
      plans = {};
    }
    const itemId = objective.id;
    const cached = plans[itemId];
    if (cached != null) return cached === false ? null : cached;
    const sources = obtainPlan(itemId, itemSources(itemId).objects, current, data);
    const plan = sources == null ? null : { ...sources, itemId, item: itemName(itemId) ?? `#${itemId}`, key: `${sources.how}:${signature}` };
    plans[itemId] = plan ?? false;
    return plan;
  };
}

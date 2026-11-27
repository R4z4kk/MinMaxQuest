import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import { TRAVEL } from "../data/generated/travel";
import type { TaxiLeg } from "../travel/graph";
import { findTaxiIndex, normalizeTaxiName } from "./match";

type SlotState = "current" | "reachable" | "other";

interface TaxiSlot {
  slot: number;
  nodeId: number | null;
  name: string;
  state: SlotState;
}

interface TaxiRead {
  slots: TaxiSlot[];
  byNodeId: boolean;
}

export interface AutoFlyDeps {
  db: CharDb;
  refresh(): void;
  currentLeg(): TaxiLeg | null;
}

function readFromMap(): TaxiRead | null {
  const states = Enum.FlightPathState;
  const api = C_TaxiMap;
  if (states == null || api == null || api.GetAllTaxiNodes == null || GetTaxiMapID == null) return null;
  const mapId = GetTaxiMapID();
  if (mapId == null) return null;
  const list = api.GetAllTaxiNodes(mapId);
  if (list == null) return null;
  const slots: TaxiSlot[] = [];
  for (const node of list) {
    if (node.nodeID == null || node.slotIndex == null) continue;
    const state: SlotState =
      node.state === states.Current ? "current" : node.state === states.Reachable ? "reachable" : "other";
    slots.push({ slot: node.slotIndex, nodeId: node.nodeID, name: node.name ?? "", state });
  }
  return { slots, byNodeId: true };
}

function nameLookup(db: CharDb): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const node of TRAVEL.taxiNodes) {
    lookup.set(normalizeTaxiName(node.name), node.id);
    const learned = db.taxiNames[node.id];
    if (learned != null) lookup.set(normalizeTaxiName(learned), node.id);
  }
  return lookup;
}

function readFromSlots(db: CharDb): TaxiRead {
  const lookup = nameLookup(db);
  const slots: TaxiSlot[] = [];
  const count = NumTaxiNodes();
  for (let index = 1; index <= count; index++) {
    const kind = TaxiNodeGetType(index);
    const name = TaxiNodeName(index) ?? "";
    const state: SlotState = kind === "CURRENT" ? "current" : kind === "REACHABLE" ? "reachable" : "other";
    slots.push({ slot: index, nodeId: lookup.get(normalizeTaxiName(name)) ?? null, name, state });
  }
  return { slots, byNodeId: false };
}

function record(db: CharDb, slots: TaxiSlot[]): void {
  const valid = new Set<number>();
  for (const node of TRAVEL.taxiNodes) valid.add(node.id);
  for (const slot of slots) {
    const id = slot.nodeId;
    if (slot.state === "other" || id == null || !valid.has(id)) continue;
    if (!db.knownTaxiNodes.includes(id)) db.knownTaxiNodes.push(id);
    if (slot.name !== "") db.taxiNames[id] = slot.name;
  }
}

function destinationSlot(read: TaxiRead, nodeId: number, db: CharDb): number | null {
  if (read.byNodeId) {
    const match = read.slots.find((slot) => slot.nodeId === nodeId && slot.state !== "other");
    return match == null ? null : match.slot;
  }
  const names = read.slots.map((slot) => slot.name);
  const node = TRAVEL.taxiNodes.find((candidate) => candidate.id === nodeId);
  const learned = db.taxiNames[nodeId];
  let index = node == null ? null : findTaxiIndex(names, node.name);
  if (index == null && learned != null) index = findTaxiIndex(names, learned);
  if (index == null || read.slots[index - 1].state === "other") return null;
  return index;
}

function onTaxiMapOpened(deps: AutoFlyDeps): void {
  const { db } = deps;
  const read = readFromMap() ?? readFromSlots(db);
  record(db, read.slots);
  deps.refresh();
  if (!db.autoFly || db.hidden || IsShiftKeyDown()) return;
  const leg = deps.currentLeg();
  if (leg == null) return;
  const here = read.slots.find((slot) => slot.state === "current");
  if (here == null || here.nodeId !== leg.from) return;
  const slot = destinationSlot(read, leg.to, db);
  if (slot == null) {
    print(`MinMaxQuest: ${t("taxiNotKnown")}`);
    return;
  }
  TakeTaxiNode(slot);
}

export function installAutoFly(deps: AutoFlyDeps): void {
  const frame = CreateFrame("Frame", "MinMaxQuestTaxi", UIParent);
  frame.RegisterEvent("TAXIMAP_OPENED");
  frame.SetScript("OnEvent", () => {
    guard("autoFly", () => onTaxiMapOpened(deps));
  });
}

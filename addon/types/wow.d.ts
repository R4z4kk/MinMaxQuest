declare const _G: Record<string, unknown>;
declare const SlashCmdList: Record<string, (message: string) => void>;
declare function GetLocale(): string;
declare function ReloadUI(): void;
declare const UIParent: WowFrame;
declare function UnitPosition(unit: string): LuaMultiReturn<[number, number, number, number] | []>;
declare function GetPlayerFacing(): number | null;
declare function CreateFrame(kind: "Frame" | "Button", name: string | null, parent: WowFrame): WowFrame;
declare function CreateFrame(kind: "Button", name: string, parent: WowFrame, template: "SecureActionButtonTemplate"): WowSecureButton;
declare function CreateFrame(kind: "Cooldown", name: string, parent: WowFrame, template: "CooldownFrameTemplate"): WowCooldown;
declare function GetBuildInfo(): LuaMultiReturn<[string, string, string, number]>;
declare function date(format: string): string;
declare const UISpecialFrames: string[];
declare const Enum: {
  UIMapType: { Continent: number };
  FlightPathState: { Current: number; Reachable: number; Unreachable: number } | null;
};
declare function GetTime(): number;
declare function debugprofilestop(): number;
declare function UnitOnTaxi(unit: string): boolean;
declare function UnitIsGhost(unit: string): boolean;
declare function UnitIsDeadOrGhost(unit: string): boolean;
declare const C_DeathInfo: { GetCorpseMapPosition: ((this: void, uiMapId: number) => WowVector2D | null) | null } | null;
declare function UnitLevel(unit: string): number;
declare function UnitXP(unit: string): number;
declare function UnitRace(unit: string): LuaMultiReturn<[string, string, number]>;
declare function UnitClass(unit: string): LuaMultiReturn<[string, string, number]>;
declare function UnitFactionGroup(unit: string): LuaMultiReturn<[string | null, string | null]>;
declare function GetMaxPlayerLevel(): number;
declare function CreateVector2D(x: number, y: number): WowVector2D;
declare const GetQuestGreenRange: ((this: void) => number) | null;
declare const GetQuestsCompleted: ((this: void) => Record<number, boolean>) | null;

type WowItemCooldown = (this: void, itemId: number) => LuaMultiReturn<[number, number, number | boolean]>;
declare const GetItemCooldown: WowItemCooldown | null;
declare const C_Container: { GetItemCooldown: WowItemCooldown | null } | null;
declare const C_Item: {
  GetItemCooldown: WowItemCooldown | null;
  GetItemCount: WowItemCount | null;
  GetItemSpell: WowItemSpell | null;
  GetItemIconByID: ((this: void, itemId: number) => number | null) | null;
  GetItemNameByID: ((this: void, itemId: number) => string | null) | null;
} | null;
interface WowFactionData {
  name: string | null;
  currentStanding: number;
}
declare const C_Reputation: { GetFactionDataByID: ((this: void, factionId: number) => WowFactionData | null) | null } | null;
declare const GetFactionInfoByID:
  | ((this: void, factionId: number) => LuaMultiReturn<[string | null, string | null, number | null, number | null, number | null, number | null]>)
  | null;
type WowItemSpell = (this: void, itemId: number) => LuaMultiReturn<[string | null, number | null]>;
declare const GetItemSpell: WowItemSpell | null;
type WowItemCount = (this: void, itemId: number) => number;
declare const GetItemCount: WowItemCount | null;

interface WowUserWaypoint {
  uiMapID: number;
  position: WowVector2D;
}

interface WowVector2D {
  x: number;
  y: number;
}

interface WowQuestLogInfo {
  questID: number;
  isHeader: boolean;
}

interface WowQuestObjective {
  finished: boolean;
  numFulfilled?: number;
  numRequired?: number;
}

interface WowMapInfo {
  name: string;
  mapType: number;
  parentMapID: number;
}

declare namespace C_Map {
  function GetWorldPosFromMapPos(uiMapId: number, pos: WowVector2D): LuaMultiReturn<[number | null, WowVector2D | null]>;
  function GetAreaInfo(areaId: number): string | null;
  function GetBestMapForUnit(unit: string): number | null;
  function GetMapInfo(uiMapId: number): WowMapInfo | null;
  const GetMapPosFromWorldPos:
    | ((this: void, continent: number, pos: WowVector2D, overrideUiMapId?: number) => LuaMultiReturn<[number | null, WowVector2D | null]>)
    | null;
  const CanSetUserWaypointOnMap: ((this: void, uiMapId: number) => boolean) | null;
  const SetUserWaypoint: ((this: void, point: unknown) => void) | null;
  const ClearUserWaypoint: ((this: void) => void) | null;
  const HasUserWaypoint: ((this: void) => boolean) | null;
  const GetUserWaypoint: ((this: void) => WowUserWaypoint | null) | null;
}

declare const C_SuperTrack: { SetSuperTrackedUserWaypoint: ((this: void, on: boolean) => void) | null } | null;
declare const UiMapPoint: {
  CreateFromCoordinates: ((this: void, uiMapId: number, x: number, y: number) => unknown) | null;
} | null;

interface HbdPins {
  AddWorldMapIconWorld(ref: string, icon: WowFrame, instanceId: number, x: number, y: number, showFlag: number): boolean;
  AddMinimapIconWorld(ref: string, icon: WowFrame, instanceId: number, x: number, y: number, floatOnEdge: boolean): boolean;
  RemoveWorldMapIcon(ref: string, icon: WowFrame): void;
  RemoveMinimapIcon(ref: string, icon: WowFrame): void;
}
declare const LibStub: ((this: void, name: string, silent: boolean) => unknown) | null;

declare namespace C_QuestLog {
  function GetNumQuestLogEntries(): LuaMultiReturn<[number, number]>;
  function GetInfo(index: number): WowQuestLogInfo | null;
  function GetQuestObjectives(questId: number): WowQuestObjective[] | null;
  const IsComplete: ((this: void, questId: number) => boolean) | null;
  const GetTrivialRange: ((this: void) => number) | null;
  const GetAllCompletedQuestIDs: ((this: void) => number[]) | null;
  const GetTitleForQuestID: ((this: void, questId: number) => string | null) | null;
}

declare namespace C_Timer {
  function NewTicker(seconds: number, callback: () => void): unknown;
}

interface WowRegion {
  SetSize(width: number, height: number): void;
  SetWidth(width: number): void;
  GetWidth(): number;
  SetHeight(height: number): void;
  SetPoint(point: string, relativeTo?: WowRegion, relativePoint?: string, x?: number, y?: number): void;
  SetAllPoints(relativeTo: WowRegion): void;
  ClearAllPoints(): void;
  Show(): void;
  Hide(): void;
  IsShown(): boolean;
  IsVisible(): boolean;
}

interface WowTexture extends WowRegion {
  SetTexture(path: string | number | null): void;
  SetColorTexture(r: number, g: number, b: number, a: number): void;
  SetRotation(radians: number): void;
}

interface WowFontString extends WowRegion {
  SetFont(path: string, size: number, flags: string): void;
  SetTextColor(r: number, g: number, b: number): void;
  SetText(text: string): void;
  SetJustifyH(justify: "LEFT" | "CENTER" | "RIGHT"): void;
  SetWordWrap(wrap: boolean): void;
  GetStringWidth(): number;
}

interface WowFrame extends WowRegion {
  SetMovable(movable: boolean): void;
  EnableMouse(enabled: boolean): void;
  SetClampedToScreen(clamped: boolean): void;
  RegisterForDrag(button: string): void;
  StartMoving(): void;
  StopMovingOrSizing(): void;
  GetLeft(): number | null;
  GetTop(): number | null;
  GetRight(): number | null;
  SetScript(event: "OnUpdate", handler: ((frame: WowFrame, elapsed: number) => void) | null): void;
  SetScript(event: "OnDragStart" | "OnDragStop" | "OnClick", handler: ((frame: WowFrame) => void) | null): void;
  SetScript(event: "OnMouseWheel", handler: ((frame: WowFrame, delta: number) => void) | null): void;
  SetFrameStrata(strata: "MEDIUM" | "HIGH" | "DIALOG"): void;
  SetFrameLevel(level: number): void;
  GetFrameLevel(): number;
  EnableMouseWheel(enabled: boolean): void;
  SetScript(event: "OnEnter" | "OnLeave" | "OnHide", handler: ((frame: WowFrame) => void) | null): void;
  SetScript(event: "OnEvent", handler: (frame: WowFrame, event: string, ...args: unknown[]) => void): void;
  RegisterEvent(event: string): void;
  UnregisterEvent(event: string): void;
  RegisterUnitEvent(event: string, unit: string): void;
  CreateTexture(name: string | null, layer: string): WowTexture;
  CreateFontString(name: string | null, layer: string): WowFontString;
}

interface WowSecureButton extends WowFrame {
  SetAttribute(name: string, value: string | null): void;
  RegisterForClicks(...buttons: string[]): void;
}

interface WowCooldown extends WowRegion {
  SetCooldown(start: number, duration: number): void;
}

declare function hooksecurefunc(name: string, hook: (...args: unknown[]) => void): void;
declare function InCombatLockdown(): boolean;
declare function FauxScrollFrame_GetOffset(frame: unknown): number;
declare const GameTooltip: {
  SetOwner(owner: WowFrame, anchor: string): void;
  SetText(text: string): void;
  SetItemByID(itemId: number): void;
  AddLine(text: string, r: number, g: number, b: number): void;
  Show(): void;
  Hide(): void;
};

interface WowTaxiNode {
  nodeID: number;
  slotIndex: number;
  state: number;
  name: string;
}

declare const C_TaxiMap: { GetAllTaxiNodes: ((this: void, uiMapId: number) => WowTaxiNode[] | null) | null } | null;
declare const GetTaxiMapID: ((this: void) => number | null) | null;
declare function NumTaxiNodes(): number;
declare function TaxiNodeName(index: number): string | null;
declare function TaxiNodeGetType(index: number): string | null;
declare function TakeTaxiNode(index: number): void;
declare function IsShiftKeyDown(): boolean;

declare const _G: Record<string, unknown>;
declare const SlashCmdList: Record<string, (message: string) => void>;
declare function GetLocale(): string;
declare const UIParent: WowFrame;
declare function UnitPosition(unit: string): LuaMultiReturn<[number, number, number, number] | []>;
declare function GetPlayerFacing(): number | null;
declare function CreateFrame(kind: "Frame", name: string, parent: WowFrame): WowFrame;
declare function GetTime(): number;
declare function UnitLevel(unit: string): number;
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
declare const C_Item: { GetItemCooldown: WowItemCooldown | null } | null;

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
}

declare namespace C_Map {
  function GetWorldPosFromMapPos(uiMapId: number, pos: WowVector2D): LuaMultiReturn<[number | null, WowVector2D | null]>;
}

declare namespace C_QuestLog {
  function GetNumQuestLogEntries(): LuaMultiReturn<[number, number]>;
  function GetInfo(index: number): WowQuestLogInfo | null;
  function GetQuestObjectives(questId: number): WowQuestObjective[] | null;
  const IsComplete: ((this: void, questId: number) => boolean) | null;
  const GetTrivialRange: ((this: void) => number) | null;
  const GetAllCompletedQuestIDs: ((this: void) => number[]) | null;
}

declare namespace C_Timer {
  function NewTicker(seconds: number, callback: () => void): unknown;
}

interface WowRegion {
  SetSize(width: number, height: number): void;
  SetPoint(point: string, relativeTo?: WowRegion, relativePoint?: string, x?: number, y?: number): void;
  Show(): void;
  Hide(): void;
}

interface WowTexture extends WowRegion {
  SetTexture(path: string): void;
  SetColorTexture(r: number, g: number, b: number, a: number): void;
  SetRotation(radians: number): void;
}

interface WowFontString extends WowRegion {
  SetFont(path: string, size: number, flags: string): void;
  SetTextColor(r: number, g: number, b: number): void;
  SetText(text: string): void;
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
  SetScript(event: "OnUpdate", handler: ((frame: WowFrame, elapsed: number) => void) | null): void;
  SetScript(event: "OnDragStart" | "OnDragStop", handler: ((frame: WowFrame) => void) | null): void;
  SetScript(event: "OnEvent", handler: (frame: WowFrame, event: string, ...args: unknown[]) => void): void;
  RegisterEvent(event: string): void;
  CreateTexture(name: string | null, layer: string): WowTexture;
  CreateFontString(name: string | null, layer: string): WowFontString;
}

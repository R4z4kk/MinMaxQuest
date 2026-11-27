declare const _G: Record<string, unknown>;
declare const SlashCmdList: Record<string, (message: string) => void>;
declare function GetLocale(): string;
declare const UIParent: WowFrame;
declare function UnitPosition(unit: string): LuaMultiReturn<[number, number, number, number] | []>;
declare function GetPlayerFacing(): number | null;
declare function CreateFrame(kind: "Frame", name: string, parent: WowFrame): WowFrame;

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
  CreateTexture(name: string | null, layer: string): WowTexture;
  CreateFontString(name: string | null, layer: string): WowFontString;
}

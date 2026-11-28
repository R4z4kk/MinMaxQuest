import { playerPosition } from "../arrow/arrowFrame";
import type { WorldPos } from "../core/geometry";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { Target } from "../targets/completion";
import { COLOR, FONT } from "../ui/theme";

export interface MapPinsDeps {
  db: CharDb;
  label(target: Target): string;
  getPins(): { current: Target | null; next: Target | null };
}

export interface MapPins {
  refresh(): void;
}

interface PinState {
  target: Target | null;
  label: string;
}

interface Slot {
  state: PinState;
  world: WowFrame;
  minimap: WowFrame | null;
  key: string | null;
}

interface MapPoint {
  uiMapId: number;
  x: number;
  y: number;
}

const FEATURE = "mapPins";
const REF = "MinMaxQuest";
const HBD_PINS = "HereBeDragons-Pins-2.0";
// HBD_PINS_WORLDMAP_SHOW_WORLD: zone, continent and world maps.
const SHOW_WORLD = 3;
const PIN_SIZE = 12;
const DIAMOND_SIZE = 9;
const NUMBER_SIZE = 9;
const WAYPOINT_EPSILON = 1e-4;

function createPinFrame(name: string, step: number, state: PinState): WowFrame {
  const frame = CreateFrame("Frame", name, UIParent);
  frame.SetSize(PIN_SIZE, PIN_SIZE);
  frame.EnableMouse(true);
  const [r, g, b] = COLOR.accent;
  const diamond = frame.CreateTexture(null, "ARTWORK");
  diamond.SetColorTexture(r, g, b, 1);
  diamond.SetSize(DIAMOND_SIZE, DIAMOND_SIZE);
  diamond.SetPoint("CENTER", frame, "CENTER", 0, 0);
  diamond.SetRotation(Math.PI / 4);
  const number = frame.CreateFontString(null, "OVERLAY");
  number.SetFont(FONT, NUMBER_SIZE, "");
  number.SetTextColor(COLOR.bg[0], COLOR.bg[1], COLOR.bg[2]);
  number.SetPoint("CENTER", frame, "CENTER", 0, 0);
  number.SetText(String(step));
  frame.SetScript("OnEnter", () => guard(FEATURE, () => showTooltip(frame, state)));
  frame.SetScript("OnLeave", () => guard(FEATURE, () => GameTooltip.Hide()));
  return frame;
}

function showTooltip(owner: WowFrame, state: PinState): void {
  if (state.target == null) return;
  GameTooltip.SetOwner(owner, "ANCHOR_RIGHT");
  GameTooltip.SetText(state.label);
  const others = state.target.otherSpots;
  if (others > 0) {
    const [r, g, b] = COLOR.sub;
    GameTooltip.AddLine(t("otherSpots").replace("{n}", String(others)), r, g, b);
  }
  GameTooltip.Show();
}

function createSlot(step: number, withMinimap: boolean): Slot {
  const state: PinState = { target: null, label: "" };
  return {
    state,
    world: createPinFrame(`MinMaxQuestPin${step}`, step, state),
    minimap: withMinimap ? createPinFrame(`MinMaxQuestMinimapPin${step}`, step, state) : null,
    key: null,
  };
}

function inUnitRange(value: number): boolean {
  return value >= 0 && value <= 1;
}

function mapPoint(pos: WorldPos): MapPoint | null {
  const toMap = C_Map.GetMapPosFromWorldPos;
  if (toMap == null) return null;
  const world = CreateVector2D(pos.x, pos.y);
  const [uiMapId, point] = toMap(pos.continent, world);
  if (uiMapId != null && point != null) return { uiMapId, x: point.x, y: point.y };
  const best = C_Map.GetBestMapForUnit("player");
  if (best == null) return null;
  const [, local] = toMap(pos.continent, world, best);
  if (local == null || !inUnitRange(local.x) || !inUnitRange(local.y)) return null;
  return { uiMapId: best, x: local.x, y: local.y };
}

function sameWaypoint(a: WowUserWaypoint, b: MapPoint): boolean {
  return (
    a.uiMapID === b.uiMapId &&
    Math.abs(a.position.x - b.x) < WAYPOINT_EPSILON &&
    Math.abs(a.position.y - b.y) < WAYPOINT_EPSILON
  );
}

function createWaypoint(): { sync(on: boolean, target: Target | null): void } {
  let key: string | null = null;
  let ours: MapPoint | null = null;

  const isOurs = (): boolean => {
    const read = C_Map.GetUserWaypoint;
    if (ours == null || read == null) return ours != null;
    const live = read();
    return live != null && sameWaypoint(live, ours);
  };

  const clear = (): void => {
    if (key == null) return;
    const mine = isOurs();
    key = null;
    ours = null;
    const clearWaypoint = C_Map.ClearUserWaypoint;
    if (mine && clearWaypoint != null) clearWaypoint();
  };

  const apply = (pos: WorldPos): void => {
    const player = playerPosition();
    if (player == null || player.continent !== pos.continent) return clear();
    const point = mapPoint(pos);
    const canSet = C_Map.CanSetUserWaypointOnMap;
    const setWaypoint = C_Map.SetUserWaypoint;
    const createPoint = UiMapPoint?.CreateFromCoordinates;
    const superTrack = C_SuperTrack?.SetSuperTrackedUserWaypoint;
    if (point == null || canSet == null || setWaypoint == null || createPoint == null || superTrack == null) return clear();
    if (!canSet(point.uiMapId)) return clear();
    const next = `${point.uiMapId}:${point.x}:${point.y}`;
    if (next === key) return;
    const hasUser = C_Map.HasUserWaypoint;
    if (hasUser != null && hasUser() && !isOurs()) {
      key = null;
      ours = null;
      return;
    }
    key = next;
    ours = point;
    setWaypoint(createPoint(point.uiMapId, point.x, point.y));
    superTrack(true);
  };

  return {
    sync(on, target) {
      if (!on || target == null || target.pos == null) clear();
      else apply(target.pos);
    },
  };
}

export function installMapPins(deps: MapPinsDeps): MapPins {
  const lib = LibStub?.(HBD_PINS, true) as HbdPins | null;
  if (lib == null) throw new Error(`${HBD_PINS} missing`);
  const slots = [createSlot(1, true), createSlot(2, false)];
  const waypoint = createWaypoint();

  const place = (slot: Slot, shown: Target | null): void => {
    const target = shown?.pos == null ? null : shown;
    const pos = target?.pos ?? null;
    slot.state.target = target;
    slot.state.label = target == null ? "" : deps.label(target);
    const key = pos == null ? null : `${pos.continent}:${pos.x}:${pos.y}`;
    if (key === slot.key) return;
    slot.key = key;
    if (pos == null) {
      lib.RemoveWorldMapIcon(REF, slot.world);
      if (slot.minimap != null) lib.RemoveMinimapIcon(REF, slot.minimap);
      return;
    }
    // HBD world coordinates are (west, north): the reverse of WorldPos (north, west).
    const { continent, x, y } = pos;
    lib.AddWorldMapIconWorld(REF, slot.world, continent, y, x, SHOW_WORLD);
    if (slot.minimap != null) lib.AddMinimapIconWorld(REF, slot.minimap, continent, y, x, true);
  };

  return {
    refresh() {
      guard(FEATURE, () => {
        const shown = !deps.db.hidden;
        const { current, next } = deps.getPins();
        place(slots[0], shown ? current : null);
        place(slots[1], shown ? next : null);
        waypoint.sync(shown && deps.db.nativeWaypoint, current);
      });
    },
  };
}

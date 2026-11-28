import { playerPosition } from "../arrow/arrowFrame";
import type { WorldPos } from "../core/geometry";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { CharDb } from "../core/storage";
import type { Target } from "../targets/completion";
import { worldToMap, type MapPoint } from "../game/positions";
import { COLOR, FONT_TITLE } from "../ui/theme";
import { FARM_FEATURE, installFarmArea } from "./farmArea";
import { MAP_MEDIA } from "./media";

export interface MapPinsDeps {
  db: CharDb;
  label(target: Target): string;
  areaLabel(target: Target): string;
  getPins(): { current: Target | null; next: Target | null };
}

export interface MapPins {
  refresh(): void;
}

interface PinState {
  target: Target | null;
  label: string;
}

interface Pin {
  frame: WowFrame;
  badge: WowTexture;
  badgeText: WowFontString;
  pulse: WowAnimationGroup | null;
  mark: string;
}

interface Slot {
  state: PinState;
  world: Pin;
  minimap: Pin | null;
  key: string | null;
}

const FEATURE = "mapPins";
const PULSE_FEATURE = "mapPulse";
const REF = "MinMaxQuest";
const HBD_PINS = "HereBeDragons-Pins-2.0";
// HBD_PINS_WORLDMAP_SHOW_WORLD: zone, continent and world maps.
const SHOW_WORLD = 3;
const CURRENT_PIN = 28;
const NEXT_PIN = 22;
// Head centre of pin.tga from its top, as a fraction of its size.
const HEAD_Y = 22 / 64;
const NUMBER_SCALE = 0.42;
const SHADOW_OFFSET = 2;
const BADGE_SCALE = 0.5;
const BADGE_X = 0.82;
const BADGE_Y = 0.12;
const BADGE_TEXT_SCALE = 0.38;
const HALO_SCALE = 1.3;
const PULSE_SEC = 1.2;
const PULSE_FROM = 0.7;
const PULSE_TO = 1.4;
const WAYPOINT_EPSILON = 1e-4;

function createPulse(frame: WowFrame, size: number): WowAnimationGroup {
  const halo = frame.CreateTexture(null, "BORDER");
  halo.SetTexture(MAP_MEDIA.halo);
  halo.SetSize(size * HALO_SCALE, size * HALO_SCALE);
  halo.SetPoint("CENTER", frame, "TOP", 0, -size * HEAD_Y);
  const group = halo.CreateAnimationGroup();
  group.SetLooping("REPEAT");
  const scale = group.CreateAnimation("Scale");
  scale.SetScaleFrom(PULSE_FROM, PULSE_FROM);
  scale.SetScaleTo(PULSE_TO, PULSE_TO);
  scale.SetDuration(PULSE_SEC);
  const fade = group.CreateAnimation("Alpha");
  fade.SetFromAlpha(1);
  fade.SetToAlpha(0);
  fade.SetDuration(PULSE_SEC);
  return group;
}

function createBadge(frame: WowFrame, size: number): { badge: WowTexture; badgeText: WowFontString } {
  const [r, g, b] = COLOR.quest;
  const badge = frame.CreateTexture(null, "OVERLAY");
  badge.SetDrawLayer("OVERLAY", 0);
  badge.SetTexture(MAP_MEDIA.badge);
  badge.SetSize(size * BADGE_SCALE, size * BADGE_SCALE);
  badge.SetPoint("CENTER", frame, "TOPLEFT", size * BADGE_X, -size * BADGE_Y);
  badge.Hide();
  const badgeText = frame.CreateFontString(null, "OVERLAY");
  badgeText.SetDrawLayer("OVERLAY", 7);
  badgeText.SetFont(FONT_TITLE, Math.floor(size * BADGE_TEXT_SCALE), "");
  badgeText.SetTextColor(r, g, b);
  badgeText.SetPoint("CENTER", badge, "CENTER", 0, 0);
  badgeText.Hide();
  return { badge, badgeText };
}

// Twice the pin's height, so the pin's tip sits on the frame centre where HBD anchors it.
function createPin(name: string, step: number, size: number, state: PinState, pulse: boolean): Pin {
  const frame = CreateFrame("Frame", name, UIParent);
  frame.SetSize(size, size * 2);
  frame.SetHitRectInsets(0, 0, 0, size);
  frame.EnableMouse(true);
  const shadow = frame.CreateTexture(null, "BACKGROUND");
  shadow.SetTexture(MAP_MEDIA.shadow);
  shadow.SetSize(size, size);
  shadow.SetPoint("TOP", frame, "TOP", SHADOW_OFFSET, -SHADOW_OFFSET);
  const body = frame.CreateTexture(null, "ARTWORK");
  body.SetTexture(MAP_MEDIA.pin);
  body.SetSize(size, size);
  body.SetPoint("TOP", frame, "TOP", 0, 0);
  const [r, g, b] = COLOR.quest;
  const number = frame.CreateFontString(null, "OVERLAY");
  number.SetFont(FONT_TITLE, Math.floor(size * NUMBER_SCALE), "");
  number.SetTextColor(r, g, b);
  number.SetPoint("CENTER", frame, "TOP", 0, -size * HEAD_Y);
  number.SetText(String(step));
  const { badge, badgeText } = createBadge(frame, size);
  frame.SetScript("OnEnter", () => guard(FEATURE, () => showTooltip(frame, state)));
  frame.SetScript("OnLeave", () => guard(FEATURE, () => GameTooltip.Hide()));
  const animation = pulse ? guard(PULSE_FEATURE, () => createPulse(frame, size)) : null;
  return { frame, badge, badgeText, pulse: animation, mark: "" };
}

function setMark(pin: Pin, target: Target | null): void {
  const mark = target?.kind === "accept" ? "!" : target?.kind === "turnin" ? "?" : "";
  if (mark === pin.mark) return;
  pin.mark = mark;
  pin.badgeText.SetText(mark);
  if (mark === "") {
    pin.badge.Hide();
    pin.badgeText.Hide();
  } else {
    pin.badge.Show();
    pin.badgeText.Show();
  }
}

function setPulse(pin: Pin | null, on: boolean): void {
  const pulse = pin?.pulse;
  if (pulse == null) return;
  if (!on) pulse.Stop();
  else if (!pulse.IsPlaying()) pulse.Play();
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

function createSlot(step: number, size: number, current: boolean): Slot {
  const state: PinState = { target: null, label: "" };
  return {
    state,
    world: createPin(`MinMaxQuestPin${step}`, step, size, state, current),
    minimap: current ? createPin(`MinMaxQuestMinimapPin${step}`, step, NEXT_PIN, state, true) : null,
    key: null,
  };
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
    const point = worldToMap(pos);
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
  const slots = [createSlot(1, CURRENT_PIN, true), createSlot(2, NEXT_PIN, false)];
  const waypoint = createWaypoint();
  const area = guard(FARM_FEATURE, () => installFarmArea(lib, REF, (target) => deps.areaLabel(target)));

  const place = (slot: Slot, shown: Target | null): void => {
    const target = shown?.pos == null ? null : shown;
    const pos = target?.pos ?? null;
    slot.state.target = target;
    slot.state.label = target == null ? "" : deps.label(target);
    setMark(slot.world, target);
    if (slot.minimap != null) setMark(slot.minimap, target);
    const key = pos == null ? null : `${pos.continent}:${pos.x}:${pos.y}`;
    if (key === slot.key) return;
    slot.key = key;
    setPulse(slot.world, pos != null);
    setPulse(slot.minimap, pos != null);
    if (pos == null) {
      lib.RemoveWorldMapIcon(REF, slot.world.frame);
      if (slot.minimap != null) lib.RemoveMinimapIcon(REF, slot.minimap.frame);
      return;
    }
    // HBD world coordinates are (west, north): the reverse of WorldPos (north, west).
    const { continent, x, y } = pos;
    lib.AddWorldMapIconWorld(REF, slot.world.frame, continent, y, x, SHOW_WORLD);
    if (slot.minimap != null) lib.AddMinimapIconWorld(REF, slot.minimap.frame, continent, y, x, true);
  };

  return {
    refresh() {
      const current = guard(FEATURE, () => {
        const shown = !deps.db.hidden;
        const pins = deps.getPins();
        place(slots[0], shown ? pins.current : null);
        place(slots[1], shown ? pins.next : null);
        waypoint.sync(shown && deps.db.nativeWaypoint, pins.current);
        return shown ? pins.current : null;
      });
      if (area != null) guard(FARM_FEATURE, () => area.refresh(current));
    },
  };
}

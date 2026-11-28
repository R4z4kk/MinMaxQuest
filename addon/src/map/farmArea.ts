import type { WorldPos } from "../core/geometry";
import { guard } from "../core/report";
import type { QuestInfo, QuestRepository } from "../data/questRepository";
import type { CompletionInput, Target } from "../targets/completion";
import { WAYPOINT_MAX } from "../targets/spawns";
import { COLOR, FONT_TITLE } from "../ui/theme";
import { convexHull, dashSegments, inflate, type Vec2 } from "./hull";
import { MAP_MEDIA } from "./media";

export interface FarmArea {
  refresh(target: Target | null): void;
}

interface WorldLayer {
  overlay: WowFrame;
  lines: WowLine[];
  glows: WowTexture[];
  label: WowFontString;
}

export const FARM_FEATURE = "farmArea";
const HBD = "HereBeDragons-2.0";
const MIN_SPAWNS = 3;
const LINE_POOL = 96;
const DASH_PX = 6;
const GAP_PX = 4;
const LINE_PX = 2;
const LINE_ALPHA = 0.9;
const GLOW_PX = 22;
// Half a glow: the outline clears the glow drawn on each spawn point.
const INFLATE_PX = GLOW_PX / 2;
const MINIMAP_GLOW_PX = 14;
const LABEL_SIZE = 12;
const LABEL_GAP = 4;
const LEVEL_TYPE = "PIN_FRAME_LEVEL_AREA_POI";

export function farmSpawns(target: Target | null): WorldPos[] | null {
  if (target == null || target.kind !== "objective" || target.cluster == null) return null;
  return target.cluster.points.length >= MIN_SPAWNS ? target.cluster.points : null;
}

type ObjectiveNames = Pick<QuestRepository, "npcName" | "objectName" | "itemName">;

export function objectiveLabel(target: Target, quest: QuestInfo | null, names: ObjectiveNames, log: CompletionInput["log"] | null): string {
  const index = target.objectiveIndex;
  if (target.questId == null || index == null) return "";
  const ref = quest?.objectives.find((o) => o.index === index) ?? null;
  let name: string | null = null;
  if (ref?.kind === "npc") name = names.npcName(ref.id);
  else if (ref?.kind === "object") name = names.objectName(ref.id);
  else if (ref?.kind === "item") name = names.itemName(ref.id);
  const shown = name ?? quest?.name ?? `#${target.questId}`;
  const count = log?.get(target.questId)?.counts?.[index - 1] ?? null;
  return count == null || count.need <= 0 ? shown : `${shown} ${count.have}/${count.need}`;
}

function areaKey(target: Target, points: WorldPos[]): string {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return `${target.questId}:${target.objectiveIndex}:${points[0].continent}:${points.length}:${sx}:${sy}`;
}

function createWorldLayer(map: WowWorldMap, canvas: WowFrame): WorldLayer {
  const overlay = CreateFrame("Frame", "MinMaxQuestFarmArea", canvas);
  overlay.SetAllPoints(canvas);
  overlay.SetFrameLevel(map.GetPinFrameLevelsManager().GetValidFrameLevel(LEVEL_TYPE));
  const [r, g, b] = COLOR.quest;
  const lines: WowLine[] = [];
  for (let i = 0; i < LINE_POOL; i++) {
    const line = overlay.CreateLine(null, "OVERLAY");
    line.SetThickness(LINE_PX);
    line.SetColorTexture(r, g, b, LINE_ALPHA);
    line.Hide();
    lines.push(line);
  }
  const glows: WowTexture[] = [];
  for (let i = 0; i < WAYPOINT_MAX; i++) {
    const glow = overlay.CreateTexture(null, "ARTWORK");
    glow.SetTexture(MAP_MEDIA.glow);
    glow.SetSize(GLOW_PX, GLOW_PX);
    glow.Hide();
    glows.push(glow);
  }
  const label = overlay.CreateFontString(null, "OVERLAY");
  label.SetFont(FONT_TITLE, LABEL_SIZE, "OUTLINE");
  label.SetTextColor(r, g, b);
  label.Hide();
  return { overlay, lines, glows, label };
}

function createMinimapGlows(): WowFrame[] {
  const frames: WowFrame[] = [];
  for (let i = 0; i < WAYPOINT_MAX; i++) {
    const frame = CreateFrame("Frame", `MinMaxQuestFarmDot${i + 1}`, UIParent);
    frame.SetSize(MINIMAP_GLOW_PX, MINIMAP_GLOW_PX);
    const glow = frame.CreateTexture(null, "ARTWORK");
    glow.SetTexture(MAP_MEDIA.glow);
    glow.SetAllPoints(frame);
    frame.Hide();
    frames.push(frame);
  }
  return frames;
}

function hideWorld(layer: WorldLayer): void {
  for (const line of layer.lines) line.Hide();
  for (const glow of layer.glows) glow.Hide();
  layer.label.Hide();
}

function project(hbd: HbdCore, pos: WorldPos, mapId: number, size: Vec2): Vec2 | null {
  // HBD world coordinates are (west, north): the reverse of WorldPos (north, west).
  const [x, y] = hbd.GetZoneCoordinatesFromWorldInstance(pos.y, pos.x, pos.continent, mapId, false);
  return x == null || y == null ? null : { x: x * size.x, y: y * size.y };
}

function drawOutline(layer: WorldLayer, corners: Vec2[]): void {
  const dashes = dashSegments(corners, DASH_PX, GAP_PX, layer.lines.length);
  for (let i = 0; i < dashes.length; i++) {
    const dash = dashes[i];
    const line = layer.lines[i];
    line.SetStartPoint("TOPLEFT", layer.overlay, dash.x1, -dash.y1);
    line.SetEndPoint("TOPLEFT", layer.overlay, dash.x2, -dash.y2);
    line.Show();
  }
}

function drawLabel(layer: WorldLayer, around: Vec2[]): void {
  let top = Infinity;
  let sumX = 0;
  for (const p of around) {
    top = Math.min(top, p.y);
    sumX += p.x;
  }
  layer.label.ClearAllPoints();
  layer.label.SetPoint("BOTTOM", layer.overlay, "TOPLEFT", sumX / around.length, -top + LABEL_GAP);
  layer.label.Show();
}

// Nothing is drawn unless every spawn point lies on the shown map.
function drawWorld(layer: WorldLayer, hbd: HbdCore, points: WorldPos[], mapId: number, size: Vec2): void {
  const spots: Vec2[] = [];
  for (const p of points) {
    const spot = project(hbd, p, mapId, size);
    if (spot == null) return;
    spots.push(spot);
  }
  const corners = inflate(convexHull(spots), INFLATE_PX);
  for (let i = 0; i < spots.length && i < layer.glows.length; i++) {
    const glow = layer.glows[i];
    glow.ClearAllPoints();
    glow.SetPoint("CENTER", layer.overlay, "TOPLEFT", spots[i].x, -spots[i].y);
    glow.Show();
  }
  if (corners.length >= 3) drawOutline(layer, corners);
  drawLabel(layer, corners.length >= 3 ? corners : spots);
}

export function installFarmArea(pins: HbdPins, ref: string, labelOf: (target: Target) => string): FarmArea {
  const map = WorldMapFrame;
  if (map == null) throw new Error("WorldMapFrame missing");
  const hbd = LibStub?.(HBD, true) as HbdCore | null;
  if (hbd == null) throw new Error(`${HBD} missing`);
  const canvas = map.GetCanvas();
  const world = createWorldLayer(map, canvas);
  const dots = createMinimapGlows();
  let points: WorldPos[] | null = null;
  let key = "";
  let drawnKey = "";
  let dotsKey = "";
  let dotCount = 0;

  const redraw = (): void => {
    const mapId = map.GetMapID();
    const size = { x: canvas.GetWidth(), y: canvas.GetHeight() };
    const ready = points != null && mapId != null && size.x > 0 && size.y > 0;
    const next = ready ? `${key}:${mapId}:${size.x}:${size.y}` : "";
    if (next === drawnKey) return;
    drawnKey = next;
    hideWorld(world);
    if (points != null && mapId != null && ready) drawWorld(world, hbd, points, mapId, size);
  };

  const syncDots = (): void => {
    if (key === dotsKey) return;
    dotsKey = key;
    for (let i = 0; i < dotCount; i++) pins.RemoveMinimapIcon(ref, dots[i]);
    dotCount = 0;
    if (points == null) return;
    for (const p of points) {
      if (dotCount >= dots.length) break;
      pins.AddMinimapIconWorld(ref, dots[dotCount], p.continent, p.y, p.x, false);
      dotCount++;
    }
  };

  hooksecurefunc(map, "OnMapChanged", () => {
    guard(FARM_FEATURE, redraw);
  });
  map.HookScript("OnShow", () => {
    guard(FARM_FEATURE, redraw);
  });

  return {
    refresh(target) {
      points = farmSpawns(target);
      key = target == null || points == null ? "" : areaKey(target, points);
      world.label.SetText(target == null || points == null ? "" : labelOf(target));
      redraw();
      syncDots();
    },
  };
}

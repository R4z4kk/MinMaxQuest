export interface WorldPos {
  continent: number;
  x: number;
  y: number;
}

const TWO_PI = 2 * Math.PI;
const DASH = "—";
const METRES_LIMIT = 1000;

export function distance(a: WorldPos, b: WorldPos): number {
  if (a.continent !== b.continent) return Infinity;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// World x points north, y points west; facing is counter-clockwise from north.
export function heading(player: WorldPos, facing: number | null, target: WorldPos): number | null {
  if (facing == null || player.continent !== target.continent) return null;
  const bearing = Math.atan2(target.y - player.y, target.x - player.x);
  return (((bearing - facing) % TWO_PI) + TWO_PI) % TWO_PI;
}

export function formatDistance(yards: number, locale: "frFR" | "enUS"): string {
  if (!Number.isFinite(yards)) return DASH;
  if (yards < METRES_LIMIT) return `${Math.round(yards)} m`;
  const tenths = Math.round(yards / 100);
  const separator = locale === "frFR" ? "," : ".";
  return `${Math.floor(tenths / 10)}${separator}${tenths % 10} km`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return DASH;
  if (seconds < 60) return "<1 min";
  return `~${Math.round(seconds / 60)} min`;
}

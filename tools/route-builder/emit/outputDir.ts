import { join } from "node:path";

export function outputDir(partial: boolean): string {
  return partial ? join("tools", "route-builder", ".cache", "partial") : join("data", "routes");
}

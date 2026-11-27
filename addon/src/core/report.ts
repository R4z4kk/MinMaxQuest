import { t } from "./l10n";

let sink: (line: string) => void = (line) => print(line);
const disabled: Record<string, boolean> = {};

export function setReportSink(fn: (line: string) => void): void {
  sink = fn;
}

export function resetReports(): void {
  for (const feature of Object.keys(disabled)) delete disabled[feature];
}

export function isDisabled(feature: string): boolean {
  return disabled[feature] === true;
}

export function reportOnce(feature: string, message: string): void {
  if (disabled[feature] === true) return;
  disabled[feature] = true;
  sink(`MinMaxQuest: ${message}`);
}

// TSTL compiles try/catch to pcall, so one implementation serves Lua and Node.
export function guard<T>(feature: string, fn: () => T): T | null {
  if (isDisabled(feature)) return null;
  try {
    return fn();
  } catch (error) {
    reportOnce(feature, t("featureDisabled").replace("{feature}", feature).replace("{error}", String(error)));
    return null;
  }
}

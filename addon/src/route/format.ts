export type StepType = "accept" | "complete" | "turnin" | "fly" | "hearth" | "setHearth" | "getFlightPath" | "grind" | "dungeon";

export interface EmittedStep {
  type: StepType;
  uiMapId: number;
  x: number;
  y: number;
  questId?: number;
  objectiveIndex?: number;
  npcId?: number;
  taxiNodeId?: number;
  loop?: [number, number][];
  targetLevel: number;
  targetXpIntoLevel: number;
  estCostSeconds: number;
  estXpGain: number;
  unlocks?: number[];
  races?: number;
}

const TYPE_LETTERS: Record<StepType, string> = {
  accept: "a",
  complete: "c",
  turnin: "t",
  fly: "f",
  hearth: "h",
  setHearth: "s",
  getFlightPath: "p",
  grind: "g",
  dungeon: "d",
};
const LETTER_TYPES: Record<string, StepType> = {
  a: "accept",
  c: "complete",
  t: "turnin",
  f: "fly",
  h: "hearth",
  s: "setHearth",
  p: "getFlightPath",
  g: "grind",
  d: "dungeon",
};
const FIELD_COUNT = 15;

function int(value: number | null, name: string): string {
  if (value == null) return "";
  if (value !== value || value === Infinity || value === -Infinity || Math.floor(value) !== value) throw new Error("encodeSteps: " + name + " must be an integer, got " + value);
  return String(value);
}

function coord(value: number, name: string): string {
  if (value !== value || value === Infinity || value === -Infinity) throw new Error("encodeSteps: " + name + " must be finite, got " + value);
  return value.toFixed(2);
}

export function encodeSteps(steps: EmittedStep[]): string {
  return steps
    .map((s, index) => {
      const at = "step " + (index + 1) + " ";
      const loop = s.loop == null ? [] : s.loop.map((p) => coord(p[0], at + "loop") + ":" + coord(p[1], at + "loop"));
      const unlocks = s.unlocks == null ? [] : s.unlocks.map((id) => int(id, at + "unlocks"));
      return [
        TYPE_LETTERS[s.type],
        int(s.uiMapId, at + "uiMapId"),
        coord(s.x, at + "x"),
        coord(s.y, at + "y"),
        int(s.questId ?? null, at + "questId"),
        int(s.objectiveIndex ?? null, at + "objectiveIndex"),
        int(s.npcId ?? null, at + "npcId"),
        int(s.taxiNodeId ?? null, at + "taxiNodeId"),
        loop.join(","),
        int(s.targetLevel, at + "targetLevel"),
        int(s.targetXpIntoLevel, at + "targetXpIntoLevel"),
        int(s.estCostSeconds, at + "estCostSeconds"),
        int(s.estXpGain, at + "estXpGain"),
        unlocks.join(","),
        int(s.races ?? null, at + "races"),
      ].join(";");
    })
    .join("\n");
}

function parseNumber(text: string, name: string, line: number, integer: boolean): number {
  const value = Number(text);
  const bad = text === "" || value !== value || value === Infinity || value === -Infinity || (integer && Math.floor(value) !== value);
  if (bad) throw new Error("decodeSteps: line " + line + ": " + name + " is not a valid number: '" + text + "'");
  return value;
}

function parseList(text: string, name: string, line: number): string[] {
  return text === "" ? [] : text.split(",").map((part) => {
    if (part === "") throw new Error("decodeSteps: line " + line + ": empty entry in " + name);
    return part;
  });
}

export function decodeSteps(text: string): EmittedStep[] {
  const out: EmittedStep[] = [];
  if (text === "") return out;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const f = lines[i].split(";");
    if (f.length !== FIELD_COUNT) throw new Error("decodeSteps: line " + line + ": expected " + FIELD_COUNT + " fields, got " + f.length);
    const type = LETTER_TYPES[f[0]];
    if (type == null || f[0].length !== 1) throw new Error("decodeSteps: line " + line + ": unknown step type '" + f[0] + "'");
    const step: EmittedStep = {
      type,
      uiMapId: parseNumber(f[1], "uiMapId", line, true),
      x: parseNumber(f[2], "x", line, false),
      y: parseNumber(f[3], "y", line, false),
      targetLevel: parseNumber(f[9], "targetLevel", line, true),
      targetXpIntoLevel: parseNumber(f[10], "targetXpIntoLevel", line, true),
      estCostSeconds: parseNumber(f[11], "estCostSeconds", line, true),
      estXpGain: parseNumber(f[12], "estXpGain", line, true),
    };
    if (f[4] !== "") step.questId = parseNumber(f[4], "questId", line, true);
    if (f[5] !== "") step.objectiveIndex = parseNumber(f[5], "objectiveIndex", line, true);
    if (f[6] !== "") step.npcId = parseNumber(f[6], "npcId", line, true);
    if (f[7] !== "") step.taxiNodeId = parseNumber(f[7], "taxiNodeId", line, true);
    const loop = parseList(f[8], "loop", line);
    if (loop.length > 0) {
      step.loop = loop.map((pair) => {
        const parts = pair.split(":");
        if (parts.length !== 2) throw new Error("decodeSteps: line " + line + ": bad loop point '" + pair + "'");
        return [parseNumber(parts[0], "loop x", line, false), parseNumber(parts[1], "loop y", line, false)];
      });
    }
    const unlocks = parseList(f[13], "unlocks", line);
    if (unlocks.length > 0) step.unlocks = unlocks.map((id) => parseNumber(id, "unlocks", line, true));
    if (f[14] !== "") step.races = parseNumber(f[14], "races", line, true);
    out.push(step);
  }
  return out;
}

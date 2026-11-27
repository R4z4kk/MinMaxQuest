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
  if (value !== value || Math.floor(value) !== value) throw new Error("encodeSteps: " + name + " must be an integer, got " + value);
  return String(value);
}

function coord(value: number): string {
  return value.toFixed(2);
}

export function encodeSteps(steps: EmittedStep[]): string {
  return steps
    .map((s, index) => {
      const at = "step " + (index + 1) + " ";
      const loop = s.loop == null ? [] : s.loop.map((p) => coord(p[0]) + ":" + coord(p[1]));
      const unlocks = s.unlocks == null ? [] : s.unlocks.map((id) => int(id, at + "unlocks"));
      return [
        TYPE_LETTERS[s.type],
        int(s.uiMapId, at + "uiMapId"),
        coord(s.x),
        coord(s.y),
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

function parseNumber(text: string, name: string, line: number): number {
  const value = Number(text);
  if (text === "" || value !== value) throw new Error("decodeSteps: line " + line + ": " + name + " is not a number: '" + text + "'");
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
      uiMapId: parseNumber(f[1], "uiMapId", line),
      x: parseNumber(f[2], "x", line),
      y: parseNumber(f[3], "y", line),
      targetLevel: parseNumber(f[9], "targetLevel", line),
      targetXpIntoLevel: parseNumber(f[10], "targetXpIntoLevel", line),
      estCostSeconds: parseNumber(f[11], "estCostSeconds", line),
      estXpGain: parseNumber(f[12], "estXpGain", line),
    };
    if (f[4] !== "") step.questId = parseNumber(f[4], "questId", line);
    if (f[5] !== "") step.objectiveIndex = parseNumber(f[5], "objectiveIndex", line);
    if (f[6] !== "") step.npcId = parseNumber(f[6], "npcId", line);
    if (f[7] !== "") step.taxiNodeId = parseNumber(f[7], "taxiNodeId", line);
    const loop = parseList(f[8], "loop", line);
    if (loop.length > 0) {
      step.loop = loop.map((pair) => {
        const parts = pair.split(":");
        if (parts.length !== 2) throw new Error("decodeSteps: line " + line + ": bad loop point '" + pair + "'");
        return [parseNumber(parts[0], "loop x", line), parseNumber(parts[1], "loop y", line)];
      });
    }
    const unlocks = parseList(f[13], "unlocks", line);
    if (unlocks.length > 0) step.unlocks = unlocks.map((id) => parseNumber(id, "unlocks", line));
    if (f[14] !== "") step.races = parseNumber(f[14], "races", line);
    out.push(step);
  }
  return out;
}

const ACCENTS: [string, string][] = [
  ["à", "a"], ["â", "a"], ["ä", "a"], ["á", "a"], ["ã", "a"], ["å", "a"],
  ["ç", "c"],
  ["é", "e"], ["è", "e"], ["ê", "e"], ["ë", "e"],
  ["í", "i"], ["ì", "i"], ["î", "i"], ["ï", "i"],
  ["ñ", "n"],
  ["ó", "o"], ["ò", "o"], ["ô", "o"], ["ö", "o"], ["õ", "o"],
  ["ú", "u"], ["ù", "u"], ["û", "u"], ["ü", "u"],
  ["ý", "y"], ["ÿ", "y"],
  ["À", "a"], ["Â", "a"], ["Ä", "a"], ["Á", "a"], ["Ã", "a"], ["Å", "a"],
  ["Ç", "c"],
  ["É", "e"], ["È", "e"], ["Ê", "e"], ["Ë", "e"],
  ["Í", "i"], ["Ì", "i"], ["Î", "i"], ["Ï", "i"],
  ["Ñ", "n"],
  ["Ó", "o"], ["Ò", "o"], ["Ô", "o"], ["Ö", "o"], ["Õ", "o"],
  ["Ú", "u"], ["Ù", "u"], ["Û", "u"], ["Ü", "u"],
  ["Ý", "y"],
];

const CODE_0 = 48;
const CODE_9 = 57;
const CODE_A = 97;
const CODE_Z = 122;
const FIRST_NON_ASCII = 128;

function isWordCode(code: number): boolean {
  return (code >= CODE_0 && code <= CODE_9) || (code >= CODE_A && code <= CODE_Z) || code >= FIRST_NON_ASCII;
}

// Lowercase, accents stripped, punctuation turned into single spaces. Lua strings are bytes: non-ASCII bytes are kept.
export function normalizeTaxiName(name: string): string {
  let text = name;
  for (const [from, to] of ACCENTS) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  text = text.toLowerCase();
  let out = "";
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    if (isWordCode(text.charCodeAt(i))) {
      if (pendingSpace && out.length > 0) out += " ";
      pendingSpace = false;
      out += text.charAt(i);
    } else {
      pendingSpace = true;
    }
  }
  return out;
}

// 1-based slot index, as TakeTaxiNode expects.
export function findTaxiIndex(names: string[], targetName: string): number | null {
  const wanted = normalizeTaxiName(targetName);
  for (let i = 0; i < names.length; i++) {
    if (normalizeTaxiName(names[i]) === wanted) return i + 1;
  }
  return null;
}

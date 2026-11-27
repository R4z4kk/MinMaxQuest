export interface TextCount { count: number; singular: boolean }

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The name itself, then the name with any one word pluralised (+s, +es, consonant y -> ies).
function nameForms(name: string): string[] {
  const words = name.split(" ");
  const forms = [name];
  words.forEach((word, i) => {
    const plurals = [`${word}s`, `${word}es`];
    if (/[^aeiou]y$/i.test(word)) plurals.push(`${word.slice(0, -1)}ies`);
    for (const plural of plurals) forms.push([...words.slice(0, i), plural, ...words.slice(i + 1)].join(" "));
  });
  return forms;
}

const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
// Digits or a spelled-out number up to ninety-nine ("five", "twenty-four").
const NUMBER = `\\d+|(?:${TENS.join("|")})(?:[- ](?:${UNITS.slice(0, 9).join("|")}))?|${[...UNITS].reverse().join("|")}`;

function numberValue(text: string): number {
  if (/^\d+$/.test(text)) return Number(text);
  const [first, second] = text.toLowerCase().split(/[- ]/);
  const tens = TENS.indexOf(first);
  if (tens < 0) return UNITS.indexOf(first) + 1;
  return (tens + 2) * 10 + (second == null ? 0 : UNITS.indexOf(second) + 1);
}

// A capitalised word right after the match means the target is only the start of a longer name.
const LONGER_NAME = /^\s+[A-Z]/;
// "the bottles of <name>": a plural measure word means an unknown quantity, not one.
const PLURAL_MEASURE = /\b[a-z]+s\s+of\s+$/i;

// Explicit numbers win; with none, a name that only appears in its singular form counts 1.
export function textCount(text: string[] | null, targetName: string): TextCount | null {
  const name = targetName.trim();
  if (text == null || name === "") return null;
  const forms = nameForms(name).sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
  const target = `${/^\w/.test(name) ? "\\b" : ""}(?<name>${forms})(?!\\w)`;
  const counted = [
    new RegExp(`(?<![\\w.,-])(?<n>${NUMBER})\\s+(?:(?:[a-z]+\\s+)?of\\s+)?${target}`, "gi"),
    new RegExp(`${target}\\s*x\\s*(?<n>\\d+)(?!\\d)`, "gi"),
    new RegExp(`${target}\\s*\\(\\s*(?<n>\\d+)\\s*\\)`, "gi"),
  ];
  const bare = new RegExp(target, "gi");
  const isLonger = (line: string, match: RegExpMatchArray): boolean => LONGER_NAME.test(line.slice((match.index ?? 0) + match[0].length));
  const found = new Set<number>();
  for (const line of text) {
    for (const pattern of counted) {
      for (const match of line.matchAll(pattern)) {
        if (pattern === counted[0] && isLonger(line, match)) continue;
        const count = numberValue(match.groups?.n ?? "");
        if (Number.isInteger(count) && count > 0) found.add(count);
      }
    }
  }
  if (found.size > 0) return found.size === 1 ? { count: [...found][0], singular: false } : null;
  let singular = false;
  for (const line of text) {
    for (const match of line.matchAll(bare)) {
      if (isLonger(line, match)) continue;
      if (PLURAL_MEASURE.test(line.slice(0, match.index ?? 0))) return null;
      if ((match.groups?.name ?? "").toLowerCase() !== name.toLowerCase()) return null;
      singular = true;
    }
  }
  return singular ? { count: 1, singular: true } : null;
}

export function parseCount(text: string[] | null, targetName: string): number | null {
  return textCount(text, targetName)?.count ?? null;
}

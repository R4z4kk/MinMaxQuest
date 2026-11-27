function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A capitalised word right after the match means the target is only the start of a longer name.
const LONGER_NAME = /^\s+[A-Z]/;

export function parseCount(text: string[] | null, targetName: string): number | null {
  const name = targetName.trim();
  if (text == null || name === "") return null;
  const target = `${/^\w/.test(name) ? "\\b" : ""}${escapeRegex(name)}(?:s|es)?(?!\\w)`;
  const patterns = [
    new RegExp(`(?<![\\d.,])(\\d+)\\s+(?:[a-z]+\\s+of\\s+)?${target}`, "gi"),
    new RegExp(`${target}\\s*x\\s*(\\d+)(?!\\d)`, "gi"),
    new RegExp(`${target}\\s*\\(\\s*(\\d+)\\s*\\)`, "gi"),
  ];
  const found = new Set<number>();
  for (const line of text) {
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        if (pattern === patterns[0] && LONGER_NAME.test(line.slice(match.index + match[0].length))) continue;
        const count = Number(match[1]);
        if (Number.isInteger(count) && count > 0) found.add(count);
      }
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

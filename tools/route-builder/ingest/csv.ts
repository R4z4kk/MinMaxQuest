// RFC 4180: quoted fields may hold commas, doubled quotes and newlines.
function records(text: string, label: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (quoted) throw new Error(`${label}: unterminated quoted field`);
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string, label: string): Record<string, string>[] {
  const [header, ...body] = records(text, label);
  if (header == null) throw new Error(`${label}: empty file`);
  return body.map((fields, i) => {
    if (fields.length !== header.length) {
      throw new Error(`${label}: row ${i + 2} has ${fields.length} fields, header has ${header.length}`);
    }
    return Object.fromEntries(header.map((name, j) => [name, fields[j]]));
  });
}

export function csvNumber(row: Record<string, string>, column: string, label: string, rowNumber: number): number {
  const raw = row[column];
  const value = raw == null || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label}: row ${rowNumber} has no numeric ${column}`);
  return value;
}

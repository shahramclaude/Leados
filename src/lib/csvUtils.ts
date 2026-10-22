// src/lib/csvUtils.ts
//
// Minimal, dependency-free RFC4180-ish CSV parser/serializer used by the CSV
// connector (src/lib/platform/connectors/csvConnector.ts) and by export
// integrity (src/lib/export.ts).
//
// DOCUMENTED LIMITS (honesty rule):
//  - Only comma-delimited CSV is supported (no TSV/semicolon auto-detect).
//  - Quoted fields support embedded commas, newlines and doubled "" escapes.
//  - A row whose column count does not match the header is treated as
//    MALFORMED and reported in `errors`, never silently coerced (no padding
//    with empty strings, no truncation) — callers decide whether to
//    quarantine or reject.
//  - Byte-order-mark (BOM) on the first header cell is stripped.
//  - Excel ".xlsx" binary workbooks are NOT parsed here; "CSV/Excel" support
//    means "Excel-exported CSV". A true XLSX binary connector is a documented
//    gap (see docs/DATA_PLATFORM_PART34.md).

export interface CsvParseError {
  rowIndex: number; // 0-based, within data rows (excludes header)
  message: string;
  raw: string;
}

export interface CsvParseResult {
  header: string[];
  rows: string[][];
  errors: CsvParseError[];
}

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/** Tokenizes raw CSV text into rows of raw string cells, honoring quoting. */
function tokenize(input: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  // flush trailing cell/row if the file doesn't end with a newline
  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop fully-empty trailing rows (trailing newline artifacts)
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function parseCsv(input: string): CsvParseResult {
  if (!input || !input.trim()) {
    return { header: [], rows: [], errors: [{ rowIndex: -1, message: "Empty file", raw: "" }] };
  }

  const tokenized = tokenize(input);
  if (tokenized.length === 0) {
    return { header: [], rows: [], errors: [{ rowIndex: -1, message: "No rows found", raw: "" }] };
  }

  const header = tokenized[0].map((h) => h.trim());
  const dataRows = tokenized.slice(1);
  const errors: CsvParseError[] = [];
  const rows: string[][] = [];

  dataRows.forEach((r, idx) => {
    if (r.length !== header.length) {
      errors.push({
        rowIndex: idx,
        message: `Expected ${header.length} columns, found ${r.length}`,
        raw: r.join(","),
      });
      return; // never coerce a malformed row into the clean row set
    }
    rows.push(r);
  });

  return { header, rows, errors };
}

/** Escapes a single CSV field per RFC4180 (quotes when needed). */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [header.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvField(cell === null || cell === undefined ? "" : String(cell))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Converts header + rows into array-of-objects keyed by header name. */
export function csvRowsToObjects(header: string[], rows: string[][]): Array<Record<string, string>> {
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    return obj;
  });
}

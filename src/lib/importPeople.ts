// CSV import pipeline with upload limits, content sniffing, and a
// quarantine step (Part 17-C). Nothing is written to the database until
// every row has been parsed and validated; any row that fails validation or
// looks dangerous quarantines the *entire* import (fail closed) rather than
// silently skipping rows, so partial/poisoned imports cannot slip through.
import { z } from "zod";
import { importRowSchema, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/validation/schemas";

export type ImportIssue = { row: number; message: string };

export type ImportResult =
  | { ok: true; rows: z.infer<typeof importRowSchema>[] }
  | { ok: false; quarantined: true; issues: ImportIssue[] };

// Known magic bytes for formats we must never treat as a CSV even if the
// client lies about Content-Type (content sniffing).
const BINARY_SIGNATURES: Array<{ bytes: number[]; name: string }> = [
  { bytes: [0x4d, 0x5a], name: "Windows executable (MZ)" },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], name: "ELF executable" },
  { bytes: [0x50, 0x4b, 0x03, 0x04], name: "ZIP/Office archive" },
  { bytes: [0x25, 0x50, 0x44, 0x46], name: "PDF" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], name: "PNG" },
  { bytes: [0xff, 0xd8, 0xff], name: "JPEG" },
];

function sniffBinary(buffer: Buffer): string | null {
  for (const sig of BINARY_SIGNATURES) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) {
      return sig.name;
    }
  }
  // Reject NUL bytes anywhere in the first chunk — never valid in a text CSV.
  if (buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)) {
    return "binary content (NUL byte detected)";
  }
  return null;
}

/** Neutralise spreadsheet formula injection (CSV/Excel "DDE" attacks). */
function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function parseCsv(text: string): string[][] {
  // Minimal, dependency-free RFC 4180 parser (quoted fields, escaped quotes,
  // CRLF/LF). Deliberately simple and auditable rather than pulling in a
  // third-party CSV parser for a 3-column import.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function processImportUpload(buffer: Buffer): ImportResult {
  if (buffer.byteLength === 0) {
    return { ok: false, quarantined: true, issues: [{ row: 0, message: "empty file" }] };
  }
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      quarantined: true,
      issues: [{ row: 0, message: `file exceeds ${MAX_IMPORT_BYTES} byte limit` }],
    };
  }
  const sniffed = sniffBinary(buffer);
  if (sniffed) {
    return {
      ok: false,
      quarantined: true,
      issues: [{ row: 0, message: `rejected: content sniffed as ${sniffed}, not CSV text` }],
    };
  }

  const text = buffer.toString("utf8");
  const rawRows = parseCsv(text);
  if (rawRows.length === 0) {
    return { ok: false, quarantined: true, issues: [{ row: 0, message: "no rows found" }] };
  }
  if (rawRows.length - 1 > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      quarantined: true,
      issues: [{ row: 0, message: `import exceeds ${MAX_IMPORT_ROWS} row limit` }],
    };
  }

  const [header, ...dataRows] = rawRows;
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());
  const expected = ["fullname", "email", "phone"];
  if (!expected.every((col) => normalizedHeader.includes(col))) {
    return {
      ok: false,
      quarantined: true,
      issues: [{ row: 0, message: `header must contain columns: ${expected.join(", ")}` }],
    };
  }

  const issues: ImportIssue[] = [];
  const rows: z.infer<typeof importRowSchema>[] = [];

  dataRows.forEach((cells, idx) => {
    const record: Record<string, string> = {};
    normalizedHeader.forEach((col, colIdx) => {
      record[col] = neutralizeFormula((cells[colIdx] ?? "").trim());
    });
    const candidate = {
      fullName: record.fullname,
      email: record.email || "",
      phone: record.phone || "",
    };
    const parsed = importRowSchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push({ row: idx + 2, message: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    rows.push(parsed.data);
  });

  if (issues.length > 0) {
    // Fail closed: quarantine the whole batch rather than importing the
    // rows that happened to validate.
    return { ok: false, quarantined: true, issues };
  }

  return { ok: true, rows };
}

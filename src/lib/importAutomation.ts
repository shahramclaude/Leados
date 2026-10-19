import type { Domain, NewLeadosEvent } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// importAutomation — detects the likely source tool of a pasted CSV/JSON
// blob and maps its columns onto Leados event types. Heuristic, not ML:
// every rule is a simple header-pattern match, documented inline.
// ─────────────────────────────────────────────────────────────────────────

export type DetectedSource = "google_sheets" | "excel_csv" | "notion_export" | "jira_csv" | "unknown";

export interface ImportPreview {
  detectedSource: DetectedSource;
  rowCount: number;
  events: NewLeadosEvent[];
  summary: string[];
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

function detectSource(headers: string[], raw: string): DetectedSource {
  const lower = headers.map((h) => h.toLowerCase());
  if (lower.includes("issue key") || lower.includes("issue type")) return "jira_csv";
  if (raw.includes("| ---") || raw.includes("|---")) return "notion_export";
  if (lower.includes("owner") && lower.includes("status") && lower.includes("due date")) return "google_sheets";
  if (raw.includes(";") && !raw.includes(",")) return "excel_csv";
  if (headers.length > 0) return "excel_csv";
  return "unknown";
}

function parseNotionTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  if (lines.length === 0) return { headers: [], rows: [] };
  const clean = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const headers = clean(lines[0]);
  const rows = lines.slice(1).filter((l) => !/^[-| ]+$/.test(l)).map(clean);
  return { headers, rows };
}

function col(headers: string[], row: string[], ...names: string[]): string {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (idx >= 0 && row[idx] !== undefined) return row[idx];
  }
  return "";
}

export function parseImport(raw: string): ImportPreview {
  let headers: string[] = [];
  let rows: string[][] = [];
  let detectedSource: DetectedSource = "unknown";

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      const arr = Array.isArray(json) ? json : [json];
      headers = arr.length ? Object.keys(arr[0]) : [];
      rows = arr.map((obj: Record<string, unknown>) => headers.map((h) => String(obj[h] ?? "")));
      detectedSource = "unknown";
    } catch {
      // fall through to CSV/markdown parsing
    }
  }

  if (headers.length === 0) {
    if (trimmed.includes("|") && trimmed.includes("\n|")) {
      ({ headers, rows } = parseNotionTable(trimmed));
      detectedSource = "notion_export";
    } else {
      ({ headers, rows } = parseCsv(trimmed));
      detectedSource = detectSource(headers, trimmed);
    }
  } else {
    detectedSource = "unknown";
  }

  const events: NewLeadosEvent[] = [];
  const now = new Date().toISOString();
  const domain: Domain = "execution";

  for (const row of rows) {
    const name = col(headers, row, "Name", "Title", "Summary", "Issue summary");
    const status = col(headers, row, "Status");
    const assignee = col(headers, row, "Assignee", "Owner");
    const due = col(headers, row, "Due Date", "Due", "Target date");
    const storyPoints = col(headers, row, "Story Points", "Points", "Velocity");

    if (name) {
      events.push({ type: "person.added", domain: "people", entityId: null, ts: now, data: { name, role: assignee || "Contributor", domain: "people", startDate: now, performance: 60, potential: 60, source: "import" }, source: "import" });
    }
    if (status) {
      events.push({ type: "goal.progress", domain, entityId: null, ts: now, data: { goalId: "imported", keyResultId: "imported-kr", current: status.toLowerCase().includes("done") ? 100 : 40, statusLabel: status }, source: "import" });
    }
    if (due && assignee) {
      events.push({ type: "commitment.made", domain, entityId: null, ts: now, data: { title: name || "Imported commitment", domain, dueDate: due, assignee }, source: "import" });
    }
    if (storyPoints) {
      events.push({ type: "metric.recorded", domain: "rd", entityId: null, ts: now, data: { key: "rd_velocity", value: Number(storyPoints) || 0 }, source: "import" });
    }
  }

  const summary = [
    `Detected source: ${detectedSource.replace("_", " ")}.`,
    `Parsed ${rows.length} row(s) across ${headers.length} column(s).`,
    `Will create ${events.length} event(s): ${[...new Set(events.map((e) => e.type))].join(", ") || "none"}.`,
  ];

  return { detectedSource, rowCount: rows.length, events, summary };
}

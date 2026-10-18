"use client";

import { useState } from "react";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import EmptyState from "../ui/EmptyState";
import DataTable, { type ColDef } from "../ui/DataTable";
import useSimulatedLoad from "../ui/useSimulatedLoad";

interface LogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
}

function LogIllustration() {
  return (
    <svg width="110" height="80" viewBox="0 0 110 80" fill="none" aria-hidden>
      <rect x="18" y="12" width="54" height="56" rx="5" stroke="var(--border-default)" strokeWidth="1.5" />
      <path d="M28 26h34M28 38h34M28 50h20" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="84" cy="54" r="16" stroke="var(--accent-indigo)" strokeWidth="1.5" />
      <path d="M84 47v8l5 4" stroke="var(--accent-indigo)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const seedEntries: LogEntry[] = [
  { id: "A-5001", timestamp: "2026-02-11 09:14", actor: "A. Mensah", action: "Toggled rule off", target: "F-1021" },
  { id: "A-5002", timestamp: "2026-02-11 10:02", actor: "R. Okafor", action: "Applied scenario preset", target: "Margin Recovery" },
  { id: "A-5003", timestamp: "2026-02-10 16:41", actor: "L. Fischer", action: "Simulated recurrence", target: "F-1037" },
  { id: "A-5004", timestamp: "2026-02-10 08:05", actor: "S. Park", action: "Acknowledged finding", target: "F-1033" },
  { id: "A-5005", timestamp: "2026-02-09 13:22", actor: "N. Ibrahim", action: "Reset workspace", target: "All domains" },
];

const columns: ColDef<LogEntry>[] = [
  { key: "timestamp", label: "Timestamp", sortable: true, width: "160px", render: (v) => <span className="font-data">{String(v)}</span> },
  { key: "actor", label: "Actor", sortable: true },
  { key: "action", label: "Action", sortable: true },
  { key: "target", label: "Target", sortable: true },
];

export default function LogView() {
  const loading = useSimulatedLoad();
  const [entries, setEntries] = useState<LogEntry[]>([]);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Full trail of every toggle, preset, recurrence, and reset action."
        actions={
          entries.length > 0 ? (
            <button
              onClick={() => setEntries([])}
              className="rounded-lg border px-3 py-1.5 font-medium transition-colors focus-visible:outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}
            >
              Clear log
            </button>
          ) : undefined
        }
      />

      <Panel title="Activity" subtitle={`${entries.length} entries`}>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-9 rounded-lg" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            illustration={<LogIllustration />}
            title="No activity recorded yet"
            description="Every toggle, preset application, and reset will appear here as a timestamped entry."
            actionLabel="Generate sample entries"
            onAction={() => setEntries(seedEntries)}
          />
        ) : (
          <DataTable columns={columns} rows={entries} getRowId={(r) => r.id} />
        )}
      </Panel>
    </div>
  );
}

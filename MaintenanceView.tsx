import { useMemo, useState } from "react";
import type { Store } from "../automation/types";
import { dataHygiene, exportEventsAsJSON, fmtDate } from "../automation/hygiene";
import { importSuggestions } from "../automation/importAutomation";
import { runMaintenance } from "../automation/maintenance";
import { Button, Card, Pill, SectionTitle } from "../components/shared";

export function MaintenanceView({
  store,
  onRunMaintenance,
  onClearStaleSuppressions,
  onRecordExport,
  onSimulateImport,
}: {
  store: Store;
  onRunMaintenance: () => void;
  onClearStaleSuppressions: () => void;
  onRecordExport: () => void;
  onSimulateImport: () => { before: Store; after: Store };
}) {
  const today = Date.now();
  const hygiene = useMemo(() => dataHygiene(store, today), [store]);
  const [importReport, setImportReport] = useState<ReturnType<typeof importSuggestions> | null>(null);
  const preview = useMemo(() => runMaintenance(store, today), [store]);

  const auditTail = [...store.audit].sort((a, b) => b.at - a.at).slice(0, 25);

  const runImportDemo = () => {
    const { before, after } = onSimulateImport();
    setImportReport(importSuggestions(before, after, today));
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle sub="Silent tasks that run once per session. Every action here is read-only or produces a labeled audit entry — never a silent write.">
            Auto-Maintenance (Tasks 1–6)
          </SectionTitle>
          <Button variant="secondary" onClick={onRunMaintenance}>
            Re-run maintenance now
          </Button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Preview if run right now: {preview.entries.length} audit line(s), {preview.cadenceDriftFindings.length} calibration nudge(s), {preview.schemaProblems.length} schema issue(s).
        </p>
        {preview.cadenceDriftFindings.length > 0 && (
          <ul className="mb-3 space-y-2">
            {preview.cadenceDriftFindings.map((f) => (
              <li key={f.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <Pill tone="amber">nudge · sev-1</Pill>
                  <span className="font-mono text-[11px] text-slate-400">{f.key}</span>
                </div>
                {f.title}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle sub="meta.audit tail — every automated action is labeled, reversible or labeled irreversible, and comprehensible without jargon.">
          #/data → Audit tail
        </SectionTitle>
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {auditTail.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm odd:bg-slate-50">
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-slate-400">{fmtDate(a.at)}</span>
              <Pill tone={a.action === "auto-maintenance" ? "violet" : a.action === "event.undone" ? "amber" : "slate"}>{a.action}</Pill>
              <span className="text-slate-700">{a.message}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Read-only analysis. No deletion path exists — exports are for your archives, originals stay in the log.">Data Hygiene</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <h4 className="text-sm font-semibold text-slate-800">Orphaned events</h4>
            <p className="text-xs text-slate-500">Dangling personId references (person archived). Impact on findings: none (skipped).</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">{hygiene.orphanedEvents.count}</span> event(s)
            </p>
            <Button
              variant="secondary"
              className="mt-2"
              disabled={hygiene.orphanedEvents.count === 0}
              onClick={() => exportEventsAsJSON(hygiene.orphanedEvents.events, "orphaned-events.json")}
            >
              Export orphaned events as JSON
            </Button>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <h4 className="text-sm font-semibold text-slate-800">Cold data (&gt;730d)</h4>
            <p className="text-xs text-slate-500">Older than the longest finding window (180d calibration) — cannot contribute to any active finding.</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">{hygiene.coldData.count}</span> event(s) · ~{hygiene.coldData.estimatedBytes} bytes
            </p>
            <Button
              variant="secondary"
              className="mt-2"
              disabled={hygiene.coldData.count === 0}
              onClick={() => exportEventsAsJSON(hygiene.coldData.events, "cold-data.json")}
            >
              Export cold data
            </Button>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <h4 className="text-sm font-semibold text-slate-800">Coverage gaps</h4>
            <p className="text-xs text-slate-500">Logging gaps &gt;14d — findings for those periods are based on thin data and labeled accordingly.</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {hygiene.coverageGaps.length === 0 && <li className="text-slate-400">No gaps &gt;14d detected.</li>}
              {hygiene.coverageGaps.map((g, i) => (
                <li key={i}>
                  {fmtDate(g.startAt)} → {fmtDate(g.endAt)} ({g.days}d gap)
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <h4 className="text-sm font-semibold text-slate-800">Setting drift (never customized)</h4>
            <ul className="mt-2 space-y-2 text-xs text-slate-600">
              {hygiene.settingDrift.map((s) => (
                <li key={s.key}>
                  <span className="font-mono text-slate-800">{s.key}</span> = {s.current} (default). {s.basis}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle sub="Orphaned references are offered for cleanup only on explicit confirmation — never auto-removed.">Suppressed findings</SectionTitle>
          <Button variant="secondary" onClick={onClearStaleSuppressions}>
            Remove stale suppressions
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {store.suppressed.map((s) => (
            <li key={s.key} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
              <span className="font-mono text-xs">{s.key}</span>
              <span className="flex items-center gap-2">
                <Pill tone={s.reason === "snoozed" ? "amber" : "slate"}>{s.reason}</Pill>
                {!s.entityAlive && <Pill tone="violet">entity gone — cannot re-fire</Pill>}
              </span>
            </li>
          ))}
          {store.suppressed.length === 0 && <li className="text-slate-400">No suppressed findings.</li>}
        </ul>
      </Card>

      <Card>
        <SectionTitle sub="Simulated import.mergeInto() — this demo has no real multi-store merge pipeline; it fabricates a plausible before/after to exercise the analysis.">
          Import Suggestions
        </SectionTitle>
        <Button onClick={runImportDemo}>Simulate an import</Button>
        {importReport && (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              <strong>{importReport.newPeople.length}</strong> new people imported: {importReport.newPeople.map((p) => p.name).join(", ") || "none"}. Assign
              cadence days for them in Roster (not modeled in this demo beyond defaulting to 14d).
            </p>
            <p>
              <strong>{importReport.newEventTypes.length}</strong> event type(s) not in our known vocabulary — kept as inert unknown events per the import
              doctrine: {importReport.newEventTypes.join(", ") || "none"}.
            </p>
            <p>
              Findings before: <strong>{importReport.findingsBefore}</strong> → after: <strong>{importReport.findingsAfter}</strong> (
              {importReport.newFindingKeys.length} new).
            </p>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Backup reminder</SectionTitle>
        <p className="text-sm text-slate-600">Last export recorded in audit tail. Mark one now to reset the reminder:</p>
        <Button className="mt-2" variant="secondary" onClick={onRecordExport}>
          Record a manual export
        </Button>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useAppState } from "../lib/AppContext";
import { runInference } from "../lib/inference";
import { findSimilarIncidents, memorySummary, recordIncident } from "../lib/institutionalMemory";
import { Card, SectionTitle, SeverityBadge, Button, Pill } from "../components/ui";

export function MemoryView() {
  const { state, setState } = useAppState();
  const findings = useMemo(() => runInference(state.signalBoard), [state.signalBoard]);
  const [note, setNote] = useState("");
  const summary = memorySummary(state.incidents);

  const save = (findingId: string) => {
    const finding = findings.find((f) => f.id === findingId);
    if (!finding) return;
    const incident = recordIncident(finding, note || "No note provided.");
    setState((prev) => ({ ...prev, incidents: [...prev.incidents, incident] }));
    setNote("");
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Institutional Memory"
        subtitle="js/institutional_memory.js — persisted incident log (localStorage) plus similarity lookup against past findings."
      />
      <Card>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">By category</div>
        <div className="flex flex-wrap gap-2">
          {summary.length === 0 && <span className="text-sm text-slate-500">No incidents recorded yet.</span>}
          {summary.map((s) => (
            <Pill key={s.category}>
              {s.category}: {s.count}
            </Pill>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Record current finding" subtitle="Save an active finding into institutional memory with a note." />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you decide / what happened?"
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="space-y-2">
          {findings.length === 0 && <p className="text-sm text-slate-500">No active findings to record.</p>}
          {findings.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
              <span>
                {f.title} <SeverityBadge severity={f.severity} />
              </span>
              <Button onClick={() => save(f.id)}>Record</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Similar past incidents" subtitle="Matched against current active findings by shared rule IDs + category." />
        {findings.length === 0 && <p className="text-sm text-slate-500">No active findings.</p>}
        {findings.map((f) => {
          const similar = findSimilarIncidents(state.incidents, f);
          return (
            <div key={f.id} className="mb-3">
              <div className="text-sm font-medium text-slate-700">{f.title}</div>
              {similar.length === 0 ? (
                <p className="text-xs text-slate-400">No similar incidents on record.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {similar.map((s) => (
                    <li key={s.id} className="text-xs text-slate-500">
                      {new Date(s.at).toLocaleString()} — {s.note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

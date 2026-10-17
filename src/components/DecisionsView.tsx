import { useState } from "react";
import { DOMAINS, type DomainKey, type ProjectedDecision } from "../lib/core";

const QUADRANT_LABEL: Record<ProjectedDecision["quadrant"], string> = {
  "fast-call": "Fast call (high impact, reversible)",
  deliberate: "Deliberate (high impact, hard to reverse)",
  escalate: "Escalate (low impact, hard to reverse)",
  delegate: "Delegate (low impact, reversible)",
};

export function DecisionsView({
  decisions,
  onLog,
}: {
  decisions: ProjectedDecision[];
  onLog: (d: { domain: DomainKey; title: string; impact: number; reversibility: number }) => void;
}) {
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState<DomainKey>("ops");
  const [impact, setImpact] = useState(3);
  const [reversibility, setReversibility] = useState(3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Decisions</h1>
        <p className="text-sm text-slate-500">
          Quadrant classifier is a fabricated, disclosed rule (impact &times; reversibility), not a
          validated decision-science model. Decisions older than 21 days are flagged stale.
        </p>
      </div>

      <form
        className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onLog({ domain, title: title.trim(), impact, reversibility });
          setTitle("");
        }}
      >
        <input
          className="sm:col-span-2 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          placeholder="Decision title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200"
          value={domain}
          onChange={(e) => setDomain(e.target.value as DomainKey)}
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <div className="flex gap-3">
          <label className="flex-1 text-xs text-slate-400">
            Impact ({impact})
            <input type="range" min={1} max={5} value={impact} onChange={(e) => setImpact(Number(e.target.value))} className="w-full" />
          </label>
          <label className="flex-1 text-xs text-slate-400">
            Reversibility ({reversibility})
            <input
              type="range"
              min={1}
              max={5}
              value={reversibility}
              onChange={(e) => setReversibility(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>
        <button type="submit" className="sm:col-span-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2 transition">
          Log decision
        </button>
      </form>

      <div className="space-y-2">
        {decisions.length === 0 && <p className="text-sm text-slate-500">No decisions logged yet.</p>}
        {decisions.map((d) => (
          <div key={d.decisionId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-200 truncate">{d.title}</div>
              <div className="text-xs text-slate-500">
                {QUADRANT_LABEL[d.quadrant]} &middot; {d.openDays}d open{d.stale ? " \u2014 STALE" : ""}
              </div>
            </div>
            <span className="text-xs uppercase tracking-wide text-slate-400 shrink-0">{d.domain}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

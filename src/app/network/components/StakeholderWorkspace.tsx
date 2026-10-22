"use client";

import { useEffect, useState } from "react";
import { getJson, patchJson } from "../lib/api";

interface StakeholderRow {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  interest: number;
  influence: number;
  affectedness: number;
  quadrant: "manage_closely" | "keep_satisfied" | "keep_informed" | "monitor";
  engagementPlan: string;
  owner: string;
  relationshipHealth: {
    daysSinceLastInteraction: number | null;
    interactionCount90d: number;
    sentimentBalance: number;
    band: "healthy" | "attention" | "at_risk";
  };
}

interface Commitment {
  id: string;
  stakeholderId: string;
  stakeholderNodeName: string | null;
  description: string;
  promisedBy: string;
  dueDate: string | null;
  status: "open" | "in_progress" | "closed" | "missed";
  evidenceClass: string;
  evidenceRefs: string[];
  overdue: boolean;
}

const QUADRANT_LABEL: Record<string, string> = {
  manage_closely: "Manage closely (high interest, high influence)",
  keep_satisfied: "Keep satisfied (low interest, high influence)",
  keep_informed: "Keep informed (high interest, low influence)",
  monitor: "Monitor (low interest, low influence)",
};

const HEALTH_STYLES: Record<string, string> = {
  healthy: "bg-emerald-100 text-emerald-800 border-emerald-300",
  attention: "bg-amber-100 text-amber-800 border-amber-300",
  at_risk: "bg-red-100 text-red-800 border-red-300",
};

export function StakeholderWorkspace() {
  const [stakeholders, setStakeholders] = useState<StakeholderRow[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<Record<string, string>>({});

  function load() {
    return Promise.all([
      getJson<{ stakeholders: StakeholderRow[] }>("/api/network/stakeholders"),
      getJson<{ commitments: Commitment[] }>("/api/network/commitments"),
    ])
      .then(([s, c]) => {
        setStakeholders(s.stakeholders);
        setCommitments(c.commitments);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load stakeholder data"));
  }

  useEffect(() => {
    getJson<{ stakeholders: StakeholderRow[] }>("/api/network/stakeholders")
      .then((s) => setStakeholders(s.stakeholders))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load stakeholders"));
    getJson<{ commitments: Commitment[] }>("/api/network/commitments")
      .then((c) => setCommitments(c.commitments))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load commitments"));
  }, []);

  async function closeCommitment(id: string) {
    const evidence = evidenceDraft[id]?.trim();
    if (!evidence) {
      setError("Closing a commitment requires at least one evidence reference (e.g. a document link).");
      return;
    }
    try {
      setError(null);
      await patchJson(`/api/network/commitments/${id}`, {
        status: "closed",
        evidenceRefs: [evidence],
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not close commitment");
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <caption className="p-3 text-left text-sm font-medium text-slate-700">
            Stakeholder map — interest × influence × affectedness, with aggregate-safe relationship health
            (counts + cadence only, never message content).
          </caption>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">Stakeholder</th>
              <th scope="col" className="px-3 py-2">Quadrant</th>
              <th scope="col" className="px-3 py-2">Interest</th>
              <th scope="col" className="px-3 py-2">Influence</th>
              <th scope="col" className="px-3 py-2">Affectedness</th>
              <th scope="col" className="px-3 py-2">Relationship health</th>
              <th scope="col" className="px-3 py-2">Engagement plan</th>
              <th scope="col" className="px-3 py-2">Owner</th>
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-medium text-slate-900">
                  {s.nodeName}
                  <div className="text-xs text-slate-500">{s.nodeType}</div>
                </td>
                <td className="px-3 py-2">{QUADRANT_LABEL[s.quadrant]}</td>
                <td className="px-3 py-2">{s.interest}/10</td>
                <td className="px-3 py-2">{s.influence}/10</td>
                <td className="px-3 py-2">{s.affectedness}/10</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${HEALTH_STYLES[s.relationshipHealth.band]}`}
                  >
                    {s.relationshipHealth.band}
                  </span>
                  <div className="mt-1 text-xs text-slate-500">
                    {s.relationshipHealth.daysSinceLastInteraction === null
                      ? "no interactions logged"
                      : `${s.relationshipHealth.daysSinceLastInteraction}d since last contact · ${s.relationshipHealth.interactionCount90d} in last 90d`}
                  </div>
                </td>
                <td className="px-3 py-2">{s.engagementPlan}</td>
                <td className="px-3 py-2">{s.owner}</td>
              </tr>
            ))}
            {stakeholders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No stakeholders yet — seed demo data to populate the workspace.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <caption className="p-3 text-left text-sm font-medium text-slate-700">
            Commitments tracker — promises made → tracked → closed with evidence.
          </caption>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">Stakeholder</th>
              <th scope="col" className="px-3 py-2">Commitment</th>
              <th scope="col" className="px-3 py-2">Promised by</th>
              <th scope="col" className="px-3 py-2">Due</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2">Evidence</th>
              <th scope="col" className="px-3 py-2">Close with evidence</th>
            </tr>
          </thead>
          <tbody>
            {commitments.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">{c.stakeholderNodeName ?? "—"}</td>
                <td className="px-3 py-2">{c.description}</td>
                <td className="px-3 py-2">{c.promisedBy}</td>
                <td className="px-3 py-2">
                  {c.dueDate ? new Date(c.dueDate).toLocaleDateString() : "—"}
                  {c.overdue && <span className="ml-1 text-xs font-medium text-red-700">overdue</span>}
                </td>
                <td className="px-3 py-2">{c.status}</td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {c.evidenceRefs.length > 0 ? c.evidenceRefs.join(", ") : "none"} ({c.evidenceClass})
                </td>
                <td className="px-3 py-2">
                  {c.status !== "closed" ? (
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor={`evidence-${c.id}`}>
                        Evidence reference for {c.description}
                      </label>
                      <input
                        id={`evidence-${c.id}`}
                        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        placeholder="evidence link/ref"
                        value={evidenceDraft[c.id] ?? ""}
                        onChange={(e) => setEvidenceDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => closeCommitment(c.id)}
                        className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-emerald-700">closed</span>
                  )}
                </td>
              </tr>
            ))}
            {commitments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No commitments tracked yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

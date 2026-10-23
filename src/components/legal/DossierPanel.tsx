"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { DossierContent } from "@/lib/legal/citationLint";

interface DossierPayload {
  id: number;
  status: string;
  citationsValid: boolean;
  generatedAt: string;
  accessTier: string;
  content: DossierContent;
  lintReport: { passed: boolean; issues: Array<{ section: string; claimText: string; reason: string }> } | null;
}

export function DossierPanel({ counterpartyId }: { counterpartyId: number }) {
  const [dossier, setDossier] = useState<DossierPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);

  useEffect(() => {
    fetch(`/api/legal/counterparties/${counterpartyId}/dossier`)
      .then((r) => r.json())
      .then((d) => setDossier(d.dossier))
      .finally(() => setLoading(false));
  }, [counterpartyId]);

  async function compile() {
    setCompiling(true);
    try {
      const res = await fetch(`/api/legal/counterparties/${counterpartyId}/dossier`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setDossier(data.dossier);
      else alert(data.error ?? "Compile failed");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-900">Negotiation-prep dossier</p>
          <p className="text-xs text-slate-500">
            Access tier: <code>{dossier?.accessTier ?? "deal_team_only"}</code>. Every claim below must cite a
            confirmed clause span, a contract record, an obligation record, or a seam-tagged ecosystem fact
            (citation lint reused from Part 08).
          </p>
        </div>
        <button
          onClick={compile}
          disabled={compiling}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {compiling ? "Compiling…" : "Compile fresh dossier"}
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && !dossier && (
        <p className="text-sm text-slate-500">No dossier yet. Click &quot;Compile fresh dossier&quot;.</p>
      )}

      {dossier && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={dossier.status} />
            <span className="text-xs text-slate-500">generated {new Date(dossier.generatedAt).toLocaleString()}</span>
          </div>

          {dossier.lintReport && !dossier.lintReport.passed && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-semibold">Citation lint failed — dossier withheld from &quot;ready&quot; status.</p>
              <ul className="mt-2 list-disc pl-5">
                {dossier.lintReport.issues.map((issue, i) => (
                  <li key={i}>
                    [{issue.section}] {issue.reason} — &quot;{issue.claimText}&quot;
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dossier.content.sections.map((section, idx) => (
            <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{section.heading}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {section.claims.map((claim, i) => (
                  <li key={i} className="border-l-2 border-slate-200 pl-3">
                    <p>{claim.text}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      citation:{" "}
                      {claim.citation.kind === "clause"
                        ? `clause #${claim.citation.clauseId} span [${claim.citation.spanStart}, ${claim.citation.spanEnd})`
                        : claim.citation.kind === "contract"
                          ? `contract #${claim.citation.contractId}`
                          : claim.citation.kind === "obligation"
                            ? `obligation #${claim.citation.obligationId}`
                            : claim.citation.provenance}
                    </p>
                  </li>
                ))}
                {section.claims.length === 0 && <li className="text-slate-400">No claims in this section.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

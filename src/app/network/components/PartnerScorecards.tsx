"use client";

import { useEffect, useState } from "react";
import { getJson } from "../lib/api";

interface Scorecard {
  partnerNodeId: string;
  partnerName: string;
  deliveryQuality: number | null;
  concentrationScore: number;
  substitutabilityScore: number;
  riskScore: number;
  evidenceClass: string;
  notes: string;
  linkedRisks: { id: string; title: string; severity: string; status: string }[];
}

const EVIDENCE_LABEL: Record<string, string> = {
  verified_primary: "Verified (primary source)",
  verified_secondary: "Verified (secondary/corroborated)",
  self_reported: "Self-reported",
  inferred: "Inferred / modeled",
};

export function PartnerScorecards() {
  const [cards, setCards] = useState<Scorecard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ scorecards: Scorecard[] }>("/api/network/scorecards")
      .then((r) => setCards(r.scorecards))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p role="alert" className="text-red-700">{error}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Every score below carries an evidence class (Part 27 convention) — when a score blends inputs of
        different trust levels, the overall class shown is the <strong>weakest</strong> contributing one, so a
        verified contract never launders a self-reported delivery claim into looking fully verified.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.partnerNodeId} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{c.partnerName}</h3>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                {EVIDENCE_LABEL[c.evidenceClass] ?? c.evidenceClass}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-500">Delivery quality</dt>
                <dd>{c.deliveryQuality != null ? `${c.deliveryQuality}/100` : "not reported"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Risk score</dt>
                <dd className="font-medium text-red-700">{c.riskScore.toFixed(0)}/100</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Spend concentration</dt>
                <dd>{(c.concentrationScore * 100).toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Substitutability</dt>
                <dd>{(c.substitutabilityScore * 100).toFixed(0)}%</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">{c.notes}</p>
            {c.linkedRisks.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-600">Linked risk register entries:</p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                  {c.linkedRisks.map((r) => (
                    <li key={r.id}>
                      {r.title} ({r.severity}, {r.status})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {cards.length === 0 && (
          <p className="text-sm text-slate-500">No partner scorecards yet — seed demo data first.</p>
        )}
      </div>
    </div>
  );
}

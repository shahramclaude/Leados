"use client";

import { useEffect, useState } from "react";

interface ImpactHistoryItem {
  recommendationId: string;
  interventionTitle: string;
  interventionSlug: string;
  contextKey: string;
  acceptedAt: string;
  outcomes: Array<{ source: string; success: boolean; magnitude: number; verified: boolean; measuredAt: string }>;
  beliefUpdates: Array<{
    beforeMean: number;
    afterMean: number;
    evidenceClassBefore: string;
    evidenceClassAfter: string;
    reason: string;
    at: string;
  }>;
}

const ORG_ID = "demo-org";

export default function ImpactHistoryPage() {
  const [items, setItems] = useState<ImpactHistoryItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/recommender/impact-history?orgId=${ORG_ID}`)
      .then((r) => r.json())
      .then((json) => setItems(json.items));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm text-slate-600">
        <a href="/" className="hover:underline">
          Home
        </a>
        <a href="/action-desk" className="hover:underline">
          Action Desk
        </a>
        <a href="/intervention-library" className="hover:underline">
          Intervention Library
        </a>
        <a href="/impact-history" className="font-semibold text-slate-950">
          Impact History
        </a>
      </nav>

      <h1 className="text-3xl font-semibold text-slate-950">Impact History</h1>
      <p className="mt-1 text-sm text-slate-600">
        Accepted plays, their measured outcomes, and the resulting belief updates — the org&apos;s management R&amp;D
        record.
      </p>

      {!items && <p className="mt-6 text-slate-500">Loading…</p>}
      {items?.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          No accepted recommendations yet for <code>{ORG_ID}</code>. Accept a recommendation on the Action Desk to
          start building this record.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {items?.map((item) => (
          <div key={item.recommendationId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{item.interventionTitle}</h2>
            <p className="text-xs text-slate-500">
              Accepted {new Date(item.acceptedAt).toLocaleString()} · context:{" "}
              <span className="font-mono">{item.contextKey}</span>
            </p>

            <div className="mt-3">
              <h3 className="text-sm font-medium text-slate-800">Measured outcomes</h3>
              {item.outcomes.length === 0 ? (
                <p className="text-xs italic text-slate-400">No measured outcome logged yet.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {item.outcomes.map((o, i) => (
                    <li key={i}>
                      {o.success ? "✅ success" : "❌ no effect"} via {o.source} (magnitude {o.magnitude.toFixed(2)},{" "}
                      {o.verified ? "verified" : "unverified"}) — {new Date(o.measuredAt).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3">
              <h3 className="text-sm font-medium text-slate-800">Belief updates</h3>
              {item.beliefUpdates.length === 0 ? (
                <p className="text-xs italic text-slate-400">No belief updates recorded for this context yet.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {item.beliefUpdates.map((b, i) => (
                    <li key={i}>
                      {Math.round(b.beforeMean * 100)}% → {Math.round(b.afterMean * 100)}% ({b.evidenceClassBefore} →{" "}
                      {b.evidenceClassAfter}) — {b.reason} — {new Date(b.at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

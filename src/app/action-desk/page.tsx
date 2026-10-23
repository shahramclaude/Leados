"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Explain {
  value: number;
  interval: [number, number];
  evidenceClass: string;
  sampleSize: number;
  lastUpdated: string;
}

interface Explainability {
  whyNow: string;
  expectedEffect: string;
  whatItCosts: string;
  whatWeDontKnow: string;
  howToVerify: string;
}

interface RankedRecommendation {
  recommendationId: string;
  intervention: {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    cost: { unit: string; amount: number };
    reversibility: string;
    effort: string;
  };
  effect: Explain;
  score: number;
  scoreBreakdown: { expectedUtility: number; contextFit: number; freshness: number; final: number };
  isSerendipity: boolean;
  explainability: Explainability;
}

type ActionDeskResponse =
  | { status: "ok"; recommendations: RankedRecommendation[]; context: Record<string, string> }
  | { status: "no_confident_recommendation"; reason: string; dataCompleteness: number }
  | { status: "error"; message: string };

const ORG_ID = "demo-org";

const EVIDENCE_COLORS: Record<string, string> = {
  anecdotal: "bg-slate-200 text-slate-700",
  correlational: "bg-amber-100 text-amber-800",
  experimental: "bg-sky-100 text-sky-800",
  causal_replicated: "bg-emerald-100 text-emerald-800",
};

export default function ActionDeskPage() {
  const [data, setData] = useState<ActionDeskResponse | null>(null);
  const [allowSerendipity, setAllowSerendipity] = useState(true);
  const [loading, setLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, "accept" | "reject">>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/recommender/action-desk?orgId=${ORG_ID}&allowSerendipity=${allowSerendipity}`,
    );
    const json = (await res.json()) as ActionDeskResponse;
    setData(json);
    setLoading(false);
  }, [allowSerendipity]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendFeedback(recommendationId: string, action: "accept" | "reject") {
    const reason =
      action === "accept"
        ? "manager chose to adopt this play"
        : window.prompt("Optional: why reject this recommendation?") ?? "no reason given";
    await fetch("/api/recommender/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationId, orgId: ORG_ID, action, reason }),
    });
    setFeedbackSent((s) => ({ ...s, [recommendationId]: action }));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm text-slate-600">
        <a href="/" className="hover:underline">
          Home
        </a>
        <a href="/action-desk" className="font-semibold text-slate-950">
          Action Desk
        </a>
        <a href="/intervention-library" className="hover:underline">
          Intervention Library
        </a>
        <a href="/impact-history" className="hover:underline">
          Impact History
        </a>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Action Desk</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ranked recommendations for <code>{ORG_ID}</code>, with full explainability on every card.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={allowSerendipity}
            onChange={(e) => setAllowSerendipity(e.target.checked)}
          />
          Surprise me (serendipity slot)
        </label>
      </div>

      {loading && <p className="text-slate-500">Loading recommendations…</p>}

      {!loading && data?.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{data.message}</div>
      )}

      {!loading && data?.status === "no_confident_recommendation" && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-medium text-slate-900">No confident recommendation right now.</p>
          <p className="mt-2 text-sm text-slate-600">{data.reason}</p>
          <p className="mt-2 text-xs text-slate-500">
            Data completeness for this context: {Math.round(data.dataCompleteness * 100)}%. We deliberately do
            not pad this list with low-confidence noise.
          </p>
        </div>
      )}

      {!loading && data?.status === "ok" && (
        <div className="space-y-5">
          {data.recommendations.length === 0 && (
            <p className="text-slate-500">No eligible interventions for this context.</p>
          )}
          {data.recommendations.map((r) => (
            <article
              key={r.recommendationId}
              className={`rounded-2xl border bg-white p-6 shadow-sm ${
                r.isSerendipity ? "border-purple-300 ring-1 ring-purple-200" : "border-slate-200"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
                  {r.intervention.category}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${EVIDENCE_COLORS[r.effect.evidenceClass]}`}>
                  {r.effect.evidenceClass}
                </span>
                {r.isSerendipity && (
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                    Surprise me
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">score {r.score.toFixed(3)}</span>
              </div>

              <h2 className="text-xl font-semibold text-slate-950">{r.intervention.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{r.intervention.description}</p>

              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-800">Why now</dt>
                  <dd className="text-slate-600">{r.explainability.whyNow}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">Expected effect</dt>
                  <dd className="text-slate-600">{r.explainability.expectedEffect}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">What it costs</dt>
                  <dd className="text-slate-600">{r.explainability.whatItCosts}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-800">What we don&apos;t know</dt>
                  <dd className="text-slate-600">{r.explainability.whatWeDontKnow}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-800">How to verify</dt>
                  <dd className="text-slate-600">{r.explainability.howToVerify}</dd>
                </div>
              </dl>

              <div className="mt-5 flex items-center gap-3">
                {feedbackSent[r.recommendationId] ? (
                  <span className="text-sm text-slate-500">
                    Feedback recorded: {feedbackSent[r.recommendationId]} (logged for audit only — does not change
                    this play&apos;s measured effect).
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => sendFeedback(r.recommendationId, "accept")}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => sendFeedback(r.recommendationId, "reject")}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import { DEMO_USER_ID } from "@/lib/leaderState/demo";

const HEADERS = { "Content-Type": "application/json", "x-user-id": DEMO_USER_ID };
const COHORT_KEY = "org-wide-weekly-decision-load";
const METRIC_TYPE = "avg-combined-load-score";

export function ResearchOptIn({ suggestedValue }: { suggestedValue: number | null }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [aggregate, setAggregate] = useState<{ suppressed: boolean; cohortSize: number; average?: number } | null>(
    null,
  );

  async function contribute() {
    if (suggestedValue == null) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/leader-state/research", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ cohortKey: COHORT_KEY, metricType: METRIC_TYPE, metricValue: suggestedValue }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  async function loadAggregate() {
    const res = await fetch(
      `/api/leader-state/research?cohortKey=${encodeURIComponent(COHORT_KEY)}&metricType=${encodeURIComponent(METRIC_TYPE)}`,
    );
    const body = await res.json();
    setAggregate(body.result);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="m-0 text-sm font-semibold text-slate-900">Opt-in anonymized research</h3>
      <p className="m-0 text-xs text-slate-500">
        Nothing here is shared by default. If you opt in, only an aggregated figure is ever visible to
        anyone else, and only once at least 5 different people have contributed to that exact cohort and
        metric — fewer than that, the aggregate is suppressed outright, not rounded or fuzzed.
      </p>
      <button
        type="button"
        onClick={contribute}
        disabled={status === "saving" || suggestedValue == null}
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {suggestedValue == null ? "Log decisions first" : `Contribute this week's avg load (${suggestedValue})`}
      </button>
      {status === "saved" ? <p className="m-0 text-xs text-emerald-700">Contributed.</p> : null}
      <button type="button" onClick={loadAggregate} className="text-xs text-slate-600 underline">
        View org aggregate
      </button>
      {aggregate ? (
        <p className="m-0 text-xs text-slate-700">
          {aggregate.suppressed
            ? `Suppressed — only ${aggregate.cohortSize} contributor(s) so far, below the k = 5 threshold.`
            : `Org average: ${aggregate.average} across ${aggregate.cohortSize} contributors.`}
        </p>
      ) : null}
    </div>
  );
}

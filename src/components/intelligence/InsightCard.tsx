"use client";

import { useState } from "react";
import Link from "next/link";
import { Explain } from "@/lib/intelligence/types";
import { ConfidenceBar } from "./ConfidenceBar";

export function InsightCard({
  title,
  explain,
  domain,
  formatValue,
  unit,
}: {
  title: string;
  explain: Explain<number>;
  domain?: [number, number];
  formatValue?: (v: number) => string;
  unit?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>

      <div className="mt-3">
        {explain.confidenceClass === "assumed" ? (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            <p className="font-medium">No data yet.</p>
            {explain.nextDataNeeded && <p className="mt-1 text-rose-700">Next data needed: {explain.nextDataNeeded}</p>}
          </div>
        ) : (
          <ConfidenceBar
            value={explain.value}
            interval={explain.interval}
            confidenceClass={explain.confidenceClass}
            domain={domain}
            formatValue={formatValue}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-3 text-xs font-medium text-sky-700 hover:text-sky-900"
      >
        {expanded ? "Hide explanation" : "Why this number?"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
          <div>
            <p className="font-medium text-slate-900">Method</p>
            <p className="text-slate-600">{explain.method}</p>
          </div>
          {explain.assumptions.length > 0 && (
            <div>
              <p className="font-medium text-slate-900">Assumptions</p>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-600">
                {explain.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {explain.evidence.length > 0 && (
            <div>
              <p className="font-medium text-slate-900">Evidence</p>
              <ul className="space-y-0.5 pl-0 text-slate-600">
                {explain.evidence.map((e, i) => (
                  <li key={i}>
                    {e.ref} — weight {e.weight} ({e.direction})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {explain.sensitivity.length > 0 && (
            <div>
              <p className="font-medium text-slate-900">Sensitivity</p>
              <ul className="space-y-0.5 pl-0 text-slate-600">
                {explain.sensitivity.map((s, i) => (
                  <li key={i}>
                    {s.factor}: Δ {s.delta > 0 ? "+" : ""}
                    {s.delta}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {explain.modelCardId && (
            <Link href={`/model-cards/${explain.modelCardId}`} className="inline-block text-xs font-medium text-sky-700 underline">
              View model card →
            </Link>
          )}
          <p className="text-[11px] text-slate-400">Generated {new Date(explain.generatedAt).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

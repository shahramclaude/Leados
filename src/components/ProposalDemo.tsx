"use client";

import { useState } from "react";

type Finding = { id: string; title: string; causalConfidence: string };

export function ProposalDemo({ findings }: { findings: Finding[] }) {
  const [findingId, setFindingId] = useState(findings[0]?.id ?? "");
  const [draft, setDraft] = useState(
    "This campaign causes a 20% lift and guarantees repeat purchases next quarter.",
  );
  const [result, setResult] = useState<{ sanitizedDraft: string; causalRewrites: number } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/llm-proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingId, draftText: draft }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (res.ok) setResult(body.data);
  }

  if (findings.length === 0) {
    return <p className="text-sm text-slate-500">Create a finding first to test proposal drafting.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block text-sm">
        Finding
        <select
          value={findingId}
          onChange={(e) => setFindingId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        >
          {findings.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title} ({f.causalConfidence})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Draft text (simulated LLM output — try causal verbs like &quot;causes&quot;)
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Sanitizing…" : "Run causal-language rule"}
      </button>
      {result && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Sanitized ({result.causalRewrites} rewrite(s)):</p>
          <p>{result.sanitizedDraft}</p>
        </div>
      )}
    </form>
  );
}

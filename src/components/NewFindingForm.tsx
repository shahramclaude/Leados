"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES: Record<string, { reasons: string[]; evidence: { label: string; ref: string }[] }> = {
  intelligence: {
    reasons: ["Three independent sources report the same movement pattern."],
    evidence: [{ label: "Source feed #41", ref: "feed:41:2026-02-01" }],
  },
  people: {
    reasons: ["Attrition in this team is 2.1x the org baseline over 90 days."],
    evidence: [{ label: "HRIS export", ref: "hris:team-14:q1-2026" }],
  },
  finance: {
    reasons: ["Gross margin moved outside the 90-day control band."],
    evidence: [{ label: "Ledger close", ref: "ledger:2026-01" }],
  },
};

export function NewFindingForm() {
  const router = useRouter();
  const [domain, setDomain] = useState<"intelligence" | "people" | "finance">("intelligence");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [causalConfidence, setCausalConfidence] = useState<"correlational" | "causal" | "experimental">(
    "correlational",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const template = TEMPLATES[domain];
    const res = await fetch("/api/findings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        title,
        summary,
        causalConfidence,
        explanation: {
          headline: summary || title,
          reasons: template.reasons,
          evidence: template.evidence,
          confidence: 0.7,
          detail: {},
        },
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to create finding");
      return;
    }
    setTitle("");
    setSummary("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Domain
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as typeof domain)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="intelligence">Intelligence</option>
            <option value="people">People</option>
            <option value="finance">Finance</option>
          </select>
        </label>
        <label className="text-sm">
          Causal confidence
          <select
            value={causalConfidence}
            onChange={(e) => setCausalConfidence(e.target.value as typeof causalConfidence)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="correlational">Correlational</option>
            <option value="causal">Causal (claimed)</option>
            <option value="experimental">Experimental (proven)</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="block text-sm">
        Summary
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          minLength={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create finding"}
      </button>
    </form>
  );
}

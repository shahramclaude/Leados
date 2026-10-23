"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

type Effect = { state: string; prob: number; value: number };
type Alternative = { id: string; label: string; costUsd: number; effects: Effect[] };
type Analysis = {
  expectedUtility: Record<string, number>;
  evpi: number;
  bestAlternativeId: string | null;
  recommendation: string;
  sensitivity: { state: string; swingValue: number }[];
};
type Decision = {
  id: string;
  question: string;
  status: "open" | "analyzed" | "decided";
  alternatives: Alternative[];
  analysis: Analysis | null;
  evpi: number | null;
  recommendation: string | null;
};

const TEMPLATE_ALTERNATIVES: Alternative[] = [
  {
    id: "a1",
    label: "Launch now",
    costUsd: 50000,
    effects: [
      { state: "market-accepts", prob: 0.6, value: 400000 },
      { state: "market-rejects", prob: 0.4, value: 20000 },
    ],
  },
  {
    id: "a2",
    label: "Run a 4-week pilot first",
    costUsd: 80000,
    effects: [
      { state: "market-accepts", prob: 0.6, value: 380000 },
      { state: "market-rejects", prob: 0.4, value: 60000 },
    ],
  },
];

export function DecisionBoard() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/decisions");
    const data = await res.json();
    setDecisions(data.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, alternatives: TEMPLATE_ALTERNATIVES }),
    });
    setQuestion("");
    await load();
  }

  async function analyze(id: string) {
    setBusyId(id);
    await fetch(`/api/decisions/${id}/analyze`, { method: "POST" });
    await load();
    setBusyId(null);
  }

  async function decide(id: string, chosenAlternativeId: string | null) {
    setBusyId(id);
    await fetch(`/api/decisions/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chosenAlternativeId }),
    });
    await load();
    setBusyId(null);
  }

  return (
    <div>
      <Card className="mb-6">
        <form onSubmit={createDecision} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
            <label htmlFor="question" className="block text-[13px] font-medium text-[var(--text-secondary)]">
              New decision question
            </label>
            <input
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Should we launch the new pricing tier this quarter?"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-[14px] outline-none"
            />
          </div>
          <Button type="submit">Add decision</Button>
        </form>
        <p className="mt-2 m-0 text-[12px] text-[var(--text-muted)]">
          New decisions seed with two illustrative alternatives so you can run the analysis immediately; edit
          alternatives via the API once connected to real data sources.
        </p>
      </Card>

      {loading ? (
        <p className="text-[14px] text-[var(--text-muted)]">Loading…</p>
      ) : decisions.length === 0 ? (
        <EmptyState title="No decisions yet" description="Add one above to see expected utility and EVPI." />
      ) : (
        <div className="flex flex-col gap-4">
          {decisions.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">{d.question}</p>
                <Badge tone={d.status === "decided" ? "success" : d.status === "analyzed" ? "brand" : "neutral"}>
                  {d.status}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {d.alternatives.map((alt) => {
                  const eu = d.analysis?.expectedUtility?.[alt.id];
                  const isBest = d.analysis?.bestAlternativeId === alt.id;
                  return (
                    <div
                      key={alt.id}
                      className={`rounded-[var(--radius-md)] border p-3 ${
                        isBest ? "border-[var(--brand-400)] bg-[var(--brand-50)]" : "border-[var(--border-default)]"
                      }`}
                    >
                      <p className="m-0 text-[14px] font-medium text-[var(--text-primary)]">
                        {alt.label} {isBest ? <Badge tone="brand">Recommended</Badge> : null}
                      </p>
                      <p className="mt-1 m-0 text-[12px] text-[var(--text-muted)]">Cost: ${alt.costUsd.toLocaleString()}</p>
                      {eu !== undefined ? (
                        <p className="mt-1 m-0 text-[13px] text-[var(--text-secondary)]">
                          Expected utility: <strong>{eu.toFixed(0)}</strong>
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {d.analysis ? (
                <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[13px] text-[var(--text-secondary)]">
                  <p className="m-0">{d.recommendation}</p>
                  <p className="mt-1 m-0 text-[12px] text-[var(--text-muted)]">
                    Strongest swing factor: {d.analysis.sensitivity[0]?.state ?? "n/a"} (Δ
                    {d.analysis.sensitivity[0]?.swingValue.toFixed(0) ?? 0})
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Button variant="secondary" disabled={busyId === d.id} onClick={() => analyze(d.id)}>
                  Run analysis
                </Button>
                <Button
                  disabled={busyId === d.id || d.status === "decided" || !d.analysis}
                  onClick={() => decide(d.id, d.analysis?.bestAlternativeId ?? null)}
                >
                  Decide: adopt recommendation
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

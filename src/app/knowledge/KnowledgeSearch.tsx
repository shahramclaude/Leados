"use client";

import { useState } from "react";
import { Badge, Card, ConfidenceBadge, EmptyState } from "@/components/ui";

type Result = {
  claimId: string;
  text: string;
  confidence: number;
  score: number;
  citation: { documentId: string; title: string; source: string; locator: string; verified: boolean };
};

export function KnowledgeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.results);
    setLoading(false);
  }

  const suggestions = ["headcount plan", "customer churn", "runway", "pricing experiment"];

  return (
    <div>
      <Card className="mb-6">
        <label htmlFor="kq" className="block text-[13px] font-medium text-[var(--text-secondary)]">
          Ask a question
        </label>
        <input
          id="kq"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="e.g. What is our current customer churn rate?"
          className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-[14px] outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => search(s)}
              className="rounded-[var(--radius-full)] border border-[var(--border-default)] px-3 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--n-100)]"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {loading ? <p className="text-[14px] text-[var(--text-muted)]">Searching…</p> : null}

      {results !== null && !loading ? (
        results.length === 0 ? (
          <EmptyState
            title="No cited claims found"
            description="Rather than guess, the system reports an honest gap — try different terms."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((r) => (
              <Card key={r.claimId}>
                <p className="m-0 text-[15px] text-[var(--text-primary)]">“{r.text}”</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ConfidenceBadge confidence={r.confidence} />
                  <Badge tone="info">{r.citation.title}</Badge>
                  <span className="text-[12px] text-[var(--text-muted)]">{r.citation.locator}</span>
                  {r.citation.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="danger">Unverified</Badge>}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

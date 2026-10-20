"use client";

import { useEffect, useState } from "react";

interface SelfTestCheck {
  name: string;
  pass: boolean;
  detail: string;
}

interface SelfTestResponse {
  ok: boolean;
  checks: SelfTestCheck[];
}

export default function AboutPage() {
  const [result, setResult] = useState<SelfTestResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/self-test")
      .then((res) => res.json())
      .then((data: SelfTestResponse) => setResult(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl space-y-6" data-testid="about-page">
      <div>
        <h1 className="text-2xl font-semibold">About LEADOS</h1>
        <p style={{ color: "var(--muted)" }}>
          LEADOS is an autonomous leadership-intelligence operating system: an append-only event
          log with pure domain engines layered on top.
        </p>
      </div>

      <div className="ld-surface rounded-xl border p-6">
        <h2 className="text-lg font-semibold">In-browser smoke self-test</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          This runs a tiny subset of the same domain functions covered by the real suites
          (<code>npm test</code>, <code>npm run test:e2e</code>, <code>npm run test:mutation</code>).
          It is a smoke signal only — the CI pipeline is the source of truth for correctness.
        </p>

        {loading && <p className="mt-4">Running checks…</p>}

        {result && (
          <ul className="mt-4 space-y-2" data-testid="self-test-results">
            {result.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2 text-sm">
                <span>{c.pass ? "✅" : "❌"}</span>
                <span>
                  <strong>{c.name}</strong> — {c.detail}
                </span>
              </li>
            ))}
          </ul>
        )}

        {result && (
          <p
            data-testid="self-test-overall"
            className={`mt-4 font-semibold ${result.ok ? "text-emerald-600" : "text-red-600"}`}
          >
            {result.ok ? "All smoke checks passing" : "Smoke checks failing — see CI for detail"}
          </p>
        )}
      </div>

      <div className="ld-surface rounded-xl border p-6 text-sm" style={{ color: "var(--muted)" }}>
        <p>
          Full correctness guarantees (unit, integration, e2e, mutation, visual regression, API
          contract) live in CI, not here:
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            Workflow: <code>.github/workflows/ci.yml</code>
          </li>
          <li>
            Test docs &amp; approve-flow: <code>docs/TESTING.md</code>
          </li>
          <li>
            API contract: <code>api-spec.json</code> / <code>api-spec.yaml</code>
          </li>
        </ul>
      </div>
    </div>
  );
}

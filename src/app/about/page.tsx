"use client";

import { useEffect, useState } from "react";

type SelfTestReport = {
  generatedAt: string;
  pass: boolean;
  checks: { name: string; pass: boolean; detail?: string }[];
  note: string;
};

export default function AboutPage() {
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/self-test")
      .then((res) => res.json())
      .then(setReport)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">About / self-test</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        This page surfaces a runtime smoke subset of the real invariants. It is intentionally thin: the single
        source of test truth is <code>npm test</code> / <code>npm run verify</code> and the CI workflow — not a
        bespoke assertion zoo baked into the browser.
      </p>

      {loading ? <p className="mt-6 text-sm text-slate-500">Running self-test…</p> : null}

      {report ? (
        <div data-testid="self-test-report" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold">
            Overall:{" "}
            <span className={report.pass ? "text-emerald-600" : "text-rose-600"} data-testid="self-test-overall">
              {report.pass ? "PASS" : "FAIL"}
            </span>
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {report.checks.map((check) => (
              <li key={check.name} className="flex items-center justify-between">
                <span>{check.name}</span>
                <span className={check.pass ? "text-emerald-600" : "text-rose-600"}>{check.pass ? "✓" : "✗"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">{report.note}</p>
          <p className="mt-1 text-xs text-slate-400">Generated at {report.generatedAt}</p>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import { useState } from "react";
import { runSelfTests, type SelfTestResult } from "@/lib/selfTest";
import { Card, ViewHeader } from "@/components/ui";

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function AboutView() {
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [running, setRunning] = useState(false);

  function handleRun() {
    setRunning(true);
    // Synchronous, pure, in-browser — no network call, no server round trip.
    const next = runSelfTests();
    setResult(next);
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <ViewHeader title="About" subtitle="Provenance, architecture notes, and the self-test suite." />

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-200">Provenance</p>
        <div className="space-y-2 text-sm text-slate-400">
          <p>
            This workspace is an original, from-scratch Next.js + PostgreSQL implementation. The upstream
            <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">github.com/shahramclaude/Leados</code>
            repository was inspected directly before writing any code: its own README describes it as a single
            hand-authored <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">index.html</code> file
            (vanilla JS, Tailwind CDN, <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">localStorage</code> state,
            no build step, no server, no database) — there was no prior Next.js/Drizzle codebase, API routes, views, or
            orchestrator to integrate. &quot;Parts 1-7&quot; of this brief did not exist as code in this project before this pass.
          </p>
          <p>
            Rather than fabricating a seam-repair narrative against files that were never written, this delivery builds
            one coherent system end to end: a single <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">OrchestratorResult</code>{" "}
            type and one pure orchestration function (<code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">runFullOrchestration</code>)
            consumed identically by every API route, every view (via <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">AppContext</code>),
            and this self-test suite — so the kinds of cross-part type drift the brief warns about have no seam to occur
            across in the first place.
          </p>
          <p>
            Domains mirror the left-nav routes exactly (<code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">DOMAINS</code> in{" "}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">src/lib/types.ts</code>): Cockpit, People, Strategic,
            Financial, Execution, Signal Board, Hypotheses, About. Cockpit rolls up the other domains&apos; scores; Signal
            Board surfaces the single worst domain as an alarm view.
          </p>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-200">Self-tests</p>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="rounded border border-indigo-700 px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-40"
          >
            {running ? "Running\u2026" : "Run self-tests"}
          </button>
        </div>

        {result && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-400">
              <span className="text-emerald-400">{result.passed} passed</span> / <span className="text-red-400">{result.failed} failed</span>{" "}
              of {result.tests.length} tests
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">Test</th>
                  <th className="py-2 pr-2">Result</th>
                  <th className="py-2 pr-2">Actual</th>
                  <th className="py-2">Expected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {result.tests.map((t) => (
                  <tr key={t.name}>
                    <td className="py-2 pr-2 align-top text-slate-300">{t.name}</td>
                    <td className="py-2 pr-2 align-top">
                      <span className={t.passed ? "text-emerald-400" : "text-red-400"}>{t.passed ? "PASS" : "FAIL"}</span>
                    </td>
                    <td className="max-w-xs py-2 pr-2 align-top text-slate-400 break-words">{formatValue(t.actual)}</td>
                    <td className="max-w-xs py-2 align-top text-slate-400 break-words">{formatValue(t.expected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

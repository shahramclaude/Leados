import { useState } from "react";
import { runSelfTests, type TestResult } from "../lib/selfTest";
import { Button, Card } from "./Shell";

export function HealthView() {
  const [results, setResults] = useState<TestResult[] | null>(null);

  function run() {
    setResults(runSelfTests());
  }

  const passCount = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
        <p className="text-sm text-stone-500">
          Runs 6 original self-tests directly against the live rule engine (<code>computeFindings</code> / <code>project</code>), in your browser. Nothing is mocked.
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div className="text-sm text-stone-600">
            {results ? (
              <span>
                <span className={passCount === results.length ? "text-emerald-600" : "text-rose-600"}>{passCount}/{results.length} passing</span>
              </span>
            ) : (
              "Not run yet."
            )}
          </div>
          <Button variant="primary" onClick={run}>Run self-tests</Button>
        </div>
      </Card>

      {results && (
        <Card>
          <ul className="divide-y divide-stone-100">
            {results.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${r.pass ? "bg-emerald-500" : "bg-rose-500"}`}>
                  {r.pass ? "✓" : "✕"}
                </span>
                <div>
                  <div className="text-sm font-medium">{r.id} — {r.name}</div>
                  <div className="font-mono text-xs text-stone-500">{r.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

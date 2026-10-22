"use client";

import { useState } from "react";
import Link from "next/link";
import { AllDimensionsTable, QualityChips } from "@/components/QualityChips";

const SAMPLE_CSV = `Full Name,Email,Phone,Company,Job Title,Country,Updated At
Grace Lin,grace.lin@northwind.com,+1 312-555-0120,Northwind Traders,Buyer,US,2026-01-05T00:00:00Z
Bad Row,missing-some-columns,US
Omar Siddiqui,not-an-email,+1 312-555-0140,Northwind Traders,Analyst,US,2026-01-06T00:00:00Z
Helen Park,helen.park@summitworks.com,+1 646-555-0180,Summit Works,CFO,US,2026-01-11T00:00:00Z
`;

interface PreviewResult {
  batchId: string;
  rawRowCount: number;
  qualityReport: {
    dimensions: Record<string, { value: number; explanation: string; isProxy?: boolean }>;
    thresholds: Record<string, number>;
    quarantinedCount: number;
    schemaDriftSuspected: { value: boolean; explanation: string };
  };
  diffSummary: {
    newEntityCount: number;
    autoDuplicateCount: number;
    pendingReviewCount: number;
    quarantinedCount: number;
    malformedRowCount: number;
  };
  sampleMalformedRows: Array<{ rowIndex: number; message: string; raw: string }>;
}

interface CommitReport {
  rowsImported: number;
  rowsQuarantined: number;
  rowsNewEntities: number;
  rowsMergedAuto: number;
  rowsMergedPending: number;
  malformedRowCount: number;
  quarantinedSamples: Array<{ rowIndex: number; reasons: string[]; raw: Record<string, unknown> }>;
}

export default function ImportStudioPage() {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitReport, setCommitReport] = useState<CommitReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setCommitReport(null);
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: "csv-upload", csvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runCommit() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId, actor: "user:import-studio" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Commit failed");
      setCommitReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Import Studio</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          ← Back
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">1. Paste CSV (connector: csv-upload)</h2>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
        />
        <div className="mt-3 flex gap-3">
          <button onClick={runPreview} disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Preview (dry-run)
          </button>
          {preview && (
            <button onClick={runCommit} disabled={loading || !!commitReport} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Commit import
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </section>

      {preview && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">2. Preview &amp; quality checks (batch {preview.batchId})</h2>
          <QualityChips dimensions={preview.qualityReport.dimensions} thresholds={preview.qualityReport.thresholds} />

          {preview.qualityReport.schemaDriftSuspected.value && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠ Schema drift suspected: {preview.qualityReport.schemaDriftSuspected.explanation}
            </p>
          )}

          <div className="mt-4">
            <AllDimensionsTable dimensions={preview.qualityReport.dimensions} thresholds={preview.qualityReport.thresholds} />
          </div>

          <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700">Dry-run diff (what commit WOULD do)</h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Stat label="New entities" value={preview.diffSummary.newEntityCount} />
            <Stat label="Auto-duplicate merges" value={preview.diffSummary.autoDuplicateCount} />
            <Stat label="Queued for review" value={preview.diffSummary.pendingReviewCount} />
            <Stat label="Quarantined" value={preview.diffSummary.quarantinedCount} tone="warn" />
            <Stat label="Malformed rows" value={preview.diffSummary.malformedRowCount} tone="warn" />
          </div>

          {preview.sampleMalformedRows.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Malformed rows (rejected during parse, never coerced)</h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {preview.sampleMalformedRows.map((r, i) => (
                  <li key={i} className="rounded bg-slate-50 px-2 py-1">
                    Row {r.rowIndex}: {r.message} — <span className="font-mono">{r.raw}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {commitReport && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">3. Commit result (partial-failure report)</h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Stat label="Imported" value={commitReport.rowsImported} />
            <Stat label="New entities" value={commitReport.rowsNewEntities} />
            <Stat label="Auto-merged" value={commitReport.rowsMergedAuto} />
            <Stat label="Queued for review" value={commitReport.rowsMergedPending} />
            <Stat label="Quarantined" value={commitReport.rowsQuarantined} tone="warn" />
          </div>
          {commitReport.quarantinedSamples.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Quarantined rows (never merged into entities)</h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {commitReport.quarantinedSamples.map((r, i) => (
                  <li key={i} className="rounded bg-amber-50 px-2 py-1">
                    Row {r.rowIndex}: {r.reasons.join(", ")} — <span className="font-mono">{JSON.stringify(r.raw)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-sm text-slate-600">
            {commitReport.rowsMergedPending} record(s) are now awaiting human confirmation in{" "}
            <Link className="underline" href="/dedup-review">
              Dedup Review
            </Link>
            .
          </p>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" && value > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

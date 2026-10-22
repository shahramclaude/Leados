"use client";

import { useState } from "react";
import Link from "next/link";

interface ExportResult {
  manifestId: string;
  csvText: string;
  rowCount: number;
  checksumSha256: string;
  provenance: Record<string, unknown>;
}

interface RoundTripResult {
  ok: boolean;
  recomputedChecksum: string;
  checksumMatches: boolean;
  parsedRowCount: number;
  malformedRowCount: number;
  rowCountMatches: boolean;
  issues: Array<{ code: string; message: string }>;
}

export default function ExportCenterPage() {
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [roundTrip, setRoundTrip] = useState<RoundTripResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateExport() {
    setLoading(true);
    setRoundTrip(null);
    try {
      const res = await fetch("/api/export");
      const data = await res.json();
      setExportResult(data);
    } finally {
      setLoading(false);
    }
  }

  async function verifyRoundTrip() {
    if (!exportResult) return;
    setLoading(true);
    try {
      const res = await fetch("/api/export/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestId: exportResult.manifestId, csvText: exportResult.csvText }),
      });
      const data = await res.json();
      setRoundTrip(data.result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Export Center</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          ← Back
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm text-slate-600">
          Exports carry a provenance manifest (row count + SHA-256 checksum) and can be round-trip verified by
          re-importing through the same CSV connector used for ingestion.
        </p>
        <div className="flex gap-3">
          <button onClick={generateExport} disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Generate export
          </button>
          {exportResult && (
            <button onClick={verifyRoundTrip} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Verify round-trip integrity
            </button>
          )}
          {exportResult && (
            <a
              href={`/api/export?format=file`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Download latest as CSV
            </a>
          )}
        </div>
      </section>

      {exportResult && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Manifest</h2>
          <ul className="text-sm text-slate-600">
            <li>manifestId: {exportResult.manifestId}</li>
            <li>rowCount: {exportResult.rowCount}</li>
            <li className="break-all">checksumSha256: {exportResult.checksumSha256}</li>
          </ul>
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{exportResult.csvText}</pre>
        </section>
      )}

      {roundTrip && (
        <section className={`mt-6 rounded-2xl border p-5 ${roundTrip.ok ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Round-trip result: {roundTrip.ok ? "PASS" : "FAIL"}</h2>
          <ul className="text-sm text-slate-700">
            <li>checksum matches: {String(roundTrip.checksumMatches)}</li>
            <li>row count matches: {String(roundTrip.rowCountMatches)} ({roundTrip.parsedRowCount} parsed)</li>
            <li>malformed rows on re-import: {roundTrip.malformedRowCount}</li>
          </ul>
          {roundTrip.issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-rose-800">
              {roundTrip.issues.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

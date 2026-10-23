"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VerifiedStatus } from "@/lib/coverageTypes";
import type { CoveragePartRow } from "@/lib/coverage";

const STATUS_OPTIONS: { value: VerifiedStatus; label: string }[] = [
  { value: "unverified", label: "Unverified" },
  { value: "present", label: "Present — live-checked, feature is real & canonical" },
  { value: "partial", label: "Partial — real but thin / incomplete" },
  { value: "missing", label: "Missing — essentially absent in canonical code" },
  { value: "legacy_quarantined", label: "Legacy-quarantined — only in C2 quarantine (views/modules/root)" },
];

export function VerificationForm({ part }: { part: CoveragePartRow }) {
  const router = useRouter();
  const [status, setStatus] = useState<VerifiedStatus>(part.currentStatus as VerifiedStatus);
  const [commandOutput, setCommandOutput] = useState("");
  const [verifiedBy, setVerifiedBy] = useState("operator");
  const [ownerPart, setOwnerPart] = useState(part.ownerPart ?? "");
  const [note, setNote] = useState(part.note ?? "");
  const [resolved, setResolved] = useState(part.resolved);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coverage-parts/${part.partNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStatus: status,
          commandOutput: commandOutput.trim() || undefined,
          verifiedBy: verifiedBy.trim() || undefined,
          ownerPart: ownerPart.trim() || null,
          note: note.trim() || null,
          resolved,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save verification");
      }
      setCommandOutput("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Record a Phase-0 verification pass
      </h3>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Verified status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as VerifiedStatus)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Live command output / evidence (what you actually ran, e.g. rg/ls output)
        </label>
        <textarea
          value={commandOutput}
          onChange={(e) => setCommandOutput(e.target.value)}
          rows={4}
          placeholder="$ rg -il 'keyword' src/ tests/ docs/ ..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Verified by</label>
          <input
            value={verifiedBy}
            onChange={(e) => setVerifiedBy(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Owner part (for gaps)</label>
          <input
            value={ownerPart}
            onChange={(e) => setOwnerPart(e.target.value)}
            placeholder="e.g. 40"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={resolved}
          onChange={(e) => setResolved(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Mark gap as resolved
      </label>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Save verification"}
      </button>
    </form>
  );
}

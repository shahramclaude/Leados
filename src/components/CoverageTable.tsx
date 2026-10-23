"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SeedStatusBadge, VerifiedStatusBadge } from "./StatusBadge";
import type { SeedStatus, VerifiedStatus } from "@/lib/coverageTypes";
import type { CoveragePartRow } from "@/lib/coverage";

const SEED_FILTERS: { value: "all" | SeedStatus; label: string }[] = [
  { value: "all", label: "All seed statuses" },
  { value: "canonical", label: "✅ canonical" },
  { value: "partial", label: "🟡 partial" },
  { value: "absent", label: "🔴 absent" },
];

const VERIFIED_FILTERS: { value: "all" | VerifiedStatus; label: string }[] = [
  { value: "all", label: "All verification statuses" },
  { value: "unverified", label: "Unverified" },
  { value: "present", label: "Present" },
  { value: "partial", label: "Partial" },
  { value: "missing", label: "Missing" },
  { value: "legacy_quarantined", label: "Legacy-quarantined" },
];

export function CoverageTable({ parts }: { parts: CoveragePartRow[] }) {
  const [search, setSearch] = useState("");
  const [seedFilter, setSeedFilter] = useState<"all" | SeedStatus>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | VerifiedStatus>("all");

  const filtered = useMemo(() => {
    return parts.filter((p) => {
      if (seedFilter !== "all" && p.seedStatus !== seedFilter) return false;
      if (verifiedFilter !== "all" && p.currentStatus !== verifiedFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !String(p.partNumber).includes(q) &&
          !p.evidence.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [parts, search, seedFilter, verifiedFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search part number, title, or evidence..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          value={seedFilter}
          onChange={(e) => setSeedFilter(e.target.value as "all" | SeedStatus)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        >
          {SEED_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value as "all" | VerifiedStatus)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        >
          {VERIFIED_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {filtered.length} of {parts.length} parts
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Part</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Title</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Seed status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Phase-0 status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Owner part</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-700">
                  <Link href={`/parts/${p.partNumber}`} className="hover:underline">
                    {String(p.partNumber).padStart(2, "0")}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-800">
                  <Link href={`/parts/${p.partNumber}`} className="hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <SeedStatusBadge status={p.seedStatus as SeedStatus} />
                </td>
                <td className="px-4 py-3">
                  <VerifiedStatusBadge status={p.currentStatus as VerifiedStatus} />
                </td>
                <td className="px-4 py-3 text-slate-500">{p.ownerPart || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No parts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

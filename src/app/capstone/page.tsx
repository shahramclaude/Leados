"use client";

import { useEffect, useState } from "react";
import ModuleHeader, { StatCard } from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

interface ModuleStatus {
  part: string;
  slug: string;
  name: string;
  status: "measured" | "unknown";
  records: number;
}
interface Promise5 {
  name: string;
  value: number | null;
  evidence: string;
  weakest: string;
}
interface GateData {
  measuredAt: string;
  moduleStatus: ModuleStatus[];
  coverage: { declared: number; measured: number; neverRun: number };
  fivePromises: Promise5[];
  charter: { total: number; verified: number };
}

const charterFields: FieldDef[] = [
  { name: "statement", label: "Charter statement", type: "textarea", required: true },
  { name: "statementClass", label: "Class", type: "select", options: ["does", "never-does"], defaultValue: "does" },
  { name: "enforcementRef", label: "Enforcement reference (code/test/route)", type: "text", required: true },
  { name: "verified", label: "Verified by re-run", type: "checkbox" },
];

const charterColumns: ColumnDef[] = [
  { key: "statement", label: "Statement" },
  { key: "statementClass", label: "Class" },
  { key: "enforcementRef", label: "Enforcement ref" },
  { key: "verified", label: "Verified", render: (r) => (r.verified ? "✅" : "unverified") },
];

function fmtPct(v: number | null) {
  if (v === null || Number.isNaN(v)) return "unknown";
  return `${Math.round(v * 100)}%`;
}

export default function CapstonePage() {
  const [gate, setGate] = useState<GateData | null>(null);

  useEffect(() => {
    fetch("/api/capstone/gate")
      .then((r) => r.json())
      .then(setGate)
      .catch(() => setGate(null));
  }, []);

  return (
    <div className="space-y-10">
      <ModuleHeader
        part="123"
        title="Capstone V — The Living Program Gate"
        description="A gate over Parts 108-122, re-measured on every load — a status that cannot be freshly measured renders 'unknown' rather than carrying forward a stale 'pass'. No new product surface is introduced here; this page only reads and reports on the other 15 modules."
        produces="Living gate matrix, five-promise scorecard with weakest links, and the charter of testable promises"
      />

      {gate && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Modules measured" value={`${gate.coverage.measured} / ${gate.coverage.declared}`} hint={`${gate.coverage.neverRun} module(s) still unknown`} />
            <StatCard label="Charter statements" value={`${gate.charter.verified} / ${gate.charter.total} verified`} />
            <StatCard label="Last measured" value={new Date(gate.measuredAt).toLocaleString()} hint="re-measured on every page load" />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-900">The five promises (never averaged away)</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gate.fivePromises.map((p) => (
                <div key={p.name} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{p.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{fmtPct(p.value)}</p>
                  <p className="mt-2 text-xs text-slate-500">{p.evidence}</p>
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">Weakest link: {p.weakest}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-900">Living matrix — module status</h2>
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-600">Part</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-600">Module</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-600">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gate.moduleStatus.map((m) => (
                    <tr key={m.slug}>
                      <td className="px-4 py-2 text-slate-500">#{m.part}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{m.name}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.status === "measured" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{m.records}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">The Final Charter</h2>
        <EntityManager endpoint="/api/capstone/charter" fields={charterFields} columns={charterColumns} addLabel="Add charter statement" emptyMessage="No charter statements recorded yet." />
      </section>
    </div>
  );
}

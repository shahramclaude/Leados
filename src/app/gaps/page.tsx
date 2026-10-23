import Link from "next/link";
import { getAllParts } from "@/lib/coverage";
import { SeedStatusBadge, VerifiedStatusBadge } from "@/components/StatusBadge";
import type { SeedStatus, VerifiedStatus } from "@/lib/coverage";

export const dynamic = "force-dynamic";

export default async function GapsRegisterPage() {
  const parts = await getAllParts();
  const gaps = parts.filter(
    (p) =>
      p.seedStatus !== "canonical" ||
      p.currentStatus === "missing" ||
      p.currentStatus === "partial" ||
      p.currentStatus === "legacy_quarantined",
  );
  const unresolved = gaps.filter((g) => !g.resolved);
  const resolved = gaps.filter((g) => g.resolved);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to dashboard
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">Gaps register</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Every seed-🟡/🔴 row (and anything a Phase-0 pass confirmed as missing, partial, or
          legacy-quarantined) lands here until it is assigned an owner part and resolved. Per the
          seed document: rows 12, 26, 27, 36, 42, 43, 48, 49, 50, 54 (partial) and 29, 40, 57
          (absent) are the reconciliation priorities.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Open ({unresolved.length})
        </h2>
        <GapTable rows={unresolved} />
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Resolved ({resolved.length})
          </h2>
          <GapTable rows={resolved} />
        </section>
      )}
    </main>
  );
}

function GapTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getAllParts>>;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-400">
        Nothing here.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Part</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Title</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Seed</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Phase-0</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Owner</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-slate-700">
                <Link href={`/parts/${p.partNumber}`} className="hover:underline">
                  {String(p.partNumber).padStart(2, "0")}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-800">{p.title}</td>
              <td className="px-4 py-3">
                <SeedStatusBadge status={p.seedStatus as SeedStatus} />
              </td>
              <td className="px-4 py-3">
                <VerifiedStatusBadge status={p.currentStatus as VerifiedStatus} />
              </td>
              <td className="px-4 py-3 text-slate-500">{p.ownerPart || "—"}</td>
              <td className="px-4 py-3 max-w-xs truncate text-slate-500">{p.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

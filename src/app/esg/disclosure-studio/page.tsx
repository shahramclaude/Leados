import Link from "next/link";
import { db } from "@/db";
import { disclosurePacks } from "@/db/schema";
import { buildDisclosurePreview } from "@/lib/esgSurfaces";
import { GeneratePackButton } from "@/components/esg/GeneratePackButton";
import { EvidenceBadge, GapCard } from "@/components/esg/EvidenceBadge";

export const dynamic = "force-dynamic";

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default async function DisclosureStudioPage() {
  const preview = await buildDisclosurePreview();
  const existingPacks = await db.select().from(disclosurePacks);
  const sortedPacks = [...existingPacks].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">LEADOS · Sustainability Intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Disclosure Studio</h1>
          <p className="mt-1 text-sm text-slate-600">
            Period-based packs with evidence links + gaps explicitly marked &ldquo;no data&rdquo;. Every figure traces to a lineage node.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/esg">
          ← Dashboard
        </Link>
      </header>

      <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Preview — {preview.period}</h2>
          <GeneratePackButton period={preview.period} />
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Standard mapping: {preview.standard}. This is a documented mapping to GRI/SASB/CSRD-style line items, not a certified or
          assured disclosure.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {preview.figures.map((f) =>
            f.explain ? (
              <div key={f.metricKey} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.label}</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{fmt(f.explain.value)}</p>
                <div className="mt-2">
                  <EvidenceBadge explain={f.explain} />
                </div>
                {f.standardMapping && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {[f.standardMapping.gri, f.standardMapping.sasb, f.standardMapping.csrd].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              <GapCard key={f.metricKey} label={f.label} reason={f.gap ?? "No data available for this period."} />
            ),
          )}
        </div>
        {preview.gaps.length > 0 && (
          <p className="mt-4 text-xs text-amber-700">
            {preview.gaps.length} line item(s) marked as explicit gaps for this period — see cards above.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Generated packs</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Pack ID</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Generated</th>
                <th className="px-4 py-2">Gaps</th>
                <th className="px-4 py-2">Manifest hash</th>
              </tr>
            </thead>
            <tbody>
              {sortedPacks.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-[11px]">{p.id}</td>
                  <td className="px-4 py-2">{p.period}</td>
                  <td className="px-4 py-2">{p.generatedAt.toISOString()}</td>
                  <td className="px-4 py-2">{Array.isArray(p.gaps) ? p.gaps.length : 0}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{p.manifestHash.slice(0, 16)}…</td>
                </tr>
              ))}
              {sortedPacks.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={5}>
                    No packs generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

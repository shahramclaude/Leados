import { getPackWithSections } from "@/lib/governance/packAssembly";
import { aggregatePreReadMetric } from "@/lib/governance/preRead";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default async function PackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPackWithSections(Number(id));
  if (!result) notFound();
  const { pack, sections, flags } = result;
  const preRead = await aggregatePreReadMetric(pack.id, 4);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Board pack #{pack.id}</h1>
      <p className="mt-1 text-sm text-slate-600">Meeting #{pack.meetingId}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Completeness</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              pack.completenessStatus === "red_flag" ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {pack.completenessStatus.replace("_", " ")}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Numbers frozen at</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{fmt(pack.numbersFrozenAt)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pre-read completion</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {Math.round(preRead.completionRate * 100)}%
          </p>
          <p className="text-xs text-slate-500">
            {preRead.acknowledgedCount}/{preRead.expectedReaderCount} acknowledged · avg{" "}
            {preRead.averageTimeSpentSeconds}s
          </p>
        </div>
      </div>

      {flags.length > 0 && (
        <section className="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-4">
          <h2 className="text-sm font-semibold text-rose-900">
            Completeness red flags — &ldquo;what the board doesn&apos;t see&rdquo; check
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-rose-900">
            {flags.map((f) => (
              <li key={f.id} className="rounded-lg bg-white/60 px-3 py-2">
                <span className="font-medium">{f.flagType}</span> — {f.sectionType}: {f.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Pack sections</h2>
        <div className="mt-3 space-y-3">
          {sections.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-slate-900">{s.title}</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    {s.sectionType}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    source: {s.sourcePart || "n/a"}
                  </span>
                  {!s.included && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                      omitted
                    </span>
                  )}
                </div>
              </div>
              {s.included ? (
                <p className="mt-2 text-sm text-slate-700">{s.content}</p>
              ) : (
                <div className="mt-2 text-sm text-slate-700">
                  <p>
                    <span className="font-medium">Omitted reason:</span> {s.omittedReason ?? "—"}
                  </p>
                  <p>
                    <span className="font-medium">Policy exception:</span>{" "}
                    {s.omittedPolicyRef ?? (
                      <span className="text-rose-700">none cited — treated as a red flag</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

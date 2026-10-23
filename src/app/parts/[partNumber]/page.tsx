import Link from "next/link";
import { notFound } from "next/navigation";
import { getLogsForPart, getPartByNumber } from "@/lib/coverage";
import { SeedStatusBadge, VerifiedStatusBadge } from "@/components/StatusBadge";
import { VerificationForm } from "@/components/VerificationForm";
import type { SeedStatus, VerifiedStatus } from "@/lib/coverage";

export const dynamic = "force-dynamic";

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ partNumber: string }>;
}) {
  const { partNumber } = await params;
  const num = Number(partNumber);
  if (!Number.isInteger(num)) notFound();

  const part = await getPartByNumber(num);
  if (!part) notFound();

  const logs = await getLogsForPart(part.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to dashboard
      </Link>

      <header className="mt-4 mb-8">
        <p className="m-0 font-mono text-sm text-slate-500">
          Part {String(part.partNumber).padStart(2, "0")}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">{part.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <SeedStatusBadge status={part.seedStatus as SeedStatus} />
          <VerifiedStatusBadge status={part.currentStatus as VerifiedStatus} />
          {part.resolved && (
            <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-600/20">
              Gap resolved
            </span>
          )}
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Seed evidence (keyword hits only — not proof)
        </h2>
        <p className="font-mono text-sm text-slate-700">{part.evidence}</p>
        {part.note && <p className="mt-3 text-sm text-slate-600">{part.note}</p>}
        {part.ownerPart && (
          <p className="mt-3 text-sm text-slate-500">
            Owner part: <span className="font-medium text-slate-700">{part.ownerPart}</span>
          </p>
        )}
      </section>

      <section className="mb-8">
        <VerificationForm part={part} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Verification history ({logs.length})
        </h2>
        {logs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-400">
            No Phase-0 verification recorded yet. This row is still a claim from the seed
            document, not a fact.
          </p>
        ) : (
          <ol className="space-y-3">
            {logs
              .slice()
              .reverse()
              .map((log) => (
                <li
                  key={log.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <VerifiedStatusBadge status={log.previousStatus as VerifiedStatus} />
                      <span className="text-slate-400">→</span>
                      <VerifiedStatusBadge status={log.newStatus as VerifiedStatus} />
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(log.verifiedAt).toLocaleString()} · {log.verifiedBy}
                    </span>
                  </div>
                  {log.commandOutput && (
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                      {log.commandOutput}
                    </pre>
                  )}
                </li>
              ))}
          </ol>
        )}
      </section>
    </main>
  );
}

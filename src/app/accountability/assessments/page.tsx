import Link from "next/link";
import { db } from "@/db";
import { algoSystems } from "@/db/schema";
import { getLatestAssessment } from "@/lib/accountability/assessments";
import { AssessmentStatusBadge } from "@/components/accountability/badges";

export const dynamic = "force-dynamic";

export default async function AssessmentStudioIndexPage() {
  const systems = await db.select().from(algoSystems).orderBy(algoSystems.systemKey);
  const rows = await Promise.all(
    systems.map(async (system) => ({ system, assessment: await getLatestAssessment(system.systemKey) })),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Impact Assessment Studio</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Structured algorithmic impact assessments (purpose/proportionality, affected parties, risks to rights, data
        governance, human oversight, accuracy/robustness, transparency), versioned per system. A model update always
        creates a new, unapproved version and supersedes the prior one — it cannot be skipped.
      </p>

      <div className="mt-6 grid gap-3">
        {rows.map(({ system, assessment }) => (
          <Link
            key={system.systemKey}
            href={`/accountability/assessments/${system.systemKey}`}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md"
          >
            <div>
              <div className="font-medium text-slate-900">{system.name}</div>
              <div className="text-xs text-slate-500">{system.systemKey}</div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">v{assessment?.version ?? 0}</span>
              <AssessmentStatusBadge status={assessment?.status ?? "missing"} />
              {assessment ? <span className="text-xs text-slate-400">trigger: {assessment.triggeredBy}</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

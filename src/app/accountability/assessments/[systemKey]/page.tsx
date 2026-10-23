import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { algoSystems } from "@/db/schema";
import { getAssessmentHistory } from "@/lib/accountability/assessments";
import { IdentitySwitcher } from "@/components/accountability/IdentitySwitcher";
import { AssessmentStatusBadge } from "@/components/accountability/badges";
import { approveAssessmentAction, submitForReviewAction, triggerModelUpdateAction } from "./actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  submitted: "Assessment submitted for review.",
  approved: "Assessment approved.",
  reassessed: "Model update recorded — a new draft assessment version was created and the prior version superseded.",
};

export default async function AssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ systemKey: string }>;
  searchParams: Promise<{ as?: string; msg?: string; error?: string }>;
}) {
  const { systemKey } = await params;
  const sp = await searchParams;
  const asKey = sp.as ?? "adm-001";

  const [system] = await db.select().from(algoSystems).where(eq(algoSystems.systemKey, systemKey));
  if (!system) notFound();

  const history = await getAssessmentHistory(systemKey);
  const latest = history[0];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/accountability/assessments" className="text-sm text-slate-500 hover:underline">
        ← Impact Assessment Studio
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-950">{system.name}</h1>
      <p className="text-sm text-slate-500">{system.systemKey}</p>

      <div className="mt-4">
        <IdentitySwitcher currentKey={asKey} extraHiddenFields={{}} />
      </div>

      {sp.msg ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{MESSAGES[sp.msg] ?? sp.msg}</p>
      ) : null}
      {sp.error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800">{sp.error}</p> : null}

      {latest ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Current version — v{latest.version}</h2>
            <AssessmentStatusBadge status={latest.status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Triggered by: {latest.triggeredBy} · Created: {latest.createdAt.toISOString()}
            {latest.reviewedAt ? ` · Reviewed: ${latest.reviewedAt.toISOString()} by ${latest.reviewerId} (${latest.reviewerRole})` : ""}
          </p>

          <dl className="mt-4 space-y-4 text-sm">
            <AssessmentField label="Purpose & proportionality" value={`${latest.purpose} ${latest.proportionality}`} />
            <AssessmentField label="Affected parties" value={latest.affectedPartiesText} />
            <AssessmentField label="Risks to rights" value={latest.risksToRights} />
            <AssessmentField label="Data governance" value={latest.dataGovernance} />
            <AssessmentField label="Human oversight" value={latest.humanOversightText} />
            <AssessmentField label="Accuracy & robustness" value={latest.accuracyRobustness} />
            <AssessmentField label="Transparency" value={latest.transparencyText} />
            <AssessmentField
              label="Linked experiments (Part 30)"
              value={latest.linkedExperimentIds.length > 0 ? latest.linkedExperimentIds.join(", ") : "None linked yet."}
            />
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {latest.status === "draft" ? (
              <form action={submitForReviewAction}>
                <input type="hidden" name="systemKey" value={systemKey} />
                <input type="hidden" name="assessmentId" value={latest.id} />
                <input type="hidden" name="as" value={asKey} />
                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
                  Submit for review
                </button>
              </form>
            ) : null}

            {latest.status === "in_review" ? (
              <form action={approveAssessmentAction}>
                <input type="hidden" name="systemKey" value={systemKey} />
                <input type="hidden" name="assessmentId" value={latest.id} />
                <input type="hidden" name="as" value={asKey} />
                <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600">
                  Approve (requires oversight role)
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-rose-700">No assessment on file for this system — this is a gap.</p>
      )}

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Simulate a model update (change trigger)</h2>
        <p className="mt-1 text-sm text-amber-900">
          This exercises the mandatory reassessment workflow live: it creates a new draft assessment version and
          marks the current approved version superseded. There is no path to update a model without this.
        </p>
        <form action={triggerModelUpdateAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="systemKey" value={systemKey} />
          <input type="hidden" name="as" value={asKey} />
          <label className="flex flex-col text-xs text-amber-900">
            Reason for the update
            <input
              name="reason"
              placeholder="e.g. recalibrated weighting after appeal review"
              className="mt-1 w-80 rounded-md border border-amber-300 px-2 py-1 text-sm"
            />
          </label>
          <button type="submit" className="rounded-md bg-amber-700 px-4 py-2 text-sm text-white hover:bg-amber-600">
            Simulate model update
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Version history</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span>
                v{h.version} <span className="text-slate-400">({h.triggeredBy})</span>
              </span>
              <AssessmentStatusBadge status={h.status} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function AssessmentField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-slate-800">{value}</dd>
    </div>
  );
}

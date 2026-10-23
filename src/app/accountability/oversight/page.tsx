import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contestations, decisionRecords } from "@/db/schema";
import { IdentitySwitcher } from "@/components/accountability/IdentitySwitcher";
import { ContestationStatusBadge } from "@/components/accountability/badges";
import { confirmHumanReviewAction, resolveContestationAction } from "./actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  reviewed: "Human review recorded.",
  resolved: "Contestation resolved.",
};

export default async function OversightQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; msg?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const asKey = sp.as ?? "aud-001";

  const pendingReviews = await db
    .select()
    .from(decisionRecords)
    .where(and(eq(decisionRecords.requiresHumanReview, true), eq(decisionRecords.humanReviewStatus, "pending")));

  const openContestations = await db
    .select()
    .from(contestations)
    .where(inArray(contestations.status, ["submitted", "under_review"]));

  const relatedDecisionIds = openContestations.map((c) => c.decisionRecordId);
  const relatedDecisions =
    relatedDecisionIds.length > 0
      ? await db.select().from(decisionRecords).where(inArray(decisionRecords.id, relatedDecisionIds))
      : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Oversight Queue</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Mandatory human sign-off for T4 automated actions, and open contestations awaiting resolution. Only
        admin/auditor/reviewer identities may act here — everyone else gets a documented denial.
      </p>

      <div className="mt-4">
        <IdentitySwitcher currentKey={asKey} />
      </div>

      {sp.msg ? <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{MESSAGES[sp.msg] ?? sp.msg}</p> : null}
      {sp.error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800">{sp.error}</p> : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Pending mandatory human reviews ({pendingReviews.length})</h2>
        {pendingReviews.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing pending.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {pendingReviews.map((decision) => (
              <li key={decision.id} className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-rose-900">
                    {decision.systemKey} — subject {decision.subjectId}
                  </span>
                  <span className="text-xs text-rose-700">decision #{decision.id}</span>
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-rose-800">{JSON.stringify(decision.outputSummary)}</pre>
                <form action={confirmHumanReviewAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="decisionRecordId" value={decision.id} />
                  <input type="hidden" name="as" value={asKey} />
                  <select name="outcome" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="confirmed">Confirm hold</option>
                    <option value="overridden">Overturn / release</option>
                  </select>
                  <input
                    name="notes"
                    placeholder="Review notes"
                    className="w-64 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700">
                    Record review
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Open contestations ({openContestations.length})</h2>
        {openContestations.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No open contestations.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {openContestations.map((contestation) => {
              const decision = relatedDecisions.find((d) => d.id === contestation.decisionRecordId);
              return (
                <li key={contestation.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-900">
                      Subject {contestation.subjectId} — {decision?.systemKey ?? "unknown system"}
                    </span>
                    <ContestationStatusBadge status={contestation.status} />
                  </div>
                  <p className="mt-2 text-amber-900">&ldquo;{contestation.reason}&rdquo;</p>
                  <form action={resolveContestationAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="contestationId" value={contestation.id} />
                    <input type="hidden" name="as" value={asKey} />
                    <select name="status" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                      <option value="under_review">Keep under review</option>
                      <option value="upheld">Uphold original decision</option>
                      <option value="overturned">Overturn original decision</option>
                      <option value="dismissed">Dismiss</option>
                    </select>
                    <input
                      name="notes"
                      placeholder="Resolution notes"
                      className="w-64 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700">
                      Resolve
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

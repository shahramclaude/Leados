import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { algoSystems } from "@/db/schema";
import {
  AccessDeniedError,
  getContestationsForSubject,
  getDecisionsForSubject,
  getExplanationForDecision,
  getOptOutsForSubject,
  resolveRequester,
} from "@/lib/accountability/rights";
import { IdentitySwitcher } from "@/components/accountability/IdentitySwitcher";
import { ContestationStatusBadge, DecisionRoleBadge } from "@/components/accountability/badges";
import { fileContestationAction, lookupAction, requestOptOutAction } from "./actions";

export const dynamic = "force-dynamic";

const OVERSIGHT_ROLES = ["admin", "auditor", "reviewer"];

const MESSAGES: Record<string, string> = {
  contested: "Contestation filed. An oversight reviewer will resolve it — see the Oversight Queue.",
  optout: "Opt-out request recorded.",
};

export default async function MyDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; lookup?: string; msg?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const asKey = sp.as ?? "subj-001";
  const requester = resolveRequester(asKey);
  const isOversight = OVERSIGHT_ROLES.includes(requester.role);
  const lookupSubject = (sp.lookup ?? (isOversight ? "" : requester.personKey)).trim();

  let decisions: Awaited<ReturnType<typeof getDecisionsForSubject>> = [];
  let contestationsForSubject: Awaited<ReturnType<typeof getContestationsForSubject>> = [];
  let optOutsForSubject: Awaited<ReturnType<typeof getOptOutsForSubject>> = [];
  let accessError: string | null = sp.error ?? null;

  if (lookupSubject) {
    try {
      decisions = await getDecisionsForSubject(requester, lookupSubject);
      contestationsForSubject = await getContestationsForSubject(requester, lookupSubject);
      optOutsForSubject = await getOptOutsForSubject(requester, lookupSubject);
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        accessError = err.message;
      } else {
        throw err;
      }
    }
  }

  const explanations = await Promise.all(
    decisions.map(async (d) => {
      try {
        return await getExplanationForDecision(requester, d.id);
      } catch {
        return null;
      }
    }),
  );

  const systemKeys = [...new Set(decisions.map((d) => d.systemKey))];
  const systems = systemKeys.length > 0 ? await db.select().from(algoSystems).where(inArray(algoSystems.systemKey, systemKeys)) : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">My Automated Decisions</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Every system that has scored, predicted, recommended or automated an action about a person, with the
        explanation they are entitled to, a path to contest it, and opt-out where LEADOS policy allows it.
      </p>

      <div className="mt-4">
        <IdentitySwitcher currentKey={asKey} extraHiddenFields={lookupSubject ? { lookup: lookupSubject } : undefined} />
      </div>

      {isOversight ? (
        <form action={lookupAction} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <input type="hidden" name="as" value={asKey} />
          <label className="flex flex-col text-xs text-indigo-900">
            Look up decisions for subject (oversight access)
            <input
              name="lookup"
              defaultValue={lookupSubject}
              placeholder="e.g. subj-002"
              className="mt-1 w-56 rounded-md border border-indigo-300 px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded-md bg-indigo-700 px-3 py-1 text-white hover:bg-indigo-600">
            Look up
          </button>
        </form>
      ) : (
        <p className="mt-4 text-xs text-slate-500">Showing your own decisions ({requester.personKey}).</p>
      )}

      {sp.msg ? <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{MESSAGES[sp.msg] ?? sp.msg}</p> : null}
      {accessError ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800">
          Access denied: {accessError}
        </p>
      ) : null}

      {lookupSubject && !accessError ? (
        <div className="mt-6 space-y-4">
          {decisions.length === 0 ? (
            <p className="text-sm text-slate-500">No decisions on file for {lookupSubject}.</p>
          ) : (
            decisions.map((decision, idx) => {
              const explanation = explanations[idx];
              const system = systems.find((s) => s.systemKey === decision.systemKey);
              const contestation = contestationsForSubject.find((c) => c.decisionRecordId === decision.id);
              const optOut = optOutsForSubject.find((o) => o.systemKey === decision.systemKey);
              const canAct = requester.personKey === decision.subjectId;

              return (
                <article key={decision.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-950">{system?.name ?? decision.systemKey}</h2>
                    <DecisionRoleBadge role={decision.decisionRole} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Decision #{decision.id} · {decision.createdAt.toISOString()}
                  </p>

                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(decision.outputSummary, null, 2)}
                  </pre>

                  {decision.requiresHumanReview ? (
                    <p className="mt-2 text-xs">
                      Mandatory human review:{" "}
                      <span
                        className={
                          decision.humanReviewStatus === "pending"
                            ? "text-rose-700"
                            : decision.humanReviewStatus === "overridden"
                              ? "text-emerald-700"
                              : "text-slate-700"
                        }
                      >
                        {decision.humanReviewStatus}
                      </span>
                      {decision.humanReviewNotes ? ` — "${decision.humanReviewNotes}"` : ""}
                    </p>
                  ) : null}

                  {explanation ? (
                    <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                      <h3 className="text-sm font-semibold text-indigo-900">Right to explanation</h3>
                      <p className="mt-1 text-sm text-indigo-900">{explanation.summary}</p>
                      <ul className="mt-2 space-y-1 text-xs text-indigo-800">
                        {explanation.factors.map((f, i) => (
                          <li key={i}>
                            {f.direction === "increases" ? "▲" : "▼"} {f.factor} (weight {f.weight})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-rose-700">No explanation on file — this is a gap.</p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {contestation ? (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        Contestation: <ContestationStatusBadge status={contestation.status} />
                        {contestation.resolutionNotes ? <span>— {contestation.resolutionNotes}</span> : null}
                      </div>
                    ) : canAct ? (
                      <form action={fileContestationAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="decisionRecordId" value={decision.id} />
                        <input type="hidden" name="subjectId" value={decision.subjectId} />
                        <input type="hidden" name="as" value={asKey} />
                        <input
                          name="reason"
                          placeholder="Why do you think this decision is wrong?"
                          className="w-72 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button type="submit" className="rounded-md bg-rose-700 px-3 py-1 text-xs text-white hover:bg-rose-600">
                          Contest this decision
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {system ? (
                    <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                      <span className="font-medium">Opt-out: </span>
                      {optOut ? (
                        <span className={optOut.status === "active" ? "text-emerald-700" : "text-rose-700"}>
                          {optOut.status} — {optOut.limitationsNote}
                        </span>
                      ) : system.optOutAllowed ? (
                        canAct ? (
                          <form action={requestOptOutAction} className="mt-1 inline-flex items-center gap-2">
                            <input type="hidden" name="systemKey" value={system.systemKey} />
                            <input type="hidden" name="subjectId" value={decision.subjectId} />
                            <input type="hidden" name="as" value={asKey} />
                            <button type="submit" className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700">
                              Request opt-out
                            </button>
                            <span>{system.optOutLimits}</span>
                          </form>
                        ) : (
                          <span>Allowed — {system.optOutLimits}</span>
                        )
                      ) : (
                        <span className="text-rose-700">Not permitted — {system.optOutLimits}</span>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </main>
  );
}

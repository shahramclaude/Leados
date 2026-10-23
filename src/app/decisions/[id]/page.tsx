import { notFound } from "next/navigation";
import Link from "next/link";
import { getDecision, listDecisionEvents } from "@/lib/queries";
import { updateDecisionStatusAction, addDecisionCommentAction } from "@/app/actions";
import { Card, PageHeader, Badge, fmtDate, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_FLOW: Record<string, string[]> = {
  proposed: ["under_review", "committed", "reversed"],
  under_review: ["committed", "reversed", "proposed"],
  committed: ["reversed"],
  reversed: ["proposed"],
};

export default async function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) notFound();

  const decision = await getDecision(decisionId);
  if (!decision) notFound();

  const events = await listDecisionEvents(decisionId);

  return (
    <div>
      <Link href="/decisions" className="mb-4 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300">
        ← Back to decision log
      </Link>
      <PageHeader
        title={decision.title}
        description={decision.description || undefined}
        action={
          <div className="flex gap-2">
            <Badge label={decision.status} />
            <Badge label={decision.impact} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Rationale</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-300">{decision.rationale || "No rationale recorded."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Owner</dt>
                <dd className="text-slate-200">{decision.ownerName ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Confidence</dt>
                <dd className="text-slate-200">{decision.confidence}%</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Created</dt>
                <dd className="text-slate-200">{fmtDate(decision.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Decided</dt>
                <dd className="text-slate-200">{fmtDate(decision.decidedAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Event-sourced audit trail
            </h2>
            {events.length === 0 ? (
              <EmptyState message="No events yet." />
            ) : (
              <ul className="space-y-4">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-200">
                        {e.type.replace(/_/g, " ")} <span className="text-slate-500">by {e.actor}</span>
                      </p>
                      {e.type === "comment" ? (
                        <p className="mt-1 text-slate-400">{String(e.payload.comment ?? "")}</p>
                      ) : (
                        <p className="mt-1 font-mono text-xs text-slate-500">{JSON.stringify(e.payload)}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-600">{fmtDate(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form action={addDecisionCommentAction} className="mt-6 flex gap-2 border-t border-slate-800 pt-4">
              <input type="hidden" name="id" value={decision.id} />
              <input
                name="comment"
                placeholder="Add a note to the record…"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
              >
                Add note
              </button>
            </form>
          </Card>
        </div>

        <Card className="h-fit">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Governance actions</h2>
          <p className="mb-3 text-xs text-slate-500">
            Current status: <span className="font-semibold text-slate-200">{decision.status.replace(/_/g, " ")}</span>
          </p>
          <div className="flex flex-col gap-2">
            {(STATUS_FLOW[decision.status] ?? []).map((next) => (
              <form key={next} action={updateDecisionStatusAction}>
                <input type="hidden" name="id" value={decision.id} />
                <input type="hidden" name="status" value={next} />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-indigo-500 hover:text-indigo-300"
                >
                  Move to {next.replace(/_/g, " ")}
                </button>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

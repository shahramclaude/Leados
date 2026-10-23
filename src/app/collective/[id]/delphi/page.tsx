import Link from "next/link";
import { notFound } from "next/navigation";
import { getDelphiWorkspace, getQuestion } from "@/lib/collective/service";
import { CloseRoundButton, EstimateForm, StartRoundButton } from "../../_components/DelphiControls";

export const dynamic = "force-dynamic";

export default async function DelphiWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const question = await getQuestion(id);
  if (!question) notFound();
  const workspace = await getDelphiWorkspace(id);

  const maxStdDev = Math.max(0.01, ...workspace.convergence.map((c) => Number(c.stdDev)));

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link href={`/collective/${id}`} className="text-xs text-slate-500 underline underline-offset-4">
        ← Collective View
      </Link>
      <h1 className="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold text-slate-950">Delphi Workspace</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{question.title}</p>
      <p className="mt-2 max-w-2xl text-xs text-slate-500">
        Anti-herding: positions inside an open round stay hidden until the round closes. Only the round-closed
        controlled feedback (distribution + anonymized rationale sample) carries forward to the next round.
      </p>

      <div className="mt-6">
        <StartRoundButton questionId={id} />
      </div>

      {workspace.convergence.length > 0 && (
        <section className="mt-8 rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <h3 className="text-sm font-semibold text-slate-950">Convergence (σ per round)</h3>
          <div className="mt-4 flex items-end gap-4" style={{ height: 120 }}>
            {workspace.convergence.map((c) => (
              <div key={c.roundNumber} className="flex flex-col items-center gap-1 text-xs text-slate-600">
                <div
                  className="w-10 rounded-t bg-indigo-500"
                  style={{ height: `${Math.max(4, (Number(c.stdDev) / maxStdDev) * 100)}px` }}
                  title={`σ=${Number(c.stdDev).toFixed(3)}`}
                />
                <span>R{c.roundNumber}</span>
                <span className="font-mono">{Number(c.stdDev).toFixed(3)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {workspace.convergence[workspace.convergence.length - 1].stopped
              ? `Stopping rule triggered: ${workspace.convergence[workspace.convergence.length - 1].stopReason}`
              : "Panel is still converging — more rounds recommended."}
          </p>
        </section>
      )}

      <section className="mt-8 grid gap-6">
        {[...workspace.rounds].reverse().map((round) => (
          <div key={round.id} className="rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-950">
                Round {round.roundNumber} · {round.status} · {round.anonymityMode}
              </h3>
              {round.status === "open" && <CloseRoundButton roundId={round.id} />}
            </div>

            {round.status === "closed" ? (
              <ul className="mt-4 grid gap-2">
                {round.estimates.map((e) => (
                  <li
                    key={e.forecasterId}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      e.isDissent ? "border-amber-400 bg-amber-50" : "border-slate-200"
                    }`}
                  >
                    <span className="font-medium text-slate-950">
                      {e.anonymousTag} {e.isDissent && <span className="text-amber-700">(dissent preserved)</span>}
                    </span>
                    <span className="font-mono">{(e.estimate * 100).toFixed(0)}%</span>
                  </li>
                ))}
                {round.estimates.length === 0 && <p className="text-xs text-slate-500">No estimates recorded.</p>}
              </ul>
            ) : (
              <div className="mt-4">
                <p className="text-xs text-slate-500">
                  {round.estimates.length} estimate(s) submitted so far — hidden from other participants until this
                  round closes.
                </p>
                <div className="mt-3">
                  <EstimateForm roundId={round.id} disabled={false} />
                </div>
              </div>
            )}
          </div>
        ))}
        {workspace.rounds.length === 0 && (
          <p className="text-sm text-slate-600">No Delphi rounds yet. Start round 1 above.</p>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getProgram, listGroups, listPrograms, listInterventions } from "@/lib/change/repository";
import { getProgramFunnel, getProgramMomentum, getGroupReadiness, getAdkarForProgramGroup } from "@/lib/change/dashboard";
import { changeLoadIndex, DEFAULT_SATURATION_THRESHOLD } from "@/lib/change/changeLoad";

export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = await getProgram(id);
  if (!program) notFound();

  const now = new Date();
  const [funnel, momentum, allGroups, allPrograms, interventions] = await Promise.all([
    getProgramFunnel(id, now),
    getProgramMomentum(id, now),
    listGroups(),
    listPrograms(),
    listInterventions(id),
  ]);

  const groupRows = await Promise.all(
    program.affectedGroups.map(async (groupId) => {
      const groupRow = allGroups.find((g) => g.id === groupId);
      const load = changeLoadIndex(groupId, allPrograms, now);
      const readiness = groupRow ? await getGroupReadiness(groupRow, allPrograms, now) : null;
      const adkar = await getAdkarForProgramGroup(id, groupId, now);
      const funnelForGroup = funnel?.byGroup.find((g) => g.groupId === groupId)?.result ?? null;
      return { groupId, groupRow, load, readiness, adkar, funnelForGroup };
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/change" className="text-xs font-medium text-slate-500 hover:underline">
          ← Transformation Dashboard
        </Link>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{program.intent}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Status: <span className="font-medium capitalize text-slate-800">{program.status}</span> · Started{" "}
          {program.startDate} · Load weight {program.loadWeight.toFixed(1)}
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Target behaviors</h3>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
          {program.targetBehaviors.map((tb) => (
            <li key={tb.behavior} className="rounded-lg bg-slate-50 p-3">
              <p className="m-0 font-medium text-slate-900">{tb.behavior}</p>
              <p className="m-0 text-xs text-slate-500">
                Proxy: {tb.observableProxy.replace("_", " ")} · event type <code>{tb.proxyEventType}</code>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Adoption funnel (overall)</h3>
        {funnel && funnel.overall.ok ? (
          (() => {
            const overall = funnel.overall.value;
            return (
              <>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  {(["awareness", "trial", "habit"] as const).map((stage) => (
                    <div key={stage} className="rounded-xl bg-slate-50 p-4">
                      <p className="m-0 text-xs uppercase text-slate-400">{stage}</p>
                      <p className="m-0 text-2xl font-semibold text-slate-900">{overall.value[stage]}</p>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">
                  {overall.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            );
          })()
        ) : (
          <p className="mt-3 text-sm italic text-slate-500">
            Suppressed — combined roster across affected groups is below the k-anonymity threshold.
          </p>
        )}

        <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Momentum</h4>
        {momentum?.momentum.ok ? (
          <p className="mt-1 text-sm text-slate-700">
            EWMA delta of habit-stage rate: <span className="font-semibold">{momentum.momentum.value.value.toFixed(4)}</span> /
            week ({momentum.momentum.value.confidence} confidence)
          </p>
        ) : (
          <p className="mt-1 text-sm italic text-slate-500">Suppressed — insufficient roster size.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Resistance map</h3>
        {program.resistanceMap.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No resistance drivers recorded yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-400">
                <th className="pb-2">Group</th>
                <th className="pb-2">Driver</th>
                <th className="pb-2">Mitigation</th>
              </tr>
            </thead>
            <tbody>
              {program.resistanceMap.map((r) => (
                <tr key={`${r.group}-${r.driver}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">{r.group}</td>
                  <td className="py-2 pr-3 text-slate-600">{r.driver}</td>
                  <td className="py-2 text-slate-600">{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Per-group readiness, load &amp; stage</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {groupRows.map((g) => (
            <div key={g.groupId} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="m-0 font-medium text-slate-900">{g.groupRow?.name ?? g.groupId}</p>
              <p className="mt-1 text-xs text-slate-500">
                Change-load index: <span className="font-semibold">{g.load.value.toFixed(2)}</span>{" "}
                {g.load.value > DEFAULT_SATURATION_THRESHOLD && (
                  <span className="font-semibold text-amber-600">(over saturation threshold)</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Readiness:{" "}
                {g.readiness?.readiness.ok ? (
                  <span className="font-semibold text-slate-800">{(g.readiness.readiness.value.value * 100).toFixed(0)}%</span>
                ) : (
                  <span className="italic">suppressed (small group)</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ADKAR primary blocker:{" "}
                {g.adkar?.ok ? (
                  <>
                    <span className="font-semibold text-slate-800">{g.adkar.value.value.primaryBlockingStage}</span>{" "}
                    <span className="text-slate-400">(margin {g.adkar.value.value.margin})</span>
                  </>
                ) : (
                  <span className="italic">suppressed (small group)</span>
                )}
              </p>
              {g.adkar?.ok && g.adkar.value.confidence === "low" && (
                <p className="mt-1 text-[11px] italic text-amber-700">
                  Uncertain classification — close to another candidate stage, do not act on this alone.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Interventions</h3>
          <Link href="/change/interventions" className="text-xs font-medium text-slate-600 underline">
            Open Intervention Lab
          </Link>
        </div>
        {interventions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No interventions designed for this program yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {interventions.map((iv) => (
              <li key={iv.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="m-0 font-medium text-slate-900">{iv.kind}</p>
                <p className="m-0 text-xs text-slate-500">
                  Expected effect: {iv.expectedEffect.value > 0 ? "+" : ""}
                  {iv.expectedEffect.value} ({iv.expectedEffect.confidence} confidence) · status {iv.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

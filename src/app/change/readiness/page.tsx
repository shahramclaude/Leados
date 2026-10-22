import { getAllGroupReadiness } from "@/lib/change/dashboard";
import { DEFAULT_SATURATION_THRESHOLD } from "@/lib/change/changeLoad";

export const dynamic = "force-dynamic";

export default async function ReadinessPage() {
  const views = await getAllGroupReadiness(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Group Readiness Cards</h2>
        <p className="mt-1 text-sm text-slate-500">
          Aggregate-only. Groups below the k-anonymity threshold show a suppression notice instead of a score — there is
          no individual-level readiness anywhere in this system.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {views.map((v) => (
          <div key={v.groupId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <p className="m-0 text-xs uppercase tracking-wide text-slate-400">{v.department}</p>
              <h3 className="m-0 text-base font-semibold text-slate-950">{v.groupName}</h3>
            </div>

            {v.readiness.ok ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-slate-900">{Math.round(v.readiness.value.value * 100)}%</span>
                  <span className="text-xs text-slate-400">readiness ({v.readiness.value.confidence} confidence)</span>
                </div>
                <p className="m-0 text-xs text-slate-500">
                  Change-load index: <span className="font-semibold">{v.changeLoad.value.toFixed(2)}</span>
                  {v.changeLoad.value > DEFAULT_SATURATION_THRESHOLD && (
                    <span className="ml-1 font-semibold text-amber-600">over saturation threshold</span>
                  )}
                </p>

                {v.actions.ok && v.actions.value.length > 0 && (
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-400">What would raise readiness</p>
                    <ul className="mt-1 flex flex-col gap-1 text-xs text-slate-600">
                      {v.actions.value.slice(0, 2).map((a) => (
                        <li key={a.lever}>
                          {a.suggestion} <span className="text-emerald-600">(+{(a.estimatedScoreGain * 100).toFixed(1)}pp)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm italic text-slate-500">
                Readiness suppressed — this group has fewer than the k-anonymity threshold of people, so no aggregate
                score can be shown without risking re-identification.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

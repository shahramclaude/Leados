import Link from "next/link";
import { listPrograms } from "@/lib/change/repository";
import { getProgramFunnel, getProgramMomentum, getSaturationAlerts } from "@/lib/change/dashboard";

export const dynamic = "force-dynamic";

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "paused":
      return "bg-amber-100 text-amber-800";
    case "completed":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-sky-100 text-sky-800";
  }
}

export default async function TransformationDashboardPage() {
  const programs = await listPrograms();
  const now = new Date();

  if (programs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
        No change programs yet. Click <strong>Seed demo data</strong> above to load the demo transformation
        portfolio.
      </div>
    );
  }

  const [funnels, momentums, saturation] = await Promise.all([
    Promise.all(programs.map((p) => getProgramFunnel(p.id, now))),
    Promise.all(programs.map((p) => getProgramMomentum(p.id, now))),
    getSaturationAlerts(now),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {saturation.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="m-0 font-semibold">Saturation risk detected</p>
          <p className="mt-1">
            {saturation.length} group(s) are absorbing more concurrent change than the configured threshold. See the{" "}
            <Link href="/change/saturation" className="underline">
              Saturation Alerts
            </Link>{" "}
            view.
          </p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {programs.map((program, idx) => {
          const funnel = funnels[idx];
          const momentum = momentums[idx];
          return (
            <Link
              key={program.id}
              href={`/change/${program.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="m-0 text-base font-semibold text-slate-950">{program.intent}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusColor(program.status)}`}>
                  {program.status}
                </span>
              </div>
              <p className="m-0 text-xs text-slate-500">
                Affects {program.affectedGroups.length} group(s) · load weight {program.loadWeight.toFixed(1)}
              </p>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="m-0 text-slate-400">Awareness</p>
                  <p className="m-0 font-semibold text-slate-900">
                    {funnel?.overall.ok ? funnel.overall.value.value.awareness : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="m-0 text-slate-400">Trial</p>
                  <p className="m-0 font-semibold text-slate-900">
                    {funnel?.overall.ok ? funnel.overall.value.value.trial : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="m-0 text-slate-400">Habit</p>
                  <p className="m-0 font-semibold text-slate-900">
                    {funnel?.overall.ok ? funnel.overall.value.value.habit : "—"}
                  </p>
                </div>
              </div>

              <p className="m-0 text-xs text-slate-500">
                Momentum:{" "}
                {momentum?.momentum.ok ? (
                  <span
                    className={
                      momentum.momentum.value.value > 0.005
                        ? "font-semibold text-emerald-600"
                        : momentum.momentum.value.value < -0.005
                        ? "font-semibold text-rose-600"
                        : "font-semibold text-slate-500"
                    }
                  >
                    {momentum.momentum.value.value > 0 ? "+" : ""}
                    {momentum.momentum.value.value.toFixed(3)} / week
                  </span>
                ) : (
                  <span className="italic text-slate-400">suppressed (group below k-anonymity threshold)</span>
                )}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

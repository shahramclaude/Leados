import { getSaturationAlerts } from "@/lib/change/dashboard";
import { DEFAULT_SATURATION_THRESHOLD } from "@/lib/change/changeLoad";

export const dynamic = "force-dynamic";

export default async function SaturationPage() {
  const findings = await getSaturationAlerts(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Saturation Alerts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Groups whose change-load index (sum of concurrent program intensities) exceeds {DEFAULT_SATURATION_THRESHOLD}.
          These are findings for review, not automatic verdicts.
        </p>
      </div>

      {findings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No group is currently over the saturation threshold.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {findings.map((f) => (
            <div
              key={f.id}
              className={`rounded-2xl border p-5 ${
                f.severity === "critical" ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"
              }`}
            >
              <p className={`m-0 text-xs font-semibold uppercase tracking-wide ${f.severity === "critical" ? "text-rose-700" : "text-amber-700"}`}>
                {f.severity}
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-700">{f.detail}</p>
              <div className="mt-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Contributing programs</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
                  {(f.evidence.programs as Array<{ id: string; intent: string; loadWeight: number }>).map((p) => (
                    <li key={p.id}>
                      {p.intent} <span className="text-xs text-slate-400">(load weight {p.loadWeight})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

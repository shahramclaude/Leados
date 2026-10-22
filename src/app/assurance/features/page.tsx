import { listFlags, ensureSeedFlags } from "@/lib/featureFlags";
import { AssuranceNav } from "@/app/assurance/_components/AssuranceNav";
import { RestoreFlagButton } from "@/app/assurance/_components/RestoreFlagButton";

export const dynamic = "force-dynamic";

export default async function FeatureSafetyPage() {
  await ensureSeedFlags();
  const flags = await listFlags();

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 38</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Feature Safety</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Features that assurance checks can auto-degrade when their associated metric breaches threshold. Every
          degrade action is audited and reversible — restoring a feature here is itself an audited action.
        </p>
        <AssuranceNav active="/assurance/features" />

        <div className="space-y-4">
          {flags.map((flag) => (
            <div key={flag.key} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500">{flag.key}</p>
                  <h3 className="mt-1 font-semibold text-slate-950">{flag.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{flag.description}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      flag.degraded ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {flag.degraded ? "auto-degraded" : "enabled"}
                  </span>
                </div>
              </div>
              {flag.degraded && (
                <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                  <p>
                    <span className="font-medium">Reason: </span>
                    {flag.degradedReason}
                  </p>
                  <p className="mt-1 text-xs text-rose-700">
                    Degraded at {flag.degradedAt ? new Date(flag.degradedAt).toLocaleString() : "unknown"} by check{" "}
                    <code>{flag.degradedByCheckId}</code>.
                  </p>
                  <div className="mt-3">
                    <RestoreFlagButton flagKey={flag.key} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

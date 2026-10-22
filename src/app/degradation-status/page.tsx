import Link from "next/link";
import { getUserFacingDegradation } from "@/lib/degradation";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, string> = {
  operational: "border-emerald-300 bg-emerald-50 text-emerald-800",
  degraded: "border-amber-300 bg-amber-50 text-amber-800",
  outage: "border-rose-300 bg-rose-50 text-rose-800",
};

const statusDot: Record<string, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  outage: "bg-rose-500",
};

export default async function DegradationStatusPage() {
  const degradation = await getUserFacingDegradation();
  const worst = degradation.some((d) => d.status === "outage")
    ? "outage"
    : degradation.some((d) => d.status === "degraded")
      ? "degraded"
      : "operational";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm font-medium text-slate-600">
        <Link href="/" className="hover:text-slate-950">Hub</Link>
        <Link href="/resilience-lab" className="hover:text-slate-950">Resilience Lab</Link>
        <Link href="/continuity-plans" className="hover:text-slate-950">Continuity Plans</Link>
        <Link href="/degradation-status" className="text-slate-950 underline">Degradation Status</Link>
        <Link href="/failure-domain-coverage" className="hover:text-slate-950">Failure-Domain Coverage</Link>
      </nav>

      <h1 className="text-3xl font-semibold text-slate-950">What&apos;s working right now</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        This page is for everyone, not just on-call engineers: what can you actually do in LEADOS right now, and
        what is temporarily limited.
      </p>

      <div className={`mt-6 flex items-center gap-3 rounded-xl border px-4 py-3 ${statusStyle[worst]}`}>
        <span className={`h-3 w-3 rounded-full ${statusDot[worst]}`} />
        <span className="font-semibold capitalize">{worst === "operational" ? "All systems operational" : `System ${worst}`}</span>
      </div>

      <div className="mt-8 space-y-4">
        {degradation.map((d) => (
          <div key={d.dependencyKey} className={`rounded-xl border p-5 ${statusStyle[d.status]}`}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">{d.label}</h2>
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                <span className={`h-2 w-2 rounded-full ${statusDot[d.status]}`} />
                {d.status}
              </span>
            </div>
            <p className="mt-2 text-sm">{d.userMessage}</p>
            <p className="mt-1 text-xs opacity-80">Impact: {d.capabilityImpact}</p>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-slate-500">
        This status reflects live circuit-breaker state and fault-injection controls. Running a chaos experiment in
        the Resilience Lab against a dependency will change what is shown here — on purpose, since this is what a
        real user would see during that failure.
      </p>
    </main>
  );
}

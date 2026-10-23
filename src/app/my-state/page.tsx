import Link from "next/link";
import { listDecisions, listRecoverySignals } from "@/lib/leaderState/repository";
import { buildCapacityDashboard } from "@/lib/leaderState/decisionLoad";
import { DEMO_SELF_ACTOR, DEMO_USER_ID } from "@/lib/leaderState/demo";
import { BoundaryBadge } from "@/components/leaderState/BoundaryBadge";
import { UncertaintyNote } from "@/components/leaderState/UncertaintyNote";
import { DecisionLoadChart } from "@/components/leaderState/DecisionLoadChart";
import { DecisionLogForm } from "@/components/leaderState/DecisionLogForm";
import { CapacityGrantPanel } from "@/components/leaderState/CapacityGrantPanel";
import { ResearchOptIn } from "@/components/leaderState/ResearchOptIn";

export const dynamic = "force-dynamic";

export default async function MyStatePage() {
  const [decisions, recoverySignals] = await Promise.all([
    listDecisions(DEMO_SELF_ACTOR, DEMO_USER_ID),
    listRecoverySignals(DEMO_SELF_ACTOR, DEMO_USER_ID),
  ]);
  const dashboard = buildCapacityDashboard(decisions, recoverySignals);

  const recentWeek = dashboard.dailyLoad.slice(-7);
  const weeklyAvg =
    recentWeek.length === 0
      ? null
      : Math.round((recentWeek.reduce((sum, d) => sum + d.combinedLoadScore, 0) / recentWeek.length) * 100) / 100;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <p className="m-0 text-xs uppercase tracking-wide text-slate-500">Leados · Cognitive capacity</p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-3xl font-semibold text-slate-950">My State</h1>
          <BoundaryBadge />
        </div>
        <p className="m-0 text-sm text-slate-600">
          A private space for your own decision load, recovery signals, and decision-window suggestions.
          Nothing on this page is visible to your manager, admins, or anyone else at your org — see the
          proof linked above.
        </p>
        <nav className="flex gap-4 text-sm">
          <Link href="/my-state/decision-hygiene" className="text-indigo-700 underline">
            Decision Hygiene tools
          </Link>
          <Link href="/my-state/access-model" className="text-indigo-700 underline">
            Access model &amp; proof
          </Link>
        </nav>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-sm font-semibold text-slate-900">Decision load, last 14 days</h2>
        <p className="m-0 mt-1 text-xs text-slate-500">{dashboard.evidenceNote}</p>
        <div className="mt-3">
          <DecisionLoadChart dailyLoad={dashboard.dailyLoad} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-sm font-semibold text-slate-900">Decision-fatigue proxy</h2>
        <p className="m-0 mt-1 text-xs text-slate-600">
          Looks for drift in how you rated your own decision quality across the day, in your own history.
        </p>
        <UncertaintyNote
          confidence={dashboard.fatigueProxy.confidence}
          sampleSize={dashboard.fatigueProxy.minBucketSampleSizeUsed || undefined}
        >
          {dashboard.fatigueProxy.lowestQualityBucket ? (
            <span>
              Your self-ratings have skewed slightly lower in the &quot;{dashboard.fatigueProxy.lowestQualityBucket}&quot;
              window so far. Could be worth noticing, not a verdict.
            </span>
          ) : (
            <span>No pattern to report yet.</span>
          )}
        </UncertaintyNote>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-sm font-semibold text-slate-900">Decision-window suggestion</h2>
        <p className="m-0 mt-1 text-xs text-slate-600">{dashboard.decisionWindow.statement}</p>
        <UncertaintyNote
          confidence={dashboard.decisionWindow.confidence}
          sampleSize={dashboard.decisionWindow.sampleSize}
        />
      </section>

      <DecisionLogForm />
      <CapacityGrantPanel />
      <ResearchOptIn suggestedValue={weeklyAvg} />
    </main>
  );
}

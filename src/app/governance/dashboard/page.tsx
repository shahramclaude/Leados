import { boardEffectivenessSummary } from "@/lib/governance/metrics";
import { verifyChain } from "@/lib/governance/auditChain";
import { db } from "@/db";
import { boardPacks, resolutions, minutes, governancePolicy } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function GovernanceDashboardPage() {
  const summary = await boardEffectivenessSummary();
  const chain = await verifyChain();
  const packs = await db.select().from(boardPacks);
  const allResolutions = await db.select().from(resolutions);
  const allMinutes = await db.select().from(minutes);
  const [individualScoringPolicy] = await db
    .select()
    .from(governancePolicy)
    .where(eq(governancePolicy.key, "individual_director_scoring_enabled"));

  const redFlagPacks = packs.filter((p) => p.completenessStatus === "red_flag").length;
  const finalizedMinutes = allMinutes.filter((m) => m.finalized).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Governance Dashboard</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Board-level indicators only. Metrics support directors&apos; oversight of management and of
        the board&apos;s own process — they do not replace directors&apos; judgement, and they never
        produce individual-director scores without an explicit, documented board policy decision.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Decisions decided" value={String(summary.decisionLatency.resolutionsDecided)} />
        <Card
          label="Avg. decision latency"
          value={`${summary.decisionLatency.averageDecisionLatencyDays} days`}
        />
        <Card
          label="Resolution follow-through"
          value={`${Math.round(summary.resolutionFollowThrough.followThroughRate * 100)}%`}
          tone={summary.resolutionFollowThrough.unlinkedFlaggedCount > 0 ? "warn" : "ok"}
        />
        <Card
          label="Info-request closure"
          value={`${Math.round(summary.informationRequests.closureRate * 100)}%`}
        />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Packs assembled" value={String(packs.length)} />
        <Card
          label="Packs with completeness red flags"
          value={String(redFlagPacks)}
          tone={redFlagPacks > 0 ? "danger" : "ok"}
        />
        <Card label="Resolutions on register" value={String(allResolutions.length)} />
        <Card label="Minutes finalized" value={`${finalizedMinutes}/${allMinutes.length}`} />
      </section>

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Resolutions without implementation linkage</h2>
        {summary.resolutionFollowThrough.unlinkedFlagged.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            None currently flagged (checked at request time; a resolution is exempt within its
            7-day grace period).
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-rose-700">
            {summary.resolutionFollowThrough.unlinkedFlagged.map((r) => (
              <li key={r.id}>
                #{r.id} — {r.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Meeting value density (Part 45)</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1 pr-4">Meeting</th>
              <th className="py-1 pr-4">Agenda items</th>
              <th className="py-1 pr-4">Resolutions considered</th>
              <th className="py-1 pr-4">Decided</th>
              <th className="py-1">Value density</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summary.meetingValueDensity.map((m) => (
              <tr key={m.meetingId}>
                <td className="py-2 pr-4">#{m.meetingId}</td>
                <td className="py-2 pr-4">{m.agendaItemCount}</td>
                <td className="py-2 pr-4">{m.resolutionsConsidered}</td>
                <td className="py-2 pr-4">{m.resolutionsDecided}</td>
                <td className="py-2">{m.valueDensity.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Audit chain integrity (Part 19)</h2>
          <p className={`mt-2 text-lg font-semibold ${chain.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {chain.ok ? "Intact" : `Broken at entry #${chain.brokenAt}`}
          </p>
          <p className="text-xs text-slate-500">{chain.length} hash-chained entries recorded.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Individual director scoring</h2>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {individualScoringPolicy?.value === true ? "Enabled by board policy" : "Disabled (default)"}
          </p>
          <p className="text-xs text-slate-500">
            {individualScoringPolicy
              ? `Policy of record: ${individualScoringPolicy.documentedBy}`
              : "No governance_policy record exists — the hard stop applies."}
          </p>
        </div>
      </section>
    </main>
  );
}

function Card({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-rose-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

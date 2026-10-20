import { DEMO_EVIDENCE, LEADOS_PEOPLE_SCM, generateDemoDataset } from "@/lib/causal/domainModel";
import { runCausalQuery } from "@/lib/causal/query";
import { renderClaimSentence } from "@/lib/causal/language";
import { whyIsThisHappening, whatIf, whatWouldMoveThis, type InterventionCandidate } from "@/lib/causal/counterfactual";
import { listClaims } from "@/lib/causal/store";
import { claimFreshness, daysUntil } from "@/lib/causal/validation";
import type { CausalEstimate } from "@/lib/causal/types";

export const dynamic = "force-dynamic";

const DATA = generateDemoDataset();

function freshnessBadge(f: "fresh" | "aging" | "expired") {
  const style =
    f === "fresh"
      ? "bg-emerald-100 text-emerald-800"
      : f === "aging"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{f}</span>;
}

function EstimateCard({ title, estimate, headline }: { title: string; estimate: CausalEstimate; headline: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            estimate.identifiable ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {estimate.identifiable ? "identifiable" : "association only"}
        </span>
      </div>
      <p className="mt-3 text-base text-slate-800">{headline}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Adjustment set</dt>
          <dd className="font-medium text-slate-900">{estimate.adjustmentSet.join(", ") || "none"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Sample size</dt>
          <dd className="font-medium text-slate-900">{estimate.sampleSize}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Confounders suspected</dt>
          <dd className="font-medium text-slate-900">{estimate.confoundersSuspected.join(", ") || "none"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">E-value</dt>
          <dd className="font-medium text-slate-900">{estimate.sensitivity ? estimate.sensitivity.eValue.toFixed(2) : "n/a"}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Assumptions</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {estimate.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default async function CausalDashboardPage() {
  const flagship = runCausalQuery({
    scm: LEADOS_PEOPLE_SCM,
    query: { effect: "oneOnOneFrequency", on: "retentionStays", population: "all active employees, trailing 12 months" },
    data: DATA,
    evidence: DEMO_EVIDENCE,
  });
  const identifiable = runCausalQuery({
    scm: LEADOS_PEOPLE_SCM,
    query: { effect: "engagementScore", on: "retentionStays", population: "all active employees, trailing 12 months" },
    data: DATA,
    evidence: DEMO_EVIDENCE,
  });

  const flagshipHeadline = renderClaimSentence("1:1 frequency", "retention", flagship);
  const identifiableHeadline = renderClaimSentence("Engagement score", "retention", identifiable);

  const entity = DATA[0];
  const why = whyIsThisHappening(LEADOS_PEOPLE_SCM, entity, "engagementScore", DEMO_EVIDENCE);
  const ifResult = whatIf(
    LEADOS_PEOPLE_SCM,
    entity,
    { oneOnOneFrequency: (entity.oneOnOneFrequency ?? 2) + 1 },
    "retentionStays",
    DEMO_EVIDENCE
  );

  const candidateVars = ["oneOnOneFrequency", "roleClarity", "compensationCompetitiveness"];
  const costPerUnit: Record<string, number> = { oneOnOneFrequency: 25, roleClarity: 10, compensationCompetitiveness: 500 };
  const candidates: InterventionCandidate[] = candidateVars.map((v) => ({
    variable: v,
    label: LEADOS_PEOPLE_SCM.variables.find((x) => x.id === v)?.label ?? v,
    estimate: runCausalQuery({
      scm: LEADOS_PEOPLE_SCM,
      query: { effect: v, on: "retentionStays", population: "all active employees" },
      data: DATA,
      evidence: DEMO_EVIDENCE,
    }),
    costPerUnit: costPerUnit[v] ?? 1,
    candidateDelta: 1,
  }));
  const moveThis = whatWouldMoveThis(candidates, DEMO_EVIDENCE);

  let claims: Awaited<ReturnType<typeof listClaims>> = [];
  let claimsError: string | null = null;
  try {
    claims = await listClaims();
  } catch (err) {
    claimsError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS &middot; Part 05</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Causal reasoning layer</h1>
      <p className="mt-3 max-w-3xl text-slate-700">
        Every relationship below is identified before it is estimated. Non-identifiable relationships are shown as
        associations, never as causes, because the data model itself (not a UI disclaimer) marks them that way.
      </p>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <EstimateCard title="Flagship claim" estimate={flagship} headline={flagshipHeadline} />
        <EstimateCard title="Identifiable comparison" estimate={identifiable} headline={identifiableHeadline} />
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Structural causal model (DAG)</h2>
        <p className="mt-1 text-sm text-slate-600">{LEADOS_PEOPLE_SCM.description}</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4">Variable</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Observable</th>
              <th className="py-2">Parents</th>
            </tr>
          </thead>
          <tbody>
            {LEADOS_PEOPLE_SCM.variables.map((v) => {
              const assignment = LEADOS_PEOPLE_SCM.assignments.find((a) => a.variable === v.id);
              return (
                <tr key={v.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-900">{v.label}</td>
                  <td className="py-2 pr-4 text-slate-600">{v.kind}</td>
                  <td className="py-2 pr-4">
                    {v.observable ? (
                      <span className="text-emerald-700">yes</span>
                    ) : (
                      <span className="font-semibold text-rose-700">no (latent)</span>
                    )}
                  </td>
                  <td className="py-2 text-slate-600">{assignment?.parents.join(", ") || "exogenous"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Why is this happening?</h2>
          <p className="mt-2 text-sm text-slate-800">{why.reasoning.summary}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {why.reasoning.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What if...?</h2>
          <p className="mt-2 text-sm text-slate-800">{ifResult.reasoning.summary}</p>
          <p className="mt-2 text-xs text-slate-500">DAG path: {ifResult.result.path.join(" -> ")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What would move this?</h2>
          <ol className="mt-2 space-y-2 text-sm text-slate-800">
            {moveThis.result.map((r) => (
              <li key={r.variable} className="border-b border-slate-100 pb-1 last:border-0">
                <span className="font-medium">{r.label}</span>
                {r.identifiable ? (
                  <span className="ml-2 text-xs text-slate-500">
                    effect/cost {r.expectedEffectPerCost?.toFixed(4)}
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-semibold text-rose-700">not identifiable</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Saved claims (age &amp; expire)</h2>
        {claimsError && (
          <p className="mt-2 text-sm text-rose-700">
            Claims store not reachable yet ({claimsError}). Run <code>npx tsx scripts/seed-causal.ts</code> after the
            database is migrated.
          </p>
        )}
        {!claimsError && claims.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">
            No claims saved yet. Run <code>npx tsx scripts/seed-causal.ts</code> to seed demo claims.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {claims.map((c) => {
            const freshness = claimFreshness(c);
            const days = daysUntil(c.revalidateBy);
            return (
              <li key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                <div>
                  <p className="font-medium text-slate-900">{c.label}</p>
                  <p className="text-xs text-slate-500">
                    {c.estimate.identifiable ? "identifiable" : "association only"} &middot; as of{" "}
                    {new Date(c.asOf).toLocaleDateString()} &middot; revalidate{" "}
                    {days >= 0 ? `in ${days}d` : `${Math.abs(days)}d overdue`}
                  </p>
                </div>
                {freshnessBadge(freshness)}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

import Link from "next/link";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { listDecisions } from "@/lib/decision/decisionEngine";
import { rankDecisionDesk } from "@/lib/decision/decisionIntelligence";
import { listOrgs } from "@/lib/decision/orgs";
import { listDecisionRights } from "@/lib/decision/decisionRights";
import { DecisionsNav, Pill, Card } from "./components";

export const dynamic = "force-dynamic";

export default async function DecisionDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  await ensureDecisionInvariants();
  const orgs = await listOrgs();
  const sp = await searchParams;
  const orgId = sp.org ?? orgs[0]?.id ?? "";

  if (!orgId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Decision Desk</h1>
        <p className="mt-4 text-slate-600">No org seeded yet. Run the seed script.</p>
      </main>
    );
  }

  const [records, rights] = await Promise.all([listDecisions(orgId), listDecisionRights(orgId)]);
  const deciderByClass = new Map(rights.map((r) => [r.decisionClass, r.deciderRole]));
  const ranked = rankDecisionDesk(records);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="desk" />
      <h1 className="text-3xl font-semibold text-slate-950">Decision Desk</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Open decisions ranked by <code>urgency × reversibility × impact</code>. Evidence-gap warnings surface
        where a decision is at risk of being made badly — no hiding dissent, no silent single-option "decisions".
      </p>

      <div className="mt-8 space-y-4">
        {ranked.length === 0 && (
          <Card>
            <p className="text-slate-600">No open decisions. Everything has been reviewed, or nothing has been raised yet.</p>
          </Card>
        )}
        {ranked.map(({ decision, urgency, reversibilityWeight, impact, rank, warnings }) => (
          <Card key={decision.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/decisions/${decision.id}?org=${orgId}`} className="text-lg font-semibold text-slate-950 hover:underline">
                  {decision.question}
                </Link>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Pill tone={decision.decisionType === "type1" ? "red" : "blue"}>
                    {decision.decisionType === "type1" ? "Type 1 · irreversible" : "Type 2 · reversible"}
                  </Pill>
                  <Pill>{decision.decisionClass}</Pill>
                  <Pill tone="slate">{decision.status.replace("_", " ")}</Pill>
                  <Pill tone={deciderByClass.get(decision.decisionClass) ? "green" : "amber"}>
                    decider: {deciderByClass.get(decision.decisionClass) ?? "unconfigured"}
                  </Pill>
                </div>
              </div>
              <div className="text-right text-sm text-slate-500">
                <div>
                  rank <span className="font-mono text-base font-semibold text-slate-900">{rank}</span>
                </div>
                <div>
                  urgency {urgency} · reversibility ×{reversibilityWeight} · impact {impact}
                </div>
              </div>
            </div>

            {warnings.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                {warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}

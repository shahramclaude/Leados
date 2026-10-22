import { listOrgs } from "@/lib/decision/orgs";
import { db } from "@/db";
import { decisions, decisionStateTransitions, decisionRightsConfigs, sensorSignalReadings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  computeTimeInState,
  computeVelocityByState,
  computeQueueDepthByRole,
  computeDecisionDebt,
} from "@/lib/decision/decisionVelocity";
import type { TriggerCondition } from "@/lib/decision/types";
import { listReviewTasks } from "@/lib/decision/triggers";
import { DecisionsNav, Card, Pill } from "../components";
import { ingestSignalAction, evaluateTriggersAction } from "../actions";

export const dynamic = "force-dynamic";

function fmtMs(ms: number) {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default async function DebtAndVelocityPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const orgs = await listOrgs();
  const sp = await searchParams;
  const orgId = sp.org ?? orgs[0]?.id ?? "";

  if (!orgId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p>No org seeded.</p>
      </main>
    );
  }

  const orgDecisions = await db.select().from(decisions).where(eq(decisions.orgId, orgId));
  const decisionIds = new Set(orgDecisions.map((d) => d.id));
  const allTransitions = await db.select().from(decisionStateTransitions);
  const transitions = allTransitions.filter((t) => decisionIds.has(t.decisionId));
  const samples = computeTimeInState(
    transitions.map((t) => ({ decisionId: t.decisionId, fromState: t.fromState, toState: t.toState, createdAt: t.createdAt })),
  );
  const velocityByState = computeVelocityByState(samples);

  const rights = await db.select().from(decisionRightsConfigs).where(eq(decisionRightsConfigs.orgId, orgId));
  const deciderByClass = new Map(rights.map((r) => [r.decisionClass, r.deciderRole]));
  const queueDepthByRole = computeQueueDepthByRole(
    orgDecisions.map((d) => ({ decisionId: d.id, status: d.status as any, deciderRole: deciderByClass.get(d.decisionClass) ?? null })),
  );

  const readings = await db.select().from(sensorSignalReadings).where(eq(sensorSignalReadings.orgId, orgId));
  const latestMap = new Map<string, number>();
  for (const r of [...readings].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())) {
    if (!latestMap.has(r.signal)) latestMap.set(r.signal, Number(r.value));
  }
  const debt = computeDecisionDebt(
    orgDecisions.map((d) => ({
      decisionId: d.id,
      question: d.question,
      status: d.status as any,
      triggerConditions: (d.triggerConditions as TriggerCondition[]) ?? [],
    })),
    [...latestMap.entries()].map(([signal, value]) => ({ signal, value })),
  );

  const reviewTasks = await listReviewTasks(orgId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="debt" />
      <h1 className="text-3xl font-semibold text-slate-950">Decision Velocity &amp; Debt</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Time-in-state percentiles per funnel stage, queue depth by decider role, and decision debt: decisions
        still unmade whose own trigger conditions have already fired.
      </p>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Velocity by funnel stage</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Stage</th>
              <th className="py-2">Samples</th>
              <th className="py-2">p50 time-in-state</th>
              <th className="py-2">p95 time-in-state</th>
            </tr>
          </thead>
          <tbody>
            {velocityByState.map((v) => (
              <tr key={v.state} className="border-b border-slate-100">
                <td className="py-2">{v.state.replace("_", " ")}</td>
                <td className="py-2">{v.count}</td>
                <td className="py-2">{fmtMs(v.p50Ms)}</td>
                <td className="py-2">{fmtMs(v.p95Ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Queue depth by decider role</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {queueDepthByRole.map((q) => (
            <li key={q.role} className="flex justify-between rounded-lg border border-slate-100 px-3 py-1.5">
              <span>{q.role}</span>
              <span className="font-medium">{q.openCount} open</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6 border-2 border-red-300">
        <h2 className="text-lg font-semibold text-red-800">Decision debt ({debt.length})</h2>
        <p className="mt-1 text-sm text-slate-600">Unmade decisions past their trigger-condition thresholds.</p>
        <ul className="mt-3 space-y-2">
          {debt.length === 0 && <li className="text-sm text-slate-500">No decision debt detected.</li>}
          {debt.map((d) => (
            <li key={d.decisionId} className="rounded-lg bg-red-50 p-3 text-sm">
              <p className="font-medium">{d.question}</p>
              <p className="text-red-700">Breached signals: {d.breachedSignals.join(", ")}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Signals (Part 13 sensing — stub seam)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Part 13 (sensing) is not present in this build. Push a manual signal reading to simulate it, then
          evaluate triggers to see decision debt / auto-opened reviews update.
        </p>
        <form action={ingestSignalAction} className="mt-3 grid grid-cols-3 gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input name="signal" placeholder="signal name" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="value" type="number" step="any" placeholder="value" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            Push reading &amp; evaluate
          </button>
        </form>
        <form action={evaluateTriggersAction} className="mt-2">
          <input type="hidden" name="orgId" value={orgId} />
          <button type="submit" className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
            Re-evaluate triggers only
          </button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Review tasks opened by trigger breach</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {reviewTasks.length === 0 && <li className="text-slate-500">None yet.</li>}
          {reviewTasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5">
              <span>{t.title}</span>
              <Pill tone={t.status === "open" ? "amber" : "green"}>{t.status}</Pill>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}

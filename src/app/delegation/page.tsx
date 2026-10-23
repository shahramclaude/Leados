import { listPeople } from "@/lib/db/peopleRepo";
import { listChecks, listDelegations } from "@/lib/db/delegationRepo";
import { db } from "@/db";
import { capacityTwin, growthGoals } from "@/db/schema";
import {
  acceptDelegationAction,
  checkinDelegationAction,
  completeDelegationAction,
  overrideDelegationAction,
  proposeDelegationAction,
} from "../actions";

export const dynamic = "force-dynamic";

const ACTION_CLASSES = ["approve.budget_request", "publish.customer_comms", "draft.internal_task"];

const STATUS_STYLES: Record<string, string> = {
  proposed: "bg-sky-50 text-sky-700 border-sky-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blocked: "bg-rose-50 text-rose-700 border-rose-200",
  declined: "bg-slate-100 text-slate-600 border-slate-200",
  completed: "bg-violet-50 text-violet-700 border-violet-200",
};

export default async function DelegationPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const people = await listPeople();
  const viewer = people.find((p) => p.id === as) ?? people[0];
  const delegations = await listDelegations();
  const capacities = await db.select().from(capacityTwin);
  const goals = await db.select().from(growthGoals);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const checksByDelegation = Object.fromEntries(
    await Promise.all(delegations.map(async (d) => [d.id, await listChecks(d.id)] as const)),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Delegation Map</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Every delegation runs authority, capacity, and growth checks before it is trusted. Authority and
        capacity can block; growth only ever suggests.
      </p>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-900">Load map</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {capacities.map((c) => {
            const goal = goals.find((g) => g.personId === c.personId);
            return (
              <div key={c.id} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{nameOf(c.personId)}</p>
                <p className="mt-1 text-xs text-slate-500">{c.allocatedHours}h / {c.capacityHours}h allocated this week</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${c.allocatedHours / c.capacityHours > 0.9 ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, (c.allocatedHours / c.capacityHours) * 100)}%` }}
                  />
                </div>
                {goal && <p className="mt-2 text-xs text-slate-500">Growth goal: {goal.goalLabel}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-900">Propose a delegation</h2>
        <form action={proposeDelegationAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select name="delegatorId" defaultValue={viewer?.id} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} (delegator)</option>)}
          </select>
          <select name="delegateId" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} (delegate)</option>)}
          </select>
          <select name="actionClassKey" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {ACTION_CLASSES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input name="task" placeholder="Task description" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
          <input name="estimatedHours" type="number" step="0.5" min="0" placeholder="Estimated hours" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="weekOf" type="date" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="skillTags" placeholder="skill tags, comma separated" className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
          <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Propose</button>
        </form>
      </section>

      <section className="mt-8 space-y-4">
        {delegations.map((d) => {
          const checks = checksByDelegation[d.id] ?? [];
          return (
            <div key={d.id} className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{d.task}</p>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[d.status]}`}>{d.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {nameOf(d.delegatorId)} → {nameOf(d.delegateId)} · {d.estimatedHours}h · class {d.actionClassKey}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {checks.map((chk) => (
                  <div key={chk.id} className={`rounded-xl border p-3 text-xs ${chk.passed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                    <p className="font-semibold uppercase tracking-wide">{chk.checkType}</p>
                    <p className="mt-1">{(chk.explanation as { reason?: string }).reason}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {d.status === "blocked" && (
                  <form action={overrideDelegationAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="actorId" value={viewer?.id} />
                    <input name="reason" placeholder="override reason" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <button className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">Override (human decision)</button>
                  </form>
                )}
                {d.status === "proposed" && (
                  <form action={acceptDelegationAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="rounded-full border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Accept</button>
                  </form>
                )}
                {d.status === "accepted" && (
                  <>
                    <form action={checkinDelegationAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">Log check-in</button>
                    </form>
                    <form action={completeDelegationAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="rounded-full border border-violet-300 px-3 py-1 text-xs text-violet-700 hover:bg-violet-50">Mark complete</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {delegations.length === 0 && <p className="text-sm text-slate-500">No delegations yet.</p>}
      </section>
    </main>
  );
}

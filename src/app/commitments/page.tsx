import { listPeople } from "@/lib/db/peopleRepo";
import { listCommitments, listEvents } from "@/lib/db/commitmentRepo";
import { computeFollowThrough } from "@/lib/commitmentLedger";
import {
  confirmCommitmentAction,
  createCommitmentAction,
  keepCommitmentAction,
  renegotiateCommitmentAction,
} from "../actions";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-50 text-sky-700 border-sky-200",
  kept: "bg-emerald-50 text-emerald-700 border-emerald-200",
  broken: "bg-rose-50 text-rose-700 border-rose-200",
  renegotiated: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const people = await listPeople();
  const viewer = people.find((p) => p.id === as) ?? people[0];
  const commitments = await listCommitments();

  const mine = viewer ? commitments.filter((c) => c.promisorId === viewer.id) : [];
  const theirs = viewer ? commitments.filter((c) => c.promiseeId === viewer.id) : [];

  const teamScope = viewer ? commitments.filter((c) => people.find((p) => p.id === c.promisorId)?.team === viewer.team) : [];
  const metrics = computeFollowThrough(viewer ? `${viewer.team} team` : "all", teamScope);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Commitments</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Everything anyone promised, from any surface — meetings, decisions, 1:1s. Renegotiation is tracked,
        not hidden: a changed deadline leaves a visible trace distinct from a broken one.
      </p>

      <ViewerSwitcher people={people} current={viewer?.id ?? ""} />

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Follow-through — {metrics.scopeLabel} (aggregate-safe)
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Metric label="Kept" value={metrics.kept} />
          <Metric label="Broken" value={metrics.broken} />
          <Metric label="Renegotiated → kept" value={metrics.renegotiatedThenKept} />
          <Metric label="Renegotiated → broken" value={metrics.renegotiatedThenBroken} />
          <Metric label="Still open after renegotiation" value={metrics.stillOpenAfterRenegotiation} />
          <Metric label="Keep rate" value={`${(metrics.keepRate * 100).toFixed(0)}%`} />
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CommitmentColumn
          title="Mine — what I promised"
          commitments={mine}
          nameOf={nameOf}
          viewerId={viewer?.id ?? ""}
          allowActions
        />
        <CommitmentColumn
          title="Theirs — promised to me"
          commitments={theirs}
          nameOf={nameOf}
          viewerId={viewer?.id ?? ""}
          allowActions={false}
        />
      </div>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-900">Log a new commitment</h2>
        <form action={createCommitmentAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select name="promisorId" defaultValue={viewer?.id} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (promisor)</option>
            ))}
          </select>
          <select name="promiseeId" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (promisee)</option>
            ))}
          </select>
          <input name="content" placeholder="What was promised" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2 lg:col-span-2" />
          <input name="dueAt" type="date" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Add</button>
        </form>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 text-center">
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function ViewerSwitcher({ people, current }: { people: { id: string; name: string }[]; current: string }) {
  return (
    <form className="mt-6 flex items-center gap-3" action="/commitments">
      <label className="text-sm text-slate-600">Viewing as</label>
      <select name="as" defaultValue={current} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Switch</button>
    </form>
  );
}

function CommitmentColumn({
  title,
  commitments,
  nameOf,
  viewerId,
  allowActions,
}: {
  title: string;
  commitments: Awaited<ReturnType<typeof listCommitments>>;
  nameOf: (id: string) => string;
  viewerId: string;
  allowActions: boolean;
}) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <ul className="mt-4 space-y-3">
        {commitments.length === 0 && <li className="text-sm text-slate-500">Nothing here.</li>}
        {commitments.map((c) => (
          <li key={c.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{c.content}</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[c.status]}`}>{c.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {nameOf(c.promisorId)} → {nameOf(c.promiseeId)} · due {fmt(c.dueAt)} · {c.confirmed ? "confirmed" : "needs confirmation (extracted)"}
            </p>
            {c.renegotiatedFromId && (
              <p className="mt-1 text-xs text-amber-700">renegotiated from an earlier commitment — history preserved</p>
            )}
            {allowActions && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!c.confirmed && (
                  <form action={confirmCommitmentAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="actorId" value={viewerId} />
                    <button className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">Confirm</button>
                  </form>
                )}
                {c.status === "open" && (
                  <form action={keepCommitmentAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="actorId" value={viewerId} />
                    <button className="rounded-full border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Mark kept</button>
                  </form>
                )}
                {c.status === "open" && (
                  <form action={renegotiateCommitmentAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="actorId" value={viewerId} />
                    <input type="date" name="newDueAt" required className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <input type="text" name="note" placeholder="reason" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <button className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">Renegotiate</button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

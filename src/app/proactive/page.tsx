import { listPeople } from "@/lib/db/peopleRepo";
import { listDrafts } from "@/lib/db/proactiveRepo";
import { approveDraftAction, dismissDraftAction, runDetectionCycleAction } from "../actions";

export const dynamic = "force-dynamic";

const STAKES_STYLES: Record<string, string> = {
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  elevated: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  auto_sent: "bg-violet-50 text-violet-700 border-violet-200",
  dismissed: "bg-slate-100 text-slate-500 border-slate-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function ProactivePage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const people = await listPeople();
  const viewer = people.find((p) => p.id === as) ?? people[0];
  const drafts = await listDrafts();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const queued = drafts.filter((d) => d.status === "queued");
  const decided = drafts.filter((d) => d.status !== "queued");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Proactive Queue</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Every drafted intervention explains why-this and why-now. Everything is T1 by default: one tap to
        send, one tap to dismiss. The queue respects quiet hours and a daily interrupt cap — low-stakes
        items pile up into a single digest instead of nagging.
      </p>

      <form action={runDetectionCycleAction} className="mt-6">
        <button className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Run detection cycle now
        </button>
      </form>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Queued ({queued.length})</h2>
        {queued.length === 0 && <p className="text-sm text-slate-500">Nothing queued — run a detection cycle above.</p>}
        {queued.map((d) => (
          <div key={d.id} className="rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {d.draftType.toUpperCase()} → {nameOf(d.targetPersonId)} {d.batchedCount > 1 ? `(batched x${d.batchedCount})` : ""}
              </p>
              <div className="flex gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STAKES_STYLES[d.stakes]}`}>{d.stakes}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">{d.autonomyTier}</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-800">{d.draftContent}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><span className="font-semibold">Why this:</span> {d.whyThis}</p>
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><span className="font-semibold">Why now:</span> {d.whyNow}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={approveDraftAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="actorId" value={viewer?.id} />
                <button className="rounded-full border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Approve &amp; send</button>
              </form>
              <form action={dismissDraftAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="actorId" value={viewer?.id} />
                <button className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">Dismiss</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Decided ({decided.length})</h2>
        <ul className="mt-3 space-y-2">
          {decided.slice(0, 20).map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
              <span className="truncate pr-3 text-slate-700">{d.draftContent}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[d.status]}`}>{d.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

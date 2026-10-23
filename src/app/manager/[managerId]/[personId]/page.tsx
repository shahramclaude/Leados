import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/people";
import { sharedGoalsForManagerView } from "@/lib/development";
import { sharedCommitmentsForManagerView } from "@/lib/coaching";
import {
  listNudgesForManager,
  listOneOnOnes,
  managerVisibleItems,
  personOwnEquivalentItems,
} from "@/lib/managerEnablement";
import { VisibilityBadge } from "@/components/VisibilityBadge";
import { ActionForm, InlineButton, TextField } from "@/components/forms";
import { acknowledgeNudgeAction, generateNudgesAction, scheduleOneOnOneAction } from "@/app/actions";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function ManagerNudgesPage({
  params,
}: {
  params: Promise<{ managerId: string; personId: string }>;
}) {
  const { managerId, personId } = await params;
  const [manager, person] = await Promise.all([getPerson(managerId), getPerson(personId)]);
  if (!manager || !person) notFound();
  if (manager.role !== "manager" && manager.role !== "admin") notFound();
  if (person.managerId !== manager.id) {
    return (
      <>
        <TopNav crumb="Access denied" />
        <main className="mx-auto max-w-3xl px-6 py-10 text-sm text-rose-700">
          {manager.name} is not {person.name}&apos;s manager, so this 1:1 view is not available. This perimeter check
          mirrors the scoping rule in <code>src/lib/people.ts#canActOnPerson</code>.
        </main>
      </>
    );
  }

  const [goals, commitments, nudges, oneOnOnes, managerItems, personItems] = await Promise.all([
    sharedGoalsForManagerView(personId),
    sharedCommitmentsForManagerView(personId),
    listNudgesForManager(managerId, personId),
    listOneOnOnes(managerId, personId),
    managerVisibleItems(managerId, personId),
    personOwnEquivalentItems(personId),
  ]);

  const personKeys = new Set(personItems.map((i) => `${i.sourceTable}:${i.sourceId}`));
  const symmetryHolds = managerItems.every((i) => personKeys.has(`${i.sourceTable}:${i.sourceId}`));

  return (
    <>
      <TopNav crumb={`${manager.name} → ${person.name}`} />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <section className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-900 ring-1 ring-emerald-100">
          <strong>Symmetry check: {symmetryHolds ? "✅ holds" : "❌ VIOLATION"}.</strong> Every item below is also
          visible to {person.name} at{" "}
          <Link className="underline" href={`/dashboard/${personId}/one-on-one`}>
            their own 1:1 Space
          </Link>{" "}
          — nothing here exceeds what they can already see about themselves.
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Topics worth raising (nudges)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Generated only from {person.name}&apos;s own shared goals and commitments — never from private data.
          </p>
          <InlineButton className="mt-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" onRun={() => generateNudgesAction(managerId, personId)} label="Refresh nudges" />
          <ul className="mt-3 space-y-2">
            {nudges.length === 0 && <p className="text-sm text-slate-500">Nothing flagged right now.</p>}
            {nudges.map((n) => (
              <li key={n.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-900">{n.message}</p>
                  {n.acknowledgedAt ? (
                    <span className="text-xs text-slate-400">acknowledged</span>
                  ) : (
                    <InlineButton
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                      onRun={() => acknowledgeNudgeAction(n.id, managerId, personId)}
                      label="Mark raised"
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  source: {n.sourceTable}#{n.sourceId} — the same row {person.name} sees in their own view.
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">1:1s</h2>
          <ul className="mt-3 space-y-2">
            {oneOnOnes.length === 0 && <p className="text-sm text-slate-500">None scheduled.</p>}
            {oneOnOnes.map((o) => (
              <li key={o.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                {new Date(o.scheduledAt).toLocaleString()} · {o.status}
              </li>
            ))}
          </ul>
          <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Schedule a 1:1</summary>
            <ActionForm
              className="mt-3"
              submitLabel="Schedule"
              action={async (fd) => {
                "use server";
                await scheduleOneOnOneAction(managerId, personId, String(fd.get("scheduledAt")));
              }}
            >
              <TextField name="scheduledAt" label="Date & time" placeholder="2026-04-10T15:00" />
            </ActionForm>
          </details>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Shared growth goals</h2>
          <ul className="mt-3 space-y-3">
            {goals.length === 0 && <p className="text-sm text-slate-500">Nothing shared.</p>}
            {goals.map((g) => (
              <li key={g.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{g.title}</p>
                  <VisibilityBadge visibility={g.visibility} />
                </div>
                <p className="text-sm text-slate-600">{g.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Shared commitments</h2>
          <ul className="mt-3 space-y-3">
            {commitments.length === 0 && <p className="text-sm text-slate-500">Nothing shared.</p>}
            {commitments.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{c.title}</p>
                  <VisibilityBadge visibility={c.visibility} />
                </div>
                <p className="text-sm text-slate-600">{c.description}</p>
                <p className="mt-1 text-xs text-slate-400">status: {c.status}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-slate-50 p-5 text-xs text-slate-500 ring-1 ring-slate-200">
          What you cannot see here: private goals, the evidence log, raw coaching transcripts, 360 feedback content
          below the confidentiality threshold, and the private journal. That data is not hidden by a UI filter — it
          was never written anywhere this view reads from.
        </section>
      </main>
    </>
  );
}

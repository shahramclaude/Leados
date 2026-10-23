import { notFound } from "next/navigation";
import { getPerson } from "@/lib/people";
import { sharedGoalsForManagerView } from "@/lib/development";
import { sharedCommitmentsForManagerView } from "@/lib/coaching";
import { listOneOnOnes } from "@/lib/managerEnablement";
import { VisibilityBadge } from "@/components/VisibilityBadge";
import { ActionForm, TextField } from "@/components/forms";
import { scheduleOneOnOneAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function OneOnOnePage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const manager = person.managerId ? await getPerson(person.managerId) : undefined;
  const [sharedGoals, sharedCommitments, oneOnOnes] = await Promise.all([
    sharedGoalsForManagerView(personId),
    sharedCommitmentsForManagerView(personId),
    manager ? listOneOnOnes(manager.id, personId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-900 ring-1 ring-emerald-100">
        <strong>Symmetry rule:</strong> this page shows exactly what {manager ? manager.name : "your manager"} can
        see about your growth — nothing more. It is built only from items you marked{" "}
        <VisibilityBadge visibility="shared_with_manager" />. Your private goals, evidence, journal, and coaching
        transcripts never appear here or in your manager&apos;s view.
      </section>

      {!manager && <p className="text-sm text-slate-500">This person has no manager on record.</p>}

      {manager && (
        <>
          <section>
            <h2 className="text-lg font-semibold text-slate-900">Scheduled 1:1s with {manager.name}</h2>
            <ul className="mt-3 space-y-2">
              {oneOnOnes.length === 0 && <p className="text-sm text-slate-500">None scheduled yet.</p>}
              {oneOnOnes.map((o) => (
                <li key={o.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  {new Date(o.scheduledAt).toLocaleString()} · every {o.cadenceDays} days · {o.status}
                </li>
              ))}
            </ul>
            <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Propose a 1:1 time</summary>
              <ActionForm
                className="mt-3"
                submitLabel="Schedule"
                action={async (fd) => {
                  "use server";
                  await scheduleOneOnOneAction(manager.id, personId, String(fd.get("scheduledAt")));
                }}
              >
                <TextField name="scheduledAt" label="Date & time" placeholder="2026-04-10T15:00" />
              </ActionForm>
            </details>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Shared growth goals</h2>
            <ul className="mt-3 space-y-3">
              {sharedGoals.length === 0 && <p className="text-sm text-slate-500">Nothing shared yet.</p>}
              {sharedGoals.map((g) => (
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
            <h2 className="text-lg font-semibold text-slate-900">Shared coaching commitments</h2>
            <ul className="mt-3 space-y-3">
              {sharedCommitments.length === 0 && <p className="text-sm text-slate-500">Nothing shared yet.</p>}
              {sharedCommitments.map((c) => (
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
        </>
      )}
    </div>
  );
}

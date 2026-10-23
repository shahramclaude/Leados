import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPerson } from "@/lib/people";
import { listSessionsForPerson } from "@/lib/coaching";
import { ActionForm, TextField } from "@/components/forms";
import { startCoachingSessionAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function CoachListPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const sessions = await listSessionsForPerson(personId);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-sky-50 p-5 text-sm text-sky-900 ring-1 ring-sky-100">
        <strong>Private by default — always.</strong> Coaching transcripts are never visible to your manager, an
        admin, or any evaluation system. GROW structure: Goal → Reality → Options → Will. The coach only asks and
        reflects — it never tells you what to do. The only thing that can ever leave this space is a commitment you
        explicitly confirm and choose to share.
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Your sessions</h2>
        <ul className="mt-3 space-y-2">
          {sessions.length === 0 && <p className="text-sm text-slate-500">No sessions yet — start one below.</p>}
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/dashboard/${personId}/coach/${s.id}`} className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                <p className="font-medium text-slate-900">{s.topic}</p>
                <p className="text-xs text-slate-400">
                  stage: {s.stage} · status: {s.status}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Start a new session</h2>
        <ActionForm
          className="mt-3 max-w-md"
          submitLabel="Start session"
          action={async (fd) => {
            "use server";
            const sessionId = await startCoachingSessionAction(personId, String(fd.get("topic")));
            redirect(`/dashboard/${personId}/coach/${sessionId}`);
          }}
        >
          <TextField name="topic" label="What's on your mind?" placeholder="e.g. Delegating without taking it back" />
        </ActionForm>
      </section>
    </div>
  );
}

import { notFound } from "next/navigation";
import { getPerson } from "@/lib/people";
import { allCompetencies } from "@/lib/development";
import {
  draftCommitmentFromSession,
  getSession,
  listMessages,
  scoreTranscript,
} from "@/lib/coaching";
import { db } from "@/db";
import { commitments as commitmentsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { VisibilityBadge } from "@/components/VisibilityBadge";
import { ActionForm, SelectField, TextField } from "@/components/forms";
import { confirmCommitmentAction, postCoachingTurnAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function CoachSessionPage({
  params,
}: {
  params: Promise<{ personId: string; sessionId: string }>;
}) {
  const { personId, sessionId } = await params;
  const person = await getPerson(personId);
  const session = await getSession(sessionId);
  if (!person || !session || session.personId !== personId) notFound();

  const [messages, competencies, resultingCommitment] = await Promise.all([
    listMessages(sessionId),
    allCompetencies(),
    db.select().from(commitmentsTable).where(eq(commitmentsTable.sessionId, sessionId)),
  ]);

  const commitment = resultingCommitment[0];
  const awaitingConfirmation = session.stage === "complete" && session.status === "active" && !commitment;
  const draft = awaitingConfirmation ? await draftCommitmentFromSession(sessionId) : undefined;
  const rubric = scoreTranscript(messages, Boolean(commitment));

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-100">
        <span>
          <strong>{session.topic}</strong> · stage: {session.stage} · status: {session.status}
        </span>
        <span title="Non-directiveness / question quality / action orientation">
          quality: {rubric.nonDirectiveness}/{rubric.questionQuality}/{rubric.actionOrientation}
        </span>
      </section>

      <section className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              "max-w-[80%] rounded-2xl px-4 py-2 text-sm " +
              (m.speaker === "coach" ? "bg-slate-100 text-slate-900" : "ml-auto bg-indigo-600 text-white")
            }
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide opacity-60">
              {m.speaker === "coach" ? "Coach" : "You"} · {m.stage}
            </p>
            {m.content}
          </div>
        ))}
      </section>

      {session.status === "active" && session.stage !== "complete" && (
        <ActionForm
          submitLabel="Send"
          action={async (fd) => {
            "use server";
            await postCoachingTurnAction(sessionId, personId, String(fd.get("content")));
          }}
        >
          <TextField name="content" label="Your reply" placeholder="Say what's true for you..." />
        </ActionForm>
      )}

      {awaitingConfirmation && draft && (
        <section className="rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-4">
          <h3 className="text-sm font-semibold text-indigo-900">Confirm your commitment</h3>
          <p className="mt-1 text-xs text-indigo-700">
            This is drawn only from your own Will-stage answers. You choose the final wording, the competency tag, and
            who can see it — the coach does not decide any of this.
          </p>
          <ActionForm
            className="mt-3"
            submitLabel="Confirm commitment"
            action={async (fd) => {
              "use server";
              await confirmCommitmentAction({
                sessionId,
                personId,
                title: String(fd.get("title")),
                description: String(fd.get("description")),
                competencyId: String(fd.get("competencyId")) || undefined,
                visibility: fd.get("visibility") === "shared_with_manager" ? "shared_with_manager" : "private",
              });
            }}
          >
            <TextField name="title" label="Title" defaultValue={draft.title} />
            <TextField name="description" label="Description" defaultValue={draft.description} />
            <SelectField
              name="competencyId"
              label="Tag to competency (optional)"
              options={[{ value: "", label: "None" }, ...competencies.map((c) => ({ value: c.id, label: c.label }))]}
            />
            <SelectField
              name="visibility"
              label="Who can see this commitment?"
              options={[
                { value: "private", label: "Private — only me" },
                { value: "shared_with_manager", label: "Shared with my manager" },
              ]}
            />
          </ActionForm>
        </section>
      )}

      {commitment && (
        <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-emerald-900">Commitment confirmed</h3>
            <VisibilityBadge visibility={commitment.visibility} />
          </div>
          <p className="mt-1 text-sm text-emerald-900">{commitment.title}</p>
        </section>
      )}
    </div>
  );
}

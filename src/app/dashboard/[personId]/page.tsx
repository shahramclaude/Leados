import { notFound } from "next/navigation";
import { getPerson } from "@/lib/people";
import {
  allCompetencies,
  computeGaps,
  getEvidenceForPerson,
  listGoals,
  listStoredRecommendations,
} from "@/lib/development";
import { listOwnJournal } from "@/lib/decisionJournal";
import { listCommitments } from "@/lib/coaching";
import { VisibilityBadge } from "@/components/VisibilityBadge";
import { ActionForm, InlineButton, SelectField, TextAreaField, TextField } from "@/components/forms";
import {
  computeRecommendationsAction,
  createGoalAction,
  recordCommitmentProgressAction,
  recordEvidenceAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MyGrowthPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const [competencies, goals, evidence, gaps, recommendations, journal, commitments] = await Promise.all([
    allCompetencies(),
    listGoals(personId),
    getEvidenceForPerson(personId),
    computeGaps(personId),
    listStoredRecommendations(personId),
    listOwnJournal(personId),
    listCommitments(personId),
  ]);

  const competencyOptions = competencies.map((c) => ({ value: c.id, label: c.label }));
  const competencyLabel = (id: string) => competencies.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-indigo-50 p-5 text-sm text-indigo-900 ring-1 ring-indigo-100">
        <strong>Who can see this page:</strong> only you, by default. Goals, evidence, recommendations, commitments
        and your journal all start <VisibilityBadgeInline />. Anything you mark{" "}
        <span className="font-medium">shared with your manager</span> also appears — in the same words, on the same
        rows — in your manager&apos;s 1:1 view. Nothing here is ever sent to a performance-evaluation system.
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Demonstrated gaps (evidence-based, not self-rating alone)</h2>
        <p className="mt-1 text-sm text-slate-600">
          A gap only shows here once at least one <em>non-self-rating</em> event (manager observation, demonstrated
          outcome, or a feedback theme you chose to link) supports it.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {gaps.length === 0 && <p className="text-sm text-slate-500">No evidence-backed gaps yet.</p>}
          {gaps.map((g) => (
            <div key={g.competencyId} className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-slate-900">{g.competencyLabel}</p>
              <p className="text-sm text-slate-600">
                current {g.currentLevel} / target {g.targetLevel} · gap {g.gap}
              </p>
              <p className="mt-1 text-xs text-slate-400">{g.supportingEvidenceIds.length} supporting evidence event(s)</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <InlineButton onRun={() => computeRecommendationsAction(personId)} label="Compute growth-path recommendations" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Growth path recommendations</h2>
        <div className="mt-3 space-y-3">
          {recommendations.length === 0 && <p className="text-sm text-slate-500">None yet — compute above.</p>}
          {recommendations.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{r.recommendationType}</p>
              <p className="font-medium text-slate-900">{r.gapSummary}</p>
              <p className="mt-1 text-sm text-slate-700">{r.rationale}</p>
              <p className="mt-1 text-xs text-slate-400">Cites {r.citedEvidenceIds.length} evidence event id(s) — never self-rating alone.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Growth goals</h2>
          <ul className="mt-3 space-y-3">
            {goals.map((g) => (
              <li key={g.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{g.title}</p>
                  <VisibilityBadge visibility={g.visibility} />
                </div>
                <p className="text-sm text-slate-600">{g.description}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {competencyLabel(g.competencyId)} · status: {g.status}
                </p>
              </li>
            ))}
          </ul>
          <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Add a growth goal</summary>
            <ActionForm
              className="mt-3"
              submitLabel="Add goal"
              action={async (fd) => {
                "use server";
                await createGoalAction({
                  personId,
                  competencyId: String(fd.get("competencyId")),
                  title: String(fd.get("title")),
                  description: String(fd.get("description")),
                  visibility: fd.get("visibility") === "shared_with_manager" ? "shared_with_manager" : "private",
                });
              }}
            >
              <SelectField name="competencyId" label="Competency" options={competencyOptions} />
              <TextField name="title" label="Title" placeholder="e.g. Let go of the pen on review docs" />
              <TextAreaField name="description" label="Description" placeholder="What does success look like?" />
              <SelectField
                name="visibility"
                label="Visibility"
                options={[
                  { value: "private", label: "Private — only me" },
                  { value: "shared_with_manager", label: "Shared with my manager" },
                ]}
              />
            </ActionForm>
          </details>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">Evidence log</h2>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {evidence.map((e) => (
              <li key={e.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {competencyLabel(e.competencyId)} <span className="font-normal text-slate-400">· {e.eventType}</span>
                </p>
                <p className="text-slate-600">{e.narrative}</p>
              </li>
            ))}
          </ul>
          <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Add evidence</summary>
            <ActionForm
              className="mt-3"
              submitLabel="Add evidence"
              action={async (fd) => {
                "use server";
                await recordEvidenceAction({
                  personId,
                  competencyId: String(fd.get("competencyId")),
                  eventType: String(fd.get("eventType")) as "self_rating" | "manager_observation" | "peer_feedback_theme" | "demonstrated_outcome",
                  narrative: String(fd.get("narrative")),
                  evidenceWeight: Number(fd.get("evidenceWeight")),
                });
              }}
            >
              <SelectField name="competencyId" label="Competency" options={competencyOptions} />
              <SelectField
                name="eventType"
                label="Type"
                options={[
                  { value: "self_rating", label: "Self-rating (lowest weight)" },
                  { value: "manager_observation", label: "Manager observation" },
                  { value: "demonstrated_outcome", label: "Demonstrated outcome" },
                ]}
              />
              <TextAreaField name="narrative" label="What happened" />
              <TextField name="evidenceWeight" label="Strength (1-5)" defaultValue="3" />
            </ActionForm>
          </details>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Commitments from coaching</h2>
        <ul className="mt-3 space-y-3">
          {commitments.length === 0 && <p className="text-sm text-slate-500">No commitments yet — try a Coach Session.</p>}
          {commitments.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{c.title}</p>
                <VisibilityBadge visibility={c.visibility} />
              </div>
              <p className="text-sm text-slate-600">{c.description}</p>
              <p className="mt-1 text-xs text-slate-400">status: {c.status}</p>
              <div className="mt-2 flex gap-2">
                {(["in_progress", "done", "dropped"] as const).map((status) => (
                  <InlineButtonInline key={status} commitmentId={c.id} personId={personId} status={status} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Private journal</h2>
        <p className="mt-1 text-sm text-slate-600">Only you can ever read your raw journal. Nobody else — not your manager, not an admin — has a view of this list.</p>
        <ul className="mt-3 space-y-2">
          {journal.length === 0 && <p className="text-sm text-slate-500">Empty so far.</p>}
          {journal.map((j) => (
            <li key={j.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">{j.kind.replace("_", " ")}</p>
              <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(j.content, null, 2)}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function VisibilityBadgeInline() {
  return <VisibilityBadge visibility="private" />;
}

function InlineButtonInline({ commitmentId, personId, status }: { commitmentId: string; personId: string; status: "in_progress" | "done" | "dropped" }) {
  return (
    <InlineButton
      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      onRun={() => recordCommitmentProgressAction(commitmentId, personId, status)}
      label={status.replace("_", " ")}
    />
  );
}

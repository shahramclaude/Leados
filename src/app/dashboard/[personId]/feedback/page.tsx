import { notFound } from "next/navigation";
import { getPerson, listPeople } from "@/lib/people";
import { allCompetencies } from "@/lib/development";
import {
  getFeedbackForSubject,
  listPendingInvitationsForRater,
  listRequestsForSubject,
} from "@/lib/feedback";
import { ConfidentialityBadge } from "@/components/VisibilityBadge";
import { ActionForm, SelectField, TextAreaField, TextField } from "@/components/forms";
import {
  createFeedbackRequestAction,
  linkFeedbackThemeAction,
  submitFeedbackResponseAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  const [requests, pendingToGive, competencies, people] = await Promise.all([
    listRequestsForSubject(personId),
    listPendingInvitationsForRater(personId),
    allCompetencies(),
    listPeople(),
  ]);

  const competencyOptions = [{ value: "", label: "General" }, ...competencies.map((c) => ({ value: c.id, label: c.label }))];
  const raterOptions = people.filter((p) => p.id !== personId);
  const competencyLabel = (id: string | null) => competencies.find((c) => c.id === id)?.label ?? "General";

  const views = await Promise.all(requests.map((r) => getFeedbackForSubject(r.id)));

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-100">
        <strong>Confidentiality is enforced in storage, not just on screen.</strong> Anonymous responses never store
        who gave them — not even an admin with direct database access can recover it. Aggregated feedback is withheld
        entirely until enough people respond.
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Feedback requested about you</h2>
        <ul className="mt-3 space-y-4">
          {requests.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
          {requests.map((r, i) => {
            const view = views[i];
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    {competencyLabel(r.themeCompetencyId)} — {r.message}
                  </p>
                  <ConfidentialityBadge policy={r.confidentialityPolicy} threshold={r.aggregationThreshold} />
                </div>
                {view.status === "withheld" ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Withheld to protect confidentiality — {view.respondedCount}/{view.threshold} responses so far.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    <p className="text-slate-600">{view.respondedCount} response(s) aggregated.</p>
                    <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                      {JSON.stringify(view.aggregateRatings, null, 2)}
                    </pre>
                    <ul className="list-disc space-y-1 pl-5 text-slate-700">
                      {view.qualitativeExcerpts.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                    {r.themeCompetencyId && (
                      <details className="mt-2 rounded-lg border border-dashed border-slate-300 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-700">
                          Link this theme into my growth graph?
                        </summary>
                        <div className="mt-2 flex gap-2">
                          <ActionForm
                            submitLabel="Yes, link it (creates evidence)"
                            action={async (fd) => {
                              "use server";
                              await linkFeedbackThemeAction({
                                requestId: r.id,
                                subjectId: personId,
                                competencyId: String(fd.get("competencyId")),
                                developmentThemeSummary: String(fd.get("summary")),
                                consent: true,
                              });
                            }}
                          >
                            <input type="hidden" name="competencyId" value={r.themeCompetencyId} />
                            <TextField name="summary" label="Theme summary to store" defaultValue={view.qualitativeExcerpts[0] ?? ""} />
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Request feedback</summary>
          <ActionForm
            className="mt-3"
            submitLabel="Send request"
            action={async (fd) => {
              "use server";
              const raterIds = raterOptions.filter((p) => fd.get(`rater_${p.id}`) === "on").map((p) => p.id);
              await createFeedbackRequestAction({
                subjectId: personId,
                themeCompetencyId: String(fd.get("competencyId")) || undefined,
                message: String(fd.get("message")),
                confidentialityPolicy: fd.get("policy") === "attributed_with_consent" ? "attributed_with_consent" : "anonymous_aggregate",
                aggregationThreshold: Number(fd.get("threshold")) || 3,
                raterIds,
              });
            }}
          >
            <SelectField name="competencyId" label="Theme" options={competencyOptions} />
            <TextAreaField name="message" label="Ask your raters" placeholder="What would you like feedback on?" />
            <SelectField
              name="policy"
              label="Confidentiality policy"
              options={[
                { value: "anonymous_aggregate", label: "Anonymous, aggregated" },
                { value: "attributed_with_consent", label: "Attributed only if rater consents" },
              ]}
            />
            <TextField name="threshold" label="Minimum responses before you can see anything" defaultValue="3" />
            <fieldset className="mb-3">
              <legend className="mb-1 text-sm font-medium text-slate-700">Ask these people</legend>
              <div className="grid grid-cols-2 gap-1 text-sm">
                {raterOptions.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input type="checkbox" name={`rater_${p.id}`} /> {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </details>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Feedback others have asked you to give</h2>
        <ul className="mt-3 space-y-4">
          {pendingToGive.length === 0 && <p className="text-sm text-slate-500">Nothing pending.</p>}
          {pendingToGive.map((inv) => (
            <li key={inv.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{inv.request.message}</p>
                <ConfidentialityBadge policy={inv.request.confidentialityPolicy} threshold={inv.request.aggregationThreshold} />
              </div>
              <ActionForm
                className="mt-3"
                submitLabel="Submit feedback"
                action={async (fd) => {
                  "use server";
                  await submitFeedbackResponseAction({
                    invitationId: inv.id,
                    raterId: personId,
                    qualitativeText: String(fd.get("qualitativeText")),
                    ratingValue: Number(fd.get("ratingValue")) || 3,
                    ratingKey: inv.request.themeCompetencyId ?? "overall",
                    attributionConsent: inv.request.confidentialityPolicy === "attributed_with_consent" ? fd.get("consent") === "on" : undefined,
                    returnPersonId: personId,
                  });
                }}
              >
                <TextAreaField name="qualitativeText" label="Your feedback" />
                <TextField name="ratingValue" label="Rating (1-5)" defaultValue="3" />
                {inv.request.confidentialityPolicy === "attributed_with_consent" && (
                  <label className="mb-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" name="consent" /> I consent to being named alongside this feedback
                  </label>
                )}
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

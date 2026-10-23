"use server";

import { redirect } from "next/navigation";
import { AccessDeniedError, confirmHumanReview, resolveContestation, resolveRequester } from "@/lib/accountability/rights";

const OVERSIGHT_ROLES = ["admin", "auditor", "reviewer"];

export async function confirmHumanReviewAction(formData: FormData) {
  const decisionRecordId = Number(formData.get("decisionRecordId"));
  const asKey = String(formData.get("as") ?? "aud-001");
  const outcome = formData.get("outcome") === "overridden" ? "overridden" : "confirmed";
  const notes = String(formData.get("notes") ?? "");

  const requester = resolveRequester(asKey);
  if (!OVERSIGHT_ROLES.includes(requester.role)) {
    redirect(
      `/accountability/oversight?as=${asKey}&error=${encodeURIComponent(
        `${requester.personKey} (role=${requester.role}) may not confirm a human review. Oversight roles only.`,
      )}`,
    );
  }

  await confirmHumanReview({ decisionRecordId, reviewerId: requester.personKey, outcome, notes });
  redirect(`/accountability/oversight?as=${asKey}&msg=reviewed`);
}

export async function resolveContestationAction(formData: FormData) {
  const contestationId = Number(formData.get("contestationId"));
  const asKey = String(formData.get("as") ?? "aud-001");
  const status = String(formData.get("status")) as "under_review" | "upheld" | "overturned" | "dismissed";
  const notes = String(formData.get("notes") ?? "");

  try {
    const requester = resolveRequester(asKey);
    await resolveContestation({ contestationId, requester, status, resolutionNotes: notes });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      redirect(`/accountability/oversight?as=${asKey}&error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  redirect(`/accountability/oversight?as=${asKey}&msg=resolved`);
}

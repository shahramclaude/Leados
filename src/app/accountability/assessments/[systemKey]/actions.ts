"use server";

import { redirect } from "next/navigation";
import { approveAssessment, onModelUpdated, submitForReview } from "@/lib/accountability/assessments";
import { resolveRequester } from "@/lib/accountability/rights";

const OVERSIGHT_ROLES = ["admin", "auditor", "reviewer"];

export async function submitForReviewAction(formData: FormData) {
  const systemKey = String(formData.get("systemKey"));
  const assessmentId = Number(formData.get("assessmentId"));
  const asKey = String(formData.get("as") ?? "adm-001");

  await submitForReview(assessmentId, asKey);
  redirect(`/accountability/assessments/${systemKey}?as=${asKey}&msg=submitted`);
}

export async function approveAssessmentAction(formData: FormData) {
  const systemKey = String(formData.get("systemKey"));
  const assessmentId = Number(formData.get("assessmentId"));
  const asKey = String(formData.get("as") ?? "adm-001");

  const requester = resolveRequester(asKey);
  if (!OVERSIGHT_ROLES.includes(requester.role)) {
    redirect(
      `/accountability/assessments/${systemKey}?as=${asKey}&error=${encodeURIComponent(
        `${requester.personKey} (role=${requester.role}) may not approve an impact assessment. Oversight roles only (admin/auditor/reviewer).`,
      )}`,
    );
  }

  await approveAssessment(assessmentId, requester.personKey, requester.role);
  redirect(`/accountability/assessments/${systemKey}?as=${asKey}&msg=approved`);
}

export async function triggerModelUpdateAction(formData: FormData) {
  const systemKey = String(formData.get("systemKey"));
  const asKey = String(formData.get("as") ?? "eng-001");
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw.length > 0 ? reasonRaw : "Routine model recalibration";

  await onModelUpdated({ systemKey, actorId: asKey, reason });
  redirect(`/accountability/assessments/${systemKey}?as=${asKey}&msg=reassessed`);
}

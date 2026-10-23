"use server";

import { redirect } from "next/navigation";
import { AccessDeniedError, fileContestation, requestOptOut } from "@/lib/accountability/rights";

export async function fileContestationAction(formData: FormData) {
  const decisionRecordId = Number(formData.get("decisionRecordId"));
  const subjectId = String(formData.get("subjectId"));
  const reason = String(formData.get("reason") ?? "").trim();
  const asKey = String(formData.get("as") ?? subjectId);

  if (reason.length === 0) {
    redirect(`/my-decisions?as=${asKey}&lookup=${subjectId}&error=${encodeURIComponent("A reason is required to file a contestation.")}`);
  }

  try {
    await fileContestation({ decisionRecordId, subjectId, reason });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      redirect(`/my-decisions?as=${asKey}&lookup=${subjectId}&error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  redirect(`/my-decisions?as=${asKey}&lookup=${subjectId}&msg=contested`);
}

export async function requestOptOutAction(formData: FormData) {
  const systemKey = String(formData.get("systemKey"));
  const subjectId = String(formData.get("subjectId"));
  const asKey = String(formData.get("as") ?? subjectId);

  await requestOptOut({ systemKey, subjectId, scope: "all" });
  redirect(`/my-decisions?as=${asKey}&lookup=${subjectId}&msg=optout`);
}

export async function lookupAction(formData: FormData) {
  const asKey = String(formData.get("as") ?? "subj-001");
  const lookup = String(formData.get("lookup") ?? "").trim();
  redirect(`/my-decisions?as=${asKey}${lookup ? `&lookup=${lookup}` : ""}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { createClaimWithEvidence } from "@/lib/reasoning";

export async function createClaimAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  const kind = String(formData.get("kind") ?? "descriptive") as "descriptive" | "causal" | "normative" | "predictive";
  const polarity = String(formData.get("polarity") ?? "supports") as "supports" | "opposes";
  const confidence = Number(formData.get("confidence") ?? 0.5);
  const evidenceSourceRef = String(formData.get("evidenceSourceRef") ?? "").trim();
  const evidenceExtract = String(formData.get("evidenceExtract") ?? "").trim();
  const evidenceReliability = Number(formData.get("evidenceReliability") ?? 0.6);

  if (!text || !scope || !evidenceExtract || !evidenceSourceRef) {
    throw new Error("EVIDENCE_REQUIRED: text, scope, and evidence source + extract are all mandatory");
  }

  await createClaimWithEvidence({
    text,
    scope,
    kind,
    polarity,
    confidence,
    authorId: "operator",
    evidenceKind: "document",
    evidenceSourceRef,
    evidenceReliability,
    evidenceExtract,
  });

  revalidatePath("/reasoning");
}

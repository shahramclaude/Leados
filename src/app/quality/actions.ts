"use server";

import { revalidatePath } from "next/cache";
import { runEvalSuite } from "@/lib/evalFabric";
import { appendAuditEvent } from "@/lib/auditLog";

export async function runSuiteAction(formData: FormData) {
  const suiteId = String(formData.get("suiteId"));
  const result = await runEvalSuite(suiteId);
  await appendAuditEvent({
    actorKind: "system",
    actorId: "eval-fabric",
    action: "run-eval-suite",
    target: suiteId,
    payload: { passRate: result.passRate, totalCount: result.totalCount },
  });
  revalidatePath("/quality");
}

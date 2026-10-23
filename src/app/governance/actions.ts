"use server";

import { revalidatePath } from "next/cache";
import { runActionGate, decideApproval, triggerKillSwitch, expireStaleApprovals } from "@/lib/governance";

export async function simulateActionAction(formData: FormData) {
  const actionKey = String(formData.get("actionKey"));
  const costUsd = Number(formData.get("costUsd") ?? 0);
  await runActionGate({
    actionKey,
    actorId: "demo-agent",
    costUsd,
    blastRadius: 1,
    preview: { note: `Simulated invocation of ${actionKey}`, costUsd },
    voi: 0.3,
  });
  revalidatePath("/governance");
}

export async function decideApprovalAction(formData: FormData) {
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as "approve" | "reject";
  await decideApproval(id, decision, "operator", `${decision} via governance console`);
  revalidatePath("/governance");
}

export async function toggleKillSwitchAction(formData: FormData) {
  const actionKey = String(formData.get("actionKey"));
  const on = String(formData.get("on")) === "true";
  await triggerKillSwitch(actionKey, on, "operator");
  revalidatePath("/governance");
}

export async function expireApprovalsAction() {
  await expireStaleApprovals();
  revalidatePath("/governance");
}

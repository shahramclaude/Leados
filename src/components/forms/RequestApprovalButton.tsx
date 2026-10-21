"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { globalCommandStack } from "@/lib/state/commandStack";
import { enqueueMutation } from "@/lib/platform/integration/mutationQueue";
import { newIdempotencyKey } from "@/lib/api";
import { toastStore } from "@/lib/state/toastStore";
import type { ApprovalDTO } from "@/lib/state/entityStore";

export function RequestApprovalButton({ objectiveId, disabled }: { objectiveId: string; disabled?: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    const id = crypto.randomUUID();
    const idempotencyKey = newIdempotencyKey();

    try {
      await globalCommandStack.run({
        id,
        label: "Request approval",
        do: async () => {
          await enqueueMutation({
            idempotencyKey,
            entityType: "approval",
            entityId: id,
            label: "Request approval",
            method: "POST",
            url: "/api/approvals",
            body: { id, objectiveId },
            applyOptimistic: () =>
              ({
                id,
                objectiveId,
                status: "pending",
                requestedByName: "You",
                decidedByName: null,
                note: "",
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }) satisfies ApprovalDTO,
          });
        },
        undo: async () => {
          await fetch(`/api/approvals/${id}`, { method: "PATCH" }).catch(() => undefined);
        },
        // There is no DELETE /api/approvals/[id] — undo here cannot erase that
        // a request happened (it stays in the audit log). It is only safe to
        // call before a decision is made, so this command is NOT pushed as a
        // true inverse; see PART-03-REPORT.md Phase 5, Q2.
        undoIsApproximate: true,
      });
      toastStore.push("Approval requested.", "success");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || submitting}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:opacity-50"
    >
      {submitting ? "Requesting…" : "Request approval"}
    </button>
  );
}

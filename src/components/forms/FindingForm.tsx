"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateBody, validateTitle } from "./validation";
import { FieldFeedback } from "./FieldError";
import { globalCommandStack } from "@/lib/state/commandStack";
import { enqueueMutation } from "@/lib/platform/integration/mutationQueue";
import { newIdempotencyKey } from "@/lib/api";
import { toastStore } from "@/lib/state/toastStore";
import type { FindingDTO } from "@/lib/state/entityStore";

export function FindingForm({ objectiveId, onAdded }: { objectiveId: string; onAdded?: (f: FindingDTO) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");
  const [touched, setTouched] = useState<{ title?: boolean; body?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);

  const titleValidation = validateTitle(title);
  const bodyValidation = validateBody(body);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ title: true, body: true });
    if (!titleValidation.valid || !bodyValidation.valid) return;

    setSubmitting(true);
    const id = crypto.randomUUID();
    const idempotencyKey = newIdempotencyKey();
    const payload = { id, title: title.trim(), body: body.trim(), confidence };

    try {
      await globalCommandStack.run({
        id,
        label: `Add finding "${payload.title}"`,
        do: async () => {
          await enqueueMutation({
            idempotencyKey,
            entityType: "finding",
            entityId: id,
            label: `Add finding "${payload.title}"`,
            method: "POST",
            url: `/api/objectives/${objectiveId}/findings`,
            body: payload,
            applyOptimistic: () =>
              ({
                id,
                objectiveId,
                title: payload.title,
                body: payload.body,
                confidence,
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }) satisfies FindingDTO,
          });
        },
        undo: async () => {
          await fetch(`/api/findings/${id}`, { method: "DELETE" });
        },
      });
      toastStore.push(`Finding "${payload.title}" added. Press ⌘Z to undo.`, "success");
      onAdded?.({
        id,
        objectiveId,
        title: payload.title,
        body: payload.body,
        confidence,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setTitle("");
      setBody("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" noValidate>
      <div>
        <label htmlFor="finding-title" className="text-sm font-medium text-slate-800">
          Finding title
        </label>
        <input
          id="finding-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          aria-invalid={touched.title && !titleValidation.valid}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          placeholder="Onboarding drop-off at step 3"
        />
        <FieldFeedback validation={titleValidation} touched={!!touched.title} />
      </div>

      <div>
        <label htmlFor="finding-body" className="text-sm font-medium text-slate-800">
          Details
        </label>
        <textarea
          id="finding-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, body: true }))}
          aria-invalid={touched.body && !bodyValidation.valid}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        />
        <FieldFeedback validation={bodyValidation} touched={!!touched.body} />
      </div>

      <div>
        <label htmlFor="finding-confidence" className="text-sm font-medium text-slate-800">
          Confidence
        </label>
        <select
          id="finding-confidence"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value as "low" | "medium" | "high")}
          className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add finding"}
      </button>
    </form>
  );
}

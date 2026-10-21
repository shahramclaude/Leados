"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateSelect, validateTitle } from "./validation";
import { FieldFeedback } from "./FieldError";
import { globalCommandStack } from "@/lib/state/commandStack";
import { enqueueMutation } from "@/lib/platform/integration/mutationQueue";
import { newIdempotencyKey } from "@/lib/api";
import { invalidateQuery } from "@/lib/platform/integration/queryManager";
import { toastStore } from "@/lib/state/toastStore";
import type { ObjectiveDTO } from "@/lib/state/entityStore";

export function ObjectiveForm({
  scenarios,
  onCreated,
  onCancel,
}: {
  scenarios: { id: string; name: string }[];
  onCreated?: (objective: ObjectiveDTO) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [touched, setTouched] = useState<{ title?: boolean; scenarioId?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);

  const titleValidation = validateTitle(title);
  const scenarioValidation = validateSelect(scenarioId, "Scenario");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ title: true, scenarioId: true });
    if (!titleValidation.valid || !scenarioValidation.valid) return;

    setSubmitting(true);
    const id = crypto.randomUUID();
    const idempotencyKey = newIdempotencyKey();
    const payload = { id, title: title.trim(), description: description.trim(), scenarioId };

    try {
      await globalCommandStack.run({
        id,
        label: `Create objective "${payload.title}"`,
        do: async () => {
          await enqueueMutation({
            idempotencyKey,
            entityType: "objective",
            entityId: id,
            label: `Create objective "${payload.title}"`,
            method: "POST",
            url: "/api/objectives",
            body: payload,
            applyOptimistic: () =>
              ({
                id,
                scenarioId,
                title: payload.title,
                description: payload.description,
                status: "draft",
                ownerName: "You",
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }) satisfies ObjectiveDTO,
          });
        },
        undo: async () => {
          await fetch(`/api/objectives/${id}`, { method: "DELETE" });
          invalidateQuery("objectives");
        },
      });
      invalidateQuery("objectives");
      toastStore.push(`Objective "${payload.title}" created. Press ⌘Z to undo.`, "success");
      onCreated?.({
        id,
        scenarioId,
        title: payload.title,
        description: payload.description,
        status: "draft",
        ownerName: "You",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setTitle("");
      setDescription("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" noValidate>
      <div>
        <label htmlFor="objective-title" className="text-sm font-medium text-slate-800">
          Title
        </label>
        <input
          id="objective-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          aria-invalid={touched.title && !titleValidation.valid}
          aria-describedby="objective-title-feedback"
          autoFocus
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          placeholder="Grow activation rate by 15%"
        />
        <div id="objective-title-feedback">
          <FieldFeedback validation={titleValidation} touched={!!touched.title} />
        </div>
      </div>

      <div>
        <label htmlFor="objective-scenario" className="text-sm font-medium text-slate-800">
          Scenario
        </label>
        <select
          id="objective-scenario"
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, scenarioId: true }))}
          aria-invalid={touched.scenarioId && !scenarioValidation.valid}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          {scenarios.length === 0 && <option value="">No scenarios yet</option>}
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <FieldFeedback validation={scenarioValidation} touched={!!touched.scenarioId} />
      </div>

      <div>
        <label htmlFor="objective-description" className="text-sm font-medium text-slate-800">
          Description <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="objective-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || scenarios.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create objective"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

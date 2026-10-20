"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MemoryForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    situation: "",
    decision: "",
    outcome: "",
    lesson: "",
    playbookUpdate: "",
    tags: "",
    outcomeValence: "neutral",
    occurredAt: new Date().toISOString().slice(0, 10),
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      setForm((f) => ({ ...f, title: "", situation: "", decision: "", outcome: "", lesson: "", playbookUpdate: "" }));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        required
        placeholder="Title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <textarea
          required
          placeholder="Situation"
          value={form.situation}
          onChange={(e) => setForm({ ...form, situation: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Decision"
          value={form.decision}
          onChange={(e) => setForm({ ...form, decision: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Outcome"
          value={form.outcome}
          onChange={(e) => setForm({ ...form, outcome: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Lesson"
          value={form.lesson}
          onChange={(e) => setForm({ ...form, lesson: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <input
        placeholder="Playbook update (optional)"
        value={form.playbookUpdate}
        onChange={(e) => setForm({ ...form, playbookUpdate: e.target.value })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="tags, comma, separated"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={form.outcomeValence}
          onChange={(e) => setForm({ ...form, outcomeValence: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="positive">positive</option>
          <option value="neutral">neutral</option>
          <option value="negative">negative</option>
        </select>
        <input
          type="date"
          value={form.occurredAt}
          onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button type="submit" disabled={submitting} className="self-start rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {submitting ? "Saving…" : "Record retrospective"}
      </button>
    </form>
  );
}

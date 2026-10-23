"use client";

import { useState, useTransition } from "react";

type Entry = {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  source: string;
  confidenceLabel: string;
  createdAt: string;
  updatedAt: string;
};

const LABEL_STYLES: Record<string, string> = {
  measured: "bg-emerald-100 text-emerald-700",
  estimated: "bg-amber-100 text-amber-700",
  association: "bg-sky-100 text-sky-700",
  effect: "bg-violet-100 text-violet-700",
};

const emptyForm = {
  title: "",
  category: "playbook",
  content: "",
  tags: "",
  confidenceLabel: "measured" as keyof typeof LABEL_STYLES,
};

export function KnowledgeBoard({ initialEntries }: { initialEntries: Entry[] }) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          content: form.content,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          confidenceLabel: form.confidenceLabel,
        }),
      });
      if (res.ok) {
        const refreshed = await fetch("/api/knowledge");
        const data = await refreshed.json();
        setEntries(data.entries ?? []);
        setForm(emptyForm);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No knowledge entries yet — add the first one.
          </p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{entry.category}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    LABEL_STYLES[entry.confidenceLabel] ?? LABEL_STYLES.measured
                  }`}
                >
                  {entry.confidenceLabel}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{entry.content}</p>
              {entry.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Add knowledge entry</h2>
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="playbook">Playbook</option>
          <option value="finding">Finding</option>
          <option value="policy">Policy</option>
          <option value="general">General</option>
        </select>
        <textarea
          required
          placeholder="Content"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          placeholder="Tags (comma separated)"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={form.confidenceLabel}
          onChange={(e) =>
            setForm({ ...form, confidenceLabel: e.target.value as typeof form.confidenceLabel })
          }
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="measured">Measured</option>
          <option value="estimated">Estimated</option>
          <option value="association">Association</option>
          <option value="effect">Effect</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-950 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save entry"}
        </button>
      </form>
    </div>
  );
}

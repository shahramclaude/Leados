"use client";

import { useEffect, useState, type FormEvent } from "react";

interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  createdAt: string;
}

const CATEGORIES = ["measured", "estimated", "association", "effect"];

const CATEGORY_COLORS: Record<string, string> = {
  measured: "bg-emerald-100 text-emerald-800",
  estimated: "bg-amber-100 text-amber-800",
  association: "bg-sky-100 text-sky-800",
  effect: "bg-violet-100 text-violet-800",
};

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", body: "", category: "measured", tags: "" });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/knowledge");
    const data = await res.json();
    setEntries(data.entries ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        body: form.body,
        category: form.category,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    setForm({ title: "", body: "", category: "measured", tags: "" });
    setSubmitting(false);
    load();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Knowledge substrate</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Institutional knowledge, each entry labeled by how certain it is — measured, estimated,
        association, or effect.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Title</span>
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Body</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Tags (comma-separated)</span>
            <input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Add entry"}
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading entries…</p>}
        {!loading && entries.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            No knowledge entries yet.
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-950">{entry.title}</p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${CATEGORY_COLORS[entry.category] ?? "bg-slate-100 text-slate-700"}`}
              >
                {entry.category}
              </span>
            </div>
            {entry.body && <p className="mt-2 text-sm text-slate-700">{entry.body}</p>}
            {entry.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

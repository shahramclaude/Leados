"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, SecondaryButton, Textarea } from "@/components/ui";

type BoardPack = {
  id: number;
  title: string;
  period: string;
  status: string;
  summary: string;
  createdAt: string;
  publishedAt: string | null;
};

export default function BoardPacksPage() {
  const [packs, setPacks] = useState<BoardPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", period: "", summary: "" });

  async function load() {
    const res = await fetch("/api/board-packs");
    setPacks(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createPack(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.period.trim()) return;
    setSubmitting(true);
    await fetch("/api/board-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", period: "", summary: "" });
    await load();
    setSubmitting(false);
  }

  async function advance(id: number) {
    await fetch(`/api/board-packs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advance: true }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 55 — Board & governance automation"
        title="Board Packs"
        description="One canonical board-pack workflow: draft → in review → approved → published."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : packs.length === 0 ? (
            <EmptyState message="No board packs yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {packs.map((p) => (
                <Card key={p.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-100">{p.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{p.period}</p>
                      {p.summary ? <p className="mt-2 text-sm text-slate-400">{p.summary}</p> : null}
                    </div>
                    <Badge value={p.status} />
                  </div>
                  {p.status !== "published" ? (
                    <div className="mt-3">
                      <SecondaryButton onClick={() => advance(p.id)}>Advance workflow</SecondaryButton>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-600">
                      Published {p.publishedAt ? new Date(p.publishedAt).toLocaleString() : ""}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">New board pack</h2>
          <form className="flex flex-col gap-3" onSubmit={createPack}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Period">
              <Input
                placeholder="Q1 2026"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
                required
              />
            </Field>
            <Field label="Summary">
              <Textarea rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create board pack"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

type Decision = {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  owner: string;
  impact: string;
  confidence: number;
  createdAt: string;
};

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "strategic",
    owner: "",
    impact: "medium",
    confidence: 60,
  });

  async function load() {
    const res = await fetch("/api/decisions");
    setDecisions(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", description: "", category: "strategic", owner: "", impact: "medium", confidence: 60 });
    await load();
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 01 · 23 — Decision governance"
        title="Decisions"
        description="Event-sourced decision log. Every status change and commit is recorded as an immutable event."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : decisions.length === 0 ? (
            <EmptyState message="No decisions yet. Propose the first one." />
          ) : (
            <div className="flex flex-col gap-3">
              {decisions.map((d) => (
                <Link key={d.id} href={`/decisions/${d.id}`}>
                  <Card className="transition hover:border-cyan-600">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-100">{d.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {d.owner || "Unassigned"} · {d.category} · confidence {d.confidence}%
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Badge value={d.status} />
                        <Badge value={d.impact} />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Propose a decision</h2>
          <form className="flex flex-col gap-3" onSubmit={createDecision}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="strategic">Strategic</option>
                  <option value="financial">Financial</option>
                  <option value="operational">Operational</option>
                  <option value="people">People</option>
                </Select>
              </Field>
              <Field label="Impact">
                <Select value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
            </div>
            <Field label={`Confidence (${form.confidence}%)`}>
              <input
                type="range"
                min={0}
                max={100}
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })}
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Proposing…" : "Propose decision"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

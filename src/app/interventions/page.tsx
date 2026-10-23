"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SecondaryButton, Textarea } from "@/components/ui";

type Intervention = {
  id: number;
  title: string;
  category: string;
  description: string;
  status: string;
  impactScore: number;
  effortScore: number;
};

const STATUS_FLOW: Record<string, string> = {
  proposed: "piloting",
  piloting: "scaling",
  scaling: "adopted",
  adopted: "retired",
  retired: "proposed",
};

export default function InterventionsPage() {
  const [items, setItems] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "leadership",
    description: "",
    impactScore: 60,
    effortScore: 40,
  });

  async function load() {
    const res = await fetch("/api/interventions");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    await fetch("/api/interventions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", category: "leadership", description: "", impactScore: 60, effortScore: 40 });
    await load();
    setSubmitting(false);
  }

  async function advance(item: Intervention) {
    await fetch(`/api/interventions/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: STATUS_FLOW[item.status] ?? "proposed" }),
    });
    await load();
  }

  const sorted = [...items].sort((a, b) => b.impactScore - b.effortScore - (a.impactScore - a.effortScore));

  return (
    <div>
      <PageHeader
        eyebrow="Part 51 — Management action recommender"
        title="Interventions"
        description="Intervention marketplace ranked by impact vs effort. Highest leverage ideas float to the top."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : sorted.length === 0 ? (
            <EmptyState message="No interventions proposed yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {sorted.map((i) => (
                <Card key={i.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-100">{i.title}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">{i.category}</p>
                      {i.description ? <p className="mt-2 text-sm text-slate-400">{i.description}</p> : null}
                      <p className="mt-2 text-xs text-slate-600">
                        impact {i.impactScore} · effort {i.effortScore} · leverage {i.impactScore - i.effortScore}
                      </p>
                    </div>
                    <Badge value={i.status} />
                  </div>
                  <div className="mt-3">
                    <SecondaryButton onClick={() => advance(i)}>Advance → {STATUS_FLOW[i.status]}</SecondaryButton>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Propose an intervention</h2>
          <form className="flex flex-col gap-3" onSubmit={createItem}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="leadership">Leadership</option>
                <option value="process">Process</option>
                <option value="culture">Culture</option>
                <option value="technology">Technology</option>
                <option value="structure">Structure</option>
              </Select>
            </Field>
            <Field label={`Impact score (${form.impactScore})`}>
              <input
                type="range"
                min={0}
                max={100}
                value={form.impactScore}
                onChange={(e) => setForm({ ...form, impactScore: Number(e.target.value) })}
              />
            </Field>
            <Field label={`Effort score (${form.effortScore})`}>
              <input
                type="range"
                min={0}
                max={100}
                value={form.effortScore}
                onChange={(e) => setForm({ ...form, effortScore: Number(e.target.value) })}
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Proposing…" : "Propose intervention"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SecondaryButton, Textarea } from "@/components/ui";

type FitnessMetric = {
  id: number;
  dimension: string;
  score: number;
  trend: string;
  notes: string;
  measuredAt: string;
};

export default function FitnessPage() {
  const [metrics, setMetrics] = useState<FitnessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ dimension: "agility", score: 65, trend: "stable", notes: "" });

  async function load() {
    const res = await fetch("/api/fitness");
    setMetrics(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createMetric(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/fitness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ dimension: "agility", score: 65, trend: "stable", notes: "" });
    await load();
    setSubmitting(false);
  }

  async function remove(id: number) {
    await fetch(`/api/fitness/${id}`, { method: "DELETE" });
    await load();
  }

  const byDimension = Object.values(
    metrics.reduce<Record<string, FitnessMetric>>((acc, m) => {
      if (!acc[m.dimension] || new Date(m.measuredAt) > new Date(acc[m.dimension].measuredAt)) {
        acc[m.dimension] = m;
      }
      return acc;
    }, {})
  );

  return (
    <div>
      <PageHeader
        eyebrow="Part 39 · 57 — Organizational fitness & self-evolving capstone"
        title="Org Fitness"
        description="Tracks agility, alignment, resilience, talent, innovation and execution over time."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {byDimension.map((m) => (
          <Card key={m.dimension} className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500 capitalize">{m.dimension}</p>
            <p className="mt-1 text-2xl font-semibold text-white">{m.score}</p>
            <div className="mt-1 flex justify-center"><Badge value={m.trend} /></div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : metrics.length === 0 ? (
            <EmptyState message="No fitness measurements yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {metrics.map((m) => (
                <Card key={m.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium capitalize text-slate-100">{m.dimension}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(m.measuredAt).toLocaleString()}</p>
                      {m.notes ? <p className="mt-2 text-sm text-slate-400">{m.notes}</p> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xl font-semibold text-white">{m.score}</p>
                      <Badge value={m.trend} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <SecondaryButton onClick={() => remove(m.id)}>Remove</SecondaryButton>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Record a measurement</h2>
          <form className="flex flex-col gap-3" onSubmit={createMetric}>
            <Field label="Dimension">
              <Select value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
                <option value="agility">Agility</option>
                <option value="alignment">Alignment</option>
                <option value="resilience">Resilience</option>
                <option value="talent">Talent</option>
                <option value="innovation">Innovation</option>
                <option value="execution">Execution</option>
              </Select>
            </Field>
            <Field label={`Score (${form.score})`}>
              <input
                type="range"
                min={0}
                max={100}
                value={form.score}
                onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
              />
            </Field>
            <Field label="Trend">
              <Select value={form.trend} onChange={(e) => setForm({ ...form, trend: e.target.value })}>
                <option value="improving">Improving</option>
                <option value="stable">Stable</option>
                <option value="declining">Declining</option>
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Record measurement"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

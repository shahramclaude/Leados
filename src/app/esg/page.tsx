"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SecondaryButton } from "@/components/ui";

type EsgMetric = {
  id: number;
  pillar: string;
  metric: string;
  value: string;
  unit: string;
  target: string;
  period: string;
};

export default function EsgPage() {
  const [metrics, setMetrics] = useState<EsgMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ pillar: "environmental", metric: "", value: "", unit: "", target: "", period: "" });

  async function load() {
    const res = await fetch("/api/esg");
    setMetrics(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createMetric(e: React.FormEvent) {
    e.preventDefault();
    if (!form.metric.trim()) return;
    setSubmitting(true);
    await fetch("/api/esg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ pillar: "environmental", metric: "", value: "", unit: "", target: "", period: "" });
    await load();
    setSubmitting(false);
  }

  async function remove(id: number) {
    await fetch(`/api/esg/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 36 — Sustainability & ESG intelligence"
        title="ESG Metrics"
        description="Environmental, social and governance KPIs tracked against targets per reporting period."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : metrics.length === 0 ? (
            <EmptyState message="No ESG metrics tracked yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {metrics.map((m) => (
                <Card key={m.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-100">{m.metric}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {m.period} · {m.value}
                        {m.unit} {m.target ? `(target ${m.target}${m.unit})` : ""}
                      </p>
                    </div>
                    <Badge value={m.pillar} />
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
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Add a metric</h2>
          <form className="flex flex-col gap-3" onSubmit={createMetric}>
            <Field label="Pillar">
              <Select value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value })}>
                <option value="environmental">Environmental</option>
                <option value="social">Social</option>
                <option value="governance">Governance</option>
              </Select>
            </Field>
            <Field label="Metric name">
              <Input value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Value">
                <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </Field>
              <Field label="Unit">
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target">
                <Input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
              </Field>
              <Field label="Period">
                <Input placeholder="FY2026" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
              </Field>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add metric"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

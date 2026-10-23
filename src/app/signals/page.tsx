"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SecondaryButton, Textarea } from "@/components/ui";

type Signal = {
  id: number;
  title: string;
  source: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  detectedAt: string;
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    source: "internal",
    category: "market",
    severity: "medium",
    description: "",
  });

  async function load() {
    const res = await fetch("/api/signals");
    setSignals(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createSignal(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", source: "internal", category: "market", severity: "medium", description: "" });
    await load();
    setSubmitting(false);
  }

  async function setStatus(id: number, status: string) {
    await fetch(`/api/signals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 13 — Sensing & early warning"
        title="Signals"
        description="Early-warning feed across market, operational, financial, and people domains."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : signals.length === 0 ? (
            <EmptyState message="No signals detected yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {signals.map((s) => (
                <Card key={s.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-100">{s.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.source} · {s.category} · {new Date(s.detectedAt).toLocaleDateString()}
                      </p>
                      {s.description ? <p className="mt-2 text-sm text-slate-400">{s.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge value={s.severity} />
                      <Badge value={s.status} />
                    </div>
                  </div>
                  {s.status === "open" || s.status === "triaged" ? (
                    <div className="mt-3 flex gap-2">
                      {s.status === "open" ? (
                        <SecondaryButton onClick={() => setStatus(s.id, "triaged")}>Triage</SecondaryButton>
                      ) : null}
                      <SecondaryButton onClick={() => setStatus(s.id, "resolved")}>Resolve</SecondaryButton>
                      <SecondaryButton onClick={() => setStatus(s.id, "dismissed")}>Dismiss</SecondaryButton>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Log a signal</h2>
          <form className="flex flex-col gap-3" onSubmit={createSignal}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Source">
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="market">Market</option>
                  <option value="operational">Operational</option>
                  <option value="financial">Financial</option>
                  <option value="people">People</option>
                  <option value="risk">Risk</option>
                </Select>
              </Field>
              <Field label="Severity">
                <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Logging…" : "Log signal"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

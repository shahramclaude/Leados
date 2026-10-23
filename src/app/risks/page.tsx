"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SecondaryButton, Textarea } from "@/components/ui";

type Risk = {
  id: number;
  title: string;
  category: string;
  likelihood: string;
  impactLevel: string;
  owner: string;
  status: string;
  mitigation: string;
  reviewDate: string | null;
};

const STATUS_FLOW: Record<string, string> = {
  open: "mitigating",
  mitigating: "monitoring",
  monitoring: "closed",
  closed: "open",
};

export default function RisksPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "operational",
    likelihood: "medium",
    impactLevel: "medium",
    owner: "",
    mitigation: "",
  });

  async function load() {
    const res = await fetch("/api/risks");
    setRisks(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createRisk(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    await fetch("/api/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", category: "operational", likelihood: "medium", impactLevel: "medium", owner: "", mitigation: "" });
    await load();
    setSubmitting(false);
  }

  async function advance(risk: Risk) {
    const next = STATUS_FLOW[risk.status] ?? "open";
    await fetch(`/api/risks/${risk.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 29 — GRC operating system"
        title="Risk Register"
        description="Governance, risk & compliance register with likelihood × impact scoring and mitigation tracking."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : risks.length === 0 ? (
            <EmptyState message="Risk register is empty. Add the first risk." />
          ) : (
            <div className="flex flex-col gap-3">
              {risks.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-100">{r.title}</p>
                      <p className="mt-1 text-xs text-slate-500 capitalize">
                        {r.category} · owner {r.owner}
                      </p>
                      {r.mitigation ? (
                        <p className="mt-2 text-sm text-slate-400">Mitigation: {r.mitigation}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge value={r.impactLevel} />
                      <Badge value={r.likelihood} />
                      <Badge value={r.status} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <SecondaryButton onClick={() => advance(r)}>
                      Advance → {STATUS_FLOW[r.status]}
                    </SecondaryButton>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Add a risk</h2>
          <form className="flex flex-col gap-3" onSubmit={createRisk}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Owner">
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </Field>
            <Field label="Mitigation plan">
              <Textarea rows={3} value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="strategic">Strategic</option>
                <option value="operational">Operational</option>
                <option value="financial">Financial</option>
                <option value="compliance">Compliance</option>
                <option value="cyber">Cyber</option>
                <option value="reputational">Reputational</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Likelihood">
                <Select value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </Field>
              <Field label="Impact">
                <Select value={form.impactLevel} onChange={(e) => setForm({ ...form, impactLevel: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add risk"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

type Agent = {
  id: number;
  name: string;
  kernelType: string;
  description: string;
  status: string;
  autonomyLevel: string;
  lastRunAt: string | null;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    kernelType: "sensing",
    description: "",
    autonomyLevel: "supervised",
  });

  async function load() {
    const res = await fetch("/api/agents");
    setAgents(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", kernelType: "sensing", description: "", autonomyLevel: "supervised" });
    await load();
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 58 · 10 · 40 — Autonomous agent kernel"
        title="Agent Kernel"
        description="One canonical agent spine. Extend kernel types here rather than creating parallel agent systems."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : agents.length === 0 ? (
            <EmptyState message="No agents registered yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {agents.map((a) => (
                <Link key={a.id} href={`/agents/${a.id}`}>
                  <Card className="transition hover:border-cyan-600">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-100">{a.name}</p>
                        <p className="mt-1 text-xs capitalize text-slate-500">
                          {a.kernelType} kernel · {a.autonomyLevel.replace(/_/g, " ")}
                        </p>
                        {a.description ? <p className="mt-2 text-sm text-slate-400">{a.description}</p> : null}
                        <p className="mt-2 text-xs text-slate-600">
                          Last run: {a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : "never"}
                        </p>
                      </div>
                      <Badge value={a.status} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Register an agent</h2>
          <form className="flex flex-col gap-3" onSubmit={createAgent}>
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Kernel type">
              <Select value={form.kernelType} onChange={(e) => setForm({ ...form, kernelType: e.target.value })}>
                <option value="sensing">Sensing</option>
                <option value="decision">Decision</option>
                <option value="execution">Execution</option>
                <option value="governance">Governance</option>
                <option value="learning">Learning</option>
              </Select>
            </Field>
            <Field label="Autonomy level">
              <Select value={form.autonomyLevel} onChange={(e) => setForm({ ...form, autonomyLevel: e.target.value })}>
                <option value="supervised">Supervised</option>
                <option value="semi_autonomous">Semi-autonomous</option>
                <option value="autonomous">Autonomous</option>
              </Select>
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Registering…" : "Register agent"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

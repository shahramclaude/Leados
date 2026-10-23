"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SecondaryButton } from "@/components/ui";

type CadenceItem = {
  id: number;
  title: string;
  type: string;
  cadence: string;
  owner: string;
  nextOccurrence: string | null;
  status: string;
};

export default function CadencePage() {
  const [items, setItems] = useState<CadenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "meeting",
    cadence: "weekly",
    owner: "",
    nextOccurrence: "",
  });

  async function load() {
    const res = await fetch("/api/cadence");
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
    await fetch("/api/cadence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", type: "meeting", cadence: "weekly", owner: "", nextOccurrence: "" });
    await load();
    setSubmitting(false);
  }

  async function advance(id: number) {
    await fetch(`/api/cadence/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advance: true }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 25 — Operating cadence & rituals"
        title="Cadence"
        description="Recurring meetings, rituals and reviews with automated next-occurrence scheduling."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState message="No cadence items yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((c) => (
                <Card key={c.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-100">{c.title}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {c.type} · {c.cadence} · owner {c.owner}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        Next: {c.nextOccurrence ? new Date(c.nextOccurrence).toLocaleDateString() : "unscheduled"}
                      </p>
                    </div>
                    <Badge value={c.status} />
                  </div>
                  <div className="mt-3">
                    <SecondaryButton onClick={() => advance(c.id)}>Mark occurred → advance</SecondaryButton>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Add a cadence item</h2>
          <form className="flex flex-col gap-3" onSubmit={createItem}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Owner">
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="meeting">Meeting</option>
                  <option value="ritual">Ritual</option>
                  <option value="review">Review</option>
                  <option value="report">Report</option>
                </Select>
              </Field>
              <Field label="Cadence">
                <Select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </Select>
              </Field>
            </div>
            <Field label="Next occurrence">
              <Input
                type="date"
                value={form.nextOccurrence}
                onChange={(e) => setForm({ ...form, nextOccurrence: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add cadence item"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

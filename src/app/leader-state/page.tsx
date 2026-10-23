"use client";

import { useEffect, useState } from "react";
import { Button, Card, EmptyState, Field, Input, PageHeader, SecondaryButton, Textarea } from "@/components/ui";

type LeaderState = {
  id: number;
  leaderName: string;
  role: string;
  decisionLoad: number;
  stressIndex: number;
  focusScore: number;
  recordedAt: string;
  notes: string;
};

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function LeaderStatePage() {
  const [entries, setEntries] = useState<LeaderState[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leaderName: "",
    role: "",
    decisionLoad: 50,
    stressIndex: 50,
    focusScore: 50,
    notes: "",
  });

  async function load() {
    const res = await fetch("/api/leader-state");
    setEntries(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.leaderName.trim()) return;
    setSubmitting(true);
    await fetch("/api/leader-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ leaderName: "", role: "", decisionLoad: 50, stressIndex: 50, focusScore: 50, notes: "" });
    await load();
    setSubmitting(false);
  }

  async function remove(id: number) {
    await fetch(`/api/leader-state/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Part 52 — Leader state & decision-load science"
        title="Leader State"
        description="Tracks decision load, stress index and focus score over time to protect executive bandwidth."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : entries.length === 0 ? (
            <EmptyState message="No leader-state entries recorded yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((e) => (
                <Card key={e.id}>
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-100">{e.leaderName}</p>
                      <p className="text-xs text-slate-500">{e.role || "—"} · {new Date(e.recordedAt).toLocaleString()}</p>
                    </div>
                    <SecondaryButton onClick={() => remove(e.id)}>Remove</SecondaryButton>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Bar label="Decision load" value={e.decisionLoad} color="bg-cyan-500" />
                    <Bar label="Stress index" value={e.stressIndex} color="bg-rose-500" />
                    <Bar label="Focus score" value={e.focusScore} color="bg-emerald-500" />
                  </div>
                  {e.notes ? <p className="mt-3 text-sm text-slate-400">{e.notes}</p> : null}
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Record state</h2>
          <form className="flex flex-col gap-3" onSubmit={createEntry}>
            <Field label="Leader name">
              <Input value={form.leaderName} onChange={(e) => setForm({ ...form, leaderName: e.target.value })} required />
            </Field>
            <Field label="Role">
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </Field>
            <Field label={`Decision load (${form.decisionLoad})`}>
              <input type="range" min={0} max={100} value={form.decisionLoad} onChange={(e) => setForm({ ...form, decisionLoad: Number(e.target.value) })} />
            </Field>
            <Field label={`Stress index (${form.stressIndex})`}>
              <input type="range" min={0} max={100} value={form.stressIndex} onChange={(e) => setForm({ ...form, stressIndex: Number(e.target.value) })} />
            </Field>
            <Field label={`Focus score (${form.focusScore})`}>
              <input type="range" min={0} max={100} value={form.focusScore} onChange={(e) => setForm({ ...form, focusScore: Number(e.target.value) })} />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Record state"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

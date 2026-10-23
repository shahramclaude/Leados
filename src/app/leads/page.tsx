"use client";

import { useEffect, useState, type FormEvent } from "react";

interface ScoreCriterion {
  criterion: string;
  weight: number;
  normalizedValue: number;
  contribution: number;
  rationale: string;
}

interface Lead {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  budget: string;
  dealValue: string;
  companySize: number;
  engagementScore: number;
  titleSeniority: string;
  icpFit: number;
  responseHistory: number;
  stage: string;
  score: number;
  scoreBreakdown: ScoreCriterion[];
}

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];
const SENIORITIES = ["c_suite", "vp", "director", "manager", "individual_contributor"];

const emptyForm = {
  name: "",
  company: "",
  title: "",
  email: "",
  budget: "",
  dealValue: "",
  companySize: "",
  engagementScore: "",
  titleSeniority: "individual_contributor",
  icpFit: "",
  responseHistory: "",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        budget: Number(form.budget) || 0,
        dealValue: Number(form.dealValue) || 0,
        companySize: Number(form.companySize) || 0,
        engagementScore: Number(form.engagementScore) || 0,
        icpFit: Number(form.icpFit) || 0,
        responseHistory: Number(form.responseHistory) || 0,
      }),
    });
    setForm(emptyForm);
    setSubmitting(false);
    load();
  }

  async function handleStageChange(id: string, stage: string) {
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    load();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Leads</h1>
      <p className="mt-2 text-sm text-slate-600">
        Every lead is scored deterministically on creation. Click a row to see the weighted criteria
        behind its score.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3"
      >
        <Field label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
        <Field
          label="Company"
          value={form.company}
          onChange={(v) => setForm((f) => ({ ...f, company: v }))}
          required
        />
        <Field label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
        <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        <Field
          label="Budget ($)"
          value={form.budget}
          onChange={(v) => setForm((f) => ({ ...f, budget: v }))}
          type="number"
        />
        <Field
          label="Deal value ($)"
          value={form.dealValue}
          onChange={(v) => setForm((f) => ({ ...f, dealValue: v }))}
          type="number"
        />
        <Field
          label="Company size"
          value={form.companySize}
          onChange={(v) => setForm((f) => ({ ...f, companySize: v }))}
          type="number"
        />
        <Field
          label="Engagement (0-100)"
          value={form.engagementScore}
          onChange={(v) => setForm((f) => ({ ...f, engagementScore: v }))}
          type="number"
        />
        <Field
          label="ICP fit (0-100)"
          value={form.icpFit}
          onChange={(v) => setForm((f) => ({ ...f, icpFit: v }))}
          type="number"
        />
        <Field
          label="Response history (0-100)"
          value={form.responseHistory}
          onChange={(v) => setForm((f) => ({ ...f, responseHistory: v }))}
          type="number"
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Title seniority</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.titleSeniority}
            onChange={(e) => setForm((f) => ({ ...f, titleSeniority: e.target.value }))}
          >
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Scoring…" : "Add & score lead"}
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading leads…</p>}
        {!loading && leads.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            No leads yet — add one above.
          </p>
        )}
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
              className="flex w-full items-center justify-between px-6 py-4 text-left"
            >
              <div>
                <p className="font-semibold text-slate-950">
                  {lead.name} <span className="font-normal text-slate-500">· {lead.company}</span>
                </p>
                <p className="text-sm text-slate-600">{lead.title || "No title"}</p>
              </div>
              <div className="flex items-center gap-4">
                <select
                  value={lead.stage}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleStageChange(lead.id, e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm capitalize"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                  {lead.score}
                </span>
              </div>
            </button>
            {expanded === lead.id && (
              <div className="border-t border-slate-100 px-6 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Score breakdown
                </p>
                <div className="space-y-2">
                  {lead.scoreBreakdown.map((c) => (
                    <div key={c.criterion} className="rounded-lg bg-slate-50 px-4 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-900">
                          {c.criterion} <span className="text-slate-500">(weight {Math.round(c.weight * 100)}%)</span>
                        </span>
                        <span className="font-semibold text-slate-900">+{c.contribution}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{c.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

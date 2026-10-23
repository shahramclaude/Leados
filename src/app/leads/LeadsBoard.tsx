"use client";

import { useState, useTransition } from "react";
import { ScoreBadge } from "@/components/ScoreBadge";

type ScoreContribution = {
  criterion: string;
  weight: number;
  rawValue: number | string | boolean | null;
  normalizedValue: number;
  contribution: number;
  rationale: string;
};

type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  source: string;
  stage: string;
  attributes: Record<string, unknown>;
  score: number;
  scoreBreakdown: ScoreContribution[];
  createdAt: string;
  updatedAt: string;
};

const STAGES = ["new", "qualified", "engaged", "won", "lost"];

function labelForScore(score: number) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

const emptyForm = {
  name: "",
  company: "",
  email: "",
  source: "manual",
  budget: "20000",
  employees: "150",
  engagement: "50",
  titleSeniority: "manager",
  icpFit: "50",
  responded: false,
};

export function LeadsBoard({ initialLeads }: { initialLeads: Lead[] }) {
  const [leadsState, setLeadsState] = useState<Lead[]>(initialLeads);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeadsState(data.leads ?? []);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          email: form.email,
          source: form.source,
          attributes: {
            budget: Number(form.budget) || 0,
            employees: Number(form.employees) || 0,
            engagement: Number(form.engagement) || 0,
            titleSeniority: form.titleSeniority,
            icpFit: Number(form.icpFit) || 0,
            responded: form.responded,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create lead");
        return;
      }
      setForm(emptyForm);
      await refresh();
    });
  }

  function handleStageChange(id: string, stage: string) {
    startTransition(async () => {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      await refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {leadsState.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No leads yet — add the first one with the form on the right.
          </p>
        ) : (
          leadsState.map((lead) => (
            <div key={lead.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{lead.name}</p>
                  <p className="text-xs text-slate-500">
                    {lead.company} · {lead.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={lead.stage}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleStageChange(lead.id, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                  >
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                  <ScoreBadge score={lead.score} label={labelForScore(lead.score)} />
                </div>
              </button>
              {expanded === lead.id ? (
                <div className="border-t border-slate-100 px-5 py-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Score breakdown
                  </p>
                  <ul className="space-y-2">
                    {lead.scoreBreakdown.map((item) => (
                      <li key={item.criterion} className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">{item.criterion}</span>
                          <span className="font-semibold text-indigo-600">
                            +{item.contribution} pts
                          </span>
                        </div>
                        <p className="text-slate-500">{item.rationale}</p>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                          <div
                            className="h-1.5 rounded-full bg-indigo-500"
                            style={{ width: `${Math.round(item.normalizedValue * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-900">Add a lead</h2>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-2">
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Company"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Budget ($)
              <input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Employees
              <input
                type="number"
                value={form.employees}
                onChange={(e) => setForm({ ...form, employees: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Engagement (0-100)
              <input
                type="number"
                min={0}
                max={100}
                value={form.engagement}
                onChange={(e) => setForm({ ...form, engagement: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              ICP fit (0-100)
              <input
                type="number"
                min={0}
                max={100}
                value={form.icpFit}
                onChange={(e) => setForm({ ...form, icpFit: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-xs text-slate-500">
            Title seniority
            <select
              value={form.titleSeniority}
              onChange={(e) => setForm({ ...form, titleSeniority: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="individual_contributor">Individual contributor</option>
              <option value="manager">Manager</option>
              <option value="director">Director</option>
              <option value="vp">VP</option>
              <option value="c_level">C-level</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={form.responded}
              onChange={(e) => setForm({ ...form, responded: e.target.checked })}
            />
            Has responded to outreach
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-950 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Scoring…" : "Add & score lead"}
        </button>
      </form>
    </div>
  );
}

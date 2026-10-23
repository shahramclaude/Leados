"use client";

import { useEffect, useState } from "react";
import { ActorPickerBar, actorHeaders, useActor } from "@/components/ActorPicker";

interface Decision {
  id: number;
  title: string;
  description: string;
  decisionType: string;
  involvesPeopleData: boolean;
  subjectsHaveVisibility: boolean;
  visibilityScope: string;
  reversibility: string;
  impact: string;
  isPowerAction: boolean;
  powerActionType: string | null;
  status: string;
  dissentHidden: boolean;
  createdAt: string;
}

interface RedFlagDef {
  code: string;
  label: string;
  description: string;
  severity: string;
}

interface ReviewResult {
  decisionId: number;
  stakeholdersAffected: Array<{ personId: number; name: string; relation: string; hops: number }>;
  harmBenefit: { value: unknown; reasoning: string; confidence: string };
  reversibilityAssessment: { value: string; reasoning: string; confidence: string };
  fairnessScan: { value: { ran: boolean; disparities: unknown[] }; reasoning: string; confidence: string };
  redFlags: Array<{ code: string; label: string; severity: string; explanation: string }>;
  requiredSteps: Array<{ step: string; reason: string; mandatory: boolean }>;
  decisionSupportNote: string;
  status: string;
}

export default function EthicsPage() {
  const { actor } = useActor();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlagDef[]>([]);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    decisionType: "general",
    involvesPeopleData: false,
    subjectsHaveVisibility: true,
    visibilityScope: "individual",
    reversibility: "reversible",
    impact: "low",
    isPowerAction: false,
    powerActionType: "",
  });

  async function refresh() {
    const [d, f] = await Promise.all([fetch("/api/ethics/decisions").then((r) => r.json()), fetch("/api/ethics/red-flags").then((r) => r.json())]);
    setDecisions(d.decisions ?? []);
    setRedFlags(f.redFlags ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createDecision(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/ethics/decisions", {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify(form),
    });
    setForm({ ...form, title: "", description: "" });
    refresh();
  }

  async function runReview(decisionId: number) {
    setBusyId(decisionId);
    setReview(null);
    const res = await fetch("/api/ethics/review", {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ decisionId }),
    });
    const data = await res.json();
    setReview(data.review ?? null);
    setBusyId(null);
    refresh();
  }

  return (
    <div className="space-y-8">
      <ActorPickerBar />

      <section className="rounded-2xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-950">Ethical decision framework</h1>
        <p className="mt-2 text-sm text-slate-600">
          Every review surfaces stakeholders affected, harm/benefit (<code>Explain&lt;T&gt;</code>), reversibility,
          a fairness scan where the decision is machine-readable, and red flags with mandatory-but-non-blocking
          review steps. This is decision support — never a moral verdict.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Red-flag registry</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {redFlags.map((f) => (
            <div key={f.code} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-mono text-xs text-slate-500">{f.code}</p>
              <p className="font-semibold text-slate-900">{f.label}</p>
              <p className="text-slate-600">{f.description}</p>
              <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">{f.severity}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Propose a decision</h2>
        <form onSubmit={createDecision} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Decision type"
            value={form.decisionType}
            onChange={(e) => setForm({ ...form, decisionType: e.target.value })}
          />
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={form.impact}
            onChange={(e) => setForm({ ...form, impact: e.target.value })}
          >
            <option value="low">Impact: low</option>
            <option value="medium">Impact: medium</option>
            <option value="high">Impact: high</option>
          </select>
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={form.reversibility}
            onChange={(e) => setForm({ ...form, reversibility: e.target.value })}
          >
            <option value="reversible">Reversible</option>
            <option value="partially_reversible">Partially reversible</option>
            <option value="irreversible">Irreversible</option>
          </select>
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={form.visibilityScope}
            onChange={(e) => setForm({ ...form, visibilityScope: e.target.value })}
          >
            <option value="individual">Visibility scope: individual</option>
            <option value="bulk">Visibility scope: bulk</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.involvesPeopleData} onChange={(e) => setForm({ ...form, involvesPeopleData: e.target.checked })} />
            Involves people data
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.subjectsHaveVisibility}
              onChange={(e) => setForm({ ...form, subjectsHaveVisibility: e.target.checked })}
            />
            Subjects have visibility
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isPowerAction} onChange={(e) => setForm({ ...form, isPowerAction: e.target.checked })} />
            Is a T4 power action
          </label>
          {form.isPowerAction && (
            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="power action type, e.g. evaluation_policy_change"
              value={form.powerActionType}
              onChange={(e) => setForm({ ...form, powerActionType: e.target.value })}
            />
          )}
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white sm:col-span-2" type="submit">
            Propose decision
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Decisions</h2>
        <div className="mt-4 space-y-3">
          {decisions.map((d) => (
            <div key={d.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{d.title}</p>
                  <p className="text-sm text-slate-600">{d.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    type={d.decisionType} · impact={d.impact} · reversibility={d.reversibility} · status={d.status}
                  </p>
                </div>
                <button
                  disabled={busyId === d.id}
                  onClick={() => runReview(d.id)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busyId === d.id ? "Running…" : "Run ethical review"}
                </button>
              </div>
            </div>
          ))}
          {decisions.length === 0 && <p className="text-sm text-slate-500">No decisions yet.</p>}
        </div>
      </section>

      {review && (
        <section className="rounded-2xl border-2 border-slate-900 bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-slate-950">Review result — decision #{review.decisionId}</h2>
          <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900">{review.decisionSupportNote}</p>

          <h3 className="mt-4 font-semibold text-slate-900">Stakeholders affected</h3>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {review.stakeholdersAffected.map((s) => (
              <li key={s.personId}>
                {s.name} ({s.relation}) — {s.hops} hop(s) away
              </li>
            ))}
            {review.stakeholdersAffected.length === 0 && <li>None found in the graph.</li>}
          </ul>

          <h3 className="mt-4 font-semibold text-slate-900">Harm / benefit</h3>
          <p className="text-sm text-slate-700">{review.harmBenefit.reasoning} (confidence: {review.harmBenefit.confidence})</p>

          <h3 className="mt-4 font-semibold text-slate-900">Reversibility</h3>
          <p className="text-sm text-slate-700">{review.reversibilityAssessment.reasoning}</p>

          <h3 className="mt-4 font-semibold text-slate-900">Fairness scan</h3>
          <p className="text-sm text-slate-700">{review.fairnessScan.reasoning}</p>

          <h3 className="mt-4 font-semibold text-slate-900">Red flags &amp; required steps</h3>
          {review.redFlags.length === 0 ? (
            <p className="text-sm text-slate-600">No red flags raised.</p>
          ) : (
            <ul className="space-y-2">
              {review.requiredSteps.map((s, i) => (
                <li key={i} className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <p className="font-semibold">{s.step}</p>
                  <p>{s.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

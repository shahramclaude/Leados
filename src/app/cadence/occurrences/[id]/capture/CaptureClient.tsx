"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DecisionDraft {
  question: string;
  decisionClass: string;
  chosen: string;
  impact: number;
}

interface ActionDraft {
  title: string;
  ownerRole: string;
  dueAt: string;
}

interface HypothesisDraft {
  statement: string;
}

interface QuestionDraft {
  question: string;
  ownerRole: string;
}

export default function CaptureClient({ occurrenceId }: { occurrenceId: string }) {
  const router = useRouter();
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [decisions, setDecisions] = useState<DecisionDraft[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([{ title: "", ownerRole: "", dueAt: "" }]);
  const [hypotheses, setHypotheses] = useState<HypothesisDraft[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ decisionIds: string[]; actionIds: string[]; hypothesisIds: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cadence/occurrences/${occurrenceId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeCount,
          decisions: decisions.filter((d) => d.question.trim().length > 0),
          actions: actions
            .filter((a) => a.title.trim().length > 0)
            .map((a) => ({ title: a.title, ownerRole: a.ownerRole || undefined, dueAt: a.dueAt ? new Date(a.dueAt).toISOString() : undefined })),
          hypotheses: hypotheses.filter((h) => h.statement.trim().length > 0),
          openQuestions: questions.filter((q) => q.question.trim().length > 0),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Capture failed.");
        return;
      }
      setResult(body.result);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-medium text-emerald-900">Captured.</p>
        <ul className="mt-2 text-sm text-emerald-800">
          <li>{result.decisionIds.length} decision(s) persisted</li>
          <li>{result.actionIds.length} action(s) persisted (each with an owner)</li>
          <li>{result.hypothesisIds.length} hypothesis(es) persisted</li>
        </ul>
        <button onClick={() => router.push("/cadence")} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Back to Rhythm Board
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">Attendees present</label>
        <input
          type="number"
          min={0}
          value={attendeeCount}
          onChange={(e) => setAttendeeCount(Number(e.target.value))}
          className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Decisions made</h2>
          <button
            onClick={() => setDecisions([...decisions, { question: "", decisionClass: "general", chosen: "", impact: 3 }])}
            className="text-sm text-indigo-600 hover:underline"
          >
            + Add decision
          </button>
        </div>
        {decisions.map((d, i) => (
          <div key={i} className="mb-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <input
              placeholder="Question decided"
              value={d.question}
              onChange={(e) => setDecisions(decisions.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-2"
            />
            <input
              placeholder="Chosen option"
              value={d.chosen}
              onChange={(e) => setDecisions(decisions.map((x, j) => (j === i ? { ...x, chosen: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <select
              value={d.impact}
              onChange={(e) => setDecisions(decisions.map((x, j) => (j === i ? { ...x, impact: Number(e.target.value) } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  impact {n}/5
                </option>
              ))}
            </select>
          </div>
        ))}
        {decisions.length === 0 && <p className="text-sm text-slate-500">No decisions recorded yet.</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Actions (every one needs an owner)</h2>
          <button onClick={() => setActions([...actions, { title: "", ownerRole: "", dueAt: "" }])} className="text-sm text-indigo-600 hover:underline">
            + Add action
          </button>
        </div>
        {actions.map((a, i) => (
          <div key={i} className="mb-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
            <input
              placeholder="Action title"
              value={a.title}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-3"
            />
            <input
              placeholder="Owner role (required)"
              value={a.ownerRole}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, ownerRole: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={a.dueAt}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, dueAt: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Hypotheses raised</h2>
          <button onClick={() => setHypotheses([...hypotheses, { statement: "" }])} className="text-sm text-indigo-600 hover:underline">
            + Add hypothesis
          </button>
        </div>
        {hypotheses.map((h, i) => (
          <input
            key={i}
            placeholder="If we do X, Y will happen because Z"
            value={h.statement}
            onChange={(e) => setHypotheses(hypotheses.map((x, j) => (j === i ? { statement: e.target.value } : x)))}
            className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Open questions</h2>
          <button onClick={() => setQuestions([...questions, { question: "", ownerRole: "" }])} className="text-sm text-indigo-600 hover:underline">
            + Add open question
          </button>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              placeholder="Open question"
              value={q.question}
              onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-2"
            />
            <input
              placeholder="Owning role (required)"
              value={q.ownerRole}
              onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, ownerRole: e.target.value } : x)))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        ))}
      </section>

      <button
        onClick={submit}
        disabled={submitting}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save capture"}
      </button>
    </div>
  );
}

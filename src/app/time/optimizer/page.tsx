"use client";

import { useEffect, useState } from "react";
import { useActor, useActorFetch } from "../ActorContext";

interface Candidate {
  start: string;
  end: string;
  score: number;
  scoreBreakdown: { avgCircadianEnergy: number; deepWorkPreservationPenalty: number; requiredAttendeeCount: number };
  rationale: string[];
}

export default function OptimizerPage() {
  const { actorId, users } = useActor();
  const actorFetch = useActorFetch();
  const [title, setTitle] = useState("Design Review");
  const [duration, setDuration] = useState(45);
  const [required, setRequired] = useState<string[]>([]);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [infeasible, setInfeasible] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<string[]>([]);
  const [booked, setBooked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (required.length === 0 && users.length > 0) setRequired(users.slice(0, 2).map((u) => u.id));
  }, [users, required.length]);

  async function suggest() {
    setError(null);
    setBooked(null);
    const earliestStart = new Date();
    earliestStart.setHours(0, 0, 0, 0);
    const latestEnd = new Date(earliestStart.getTime() + 5 * 24 * 60 * 60 * 1000);
    const res = await actorFetch("/api/time-economics/optimizer/suggest", {
      method: "POST",
      body: JSON.stringify({
        title,
        durationMinutes: duration,
        earliestStart: earliestStart.toISOString(),
        latestEnd: latestEnd.toISOString(),
        requiredUserIds: required,
        optionalUserIds: [],
      }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);
    setSuggestionId(data.suggestionId);
    setCandidates(data.candidates ?? []);
    setInfeasible(data.infeasibleReasonSummary ?? {});
    setMethod(data.method ?? []);
  }

  async function confirmSlot(candidate: Candidate) {
    if (!suggestionId) return;
    const res = await actorFetch("/api/time-economics/optimizer/confirm", {
      method: "POST",
      body: JSON.stringify({ suggestionId, action: "confirm", confirm: true, chosenSlot: { start: candidate.start, end: candidate.end } }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);
    setBooked(`Booked: ${new Date(candidate.start).toLocaleString()} → ${new Date(candidate.end).toLocaleString()}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="m-0 text-lg font-semibold text-slate-950">Calendar Optimization Engine</h2>
        <p className="mt-1 text-sm text-slate-600">
          Greedy, constraint-filtered scheduling suggestions. This engine <strong>never books automatically</strong> — pick a candidate and
          click Confirm to explicitly commit (T2 gate).
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {booked && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{booked}</p>}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            Title
            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            Duration (minutes)
            <input type="number" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </label>
          <label className="text-xs text-slate-600">
            Required attendees
            <select
              multiple
              className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-1"
              value={required}
              onChange={(e) => setRequired(Array.from(e.target.selectedOptions).map((o) => o.value))}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button onClick={suggest} className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Generate suggestions
        </button>
      </div>

      {candidates.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="m-0 mb-3 text-sm font-semibold">Ranked candidates (feasible only)</h3>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.start} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {new Date(c.start).toLocaleString()} → {new Date(c.end).toLocaleTimeString()}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">score {c.score}</span>
                  <button onClick={() => confirmSlot(c)} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                    Confirm this slot
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">{c.rationale.join(" ")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(infeasible).length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="m-0 mb-1 font-semibold">Rejected-slot reasons (hard constraints):</p>
          <ul className="m-0 list-disc pl-4">
            {Object.entries(infeasible).map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count} slot(s)
              </li>
            ))}
          </ul>
        </div>
      )}

      {method.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="m-0 mb-1 font-semibold">Method:</p>
          <ul className="m-0 list-disc pl-4">
            {method.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

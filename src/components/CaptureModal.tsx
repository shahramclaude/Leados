"use client";

import { useState } from "react";

const EVENT_TYPES = [
  { value: "oneonone.logged", label: "1:1 logged" },
  { value: "pulse.mood.logged", label: "Mood pulse" },
  { value: "feedback.logged", label: "Feedback" },
  { value: "conflict.logged", label: "Conflict" },
  { value: "action_item.logged", label: "Action item" },
  { value: "action_item.resolved", label: "Action item resolved" },
  { value: "growth_plan.opened", label: "Growth plan opened" },
  { value: "milestone.delivered", label: "Milestone delivered" },
];

export default function CaptureModal({
  personId,
  personName,
  onClose,
  onLogged,
}: {
  personId: number;
  personName: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [type, setType] = useState(EVENT_TYPES[0].value);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {};
      if (type === "pulse.mood.logged") data.mood = mood;
      if (type === "action_item.logged" || type === "action_item.resolved") data.title = title || "Untitled action item";

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          personId,
          title: title || type,
          notes,
          data,
        }),
      });
      if (!res.ok) throw new Error("Failed to log event");
      onLogged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#11141a] p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-100">Quick log — {personName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-sm">
            ✕
          </button>
        </div>

        <label className="block text-xs text-slate-400 mb-1">Event type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full mb-3 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {type === "pulse.mood.logged" ? (
          <>
            <label className="block text-xs text-slate-400 mb-1">Mood (0-10)</label>
            <input
              type="number"
              min={0}
              max={10}
              value={mood}
              onChange={(e) => setMood(Number(e.target.value))}
              className="w-full mb-3 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
            />
          </>
        ) : null}

        {type === "action_item.logged" || type === "action_item.resolved" ? (
          <>
            <label className="block text-xs text-slate-400 mb-1">Action item title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mb-3 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
              placeholder="e.g. Share updated growth plan draft"
            />
          </>
        ) : null}

        <label className="block text-xs text-slate-400 mb-1">Notes {type === "oneonone.logged" ? "(used for quality scoring)" : ""}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full mb-3 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
          placeholder="What was discussed..."
        />

        {error ? <p className="text-xs text-rose-400 mb-2">{error}</p> : null}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-400 hover:text-slate-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {submitting ? "Logging…" : "Log event"}
          </button>
        </div>
      </div>
    </div>
  );
}

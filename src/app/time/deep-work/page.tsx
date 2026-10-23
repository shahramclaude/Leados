"use client";

import { useEffect, useState } from "react";
import { useActor, useActorFetch } from "../ActorContext";

interface Window {
  id: string;
  scope: string;
  scopeId: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  enforced: boolean;
  label: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DeepWorkPage() {
  const { actorId, actor } = useActor();
  const actorFetch = useActorFetch();
  const [windows, setWindows] = useState<Window[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ dayOfWeek: 2, startMinute: 9 * 60, endMinute: 11 * 60, enforced: false, label: "My focus block" });

  function load() {
    if (!actorId) return;
    actorFetch("/api/time-economics/deep-work/windows")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setWindows(d.windows ?? [])));
  }

  useEffect(load, [actorId, actorFetch]);

  async function createWindow() {
    setError(null);
    const body = {
      scope: "user",
      scopeId: actorId,
      dayOfWeek: form.dayOfWeek,
      startMinute: form.startMinute,
      endMinute: form.endMinute,
      enforced: form.enforced,
      label: form.label,
    };
    const res = await actorFetch("/api/time-economics/deep-work/windows", { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) setError(data.error);
    else load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="m-0 text-lg font-semibold text-slate-950">Deep-Work Architecture</h2>
        <p className="mt-1 text-sm text-slate-600">
          No-meeting windows as policy. <strong>Enforced</strong> windows are hard constraints the calendar optimizer refuses to
          schedule required attendees into; only admin/manager roles can create those. Anyone can propose an advisory window for
          themselves.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="m-0 mb-3 text-sm font-semibold">Current windows</h3>
        <ul className="space-y-2">
          {windows.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span>
                <strong>{w.label}</strong> — {w.scope}
                {w.scope !== "org" ? ` (${w.scopeId})` : ""} · {DOW[w.dayOfWeek]} {fmt(w.startMinute)}–{fmt(w.endMinute)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${w.enforced ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                {w.enforced ? "enforced (blocking)" : "advisory"}
              </span>
            </li>
          ))}
          {windows.length === 0 && <p className="text-sm text-slate-500">No windows yet.</p>}
        </ul>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="m-0 mb-3 text-sm font-semibold">Propose a window for {actor?.name ?? "me"}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className="text-xs text-slate-600">
            Day
            <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>
              {DOW.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Start (min)
            <input type="number" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={form.startMinute} onChange={(e) => setForm({ ...form, startMinute: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-600">
            End (min)
            <input type="number" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={form.endMinute} onChange={(e) => setForm({ ...form, endMinute: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-600">
            Label
            <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={form.enforced} onChange={(e) => setForm({ ...form, enforced: e.target.checked })} />
            Enforced (admin/manager only)
          </label>
        </div>
        <button onClick={createWindow} className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Create window
        </button>
      </div>
    </div>
  );
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

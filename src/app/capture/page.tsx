"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getStoredSession, OFFLINE_QUEUE_STORAGE } from "@/lib/client-session";

type Lead = {
  id: string;
  name: string;
  source: string;
  notes: string | null;
  createdAt: string;
};

type QueuedLead = { name: string; source: string; notes: string; queuedAt: string };

function readQueue(): QueuedLead[] {
  try {
    return JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedLead[]) {
  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE, JSON.stringify(queue));
}

export default function CapturePage() {
  const [name, setName] = useState("");
  const [source, setSource] = useState("referral");
  const [notes, setNotes] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [queue, setQueue] = useState<QueuedLead[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(true);

  const refreshLeads = useCallback(async () => {
    const res = await apiFetch("/api/leads?page=1&pageSize=20");
    if (res.ok) {
      const body = await res.json();
      setLeads(body.data);
    }
  }, []);

  const flushQueue = useCallback(async () => {
    const pending = readQueue();
    if (pending.length === 0) return;
    const remaining: QueuedLead[] = [];
    for (const item of pending) {
      try {
        const res = await apiFetch("/api/leads", { method: "POST", body: JSON.stringify(item) });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    setQueue(remaining);
    if (remaining.length < pending.length) {
      setStatus(`Synced ${pending.length - remaining.length} offline capture(s).`);
      await refreshLeads();
    }
  }, [refreshLeads]);

  useEffect(() => {
    setHasSession(Boolean(getStoredSession().apiKey));
    setQueue(readQueue());
    refreshLeads();
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [refreshLeads, flushQueue]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    const payload = { name, source, notes };

    if (!window.navigator.onLine) {
      queuePayload(payload);
      return;
    }

    try {
      const res = await apiFetch("/api/leads", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to capture lead");
        return;
      }
      setName("");
      setNotes("");
      setStatus("Lead captured.");
      await refreshLeads();
    } catch {
      // Network error even though navigator.onLine said we were online —
      // still queue rather than losing the write.
      queuePayload(payload);
    }
  }

  function queuePayload(payload: { name: string; source: string; notes: string }) {
    const next = [...readQueue(), { ...payload, queuedAt: new Date().toISOString() }];
    writeQueue(next);
    setQueue(next);
    setName("");
    setNotes("");
    setStatus("You're offline — the capture was queued and will sync automatically.");
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Capture a lead</h1>
      {!hasSession ? (
        <p role="alert" className="mt-2 text-sm text-amber-600">
          No tenant session found. Visit Onboarding first.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="lead-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Lead name
          </label>
          <input
            id="lead-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor="lead-source" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Source
          </label>
          <select
            id="lead-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="referral">Referral</option>
            <option value="web">Web</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div>
          <label htmlFor="lead-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Notes
          </label>
          <textarea
            id="lead-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        {status ? <p data-testid="capture-status" className="text-sm text-emerald-600">{status}</p> : null}
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          Capture lead
        </button>
      </form>

      {queue.length > 0 ? (
        <div data-testid="offline-queue" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {queue.length} capture(s) queued offline, pending sync.
          <button type="button" onClick={flushQueue} className="ml-3 underline">
            Retry sync now
          </button>
        </div>
      ) : null}

      <h2 className="mt-10 text-lg font-semibold text-slate-900 dark:text-white">Recent leads</h2>
      <ul data-testid="lead-list" className="mt-3 space-y-2">
        {leads.map((lead) => (
          <li key={lead.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="font-medium text-slate-900 dark:text-white">{lead.name}</span>{" "}
            <span className="text-slate-500 dark:text-slate-400">· {lead.source}</span>
          </li>
        ))}
        {leads.length === 0 ? <li className="text-sm text-slate-500">No leads yet.</li> : null}
      </ul>
    </main>
  );
}

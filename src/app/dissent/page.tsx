"use client";

import { useEffect, useState } from "react";
import { ActorPickerBar, actorHeaders, useActor } from "@/components/ActorPicker";

interface Suggestion {
  id: number;
  body: string;
  category: string;
  status: string;
  archiveReason: string | null;
  createdAt: string;
}

export default function DissentPage() {
  const { actor } = useActor();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ body: "", category: "general" });
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [attackLog, setAttackLog] = useState<string[]>([]);

  async function refresh() {
    const data = await fetch("/api/dissent/suggestions").then((r) => r.json());
    setSuggestions(data.suggestions ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/dissent/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setClaimToken(data.claimToken ?? null);
    setForm({ body: "", category: "general" });
    refresh();
  }

  async function attack(suggestionId: number, action: "delete" | "hide" | "suppress") {
    const res = await fetch(`/api/dissent/suggestions/${suggestionId}/suppress`, {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ attemptedAction: action }),
    });
    const data = await res.json();
    setAttackLog((prev) =>
      [`Attempt by ${actor.role ?? "no-role"} to "${action}" suggestion #${suggestionId}: blocked=${data.blocked} — ${data.reason}`, ...prev].slice(0, 20),
    );
    refresh();
  }

  async function requestArchive(suggestionId: number) {
    const res = await fetch(`/api/dissent/suggestions/${suggestionId}/archive`, {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ reason: "Resolved via demo UI." }),
    });
    const data = await res.json();
    setAttackLog((prev) => [`Archive request for #${suggestionId}: ${JSON.stringify(data)}`, ...prev].slice(0, 20));
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-950">Suggestion / Whisper channel</h1>
        <p className="mt-2 text-sm text-slate-600">
          Anonymous input. No role — including the most senior ones — can suppress a suggestion unilaterally. The
          only legitimate way to stop surfacing a resolved suggestion is a two-person archive request, which never
          deletes it.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Submit anonymously</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <select
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="general">General</option>
            <option value="safety">Safety</option>
            <option value="culture">Culture</option>
            <option value="unpopular_view">Unpopular view (protected)</option>
          </select>
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="Share your view..."
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="submit">
            Submit
          </button>
        </form>
        {claimToken && (
          <p className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-900">
            Claim token (save if you want to prove authorship later, never required): <strong>{claimToken}</strong>
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">All suggestions (unfiltered — visible to everyone)</h2>
        <ActorPickerBar />
        <div className="mt-4 space-y-3">
          {suggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm text-slate-800">{s.body}</p>
              <p className="mt-1 text-xs text-slate-500">
                category={s.category} · status={s.status}
                {s.archiveReason ? ` · archived: ${s.archiveReason}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => attack(s.id, "delete")} className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold text-white">
                  Attack: delete
                </button>
                <button onClick={() => attack(s.id, "hide")} className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold text-white">
                  Attack: hide
                </button>
                <button onClick={() => attack(s.id, "suppress")} className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold text-white">
                  Attack: suppress
                </button>
                <button onClick={() => requestArchive(s.id)} className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white">
                  Request legitimate archive (dual control)
                </button>
              </div>
            </div>
          ))}
          {suggestions.length === 0 && <p className="text-sm text-slate-500">No suggestions yet.</p>}
        </div>

        {attackLog.length > 0 && (
          <div className="mt-5 rounded bg-slate-50 p-3 text-xs text-slate-700">
            {attackLog.map((l, i) => (
              <p key={i} className="py-0.5">
                {l}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

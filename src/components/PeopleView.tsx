"use client";

import { useEffect, useState } from "react";
import { useActor, actorFetch } from "@/lib/actorContext";
import { ExplainPanel } from "./ExplainPanel";
import { RetentionRiskBadge } from "./RetentionRiskBadge";
import { BulletGraph } from "./charts/BulletGraph";
import type { Explain } from "@/lib/explain";

type Tab = "overview" | "timeline" | "flightRisk" | "oneOnOnes" | "growth" | "mobility" | "transparency";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "flightRisk", label: "Flight risk" },
  { id: "oneOnOnes", label: "1:1s" },
  { id: "growth", label: "Growth plans" },
  { id: "mobility", label: "Mobility" },
  { id: "transparency", label: "What LEADOS knows" },
];

interface PersonAggregate {
  id: string;
  name: string;
  email: string;
  role: { value: string; asOfEventTime: string | null };
  title: { value: string; asOfEventTime: string | null };
  team: { value: { id: string | null; name: string | null } };
  tenureMonths: number;
  compaRatio: { value: number | null } | null;
  status: string;
  redactions: string[];
  asOf: string;
}

function useJson<T>(url: string | null, actorId: string | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url || !actorId) return;
    setLoading(true);
    setError(null);
    actorFetch(actorId, url)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Request failed");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}

export function PeopleView({ personId }: { personId: string }) {
  const { currentActorId } = useActor();
  const [tab, setTab] = useState<Tab>("overview");

  const aggregate = useJson<PersonAggregate>(`/api/people/${personId}`, currentActorId, [personId, currentActorId]);
  const flightRisk = useJson<Explain<number>>(
    tab === "flightRisk" || tab === "overview" ? `/api/people/${personId}/flight-risk` : null,
    currentActorId,
    [personId, currentActorId, tab],
  );
  const timeline = useJson<{ timeline: { eventId: string; type: string; occurredAt: string; summary: string }[] }>(
    tab === "timeline" ? `/api/people/${personId}/timeline` : null,
    currentActorId,
    [personId, currentActorId, tab],
  );
  const oneOnOnes = useJson<{
    oneOnOnes: { id: string; scheduledAt: string; status: string; heldAt: string | null }[];
    suggestedTalkingPoints?: { text: string; reason: string }[];
  }>(tab === "oneOnOnes" ? `/api/people/${personId}/one-on-ones?suggest=1` : null, currentActorId, [
    personId,
    currentActorId,
    tab,
  ]);
  const growth = useJson<{ plans: { id: string; title: string; milestonesJson: { id: string; title: string; status: string }[] }[] }>(
    tab === "growth" ? `/api/people/${personId}/growth-plans` : null,
    currentActorId,
    [personId, currentActorId, tab],
  );
  const mobility = useJson<{ suggestions: { targetRole: string; coverage: number; missingSkills: string[] }[] }>(
    tab === "mobility" ? `/api/people/${personId}/mobility` : null,
    currentActorId,
    [personId, currentActorId, tab],
  );
  const transparency = useJson<{
    fields: { field: string; value: unknown; why: string; lawfulBasis: string; sourceEventIds: string[] }[];
    consent: { scope: string; status: string; occurredAt: string }[];
    totalEventsHeld: number;
  }>(tab === "transparency" ? `/api/people/${personId}/transparency` : null, currentActorId, [
    personId,
    currentActorId,
    tab,
  ]);

  return (
    <div>
      {aggregate.error && <p className="text-sm text-rose-600">{aggregate.error}</p>}
      {aggregate.data && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{aggregate.data.name}</h2>
            <p className="text-sm text-slate-600">
              {aggregate.data.title.value} · {aggregate.data.team.value.name ?? "No team"} · {aggregate.data.tenureMonths} mo tenure
            </p>
            {aggregate.data.redactions.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Some fields hidden from this viewer by role-based policy: {aggregate.data.redactions.join(", ")}
              </p>
            )}
          </div>
          {flightRisk.data && <RetentionRiskBadge explain={flightRisk.data} />}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && aggregate.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Compensation context</h3>
            {aggregate.data.compaRatio ? (
              <BulletGraph value={aggregate.data.compaRatio.value ?? 0} target={1} label="Compa-ratio (1.0 = band midpoint)" formatAsPercent={false} />
            ) : (
              <p className="text-xs text-slate-500">Hidden from this viewer by role-based policy.</p>
            )}
          </div>
          {flightRisk.data && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Flight-risk estimate</h3>
              <ExplainPanel explain={flightRisk.data} />
            </div>
          )}
        </div>
      )}

      {tab === "timeline" && (
        <div className="space-y-2">
          {timeline.error && <p className="text-sm text-rose-600">{timeline.error}</p>}
          {timeline.data?.timeline.map((e) => (
            <div key={e.eventId} className="flex gap-3 rounded-lg border border-slate-100 bg-white p-3 text-sm">
              <span className="w-40 shrink-0 text-xs text-slate-400">{new Date(e.occurredAt).toLocaleString()}</span>
              <span className="font-mono text-xs text-slate-400">{e.type}</span>
              <span className="text-slate-700">{e.summary}</span>
            </div>
          ))}
          {timeline.data?.timeline.length === 0 && <p className="text-sm text-slate-400">No events recorded yet.</p>}
        </div>
      )}

      {tab === "flightRisk" && flightRisk.data && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <ExplainPanel explain={flightRisk.data} />
        </div>
      )}
      {tab === "flightRisk" && flightRisk.error && <p className="text-sm text-rose-600">{flightRisk.error}</p>}

      {tab === "oneOnOnes" && (
        <div className="space-y-3">
          {oneOnOnes.error && <p className="text-sm text-rose-600">{oneOnOnes.error}</p>}
          {oneOnOnes.data?.suggestedTalkingPoints && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <h3 className="text-sm font-semibold text-indigo-900">Suggested talking points (for the manager to choose from — never auto-sent)</h3>
              <ul className="mt-2 space-y-1 text-sm text-indigo-900">
                {oneOnOnes.data.suggestedTalkingPoints.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{p.text}</span>{" "}
                    <span className="text-xs text-indigo-700">({p.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {oneOnOnes.data?.oneOnOnes.map((o) => (
              <li key={o.id} className="flex justify-between px-3 py-2 text-sm">
                <span>{new Date(o.scheduledAt).toLocaleString()}</span>
                <span className="text-slate-500">{o.status}</span>
              </li>
            ))}
            {oneOnOnes.data?.oneOnOnes.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-slate-400">No 1:1s recorded yet.</li>
            )}
          </ul>
        </div>
      )}

      {tab === "growth" && (
        <div className="space-y-3">
          {growth.error && <p className="text-sm text-rose-600">{growth.error}</p>}
          {growth.data?.plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-slate-900">{plan.title}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {plan.milestonesJson.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span>{m.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.status === "done"
                          ? "bg-emerald-100 text-emerald-700"
                          : m.status === "in_progress"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {growth.data?.plans.length === 0 && <p className="text-sm text-slate-400">No growth plans yet.</p>}
        </div>
      )}

      {tab === "mobility" && (
        <div className="space-y-2">
          {mobility.error && <p className="text-sm text-rose-600">{mobility.error}</p>}
          {mobility.data?.suggestions.map((s) => (
            <div key={s.targetRole} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{s.targetRole}</span>
                <span className="text-xs text-slate-500">{(s.coverage * 100).toFixed(0)}% skill coverage</span>
              </div>
              {s.missingSkills.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Gaps: {s.missingSkills.join(", ")}</p>
              )}
            </div>
          ))}
          {mobility.data?.suggestions.length === 0 && (
            <p className="text-sm text-slate-400">No roles currently meet the 60% coverage threshold.</p>
          )}
        </div>
      )}

      {tab === "transparency" && (
        <div className="space-y-3">
          {transparency.error && <p className="text-sm text-rose-600">{transparency.error}</p>}
          {transparency.data && (
            <>
              <p className="text-xs text-slate-500">
                {transparency.data.totalEventsHeld} total event(s) recorded about this person in LEADOS.
              </p>
              {transparency.data.fields.map((f) => (
                <div key={f.field} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{f.field}</span>
                    <span className="font-mono text-xs text-slate-500">{JSON.stringify(f.value)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Why: {f.why} · Lawful basis: {f.lawfulBasis} · {f.sourceEventIds.length} source event(s)
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

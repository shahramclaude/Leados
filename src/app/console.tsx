"use client";

import { useCallback, useEffect, useState } from "react";
import { CONFIDENCE_BAND_CLASSES, CONFIDENCE_BAND_LABEL, confidenceBand } from "@/lib/uncertainty";
import { AGENT_TIERS, TOOL_CATALOG } from "@/lib/tiers";

interface Explain<T> {
  value: T;
  confidence: number;
  basis: string[];
  uncertainty: string | null;
  generatedBy: string;
  policyViolations: string[];
}

interface Lead {
  id: number;
  name: string;
  company: string;
  stage: string;
  scoreExplain: Explain<number>;
}

interface Agent {
  id: number;
  name: string;
  tier: number;
}

interface EventRow {
  id: number;
  actorType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string;
  createdAt: string;
}

function ExplainBadge({ explain }: { explain: Explain<unknown> }) {
  const band = confidenceBand(explain.confidence);
  return (
    <div className="inline-flex flex-col gap-1">
      <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${CONFIDENCE_BAND_CLASSES[band]}`}>
        {CONFIDENCE_BAND_LABEL[band]} · {(explain.confidence * 100).toFixed(0)}%
      </span>
      {explain.uncertainty && <span className="text-xs text-slate-500">{explain.uncertainty}</span>}
    </div>
  );
}

async function api(path: string, orgId: number, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-org-id", String(orgId));
  headers.set("x-actor-id", "demo-user");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

export function Console({ orgId, agentId, apiKey }: { orgId: number; agentId: number; apiKey: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [budget, setBudget] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [selectedLead, setSelectedLead] = useState<number | null>(null);
  const [tool, setTool] = useState<string>("lead.read");
  const [toolResult, setToolResult] = useState<Explain<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({ name: "", company: "" });

  const refresh = useCallback(async () => {
    try {
      const [leadsRes, agentsRes, eventsRes, budgetRes] = await Promise.all([
        api("/api/leads", orgId),
        api("/api/admin/agents", orgId),
        api("/api/events", orgId),
        api("/api/admin/budgets", orgId),
      ]);
      setLeads(leadsRes.leads);
      setAgents(agentsRes.agents);
      setEvents(eventsRes.events);
      setBudget(budgetRes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [orgId]);

  useEffect(() => {
    // Intentional mount-time data load from internal APIs; this is a
    // dashboard console, not a derived-state effect, so the fetch-on-mount
    // pattern is correct here even though it sets state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/leads", orgId, { method: "POST", body: JSON.stringify(leadForm) });
      setLeadForm({ name: "", company: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addSignal(leadId: number, type: string) {
    try {
      await api(`/api/leads/${leadId}/signals`, orgId, {
        method: "POST",
        body: JSON.stringify({ type, source: "manual", confidence: 0.9, payload: {} }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runTool() {
    if (!selectedLead) {
      setError("select a lead first");
      return;
    }
    try {
      const res = await api("/api/agent/run", orgId, {
        method: "POST",
        body: JSON.stringify({ agentId, tool, leadId: selectedLead }),
      });
      setToolResult(res.explain);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Leads</h2>
            <form onSubmit={createLead} className="flex gap-2">
              <input
                required
                placeholder="Name"
                value={leadForm.name}
                onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                required
                placeholder="Company"
                value={leadForm.company}
                onChange={(e) => setLeadForm((f) => ({ ...f, company: e.target.value }))}
                className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500">
                Add lead
              </button>
            </form>
          </div>
          <div className="flex flex-col divide-y divide-slate-100">
            {leads.length === 0 && <p className="py-4 text-sm text-slate-500">No leads yet — add one above.</p>}
            {leads.map((lead) => (
              <div
                key={lead.id}
                className={`flex items-center justify-between gap-4 py-3 ${selectedLead === lead.id ? "bg-indigo-50/60" : ""}`}
              >
                <button className="text-left" onClick={() => setSelectedLead(lead.id)}>
                  <p className="font-medium text-slate-900">{lead.name}</p>
                  <p className="text-xs text-slate-500">{lead.company} · stage: {lead.stage}</p>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => addSignal(lead.id, "email_open")}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    + email_open signal
                  </button>
                  <button
                    onClick={() => addSignal(lead.id, "meeting_booked")}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    + meeting_booked signal
                  </button>
                  <ExplainBadge explain={lead.scoreExplain} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Compute budget (Part 18)</h2>
          {budget ? (
            <>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-indigo-600"
                  style={{ width: `${Math.min(100, (budget.used / (budget.limit || 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {budget.used.toFixed(2)} / {budget.limit.toFixed(2)} units used this period ({budget.remaining.toFixed(2)} remaining)
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading…</p>
          )}

          <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Agents (Part 10 tiers)</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span>{a.name}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                  tier {a.tier} · {AGENT_TIERS[a.tier as 0 | 1 | 2 | 3]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Agent console (Part 11 tools, gated by tier + budget)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedLead ?? ""}
            onChange={(e) => setSelectedLead(Number(e.target.value) || null)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Select a lead…</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.company})
              </option>
            ))}
          </select>
          <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
            {Object.values(TOOL_CATALOG).map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} (min tier {t.minTier}, {t.costUnits}u)
              </option>
            ))}
          </select>
          <button onClick={runTool} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            Run tool
          </button>
        </div>
        {toolResult && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-3">
              <ExplainBadge explain={toolResult} />
              <span className="text-xs uppercase tracking-wide text-slate-500">generated by: {toolResult.generatedBy}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-800">
              {typeof toolResult.value === "string" ? toolResult.value : JSON.stringify(toolResult.value, null, 2)}
            </pre>
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
              {toolResult.basis.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {toolResult.policyViolations.length > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Language policy adjusted this output: {toolResult.policyViolations.join("; ")}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Public API (Part 16, registry-gated, tenant-scoped)</h2>
        <p className="mb-2 text-sm text-slate-600">
          This demo org&apos;s key (fixed, dev-only — set <code>LEADOS_DISABLE_DEMO=1</code> once real auth
          exists; see docs/RED-TEAM-2026.md SEC-01):
        </p>
        <code className="block overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">
          curl -H &quot;Authorization: Bearer {apiKey}&quot; http://localhost:3000/api/public/v1/leads
        </code>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Event log (Part 01 write envelope)</h2>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">When</th>
                <th className="py-1 pr-3">Actor</th>
                <th className="py-1 pr-3">Entity</th>
                <th className="py-1 pr-3">Action</th>
                <th className="py-1">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="py-1 pr-3 text-xs text-slate-500">{new Date(ev.createdAt).toLocaleTimeString()}</td>
                  <td className="py-1 pr-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{ev.actorType}</span> {ev.actorId}
                  </td>
                  <td className="py-1 pr-3 text-xs">{ev.entityType}#{ev.entityId}</td>
                  <td className="py-1 pr-3 text-xs">{ev.action}</td>
                  <td className="py-1 text-xs text-slate-500">{ev.reason}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-slate-500">
                    No events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

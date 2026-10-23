"use client";

import { useEffect, useState, use as usePromise } from "react";

type Deal = { id: number; name: string; targetCompany: string; phase: string; closeDate: string | null };
type Obligation = { id: number; name: string; type: string; counterparty: string; triggerCondition: string; status: string };
type Synergy = { id: number; category: string; low: number; mid: number; high: number; confidence: number; rationale: string; assumptions: string[] };
type CascadeEvent = { id: number; obligationId: number; triggerType: string; firedAt: string; dueDate: string | null; status: string };
type ChecklistItem = { id: number; phase: string; item: string; owner: string; status: string; dueOffsetDays: number };
type IntegrationScore = { id: number; cultureDistance: number; systemsOverlapPct: number; talentFlightRisk: number; compositeLow: number; compositeMid: number; compositeHigh: number; confidence: number; rationale: string };

const PHASES = ["diligence", "announce", "integrate", "complete"] as const;

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const dealId = Number(id);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [synergy, setSynergy] = useState<Synergy[]>([]);
  const [cascadeEvents, setCascadeEvents] = useState<CascadeEvent[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [integrationScores, setIntegrationScores] = useState<IntegrationScore[]>([]);
  const [cultureDistance, setCultureDistance] = useState(50);
  const [systemsOverlapPct, setSystemsOverlapPct] = useState(40);
  const [talentFlightRisk, setTalentFlightRisk] = useState(35);
  const [phaseMsg, setPhaseMsg] = useState("");

  function load() {
    fetch(`/api/org-design/deals/${dealId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setDeal(d.deal);
        setObligations(d.obligations);
        setSynergy(d.synergy);
        setCascadeEvents(d.cascadeEvents);
        setChecklist(d.checklist);
        setIntegrationScores(d.integrationScores);
      });
  }

  useEffect(load, [dealId]);

  async function advancePhase(phase: string) {
    const res = await fetch(`/api/org-design/deals/${dealId}/phase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    const data = await res.json();
    setPhaseMsg(data.ok ? `Phase set to ${phase}. Obligation cascade fired ${data.firedCount} event(s).` : data.error);
    load();
  }

  async function scoreIntegration() {
    const res = await fetch(`/api/org-design/deals/${dealId}/integration-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cultureDistance, systemsOverlapPct, talentFlightRisk }),
    });
    const data = await res.json();
    if (data.ok) load();
  }

  if (!deal) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">
          {deal.name} — acquiring {deal.targetCompany}
        </h2>
        <p className="mt-1 text-sm text-slate-500">Close date: {deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : "TBD"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <button
              key={p}
              onClick={() => advancePhase(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${deal.phase === p ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-100"}`}
            >
              {p}
            </button>
          ))}
        </div>
        {phaseMsg && <p className="mt-2 text-sm text-indigo-700">{phaseMsg}</p>}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="m-0 text-sm font-semibold text-slate-950">Obligations &amp; change-of-control cascade</h3>
          <div className="mt-3 space-y-2">
            {obligations.map((o) => (
              <div key={o.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <p className="m-0 font-medium">{o.name}</p>
                <p className="m-0 text-xs text-slate-500">
                  {o.type} · trigger: {o.triggerCondition} · counterparty: {o.counterparty} ·{" "}
                  <span className={o.status === "triggered" ? "font-semibold text-amber-600" : ""}>{o.status}</span>
                </p>
              </div>
            ))}
          </div>
          <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">Cascade events</h4>
          <div className="mt-2 space-y-1">
            {cascadeEvents.length === 0 && <p className="text-sm text-slate-400">None fired yet — advance the deal to &quot;announce&quot;.</p>}
            {cascadeEvents.map((e) => (
              <p key={e.id} className="text-sm text-slate-700">
                Obligation #{e.obligationId} fired ({e.triggerType}) — due {e.dueDate ? new Date(e.dueDate).toLocaleDateString() : "n/a"}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="m-0 text-sm font-semibold text-slate-950">Synergy estimates (Explain&lt;T&gt;)</h3>
          <div className="mt-3 space-y-3">
            {synergy.map((s) => (
              <div key={s.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="m-0 font-semibold capitalize text-slate-900">
                  {s.category}: {s.mid.toLocaleString()} [{s.low.toLocaleString()}, {s.high.toLocaleString()}]
                </p>
                <p className="mt-1 text-xs text-slate-500">confidence {Math.round(s.confidence * 100)}% · {s.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="m-0 text-sm font-semibold text-slate-950">Integration-difficulty score</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <label className="text-xs text-slate-600">
              Culture distance
              <input type="number" min={0} max={100} value={cultureDistance} onChange={(e) => setCultureDistance(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
            </label>
            <label className="text-xs text-slate-600">
              Systems overlap %
              <input type="number" min={0} max={100} value={systemsOverlapPct} onChange={(e) => setSystemsOverlapPct(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
            </label>
            <label className="text-xs text-slate-600">
              Talent-flight risk
              <input type="number" min={0} max={100} value={talentFlightRisk} onChange={(e) => setTalentFlightRisk(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
            </label>
          </div>
          <button onClick={scoreIntegration} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Score integration difficulty
          </button>
          <div className="mt-3 space-y-2">
            {integrationScores.map((s) => (
              <div key={s.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                Composite: {s.compositeMid} [{s.compositeLow}, {s.compositeHigh}] · confidence {Math.round(s.confidence * 100)}%
                <p className="mt-1 text-xs text-slate-500">{s.rationale}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="m-0 text-sm font-semibold text-slate-950">Day-1 readiness checklist</h3>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {checklist.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <p className="m-0">{c.item}</p>
                  <p className="m-0 text-xs text-slate-500">
                    {c.phase} · owner: {c.owner} · offset {c.dueOffsetDays >= 0 ? "+" : ""}
                    {c.dueOffsetDays}d
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

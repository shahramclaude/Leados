"use client";

import { useState } from "react";
import { streamSSE } from "@/lib/ai/clientSSE";

type Phase = { phase: string; message: string; at: number };
type NarrativeMode = "executive" | "analyst";

const PHASE_LABEL: Record<string, string> = {
  retrieve: "Retrieving evidence",
  ground: "Grounding facts",
  compose: "Composing narrative",
  verify: "Verifying citations",
  done: "Done",
  error: "Error",
};

function PhaseTrail({ phases }: { phases: Phase[] }) {
  if (phases.length === 0) return null;
  return (
    <ol className="mb-4 flex flex-wrap gap-2 text-xs">
      {phases.map((p, i) => (
        <li key={i} className={`rounded-full px-3 py-1 ${p.phase === "error" ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-700"}`}>
          <span className="font-semibold">{PHASE_LABEL[p.phase] ?? p.phase}</span>
          <span className="ml-1 opacity-70">— {p.message}</span>
        </li>
      ))}
    </ol>
  );
}

function CitationChips({ citations }: { citations: Array<{ ref: string; claim: string }> }) {
  const unique = Array.from(new Map(citations.map((c) => [c.ref, c])).values());
  if (unique.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unique.map((c) => (
        <span key={c.ref} title={c.claim} className="cursor-help rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-mono text-indigo-700">
          {c.ref}
        </span>
      ))}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const color = level === "high" ? "bg-emerald-100 text-emerald-700" : level === "medium" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${color}`}>{level} confidence</span>;
}

function AbstainCard({ abstained }: { abstained: { reason: string; missingEvidence: string[] } }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">I don't have evidence for this — here's what would be needed:</p>
      <p className="mt-1">{abstained.reason}</p>
      <ul className="mt-2 list-disc pl-5">
        {abstained.missingEvidence.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

export default function LeadosConsole() {
  const [tab, setTab] = useState<"briefing" | "ask" | "insights">("briefing");
  const [mode, setMode] = useState<NarrativeMode>("executive");
  const [loading, setLoading] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [briefing, setBriefing] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [question, setQuestion] = useState("What happened with Acme Analytics funding?");
  const [askResult, setAskResult] = useState<any>(null);

  async function runBriefing() {
    setLoading(true);
    setPhases([]);
    setBriefing(null);
    try {
      await streamSSE(`/api/ai/briefing?orgId=1&userId=1&mode=${mode}&stream=1`, {}, (event, data) => {
        if (event === "phase") setPhases((p) => [...p, data]);
        if (event === "result") setBriefing(data);
        if (event === "error") setPhases((p) => [...p, { phase: "error", message: data.message, at: Date.now() }]);
      });
    } finally {
      setLoading(false);
    }
  }

  async function runInsights() {
    setLoading(true);
    setPhases([]);
    setInsights(null);
    try {
      await streamSSE(`/api/ai/insights?orgId=1&userId=1&mode=${mode}&stream=1`, {}, (event, data) => {
        if (event === "phase") setPhases((p) => [...p, data]);
        if (event === "result") setInsights(data);
        if (event === "error") setPhases((p) => [...p, { phase: "error", message: data.message, at: Date.now() }]);
      });
    } finally {
      setLoading(false);
    }
  }

  async function runAsk() {
    setLoading(true);
    setPhases([]);
    setAskResult(null);
    try {
      await streamSSE(
        "/api/ai/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId: 1, userId: 1, question, mode, stream: true }),
        },
        (event, data) => {
          if (event === "phase") setPhases((p) => [...p, data]);
          if (event === "result") setAskResult(data);
          if (event === "error") setPhases((p) => [...p, { phase: "error", message: data.message, at: Date.now() }]);
        },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS · Part 11</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Grounded Language Surfaces</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Every sentence below is produced by the grounded generation pipeline: deterministic facts are fetched first, then
        composed into prose, then verified against the citation lint before you ever see it.
      </p>

      <div className="mt-6 flex items-center gap-2">
        {(["briefing", "ask", "insights"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {t === "briefing" ? "Daily Briefing" : t === "ask" ? "Ask-LEADOS" : "Insight Synthesis"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <label>Register:</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as NarrativeMode)} className="rounded-md border border-slate-300 px-2 py-1">
            <option value="executive">Executive (plain)</option>
            <option value="analyst">Analyst (detailed)</option>
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
        {tab === "briefing" && (
          <div>
            <button onClick={runBriefing} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Generating…" : "Generate Daily Briefing"}
            </button>
            <PhaseTrail phases={phases} />
            {briefing?.overall?.abstained && <AbstainCard abstained={briefing.overall.abstained} />}
            {briefing && !briefing.overall?.abstained && (
              <div className="mt-4 space-y-3">
                <ConfidenceBadge level={briefing.overall.confidenceClass} />
                {briefing.items.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm text-slate-800">{item.text}</p>
                    <CitationChips citations={item.citations} />
                    <details className="mt-1 text-xs text-slate-500">
                      <summary className="cursor-pointer">Why am I seeing this?</summary>
                      <p className="mt-1">{item.whyShown}</p>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "ask" && (
          <div>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ask about any entity, metric, or event…"
              />
              <button onClick={runAsk} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {loading ? "Thinking…" : "Ask"}
              </button>
            </div>
            <PhaseTrail phases={phases} />
            {askResult?.generation?.abstained && <AbstainCard abstained={askResult.generation.abstained} />}
            {askResult && !askResult.generation?.abstained && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <ConfidenceBadge level={askResult.generation.confidenceClass} />
                  {askResult.costBadge && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      dev cost: {askResult.costBadge.tier} · {askResult.costBadge.costCents.toFixed(3)}¢ · cache {askResult.costBadge.cacheHit ? "hit" : "miss"}
                    </span>
                  )}
                  {askResult.generation.degraded && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] text-orange-700">degraded mode</span>}
                </div>
                <p className="mt-3 text-sm text-slate-800">{askResult.generation.text}</p>
                <CitationChips citations={askResult.generation.citations} />
              </div>
            )}
          </div>
        )}

        {tab === "insights" && (
          <div>
            <button onClick={runInsights} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Analyzing…" : "Synthesize Insights"}
            </button>
            <PhaseTrail phases={phases} />
            {insights?.overall?.abstained && <AbstainCard abstained={insights.overall.abstained} />}
            {insights && !insights.overall?.abstained && (
              <div className="mt-4 space-y-3">
                <ConfidenceBadge level={insights.overall.confidenceClass} />
                {insights.insights.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm text-slate-800">{item.text}</p>
                    <CitationChips citations={item.citations} />
                    <details className="mt-1 text-xs text-slate-500">
                      <summary className="cursor-pointer">Why am I seeing this?</summary>
                      <p className="mt-1">{item.whyShown}</p>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { useNowTick } from "@/lib/useNowTick";
import DomainRadar from "@/components/DomainRadar";
import BeliefGauge from "@/components/BeliefGauge";
import { DOMAIN_META, DOMAIN_ORDER, healthColor, severityColor, timeAgo } from "@/lib/domains";
import type { Domain, Finding } from "@/lib/types";

type QueueKind = "finding" | "decision" | "playbook" | "hypothesis";
interface QueueItem {
  id: string;
  kind: QueueKind;
  label: string;
  domain: Domain;
  priority: string;
}

export default function CockpitView() {
  const router = useRouter();
  const now = useNowTick();
  const { orchestratorResult, agentStatus, sseConnected, dismissFinding, openSidePanel } = useApp();
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [briefingOpen, setBriefingOpen] = useState(false);

  const domainHealth = orchestratorResult?.domainHealth;
  const priorHealth = orchestratorResult?.priorDomainHealth;

  const scoreDeltas = useMemo(() => {
    const map = new Map<Domain, number>();
    if (!domainHealth || !priorHealth) return map;
    for (const d of DOMAIN_ORDER) map.set(d, domainHealth[d] - priorHealth[d]);
    return map;
  }, [domainHealth, priorHealth]);

  const activeFindings = useMemo(
    () => (orchestratorResult ? orchestratorResult.findings.filter((f) => !f.dismissed) : []),
    [orchestratorResult],
  );

  const sev5Findings = activeFindings.filter((f) => f.severity >= 5);

  const queueItems: QueueItem[] = useMemo(() => {
    if (!orchestratorResult) return [];
    const items: QueueItem[] = [];
    const in48h = Date.now() + 48 * 3600 * 1000;

    for (const f of activeFindings.filter((f) => f.severity >= 5)) {
      items.push({ id: f.id, kind: "finding", label: f.title, domain: f.domain, priority: "CRITICAL" });
    }
    for (const d of orchestratorResult.decisions.filter(
      (d) => d.status === "open" && d.deadline && new Date(d.deadline).getTime() < in48h,
    )) {
      items.push({ id: d.id, kind: "decision", label: d.title, domain: d.domain, priority: "DEADLINE" });
    }
    for (const p of orchestratorResult.playbooks.filter((p) => p.status === "triggered")) {
      items.push({ id: p.id, kind: "playbook", label: p.title, domain: p.domain, priority: "PLAYBOOK" });
    }
    for (const h of orchestratorResult.hypotheses.filter(
      (h) => h.status === "open" && h.resolvesAt && new Date(h.resolvesAt).getTime() < in48h,
    )) {
      items.push({ id: h.id, kind: "hypothesis", label: h.title, domain: h.domain, priority: "RESOLVING" });
    }
    return items.slice(0, 5);
  }, [orchestratorResult, activeFindings]);

  function toggleQueueItem(item: QueueItem) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    if (item.kind === "finding") {
      dismissFinding(item.id);
    } else {
      const kind = item.kind === "hypothesis" ? "hypothesis" : item.kind;
      const status = item.kind === "hypothesis" ? "confirmed" : "done";
      fetch(`/api/tasks/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, status }),
      }).catch(() => {});
    }
  }

  const topLatentNodes = useMemo(
    () => (orchestratorResult ? [...orchestratorResult.latentNodes].sort((a, b) => b.posterior - a.posterior).slice(0, 3) : []),
    [orchestratorResult],
  );

  const cascadeRisk = orchestratorResult?.cascadeRisk ?? 0;
  const cascadePct = Math.round(cascadeRisk * 100);
  const cascadeColor = cascadePct > 50 ? "var(--sev-5)" : cascadePct > 30 ? "var(--sev-4)" : "var(--good)";

  const systemConfidencePct = Math.round((orchestratorResult?.systemConfidence ?? 0) * 100);

  const accuracyRate =
    agentStatus && agentStatus.hypothesesConfirmed + agentStatus.hypothesesRefuted > 0
      ? Math.round(
          (agentStatus.hypothesesConfirmed / (agentStatus.hypothesesConfirmed + agentStatus.hypothesesRefuted)) * 100,
        )
      : null;

  if (!orchestratorResult) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-xs text-slate-500">
        LOADING INTELLIGENCE SNAPSHOT…
      </div>
    );
  }

  return (
    <div className="grid min-h-full grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-[280px_1fr_280px]">
      {/* ---------------------------------------------------------------- */}
      {/* LEFT COLUMN                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3">
          <h2 className="mb-1 font-mono text-[10px] tracking-widest text-slate-500">DOMAIN HEALTH RADAR</h2>
          <div className="flex justify-center">
            <DomainRadar scores={orchestratorResult.domainHealth} priorScores={orchestratorResult.priorDomainHealth} size={220} />
          </div>
          <table className="mt-2 w-full border-collapse">
            <tbody>
              {DOMAIN_ORDER.map((domain) => {
                const score = orchestratorResult.domainHealth[domain];
                const delta = scoreDeltas.get(domain) ?? 0;
                const arrow = delta > 2 ? "↑" : delta < -2 ? "↓" : "→";
                const sev5Count = activeFindings.filter((f) => f.domain === domain && f.severity >= 5).length;
                return (
                  <tr
                    key={domain}
                    className="cursor-pointer border-t border-[var(--border-subtle)] text-xs hover:bg-slate-800/40"
                    onClick={() => DOMAIN_META[domain].route && router.push(DOMAIN_META[domain].route!)}
                  >
                    <td className="py-1.5 pl-1">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[domain].color }} />
                    </td>
                    <td className="py-1.5 text-slate-300">{DOMAIN_META[domain].label}</td>
                    <td className="py-1.5 text-right font-mono font-semibold" style={{ color: healthColor(score) }}>
                      {score}
                    </td>
                    <td className="w-5 py-1.5 text-center text-slate-500">{arrow}</td>
                    <td className="py-1.5 pr-1 text-right font-mono text-[10px]" style={{ color: sev5Count > 0 ? "var(--sev-5)" : "var(--text-dim)" }}>
                      {sev5Count > 0 ? sev5Count : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <button
          onClick={() => router.push("/signals?filter=low-confidence")}
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3 text-left"
        >
          <div className="font-mono text-[10px] tracking-widest text-slate-500">SYSTEM CONFIDENCE {systemConfidencePct}%</div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-800">
            <div
              className="h-full"
              style={{ width: `${systemConfidencePct}%`, backgroundColor: systemConfidencePct < 50 ? "var(--sev-4)" : "var(--good)" }}
            />
          </div>
          {systemConfidencePct < 50 && (
            <div className="mt-1.5 font-mono text-[10px] text-amber-400">LOW CONFIDENCE — LOG MORE DATA →</div>
          )}
        </button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* CENTER COLUMN                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col gap-3 md:col-span-2 xl:col-span-1">
        <section className="rounded border-l-4 border-indigo-500 bg-[var(--bg-panel-raised)] p-4">
          <div className="font-mono text-[10px] tracking-widest text-amber-400">SITUATIONAL ASSESSMENT</div>
          <p className="mt-2 text-sm leading-[1.7] text-slate-200">{orchestratorResult.situationalAssessment}</p>
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3">
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <h2 className="font-mono text-[10px] tracking-widest text-slate-500">LIVE FINDINGS</h2>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
              {activeFindings.length}
            </span>
            {sseConnected && <span className="leados-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </div>
          <div className="min-h-[300px] flex-1 space-y-2 overflow-y-auto md:max-h-[420px]">
            {activeFindings.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                {/* viewBox "0 0 24 24": standard 24x24 icon grid, 1 unit ~ 1px at
                    default render size; lets the checkmark scale cleanly. */}
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--good)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M7 12.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="font-mono text-xs text-slate-400">ALL CLEAR — No active findings</div>
              </div>
            ) : (
              activeFindings.map((f) => (
                <FindingCard key={f.id} finding={f} onOpen={() => openSidePanel("finding", f.id)} now={now} />
              ))
            )}
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* RIGHT COLUMN                                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3">
          <h2 className="mb-2 font-mono text-[10px] tracking-widest text-indigo-400">NEXT 48 HOURS</h2>
          {queueItems.length === 0 ? (
            <div className="py-4 text-center font-mono text-[10px] text-slate-500">NOTHING URGENT QUEUED</div>
          ) : (
            <ul className="space-y-2">
              {queueItems.map((item) => {
                const done = completedIds.has(item.id);
                return (
                  <li key={`${item.kind}-${item.id}`} className="flex items-start gap-2">
                    <button
                      onClick={() => toggleQueueItem(item)}
                      className={`mt-0.5 flex h-5 w-5 min-h-[20px] shrink-0 items-center justify-center rounded border ${
                        done ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-slate-600 text-transparent"
                      }`}
                      aria-label="Mark done"
                    >
                      ✓
                    </button>
                    <div className={`min-w-0 flex-1 ${done ? "opacity-40 line-through" : ""}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] font-bold text-indigo-400">{item.priority}</span>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOMAIN_META[item.domain].color }} />
                      </div>
                      <p className="truncate text-xs text-slate-300">{item.label}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3" title="Estimated probability that a multi-domain failure cascade is underway.">
          <h2 className="mb-1 text-center font-mono text-[10px] tracking-widest text-slate-500">CASCADE RISK</h2>
          <div className="text-center font-mono text-4xl font-bold" style={{ color: cascadeColor }}>
            {cascadePct}%
          </div>
          <div className="mt-3 space-y-1.5">
            {topLatentNodes.map((node) => (
              <div key={node.id}>
                <div className="flex items-center justify-between font-mono text-[9px] text-slate-500">
                  <span className="truncate">{node.label}</span>
                  <span>{Math.round(node.posterior * 100)}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded bg-slate-800">
                  <div className="h-full" style={{ width: `${node.posterior * 100}%`, backgroundColor: DOMAIN_META[node.domain].color }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {orchestratorResult.briefing && (
          <section className="rounded border-l-2 border-indigo-500 bg-[var(--bg-panel-raised)] p-3">
            <h2 className="font-mono text-[10px] tracking-widest text-slate-500">THIS MORNING</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{orchestratorResult.briefing.executiveSummary}</p>
            <ul className="mt-2 space-y-1">
              {orchestratorResult.briefing.bullets.slice(0, 3).map((b, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-slate-400">
                  <span className="text-indigo-400">—</span>
                  {b}
                </li>
              ))}
            </ul>
            <button onClick={() => setBriefingOpen(true)} className="mt-2 font-mono text-[10px] text-indigo-400 hover:text-indigo-300">
              FULL BRIEFING →
            </button>
          </section>
        )}

        <section className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3">
          <h2 className="mb-2 font-mono text-[10px] tracking-widest text-slate-500">AUTONOMOUS AGENT</h2>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
            <span className="text-slate-500">Last run</span>
            <span className="text-right text-slate-300">{agentStatus ? timeAgo(agentStatus.lastRun, now) : "—"}</span>
            <span className="text-slate-500">Next run</span>
            <span className="text-right text-slate-300">{agentStatus ? new Date(agentStatus.nextRun).toLocaleTimeString() : "—"}</span>
            <span className="text-slate-500">Playbooks (7d)</span>
            <span className="text-right text-slate-300">{agentStatus?.playbooksTriggeredThisWeek ?? 0}</span>
            <span className="text-slate-500">Hypotheses open</span>
            <span className="text-right text-slate-300">{agentStatus?.hypothesesOpen ?? 0}</span>
            <span className="text-slate-500">Confirmed</span>
            <span className="text-right text-emerald-400">{agentStatus?.hypothesesConfirmed ?? 0}</span>
            <span className="text-slate-500">Refuted</span>
            <span className="text-right text-red-400">{agentStatus?.hypothesesRefuted ?? 0}</span>
          </div>
          {accuracyRate != null && (
            <div className="mt-2 flex items-center justify-center">
              <BeliefGauge value={accuracyRate / 100} confidence={0.8} label="Accuracy rate" size={100} />
            </div>
          )}
        </section>
      </div>

      {briefingOpen && orchestratorResult.briefing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setBriefingOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded border border-slate-700 bg-[#10131a] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-xs tracking-widest text-indigo-400">MORNING BRIEFING — {orchestratorResult.briefing.date}</h2>
              <button onClick={() => setBriefingOpen(false)} className="text-slate-400 hover:text-slate-100">✕</button>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">{orchestratorResult.briefing.fullText}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding, onOpen, now }: { finding: Finding; onOpen: () => void; now: number }) {
  const isCritical = finding.severity >= 5;
  const isUrgent = finding.severity === 4;
  return (
    <button
      onClick={onOpen}
      className={`block w-full rounded border-l-2 p-2.5 text-left ${
        isCritical
          ? "leados-pulse-card border-red-600 bg-red-950/50"
          : isUrgent
            ? "border-amber-600 bg-amber-950/30"
            : "border-slate-700 bg-slate-900/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-black"
          style={{ backgroundColor: severityColor(finding.severity) }}
        >
          SEV {finding.severity}
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOMAIN_META[finding.domain].color }} />
        <span className="truncate text-sm text-slate-100">{finding.title}</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-400">{finding.detail}</p>
      <div className="mt-1 flex items-center gap-3">
        {finding.probability != null && (
          <div className="h-1 w-20 overflow-hidden rounded bg-slate-800">
            <div className="h-full bg-indigo-500" style={{ width: `${finding.probability * 100}%` }} />
          </div>
        )}
        <span className="font-mono text-[9px] text-slate-500">{timeAgo(finding.createdAt, now)}</span>
        {finding.playbookId && <span className="font-mono text-[9px] text-indigo-400">→ playbook</span>}
      </div>
    </button>
  );
}

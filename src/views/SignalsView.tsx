"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { DOMAIN_META, DOMAIN_ORDER, severityColor, timeAgo } from "@/lib/domains";
import DomainView from "@/views/_DomainView";

export default function SignalsView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lowConfidenceFilter = searchParams.get("filter") === "low-confidence";
  const { orchestratorResult } = useApp();

  const lowConfidenceNodes = useMemo(
    () => (orchestratorResult ? orchestratorResult.latentNodes.filter((n) => n.confidence < 0.5) : []),
    [orchestratorResult],
  );

  if (!lowConfidenceFilter) {
    return <DomainView domain="signals" description="External market, competitive, and leading-indicator signals." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="rounded border border-amber-700/50 bg-amber-950/20 p-4">
        <h1 className="font-mono text-xs tracking-widest text-amber-400">LOW-CONFIDENCE BELIEF NODES</h1>
        <p className="mt-1 text-xs text-slate-400">
          These are the latent variables in the belief network with the weakest evidential support. Log more
          data in these domains to raise system confidence.
        </p>
      </header>
      <div className="space-y-2">
        {lowConfidenceNodes.length === 0 ? (
          <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4 text-center font-mono text-xs text-slate-500">
            ALL NODES ABOVE 50% CONFIDENCE
          </div>
        ) : (
          lowConfidenceNodes.map((n) => (
            <div key={n.id} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[n.domain].color }} />
                  <span className="text-sm text-slate-100">{n.label}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">{timeAgo(n.updatedAt)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="font-mono text-[9px] text-slate-500">POSTERIOR</div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800">
                    <div className="h-full bg-indigo-500" style={{ width: `${n.posterior * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-slate-500">CONFIDENCE</div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800">
                    <div
                      className="h-full"
                      style={{ width: `${n.confidence * 100}%`, backgroundColor: severityColor(n.confidence < 0.3 ? 5 : 4) }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {orchestratorResult && (
        <div className="space-y-2">
          <h2 className="font-mono text-[10px] tracking-widest text-slate-500">ALL DOMAINS</h2>
          <div className="flex flex-wrap gap-2">
            {DOMAIN_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => DOMAIN_META[d].route && router.push(DOMAIN_META[d].route!)}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] px-2 py-1 font-mono text-[10px] text-slate-400"
              >
                {DOMAIN_META[d].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useApp } from "@/lib/AppContext";
import { DOMAIN_META, severityColor, timeAgo } from "@/lib/domains";

// Generic entity detail panel. Never navigates — it slides in fixed over
// whatever view is currently mounted, so the user's place in the app is
// preserved (progressive disclosure: overview -> click -> detail).
export default function SidePanel() {
  const { sidePanel, closeSidePanel, orchestratorResult, dismissFinding } = useApp();

  if (!sidePanel.type || !sidePanel.entityId || !orchestratorResult) return null;

  const { type, entityId } = sidePanel;
  let title = "";
  let body: React.ReactNode = null;

  if (type === "person") {
    const p = orchestratorResult.people.find((x) => x.id === entityId);
    if (p) {
      title = p.name;
      body = (
        <div className="space-y-3">
          <div className="font-mono text-xs text-slate-400">{p.role}</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[p.domain].color }} />
            <span className="text-xs text-slate-300">{DOMAIN_META[p.domain].label}</span>
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] tracking-widest text-amber-400">RISK SCORE</div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
              <div
                className="h-full"
                style={{ width: `${p.riskScore * 100}%`, backgroundColor: severityColor(p.riskScore > 0.6 ? 5 : p.riskScore > 0.3 ? 4 : 1) }}
              />
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{p.notes}</p>
        </div>
      );
    }
  } else if (type === "finding") {
    const f = orchestratorResult.findings.find((x) => x.id === entityId);
    if (f) {
      title = f.title;
      body = (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-black"
              style={{ backgroundColor: severityColor(f.severity) }}
            >
              SEV {f.severity}
            </span>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[f.domain].color }} />
            <span className="text-xs text-slate-300">{DOMAIN_META[f.domain].label}</span>
            <span className="font-mono text-[10px] text-slate-500">{timeAgo(f.createdAt)}</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{f.detail}</p>
          {f.probability != null && (
            <div>
              <div className="mb-1 font-mono text-[10px] tracking-widest text-slate-500">PROBABILITY</div>
              <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-indigo-500" style={{ width: `${f.probability * 100}%` }} />
              </div>
            </div>
          )}
          <div className="font-mono text-[10px] text-slate-500">CONFIDENCE {Math.round(f.confidence * 100)}%</div>
          {!f.dismissed && (
            <button
              onClick={() => dismissFinding(f.id)}
              className="min-h-11 rounded bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
            >
              Dismiss finding
            </button>
          )}
        </div>
      );
    }
  } else if (type === "decision") {
    const d = orchestratorResult.decisions.find((x) => x.id === entityId);
    if (d) {
      title = d.title;
      body = (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[d.domain].color }} />
            <span className="text-xs text-slate-300">{DOMAIN_META[d.domain].label}</span>
          </div>
          <div className="font-mono text-[10px] text-slate-500">
            DEADLINE {d.deadline ? new Date(d.deadline).toLocaleString() : "—"}
          </div>
          <div className="font-mono text-[10px] text-slate-500">STATUS {d.status.toUpperCase()}</div>
        </div>
      );
    }
  } else if (type === "hypothesis") {
    const h = orchestratorResult.hypotheses.find((x) => x.id === entityId);
    if (h) {
      title = h.title;
      body = (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[h.domain].color }} />
            <span className="text-xs text-slate-300">{DOMAIN_META[h.domain].label}</span>
          </div>
          <div className="font-mono text-[10px] text-slate-500">STATUS {h.status.toUpperCase()}</div>
          <div>
            <div className="mb-1 font-mono text-[10px] tracking-widest text-slate-500">CONFIDENCE</div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
              <div className="h-full bg-indigo-500" style={{ width: `${h.confidence * 100}%` }} />
            </div>
          </div>
          <div className="font-mono text-[10px] text-slate-500">
            RESOLVES {h.resolvesAt ? new Date(h.resolvesAt).toLocaleString() : "—"}
          </div>
        </div>
      );
    }
  }

  if (!body) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40" onClick={closeSidePanel} />
      <div className="leados-slide-in absolute right-0 top-0 h-full w-full border-l border-slate-700 bg-[#0d1016] p-4 shadow-2xl sm:w-[380px]">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            onClick={closeSidePanel}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 hover:text-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";
import type { Finding, Store } from "../types";
import type { Projected } from "../lib/engine";
import { visibleFindings } from "../lib/engine";
import { Badge, Button, Card, SectionTitle, SevBadge } from "../components/primitives";
import { navigate, buildExplainLink, buildPlaybookLink } from "../lib/router";
import * as store from "../lib/store";
import { DOMAINS } from "../data/catalog";

export function TodayView({ P, storeState, query, onChange }: { P: Projected; storeState: Store; query: URLSearchParams; onChange: () => void }) {
  const domainFilter = query.get("domain") || "";
  const findingScroll = query.get("finding") || "";
  const focus = query.get("focus") === "true";
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const visible = useMemo(
    () => visibleFindings(P, storeState.meta.mutedRules, storeState.meta.dismissed),
    [P, storeState.meta.mutedRules, storeState.meta.dismissed]
  );
  const filtered = domainFilter ? visible.filter((f) => f.domain === domainFilter) : visible;
  const ranked = focus ? filtered.slice(0, 5) : filtered;

  useEffect(() => {
    if (findingScroll && refs.current[findingScroll]) {
      refs.current[findingScroll]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [findingScroll, ranked.length]);

  const grouped = new Map<string, Finding[]>();
  ranked.forEach((f) => grouped.set(f.domain, [...(grouped.get(f.domain) || []), f]));

  return (
    <div>
      <SectionTitle sub={`${visible.length} active findings across ${DOMAINS.length} domains · smart-ranked by severity`}>
        Today {focus && <Badge tone="violet">focus mode</Badge>}
      </SectionTitle>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => navigate("#/today")} className={chip(!domainFilter)}>All domains</button>
        {DOMAINS.map((d) => (
          <button key={d} onClick={() => navigate(`#/today?domain=${d}`)} className={chip(domainFilter === d)}>
            #{d}
          </button>
        ))}
        <button onClick={() => navigate(domainFilter ? `#/today?domain=${domainFilter}&focus=true` : "#/today?focus=true")} className={chip(focus)}>
          Focus mode
        </button>
      </div>

      {ranked.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">Nothing active here — try clearing filters, or check #/health to confirm rules are still running underneath any mutes/dismissals.</Card>
      ) : (
        [...grouped.entries()].map(([domain, findings]) => (
          <div key={domain} className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">#{domain}</h3>
            <div className="space-y-2">
              {findings.map((f) => (
                <div key={f.key} ref={(el) => { refs.current[f.rule] = el; refs.current[f.key] = el; }}>
                  <FindingCard finding={f} highlighted={findingScroll === f.rule || findingScroll === f.key} onChange={onChange} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function chip(active: boolean) {
  return `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-violet-300 bg-violet-100 text-violet-800" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`;
}

export function FindingCard({ finding, highlighted, onChange }: { finding: Finding; highlighted?: boolean; onChange: () => void }) {
  return (
    <Card className={`p-4 ${highlighted ? "ring-2 ring-violet-400" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <SevBadge sev={finding.sev} />
            <button className="font-mono text-xs text-violet-700 hover:underline" onClick={() => navigate(buildExplainLink(finding.rule))}>
              {finding.rule}
            </button>
            <Badge tone="slate">#{finding.smartRank}</Badge>
            <Badge tone={finding.conf === "HIGH" ? "green" : finding.conf === "MEDIUM" ? "amber" : "slate"}>{finding.conf}</Badge>
          </div>
          <h4 className="mt-1 font-medium text-slate-900">{finding.title}</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
            {finding.basis.map((b, i) => (
              <li key={i}>· {b}</li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {finding.play && (
            <Button variant="primary" onClick={() => navigate(buildPlaybookLink(finding.play!, finding.refs[0]))}>
              Play
            </Button>
          )}
          <Button variant="ghost" onClick={() => { store.snoozeFinding(finding.key, 7); onChange(); }}>Snooze 7d</Button>
          <Button variant="ghost" onClick={() => { store.dismissFinding(finding.key); onChange(); }}>Dismiss</Button>
          <Button variant="ghost" title="Global mute — hides this rule everywhere on Today, not just this finding" onClick={() => { store.muteRule(finding.rule, "muted from Today finding card"); onChange(); }}>
            Mute {finding.rule}
          </Button>
        </div>
      </div>
    </Card>
  );
}

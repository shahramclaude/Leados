import { useMemo, useState } from "react";
import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { visibleFindings } from "../lib/engine";
import { analyzeAuditTrail } from "../lib/audit";
import { RULES } from "../data/catalog";
import { buildIndex, parseQuery, runSearch } from "../lib/search";
import { Badge, Card, SectionTitle, SevBadge, Mono } from "../components/primitives";
import { FindingCard } from "./TodayView";
import { navigate, buildExplainLink, buildFindingLink, buildPersonLink, buildPlaybookLink, buildTraceLink, buildDomainLink } from "../lib/router";
import { DOMAINS } from "../data/catalog";
import type { SearchItem } from "../types";

export function DigestView({ P, storeState, refresh }: { P: Projected; storeState: Store; refresh: () => void }) {
  const visible = visibleFindings(P, storeState.meta.mutedRules, storeState.meta.dismissed);
  const top5 = visible.slice(0, 5);
  const summary = analyzeAuditTrail(storeState, P.today, 1);

  return (
    <div>
      <SectionTitle sub={`Generated for ${P.today.toDateString()} · > digest`}>Daily Digest</SectionTitle>
      <Mono className="mb-4">
{`TODAY'S DIGEST
─────────────────────────────────────────────────────────────
${visible.length} active findings · top ${top5.length} shown below
Events logged in last 24h: ${summary.total}
${storeState.meta.mutedRules.length} rule(s) globally muted`}
      </Mono>
      <div className="space-y-2">
        {top5.map((f) => (
          <FindingCard key={f.key} finding={f} onChange={refresh} />
        ))}
      </div>
    </div>
  );
}

export function ReviewView({ P, storeState, refresh }: { P: Projected; storeState: Store; refresh: () => void }) {
  const [step, setStep] = useState(0);
  const visible = visibleFindings(P, storeState.meta.mutedRules, storeState.meta.dismissed);
  const grouped = DOMAINS.map((d) => ({ domain: d, findings: visible.filter((f) => f.domain === d) })).filter((g) => g.findings.length > 0);
  const current = grouped[step];

  return (
    <div>
      <SectionTitle sub="> review — walk every domain with active findings, one at a time.">Weekly Review</SectionTitle>
      {grouped.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">No active findings to review — clean sweep.</Card>
      ) : !current ? (
        <Card className="p-6 text-sm text-emerald-700">Review complete — all {grouped.length} domain(s) walked.</Card>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            Domain {step + 1} of {grouped.length} <Badge tone="violet">#{current.domain}</Badge>
          </div>
          <div className="space-y-2">
            {current.findings.map((f) => (
              <FindingCard key={f.key} finding={f} onChange={refresh} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              ← previous
            </button>
            <button className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700" onClick={() => setStep((s) => s + 1)}>
              Next domain →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchResultsView({ P, storeState, rawQuery }: { P: Projected; storeState: Store; rawQuery: string }) {
  const personIndex = useMemo(() => new Map(storeState.people.map((p) => [p.id, p])), [storeState.people]);
  const index = useMemo(() => buildIndex(P, storeState, RULES, P.today), [P, storeState]);
  const query = useMemo(() => parseQuery(decodeURIComponent(rawQuery)), [rawQuery]);
  const results = useMemo(() => runSearch(query, index, { personIndex, sessionAccessed: new Set() }), [query, index, personIndex]);

  return (
    <div>
      <SectionTitle sub={`#/search/${rawQuery}`}>Search results for "{decodeURIComponent(rawQuery)}"</SectionTitle>
      {results.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">No matches.</Card>
      ) : (
        <div className="space-y-2">
          {results.map((item) => (
            <ResultRow key={idOf(item)} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function idOf(it: SearchItem): string {
  switch (it.type) {
    case "finding": return it.key;
    case "person": return it.id;
    case "event": return it.id;
    case "playbook": return it.id;
    case "rule": return it.id;
    case "domain": return it.name;
  }
}

function ResultRow({ item }: { item: SearchItem }) {
  if (item.type === "finding")
    return (
      <Card className="cursor-pointer p-3" onClick={() => navigate(buildFindingLink(item.rule))}>
        <div className="flex items-center gap-2"><SevBadge sev={item.sev} /><span className="font-mono text-xs text-slate-500">{item.rule}</span></div>
        <div className="mt-1 text-sm text-slate-800">{item.title}</div>
      </Card>
    );
  if (item.type === "person")
    return (
      <Card className="cursor-pointer p-3" onClick={() => navigate(buildPersonLink(item.id))}>
        <div className="text-sm text-slate-800">{item.name} <span className="text-slate-400">· {item.role}</span></div>
      </Card>
    );
  if (item.type === "event")
    return (
      <Card className="cursor-pointer p-3" onClick={() => navigate(buildTraceLink(item.id))}>
        <div className="font-mono text-sm text-violet-700">{item.eventType}</div>
      </Card>
    );
  if (item.type === "playbook")
    return (
      <Card className="cursor-pointer p-3" onClick={() => navigate(buildPlaybookLink(item.id))}>
        <div className="text-sm text-slate-800">{item.title}</div>
      </Card>
    );
  if (item.type === "rule")
    return (
      <Card className="cursor-pointer p-3" onClick={() => navigate(buildExplainLink(item.id))}>
        <div className="font-mono text-sm text-slate-800">{item.id} <span className="font-sans text-slate-500">{item.tag}</span></div>
      </Card>
    );
  return (
    <Card className="cursor-pointer p-3" onClick={() => navigate(buildDomainLink(item.name))}>
      <div className="text-sm text-slate-800">#{item.name} <span className="text-slate-400">({item.findingCount} findings)</span></div>
    </Card>
  );
}

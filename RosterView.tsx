import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { Badge, Card, SectionTitle, SevBadge } from "../components/primitives";
import { navigate, buildPersonLink } from "../lib/router";
import { Sparkline } from "../components/DataWidgets";
import { fmtDateTime } from "../lib/utils";

export function RosterView({ P, storeState, personId }: { P: Projected; storeState: Store; personId?: string }) {
  if (personId) return <Dossier P={P} storeState={storeState} personId={personId} />;

  return (
    <div>
      <SectionTitle sub="Click a name for their dossier — findings, cadence, and raw event history.">Roster</SectionTitle>
      <div className="cq-grid cq-grid-2 cq-grid-3 grid gap-3">
        {storeState.people.map((p) => {
          const findings = P.findings.filter((f) => f.refs.includes(p.id));
          return (
            <Card key={p.id} className="cursor-pointer p-4 hover:border-violet-300" onClick={() => navigate(buildPersonLink(p.id))}>
              <div className="font-medium text-slate-900">{p.name}</div>
              <div className="text-xs text-slate-500">{p.role} · {p.team}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {findings.length === 0 ? (
                  <Badge tone="green">no open findings</Badge>
                ) : (
                  findings.map((f) => <SevBadge key={f.key} sev={f.sev} />)
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Dossier({ P, storeState, personId }: { P: Projected; storeState: Store; personId: string }) {
  const person = storeState.people.find((p) => p.id === personId);
  const findings = P.findings.filter((f) => f.refs.includes(personId));
  const events = storeState.events.filter((e) => e.personId === personId).slice(-30);
  const feedbackByWeek = buildWeeklyCounts(storeState.events.filter((e) => e.type === "feedback.given" && (e.data as any).to === personId));

  if (!person) return <div className="text-sm text-slate-500">Unknown person "{personId}".</div>;

  return (
    <div>
      <button onClick={() => navigate("#/roster")} className="mb-3 text-xs text-violet-600 hover:underline">← back to roster</button>
      <SectionTitle sub={`${person.role} · ${person.team}`}>{person.name}</SectionTitle>

      <Card className="mb-4 p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Feedback cadence (last 12 weeks)</div>
        <Sparkline values={feedbackByWeek} />
      </Card>

      <div className="mb-6">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Findings referencing {person.name}</div>
        {findings.length === 0 ? (
          <div className="text-sm text-slate-500">None.</div>
        ) : (
          findings.map((f) => (
            <Card key={f.key} className="mb-2 p-3">
              <div className="flex items-center gap-2">
                <SevBadge sev={f.sev} />
                <span className="font-mono text-xs text-slate-500">{f.rule}</span>
              </div>
              <div className="mt-1 text-sm text-slate-800">{f.title}</div>
            </Card>
          ))
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Raw event history</div>
        <div className="space-y-1">
          {events.length === 0 && <div className="text-sm text-slate-500">No events recorded for this person.</div>}
          {[...events].reverse().map((e) => (
            <div key={e.id} className="flex justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs">
              <span className="font-mono text-violet-700">{e.type}</span>
              <span className="text-slate-400">{fmtDateTime(e.ts)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildWeeklyCounts(events: { ts: string }[]): number[] {
  const weeks = new Array(12).fill(0);
  const now = Date.now();
  events.forEach((e) => {
    const weeksAgo = Math.floor((now - new Date(e.ts).getTime()) / (7 * 86400000));
    if (weeksAgo >= 0 && weeksAgo < 12) weeks[11 - weeksAgo] += 1;
  });
  return weeks;
}

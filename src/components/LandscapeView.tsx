import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { toProjection } from "../lib/store";
import { buildCompetitiveLandscape } from "../lib/wargame";
import { Card, SectionTitle, Badge, DisclosureNote, SevBadge, EmptyState } from "./ui";
import { fmtMoney, fmtPct, fmtDate } from "../lib/format";

export function LandscapeView({ state }: { state: AppState }) {
  const today = new Date().toISOString();
  const P = useMemo(() => toProjection(state), [state]);
  const landscape = useMemo(() => buildCompetitiveLandscape(P, today), [P, today]);
  const { blueTeam, redTeams, greenTeam } = landscape;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Competitive landscape</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">{landscape.label}</p>
      </div>

      <Card className="border-sky-900/60">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="sky">BLUE TEAM</Badge>
          <h2 className="text-base font-semibold text-zinc-100">{blueTeam.name}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kv k="Runway" v={typeof blueTeam.capabilities.runway === "number" ? `${blueTeam.capabilities.runway.toFixed(1)} mo` : "unknown"} />
          <Kv k="Gross margin" v={fmtPct(blueTeam.capabilities.grossMargin)} />
          <Kv k="Headcount" v={blueTeam.capabilities.headcount} />
          <Kv k="Open roles (90d)" v={blueTeam.capabilities.openRoles} />
          <Kv k="Attrition (60d)" v={blueTeam.capabilities.attritionRisk} />
          <Kv k="Tech debt score" v={blueTeam.capabilities.techDebtScore} />
          <Kv k="Experiments (90d)" v={blueTeam.capabilities.experimentVelocity} />
          <Kv k="Pipeline" v={fmtMoney(blueTeam.capabilities.pipelineValue)} />
          <Kv k="Win rate (90d)" v={fmtPct(blueTeam.capabilities.winRate)} />
          <Kv k="NPS" v={blueTeam.capabilities.nps ?? "—"} />
          <Kv k="Velocity (mean)" v={blueTeam.capabilities.velocity?.toFixed ? blueTeam.capabilities.velocity.toFixed(1) : "—"} />
          <Kv k="Incidents (90d)" v={blueTeam.capabilities.incidentRate} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{blueTeam.patents} patent(s)</Badge>
          <Badge>{blueTeam.partnerships} active partnership(s)</Badge>
        </div>
        {blueTeam.currentObjectives.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Stated objectives</div>
            <ul className="list-inside list-disc text-sm text-zinc-300">
              {blueTeam.currentObjectives.map((o: string, i: number) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        {blueTeam.activeFindings.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Active findings (top 10)</div>
            <div className="flex flex-wrap gap-2">
              {blueTeam.activeFindings.map((f: any) => (
                <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs">
                  {f.title} <SevBadge sev={f.sev} />
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div>
        <SectionTitle sub="One card per distinct name seen in competitor.logged events.">Red teams (competitors)</SectionTitle>
        {redTeams.length === 0 ? (
          <EmptyState>No competitor.logged events yet. Log one in "Log intel" → Competitive intel.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {redTeams.map((red) => (
              <Card key={red.id} className="border-red-900/40">
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone="red">RED TEAM</Badge>
                  <span className="text-xs text-zinc-500">{red.actions.length} logged move(s)</span>
                </div>
                <h3 className="text-base font-semibold text-zinc-100">{red.name}</h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {red.categories.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </div>
                {red.mostRecentAction && (
                  <p className="mt-3 text-sm text-zinc-300">
                    Most recent ({fmtDate(red.mostRecentAction.ts)}): {red.mostRecentAction.data.description}
                  </p>
                )}
                <div className="mt-2 text-xs text-zinc-500">30d action velocity: {red.actionVelocity}</div>
                {red.unansweredActions.length > 0 && (
                  <div className="mt-2 rounded-md border border-amber-900/60 bg-amber-950/20 px-2 py-1 text-xs text-amber-300">
                    {red.unansweredActions.length} move(s) flagged response-needed, unanswered
                  </div>
                )}
                {red.estimatedMovePatterns && (
                  <p className="mt-2 text-xs text-zinc-500">{red.estimatedMovePatterns.estimatedNextMove}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="border-emerald-900/40">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="emerald">GREEN TEAM</Badge>
          <h2 className="text-base font-semibold text-zinc-100">{greenTeam.name}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kv k="Satisfaction (NPS)" v={greenTeam.satisfaction ?? "—"} />
          <Kv k="Churn rate" v={fmtPct(greenTeam.churnRate)} />
          <Kv k="At-risk accounts (30d)" v={greenTeam.atRiskAccounts} />
        </div>
        {greenTeam.topPains.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Top unresolved pains</div>
            <ul className="list-inside list-disc text-sm text-zinc-300">
              {greenTeam.topPains.map((p: string, i: number) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReasonTally title="Win reasons (180d)" tally={greenTeam.winReasons} />
          <ReasonTally title="Loss reasons (180d)" tally={greenTeam.lossReasons} />
        </div>
      </Card>

      <DisclosureNote>
        Red-team "estimated next move" and unanswered-action flags are pattern extrapolations from your own
        competitor.logged history, not confirmed competitor intent. Green-team sentiment figures come only from your
        own cs.* and win.loss.logged events.
      </DisclosureNote>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
      <div className="text-sm font-medium text-zinc-100">{v}</div>
    </div>
  );
}

function ReasonTally({ title, tally }: { title: string; tally: Record<string, number> }) {
  const entries = Object.entries(tally);
  return (
    <div className="rounded-md border border-zinc-800 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500">No data logged.</p>
      ) : (
        <ul className="space-y-1 text-sm text-zinc-300">
          {entries.map(([reason, count]) => (
            <li key={reason} className="flex justify-between">
              <span>{reason}</span>
              <span className="text-zinc-500">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

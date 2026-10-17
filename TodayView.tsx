import type { Projection } from "../lib/types";
import { DOMAINS } from "../lib/types";
import { run } from "../lib/engine";
import { computeLeadershipEnergyBudget } from "../lib/orgPhysics";
import { VelocityWidget } from "./VelocityWidget";
import { Card, SectionTitle, Badge, Stat } from "./ui";

export function TodayView({ P, today }: { P: Projection; today: Date }) {
  const { findings } = run(P, today);
  const energy = computeLeadershipEnergyBudget(P, today);
  const topFindings = findings.slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle eyebrow="Today" title="What's true right now" desc={`As of ${today.toLocaleString()}. Recomputed live from the event log on every load.`} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {DOMAINS.map((d) => (
            <VelocityWidget key={d} domain={d} P={P} today={today} mode="compact" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Active findings" desc="Derived from the log: domain signals inside the 90-day correlation window, stale decisions, overdue commitments, ownerless/silent goals, blocked pipelines." />
          <div className="space-y-2">
            {topFindings.length === 0 && <p className="text-sm text-slate-500">No active findings.</p>}
            {topFindings.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-800">{f.title}</div>
                  <div className="text-xs text-slate-400">
                    {f.rule} · domain: {f.domain}
                  </div>
                </div>
                <Badge color={f.sev >= 4 ? "red" : f.sev === 3 ? "amber" : "slate"}>sev {f.sev}</Badge>
              </div>
            ))}
          </div>
          {findings.length > topFindings.length && <p className="mt-2 text-xs text-slate-400">+{findings.length - topFindings.length} more — see Intelligence.</p>}
        </Card>

        <Card>
          <SectionTitle title="Leadership energy" desc="Part 2, Law 3. Arbitrary units — a planning metaphor, not a measurement." />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Sources (30d)" value={energy.sourceEnergy} sub={`${energy.wins} wins logged`} />
            <Stat label="Drains" value={energy.drainEnergy} sub={`${energy.activeDrains} active drains`} />
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Balance</div>
            <div className={`text-2xl font-bold ${energy.balance > 0 ? "text-emerald-600" : "text-rose-600"}`}>{energy.balance >= 0 ? "+" : ""}{energy.balance}</div>
            <div className="text-sm text-slate-600">{energy.assessment}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

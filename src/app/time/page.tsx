"use client";

import { useEffect, useState } from "react";
import { useActor, useActorFetch } from "./ActorContext";

interface OrgDashboard {
  orgId: string;
  currency: string;
  orgSize: number;
  kAnonymityFloor: number;
  orgMeetsAggregateFloor: boolean;
  totals: { totalCost: number; totalOutcomes: number; totalHours: number };
  weeks: Array<{ week: string; totalCost: number; totalOutcomes: number; totalHours: number; meetingCount: number; outcomeDensityPerHour: number }>;
  teamBreakdown: Array<{ teamId: string; teamName: string; memberCount: number; suppressed: boolean; reason?: string }>;
  method: string[];
}

interface SelfDashboard {
  userId: string;
  name: string;
  chronotype: string;
  timezone: string;
  viewedAsSelf: boolean;
  fragmentation: {
    meetingCount: number;
    totalMeetingMinutes: number;
    contextSwitches: number;
    longestFocusBlockMinutes: number;
    deepWorkPreservedMinutes: number;
    burstScore: number;
  };
  attentionBudget: { targetMinutes: number; preservedMinutes: number; deficitMinutes: number; utilizationPct: number };
  fatigueIndex: number;
  method: string[];
}

export default function TimeDashboardPage() {
  const { actorId } = useActor();
  const actorFetch = useActorFetch();
  const [tab, setTab] = useState<"org" | "self">("org");
  const [org, setOrg] = useState<OrgDashboard | null>(null);
  const [self, setSelf] = useState<SelfDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId) return;
    setError(null);
    if (tab === "org") {
      actorFetch("/api/time-economics/dashboard/org")
        .then((r) => r.json())
        .then((d) => (d.error ? setError(d.error) : setOrg(d)));
    } else {
      actorFetch("/api/time-economics/dashboard/self")
        .then((r) => r.json())
        .then((d) => (d.error ? setError(d.error) : setSelf(d)));
    }
  }, [tab, actorId, actorFetch]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <TabButton active={tab === "org"} onClick={() => setTab("org")}>
          Org Aggregate
        </TabButton>
        <TabButton active={tab === "self"} onClick={() => setTab("self")}>
          My Full Detail (self-view)
        </TabButton>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {tab === "org" && org && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total modeled meeting cost (56d)" value={`${org.currency} ${org.totals.totalCost.toLocaleString()}`} />
            <StatCard label="Total outcomes captured" value={String(org.totals.totalOutcomes)} />
            <StatCard label="Total meeting hours" value={org.totals.totalHours.toFixed(1)} />
          </div>

          <Card title="Weekly cost / outcome-density trend">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Week</th>
                  <th>Meetings</th>
                  <th>Cost</th>
                  <th>Outcomes</th>
                  <th>Outcome density / hr</th>
                </tr>
              </thead>
              <tbody>
                {org.weeks.map((w) => (
                  <tr key={w.week} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium">{w.week}</td>
                    <td>{w.meetingCount}</td>
                    <td>
                      {org.currency} {w.totalCost.toLocaleString()}
                    </td>
                    <td>{w.totalOutcomes}</td>
                    <td>{w.outcomeDensityPerHour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Team breakdown (k-anonymity enforced)">
            <p className="mb-2 text-xs text-slate-500">
              k-anonymity floor: {org.kAnonymityFloor} members. Org size {org.orgSize} {org.orgMeetsAggregateFloor ? "meets" : "does NOT meet"} the floor for org-wide aggregates.
            </p>
            <ul className="space-y-2">
              {org.teamBreakdown.map((t) => (
                <li key={t.teamId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-medium">{t.teamName}</span> — {t.memberCount} member(s).{" "}
                  {t.suppressed ? <span className="text-amber-700">Suppressed: {t.reason}</span> : <span className="text-emerald-700">Metrics available.</span>}
                </li>
              ))}
            </ul>
          </Card>

          <MethodNote lines={org.method} />
        </div>
      )}

      {tab === "self" && self && (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            Showing full individual detail for <strong>{self.name}</strong> ({self.chronotype}, {self.timezone}). This surface is
            self-view-only by default — see the Privacy tab to control who else can ever see it.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <StatCard label="Meetings (24h)" value={String(self.fragmentation.meetingCount)} />
            <StatCard label="Context switches" value={String(self.fragmentation.contextSwitches)} />
            <StatCard label="Longest focus block (min)" value={String(self.fragmentation.longestFocusBlockMinutes)} />
            <StatCard label="Fatigue index (0-1)" value={self.fatigueIndex.toFixed(2)} />
          </div>
          <Card title="Attention budget">
            <p className="text-sm">
              Deep-work preserved: <strong>{self.attentionBudget.preservedMinutes} min</strong> / target {self.attentionBudget.targetMinutes} min (
              {self.attentionBudget.utilizationPct}% utilization, deficit {self.attentionBudget.deficitMinutes} min).
            </p>
          </Card>
          <MethodNote lines={self.method} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="m-0 text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="m-0 mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="m-0 mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function MethodNote({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
      <p className="m-0 mb-1 font-semibold text-slate-700">Method (figures are estimates, not measurements):</p>
      <ul className="m-0 list-disc space-y-1 pl-4">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

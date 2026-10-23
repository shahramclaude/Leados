import Link from "next/link";
import { db } from "@/db";
import { algoSystems } from "@/db/schema";
import { getAllLatestChecks, rollupStatus } from "@/lib/accountability/monitoring";
import { getLatestAssessment } from "@/lib/accountability/assessments";
import {
  ActionTierBadge,
  AssessmentStatusBadge,
  DecisionRoleBadge,
  RegulatoryTierBadge,
  StatusBadge,
} from "@/components/accountability/badges";

export const dynamic = "force-dynamic";

export default async function AccountabilityConsolePage() {
  const systems = await db.select().from(algoSystems).orderBy(algoSystems.systemKey);
  const checks = await getAllLatestChecks();

  const rows = await Promise.all(
    systems.map(async (system) => {
      const systemChecks = checks.filter((c) => c.systemKey === system.systemKey).map((c) => c.status);
      const health = rollupStatus(systemChecks as Array<"pass" | "warn" | "fail">);
      const assessment = await getLatestAssessment(system.systemKey);
      return { system, health, assessment };
    }),
  );

  const counts = {
    total: systems.length,
    automate: systems.filter((s) => s.decisionRole === "automate").length,
    high: systems.filter((s) => s.regulatoryTier === "high").length,
    monitoringIssues: rows.filter((r) => r.health !== "pass").length,
    assessmentGaps: rows.filter((r) => !r.assessment || r.assessment.status !== "approved").length,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Accountability Console</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Every algorithmic system discovered in <code className="rounded bg-slate-100 px-1">src/lib/intelligence</code>{" "}
        is registered here with its risk tier, decision role, human-oversight owner, monitoring health and impact
        assessment status. Registry completeness is CI-enforced — see <code>npm run registry:lint</code>.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Registered systems" value={counts.total} />
        <StatCard label="Automated (T3/T4)" value={counts.automate} tone={counts.automate > 0 ? "warn" : "ok"} />
        <StatCard label="High regulatory tier" value={counts.high} tone={counts.high > 0 ? "warn" : "ok"} />
        <StatCard
          label="Monitoring issues"
          value={counts.monitoringIssues}
          tone={counts.monitoringIssues > 0 ? "bad" : "ok"}
        />
        <StatCard
          label="Assessment gaps"
          value={counts.assessmentGaps}
          tone={counts.assessmentGaps > 0 ? "bad" : "ok"}
        />
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">System</th>
              <th className="px-4 py-3">Affects</th>
              <th className="px-4 py-3">Decision role</th>
              <th className="px-4 py-3">Risk tier</th>
              <th className="px-4 py-3">Oversight owner</th>
              <th className="px-4 py-3">Monitoring</th>
              <th className="px-4 py-3">Impact assessment</th>
              <th className="px-4 py-3">Opt-out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ system, health, assessment }) => (
              <tr key={system.systemKey} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/accountability/registry/${system.systemKey}`} className="font-medium text-slate-900 hover:underline">
                    {system.name}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">{system.systemKey}</div>
                </td>
                <td className="px-4 py-3 capitalize text-slate-700">{system.affectedParties}</td>
                <td className="px-4 py-3">
                  <DecisionRoleBadge role={system.decisionRole} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ActionTierBadge tier={system.actionTier} />
                    <RegulatoryTierBadge tier={system.regulatoryTier} />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{system.oversightOwner}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={health} />
                </td>
                <td className="px-4 py-3">
                  <AssessmentStatusBadge status={assessment?.status ?? "missing"} />
                  {assessment ? <div className="mt-1 text-xs text-slate-500">v{assessment.version}</div> : null}
                </td>
                <td className="px-4 py-3">
                  {system.optOutAllowed ? (
                    <span className="text-emerald-700">Allowed</span>
                  ) : (
                    <span className="text-rose-700">Not permitted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatCard({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const toneClass = tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

import Link from "next/link";
import { getCockpitSummary } from "@/lib/queries";
import { Card, Badge, fmtDate, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const summary = await getCockpitSummary();

  const statusMap = Object.fromEntries(summary.decisionStatusCounts.map((s) => [s.status, s.count]));
  const severityMap = Object.fromEntries(summary.openSignalCounts.map((s) => [s.severity, s.count]));

  return (
    <div>
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">Executive cockpit</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Leadership operating picture
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          A single pane of glass across decision governance, early-warning signals, operating cadence,
          autonomous agents, and leader state.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open decisions" value={summary.openDecisions} href="/decisions" tone="indigo" />
        <Stat label="Critical signals" value={summary.criticalSignals} href="/signals" tone="rose" />
        <Stat label="Upcoming rituals" value={summary.upcomingCadence.length} href="/cadence" tone="emerald" />
        <Stat label="Agent runs logged" value={summary.recentRuns.length} href="/agents" tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Decisions by status
          </h2>
          <div className="space-y-2">
            {["proposed", "under_review", "committed", "reversed"].map((status) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <Badge label={status} />
                <span className="font-mono text-slate-300">{statusMap[status] ?? 0}</span>
              </div>
            ))}
          </div>
          <Link href="/decisions" className="mt-4 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300">
            View decision log →
          </Link>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Open signals by severity
          </h2>
          <div className="space-y-2">
            {["critical", "high", "medium", "low"].map((sev) => (
              <div key={sev} className="flex items-center justify-between text-sm">
                <Badge label={sev} />
                <span className="font-mono text-slate-300">{severityMap[sev] ?? 0}</span>
              </div>
            ))}
          </div>
          <Link href="/signals" className="mt-4 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300">
            View sensing board →
          </Link>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Upcoming cadence
          </h2>
          {summary.upcomingCadence.length === 0 ? (
            <EmptyState message="No scheduled rituals." />
          ) : (
            <ul className="space-y-3 text-sm">
              {summary.upcomingCadence.map((meeting) => (
                <li key={meeting.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-200">{meeting.title}</p>
                    <p className="text-xs text-slate-500">{fmtDate(meeting.nextOccurrence)}</p>
                  </div>
                  <Badge label={meeting.type} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/cadence" className="mt-4 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300">
            View cadence board →
          </Link>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent decisions
          </h2>
          {summary.recentDecisions.length === 0 ? (
            <EmptyState message="No decisions logged yet." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {summary.recentDecisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                  <Link href={`/decisions/${d.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100 hover:text-indigo-300">{d.title}</p>
                    <p className="text-xs text-slate-500">Owner: {d.ownerName ?? "Unassigned"}</p>
                  </Link>
                  <Badge label={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent agent runs
          </h2>
          {summary.recentRuns.length === 0 ? (
            <EmptyState message="No autonomous agent runs yet." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {summary.recentRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{run.name}</p>
                    <p className="truncate text-xs text-slate-500">{run.summary || "—"}</p>
                  </div>
                  <Badge label={run.status} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/agents" className="mt-4 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300">
            View agent kernel →
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: "indigo" | "rose" | "emerald" | "amber";
}) {
  const toneClasses: Record<string, string> = {
    indigo: "from-indigo-500/20 to-indigo-500/0 text-indigo-300",
    rose: "from-rose-500/20 to-rose-500/0 text-rose-300",
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-300",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-300",
  };
  return (
    <Link
      href={href}
      className={`block rounded-2xl border border-slate-800 bg-gradient-to-br p-5 transition hover:border-slate-700 ${toneClasses[tone]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </Link>
  );
}

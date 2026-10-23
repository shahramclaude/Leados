import Link from "next/link";
import { db } from "@/db";
import { decisions, signals, people } from "@/db/schema";
import { desc } from "drizzle-orm";
import Badge from "@/components/Badge";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const [allDecisions, allSignals, allPeople] = await Promise.all([
    db.select().from(decisions).orderBy(desc(decisions.createdAt)),
    db.select().from(signals).orderBy(desc(signals.detectedAt)),
    db.select().from(people),
  ]);

  const openDecisions = allDecisions.filter((d) => d.status !== "archived" && d.status !== "committed");
  const committedDecisions = allDecisions.filter((d) => d.status === "committed");
  const activeSignals = allSignals.filter((s) => s.status === "active");
  const criticalSignals = activeSignals.filter((s) => s.severity === "critical" || s.severity === "high");

  const recentDecisions = allDecisions.slice(0, 5);
  const recentSignals = allSignals.slice(0, 5);

  const stats = [
    { label: "Open Decisions", value: openDecisions.length, href: "/decisions", tone: "text-indigo-600" },
    { label: "Committed Decisions", value: committedDecisions.length, href: "/decisions", tone: "text-emerald-600" },
    { label: "Active Signals", value: activeSignals.length, href: "/signals", tone: "text-amber-600" },
    { label: "High/Critical Signals", value: criticalSignals.length, href: "/signals", tone: "text-rose-600" },
    { label: "People Tracked", value: allPeople.length, href: "/people", tone: "text-slate-700" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.1em] text-indigo-600">Executive Cockpit</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Command Center Overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          A single pane for decision governance, early-warning signals, and org visibility — the
          operating core of LEADOS.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${stat.tone}`}>{stat.value}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Recent Decisions</h2>
            <Link href="/decisions" className="text-sm font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {recentDecisions.length === 0 ? (
            <p className="text-sm text-slate-500">No decisions logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentDecisions.map((decision) => (
                <li key={decision.id}>
                  <Link
                    href={`/decisions/${decision.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{decision.title}</p>
                      <p className="text-xs text-slate-500">
                        {decision.owner} · due {formatDate(decision.dueDate)}
                      </p>
                    </div>
                    <Badge value={decision.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Recent Signals</h2>
            <Link href="/signals" className="text-sm font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {recentSignals.length === 0 ? (
            <p className="text-sm text-slate-500">No signals detected yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentSignals.map((signal) => (
                <li
                  key={signal.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{signal.title}</p>
                    <p className="text-xs text-slate-500">
                      {signal.category} · {signal.source} · {formatDate(signal.detectedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={signal.severity} />
                    <Badge value={signal.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

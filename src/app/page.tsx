import Link from "next/link";
import { getDashboardSummary } from "@/lib/app/useCases/dashboard/getDashboardSummary";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const summary = await getDashboardSummary();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">
        Autonomous leadership-intelligence operating system
      </p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
        LEADOS
      </h1>
      <p className="mt-4 max-w-2xl text-base text-slate-700">
        Part 00 baseline: organizations and leaders are persisted in Postgres through a repository
        layer, leadership readiness is computed by a pure domain engine, and every state change is
        recorded to an append-only event log.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <StatCard label="Organizations" value={summary.organizationCount} href="/organizations" />
        <StatCard label="Leaders" value={summary.leaderCount} href="/leaders" />
        <StatCard label="Events recorded" value={summary.recentEvents.length} suffix=" (latest 10)" />
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-950">Recent event log</h2>
        <p className="mt-1 text-sm text-slate-600">
          Append-only history written by every use case in <code>src/lib/app/useCases</code>.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {summary.recentEvents.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No events yet. Create an organization and register a leader to populate this log.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.recentEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between px-6 py-4 text-sm">
                  <span className="font-medium text-slate-900">{event.eventType}</span>
                  <span className="text-slate-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  href,
  suffix,
}: {
  label: string;
  value: number;
  href?: string;
  suffix?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">
        {value}
        {suffix ? <span className="text-base font-normal text-slate-500">{suffix}</span> : null}
      </p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

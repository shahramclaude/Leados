import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="min-h-screen px-6 py-12">
      <section className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS — Part 18</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Production maturity: observability, SLOs &amp; runbooks
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Structured logging, a composite health model, a Prometheus metrics registry, a durable work
          queue with dead-letter handling, a hash-chained audit log, and backup/restore drills — all
          backed by real Postgres state, not fixtures. See{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">docs/adr/0003-part18-scope-given-upstream-inconsistency.md</code>{" "}
          for why this tree, not the upstream repo&apos;s ~300-route app, is canonical.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NavCard href="/health" title="Health" desc="Composite status, drill-downs, remediation hints." />
          <NavCard href="/api/metrics" title="Metrics" desc="Prometheus exposition (RED, queue, automation, forecast)." />
          <NavCard href="/api/automation/runs" title="Automation runs" desc="The scheduled-job ledger." />
          <NavCard href="/api/scheduler/dead-letter" title="Dead letters" desc="Jobs that exhausted retries." />
          <NavCard href="/api/audit" title="Audit log" desc="Hash-chained, append-only." />
          <NavCard href="/api/debug/traces" title="Recent traces" desc="Sampled spans (10% + all slow/error)." />
        </div>
      </section>
    </main>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-slate-400 hover:bg-slate-50">
      <p className="m-0 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{desc}</p>
    </Link>
  );
}

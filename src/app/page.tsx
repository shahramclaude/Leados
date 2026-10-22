import { db } from "@/db";
import { sql } from "drizzle-orm";
import { GrcNav } from "@/components/GrcNav";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/" />
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 29</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Quantified Risk &amp; GRC Engine
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-700">
          A quantified risk register (inherent vs residual, Monte Carlo loss distributions with
          documented correlation assumptions), a tested control library backed by an immutable
          evidence chain, an obligation/policy lifecycle tracker with a DST-safe deadline engine, and
          a risk-appetite breach pipeline feeding Findings. Every &ldquo;compliant&rdquo; status shown
          anywhere in this module carries an evidence reference — never a bare green checkmark.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            href="/risk"
            title="Risk Register"
            body="Inherent/residual distributions with credible intervals, bow-tie scenario view, control linkage."
          />
          <Card
            href="/controls"
            title="Control Assurance"
            body="Test schedule, Beta effectiveness beliefs, overdue-test highlighting, evidence-linked status."
          />
          <Card
            href="/obligations"
            title="Obligation Calendar"
            body="Regulatory/contractual deadlines, DST-safe cadence engine, breach escalation ladder."
          />
          <Card
            href="/appetite"
            title="Appetite Dashboard"
            body="Actual vs appetite thresholds with explained breaches, linked to raised Findings."
          />
          <Card
            href="/board-report"
            title="Board Risk Report"
            body="One exportable pack: top risks, portfolio VaR/TVaR, correlation sensitivity, control and obligation health."
          />
        </div>
        <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Honesty notice:</strong> risk figures are modelled distributions with intervals, not
          certainties. Where evidence is thin the intervals are deliberately wide. See each page's
          caveats for correlation/tail-dependence and evidence-strength disclosures.
        </div>
      </section>
    </main>
  );
}

function Card({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-400 hover:bg-white"
    >
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </Link>
  );
}

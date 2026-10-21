import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dbOk = await db
    .execute(sql`select 1`)
    .then(() => true)
    .catch(() => false);

  const steps = [
    { href: "/onboarding", title: "1. Onboarding", body: "Create a tenant and receive an API key." },
    { href: "/capture", title: "2. Capture", body: "Capture a lead, with offline-write sync." },
    { href: "/findings", title: "3. Finding", body: "Score confidence with Beta-Bernoulli updating + hysteresis status." },
    { href: "/decisions", title: "4. Decision", body: "Record pursue / watch / discard with a rationale." },
    { href: "/approvals", title: "5. Approval", body: "Approve or reject the decision." },
    { href: "/automation", title: "6. Automation run", body: "Reproducible Monte Carlo forecast." },
    { href: "/board-pack", title: "7. Board pack export", body: "Aggregate everything into an exportable pack." },
  ];

  return (
    <main>
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.08)] dark:bg-slate-900">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400">LEADOS · Part 15</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950 dark:text-white">
          The golden journey, end to end
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700 dark:text-slate-300">
          Database:{" "}
          <span
            data-testid="db-status"
            className={dbOk ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}
          >
            {dbOk ? "connected" : "unreachable"}
          </span>
          . Press <kbd className="rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-600">⌘K</kbd> anywhere to
          navigate without a mouse.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{step.title}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{step.body}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

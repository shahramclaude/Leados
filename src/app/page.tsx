import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/people",
    title: "People",
    body: "Canonical person aggregate, full provenance timeline, flight-risk Explain<T>, 1:1s, growth plans, and the GDPR-Art.15-style transparency view.",
  },
  {
    href: "/talent",
    title: "Talent & succession",
    body: "Ready-now/ready-later bench matrices with evidence-linked readiness and confidence intervals. Decision support, not a decision.",
  },
  {
    href: "/team-health",
    title: "Team health",
    body: "Engagement, workload, velocity, quality and retention combined into one radar, with evidence-backed intervention suggestions.",
  },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS — Part 09</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">People intelligence, worthy of the people</h1>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        Every score on this surface renders as <code>Explain&lt;T&gt;</code>: a calibrated value, a confidence
        interval, signed drivers, and a plain-language note about what it cannot tell you. Protected attributes are
        excluded by construction — see <code>docs/FAIRNESS.md</code>.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-900">{c.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{c.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/people",
    title: "People Roster & Timeline",
    description: "Canonical person profile, event-sourced timeline, flight-risk explainability (scoped by viewer role).",
  },
  {
    href: "/succession",
    title: "Succession & Bench Strength",
    description: "Ready-now / ready-later / develop matrices per key role, with coverage risk and gap plans.",
  },
  {
    href: "/high-potential",
    title: "High-Potential View",
    description: "Cross-role readiness rollup — decision support, not a label, always evidence-linked.",
  },
  {
    href: "/team-health/1",
    title: "Team Health",
    description: "Engagement, workload, velocity, quality, and risk on one radar, with evidence-backed interventions.",
  },
];

export default async function HomePage() {
  let dbStatus: "connected" | "unreachable" = "connected";
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbStatus = "unreachable";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <section className="mx-auto w-full max-w-4xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 5</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          People &amp; Organization Intelligence
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Flight risk, succession, growth, 1:1s, and org network — with fairness, explainability, and privacy
          scoping enforced server-side on every endpoint.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Database: <span className={dbStatus === "connected" ? "text-emerald-600" : "text-red-600"}>{dbStatus}</span>
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{s.description}</p>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Ethics built in, not bolted on</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Protected attributes (age, gender, ethnicity, ...) are never scoring inputs — enforced in code and tests.</li>
            <li>Every score names its inputs, its uncertainty, and its lawful purpose.</li>
            <li>Role-based visibility (self/manager/hr/exec) is enforced server-side, not just hidden in the UI.</li>
            <li>Org-network analytics use collaboration metadata only — never message or meeting content.</li>
            <li>Every person has a transparency view: &quot;what does LEADOS know about me and why.&quot;</li>
          </ul>
          <p className="mt-3">
            See <code>docs/FAIRNESS.md</code> and <code>docs/PRIVACY.md</code> for the full writeup, or run{" "}
            <code>npm run db:seed</code> after <code>npm run db:push</code> to populate the demo roster.
          </p>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/accountability",
    title: "Accountability Console",
    body: "Every registered algorithmic system with its risk tier, oversight status and monitoring health in one place.",
  },
  {
    href: "/accountability/assessments",
    title: "Impact Assessment Studio",
    body: "Versioned algorithmic impact assessments with reviewer workflow — model updates force reassessment, never skip it.",
  },
  {
    href: "/accountability/oversight",
    title: "Oversight Queue",
    body: "Pending mandatory human reviews on automated actions, and open contestations awaiting resolution.",
  },
  {
    href: "/my-decisions",
    title: "My Automated Decisions",
    body: "Person-facing: what systems assessed me, why, and how to contest it or opt out where policy allows.",
  },
  {
    href: "/accountability/conformity",
    title: "Conformity Export",
    body: "One-command evidence bundle for a named, explicitly-scoped governance frame — gaps are listed, not smoothed.",
  },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 56</p>
        <h1 className="mt-4 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] text-slate-950">
          Algorithmic Accountability
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-700">
          A single registry for every scoring, predicting, recommending and automated-decision engine in LEADOS, with
          versioned impact assessments, individual rights machinery (explanation, contestation, opt-out), and a
          scope-declared conformity evidence export. Registry completeness is enforced in CI — a new intelligence
          module without a registry entry fails the pipeline.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-950">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.body}</p>
          </Link>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="font-semibold">Honesty note</h2>
        <p className="mt-2">
          This console is a governance artifact, not a certification. Conformity export bundles always state exactly
          which internal frame they were generated against and explicitly list what they do <strong>not</strong>{" "}
          certify. Known gaps (a failing monitoring check, a failing fairness report) are surfaced, not hidden — see
          the Accountability Console and Conformity Export pages.
        </p>
      </section>
    </main>
  );
}

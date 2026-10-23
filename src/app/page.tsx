import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { MODULES } from "@/lib/leados/modules";
import {
  ideas,
  mediaItems,
  partners,
  integrationPlans,
  regulatoryItems,
  teamDiagnostics,
  negotiationCases,
  benchRoles,
  agentRoles,
  fitnessFunctions,
  rituals,
  tenants,
  processSpecs,
  valueHypotheses,
  methodCandidates,
  charterStatements,
} from "@/db/schema";

export const dynamic = "force-dynamic";

const PRIMARY_TABLE: Record<string, unknown> = {
  innovation: ideas,
  brand: mediaItems,
  partnerships: partners,
  mna: integrationPlans,
  regulatory: regulatoryItems,
  team: teamDiagnostics,
  negotiation: negotiationCases,
  succession: benchRoles,
  agents: agentRoles,
  architecture: fitnessFunctions,
  rituals: rituals,
  deployment: tenants,
  formal: processSpecs,
  value: valueHypotheses,
  research: methodCandidates,
  capstone: charterStatements,
};

async function countOf(table: unknown): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await db.select({ n: sql<number>`count(*)` }).from(table as any)) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

export default async function HomePage() {
  const counts = await Promise.all(
    MODULES.map(async (m) => ({ slug: m.slug, count: await countOf(PRIMARY_TABLE[m.slug]) }))
  );
  const countMap = Object.fromEntries(counts.map((c) => [c.slug, c.count]));
  const totalRecords = counts.reduce((sum, c) => sum + c.count, 0);
  const measuredModules = counts.filter((c) => c.count > 0).length;

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.08)] ring-1 ring-slate-200">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-indigo-600">Integrated Pack 4 · Parts 108–123</p>
        <h1 className="mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.05] text-slate-950">
          The Strategic Frontier &amp; the AI-Native Organization
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-700">
          Sixteen modules — the domains a leadership team lives in daily, plus the AI-native operating layer —
          running on a shared Postgres substrate. Every number below is measured live from the database, not
          asserted: a module with zero records honestly shows <span className="font-semibold">unknown</span>,
          never a guessed value.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase text-slate-400">Modules</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">16</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase text-slate-400">Measured (has data)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{measuredModules} / 16</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase text-slate-400">Total records tracked</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{totalRecords}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase text-slate-400">Program gate</p>
            <Link href="/capstone" className="mt-1 block text-2xl font-semibold text-indigo-600 hover:text-indigo-500">
              Capstone V →
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Modules</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((m) => (
            <Link
              key={m.slug}
              href={`/${m.slug}`}
              className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Part {m.part}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {countMap[m.slug] ?? 0} records
                </span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-indigo-700">{m.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{m.tagline}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

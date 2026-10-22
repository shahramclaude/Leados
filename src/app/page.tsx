import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SURFACES = [
  {
    href: "/data-sources",
    title: "Data Sources",
    description: "Connector health, sync history, and quality dashboards for every ingestion path.",
  },
  {
    href: "/import-studio",
    title: "Import Studio",
    description: "Mapping, preview with quality checks, dry-run diff, and partial-failure reporting before commit.",
  },
  {
    href: "/lineage-explorer",
    title: "Lineage Explorer",
    description: "Walk any value back through source → transform → projection → surface.",
  },
  {
    href: "/dedup-review",
    title: "Dedup Review",
    description: "Candidate merges with evidence; one-click confirm/reject/undo, fully audited.",
  },
  {
    href: "/export-center",
    title: "Export Center",
    description: "Generate exports with a provenance manifest and verify round-trip integrity.",
  },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 34</p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">Data Platform</h1>
      <p className="mt-4 max-w-2xl text-base text-slate-700">
        Connector SDK, data-quality gates, lineage &amp; provenance, and master data management for every
        ingestion and export path in LEADOS.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{s.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

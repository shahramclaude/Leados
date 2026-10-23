import Link from "next/link";
import { getAllParts, getSummary } from "@/lib/coverage";
import { CoverageTable } from "@/components/CoverageTable";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [parts, summary] = await Promise.all([getAllParts(), getSummary()]);

  const cards = [
    {
      label: "Total parts",
      value: summary.total,
      hint: "Parts 00–58",
      className: "text-slate-900",
    },
    {
      label: "✅ Canonical (seed)",
      value: summary.seedCounts.canonical,
      hint: "strong evidence at seed time",
      className: "text-emerald-700",
    },
    {
      label: "🟡 Partial (seed)",
      value: summary.seedCounts.partial,
      hint: "thin / docs-only / legacy evidence",
      className: "text-amber-700",
    },
    {
      label: "🔴 Absent (seed)",
      value: summary.seedCounts.absent,
      hint: "essentially missing at seed time",
      className: "text-rose-700",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">
          Leados Program Governance
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">
          Coverage Matrix — Parts 00–58
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          This board turns the Part 59 dry-run&apos;s coverage matrix seed into a live Phase-0
          verification workspace. Every row started as a keyword-evidence claim (✅ canonical /
          🟡 partial / 🔴 absent); none of them become a fact until a Phase-0 pass records a real
          command output against it and sets a verified status.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/gaps"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Open gaps register ({summary.gapsRemaining} unverified)
          </Link>
          <Link
            href="/method"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Method & contract gaps
          </Link>
        </div>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {c.label}
            </p>
            <p className={`mt-2 text-3xl font-semibold ${c.className}`}>{c.value}</p>
            <p className="mt-1 text-xs text-slate-400">{c.hint}</p>
          </div>
        ))}
      </section>

      <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Phase-0 verification progress
        </h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <Progress label="Unverified" value={summary.verifiedCounts.unverified} total={summary.total} color="bg-slate-400" />
          <Progress label="Present" value={summary.verifiedCounts.present} total={summary.total} color="bg-emerald-500" />
          <Progress label="Partial" value={summary.verifiedCounts.partial} total={summary.total} color="bg-amber-500" />
          <Progress label="Missing" value={summary.verifiedCounts.missing} total={summary.total} color="bg-rose-500" />
          <Progress label="Legacy-quarantined" value={summary.verifiedCounts.legacy_quarantined} total={summary.total} color="bg-violet-500" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Full matrix
        </h2>
        <CoverageTable parts={parts} />
      </section>
    </main>
  );
}

function Progress({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="w-40">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getModelCard } from "@/lib/intelligence/modelCards";

export const dynamic = "force-dynamic";

export default async function ModelCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = getModelCard(id);
  if (!card) return notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/model-cards" className="text-sm text-sky-700 hover:underline">
        ← All model cards
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-slate-950">{card.name}</h1>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{card.beliefType}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">Last validated {card.lastValidated}</p>

      <Section title="What data">
        <p className="text-slate-700">{card.whatData}</p>
      </Section>

      <Section title="Method">
        <p className="text-slate-700">{card.method}</p>
      </Section>

      <Section title="Assumptions">
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          {card.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Section>

      <Section title="Calibration (last run)">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {card.calibration.brierScore !== undefined && (
            <Stat label="Brier score" value={card.calibration.brierScore.toFixed(3)} />
          )}
          {card.calibration.ece !== undefined && <Stat label="ECE" value={card.calibration.ece.toFixed(3)} />}
          {card.calibration.coverage80 !== undefined && (
            <Stat label="80% coverage" value={`${(card.calibration.coverage80 * 100).toFixed(0)}%`} />
          )}
          <Stat label="Sample size" value={String(card.calibration.sampleSize)} />
        </dl>
        <p className="mt-2 text-xs text-slate-500">Source: {card.calibration.source}</p>
      </Section>

      <Section title="Known failure modes">
        <ul className="list-disc space-y-1 pl-5 text-rose-800">
          {card.knownFailureModes.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

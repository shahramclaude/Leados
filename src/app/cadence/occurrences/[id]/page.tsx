import Link from "next/link";
import AgendaClient from "./AgendaClient";

export const dynamic = "force-dynamic";

export default async function OccurrenceAgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/cadence" className="text-sm text-indigo-600 hover:underline">
          ← Rhythm Board
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Agenda View</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ranked, evidence-linked agenda. Every item carries a &quot;why on agenda&quot; line that passed the
          zero-filler lint before it was persisted.
        </p>
        <AgendaClient occurrenceId={id} />
      </div>
    </main>
  );
}

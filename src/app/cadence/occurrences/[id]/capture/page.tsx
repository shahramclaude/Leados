import Link from "next/link";
import CaptureClient from "./CaptureClient";

export const dynamic = "force-dynamic";

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href={`/cadence/occurrences/${id}`} className="text-sm text-indigo-600 hover:underline">
          ← Agenda
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">After-Ritual Capture</h1>
        <p className="mt-1 text-sm text-slate-600">
          Decisions made, actions with owners, open questions — three typed entities, no free-text-only minutes.
        </p>
        <CaptureClient occurrenceId={id} />
      </div>
    </main>
  );
}

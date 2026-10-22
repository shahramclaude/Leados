import CadenceBoardClient from "./CadenceBoardClient";

export const dynamic = "force-dynamic";

export default function CadencePage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 25</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Rhythm Board</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Org-wide calendar of rituals: on-track / skipped / degraded health, quorum status, and generated
            artifacts. The cadence graph is data (see <code>/api/cadence/graph</code>), not hard-coded cron —
            each ritual&apos;s next occurrence is computed timezone-correctly and created idempotently by{" "}
            <code>POST /api/cadence/tick</code>.
          </p>
        </header>
        <CadenceBoardClient />
      </div>
    </main>
  );
}

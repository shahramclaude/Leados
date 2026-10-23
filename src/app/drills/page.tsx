import DrillsClient from "./DrillsClient";

export default function DrillsPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-[0.08em] text-slate-600">Crisis drill tooling</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Org-level crisis drills</h1>
        <p className="mt-2 text-sm text-slate-700">
          Injects run against the real system (same code paths as production), not a simulation — a genuine bug will
          surface here exactly as it would in a real crisis.
        </p>
        <div className="mt-6">
          <DrillsClient />
        </div>
      </div>
    </main>
  );
}

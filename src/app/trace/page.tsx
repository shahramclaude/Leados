import TraceSearch from "./TraceSearch";

export default function TracePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-950">Explain this correlationId</h1>
      <p className="mt-2 text-sm text-slate-600">
        Every API response includes an <code className="rounded bg-white px-1">x-correlation-id</code>{" "}
        header. Paste it below to reconstruct the end-to-end trace — API call, orchestrator span,
        agent run, queue jobs, notifications, and audit events — in time order.
      </p>
      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <TraceSearch />
      </div>
      <p className="mt-6 text-xs text-slate-400">
        Tip: run <code className="rounded bg-slate-200 px-1">POST /api/demo/run</code> to generate a
        full sample trace, then copy the <code className="rounded bg-slate-200 px-1">correlationId</code>{" "}
        from the response.
      </p>
    </main>
  );
}

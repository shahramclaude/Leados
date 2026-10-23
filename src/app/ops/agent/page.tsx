import AgentConsole from "./AgentConsole";

export const dynamic = "force-dynamic";

export default function AgentOpsPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 58</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Autonomous Executive Agent Kernel</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-700">
            Planner → PolicyGate → Executor (saga) → Critic, with bounded replanning, durable provenance, and a
            human approval queue for Tier-3/4 actions. Execution is queued and driven by a background worker —
            this console only reads/writes state, it never runs a plan inline.
          </p>
        </header>
        <AgentConsole />
      </div>
    </main>
  );
}

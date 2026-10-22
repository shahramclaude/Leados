import { DemoDisabledError, ensureDemoOrg } from "@/lib/demo";
import { Console } from "@/app/console";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let demo: { orgId: number; agentId: number; apiKey: string };
  try {
    demo = await ensureDemoOrg();
  } catch (err) {
    if (err instanceof DemoDisabledError) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-16">
          <h1 className="text-2xl font-semibold text-slate-950">LEADOS</h1>
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Demo tenant seeding is disabled (<code>LEADOS_DISABLE_DEMO=1</code>). This build has no real
            authentication system yet (see FEATURES.md), so there is no other way to reach the console. The
            JSON API surfaces under <code>/api/*</code> still work for any org/API key you provision directly in
            the database.
          </p>
        </main>
      );
    }
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">LEADOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Governed lead intelligence console</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Every score carries a confidence band and basis. Every agent action is tier-gated, budget-metered, and
          written to an immutable event log. Nothing here is a live external LLM call — drafting is a local,
          deterministic template so the language-policy and uncertainty pipeline can be demonstrated without a
          third-party API key.
        </p>
      </header>
      <Console orgId={demo.orgId} agentId={demo.agentId} apiKey={demo.apiKey} />
    </main>
  );
}

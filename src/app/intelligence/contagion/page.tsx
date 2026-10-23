import { db } from "@/db";
import { contagionScenarios } from "@/db/schema";
import { ContagionSimulator } from "@/components/ContagionSimulator";

export const dynamic = "force-dynamic";

export default async function ContagionMapPage() {
  const scenarios = await db.select().from(contagionScenarios);

  if (scenarios.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
        No contagion scenarios seeded yet. Run <code>npm run db:seed</code>.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Contagion Map</h2>
        <p className="mt-2 text-sm text-slate-600">
          Independent-cascade network simulation over the extended value chain, with a correlated-shock
          extension for systemic scenarios. Every output is a <strong>model estimate with a wide interval</strong>,
          never a forecast of fact. Adjust the sliders to see how sensitive the headline exposure number is to
          the underlying assumptions — sensitivity is reported on every run, not just this interactive view.
        </p>
      </section>

      <ContagionSimulator
        scenarios={scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          description: s.description,
          defaultParams: s.defaultParams,
        }))}
      />
    </div>
  );
}

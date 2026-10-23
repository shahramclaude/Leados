import { db } from "@/db";
import { orgProfiles } from "@/db/schema";
import { PeerBenchmarkExplorer } from "@/components/PeerBenchmarkExplorer";

export const dynamic = "force-dynamic";

export default async function BenchmarkViewPage() {
  const orgs = await db.select().from(orgProfiles);
  const selfOrg = orgs.find((o) => o.isSelf);

  if (orgs.length === 0 || !selfOrg) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
        No org profiles seeded yet. Run <code>npm run db:seed</code>.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Benchmark View</h2>
        <p className="mt-2 text-sm text-slate-600">
          Percentile positioning against a transparent, editable peer group. Peers are selected by a
          deterministic k-nearest-neighbor similarity method over declared features — never hand-picked to
          flatter. Below a minimum sample size, percentiles are withheld rather than fabricated.
        </p>
      </section>

      <PeerBenchmarkExplorer
        orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
        defaultOrgId={selfOrg.id}
      />
    </div>
  );
}

import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { SYSTEM_BLIND_SPOTS } from "@/lib/assurance/blindSpots";
import { AssuranceNav } from "@/app/assurance/_components/AssuranceNav";

export const dynamic = "force-dynamic";

export default function BlindSpotsPage() {
  const totalPerCheck = CHECK_REGISTRY.reduce((a, c) => a + c.blindSpots.length, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 38</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Blind Spots</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          An honest, standing inventory of what this assurance system <strong>cannot</strong> see — maintained as
          data (not a one-off document) so it stays current as checks are added or removed. Every check in the
          registry is required to declare blind spots; a check without any fails review.
        </p>
        <AssuranceNav active="/assurance/blindspots" />

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            System-level blind spots ({SYSTEM_BLIND_SPOTS.length})
          </h2>
          <div className="space-y-4">
            {SYSTEM_BLIND_SPOTS.map((spot) => (
              <div key={spot.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">{spot.domain}{spot.relatedPart ? ` · ${spot.relatedPart}` : ""}</p>
                <h3 className="mt-1 font-semibold text-slate-950">{spot.description}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Why this is unavoidable: </span>
                  {spot.whyUnavoidable}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Mitigation: </span>
                  {spot.mitigation}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Per-check blind spots ({totalPerCheck} across {CHECK_REGISTRY.length} checks)
          </h2>
          <div className="space-y-4">
            {CHECK_REGISTRY.map((check) => (
              <div key={check.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">{check.domain} · {check.relatedPart}</p>
                <h3 className="mt-1 font-semibold text-slate-950">{check.name}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {check.blindSpots.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

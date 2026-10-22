import { listPrograms, listInterventions } from "@/lib/change/repository";
import { InterventionLabClient } from "./_components/InterventionLabClient";

export const dynamic = "force-dynamic";

export default async function InterventionLabPage() {
  const [programs, interventions] = await Promise.all([listPrograms(), listInterventions()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Intervention Lab</h2>
        <p className="mt-1 text-sm text-slate-500">
          Design a stepped-wedge rollout, declare an expected effect as a hypothesis, then run the estimator against
          observed adoption-proxy data and compare result vs expectation.
        </p>
      </div>
      <InterventionLabClient programs={programs} initialInterventions={interventions} />
    </div>
  );
}

import "@/lib/kernel/bootstrap";
import { createPlan, recordDryRunForPlan, runCycle, hasDryRunRecord, computePlanType } from "@/lib/kernel/orchestrator";
import { demoFullCyclePlan, incidentResponsePlan, weeklyBriefingPlan } from "@/lib/kernel/planTypes";
import type { StepTemplate } from "@/lib/kernel/orchestrator";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

const TEMPLATES: Record<string, (body: Record<string, unknown>) => StepTemplate[]> = {
  "weekly-briefing": (body) => weeklyBriefingPlan(String(body.domain ?? "org")),
  "incident-response": (body) => incidentResponsePlan(String(body.domain ?? "org"), String(body.findingId ?? "unknown")),
  "demo-full-cycle": (body) => demoFullCyclePlan(String(body.domain ?? "org"), { forceVerifyFailure: Boolean(body.forceVerifyFailure) }),
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const template = String(body.template ?? "");
  const builder = TEMPLATES[template];
  if (!builder) {
    return Response.json({ error: `Unknown plan template "${template}". Known: ${Object.keys(TEMPLATES).join(", ")}` }, { status: 400 });
  }

  const domain = String(body.domain ?? "org");
  const dryRun = body.dryRun !== false; // default true: simulate-before-act
  const actor: Actor = { kind: "agent", id: "api:autonomous-run" };
  const steps = builder(body);

  if (!dryRun) {
    const planType = computePlanType(steps);
    if (!(await hasDryRunRecord(planType))) {
      return Response.json(
        { error: "This plan type has no recorded dry-run yet. The kernel refuses the first live execution of any plan type without one. POST with dryRun:true first." },
        { status: 412 },
      );
    }
  }

  const plan = await createPlan({ goal: String(body.goal ?? template), domain, steps, dryRun, actor });
  if (dryRun) await recordDryRunForPlan(plan.planId, actor);
  const result = await runCycle(plan.planId, { actor });

  return Response.json({ planId: plan.planId, planType: plan.planType, dryRun, result });
}

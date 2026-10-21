// Built-in plan templates used by the scheduler's automated triggers and by
// the integration test. Each is a pure function from parameters to
// `StepTemplate[]` so `createPlan` can hash a stable `planType` for the
// "dry-run required before first live execution of this plan type" rule.
import type { StepTemplate } from "./orchestrator";

export function weeklyBriefingPlan(domain: string): StepTemplate[] {
  return [
    { kind: "observe", capability: "metrics.read", input: { metricKey: "weekly_active_users" }, risk: "read" },
    { kind: "act", capability: "briefing.generate", input: { title: `Monday briefing — ${domain}`, domain }, risk: "low" },
  ];
}

export function incidentResponsePlan(domain: string, findingId: string): StepTemplate[] {
  return [
    { kind: "observe", capability: "metrics.read", input: { metricKey: "error_rate" }, risk: "read" },
    {
      kind: "act",
      capability: "finding.acknowledge",
      input: { findingId },
      risk: "medium",
      compensation: { capability: "finding.acknowledge", input: { findingId } },
      entityKey: `finding:${findingId}`,
    },
    {
      kind: "act",
      capability: "domain.pause",
      input: { domain, reason: `incident response for finding ${findingId}` },
      risk: "high",
      compensation: { capability: "domain.pause", input: { domain, reason: "revert" } },
      entityKey: `domain:${domain}`,
    },
  ];
}

export function demoFullCyclePlan(domain: string, opts: { forceVerifyFailure: boolean }): StepTemplate[] {
  return [
    { kind: "observe", capability: "metrics.read", input: { metricKey: "demo_metric" }, risk: "read" },
    { kind: "orient", capability: "metrics.read", input: { metricKey: "demo_metric" }, risk: "read" },
    {
      kind: "act",
      capability: "demo.verifiable.write",
      input: { workItemTitle: "demo cycle write", domain, forceVerifyFailure: opts.forceVerifyFailure },
      risk: "medium",
      compensation: { capability: "demo.verifiable.write", input: { workItemTitle: "demo cycle write (compensation)", domain } },
      entityKey: `demo:${domain}`,
    },
  ];
}

export function crashResumeDemoPlan(domain: string, idempotencyKey: string): StepTemplate[] {
  return [
    {
      kind: "act",
      capability: "demo.verifiable.write",
      input: { workItemTitle: "crash-resume step", domain },
      risk: "medium",
      idempotencyKey,
    },
    { kind: "act", capability: "briefing.generate", input: { title: "post-crash continuation", domain }, risk: "low" },
  ];
}

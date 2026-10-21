import { ApiError } from "./errors";

// -----------------------------------------------------------------------
// Capability / policy registry (Part 07 reference, re-exposed here).
//
// Every side-effecting action performed by the automation kernel or by a
// third-party extension (Section E) MUST call `assertCapability` before it
// touches the database, calls an external webhook, or sends a notification.
// This is the single choke point that stops extension code from bypassing
// guardrails: extensions never get a raw DB handle, only capability-checked
// helpers (see extensions/registry.ts).
// -----------------------------------------------------------------------

export type Capability =
  | "lead.read"
  | "lead.write"
  | "account.read"
  | "account.write"
  | "notification.send"
  | "metric.ingest"
  | "webhook.deliver"
  | "automation.step.execute";

export interface CapabilityPolicy {
  capability: Capability;
  // `"*"` = allowed for every org; otherwise an explicit allow-list.
  allowedOrgs: "*" | string[];
  maxCallsPerRun?: number;
}

// Default policy: platform-native steps/connectors get broad access;
// third-party-registered extensions are restricted to read + notification
// send + metric ingest (never direct lead/account writes) unless an admin
// explicitly widens the policy — this is intentionally conservative.
const POLICIES: Record<Capability, CapabilityPolicy> = {
  "lead.read": { capability: "lead.read", allowedOrgs: "*" },
  "lead.write": { capability: "lead.write", allowedOrgs: "*" },
  "account.read": { capability: "account.read", allowedOrgs: "*" },
  "account.write": { capability: "account.write", allowedOrgs: "*" },
  "notification.send": { capability: "notification.send", allowedOrgs: "*", maxCallsPerRun: 20 },
  "metric.ingest": { capability: "metric.ingest", allowedOrgs: "*", maxCallsPerRun: 50 },
  "webhook.deliver": { capability: "webhook.deliver", allowedOrgs: "*" },
  "automation.step.execute": { capability: "automation.step.execute", allowedOrgs: "*" },
};

export function assertCapability(orgId: string, capability: Capability) {
  const policy = POLICIES[capability];
  if (!policy) {
    throw new ApiError("CAPABILITY_DENIED", `Unknown capability "${capability}".`, { capability });
  }
  if (policy.allowedOrgs !== "*" && !policy.allowedOrgs.includes(orgId)) {
    throw new ApiError(
      "CAPABILITY_DENIED",
      `Org is not permitted to invoke capability "${capability}".`,
      { capability },
    );
  }
}

export function getCapabilityPolicy(capability: Capability): CapabilityPolicy {
  return POLICIES[capability];
}

export function listCapabilities(): CapabilityPolicy[] {
  return Object.values(POLICIES);
}

// ════════════════════════════════════════════════════════════════════
// Client for the Rules API. Builds real `Request` objects and invokes
// the route handlers in `src/app/api/rules/route.ts` in-process (this
// sandbox has no Node server to `fetch()` against). Swap the bodies of
// these functions for real `fetch("/api/rules")` calls with zero change
// to callers once deployed behind an actual Next.js server.
// ════════════════════════════════════════════════════════════════════
import { GET, POST, PATCH } from "../app/api/rules/route";
import { previewExpression, ExpressionPreview, recordFalsePositiveAndRecalibrate } from "./ruleStore";
import type { Rule, Domain, Severity } from "./ruleRegistry";

export function previewCustomRule(expression: string, windowDays = 30): ExpressionPreview {
  return previewExpression(expression, windowDays);
}

export function markFalsePositive(ruleId: string): Rule | undefined {
  return recordFalsePositiveAndRecalibrate(ruleId);
}

export interface SerializedRule extends Omit<Rule, "calibration" | "evidence" | "condition"> {
  calibration: { truePositiveCount: number; falsePositiveCount: number; lastCalibrated: string };
  healthScore: { precision: number; recall: number; f1: number; lastUpdated: string };
  firing: boolean;
  evidenceText: string | null;
  sparkline: boolean[];
}

export interface FetchRulesResponse {
  count: number;
  activeCount: number;
  firingCount: number;
  precisionAvg: number;
  domainHealth: Record<Domain, number>;
  rules: SerializedRule[];
}

async function callRoute(
  handler: (req: Request) => Promise<Response>,
  path: string,
  init?: RequestInit
): Promise<any> {
  const req = new Request(`http://localhost${path}`, init);
  const res = await handler(req);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

export async function fetchRules(): Promise<FetchRulesResponse> {
  return callRoute(GET, "/api/rules", { method: "GET" });
}

export async function createRule(input: {
  name: string;
  domain: Domain;
  condition_expression: string;
  severity: Severity;
  tags: string[];
}): Promise<{ rule: SerializedRule }> {
  return callRoute(POST, "/api/rules", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
  });
}

export async function patchRuleApi(
  id: string,
  patch: { enabled?: boolean; weight?: number }
): Promise<{ rule: SerializedRule }> {
  return callRoute(PATCH, `/api/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
}

export interface CalibrationDiffResponse {
  ranAt: string;
  changedCount: number;
  diff: Array<{
    ruleId: string;
    ruleName: string;
    before: { weight: number; enabled: boolean; thresholds: Record<string, number> };
    after: { weight: number; enabled: boolean; thresholds: Record<string, number> };
  }>;
}

export async function triggerCalibration(): Promise<CalibrationDiffResponse> {
  return callRoute(POST, "/api/rules/calibrate", { method: "POST" });
}

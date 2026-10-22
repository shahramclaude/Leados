// LEADOS — Part 38: ad-hoc self-test entry point (dry evaluation, no
// scheduler/idempotency bookkeeping, no remediation side effects). Used by
// the "run now" console action and by scripts/verify.ts's registry sanity
// checks.

import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { evaluateCheck, type CheckEvaluation } from "@/lib/evaluation";

export interface SelfTestResult {
  checkId: string;
  name: string;
  domain: string;
  evaluation: CheckEvaluation;
}

export async function runSelfTest(): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const check of CHECK_REGISTRY) {
    const evaluation = await evaluateCheck(check);
    results.push({ checkId: check.id, name: check.name, domain: check.domain, evaluation });
  }
  return results;
}

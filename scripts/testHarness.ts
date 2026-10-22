/**
 * scripts/testHarness.ts
 * Minimal, dependency-free assertion harness used by all gate scripts in
 * this part. No test framework is wired into package.json (the standing
 * platform rule for this task forbids editing package.json/vite.config.ts
 * directly), so gates are run as plain Node/tsx scripts instead of
 * `npm run <script>` — see AI-SESSION-LOG.md for the exact command mapping.
 */

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export class Harness {
  results: CheckResult[] = [];
  group: string;

  constructor(group: string) {
    this.group = group;
  }

  check(name: string, condition: boolean, detail?: string) {
    this.results.push({ name, passed: condition, detail });
    const icon = condition ? "✓" : "✗";
    console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  summarize(): boolean {
    const failed = this.results.filter((r) => !r.passed);
    console.log(`\n[${this.group}] ${this.results.length - failed.length}/${this.results.length} checks passed.`);
    if (failed.length > 0) {
      console.log(`[${this.group}] FAILURES:`);
      failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`));
    }
    return failed.length === 0;
  }
}

export function approxEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

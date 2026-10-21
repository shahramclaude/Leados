// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "npm",
  // IMPORTANT: @stryker-mutator/vitest-runner@10.0.0 is confirmed broken on
  // vitest@5.x (stryker-js#6210): its per-mutant testNamePattern joins
  // describe/it names with a single space, but Vitest 5 matches patterns
  // against the full "describe > it" chain, so Stryker's filtered re-run
  // selects almost no tests and nearly every covered mutant is misreported
  // as Survived. We verified this first-hand: the vitest runner, with
  // *both* coverageAnalysis "off" and vitest.related=false, still only ran
  // ~1 test per mutant and produced a bogus 2.5% score. The command runner
  // below has no such bug — it just shells out to the full targeted test
  // command and reads the exit code — at the cost of re-running the whole
  // (small, ~30 test) domain suite per mutant instead of a filtered subset.
  // Re-evaluate switching back once the upstream issue is fixed.
  testRunner: "command",
  commandRunner: {
    // Call the local binary directly (not `npx vitest`) to avoid npx's
    // package-resolution overhead on every one of the ~190 mutant runs.
    command: "./node_modules/.bin/vitest run --config vitest.mutation.config.ts",
  },
  coverageAnalysis: "off",
  // Only the domain math engines are in scope for the mutation gate (Part 15
  // standing order C). API routes/services are covered by integration and
  // contract tests, not mutation testing, in this iteration — see the
  // adversarial self-review for why that boundary was drawn here.
  mutate: ["src/lib/domain/*.ts", "!src/lib/domain/*.test.ts", "!src/lib/domain/index.ts"],
  thresholds: {
    high: 85,
    low: 70,
    break: 70, // Gate declared in the standing order: domain layer mutation score >= 70%.
  },
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  concurrency: 4,
  timeoutMS: 15000,
};

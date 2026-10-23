// Phase 3(e)/4(4): fairness extension — coaching-access and
// feedback-distribution audits, with sample sizes, and small-group
// suppression enforced.
import "./_env";
import { coachingAccessAudit, feedbackDistributionAudit, MIN_SAMPLE_SIZE } from "@/lib/fairness";

export async function run(): Promise<boolean> {
  console.log("=== test:fairness — coaching-access & feedback-distribution audits ===");
  let ok = true;

  const coaching = await coachingAccessAudit();
  console.log(`\n[${coaching.surface}] metric: ${coaching.metric}`);
  for (const g of coaching.groups) {
    console.log(
      `  group=${g.group} n=${g.sampleSize} value=${g.value} ${g.suppressed ? "(suppressed: n < " + MIN_SAMPLE_SIZE + ")" : ""}`,
    );
    if (g.suppressed && g.sampleSize >= MIN_SAMPLE_SIZE) {
      console.error(`FAIL: group ${g.group} marked suppressed despite n=${g.sampleSize} >= ${MIN_SAMPLE_SIZE}.`);
      ok = false;
    }
    if (!g.suppressed && g.sampleSize < MIN_SAMPLE_SIZE) {
      console.error(`FAIL: group ${g.group} with n=${g.sampleSize} < ${MIN_SAMPLE_SIZE} was NOT suppressed.`);
      ok = false;
    }
  }
  console.log(`  maxObservedDisparity (non-suppressed groups only): ${coaching.maxObservedDisparity}`);
  console.log(`  note: ${coaching.note}`);

  const feedback = await feedbackDistributionAudit();
  console.log(`\n[${feedback.surface}] metric: ${feedback.metric}`);
  for (const g of feedback.groups) {
    console.log(
      `  group=${g.group} n=${g.sampleSize} value=${g.value} ${g.suppressed ? "(suppressed: n < " + MIN_SAMPLE_SIZE + ")" : ""}`,
    );
    if (g.suppressed && g.sampleSize >= MIN_SAMPLE_SIZE) {
      console.error(`FAIL: group ${g.group} marked suppressed despite n=${g.sampleSize} >= ${MIN_SAMPLE_SIZE}.`);
      ok = false;
    }
    if (!g.suppressed && g.sampleSize < MIN_SAMPLE_SIZE) {
      console.error(`FAIL: group ${g.group} with n=${g.sampleSize} < ${MIN_SAMPLE_SIZE} was NOT suppressed.`);
      ok = false;
    }
  }
  console.log(`  maxObservedDisparity (non-suppressed groups only): ${feedback.maxObservedDisparity}`);
  console.log(`  note: ${feedback.note}`);

  if (coaching.groups.length === 0 || feedback.groups.length === 0) {
    console.error("FAIL: fairness report produced no groups — seed data missing?");
    ok = false;
  }

  console.log(`\n${ok ? "RESULT: PASS" : "RESULT: FAIL"}`);
  return ok;
}

if (require.main === module) {
  run()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

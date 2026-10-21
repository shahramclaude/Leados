// Acceptance gate (4): every score renders Explain<T> (contract test).
import "dotenv/config";
import { pool } from "../src/db";
import { assertIsExplain } from "../src/lib/explain";
import { getFlightRisk } from "../src/lib/flightRisk";
import { evaluateCandidate } from "../src/lib/succession";
import { computeTeamHealth } from "../src/lib/teamHealth";
import { followThroughScore } from "../src/lib/oneOnOne";
import type { Actor } from "../src/lib/accessControl";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  if (!pass) failures++;
}

const hr: Actor = { id: "hr_casey", globalRole: "hr" };

async function main() {
  console.log("=== Explain<T> contract tests ===");

  try {
    const risk = await getFlightRisk(hr, "emp_priya");
    assertIsExplain(risk, "flightRisk");
    check("flightRisk.getFlightRisk returns a valid Explain<number>", true);
    check("flightRisk drivers carry a causalStatus", (risk.drivers ?? []).every((d) => !!d.causalStatus));
    check("flightRisk has a confidence interval", !!risk.confidence && risk.confidence.low <= risk.confidence.high);
    check("flightRisk declares a lawful purpose", typeof risk.lawfulPurpose === "string" && risk.lawfulPurpose.length > 0);
  } catch (e) {
    check("flightRisk.getFlightRisk returns a valid Explain<number>", false, String(e));
  }

  try {
    const candidate = await evaluateCandidate("emp_priya", "Senior Engineer");
    assertIsExplain(candidate.readiness, "succession.readiness");
    check("succession.evaluateCandidate returns a valid Explain<Readiness>", true);
    check(
      "succession readiness states 'decision support, not a decision'",
      (candidate.readiness.limitations ?? []).some((l) => /decision support, not a decision/i.test(l)),
    );
  } catch (e) {
    check("succession.evaluateCandidate returns a valid Explain<Readiness>", false, String(e));
  }

  try {
    const radar = await computeTeamHealth(hr, "team_platform");
    for (const dim of Object.keys(radar.axes) as (keyof typeof radar.axes)[]) {
      assertIsExplain(radar.axes[dim], `teamHealth.axes.${dim}`);
    }
    check("teamHealth.computeTeamHealth returns a valid Explain<number> per axis", true);
    for (const rec of radar.recommendations) {
      assertIsExplain(rec.expectedEffect, `teamHealth.recommendation.${rec.id}`);
    }
    check("teamHealth recommendations carry Explain<string> expected effects", true);
  } catch (e) {
    check("teamHealth.computeTeamHealth returns a valid Explain<number> per axis", false, String(e));
  }

  try {
    const ft = await followThroughScore("emp_priya");
    assertIsExplain(ft.rate, "oneOnOne.followThroughScore");
    check("oneOnOne.followThroughScore returns a valid Explain<number>", true);
  } catch (e) {
    check("oneOnOne.followThroughScore returns a valid Explain<number>", false, String(e));
  }

  console.log(`\n${failures === 0 ? "ALL CONTRACT TESTS PASSED" : `${failures} CONTRACT TEST(S) FAILED`}`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});

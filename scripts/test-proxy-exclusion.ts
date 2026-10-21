// Acceptance gate (2): proxy-exclusion assertion exists and is tested.
import "dotenv/config";
import { pool } from "../src/db";
import { assertNoProtectedFeatures, FLIGHT_RISK_ALLOWED_FEATURES } from "../src/lib/protectedAttributes";
import { buildFlightRiskFeatures } from "../src/lib/flightRisk";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  if (!pass) failures++;
}

async function main() {
  console.log("=== Proxy / protected-attribute exclusion tests ===");

  // 1. The real, allow-listed feature set must pass the assertion untouched.
  try {
    assertNoProtectedFeatures([...FLIGHT_RISK_ALLOWED_FEATURES]);
    check("Allow-listed flight-risk features pass assertNoProtectedFeatures", true);
  } catch (e) {
    check("Allow-listed flight-risk features pass assertNoProtectedFeatures", false, String(e));
  }

  // 2. Every declared protected attribute must be rejected.
  const protectedSamples = ["age", "gender", "ethnicity", "religion", "disability", "union_status", "parental_leave"];
  for (const field of protectedSamples) {
    try {
      assertNoProtectedFeatures(["tenureMonths", field]);
      check(`Rejects protected field "${field}"`, false, "did not throw");
    } catch {
      check(`Rejects protected field "${field}"`, true);
    }
  }

  // 3. Declared proxies must also be rejected.
  const proxySamples = ["name", "graduation_year", "home_address", "school_name"];
  for (const field of proxySamples) {
    try {
      assertNoProtectedFeatures(["tenureMonths", field]);
      check(`Rejects proxy field "${field}"`, false, "did not throw");
    } catch {
      check(`Rejects proxy field "${field}"`, true);
    }
  }

  // 4. Case/format variants of protected attributes must still be caught
  // (defense against naive renames slipping past a literal string match).
  for (const field of ["Age", "date-of-birth", "unionStatus", "parentalLeave"]) {
    try {
      assertNoProtectedFeatures(["tenureMonths", field]);
      check(`Rejects normalized variant "${field}"`, false, "did not throw");
    } catch {
      check(`Rejects normalized variant "${field}"`, true);
    }
  }

  // 5. The live feature builder, against real seeded data, must produce only
  // allow-listed features and pass the assertion end-to-end.
  try {
    const { features } = await buildFlightRiskFeatures("emp_alex", new Date());
    const keys = Object.keys(features);
    const allAllowed = keys.every((k) => (FLIGHT_RISK_ALLOWED_FEATURES as readonly string[]).includes(k));
    assertNoProtectedFeatures(keys);
    check("Live feature builder output is fully allow-listed and passes assertion", allAllowed);
  } catch (e) {
    check("Live feature builder output is fully allow-listed and passes assertion", false, String(e));
  }

  console.log(`\n${failures === 0 ? "ALL PROXY-EXCLUSION TESTS PASSED" : `${failures} PROXY-EXCLUSION TEST(S) FAILED`}`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});

// LEADOS — Part 38 / Part 19: `npm run audit:verify`
// Re-verifies the full audit-chain hash sequence end to end.

import "dotenv/config";
import { verifyAuditChain } from "@/lib/audit";

async function main() {
  console.log("=== LEADOS Part 38 — Audit Chain Verification ===\n");
  const result = await verifyAuditChain();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(`\nFAIL: audit chain broken at seq ${result.brokenAtSeq}: ${result.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS: ${result.entriesChecked} audit entries verified, chain intact.`);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

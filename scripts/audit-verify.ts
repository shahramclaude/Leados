import "dotenv/config";
import { pool } from "../src/db";
import { verifyChain } from "../src/lib/ops/auditChain";

async function main() {
  const result = await verifyChain();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error("AUDIT CHAIN VERIFICATION FAILED");
    process.exitCode = 1;
  } else {
    console.log(`Audit chain OK (${result.rowsChecked} rows checked).`);
  }
}

main().finally(() => pool.end());

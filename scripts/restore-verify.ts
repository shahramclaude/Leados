import "dotenv/config";
import { pool } from "../src/db";
import { restoreVerify } from "../src/lib/ops/backup";

async function main() {
  const result = await restoreVerify();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().finally(() => pool.end());

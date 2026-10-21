import "dotenv/config";
import { pool } from "../src/db";
import { generateSloReport } from "../src/lib/ops/sloReport";

async function main() {
  const report = await generateSloReport(Number(process.argv[2] || 30));
  console.log(`SLO report written to ${report.path}`);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

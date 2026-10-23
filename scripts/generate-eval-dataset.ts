// Writes the committed, reproducible 100-objective eval dataset to
// eval/agent-objectives.json. Run with `npm run eval:agent:gen`.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateEvalObjectives } from "../src/lib/agent/eval-dataset";

function main() {
  const objectives = generateEvalObjectives(100);
  const outPath = join(__dirname, "..", "eval", "agent-objectives.json");
  writeFileSync(outPath, JSON.stringify(objectives, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${objectives.length} objectives to ${outPath}`);
  const byCategory = new Map<string, number>();
  for (const o of objectives) byCategory.set(o.category, (byCategory.get(o.category) ?? 0) + 1);
  for (const [category, n] of byCategory) {
    // eslint-disable-next-line no-console
    console.log(`  ${category}: ${n}`);
  }
}

main();

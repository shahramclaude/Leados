// Read-only point-in-time workpaper. No FX, rounding, facility aggregation or waiver inference.
import { readFileSync } from 'node:fs';
import { reviewMinimumCash } from '../app/core/domain/minimumCash.js';

try {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/review-minimum-cash.mjs evidence.tsv (or - for stdin)');
  const report = reviewMinimumCash(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(process.argv[2] === '-' ? 0 : process.argv[2])));
  console.log(JSON.stringify(report, null, 2));
  if (!report.result) process.exitCode = 2;
} catch (error) {
  console.error(`Review refused: ${error.message}`);
  process.exitCode = 1;
}

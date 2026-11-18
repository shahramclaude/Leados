// Read-only review of one hazard's explicitly evidenced, half-open intervals.
import { readFileSync } from 'node:fs';

const header = 'hazard\tcontrol\tfromUTC\tuntilUTC\tcreditRef\timpairmentRef';
function instant(value) {
  const ms = Date.parse(value);
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}
function review(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.shift() !== header || !lines.length) throw Error(`Expected header and evidence rows: ${header}`);
  const rows = [], seen = new Set();
  for (const [i, line] of lines.entries()) {
    const fields = line.split('\t');
    if (fields.length !== 6 || fields.some(v => !v || v.trim() !== v || /[\r\n]/.test(v))) throw Error(`Line ${i + 2}: missing or malformed field`);
    const [hazard, control, fromUTC, untilUTC, creditRef, impairmentRef] = fields;
    const start = instant(fromUTC), end = instant(untilUTC);
    if (!(start < end)) throw Error(`Line ${i + 2}: two ordered exact UTC evidence bounds required`);
    if (rows.length && hazard !== rows[0].hazard) throw Error(`Line ${i + 2}: review one hazard at a time`);
    if (seen.has(line)) continue;
    seen.add(line);
    rows.push({ hazard, control, fromUTC, untilUTC, creditRef, impairmentRef, start, end, line: i + 2 });
  }
  rows.sort((a, b) => a.start - b.start || a.line - b.line);
  const intersections = [];
  for (const [i, a] of rows.entries()) {
    for (let j = i + 1; j < rows.length && rows[j].start < a.end; j++) {
      const b = rows[j];
      if (a.control === b.control) throw Error(`Lines ${a.line}, ${b.line}: reconcile overlapping evidence for one control first`);
      const end = Math.min(a.end, b.end);
      intersections.push({ lines: [a.line, b.line], fromUTC: b.fromUTC, untilUTC: new Date(end).toISOString(), milliseconds: end - b.start });
    }
  }
  return { scope: 'Submitted evidence only; no restoration, independence or safety conclusion.', duplicateRows: lines.length - rows.length,
    evidence: rows.map(({ start, end, ...source }) => source), intersectionCount: intersections.length, intersections };
}
try {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/review-control-overlap.mjs evidence.tsv');
  console.log(JSON.stringify(review(readFileSync(process.argv[2] === '-' ? 0 : process.argv[2], 'utf8')), null, 2));
} catch (error) {
  console.error(`Review withheld: ${error.message}`);
  process.exitCode = 1;
}

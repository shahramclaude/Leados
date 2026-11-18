// Read-only point-in-time workpaper. No FX, rounding, facility aggregation or waiver inference.
import { readFileSync } from 'node:fs';

const terms = ['facility', 'testDate', 'currency', 'minimumMinor', 'clauseRef', 'controlAccounts', 'controlTotalMinor', 'controlRef'];
const columns = ['account', 'testDate', 'currency', 'balanceMinor', 'treatment', 'basisRef', 'balanceRef'];

function readRows(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  function row(i, keys) {
    const values = (lines[i] ?? '').split('\t');
    if (values.length !== keys.length || values.some(v => !v || v.trim() !== v || /[\u0000-\u001f\u007f]/u.test(v))) {
      throw Error(`Line ${i + 1}: expected ${keys.length} populated, tab-separated fields.`);
    }
    return Object.fromEntries(keys.map((key, j) => [key, values[j]]));
  }
  if (lines[0] !== terms.join('\t') || lines[2] !== columns.join('\t')) throw Error('Expected the terms and account headers on lines 1 and 3 (see README).');
  return { terms: row(1, terms), rows: lines.slice(3).map((_, i) => row(i + 3, columns)) };
}

function integer(value, field, signed = false) {
  if (!(signed ? /^(0|-?[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(value)) throw Error(`${field}: expected a canonical ${signed ? 'signed' : 'nonnegative'} integer.`);
  return BigInt(value);
}

function review(text) {
  const { terms: t, rows } = readRows(text);
  if (!/^\d{4}-\d\d-\d\d$/.test(t.testDate) || !Number.isFinite(Date.parse(t.testDate)) || new Date(t.testDate).toISOString().slice(0, 10) !== t.testDate) throw Error('Invalid test date.');
  if (!/^[A-Z]{3}$/.test(t.currency)) throw Error('Expected a three-letter uppercase currency code.');
  const minimum = integer(t.minimumMinor, 'minimumMinor');
  const controlCount = integer(t.controlAccounts, 'controlAccounts');
  const controlTotal = integer(t.controlTotalMinor, 'controlTotalMinor', true);
  const accounts = new Map();
  const totals = { include: 0n, exclude: 0n, unresolved: 0n };
  let duplicates = 0;
  for (const [i, r] of rows.entries()) {
    const line = i + 4;
    if (r.testDate !== t.testDate || r.currency !== t.currency) throw Error(`Line ${line}: account date/currency differs from terms.`);
    if (!Object.hasOwn(totals, r.treatment)) throw Error(`Line ${line}: treatment must be include, exclude or unresolved.`);
    const amount = integer(r.balanceMinor, `Line ${line} balanceMinor`, true);
    const prior = accounts.get(r.account);
    if (prior) {
      if (columns.some(k => prior[k] !== r[k])) throw Error(`Lines ${prior.lines[0]} and ${line}: conflicting evidence for one account; reconcile before use.`);
      prior.lines.push(line);
      duplicates++;
    } else {
      accounts.set(r.account, { ...r, lines: [line] });
      totals[r.treatment] += amount;
    }
  }
  const evidence = [...accounts.values()];
  const book = totals.include + totals.exclude + totals.unresolved;
  const countMatches = BigInt(accounts.size) === controlCount, totalMatches = book === controlTotal;
  const reasons = [];
  if (!accounts.size) reasons.push('No account evidence supplied.');
  if (!countMatches) reasons.push('Distinct account count differs from population control.');
  if (!totalMatches) reasons.push('Account sum differs from book control.');
  if (evidence.some(r => r.treatment === 'unresolved')) reasons.push('Eligibility unresolved on one or more accounts.');
  const difference = totals.include - minimum;
  return { scope: 'Submitted cash balances only; not a compliance certificate, waiver or funding authority.', terms: t, evidence,
    duplicateRows: duplicates, distinctAccounts: accounts.size, bookMinor: String(book),
    subtotalsMinor: Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, String(v)])),
    countMatches, totalMatches, reasons, result: reasons.length ? null : {
      eligibleMinor: String(totals.include), signedHeadroomMinor: String(difference),
      reading: difference < 0n ? 'below minimum' : difference === 0n ? 'at minimum' : 'above minimum' } };
}

try {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/review-minimum-cash.mjs evidence.tsv (or - for stdin)');
  const report = review(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(process.argv[2] === '-' ? 0 : process.argv[2])));
  console.log(JSON.stringify(report, null, 2));
  if (!report.result) process.exitCode = 2;
} catch (error) {
  console.error(`Review refused: ${error.message}`);
  process.exitCode = 1;
}

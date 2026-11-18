import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/review-minimum-cash.mjs', import.meta.url));
const terms = 'facility\ttestDate\tcurrency\tminimumMinor\tclauseRef\tcontrolAccounts\tcontrolTotalMinor\tcontrolRef';
const columns = 'account\ttestDate\tcurrency\tbalanceMinor\ttreatment\tbasisRef\tbalanceRef';
const date = '2026-10-31';
const declaration = `F1\t${date}\tDKK\t9007199254740993\tagreement §4\t3\t9007199254740999\tGL close`;
const a = `DK01\t${date}\tDKK\t9007199254740996\tinclude\t§4a\tbank 1`;
const b = `DK02\t${date}\tDKK\t-3\tinclude\t§4b\tbank 2`;
const c = `DK03\t${date}\tDKK\t6\texclude\tpledge\tbank 3`;
function input(d = declaration, rows = [a,b,c]) { return [terms, d, columns, ...rows].join('\r\n') + '\r\n'; }
function run(text, path = '-') { return spawnSync(process.execPath, [script, path], {input: text, encoding: 'utf8'}); }

test('file → receipt preserves declared terms, rows and exact totals, including a matrix copy', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cash-')); t.after(() => rmSync(dir, {recursive:true, force:true}));
  const path = join(dir, 'cash.tsv'), original = input(declaration, [a,b,c,a]); writeFileSync(path, original);
  const res = run(undefined, path); assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout); assert.equal(readFileSync(path,'utf8'), original);
  assert.deepEqual(Object.values(out.terms), declaration.split('\t'));
  assert.deepEqual(out.evidence.map(({lines, ...r}) => [Object.values(r).join('\t'), lines]), [[a,[4,7]],[b,[5]],[c,[6]]]);
  assert.equal(out.duplicateRows, 1); assert.equal(out.distinctAccounts, 3);
  assert.deepEqual(out.subtotalsMinor, {include:'9007199254740993',exclude:'6',unresolved:'0'});
  assert.equal(out.bookMinor,'9007199254740999'); assert.equal(out.totalMatches && out.countMatches,true);
  assert.deepEqual(out.result,{eligibleMinor:'9007199254740993',signedHeadroomMinor:'0',reading:'at minimum'});
});

test('one minor unit either side of the threshold changes the reading without rounding', () => {
  for (const [end,margin,reading] of [['4','-1','below minimum'],['2','1','above minimum']]) {
    const res = run(input(declaration.replace('993\t',`99${end}\t`))); assert.equal(res.status,0,res.stderr);
    const out = JSON.parse(res.stdout); assert.equal(out.result.signedHeadroomMinor,margin); assert.equal(out.result.reading,reading);
  }
});

test('control failures and unknown eligibility withhold the reading, independently of arithmetic', () => {
  for (const [text,count,sum,n] of [[input(declaration,[a,b,c.replace('exclude','unresolved')]),true,true,1],
    [input(declaration.replace('\t3\t','\t4\t')),false,true,1],[input(declaration.replace('999\t','998\t')),true,false,1],
    [input(declaration,[]),false,false,3]]) {
    const res = run(text); assert.equal(res.status,2,res.stderr); const out = JSON.parse(res.stdout);
    assert.equal(out.result,null); assert.equal(out.countMatches,count); assert.equal(out.totalMatches,sum); assert.equal(out.reasons.length,n);
  }
});

test('conflicting copies, wrong perimeter, unsupported numerics and missing evidence refuse atomically', () => {
  for (const text of [input(declaration,[a,b,c,a.replace('bank 1','bank 2')]), input().replaceAll(date,'2026-02-30'),
    ...[b.replace(date,'2026-10-30'), b.replace('DKK','USD'), b.replace('-3','-3.0'), b.replace('include','constructor'), b.replace('bank 2','')].map(r => input(declaration,[a,r,c]))]) {
    const res = run(text); assert.equal(res.status,1); assert.equal(res.stdout,''); assert.match(res.stderr,/Review refused:/);
  }
});

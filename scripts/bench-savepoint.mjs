/**
 * scripts/bench-savepoint.mjs — end-to-end cost of a real store write.
 *
 * Measures the actual `runPostCommitRules` path, not a model of it: build a
 * demo workspace, run one real automation-heavy mutation through the store,
 * and report wall time. The reference column replays the same rules against a
 * restore-the-workspace savepoint (whole-workspace deep copy), which is what
 * the engine did before ADR-0026.
 *
 * Run: node scripts/bench-savepoint.mjs [--scale 1,4,16] [--runs 7]
 *
 * Prints numbers, exits 0. Not a test, not a gate.
 */
import { buildDemoState } from '../app/core/demo.js';
import { runPostCommitRules, DEFAULT_POST_COMMIT_RULES } from '../app/core/domain/postCommit.js';

const NOW = new Date('2026-10-28T09:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function argsFor(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const SCALES = argsFor('--scale', '1,4,16').split(',').map(Number);
const RUNS = Number(argsFor('--runs', '5'));

function makeIdFactory() {
  let n = 0;
  return (prefix) => `${prefix}-bench-${(n += 1)}`;
}

/** Grow record-bearing collections to simulate a larger tenant. */
function grow(state, factor) {
  const out = JSON.parse(JSON.stringify(state));
  for (const key of Object.keys(out)) {
    if (!Array.isArray(out[key]) || key === 'events') continue;
    if (!out[key].length) continue;
    const copies = [];
    for (let i = 0; i < factor; i += 1) {
      for (const item of out[key]) copies.push({ ...item, id: `${item.id || 'x'}~${i}` });
    }
    out[key] = copies;
  }
  return out;
}

/**
 * The pre-ADR-0026 strategy, reproduced faithfully: deep-copy the workspace
 * before each rule, apply the rule to the copy, and write the copy back.
 * Rollback is "throw the copy away", which is why only success costs a copy.
 */
function referenceRun(draft, context) {
  const results = [];
  for (const rule of DEFAULT_POST_COMMIT_RULES) {
    const candidate = JSON.parse(JSON.stringify(draft));
    try {
      const result = rule(candidate, {
        ...context,
        logEvent: () => {},
        warnings: [],
        emitEvent: () => true,
      });
      if (Array.isArray(result)) results.push(...result);
      for (const key of Object.keys(draft)) if (!Object.hasOwn(candidate, key)) delete draft[key];
      Object.assign(draft, candidate);
    } catch {
      /* isolated rule failure: the copy is discarded */
    }
  }
  return results;
}

function realRun(draft, context) {
  return runPostCommitRules(draft, {
    ...context,
    logEvent: () => {},
    warnings: [],
  });
}

function baselineRun(draft, context) {
  return runPostCommitRules(draft, {
    ...context,
    savepoint: 'clone',
    declineMemo: false,
    logEvent: () => {},
    warnings: [],
  });
}

/**
 * A cascade that produces several events of the same type. This is the shape
 * decline collapse exists for: the first invocation of a scan rule is real
 * work, the repeats at an unchanged workspace version are provably identical.
 */
function repeatedTypeRun(draft, context) {
  const producer = (candidate, ctx) => {
    if (ctx.event?.type !== 'seed') return [];
    for (const n of [1, 2, 3]) ctx.emitEvent({ type: 'pulse.recorded', entity: 'pulse', entityId: `p${n}` });
    return [];
  };
  return runPostCommitRules(draft, {
    ...context,
    event: { type: 'seed', entity: 'workspace', entityId: 'w' },
    logEvent: () => {},
    warnings: [],
    rules: [producer, ...DEFAULT_POST_COMMIT_RULES],
  });
}

function time(fn) {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * One real, automation-heavy transaction: a freshly created case with FMEA
 * ratings and an owner, which is the fan-out shape the case engine exists for.
 */
function seedCase(state, label) {
  const owner = state.people.find((p) => p && p.status !== 'archived');
  const caseId = `case-bench-${label}`;
  state.cases.push({
    id: caseId,
    title: `Bench incident ${label}`,
    kind: 'operational',
    status: 'open',
    priority: 'high',
    ownerId: owner?.id || null,
    openedOn: '2026-10-28',
    summary: 'Synthetic benchmark case used to measure post-commit fan-out cost.',
    severity: 7,
    occurrence: 5,
    detection: 4,
    costEstimate: 12000,
    currency: 'DKK',
    optimisticDays: 3,
    likelyDays: 8,
    pessimisticDays: 21,
    capacityPersonDays: 6,
    createdAt: NOW_ISO,
  });
  return caseId;
}

console.log('== LeadOS store write: post-commit engine cost ==');
console.log(`rule chain: ${DEFAULT_POST_COMMIT_RULES.length} rules · runs per cell: ${RUNS} (median)\n`);
console.log('                              --- single case.created ---   --- 4-event cascade ---');
console.log('scale  records  workspace   baseline      COW+expand    gain    baseline      COW+collapse  gain');

for (const factor of SCALES) {
  const base = grow(buildDemoState(NOW), factor);
  const cow = [];
  const ref = [];
  const cascadeCow = [];
  const cascadeBase = [];

  for (let run = 0; run < RUNS; run += 1) {
    const draftA = JSON.parse(JSON.stringify(base));
    const caseA = seedCase(draftA, `cow-${run}`);
    cow.push(time(() => realRun(draftA, {
      event: { type: 'case.created', entity: 'case', entityId: caseA },
      now: NOW, idFactory: makeIdFactory(),
    })));

    const draftB = JSON.parse(JSON.stringify(base));
    const caseB = seedCase(draftB, `ref-${run}`);
    ref.push(time(() => baselineRun(draftB, {
      event: { type: 'case.created', entity: 'case', entityId: caseB },
      now: NOW, idFactory: makeIdFactory(),
    })));

    const draftC = JSON.parse(JSON.stringify(base));
    seedCase(draftC, `casc-${run}`);
    cascadeCow.push(time(() => repeatedTypeRun(draftC, { now: NOW, idFactory: makeIdFactory() })));

    const draftD = JSON.parse(JSON.stringify(base));
    seedCase(draftD, `casc-ref-${run}`);
    cascadeBase.push(time(() => runPostCommitRules(draftD, {
      now: NOW, idFactory: makeIdFactory(), savepoint: 'clone', declineMemo: false,
      event: { type: 'seed', entity: 'workspace', entityId: 'w' }, logEvent: () => {},
      warnings: [], rules: [(c, ctx) => {
        if (ctx.event?.type !== 'seed') return [];
        for (const n of [1, 2, 3]) ctx.emitEvent({ type: 'pulse.recorded', entity: 'pulse', entityId: `p${n}` });
        return [];
      }, ...DEFAULT_POST_COMMIT_RULES],
    })));
  }

  const cowMs = median(cow);
  const refMs = median(ref);
  const records = Object.keys(base).filter((k) => Array.isArray(base[k]))
    .reduce((sum, k) => sum + base[k].length, 0);
  const bytes = JSON.stringify(base).length;
  const cascadeCowMs = median(cascadeCow);
  const cascadeBaseMs = median(cascadeBase);
  console.log(
    `${String(factor).padEnd(6)} ${String(records).padEnd(8)} ${String(Math.round(bytes / 1024) + 'K').padEnd(11)}`
    + ` ${(refMs.toFixed(1) + ' ms').padEnd(13)} ${(cowMs.toFixed(1) + ' ms').padEnd(13)} ${(refMs / cowMs).toFixed(1) + 'x'.padEnd(2)}`
    + ` ${(cascadeBaseMs.toFixed(1) + ' ms').padEnd(13)} ${(cascadeCowMs.toFixed(1) + ' ms').padEnd(12)} ${(cascadeBaseMs / cascadeCowMs).toFixed(1)}x`,
  );
}

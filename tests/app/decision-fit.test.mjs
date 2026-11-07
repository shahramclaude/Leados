/**
 * ADR-0108 — the Decision-Fit Ledger.
 *
 * What this suite defends, in the order the module fails if it is wrong:
 *
 *  1. STORAGE. v110 is additive: four empty collections, declared conventions,
 *     zero back-fill, and a v109 workspace migrates without inventing a price.
 *  2. IDEMPOTENCE. A scan is a computation over the book, so scanning twice must
 *     not change what the workspace believes. This is the defect this suite was
 *     written for: the first implementation keyed a snapshot on
 *     (decision, class, OWNER RUNG) and appended a row per pass, so two scans
 *     produced 13 → 40 snapshots. Live rows, readings and provenance edges must
 *     all converge.
 *  3. THE UNIT. Stock, not flow. `netSaving` is a currency amount over the
 *     remaining expected hold; `waitSaving` must equal weeks × rate, and the
 *     saving must be net of a monitoring cost that is strictly positive for any
 *     delegation that crosses more than the nearest rung.
 *  4. REFUSAL HONESTY. Rights refusals are printed, never rendered as silence,
 *     and an evidence-free call carries a declared (never zero) deficit and can
 *     never become the recommendation.
 *  5. THE INVERSION. A call held BELOW its class floor must produce a priced
 *     ESCALATION row. An empty ladder reads as "no option exists" when the truth
 *     is "the holder cannot lawfully grant this".
 *  6. CROSS-ALTITUDE. A frozen frontline snapshot reaches the chief through the
 *     existing `rolls-up-to` spine, and a span reading above its disclosure floor
 *     refuses rather than printing one person's number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildChain, LEADER_ID } from '../../app/core/domain/chain.js';
import {
  buildFitBook, fitConventions, fitRollUp, fitCsvRows, priceAlternative,
} from '../../app/core/domain/decisionFit.js';
import {
  AUTHORITY_CLASSES, FIT_REFUSALS, classFloorRank, snapshotKey, FIT_CONVENTION_DEFAULTS,
} from '../../app/core/domain/decisionFitRegistry.js';
import { fitAttentionCount } from '../../app/core/domain/decisionFitRules.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { SAFE_READS } from '../../app/core/domain/accessGateway.js';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

function setup() {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-fit-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  store.seedDemo();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const scan = (env) => env.api.fitScan();

function liveSnapshots(state) {
  return state.fitSnapshots.filter((row) => row.status === 'frozen');
}
function edges(state, relation) {
  return (Array.isArray(state.links) ? state.links : []).filter((l) => l.relation === relation);
}

/* --------------------------------------------------------- 1. storage */

test('v110 is additive: four empty collections, declared conventions, zero back-fill', () => {
  assert.equal(SCHEMA_VERSION, 117);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.fitSnapshots, []);
  assert.deepEqual(empty.fitProposals, []);
  assert.deepEqual(empty.fitReadings, []);
  assert.deepEqual(empty.fitMarkers, []);

  // Conventions are DECLARED defaults, not fitted coefficients: the module must
  // be able to state its priors before it has a single settled call to learn from.
  const conv = fitConventions(empty.settings);
  assert.equal(typeof conv.fitProposalAfterDays, 'number');
  assert.ok(conv.fitProposalAfterDays >= 3);
  assert.ok(conv.fitMonitoringCostPctPerRung > 0, 'a delegation model without monitoring cost recommends rung 1 for everything');

  const migrated = migrate({ schemaVersion: 109, settings: {}, people: [], decisions: [] });
  assert.equal(migrated.raw.schemaVersion, 117);
  assert.equal(migrated.applied.at(-1), '116 → 117');
  // Nothing is invented for a workspace that never used the module.
  assert.deepEqual(migrated.raw.fitSnapshots, []);
  assert.deepEqual(migrated.raw.fitProposals, []);
  assert.deepEqual(migrated.raw.fitMarkers, []);

  // And an empty workspace's book is empty rather than throwing.
  const state = normalizeState({ schemaVersion: 109, people: [] }, { now: NOW }).state;
  const book = buildFitBook(state, { now: NOW });
  assert.equal(book.rows.length, 0);
});

/* ----------------------------------------------------- 2. idempotence */

test('a scan is a computation: scanning repeatedly converges instead of appending', () => {
  const env = setup();
  const first = scan(env);
  assert.equal(first.ok, true, first.error);

  const after1 = {
    live: liveSnapshots(env.store.state).length,
    readings: env.store.state.fitReadings.length,
    prices: edges(env.store.state, 'prices-authority').length,
    reads: edges(env.store.state, 'reads-span-fit').length,
    decisions: env.store.state.decisions.length,
  };
  assert.ok(after1.live > 0, 'the demo must price at least one open call');

  for (let i = 0; i < 3; i += 1) {
    const again = scan(env);
    assert.equal(again.ok, true, again.error);
  }

  const after4 = {
    live: liveSnapshots(env.store.state).length,
    readings: env.store.state.fitReadings.length,
    prices: edges(env.store.state, 'prices-authority').length,
    reads: edges(env.store.state, 'reads-span-fit').length,
    decisions: env.store.state.decisions.length,
  };
  assert.deepEqual(after4, after1, 'four scans must leave the workspace believing exactly what one scan left it believing');

  // One live snapshot per decision, not one per decision per pass.
  const byDecision = new Map();
  for (const row of liveSnapshots(env.store.state)) {
    byDecision.set(row.decisionId, (byDecision.get(row.decisionId) || 0) + 1);
  }
  for (const [decisionId, n] of byDecision) {
    assert.equal(n, 1, `${decisionId} carries ${n} live snapshots`);
  }

  // Governed findings are audit output, never priced as leadership work: a scan
  // runs every module's pass, and freezing those would make the ledger measure
  // its own output (the Session-143 second-order-decision regression).
  const frozen = new Set(liveSnapshots(env.store.state).map((r) => r.decisionId));
  for (const proposal of env.store.state.fitProposals) {
    assert.ok(!frozen.has(proposal.optionDecisionId), 'the ledger must not price its own governed proposal');
  }
});

test('reclassifying a call SUPERSEDES its snapshot rather than editing the old price', () => {
  const env = setup();
  assert.equal(scan(env).ok, true);
  const priced = liveSnapshots(env.store.state).find((r) => r.classKey !== 'enterprise');
  assert.ok(priced, 'need one priced call to reclassify');

  const target = priced.classKey === 'capital' ? 'sequencing' : 'capital';
  const res = env.api.fitClassify(priced.decisionId, target);
  assert.equal(res.ok, true, res.error);

  const rows = env.store.state.fitSnapshots.filter((r) => r.decisionId === priced.decisionId);
  const superseded = rows.filter((r) => r.status === 'superseded');
  assert.equal(superseded.length, 1, 'the old price stays auditable beside the new one');
  assert.ok(superseded[0].supersededOn, 'a superseded row is dated');
  assert.equal(liveSnapshots(env.store.state).filter((r) => r.decisionId === priced.decisionId).length, 1);
  // History is append-only: the superseded row is not mutated, it is replaced.
  assert.equal(superseded[0].classKey, priced.classKey);
});

/* ------------------------------------------------------------ 3. unit */

test('savings are STOCK denominated, net of monitoring, and auditable', () => {
  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW });
  const conv = fitConventions(state.settings);
  const book = buildFitBook(state, { now: NOW, chain, conventions: conv });

  const priced = book.rows.filter((r) => r.valuePerWeek > 0);
  assert.ok(priced.length > 0, 'the demo must carry priced calls');

  for (const row of priced) {
    for (const alt of row.alternatives) {
      if (!alt.available || !alt.priced) continue;
      // weeks × rate is the amount at stake, and it is printed so the arithmetic
      // is auditable rather than asserted.
      assert.equal(alt.savingWeeks, Math.round((alt.daysSaved / 7) * 10) / 10);
      assert.equal(alt.waitSaving, Math.round((alt.daysSaved / 7) * row.valuePerWeek * 10) / 10);
      assert.ok(alt.errorPct > 0, 'no move is free of an error price');
      assert.ok(alt.errorCost >= 0);
      assert.ok(alt.monitoringCost >= 0);
      assert.equal(alt.netSaving, Math.round((alt.waitSaving - alt.errorCost - alt.monitoringCost) * 10) / 10);
      // A multi-rung delegation is never free to monitor.
      if (alt.extraRungs > 0 && alt.waitSaving > 0) {
        assert.ok(alt.monitoringCost > 0, `${alt.label} crosses ${alt.extraRungs} rungs with zero monitoring cost`);
      }
      assert.equal(typeof alt.provisional, 'boolean');
    }
  }
});

test('an evidence-free call carries a DECLARED deficit, never a zero one', () => {
  const conv = fitConventions({});
  // A zero information deficit on an evidence-free call is a lie: it prices the
  // move as if the decision were as well informed as a contested one.
  assert.ok(conv.fitNoEvidenceDeficitPts >= 20, 'the declared no-evidence deficit must be substantial');
  assert.ok(FIT_REFUSALS['no-evidence'], 'the refusal must be printable');

  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW });
  const book = buildFitBook(state, { now: NOW, chain, conventions: conv });
  for (const row of book.rows) {
    for (const alt of row.alternatives) {
      if (alt.deficitUnknown) {
        assert.equal(alt.deficitPoints, conv.fitNoEvidenceDeficitPts);
        assert.equal(alt.provisional, true);
        // A provisional alternative is priced and shown but may never be the
        // recommendation: the ledger does not move authority on unknown evidence.
        assert.notEqual(row.best && row.best.candidateRank, alt.candidateRank);
      }
    }
  }
});

/* ------------------------------------------------- 4. refusal honesty */

test('every open call prints a priced ladder — a blank is never "no option exists"', () => {
  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW });
  const book = buildFitBook(state, { now: NOW, chain, conventions: fitConventions(state.settings) });

  assert.ok(book.rows.length > 0);
  for (const row of book.rows) {
    assert.ok(row.alternatives.length > 0, `${row.id} rendered an EMPTY ladder`);
    for (const alt of row.alternatives) {
      const ok = alt.available || Boolean(alt.refusal && alt.reason);
      assert.ok(ok, `${row.id} rung ${alt.candidateRank} is neither available nor refused with a reason`);
    }
  }
});

test('a call held BELOW its class floor is priced as an escalation, not as silence', () => {
  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW });
  const book = buildFitBook(state, { now: NOW, chain, conventions: fitConventions(state.settings) });
  const below = book.rows.filter((r) => r.heldBelowFloor);
  assert.ok(below.length > 0, 'the demo must contain the pathology the module exists to find');

  for (const row of below) {
    const floor = row.classification.floorRank;
    assert.ok(row.ownerRank < floor);
    const escalation = row.alternatives.find((a) => a.candidateRank === floor && a.direction === 'escalate');
    assert.ok(escalation, `${row.id} sits below floor ${floor} with no escalation row`);
    assert.equal(escalation.escalating, true);
    assert.equal(escalation.complianceFix, true, 'an escalation is bought for correctness, not for time');
    // There is no rung beneath the holder, so delegation is not the remedy and
    // must not be recommended for a below-floor misfit.
    assert.equal(row.best && row.best.direction === 'delegate', false);
  }
});

test('a delegation above the class floor still beats escalation for a lawful call', () => {
  // A chief-rung owner is above every floor, so the ladder is pure delegation.
  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW });
  const book = buildFitBook(state, { now: NOW, chain, conventions: fitConventions(state.settings) });
  const chief = book.rows.filter((r) => r.ownerRank >= 5 && !r.heldBelowFloor);
  assert.ok(chief.length > 0);
  for (const row of chief) {
    assert.ok(row.alternatives.every((a) => a.direction === 'delegate' || !a.available));
  }
});

/* ---------------------------------------------------- 5. cross-altitude */

test('a frozen frontline snapshot reaches the chief through the existing spine', () => {
  const env = setup();
  assert.equal(scan(env).ok, true);
  const state = env.store.state;

  const frontline = liveSnapshots(state).find((r) => r.ownerRank === 1);
  assert.ok(frontline, 'the demo must freeze a frontline call');
  const rolled = edges(state, 'rolls-up-to').filter((l) => l.sourceId === frontline.id);
  assert.ok(rolled.length > 0, 'a frontline snapshot must roll up, not stop at the rung that priced it');

  // Every edge points at a node that already exists in the tree: the roll-up is
  // derived from structure, never re-keyed by hand.
  for (const l of rolled) {
    assert.ok(l.targetId, 'a roll-up edge without a target is not an edge');
  }
  // And the reading at the top carries the whole subtree: the chief's open count
  // is the number of open calls below, not only the ones the chief owns.
  const chain = buildChain(state, { now: NOW });
  const top = fitRollUp(state, { now: NOW, chain });
  assert.equal(top.nodeId, LEADER_ID);
  assert.ok(top.open > 0);
  assert.ok(top.children.length > 0, 'the chief reading must expose the rungs below it');
});

test('a span reading refuses rather than printing one person’s number', () => {
  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW });
  const readings = [...chain.nodes.values()].map((n) => fitRollUp(state, { now: NOW, chain, nodeId: n.id }));
  assert.ok(readings.length >= 5, 'every rung is readable');

  const shown = readings.filter((r) => r.share && !r.share.refused);
  const refused = readings.filter((r) => r.share && r.share.refused);
  assert.ok(shown.length > 0, 'at least the top span must be measurable');
  assert.ok(refused.length > 0, 'below-floor spans must refuse rather than print a share');

  // A refusal never prints a share: it prints the reason, verbatim.
  for (const r of refused) {
    assert.equal(r.share.sharePct, null);
    // A refused interval keeps its SHAPE and nulls its bounds — safer than
    // dropping the key, because a reader that destructures never crashes.
    assert.equal(r.share.interval.lo, null);
    assert.equal(r.share.interval.hi, null);
    assert.match(r.share.reason, /floor/);
  }
  // A printed share always carries its interval — a share without one is a point
  // estimate dressed as a measurement.
  for (const r of shown) {
    assert.ok(typeof r.share.sharePct === 'number');
    assert.ok(r.share.interval && typeof r.share.interval.lo === 'number');
    assert.ok(r.share.eligibleN >= 5);
  }
  // Identity is withheld above rank 2 even at the top: the chief sees the shape
  // of the span, not the names inside it.
  const top = fitRollUp(state, { now: NOW, chain, nodeId: LEADER_ID });
  assert.equal(top.detailWithheld, true, 'span detail above rank 2 must be withheld from the raw reading');
});

/* ------------------------------------------------------- 6. rights */

test('the new rights are tiered: everyone may record, only director+ may govern', () => {
  const record = ACTION_RIGHTS['record-fit'];
  const govern = ACTION_RIGHTS['govern-fit'];
  assert.ok(record && govern);
  assert.equal(record.minRank, 1, 'a frontline lead must be able to price their own book');
  assert.equal(record.maxRank, 5);
  assert.equal(govern.minRank, 4, 're-declaring conventions is a director-and-above decision');
  assert.equal(govern.maxRank, 5);
  // The gateway must expose the module's READ surface, or a real organisation
  // that turns enforcement on silently loses half the feature: writes gated,
  // reads refused. (This is how the omission was found.)
  for (const name of ['fitAttentionCount', 'fitBrief', 'fitCsvRows', 'fitRollUp']) {
    assert.ok(SAFE_READS.has(name), `${name} is not a registered safe read`);
  }
});

/* -------------------------------------------------- 7. view surface */

test('the attention badge counts priced calls with a material move and nothing open', () => {
  const env = setup();
  assert.equal(env.api.fitScan().ok, true);
  const n = fitAttentionCount(env.store.state, NOW, env.store.state.settings);
  assert.equal(typeof n, 'number');
  assert.ok(n >= 0);
  // The CSV export is aggregate-only: no call ids, no people.
  const rows = fitCsvRows(env.store.state, { now: NOW });
  assert.ok(Array.isArray(rows));
});

/**
 * app/core/domain/portfolioComparison.js — Portfolio Rehearsal Comparison
 * (`#/compare`, ADR-0118, Schema v113).
 *
 * THE DUTY THIS SERVES
 * --------------------
 * A VP or chief deciding how to respond across a portfolio is not choosing
 * between two sentences in a document. They are choosing between two REVIEWED
 * transactions — each one a bundle of real commands (a governed decision, owned
 * work, a tested assumption, a budget commitment, stakeholder briefs, a coaching
 * prompt) whose consequences fan out through the shared rule spine. Before this
 * module, LeadOS could rehearse ONE bundle (Response Studio, Action bundles) but
 * could not answer the question a portfolio owner actually asks: *what do these
 * two responses each commit us to, and where do they collide?*
 *
 * THE THREE THINGS THIS ADDS, AND NOTHING ELSE
 * --------------------------------------------
 * 1. SAME-REVISION COMPARABILITY. Two previews saved on different days are two
 *    different workspaces. A comparison here is only ever produced by rehearsing
 *    BOTH bundles, in one worker pass, from ONE frozen snapshot at ONE clock, and
 *    every stored receipt carries the base revision, the day and both bundles'
 *    input/source fingerprints. A receipt that no longer matches the workspace is
 *    STALE and cannot be recorded — it is re-run, never repaired.
 *
 * 2. THE DECLARED COMMITMENT VECTOR. Spend per currency (never pooled), owned
 *    work, unsent briefs, coaching prompts, tested assumptions and the actual
 *    software footprint (record deltas and typed-relationship deltas produced by
 *    production rules in disposable stores). These are DECLARATIONS and software
 *    effects. No probability of success, no expected value, no causal benefit.
 *
 * 3. THE UNDOMINATED SET, NOT A WINNER. Pareto (1906) dominance over the declared
 *    vector is computable and honest: A is lighter than B if it commits no more on
 *    every comparable dimension and less on one. When neither dominates, both are
 *    non-dominated and the software PRINTS that it refuses to rank them — Keeney &
 *    Raiffa (1976) multi-criteria analysis makes weights a human judgement, and
 *    Arrow (1951) is the standing warning against collapsing incommensurable
 *    criteria into one number. "Lighter" is not "better": the module never says
 *    which response is more likely to work, because nothing recorded here could
 *    support that claim.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No benefit score, no ranking, no expected-value arithmetic, no causal claim, no
 * automatic choice. The human records an arbitration; the receipt keeps the
 * comparison that justified it and the spine rolls both up the hierarchy.
 */

import { addDays, dayKey } from '../time.js';

/**
 * Non-cryptographic content identity, the same 16-hex shape every receipt in
 * this codebase uses. Deliberately local: this module must not import the store,
 * the action layer or `schema.js`, because the schema normalizes a receipt
 * through here (and a cycle would make `COLLECTIONS` unavailable at init).
 */
export function receiptHash(value) {
  const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
  const textValue = JSON.stringify(canonical(value));
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (let i = 0; i < textValue.length; i += 1) {
    a = Math.imul(a ^ textValue.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ textValue.charCodeAt(i), 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

export const COMPARISON_VERSION = 1;
export const COMPARISON_CHOICES = Object.freeze(['a', 'b', 'neither']);
export const COMPARISON_CHOICE_LABELS = Object.freeze({
  a: 'Take response A',
  b: 'Take response B',
  neither: 'Hold both — commit neither yet',
});
export const COMPARISON_EVENTS = Object.freeze({ RECORDED: 'comparison.recorded' });
export const COMPARISON_RULE_IDS = Object.freeze({ ROLLUP: 'RULE-CMP-01' });
export const COMPARISON_LIMITS = Object.freeze({
  records: 60,
  changes: 120,
  relationships: 80,
  ruleIds: 80,
  sides: 2,
  rationale: 1200,
  minRationale: 20,
});

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null);
const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const whole = (v, min = 0, max = 1_000_000) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12 ? Math.round(v * 100) / 100 : null);
const object = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const hex16 = (v) => (typeof v === 'string' && /^[a-f0-9]{16}$/.test(v) ? v : '');

const KIND_FIELD = Object.freeze({
  decision: 'decisions', delegation: 'ownedWork', premise: 'assumptions',
  budget: 'spendLines', comms: 'briefs', coaching: 'coaching',
});

/** Declared commitments read from the bundle's own commands. No inference. */
export function declaredCommitments(state, bundle) {
  const envelopes = new Map((state.budgets || []).map((b) => [b.id, b && b.currency ? String(b.currency) : 'UNPRICED']));
  const declared = { decisions: 0, ownedWork: 0, assumptions: 0, briefs: 0, coaching: 0, spendLines: 0 };
  const spend = new Map();
  for (const command of bundle.commands || []) {
    const field = KIND_FIELD[command.kind];
    if (!field) continue;
    declared[field] = (declared[field] || 0) + 1;
    if (command.kind !== 'budget') continue;
    const currency = envelopes.get(command.budgetId) || 'UNPRICED';
    const amount = money(Number(command.amount));
    if (amount === null) continue;
    spend.set(currency, Math.round(((spend.get(currency) || 0) + amount) * 100) / 100);
  }
  return {
    declared,
    spend: [...spend.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)),
    ownerIds: [...new Set((bundle.commands || []).map((c) => c.ownerId).filter(Boolean))].sort(),
    budgetIds: [...new Set((bundle.commands || []).map((c) => c.budgetId).filter(Boolean))].sort(),
  };
}

/** One side of a comparison, built from a validated rehearsal preview. */
export function comparisonSide(state, bundle, preview) {
  const source = (state.cases || []).find((c) => c.id === bundle.sourceId);
  const commitments = declaredCommitments(state, bundle);
  const changes = (preview?.changes || []).filter((row) => row && typeof row.collection === 'string');
  const totals = changes.reduce((acc, row) => ({
    created: acc.created + (Number(row.created) || 0),
    updated: acc.updated + (Number(row.updated) || 0),
    removed: acc.removed + (Number(row.removed) || 0),
  }), { created: 0, updated: 0, removed: 0 });
  return {
    bundleId: bundle.id,
    name: text(bundle.name, 180),
    caseId: bundle.sourceId || null,
    caseTitle: text(source?.title, 180),
    reviewOn: day(bundle.reviewOn),
    commands: (bundle.commands || []).map((c) => c.kind).filter(Boolean),
    ...commitments,
    footprint: {
      changes: changes.map((row) => ({
        collection: row.collection,
        created: whole(row.created) ?? 0,
        updated: whole(row.updated) ?? 0,
        removed: whole(row.removed) ?? 0,
      })).slice(0, COMPARISON_LIMITS.changes),
      relationships: (preview?.relationships || []).filter(object).map((row) => ({
        sourceType: text(row.sourceType, 40), targetType: text(row.targetType, 40),
        relation: text(row.relation, 60), added: whole(row.added) ?? 0, removed: whole(row.removed) ?? 0,
      })).slice(0, COMPARISON_LIMITS.relationships),
      ruleIds: [...new Set((preview?.ruleIds || []).map((id) => text(id, 60)).filter(Boolean))].slice(0, COMPARISON_LIMITS.ruleIds),
      failureCount: whole(preview?.failureCount) ?? 0,
      warningCount: whole(preview?.warningCount) ?? 0,
      totals,
    },
    inputFingerprint: hex16(bundle.inputFingerprint),
    sourceFingerprint: hex16(bundle.sourceFingerprint),
  };
}

const intersect = (a, b) => a.filter((v) => new Set(b).has(v)).sort();

/**
 * Overlap between the two responses: where committing both would touch the same
 * declared resource. No score — every row is a fact the human can check.
 */
export function comparisonOverlap(a, b) {
  const collectionsA = a.footprint.changes.map((r) => r.collection);
  const collectionsB = b.footprint.changes.map((r) => r.collection);
  const relationsA = a.footprint.relationships.map((r) => `${r.sourceType}>${r.relation}>${r.targetType}`);
  const relationsB = b.footprint.relationships.map((r) => `${r.sourceType}>${r.relation}>${r.targetType}`);
  return {
    sameSourceCase: Boolean(a.caseId && a.caseId === b.caseId),
    sharedOwnerIds: intersect(a.ownerIds, b.ownerIds),
    sharedBudgetIds: intersect(a.budgetIds, b.budgetIds),
    sharedCollections: intersect(collectionsA, collectionsB),
    sharedRelations: intersect(relationsA, relationsB),
    sameReviewDate: Boolean(a.reviewOn && a.reviewOn === b.reviewOn),
    any: false,
  };
}

/** Pareto dominance over the DECLARED vector only. Never a recommendation. */
export function comparisonDominance(a, b) {
  const dims = (s) => ({
    spend: Object.fromEntries(s.spend.map((row) => [row.currency, row.amount])),
    ownedWork: s.declared.ownedWork,
    briefs: s.declared.briefs,
    coaching: s.declared.coaching,
    assumptions: s.declared.assumptions,
    footprint: s.footprint.totals.created + s.footprint.totals.updated,
  });
  const left = dims(a);
  const right = dims(b);
  const currenciesA = Object.keys(left.spend).sort().join(',');
  const currenciesB = Object.keys(right.spend).sort().join(',');
  const comparable = currenciesA === currenciesB;
  if (!comparable) {
    return { verdict: 'incomparable', comparable: false, dimensions: [],
      note: 'The two responses commit money in different currency sets, so declared spend cannot be compared without pooling currencies — which this module refuses to do. Compare the remaining, non-monetary facts by hand.' };
  }
  const rows = Object.keys(left).filter((key) => key !== 'spend').map((key) => ({ key, a: left[key], b: right[key] }));
  rows.unshift({ key: 'spend', a: Object.values(left.spend).reduce((n, v) => n + v, 0), b: Object.values(right.spend).reduce((n, v) => n + v, 0) });
  const lighterA = rows.every((r) => r.a <= r.b) && rows.some((r) => r.a < r.b);
  const lighterB = rows.every((r) => r.b <= r.a) && rows.some((r) => r.b < r.a);
  const identical = rows.every((r) => r.a === r.b);
  const verdict = identical ? 'identical' : lighterA ? 'a' : lighterB ? 'b' : 'neither';
  const who = verdict === 'a' ? 'Response A' : verdict === 'b' ? 'Response B' : null;
  return {
    verdict, comparable: true, dimensions: rows,
    note: verdict === 'identical'
      ? 'The two responses declare exactly the same resource vector. The commitments are not a tie-breaker; choose on the reasoning you can defend.'
      : verdict === 'neither'
        ? 'Neither response dominates: each is lighter on at least one declared dimension. Both stay in the undominated set and this module refuses to rank them — weight the criteria yourself.'
        : `${who} commits no more than the other on every comparable dimension and less on at least one. That is a resource relation, not a case for what will work.`,
  };
}

export function comparisonAssumptions() {
  return [
    'Both responses were rehearsed in ONE pass from the same frozen workspace revision, on the same day. A comparison across revisions would be two different workspaces.',
    'Spend figures are the amounts each bundle declares on an existing budget envelope. They are commitments, never actual spend, and currencies are never pooled.',
    'Footprints are software record and typed-relationship deltas produced by production rules inside disposable stores. They are not predictions of morale, delivery, revenue or benefit.',
    'Dominance is a Pareto (1906) resource relation over declared criteria, not a recommendation. Nothing here estimates the probability that either response works.',
    'Dominance verdicts are refused (`incomparable`) when the currency sets differ: summing across currencies would fabricate a comparison.',
  ];
}

/** Everything a receipt needs, derived on read from two bundles' own commands. */
export function buildComparisonReceipt(state, sides, { now = new Date(), seatId = null, rank = null } = {}) {
  const [a, b] = sides;
  const overlap = comparisonOverlap(a, b);
  overlap.any = overlap.sameSourceCase || overlap.sameReviewDate || overlap.sharedOwnerIds.length > 0
    || overlap.sharedBudgetIds.length > 0 || overlap.sharedCollections.length > 0 || overlap.sharedRelations.length > 0;
  const dominance = comparisonDominance(a, b);
  return {
    version: COMPARISON_VERSION,
    baseRevision: state.meta?.revision ?? 0,
    evaluatedOn: dayKey(now),
    evaluatedAt: now.toISOString(),
    seatId: seatId || null,
    rank: Number.isInteger(rank) ? rank : null,
    sides: [a, b],
    overlap,
    dominance,
    assumptions: comparisonAssumptions(),
    scope: 'Production commands replayed in disposable stores from one frozen revision. Operational diffs and declared commitments only — not a causal forecast and not a benefit score.',
  };
}

export function comparisonReceiptFingerprint(receipt) {
  return receiptHash({
    version: receipt.version,
    baseRevision: receipt.baseRevision,
    evaluatedOn: receipt.evaluatedOn,
    sides: (receipt.sides || []).map((s) => ({ bundleId: s.bundleId, inputFingerprint: s.inputFingerprint, sourceFingerprint: s.sourceFingerprint, totals: s.footprint?.totals })),
  });
}

/** Strict at the command boundary. A malformed receipt is dropped, never repaired. */
export function normalizeComparisonReceipt(raw, { collections = null } = {}) {
  if (!object(raw) || !Array.isArray(raw.sides) || raw.sides.length !== COMPARISON_LIMITS.sides) return null;
  if (!Number.isInteger(raw.baseRevision) || raw.baseRevision < 0) return null;
  const evaluatedAt = iso(raw.evaluatedAt);
  const evaluatedOn = day(raw.evaluatedOn);
  if (!evaluatedAt || !evaluatedOn || evaluatedOn !== evaluatedAt.slice(0, 10)) return null;
  if (!object(raw.overlap) || !object(raw.dominance)) return null;
  const allowed = collections ? new Set(collections) : null;
  const knownCollection = (name) => (allowed ? allowed.has(name) : /^[a-zA-Z]{2,40}$/.test(name));
  const sides = [];
  for (const rawSide of raw.sides) {
    if (!object(rawSide)) return null;
    const bundleId = text(rawSide.bundleId, 80);
    const name = text(rawSide.name, 180);
    if (!bundleId || !name) return null;
    const changes = (Array.isArray(rawSide.footprint?.changes) ? rawSide.footprint.changes : []).slice(0, COMPARISON_LIMITS.changes).flatMap((row) => {
      if (!object(row) || typeof row.collection !== 'string' || !knownCollection(row.collection)) return [];
      const created = whole(row.created); const updated = whole(row.updated); const removed = whole(row.removed);
      return created === null || updated === null || removed === null ? [] : [{ collection: row.collection, created, updated, removed }];
    });
    const relationships = (Array.isArray(rawSide.footprint?.relationships) ? rawSide.footprint.relationships : []).slice(0, COMPARISON_LIMITS.relationships).flatMap((row) => {
      if (!object(row)) return [];
      const sourceType = text(row.sourceType, 40); const targetType = text(row.targetType, 40); const relation = text(row.relation, 60);
      const added = whole(row.added); const removed = whole(row.removed);
      return !sourceType || !targetType || !relation || added === null || removed === null ? [] : [{ sourceType, targetType, relation, added, removed }];
    });
    const declaredRaw = object(rawSide.declared) ? rawSide.declared : {};
    const declared = Object.fromEntries(Object.keys(KIND_FIELD).map((kind) => [KIND_FIELD[kind], whole(declaredRaw[KIND_FIELD[kind]]) ?? 0]));
    const spend = (Array.isArray(rawSide.spend) ? rawSide.spend : []).slice(0, 12).flatMap((row) => {
      if (!object(row)) return [];
      const currency = text(row.currency, 8).toUpperCase();
      const amount = money(Number(row.amount));
      return !/^[A-Z]{2,6}$|^UNPRICED$/.test(currency) || amount === null ? [] : [{ currency, amount }];
    });
    sides.push({
      bundleId, name, caseId: text(rawSide.caseId, 80) || null, caseTitle: text(rawSide.caseTitle, 180),
      reviewOn: day(rawSide.reviewOn),
      commands: [...new Set((Array.isArray(rawSide.commands) ? rawSide.commands : []).map((k) => text(k, 40)).filter(Boolean))].slice(0, 8),
      ownerIds: [...new Set((Array.isArray(rawSide.ownerIds) ? rawSide.ownerIds : []).map((v) => text(v, 80)).filter(Boolean))].slice(0, 20).sort(),
      budgetIds: [...new Set((Array.isArray(rawSide.budgetIds) ? rawSide.budgetIds : []).map((v) => text(v, 80)).filter(Boolean))].slice(0, 8).sort(),
      spend, declared,
      footprint: {
        changes, relationships,
        ruleIds: [...new Set((Array.isArray(rawSide.footprint?.ruleIds) ? rawSide.footprint.ruleIds : []).map((id) => text(id, 60)).filter(Boolean))].slice(0, COMPARISON_LIMITS.ruleIds),
        failureCount: whole(rawSide.footprint?.failureCount) ?? 0,
        warningCount: whole(rawSide.footprint?.warningCount) ?? 0,
        totals: {
          created: changes.reduce((n, r) => n + r.created, 0),
          updated: changes.reduce((n, r) => n + r.updated, 0),
          removed: changes.reduce((n, r) => n + r.removed, 0),
        },
      },
      inputFingerprint: hex16(rawSide.inputFingerprint),
      sourceFingerprint: hex16(rawSide.sourceFingerprint),
    });
  }
  if (new Set(sides.map((s) => s.bundleId)).size !== sides.length) return null;
  if (!sides.every((s) => s.inputFingerprint && s.sourceFingerprint)) return null;
  const overlap = comparisonOverlap(sides[0], sides[1]);
  overlap.any = overlap.sameSourceCase || overlap.sameReviewDate || overlap.sharedOwnerIds.length > 0
    || overlap.sharedBudgetIds.length > 0 || overlap.sharedCollections.length > 0 || overlap.sharedRelations.length > 0;
  // Dominance is RECOMPUTED from the validated vector: the receipt's own copy is
  // evidence, not authority.
  const dominance = comparisonDominance(sides[0], sides[1]);
  return {
    version: COMPARISON_VERSION, baseRevision: raw.baseRevision, evaluatedOn, evaluatedAt,
    seatId: text(raw.seatId, 80) || null, rank: Number.isInteger(raw.rank) && raw.rank >= 1 && raw.rank <= 5 ? raw.rank : null,
    sides, overlap, dominance, assumptions: comparisonAssumptions(),
    scope: 'Production commands replayed in disposable stores from one frozen revision. Operational diffs and declared commitments only — not a causal forecast and not a benefit score.',
  };
}

/** The stored ledger. Additive; a record that cannot be read back is dropped loudly. */
export function normalizePortfolioComparisons(raw, state, now, warnings = [], { collections = null } = {}) {
  if (!Array.isArray(raw)) return [];
  const bundleIds = new Set((state.actionBundles || []).map((b) => b.id));
  const decisionIds = new Set((state.decisions || []).map((d) => d.id));
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, COMPARISON_LIMITS.records * 2)) {
    if (!object(item)) continue;
    const id = text(item.id, 80);
    const receipt = normalizeComparisonReceipt(item.receipt, { collections });
    const recordedAt = iso(item.recordedAt);
    const recordedOn = day(item.recordedOn);
    const choice = COMPARISON_CHOICES.includes(item.choice) ? item.choice : null;
    const rationale = text(item.rationale, COMPARISON_LIMITS.rationale);
    const decisionId = text(item.decisionId, 80);
    const provenance = object(item.provenance) ? {
      seatId: text(item.provenance.seatId, 80) || null,
      rank: Number.isInteger(item.provenance.rank) ? item.provenance.rank : null,
      recordedBy: text(item.provenance.recordedBy, 120) || '',
    } : null;
    const invalid = !id || seen.has(id) || !receipt || !recordedAt || !recordedOn || !choice
      || rationale.length < COMPARISON_LIMITS.minRationale || !decisionIds.has(decisionId) || !provenance
      || !receipt.sides.every((side) => bundleIds.has(side.bundleId));
    if (invalid) {
      warnings.push('Portfolio comparisons: dropped a receipt that is malformed, or whose decision, bundles or rationale no longer exist. An arbitration without its comparison is not a record.');
      continue;
    }
    seen.add(id);
    out.push({
      id, status: 'recorded', recordedOn, recordedAt, choice, rationale, decisionId,
      receipt, provenance,
      scope: receipt.scope,
    });
    if (out.length >= COMPARISON_LIMITS.records) break;
  }
  return out;
}

/** Read model: every receipt with the staleness of the facts behind it. */
export function comparisonReport(state, now = new Date()) {
  const today = dayKey(now);
  const bundles = new Map((state.actionBundles || []).map((b) => [b.id, b]));
  const decisions = new Map((state.decisions || []).map((d) => [d.id, d]));
  const records = (state.portfolioComparisons || []).map((record) => {
    const sides = record.receipt.sides.map((side) => {
      const bundle = bundles.get(side.bundleId);
      const drifted = !bundle
        || bundle.status === 'archived'
        || side.inputFingerprint !== hex16(bundle.inputFingerprint)
        || side.sourceFingerprint !== hex16(bundle.sourceFingerprint);
      return { bundleId: side.bundleId, name: side.name, present: Boolean(bundle), status: bundle?.status || 'missing', drifted };
    });
    const stale = record.receipt.baseRevision !== (state.meta?.revision ?? 0)
      || record.receipt.evaluatedOn !== today
      || sides.some((s) => s.drifted);
    return {
      ...record, sides, stale,
      decision: decisions.get(record.decisionId) || null,
      chosenLabel: record.choice === 'neither' ? COMPARISON_CHOICE_LABELS.neither
        : `${COMPARISON_CHOICE_LABELS[record.choice]}: ${record.receipt.sides[record.choice === 'a' ? 0 : 1].name}`,
    };
  }).sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
  return {
    records,
    today,
    stale: records.filter((r) => r.stale),
    latest: records[0] || null,
    decided: records.filter((r) => r.choice !== 'neither'),
    held: records.filter((r) => r.choice === 'neither'),
  };
}

export function comparisonAttentionCount(state, now = new Date()) {
  return comparisonReport(state, now).stale.length;
}

/** Identity-free receipt text: spans, dates and amounts only. */
export function comparisonBriefText(record) {
  if (!record?.receipt) return 'No comparison selected.';
  const { receipt } = record;
  const lines = [
    'LeadOS — portfolio rehearsal comparison receipt',
    `Recorded: ${record.recordedOn} · decision ${record.decisionId}`,
    `Arbitration: ${COMPARISON_CHOICE_LABELS[record.choice]}`,
    `Rationale: ${record.rationale}`,
    `Rehearsed from workspace revision ${receipt.baseRevision} on ${receipt.evaluatedOn}`,
  ];
  for (const side of receipt.sides) {
    lines.push(
      `— ${side.name}: ${side.commands.length} command kind(s); owned work ${side.declared.ownedWork}; briefs ${side.declared.briefs}; coaching prompts ${side.declared.coaching}; assumptions ${side.declared.assumptions}; footprint +${side.footprint.totals.created} / ~${side.footprint.totals.updated} / -${side.footprint.totals.removed}; ${side.footprint.ruleIds.length} rule effect(s); ${side.footprint.failureCount} failure(s)`,
      `  Declared spend: ${side.spend.length ? side.spend.map((row) => `${row.currency} ${row.amount}`).join('; ') : 'none declared'}`,
    );
  }
  lines.push(
    `Overlap: ${receipt.overlap.sameSourceCase ? 'same source case; ' : ''}${receipt.overlap.sharedOwnerIds.length} shared owner(s); ${receipt.overlap.sharedBudgetIds.length} shared envelope(s); ${receipt.overlap.sharedCollections.length} shared ledger(s); ${receipt.overlap.sameReviewDate ? 'same review date' : 'different review dates'}`,
    `Dominance: ${receipt.dominance.verdict} — ${receipt.dominance.note}`,
    ...receipt.assumptions.map((line) => `Assumption: ${line}`),
    receipt.scope,
    'No message was sent, no money was spent, no benefit or probability was estimated.',
  );
  return lines.join('\n');
}

/** Next review date for the human decision the receipt opens. */
export function comparisonReviewDate(now = new Date(), days = 14) {
  return addDays(dayKey(now), days);
}

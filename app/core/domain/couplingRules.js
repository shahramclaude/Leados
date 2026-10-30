/**
 * app/core/domain/couplingRules.js — Post-commit rules for the Coupled Load
 * Terminal (Schema v61).
 *
 * Four marker-idempotent rules on the shared post-commit spine:
 *
 *   RULE-COUP-01: When a decision is created or updated, scan for other
 *     decisions that share its approver and write a typed `shares-approver`
 *     edge between them. One edge per pair, idempotent.
 *
 *   RULE-COUP-02: When an approver serves `couplingBottleneckActors` or more
 *     distinct drivers, open ONE DACI decision about the approval mechanism
 *     (the bottleneck, not the work). Idempotent per approver.
 *
 *   RULE-COUP-03: When a measured hand-off path exceeds
 *     `couplingHandoffMaxChain` hops, open ONE owned delegation to shorten it
 *     (or a DACI decision when the start actor is not a roster person).
 *     Idempotent per path key.
 *
 *   RULE-COUP-04: When a shared approver's priced Kingman delay exceeds
 *     `couplingDelayThresholdDays` for any stream, open ONE DACI decision to
 *     re-sequence or batch the approvals. Idempotent per approver.
 *
 * The rule is a plain FUNCTION — `postCommit.js` invokes only rules whose
 * `typeof rule === 'function'`. Metadata is attached as properties so
 * `describePropagationContracts` can read it, while the spine still runs the
 * function itself (the pattern `leaderCalibrationRule` established).
 *
 * Pure module: no DOM, no storage, no network, no ambient clock. It reads the
 * draft it is given and mutates only that draft.
 */

import {
  buildCouplingReport,
  normalizeName,
  COUPLING_DEFAULTS,
} from './coupling.js';

export const COUPLING_RULE_VERSION = 1;

/**
 * IDs for records this rule creates. The spine passes its own deterministic
 * `idFactory` (the store's counter) so that two savepoint strategies — eager
 * deep copy and copy-on-write — commit byte-identical workspaces. The fallback
 * is a per-call counter, never `Date.now()`: a wall-clock timestamp would make
 * the rule non-deterministic and break the savepoint equivalence suite.
 */
function makeIdFactory(ctx) {
  if (typeof ctx.idFactory === 'function') return ctx.idFactory;
  let seq = 0;
  return (prefix) => `${prefix}-${(seq += 1)}`;
}

function str(v, fallback = '') {
  return typeof v === 'string' && v ? v : fallback;
}

function todayKey(now) {
  const d = now instanceof Date ? now : new Date(now);
  return d.toISOString().slice(0, 10);
}

function markerExists(draft, key) {
  return (Array.isArray(draft.couplingMarkers) ? draft.couplingMarkers : []).includes(key);
}

function addMarker(draft, key) {
  if (!Array.isArray(draft.couplingMarkers)) draft.couplingMarkers = [];
  if (!draft.couplingMarkers.includes(key)) draft.couplingMarkers.push(key);
}

function ensureLink(draft, makeId, now, sourceType, sourceId, targetType, targetId, relation, summary) {
  if (!draft.links) draft.links = [];
  const exists = draft.links.some((l) => l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: makeId('lnk'),
    sourceType, sourceId, targetType, targetId, relation,
    summary: summary || '',
    createdAt: todayKey(now),
    kind: 'system',
  });
  return true;
}

function decisionRecord(draft, makeId, now, data) {
  const decision = {
    id: data.id || makeId('dec'),
    title: data.title || 'Untitled decision',
    question: data.question || '',
    date: todayKey(now),
    reversibility: 'reversible',
    driver: data.driver || '',
    approver: data.approver || '',
    contributors: data.contributors || '',
    informed: data.informed || '',
    options: (data.options || []).map((o) => ({
      id: makeId('dopt'),
      label: o.label || o.title || '',
      pros: o.pros || o.rationale || '',
      cons: o.cons || '',
    })).filter((o) => o.label),
    chosen: '',
    rationale: data.rationale || '',
    reviewOn: data.reviewOn || null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: now.toISOString(),
    portfolioNotes: [],
  };
  if (!draft.decisions) draft.decisions = [];
  draft.decisions.push(decision);
  return decision;
}

function option(label, pros, cons = '') {
  return { label, pros, cons };
}

function note(out, logEvent, effect) {
  out.push(effect);
  if (typeof logEvent === 'function') {
    logEvent({
      type: 'automation.propagated',
      entity: 'coupling',
      entityId: effect.targetId || '',
      summary: effect.summary,
    });
  }
}

function renderChain(chain, byKey) {
  return chain.actors.map((k) => ((byKey && byKey.get(k)) || { name: k }).name).join(' → ');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function couplingRule(draft, ctx = {}) {
  const { event, now = new Date(), out = [], markers = [], logEvent, emitEvent, warnings = [] } = ctx;
  const makeId = makeIdFactory(ctx);
  if (!event || !draft) return;

  const type = str(event.type);
  if (!['decision.created', 'decision.updated', 'link.created'].includes(type)) return;

  const settings = { ...COUPLING_DEFAULTS, ...(ctx.settings || {}) };
  if (settings.couplingAutoPropagate === false && type !== 'coupling.scan') return;

  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const state = draft;

  // ---- RULE-COUP-01: shared-approver typed edges -------------------------
  if (type === 'decision.created' || type === 'decision.updated') {
    const changedId = event.entityId || '';
    const changed = decisions.find((d) => d.id === changedId);
    if (changed && str(changed.approver)) {
      const norm = normalizeName(changed.approver);
      for (const other of decisions) {
        if (other.id === changed.id) continue;
        if (normalizeName(other.approver) !== norm) continue;
        const key = `coup:COUP-01:${changed.id}:${other.id}`;
        if (markerExists(draft, key)) continue;
        const cmp = changed.id < other.id ? [changed, other] : [other, changed];
        if (ensureLink(draft, makeId, now, 'decision', cmp[0].id, 'decision', cmp[1].id, 'shares-approver',
          `Both decisions are approved by "${changed.approver}"`)) {
          addMarker(draft, key);
          if (Array.isArray(markers)) markers.push(key);
          note(out, logEvent, {
            rule: 'RULE-COUP-01',
            summary: `Coupling edge: ${cmp[0].title || cmp[0].id} ↔ ${cmp[1].title || cmp[1].id} share approver "${changed.approver}"`,
            targetId: cmp[1].id,
            collection: 'links',
          });
        }
      }
    }
  }

  // ---- Full report (coupling.scan) or a decision change -------------------
  const report = buildCouplingReport(state, now, settings);

  // ---- RULE-COUP-02: shared approval bottleneck --------------------------
  if (type === 'decision.created' || type === 'decision.updated' || type === 'coupling.scan') {
    for (const b of report.bottlenecks) {
      if (b.kind !== 'approver') continue;
      if (b.actorsServed < settings.couplingBottleneckActors) continue;
      const key = `coup:COUP-02:${normalizeName(b.actor)}`;
      if (markerExists(draft, key)) continue;
      const driver = str(draft.people && draft.people[0] && draft.people[0].name);
      const dec = decisionRecord(draft, makeId, now, {
        title: `Re-sequence how "${b.actor}" approves decisions`,
        question: `How should "${b.actor}" approve decisions so no single person's approval blocks ${b.actorsServed} workstreams?`,
        driver,
        approver: '',
        contributors: b.actors.slice(0, 8).join(', '),
        rationale: `"${b.actor}" approves ${b.decisions} decisions driven by ${b.actorsServed} different people. Sharing one approver drives utilisation up and the wait grows hyperbolically (Kingman), so the coupled wait exceeds the sum of the independent waits. This decision addresses the approval mechanism, not any individual's work.`,
        reviewOn: todayKey(now),
        options: [
          option('Stagger approval windows', 'Spread the approval load so no single decision waits behind all others.'),
          option('Delegate routine approvals', `Authorise named approvers for the ${b.actorsServed} workstreams, keeping exceptions with "${b.actor}".`),
          option('Batch recurring decisions', 'Group recurring approvals into a single batch window.'),
        ],
      });
      addMarker(draft, key);
      if (Array.isArray(markers)) markers.push(key);
      note(out, logEvent, {
        rule: 'RULE-COUP-02',
        summary: `Opened DACI decision on the approval mechanism bottleneck "${b.actor}"`,
        targetId: dec.id,
        collection: 'decisions',
      });
    }
  }

  // ---- RULE-COUP-03: over-long hand-off chain ----------------------------
  for (const p of report.handoffs.longPaths) {
    const key = `coup:COUP-03:${p.actors.join('>')}`;
    if (markerExists(draft, key)) continue;
    const chainLabel = renderChain(p, report.byKey);
    const dec = decisionRecord(draft, makeId, now, {
      title: `Shorten or batch the ${p.edges}-hop hand-off chain`,
      question: `How can the ${p.edges}-hop hand-off chain (${chainLabel}) be shortened or batched?`,
      driver: '',
      approver: '',
      contributors: p.actors.join(', '),
      rationale: `A measured hand-off path runs ${p.edges} hops. Each hop adds queue delay, so a long chain finishes later than a short one even at the same total work. The chain is ${chainLabel}.`,
      reviewOn: todayKey(now),
      options: [
        option('Batch the hand-offs', 'Group the hand-offs into a single pass so work does not wait at every step.'),
        option('Delegate one stage', `Authorise one actor to absorb a hop so the chain shortens by one.`),
        option('Re-sequence', 'Move a hand-off off the critical path before it is needed.'),
      ],
    });
    note(out, logEvent, {
      rule: 'RULE-COUP-03',
      summary: `Opened DACI decision to shorten the ${p.edges}-hop hand-off chain`,
      targetId: dec.id,
      collection: 'decisions',
    });
    addMarker(draft, key);
    if (Array.isArray(markers)) markers.push(key);
  }

  // ---- RULE-COUP-04: priced coupling delay -------------------------------
  for (const d of report.delay) {
    if (d.unstable) continue;
    const worst = d.perStream.reduce((w, s) => (s.delayDays > (w ? w.delayDays : -1) ? s : w), null);
    if (!worst || worst.delayDays < settings.couplingDelayThresholdDays) continue;
    const key = `coup:COUP-04:${normalizeName(d.approver)}`;
    if (markerExists(draft, key)) continue;
    const driver = str(draft.people && draft.people[0] && draft.people[0].name);
    const dec = decisionRecord(draft, makeId, now, {
      title: `Re-sequence how "${d.approver}" approves decisions`,
      question: `How should "${d.approver}" approve decisions so the shared wait falls below ${settings.couplingDelayThresholdDays} days?`,
      driver,
      approver: '',
      contributors: d.perStream.map((s) => s.driver).join(', '),
      rationale: `"${d.approver}" serves ${d.streams} streams (${d.decisions} decisions). Sharing one approver drives utilisation up and the wait grows hyperbolically (Kingman), so the coupled wait exceeds the sum of the independent waits. The shared wait is ${d.waitSharedDays} days against ${worst.waitIndependentDays} days alone for ${worst.driver}.`,
      reviewOn: todayKey(now),
      options: [
        option('Batch the shared approvals', 'Approve the coupled decisions in one window.'),
        option('Re-sequence', `Move ${worst.driver}'s approval ahead of the others.`),
        option('Delegate one stream', 'Hand one stream to a named approver.'),
      ],
    });
    addMarker(draft, key);
    if (Array.isArray(markers)) markers.push(key);
    note(out, logEvent, {
      rule: 'RULE-COUP-04',
      summary: `Opened DACI decision to re-sequence approvals behind "${d.approver}"`,
      targetId: dec.id,
      collection: 'decisions',
    });
  }

  return { rules: 'coupling', fired: true };
}

couplingRule.id = 'coupling';
couplingRule.label = 'Coupling propagation (RULE-COUP-01..04)';
couplingRule.module = 'couplingRules.js';
couplingRule.triggers = ['decision.created', 'decision.updated', 'link.created', 'coupling.scan'];
couplingRule.effect = (draft, event, context = {}) => couplingRule(draft, { ...context, event });
Object.freeze(couplingRule);

export default couplingRule;

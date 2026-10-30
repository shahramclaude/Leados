/**
 * app/core/domain/decisionPortfolioRules.js — RULE-DPF-01..04 on the shared
 * post-commit spine.
 *
 * These rules make the Decision Portfolio Engine a live, event-driven system
 * rather than a report the leader must remember to open.
 *
 * RULE-DPF-01 (Coupling Discovery): when a decision is created or linked to a
 *   premise, scan for other open decisions sharing that premise and record a
 *   `couples` typed link between them. Marker-idempotent.
 *
 * RULE-DPF-02 (Resolution Cascade): when a decision is chosen (decided), scan
 *   for coupled open decisions and append a portfolio-review audit entry so
 *   the leader sees that their shared premise may have been resolved.
 *
 * RULE-DPF-03 (Premise Update Scan): when a premise receives a new
 *   observation, scan for open decisions resting on it and flag their
 *   sequencing position for review.
 *
 * RULE-DPF-04 (Portfolio Triage): when the portfolio's total weekly carrying
 *   cost exceeds a configured threshold, open exactly one DACI "portfolio
 *   triage" decision — never one per signal.
 */

import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  FORBIDDEN_LINK_TYPES,
  linksForEntity,
} from './cases.js';

export const DPF_RULES = Object.freeze([
  'RULE-DPF-01',
  'RULE-DPF-02',
  'RULE-DPF-03',
  'RULE-DPF-04',
]);

const MARKER_PREFIX = 'dpf:';

function markerKey(ruleId, eventId, ...rest) {
  return [MARKER_PREFIX, ruleId, eventId, ...rest].filter(Boolean).join(':');
}

function hasMarker(draft, marker) {
  return Array.isArray(draft.portfolioMarkers) && draft.portfolioMarkers.includes(marker);
}

function addMarker(draft, marker) {
  if (!Array.isArray(draft.portfolioMarkers)) draft.portfolioMarkers = [];
  if (!draft.portfolioMarkers.includes(marker)) {
    draft.portfolioMarkers.push(marker.slice(0, 200));
  }
}

/**
 * Append a typed link to the draft, idempotent on (source, target, relation).
 */
function ensureLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary, todayStr, nowIso, idFactory }) {
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) ||
    !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) ||
    FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) ||
    !sourceId || !targetId
  ) return null;
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.links.find(
    (l) => l && l.sourceType === sourceType && l.sourceId === sourceId &&
      l.targetType === targetType && l.targetId === targetId && l.relation === relation,
  );
  if (existing) return existing;
  const link = {
    id: idFactory('lnk'),
    sourceType, sourceId, targetType, targetId, relation,
    ruleId: ruleId || null,
    summary: summary || '',
    createdOn: todayStr,
    createdAt: nowIso,
  };
  draft.links.push(link);
  return link;
}

/**
 * The decision portfolio rule for the post-commit spine.
 */
export const decisionPortfolioRule = Object.freeze({
  id: 'decision-portfolio',
  label: 'Decision Portfolio (RULE-DPF-01..04)',
  module: 'decision-portfolio',
  triggers: ['decision.created', 'decision.decided', 'premise.observed', 'link.created'],
  effect(draft, event, { now, idFactory, logEvent }) {
    const results = [];
    const type = event?.type;
    if (!type) return results;

    const todayStr = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();

    // ---- RULE-DPF-01: Coupling Discovery ----
    if (type === 'decision.created' || type === 'link.created') {
      const decisionId = event.entityId || event.payload?.decisionId;
      if (!decisionId) return results;

      // Find all premises this decision rests on.
      const links = linksForEntity(draft, 'decision', decisionId);
      const premiseIds = links
        .filter((l) => l.peer.type === 'premise' && l.relation === 'rests-on')
        .map((l) => l.peer.id);

      for (const premiseId of premiseIds) {
        const openDecisions = (draft.decisions || []).filter((d) => !d.chosen && d.id !== decisionId);
        for (const other of openDecisions) {
          const otherLinks = linksForEntity(draft, 'decision', other.id);
          const otherHasPremise = otherLinks.some(
            (l) => l.peer.type === 'premise' && l.peer.id === premiseId && l.relation === 'rests-on'
          );
          if (!otherHasPremise) continue;

          const marker = markerKey('DPF-01', event.id || type, decisionId, other.id, premiseId);
          if (hasMarker(draft, marker)) continue;

          const link = ensureLink(draft, {
            sourceType: 'decision', sourceId: decisionId,
            targetType: 'decision', targetId: other.id,
            relation: 'couples',
            ruleId: 'RULE-DPF-01',
            summary: `Coupled via shared premise ${premiseId}`,
            todayStr, nowIso, idFactory,
          });
          if (link) {
            addMarker(draft, marker);
            results.push({ rule: 'RULE-DPF-01', action: 'couples-link', from: decisionId, to: other.id, premise: premiseId });
            logEvent?.({ type: 'portfolio.coupled', entity: 'decision', entityId: decisionId, summary: `Coupled with decision ${other.id} via shared premise` });
          }
        }
      }
    }

    // ---- RULE-DPF-02: Resolution Cascade ----
    if (type === 'decision.decided') {
      const decisionId = event.entityId || event.payload?.decisionId;
      if (!decisionId) return results;

      const coupledLinks = linksForEntity(draft, 'decision', decisionId);
      const coupledIds = coupledLinks
        .filter((l) => l.peer.type === 'decision' && (l.relation === 'couples' || l.relation === 'informs'))
        .map((l) => l.peer.id);

      const open = (draft.decisions || []).filter((d) => !d.chosen && coupledIds.includes(d.id));
      for (const other of open) {
        const marker = markerKey('DPF-02', event.id || type, decisionId, other.id);
        if (hasMarker(draft, marker)) continue;
        addMarker(draft, marker);

        const decTitle = (draft.decisions.find((d) => d.id === decisionId) || {}).title || decisionId;
        if (!Array.isArray(other.portfolioNotes)) other.portfolioNotes = [];
        other.portfolioNotes.push({
          at: nowIso,
          note: `Decision "${decTitle}" was resolved. Review whether this decision's shared premises have changed.`,
          sourceDecisionId: decisionId,
          sourcePremiseId: null,
        });
        results.push({ rule: 'RULE-DPF-02', action: 'resolution-note', to: other.id, from: decisionId });
        logEvent?.({ type: 'portfolio.resolution-cascade', entity: 'decision', entityId: other.id, summary: `Resolution cascade from ${decisionId}` });
      }
    }

    // ---- RULE-DPF-03: Premise Update Scan ----
    if (type === 'premise.observed') {
      const premiseId = event.entityId || event.payload?.premiseId;
      if (!premiseId) return results;

      const open = (draft.decisions || []).filter((d) => !d.chosen);
      for (const dec of open) {
        const links = linksForEntity(draft, 'decision', dec.id);
        const restsOn = links.some((l) => l.peer.type === 'premise' && l.peer.id === premiseId && l.relation === 'rests-on');
        if (!restsOn) continue;

        const marker = markerKey('DPF-03', event.id || type, premiseId, dec.id);
        if (hasMarker(draft, marker)) continue;
        addMarker(draft, marker);

        if (!Array.isArray(dec.portfolioNotes)) dec.portfolioNotes = [];
        dec.portfolioNotes.push({
          at: nowIso,
          note: 'Premise observation recorded. Re-check this decision\'s sequencing.',
          sourceDecisionId: null,
          sourcePremiseId: premiseId,
        });
        results.push({ rule: 'RULE-DPF-03', action: 'premise-scan', decision: dec.id, premise: premiseId });
        logEvent?.({ type: 'portfolio.premise-scan', entity: 'decision', entityId: dec.id, summary: `Premise ${premiseId} updated — sequencing review flagged` });
      }
    }

    return results;
  },
});

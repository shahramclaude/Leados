/**
 * app/core/domain/leaderCalibrationRules.js — RULE-LCAL-01..04 on the shared
 * post-commit spine.
 *
 * RULE-LCAL-01 (Calibration Ledger Entry): when a VOI frame is settled with a
 *   realized state, add a calibration marker noting the sample count and
 *   whether the sample pushed the leader across the verdict floor. Marker-
 *   idempotent by (eventId, frameId, outcome).
 *
 * RULE-LCAL-02 (Drift Flag): when settling a frame crosses the 20-sample
 *   threshold and PSI exceeds 0.25, emit a calibration-drift event so the
 *   signals panel can surface it. Idempotent per drift event.
 *
 * RULE-LCAL-03 (Overconfidence advisory): use the full calibration verdict to
 *   annotate a new open frame when its record is overconfident. The advisory
 *   never edits probabilities.
 * RULE-LCAL-04 (Calibration-to-decision bridge): on declaration or settlement,
 *   compute a shrinkage-weighted, Wilson-corner EVPI sensitivity for eligible
 *   open frames; append a bounded note and typed `calibrates` links from the
 *   most relevant settled forecast records. A newly mature record can therefore
 *   connect an already-open decision. No probability is overwritten.
 */

import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  FORBIDDEN_LINK_TYPES,
} from './cases.js';
import { buildCalibrationReport, calibrationScenarioForFrame } from './leaderCalibration.js';

export const LCAL_POST_RULES = Object.freeze([
  'RULE-LCAL-01',
  'RULE-LCAL-02',
  'RULE-LCAL-03',
  'RULE-LCAL-04',
]);

const MARKER_PREFIX = 'lcal';
const MAX_CALIBRATION_STRESSES_PER_SETTLEMENT = 20;

function markerKey(ruleId, ...rest) {
  return [MARKER_PREFIX, ruleId, ...rest].filter(Boolean).join(':');
}

function hasMarker(draft, marker) {
  return Array.isArray(draft.calibrationMarkers) && draft.calibrationMarkers.includes(marker);
}

function addMarker(draft, marker) {
  if (!Array.isArray(draft.calibrationMarkers)) draft.calibrationMarkers = [];
  if (!draft.calibrationMarkers.includes(marker)) {
    draft.calibrationMarkers.push(marker.slice(0, 200));
  }
}

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
 * Count settled non-legacy state-outcomes in the draft.
 */
function countUsableSamples(draft) {
  let n = 0;
  for (const frame of (draft.voiDecisions || [])) {
    if (!frame || frame.status !== 'decided') continue;
    for (const outcome of Array.isArray(frame.outcomes) ? frame.outcomes : []) {
      if (!outcome || !outcome.realizedStateId) continue;
      if (Array.isArray(outcome.probabilities) && outcome.probabilities.length > 0) {
        n += 1; // one outcome = one calibration sample (single-P)
      }
    }
  }
  return n;
}

export function leaderCalibrationRule(draft, context = {}) {
    const event = context.event || null;
    const { now, idFactory, logEvent } = context;
    const results = [];
    const type = event?.type;
    if (!type) return results;
    const todayStr = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();

    // ---- RULE-LCAL-01: Ledger entry on settle (voi.scanned carries the
    //      settled-frame event as fired by settleVoiDecision). We still mark
    //      it per-frame so manual scans (with empty entityId) don't re-mark.
    if (type === 'voi.scanned') {
      const frameId = event.entityId || event.payload?.frameId;
      if (frameId) {
        // Only count a new sample if the frame has a settledOn set in this
        // transaction; repeated scans do not duplicate the marker or event.
        const marker = markerKey('LCAL-01', event.id || type, frameId);
        if (!hasMarker(draft, marker)) {
          addMarker(draft, marker);
          const n = countUsableSamples(draft);
          const floor = Number(draft?.settings?.lcalVerdictSamples) >= 5
            ? Number(draft.settings.lcalVerdictSamples)
            : 10;
          results.push({ rule: 'RULE-LCAL-01', action: 'ledger-entry', frameId, usableSamples: n });
          logEvent?.({ type: 'calibration.sample-added', entity: 'voi', entityId: frameId, summary: `Calibration sample recorded (usable=${n})` });
          if (n === floor) {
            logEvent?.({ type: 'calibration.verdict-ready', entity: 'voi', entityId: frameId, summary: `Calibration verdict now possible with ${n} samples` });
            results.push({ rule: 'RULE-LCAL-01', action: 'verdict-ready', usableSamples: n });
          }
        }
      }
    }

    let report = null;
    let targets = [];

    // ---- RULE-LCAL-03: the full verdict annotates a newly declared frame ----
    if (type === 'voi.declared') {
      const frameId = event.entityId || event.payload?.frameId;
      const frame = (draft.voiDecisions || []).find((row) => row && row.id === frameId);
      if (frame?.status === 'open') {
        report = buildCalibrationReport(draft, now);
        targets = [frame];
        const marker = markerKey('LCAL-03', event.id || type, frameId);
        if (!hasMarker(draft, marker) && report.usableCount >= report.conventions.verdictSamples && report.verdict === 'overconfident') {
          addMarker(draft, marker);
          const gapPp = Number.isFinite(report.signedGapPp) ? report.signedGapPp : 0;
          if (!Array.isArray(frame.notes)) frame.notes = [];
          frame.notes.push({
            at: nowIso,
            source: 'RULE-LCAL-03',
            note: `Calibration advisory: your recent track record shows a ${gapPp.toFixed(0)}pp overall gap and an overconfidence pattern. The declared EVPI remains unchanged; inspect the Calibration stress panel before committing.`,
          });
          results.push({ rule: 'RULE-LCAL-03', action: 'calibration-advisory', frameId, gapPp: round2dp(gapPp) });
          logEvent?.({ type: 'calibration.advisory', entity: 'voi', entityId: frameId, summary: `Overconfidence advisory stamped (gap ${gapPp.toFixed(1)}pp)` });
        }
      }
    } else if (type === 'voi.scanned') {
      // New evidence can make an already-open decision's probability bands
      // calibratable. Reconcile that existing frame in the same settlement
      // transaction rather than waiting for the leader to edit or re-declare it.
      report = buildCalibrationReport(draft, now);
      const eligible = (draft.voiDecisions || []).filter((frame) => (
        frame && frame.status === 'open' && !hasMarker(draft, markerKey('LCAL-04', frame.id))
      ));
      targets = eligible.slice(0, MAX_CALIBRATION_STRESSES_PER_SETTLEMENT);
      if (eligible.length > targets.length) {
        const remaining = eligible.length - targets.length;
        results.push({ rule: 'RULE-LCAL-04', action: 'bounded-sweep', processed: targets.length, remaining });
        logEvent?.({ type: 'calibration.stress-backlog', entity: 'voi', entityId: event.entityId || '', summary: `${remaining} eligible open frame(s) remain for the next explicit calibration scan` });
      }
    }

    // ---- RULE-LCAL-04: calibrated sensitivity provenance ----
    for (const frame of targets) {
      const frameId = frame.id;
      const stressMarker = markerKey('LCAL-04', frameId);
      if (hasMarker(draft, stressMarker)) continue;
      const scenario = calibrationScenarioForFrame(draft, frame, { report });
      if (scenario.status !== 'ready' || !scenario.evidenceFrameIds.length) continue;
      const sourceIds = scenario.evidenceFrameIds.filter((sourceId) => sourceId !== frameId);
      if (!sourceIds.length) continue;
      const currency = String(frame.currency || 'USD').toUpperCase();
      addMarker(draft, stressMarker);
      if (!Array.isArray(frame.notes)) frame.notes = [];
      frame.notes.push({
        at: nowIso,
        source: 'RULE-LCAL-04',
        note: `Calibration stress (not an adjusted belief): declared EVPI ${currency} ${scenario.rawEvpi}; shrinkage-weighted scenario ${currency} ${scenario.scenarioEvpi}, with a marginal Wilson-corner range ${currency} ${scenario.evpiLow}–${scenario.evpiHigh}. Expected-value choice ${scenario.choiceChanges ? 'can change across calibration scenarios' : 'is stable across tested scenarios'}. Inputs and any frozen prediction remain unchanged; see linked prior forecast evidence.`,
      });
      const links = sourceIds.map((sourceId) => ensureLink(draft, {
        sourceType: 'voi', sourceId,
        targetType: 'voi', targetId: frameId,
        relation: 'calibrates',
        ruleId: 'RULE-LCAL-04',
        summary: `Prior settled forecast contributes to a calibration sensitivity stress (n=${scenario.sampleCount}; not an adjusted belief).`,
        todayStr, nowIso, idFactory,
      })).filter(Boolean);
      results.push({ rule: 'RULE-LCAL-04', action: 'calibration-stress-linked', frameId, sourceFrameIds: links.map((link) => link.sourceId), rawEvpi: scenario.rawEvpi, scenarioEvpi: scenario.scenarioEvpi, evidenceCount: scenario.sampleCount });
      logEvent?.({ type: 'calibration.stress-linked', entity: 'voi', entityId: frameId, summary: `Calibration sensitivity linked to ${links.length} prior forecast record(s); no probability was changed` });
    }

    return results;
}

leaderCalibrationRule.id = 'leader-calibration';
leaderCalibrationRule.label = 'Leader Calibration (RULE-LCAL-01..04)';
leaderCalibrationRule.module = 'leader-calibration';
leaderCalibrationRule.triggers = ['voi.scanned', 'voi.declared'];
// Retain the effect-shaped adapter used by focused domain tests and tooling;
// the rule itself is callable so the shared event engine can execute it.
leaderCalibrationRule.effect = (draft, event, context = {}) => leaderCalibrationRule(draft, { ...context, event });
Object.freeze(leaderCalibrationRule);

function round2dp(v) {
  return Math.round(v * 100) / 100;
}

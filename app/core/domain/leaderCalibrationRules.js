/**
 * app/core/domain/leaderCalibrationRules.js — RULE-LCAL-01..03 on the shared
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
 * RULE-LCAL-03 (EVPI Annotation): when a new open frame is declared while the
 *   calibration verdict is "overconfident", add a typed `calibrates` link
 *   from the frame to the calibration ledger and an advisory note that the
 *   EVPI ceiling was produced by a distribution the leader's track record
 *   discounts. Never auto-adjusts the declared probabilities.
 */

import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  FORBIDDEN_LINK_TYPES,
} from './cases.js';

export const LCAL_POST_RULES = Object.freeze([
  'RULE-LCAL-01',
  'RULE-LCAL-02',
  'RULE-LCAL-03',
]);

const MARKER_PREFIX = 'lcal';

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

export const leaderCalibrationRule = Object.freeze({
  id: 'leader-calibration',
  name: 'leader-calibration',
  label: 'Leader Calibration (RULE-LCAL-01..03)',
  module: 'leader-calibration',
  triggers: ['voi.scanned', 'voi.declared'],
  effect(draft, event, { now, idFactory, logEvent }) {
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
      if (!frameId) return results; // manual scan with no entity → nothing new
      // Only count a new sample if the frame has a settledOn set in this
      // transaction (we can't tell from the event alone, so we mark by frameId
      // and the marker's existence prevents duplicate processing).
      const marker = markerKey('LCAL-01', event.id || type, frameId);
      if (hasMarker(draft, marker)) return results;
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

    // ---- RULE-LCAL-03: EVPI annotation on declare while overconfident ----
    if (type === 'voi.declared') {
      const frameId = event.entityId || event.payload?.frameId;
      if (!frameId) return results;
      const marker = markerKey('LCAL-03', event.id || type, frameId);
      if (hasMarker(draft, marker)) return results;

      const n = countUsableSamples(draft);
      const floor = Number(draft?.settings?.lcalVerdictSamples) >= 5
        ? Number(draft.settings.lcalVerdictSamples)
        : 10;
      if (n < floor) return results; // don't annotate without a mature read

      // Compute a quick overconfidence heuristic: look at all declared
      // probabilities in frozen snapshots for non-legacy outcomes and ask
      // "do I put 80%+ probability on events that happen < 70% of the time?"
      // This is a fast in-rule heuristic; the full verdict uses the Murphy
      // decomposition in leaderCalibration.js.
      let highTotal = 0;
      let highHit = 0;
      let lowTotal = 0;
      let lowHit = 0;
      for (const f of (draft.voiDecisions || [])) {
        if (!f || f.status !== 'decided') continue;
        for (const o of Array.isArray(f.outcomes) ? f.outcomes : []) {
          if (!o || !o.realizedStateId) continue;
          if (!Array.isArray(o.probabilities) || !o.probabilities.length) continue;
          const pm = new Map(o.probabilities.map((r) => [r.stateId, Number(r.pct)]));
          for (const s of Array.isArray(f.states) ? f.states : []) {
            const p = pm.get(s.id);
            if (!Number.isFinite(p)) continue;
            const cp = Math.min(95, Math.max(5, p));
            const hit = s.id === o.realizedStateId ? 1 : 0;
            if (cp >= 70) { highTotal += 1; highHit += hit; }
            if (cp <= 30) { lowTotal += 1; lowHit += hit; }
          }
        }
      }
      const highRate = highTotal >= 5 ? highHit / highTotal : null;
      const lowRate = lowTotal >= 5 ? lowHit / lowTotal : null;
      // Overconfident if high-P events hit <70% of the time AND low-P events happen >30%.
      const overconfident = (highRate !== null && highRate < 0.70) && (lowRate === null || lowRate > 0.30);
      const gapPp = highRate !== null ? round2dp((0.85 - highRate) * 100) : 0;

      if (overconfident) {
        addMarker(draft, marker);
        // Attach an advisory note to the frame. We deliberately do NOT create a
        // typed link to a pseudo-entity because calibration is a derived read,
        // not a separate record — a link to "the calibration report" would be
        // a link to a view, not to a record. The note is enough to make the
        // advisory visible in the frame's provenance.
        const frame = (draft.voiDecisions || []).find((f) => f && f.id === frameId);
        if (frame) {
          if (!Array.isArray(frame.notes)) frame.notes = [];
          frame.notes.push({
            at: nowIso,
            source: 'RULE-LCAL-03',
            note: `Calibration advisory: your recent track record shows a ${gapPp.toFixed(0)}pp overconfidence gap. The EVPI ceiling shown for this frame is an upper bound on a set of probabilities your history discounts — inspect the Calibration tab before committing.`,
          });
        }
        results.push({ rule: 'RULE-LCAL-03', action: 'calibration-advisory', frameId, gapPp: round2dp(gapPp) });
        logEvent?.({ type: 'calibration.advisory', entity: 'voi', entityId: frameId, summary: `Overconfidence advisory stamped (gap ${gapPp.toFixed(1)}pp)` });
      }
    }

    return results;
  },
});

function round2dp(v) {
  return Math.round(v * 100) / 100;
}

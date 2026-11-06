/**
 * app/core/domain/diligenceActions.js — commands and scoped adapters for the
 * Diligence Ledger (ADR-0104).
 *
 * Reads are pure, seat-scoped adapters (SAFE_READS in the access gateway). The
 * writes are exactly four:
 *
 *   consult          "I looked at this fact" — used / ruled-out / deferred, with
 *                    a required reason for a dismissal. Append-only, idempotent
 *                    per (checklist, fact). This is the "we looked at X" record
 *                    that both the Hindsight Lock and the Epistemic Ledger name
 *                    as their largest open gap.
 *   forecast         declare, BEFORE the decision settles, which evidence
 *                    classes you expect to consult and with what confidence —
 *                    frozen so the spine can grade it once, out of sample.
 *   scan             explicitly re-freeze, re-gap, re-dark and re-grade now.
 *   setConventions   re-declare the declared floors (rank 4-5 + full access).
 *
 * No write here edits another module's record, closes a human decision, rates a
 * person or sends anything. Frontier freezing, gap/dark findings and the
 * once-only grade are all produced by RULE-DLG-01..04 on the shared spine in
 * the SAME atomic transaction — never by a second workflow engine.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildDiligenceReport,
  diligenceAttentionCount,
  diligenceBriefText,
  diligenceCsvRows,
  knowableFacts,
} from './diligence.js';
import { diligenceConventions, normalizeDiligenceSettings } from './diligenceSchema.js';
import {
  CONSULT_DISPOSITION_KEYS,
  DILIGENCE_BOUNDS,
  DILIGENCE_ENGINE_VERSION,
  DILIGENCE_EVENTS,
  DILIGENCE_LIMITS,
  EVIDENCE_CLASS_KEYS,
  consultId,
} from './diligenceRegistry.js';

export function createDiligenceActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildDiligenceReport(store.state, { now: clock(), settings: settings() });

  const seatFor = (right, { fullAccess = false } = {}) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing the diligence ledger.' };
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { ok: false, error: verdict.reason };
    if (fullAccess && !seat.fullAccess) {
      return { ok: false, error: 'Changing the diligence conventions moves every frontier, every class cell and every grade in the workspace. Only a full-access seat may declare them.' };
    }
    return { ok: true, seat };
  };

  const ownerFor = (seat) => (seat && !seat.fullAccess && seat.id !== 'leader'
    ? { seatId: seat.id, altitudeKey: seat.altitudeKey, rank: seat.rank }
    : { seatId: null, altitudeKey: 'chief', rank: 5 });

  const findChecklist = (id) => (Array.isArray(store.state.diligenceChecklists) ? store.state.diligenceChecklists : [])
    .find((row) => row && row.id === id) || null;

  return {
    /* ------------------------------------------------------- safe reads */
    diligenceReport() {
      return report();
    },
    diligenceBriefText() {
      return diligenceBriefText(report());
    },
    diligenceCsvRows() {
      const current = report();
      return {
        ok: true,
        scope: 'diligence',
        columns: ['row_kind', 'scope', 'checklists_n', 'settled_n', 'open_n', 'knowable_n',
          'consulted_n', 'unconsulted_n', 'coverage_pct', 'lo_pct', 'hi_pct', 'band',
          'class_key', 'dark', 'graded_n', 'claims_n', 'brier', 'base_brier', 'skill',
          'verdict', 'refused', 'reason_code', 'altitude'],
        rows: diligenceCsvRows(current),
      };
    },
    diligenceAttentionCount() {
      return diligenceAttentionCount(store.state, { now: clock(), settings: settings() });
    },
    diligenceConventions() {
      return diligenceConventions(settings());
    },
    diligenceSettings() {
      return {
        ...diligenceConventions(settings()),
        bounds: DILIGENCE_BOUNDS,
        engineVersion: DILIGENCE_ENGINE_VERSION,
        evidenceClasses: EVIDENCE_CLASS_KEYS,
      };
    },
    diligencePreview() {
      const state = store.state;
      const existing = new Set((Array.isArray(state.diligenceChecklists) ? state.diligenceChecklists : [])
        .map((row) => row && row.decisionId));
      const pending = (Array.isArray(state.decisions) ? state.decisions : [])
        .filter((decision) => decision && decision.id && decision.date && !existing.has(decision.id))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const first = pending[0] || null;
      return {
        ok: true,
        pendingFreezeN: pending.length,
        nextDecisionDate: first ? first.date : null,
        previewFacts: first ? knowableFacts(state, first).length : 0,
        limits: DILIGENCE_LIMITS,
      };
    },

    /* ---------------------------------------------------------- consult */
    diligenceConsult({ checklistId: rawChecklistId, sourceType, sourceId, disposition, reason } = {}) {
      const right = seatFor('record-diligence-consult');
      if (!right.ok) return fail(right.error);
      const checklist = findChecklist(String(rawChecklistId || '').trim());
      if (!checklist) return fail('That frozen knowable set no longer exists. Open the decision again.', 'checklistId');
      const st = String(sourceType || '').trim();
      const sid = String(sourceId || '').trim();
      const fact = (checklist.facts || []).find((row) => row.sourceType === st && row.sourceId === sid);
      if (!fact) return fail('That fact is not in this decision\'s FROZEN knowable set. A consultation can only record a fact that was knowable at decision time.', 'sourceId');
      const disp = String(disposition || '').trim();
      if (!CONSULT_DISPOSITION_KEYS.includes(disp)) return fail('Choose one of: used, ruled-out, deferred.', 'disposition');
      const text = String(reason || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DILIGENCE_LIMITS.reasonChars);
      if (disp === 'ruled-out' && text.length < 8) {
        return fail('A "ruled-out" judgement needs a written reason. Looking and dismissing is only diligence if the record says WHY.', 'reason');
      }
      const id = consultId(checklist.id, st, sid);
      const consults = Array.isArray(store.state.diligenceConsults) ? store.state.diligenceConsults : [];
      if (consults.some((row) => row && row.id === id)) {
        return fail('This fact has already been consulted for this decision. Diligence is recorded once; reopen it by changing the disposition, not by counting it twice.', 'sourceId');
      }
      if (consults.length >= DILIGENCE_LIMITS.consults) {
        return fail(`The consultation ledger is full at ${DILIGENCE_LIMITS.consults}. Nothing was written.`);
      }
      const owner = ownerFor(right.seat);
      const today = dayKey(clock());
      store.update((draft) => {
        draft.diligenceConsults = Array.isArray(draft.diligenceConsults) ? draft.diligenceConsults : [];
        draft.diligenceConsults.push({
          id,
          checklistId: checklist.id,
          sourceType: st,
          sourceId: sid,
          evidenceClass: fact.evidenceClass,
          disposition: disp,
          consultedOn: today,
          reason: text,
          ownerSeatId: owner.seatId,
          altitudeKey: owner.altitudeKey,
          rank: owner.rank,
          engineVersion: DILIGENCE_ENGINE_VERSION,
          createdAt: clock().toISOString(),
        });
      }, {
        type: DILIGENCE_EVENTS.CONSULTED,
        entity: 'diligencechecklist',
        entityId: checklist.id,
        summary: `Recorded one ${disp} consultation of a ${fact.evidenceClass} fact at ${right.seat.label}`,
      });
      return saved({ id, disposition: disp, report: report() });
    },

    /* --------------------------------------------------------- forecast */
    diligenceForecast({ checklistId: rawChecklistId, classes, confidencePct } = {}) {
      const right = seatFor('record-diligence-consult');
      if (!right.ok) return fail(right.error);
      const checklist = findChecklist(String(rawChecklistId || '').trim());
      if (!checklist) return fail('That frozen knowable set no longer exists.', 'checklistId');
      if (checklist.forecast) return fail('A process forecast has already been frozen for this decision. Pre-registration is written once; it cannot be edited after the fact.', 'checklistId');
      // Read the DECISION RECORD, not the frozen row's cached status: a review
      // may have settled the call between two commits. Hindsight is never graded.
      const liveDecision = (Array.isArray(store.state.decisions) ? store.state.decisions : [])
        .find((row) => row && row.id === checklist.decisionId);
      const alreadySettled = checklist.status === 'settled'
        || (checklist.outcome && checklist.outcome !== 'pending')
        || Boolean(liveDecision && liveDecision.outcome && liveDecision.outcome !== 'pending');
      if (alreadySettled) {
        return fail('This decision has already settled. A forecast declared after the outcome is a memory, not a prediction — the ledger refuses to grade hindsight as foresight.', 'checklistId');
      }
      const picked = Array.isArray(classes)
        ? [...new Set(classes.filter((key) => EVIDENCE_CLASS_KEYS.includes(key)))].slice(0, EVIDENCE_CLASS_KEYS.length)
        : [];
      if (!picked.length) return fail('Declare at least one evidence class you expect to consult.', 'classes');
      const pct = Math.round(Number(confidencePct));
      if (!Number.isFinite(pct) || pct < 1 || pct > 99) return fail('Confidence must be a whole number between 1 and 99.', 'confidencePct');
      const owner = ownerFor(right.seat);
      const today = dayKey(clock());
      store.update((draft) => {
        const target = (Array.isArray(draft.diligenceChecklists) ? draft.diligenceChecklists : [])
          .find((row) => row && row.id === checklist.id);
        if (!target || target.forecast) return;
        target.forecast = {
          declaredOn: today,
          classes: picked,
          confidencePct: pct,
          question: `Before this decision settles, I expect to consult ${picked.join(', ')} and to reach the declared diligence floor.`,
        };
        target.updatedAt = clock().toISOString();
        void owner;
      }, {
        type: DILIGENCE_EVENTS.FORECAST,
        entity: 'diligencechecklist',
        entityId: checklist.id,
        summary: `Froze a pre-decision process forecast over ${picked.length} evidence class(es) at ${pct}% confidence`,
      });
      return saved({ id: checklist.id, classes: picked, confidencePct: pct, report: report() });
    },

    /* ------------------------------------------------------------- scan */
    diligenceScan() {
      const right = seatFor('record-diligence-consult');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: DILIGENCE_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'diligence',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-froze the pending frontiers, re-read the coverage gap, re-checked dark classes and graded due forecasts',
      });
      return saved({ report: report() });
    },

    /* ----------------------------------------------------- conventions */
    diligenceSetConventions(patch = {}) {
      const right = seatFor('govern-diligence', { fullAccess: true });
      if (!right.ok) return fail(right.error);
      const before = normalizeDiligenceSettings(settings());
      const merged = normalizeDiligenceSettings({ ...before, ...(patch || {}) });
      const changed = Object.keys(merged).filter((key) => merged[key] !== before[key]);
      if (!changed.length) return saved({ changed: [], report: report() });
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        Object.assign(draft.settings, merged);
      }, {
        type: DILIGENCE_EVENTS.CONVENTIONS,
        entity: 'diligence',
        entityId: 'conventions',
        summary: `Changed diligence conventions: ${changed.map((key) => `${key}=${merged[key]}`).join(', ')}`,
      });
      return saved({ changed, report: report() });
    },
  };
}

export const DILIGENCE_SCAN = DILIGENCE_EVENTS.SCAN;

/**
 * app/core/domain/vyRules.js — RULE-VY-01, the post-commit rule for the
 * Vroom–Yetton–Jago Decision-Participation Selector (ADR-0230, Schema v183).
 *
 * The rule runs on the shared post-commit spine. It is marker-idempotent
 * (one ask per decision signature), pausable (governed by `vyAutoPropagate`),
 * capped at one ask per commit, and never edits, closes or re-types the
 * decision it reports. It only FILES ASKS and CLOSES THEM — the leader's
 * seat decides the participation style through the ordinary actions.
 *
 * Asks filed:
 *  - `vy.decision.owed` — when a decision is declared and no diagnostic
 *    answers exist yet: addressed to the declaring seat, asking them to
 *    answer the seven diagnostics.
 *  - `vy.selection.owed` — when answers exist but no style has been selected:
 *    addressed to a seat at director altitude or above that holds a line the
 *    decision touches, asking them to select a participation style.
 *
 * Leaf module: imports `vyRegistry.js` and `vySchema.js` normalizers only.
 */

import {
  VY_EVENTS,
  VY_RULE_ID,
  VY_RIGHTS,
  VY_QUESTION_KEYS,
  VY_STYLE_KEYS,
} from './vyRegistry.js';
import { vyId, vyBool, vyDay, vyActorId, vyOneOf } from './vySchema.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;

/**
 * Ask signatures, scoped to this rule so no other rule collides.
 */
export const vyAskSignature = (kind, decisionId) => `vy1:${kind}:${decisionId}`;

export function parseVyAskSignature(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^vy1:([a-z-]+):([A-Za-z0-9:_-]{1,120})$/.exec(raw);
  if (!match) return null;
  return { kind: match[1], decisionId: match[2], signature: raw };
}

/**
 * RULE-VY-01: post-commit rule for decision participation.
 *
 * @param draft - the mutable draft state (post-commit spine passes the draft)
 * @param {Object} event - { type, ... } — the commit event
 * @param {Object} ctx - { now, idFactory, settings, seat, delegations, links }
 * @returns {Object} { ok, asks: [ask, ...], markers: [marker, ...] }
 */
export function vyRule(draft, { event = {}, now, idFactory, settings = {}, seat, delegations = [], links = [] } = {}) {
  const autoPropagate = settings.vyAutoPropagate !== false;
  const asks = [];
  const markers = [];
  const eventType = event.type || '';

  // Paused: no new asks, no marker writes. The rule still reads cleanly.
  if (!autoPropagate) {
    return { ok: true, asks, markers };
  }

  const decisionId = event.decisionId || null;

  // Idempotency key for this rule's own asks: one ask per (kind, decision).
  const existingAskSignatures = new Set();
  for (const d of (draft.delegations || [])) {
    if (d.ruleId === VY_RULE_ID && d.signature) existingAskSignatures.add(d.signature);
  }

  const fileAsk = (kind, addresseeId, reason, decisionRefId) => {
    const signature = vyAskSignature(kind, decisionRefId || decisionId);
    const already = existingAskSignatures.has(signature);
    if (already) return null;
    const id = idFactory(`vy-ask`);
    const ask = {
      id,
      ruleId: VY_RULE_ID,
      kind,
      decisionId: decisionRefId || decisionId,
      addresseeId,
      status: 'active',
      reason,
      createdOn: now,
      completedOn: null,
      completionNote: null,
      signature,
    };
    asks.push(ask);
    existingAskSignatures.add(signature);
    return ask;
  };

  const closeAsk = (askId, completionNote) => {
    for (const d of draft.delegations || []) {
      if (d.id === askId && d.status === 'active') {
        d.status = 'done';
        d.completedOn = now;
        d.completionNote = completionNote;
        return true;
      }
    }
    return false;
  };

  /* --------------------------------------------------------------- scan */
  if (eventType === VY_EVENTS.SCANNED || eventType === 'vroom-yetton.scan') {
    // Re-derive asks from the current state without duplicating active ones.
    const activeAskSignatures = new Set();
    for (const d of draft.delegations || []) {
      if (d.ruleId === VY_RULE_ID && d.status === 'active' && d.signature) activeAskSignatures.add(d.signature);
    }
    const decisions = Array.isArray(draft.vyDecisions) ? draft.vyDecisions : [];
    const answers = Array.isArray(draft.vyAnswers) ? draft.vyAnswers : [];
    const styleRecords = Array.isArray(draft.vyStyleRecords) ? draft.vyStyleRecords : [];
    const answerDecisionIds = new Set(answers.map((a) => a.decisionId));
    const selectedDecisionIds = new Set(styleRecords.map((s) => s.decisionId));

    for (const decision of decisions) {
      if (decision.withdrawnOn) continue;
      const id = decision.id;
      const hasAnswers = answerDecisionIds.has(id);
      const isSelected = selectedDecisionIds.has(id);

      if (!hasAnswers && !activeAskSignatures.has(vyAskSignature('decision.owed', id))) {
        fileAsk('decision.owed', decision.declaredById,
          'Answer the seven Vroom–Yetton diagnostics for this decision.', id);
      } else if (hasAnswers && !isSelected && !activeAskSignatures.has(vyAskSignature('selection.owed', id))) {
        // Find a director-or-above seat that holds a line this decision touches.
        const addressee = findSelectionAddressee(draft, decision, seat);
        if (addressee) {
          fileAsk('selection.owed', addressee,
            'Select a participation style for this decision — recommend, accept or override with a reason.', id);
        }
      }
    }

    // Persist filed asks so subsequent scans on the same draft see them (idempotency per signature).
    for (const ask of asks) {
      draft.delegations = [...(draft.delegations || []), ask];
    }

    markers.push({
      id: idFactory(`vy-marker`),
      ruleId: VY_RULE_ID,
      kind: 'scan',
      at: now,
      detail: `Scanned ${decisions.length} Vroom–Yetton decisions; ${asks.length} ask(s) filed.`,
    });

    return { ok: true, asks, markers };
  }

  /* ----------------------------------------------------------- decision declared */
  if (eventType === VY_EVENTS.DECISION_DECLARED || eventType === 'vroom-yetton.decision.declared') {
    if (!decisionId) return { ok: false, asks, markers, error: 'RULE-VY-01: no decision id on the event.' };
    const decision = (draft.vyDecisions || []).find((d) => d.id === decisionId);
    if (!decision) return { ok: false, asks, markers, error: 'RULE-VY-01: decision not found on the draft.' };
    if (decision.withdrawnOn) return { ok: true, asks, markers };

    fileAsk('decision.owed', decision.declaredById,
      'Answer the seven Vroom–Yetton diagnostics for this decision.', decisionId);

    markers.push({
      id: idFactory(`vy-marker`),
      ruleId: VY_RULE_ID,
      kind: 'decision-declared',
      at: now,
      detail: `Vroom–Yetton decision declared: ${decision.title.slice(0, 80)} — decision.owed ask filed to ${decision.declaredById}.`,
    });

    return { ok: true, asks, markers };
  }

  /* ------------------------------------------------------------ answers recorded */
  if (eventType === VY_EVENTS.ANSWERS_RECORDED || eventType === 'vroom-yetton.answers.recorded') {
    if (!decisionId) return { ok: false, asks, markers, error: 'RULE-VY-01: no decision id on the event.' };
    const decision = (draft.vyDecisions || []).find((d) => d.id === decisionId);
    if (!decision) return { ok: false, asks, markers, error: 'RULE-VY-01: decision not found on the draft.' };
    if (decision.withdrawnOn) return { ok: true, asks, markers };

    const answers = Array.isArray(draft.vyAnswers) ? draft.vyAnswers : [];
    const hasAnswers = answers.some((a) => a.decisionId === decisionId);
    const styleRecords = Array.isArray(draft.vyStyleRecords) ? draft.vyStyleRecords : [];
    const isSelected = styleRecords.some((s) => s.decisionId === decisionId);

    // Close the decision.owed ask when answers now exist.
    const owedSignature = vyAskSignature('decision.owed', decisionId);
    for (const d of draft.delegations || []) {
      if (d.ruleId === VY_RULE_ID && d.signature === owedSignature && d.status === 'active') {
        closeAsk(d.id, `RULE-VY-01: diagnostics answered for decision ${decisionId}.`);
        break;
      }
    }

    // File selection.owed when answers exist but nothing is selected.
    if (hasAnswers && !isSelected) {
      const addressee = findSelectionAddressee(draft, decision, seat);
      if (addressee) {
        fileAsk('selection.owed', addressee,
          'Select a participation style for this decision — recommend, accept or override with a reason.', decisionId);
      }
    }

    markers.push({
      id: idFactory(`vy-marker`),
      ruleId: VY_RULE_ID,
      kind: 'answers-recorded',
      at: now,
      detail: `Vroom–Yetton answers recorded for decision ${decisionId}: ${hasAnswers ? 'selection owed' : 'no answers yet'}.`,
    });

    return { ok: true, asks, markers };
  }

  /* ------------------------------------------------------------ style selected */
  if (eventType === VY_EVENTS.STYLE_SELECTED || eventType === 'vroom-yetton.style.selected') {
    if (!decisionId) return { ok: false, asks, markers, error: 'RULE-VY-01: no decision id on the event.' };
    const decision = (draft.vyDecisions || []).find((d) => d.id === decisionId);
    if (!decision) return { ok: false, asks, markers, error: 'RULE-VY-01: decision not found on the draft.' };
    if (decision.withdrawnOn) return { ok: true, asks, markers };

    const styleRecords = Array.isArray(draft.vyStyleRecords) ? draft.vyStyleRecords : [];
    const isSelected = styleRecords.some((s) => s.decisionId === decisionId);

    if (isSelected) {
      // Close the selection.owed ask.
      const selSignature = vyAskSignature('selection.owed', decisionId);
      for (const d of draft.delegations || []) {
        if (d.ruleId === VY_RULE_ID && d.signature === selSignature && d.status === 'active') {
          closeAsk(d.id, `RULE-VY-01: participation style selected for decision ${decisionId}.`);
          break;
        }
      }
    }

    markers.push({
      id: idFactory(`vy-marker`),
      ruleId: VY_RULE_ID,
      kind: 'style-selected',
      at: now,
      detail: `Vroom–Yetton style recorded for decision ${decisionId}: ${isSelected ? 'selection ask closed' : 'no selection found'}.`,
    });

    return { ok: true, asks, markers };
  }

  /* ------------------------------------------------------------ decision withdrawn */
  if (eventType === VY_EVENTS.DECISION_WITHDRAWN || eventType === 'vroom-yetton.decision.withdrawn') {
    if (!decisionId) return { ok: false, asks, markers, error: 'RULE-VY-01: no decision id on the event.' };

    // Close any active asks for this decision.
    for (const d of draft.delegations || []) {
      if (d.ruleId === VY_RULE_ID && d.decisionId === decisionId && d.status === 'active') {
        closeAsk(d.id, `RULE-VY-01: decision ${decisionId} withdrawn — ask closed.`);
      }
    }

    markers.push({
      id: idFactory(`vy-marker`),
      ruleId: VY_RULE_ID,
      kind: 'decision-withdrawn',
      at: now,
      detail: `Vroom–Yetton decision withdrawn: ${decisionId} — active ask(s) closed.`,
    });

    return { ok: true, asks, markers };
  }

  return { ok: true, asks, markers };
}

/**
 * Find a seat at director altitude (rank 3+) that holds at least one line the
 * decision touches, to address the selection.owed ask. Falls back to the
 * workspace apex (`leader`) when no such seat is readable.
 */
function findSelectionAddressee(draft, decision, seat) {
  const seats = Array.isArray(draft.seats) ? draft.seats : [];
  const lineIds = decision.lineIds || [];
  if (!lineIds.length) return null;

  // Prefer a director-or-above seat that holds a touched line.
  for (const s of seats) {
    if (s.rank >= 3 && (s.lineIds || []).some((lid) => lineIds.includes(lid))) {
      return s.id;
    }
  }
  // Fall back to any seat holding a touched line.
  for (const s of seats) {
    if ((s.lineIds || []).some((lid) => lineIds.includes(lid))) {
      return s.id;
    }
  }
  // Last resort: the workspace apex.
  return 'leader';
}
